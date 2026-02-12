import Redis from "ioredis";
import Logger from "bunyan";
import config, { SupportedChainId } from "../config";
import { ProviderFactory, EVMChainProvider } from "../providers";
import { createDexAdaptersForChain } from "../dex";
import { IDexAdapter, PoolInfo } from "../types/dex";
import { ArbitragePath, ArbitrageOpportunity } from "../types/arbitrage";
import {
  findActiveEvmArbitrageWhitelistedTokens,
  createEvmArbitrageOpportunity,
} from "@grep3/core";

// Import all modules
import { PoolScanner, ReserveUpdater } from "../scanner";
import { PathFinder } from "../pathfinder";
import { ProfitCalculator, OptimalInputCalculator, GasEstimator } from "../calculator";
import { NonceManager, TransactionExecutor } from "../executor";
import { PoolCache, ReserveCache } from "../cache";

interface ArbitrageServiceOptions {
  log: Logger;
  redis: Redis;
  providerFactory: ProviderFactory;
}

interface ChainState {
  adapters: Map<string, IDexAdapter>;
  pools: PoolInfo[];
  paths: ArbitragePath[];
  poolScanner: PoolScanner;
  reserveUpdater: ReserveUpdater;
  pathFinder: PathFinder;
  profitCalculator: ProfitCalculator;
  optimalInputCalculator: OptimalInputCalculator;
  gasEstimator: GasEstimator;
  nonceManager?: NonceManager;
  executor?: TransactionExecutor;
}

/**
 * Main arbitrage service that orchestrates scanning and execution
 * Integrates all modules: scanner, pathfinder, calculator, executor, cache
 */
export class ArbitrageService {
  private log: Logger;
  private redis: Redis;
  private providerFactory: ProviderFactory;
  private isRunning = false;

  // Shared caches
  private poolCache: PoolCache;
  private reserveCache: ReserveCache;

  // Per-chain state
  private chainStates = new Map<SupportedChainId, ChainState>();

  constructor(options: ArbitrageServiceOptions) {
    this.log = options.log;
    this.redis = options.redis;
    this.providerFactory = options.providerFactory;

    // Initialize shared caches
    this.poolCache = new PoolCache({
      redis: this.redis,
      ttl: config.cache.poolTtl,
    });
    this.reserveCache = new ReserveCache({
      redis: this.redis,
      ttl: config.cache.reserveTtl,
    });
  }

  async start(): Promise<void> {
    this.log.info("Starting ArbitrageService...");
    this.isRunning = true;

    // Initialize state for all chains
    await this.initializeChains();

    // Initial pool scan
    await this.scanAllPools();

    // Build initial paths
    await this.buildAllPaths();

    // Start main loop
    this.runMainLoop().catch((err) => {
      this.log.error({ err }, "Main loop crashed");
    });

    // Schedule periodic pool rescans
    this.schedulePoolRescans();

    this.log.info("ArbitrageService started");
  }

  async stop(): Promise<void> {
    this.log.info("Stopping ArbitrageService...");
    this.isRunning = false;

    await this.providerFactory.destroy();

    this.log.info("ArbitrageService stopped");
  }

  /**
   * Initialize all modules for each supported chain
   */
  private async initializeChains(): Promise<void> {
    for (const chainId of config.getSupportedChainIds()) {
      const provider = this.providerFactory.getProvider(chainId);
      const dexConfigs = config.getDexesForChain(chainId);
      const adapters = createDexAdaptersForChain(
        dexConfigs,
        provider.getProvider()
      );

      // Create module instances for this chain
      const poolScanner = new PoolScanner({
        log: this.log,
        poolCache: this.poolCache,
      });

      const reserveUpdater = new ReserveUpdater({
        log: this.log,
        provider: provider.getProvider(),
        reserveCache: this.reserveCache,
        batchSize: 100,
      });

      const pathFinder = new PathFinder({
        log: this.log,
        maxHops: 3,
        maxPathsPerToken: 100,
      });

      const profitCalculator = new ProfitCalculator({
        log: this.log,
      });

      const optimalInputCalculator = new OptimalInputCalculator({
        log: this.log,
        precision: 10n ** 15n, // 0.001 ETH precision
      });

      const gasEstimator = new GasEstimator({
        log: this.log,
        provider: provider.getProvider(),
      });

      // Initialize executor if execution is enabled and wallet is available
      let nonceManager: NonceManager | undefined;
      let executor: TransactionExecutor | undefined;

      if (config.execution.enabled) {
        const wallet = provider.getWallet();
        if (wallet) {
          nonceManager = new NonceManager({
            log: this.log,
            redis: this.redis,
            provider: provider.getProvider(),
            wallet,
            chainId,
          });

          const chainConfig = config.getChain(chainId);

          executor = new TransactionExecutor({
            log: this.log,
            redis: this.redis,
            wallet,
            privateWallet: provider.getPrivateWallet() || undefined,
            chainId,
            arbitrageContractAddress: chainConfig.arbitrageContract || "",
            swapperAddresses: chainConfig.swapperAddresses || {},
            adapters,
            nonceManager,
            bribeBps: config.execution.bribeBps,
          });
        }
      }

      this.chainStates.set(chainId, {
        adapters,
        pools: [],
        paths: [],
        poolScanner,
        reserveUpdater,
        pathFinder,
        profitCalculator,
        optimalInputCalculator,
        gasEstimator,
        nonceManager,
        executor,
      });

      this.log.info(
        {
          chainId,
          adapterCount: adapters.size,
          executionEnabled: !!executor,
        },
        "Initialized chain state"
      );
    }
  }

  /**
   * Scan pools across all chains
   */
  private async scanAllPools(): Promise<void> {
    this.log.info("Scanning pools across all chains...");

    await Promise.all(
      config.getSupportedChainIds().map((chainId) =>
        this.scanChainPools(chainId)
      )
    );
  }

  /**
   * Scan pools for a specific chain
   */
  private async scanChainPools(chainId: SupportedChainId): Promise<void> {
    const state = this.chainStates.get(chainId);
    if (!state) return;

    try {
      // Get whitelisted tokens for this chain
      const whitelistedTokens = await findActiveEvmArbitrageWhitelistedTokens(chainId);

      if (whitelistedTokens.length === 0) {
        this.log.debug({ chainId }, "No whitelisted tokens for chain");
        return;
      }

      const tokenAddresses = whitelistedTokens.map((t: { token_address: string }) => t.token_address);

      // Use PoolScanner to discover pools
      const pools = await state.poolScanner.discoverPools(
        chainId,
        state.adapters,
        tokenAddresses
      );

      // Filter by minimum liquidity
      const filteredPools = state.poolScanner.filterByLiquidity(
        pools,
        BigInt(config.pathfinder.minLiquidityUsd) * 10n ** 18n / 2000n // Rough ETH conversion
      );

      state.pools = filteredPools;

      this.log.info(
        { chainId, totalPools: pools.length, filteredPools: filteredPools.length },
        "Completed pool scan for chain"
      );
    } catch (err) {
      this.log.error({ chainId, err }, "Failed to scan chain pools");
    }
  }

  /**
   * Build arbitrage paths for all chains
   */
  private async buildAllPaths(): Promise<void> {
    for (const chainId of config.getSupportedChainIds()) {
      await this.buildChainPaths(chainId);
    }
  }

  /**
   * Build arbitrage paths for a specific chain
   */
  private async buildChainPaths(chainId: SupportedChainId): Promise<void> {
    const state = this.chainStates.get(chainId);
    if (!state || state.pools.length === 0) return;

    const chainConfig = config.getChain(chainId);
    const baseTokens = [chainConfig.wrappedNative];

    // Use PathFinder to discover arbitrage paths
    const paths = state.pathFinder.findArbitragePaths(
      chainId,
      state.pools,
      baseTokens
    );

    state.paths = paths;

    this.log.info(
      { chainId, pathCount: paths.length },
      "Built arbitrage paths for chain"
    );
  }

  /**
   * Main processing loop
   */
  private async runMainLoop(): Promise<void> {
    while (this.isRunning) {
      const loopStart = Date.now();

      try {
        // Process each chain in parallel
        await Promise.all(
          config.getSupportedChainIds().map((chainId) =>
            this.processChain(chainId)
          )
        );
      } catch (err) {
        this.log.error({ err }, "Error in main loop iteration");
      }

      // Target loop time
      const elapsed = Date.now() - loopStart;
      const targetLoopTime = 500; // 500ms
      if (elapsed < targetLoopTime) {
        await this.sleep(targetLoopTime - elapsed);
      }
    }
  }

  /**
   * Process a single chain: update reserves, find opportunities, execute
   */
  private async processChain(chainId: SupportedChainId): Promise<void> {
    const state = this.chainStates.get(chainId);
    if (!state || state.pools.length === 0) return;

    // Update pool reserves using ReserveUpdater
    await state.reserveUpdater.updateReserves(
      chainId,
      state.pools.slice(0, 50), // Update subset each iteration
      state.adapters
    );

    // Evaluate paths and find opportunities
    const opportunities: ArbitrageOpportunity[] = [];

    for (const path of state.paths.slice(0, 20)) {
      const opportunity = await this.evaluatePath(chainId, state, path);
      if (opportunity) {
        opportunities.push(opportunity);
      }
    }

    // Rank opportunities
    const ranked = state.profitCalculator.rankOpportunities(opportunities);

    // Log top opportunities
    if (ranked.length > 0) {
      this.log.info(
        {
          chainId,
          opportunityCount: ranked.length,
          topProfitBps: ranked[0].expectedProfitBps,
          topProfit: ranked[0].expectedProfitWei.toString(),
        },
        "Found arbitrage opportunities"
      );
    }

    // Execute best opportunity if enabled
    if (config.execution.enabled && state.executor && ranked.length > 0) {
      await this.executeOpportunity(state, ranked[0]);
    }

    // Record opportunities for analytics
    for (const opp of ranked.slice(0, 5)) {
      await this.recordOpportunity(opp);
    }
  }

  /**
   * Evaluate a path and return opportunity if profitable
   */
  private async evaluatePath(
    chainId: SupportedChainId,
    state: ChainState,
    path: ArbitragePath
  ): Promise<ArbitrageOpportunity | null> {
    // Estimate gas cost
    const gasCostWei = await state.gasEstimator.estimateGasCostWei(path, chainId);

    // Find optimal input amount
    const maxInput = state.optimalInputCalculator.estimateMaxInput(path);
    const minInput = 10n ** 16n; // 0.01 ETH minimum

    if (maxInput <= minInput) return null;

    const optimal = state.optimalInputCalculator.findOptimalInput(
      path,
      state.adapters,
      minInput,
      maxInput,
      gasCostWei
    );

    if (optimal.expectedProfit <= 0n) return null;

    // Create opportunity (pass 0 for minProfitBps - contract will revert if not profitable anyway)
    return state.profitCalculator.evaluatePath(
      path,
      optimal.optimalInput,
      state.adapters,
      0, // Contract handles profitability check
      gasCostWei
    );
  }

  /**
   * Execute an arbitrage opportunity
   */
  private async executeOpportunity(
    state: ChainState,
    opportunity: ArbitrageOpportunity
  ): Promise<void> {
    if (!state.executor) return;

    try {
      // Acquire lock to prevent duplicate executions
      const locked = await state.executor.acquireLock(30000);
      if (!locked) {
        this.log.debug("Failed to acquire execution lock");
        return;
      }

      // Validate opportunity is still profitable
      const isValid = state.profitCalculator.validateOpportunity(
        opportunity,
        state.adapters,
        config.execution.maxSlippageBps
      );

      if (!isValid) {
        this.log.debug("Opportunity no longer valid");
        await state.executor.releaseLock();
        return;
      }

      // Execute
      const result = await state.executor.execute(opportunity);

      this.log.info(
        {
          chainId: opportunity.chainId,
          status: result.status,
          txHash: result.txHash,
          profit: result.actualProfitWei?.toString(),
        },
        "Execution completed"
      );

      await state.executor.releaseLock();
    } catch (err) {
      this.log.error({ err }, "Execution failed");
      await state.executor?.releaseLock();
    }
  }

  /**
   * Record opportunity in database
   */
  private async recordOpportunity(opportunity: ArbitrageOpportunity): Promise<void> {
    try {
      await createEvmArbitrageOpportunity({
        chain_id: opportunity.chainId,
        path: JSON.stringify({
          steps: opportunity.path.hops.map((h) => ({
            pool_address: h.pool.address,
            dex_type: h.pool.dexType,
            token_in: h.tokenIn,
            token_out: h.tokenOut,
          })),
          input_token: opportunity.path.startToken,
          output_token: opportunity.path.startToken,
        }),
        input_amount: opportunity.inputAmount.toString(),
        expected_output: opportunity.expectedOutput.toString(),
        expected_profit_usd: "0", // TODO: Convert to USD
        was_executed: false,
      });
    } catch (err) {
      this.log.error({ err }, "Failed to record opportunity");
    }
  }

  /**
   * Schedule periodic pool rescans
   */
  private schedulePoolRescans(): void {
    const interval = config.scanner.poolScanInterval;

    const rescan = async () => {
      if (!this.isRunning) return;

      try {
        await this.scanAllPools();
        await this.buildAllPaths();
      } catch (err) {
        this.log.error({ err }, "Pool rescan failed");
      }

      setTimeout(rescan, interval);
    };

    setTimeout(rescan, interval);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get service statistics for monitoring
   */
  async getStats(): Promise<{
    isRunning: boolean;
    chains: Array<{
      chainId: number;
      poolCount: number;
      pathCount: number;
      adapterCount: number;
    }>;
  }> {
    const chains = [];

    for (const [chainId, state] of this.chainStates) {
      chains.push({
        chainId,
        poolCount: state.pools.length,
        pathCount: state.paths.length,
        adapterCount: state.adapters.size,
      });
    }

    return {
      isRunning: this.isRunning,
      chains,
    };
  }
}
