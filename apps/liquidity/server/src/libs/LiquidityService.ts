import { ethers } from "ethers";
import redis from "../redis";
import config, { chains, getSupportedChainIds, DEFAULT_CHAIN_ID, ChainConfig } from "../config";
import log from "../logger";
import { UniswapV3, ProgressCallback } from "./UniswapV3";
import UniswapV4, { PoolKey, KNOWN_V4_POOLS } from "./UniswapV4";
import PriceService from "./PriceService";
import coinGeckoService from "./CoinGecko";
import { LiquidityDistribution, PriceDisplayInfo } from "../types";

// Helper to check if input is a V3 address (0x + 40 hex chars) or V4 pool ID (0x + 64 hex chars)
export function isV3Address(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

export function isV4PoolId(value: string): boolean {
  return /^0x[a-fA-F0-9]{64}$/.test(value);
}

export type PoolIdentifierType = "v3_address" | "v4_pool_id" | "unknown";

// Cache of UniswapV3 instances per chain
const v3InstanceCache = new Map<number, UniswapV3>();

// Get or create a UniswapV3 instance for a specific chain
function getV3Instance(chainId: number): UniswapV3 {
  if (!v3InstanceCache.has(chainId)) {
    v3InstanceCache.set(chainId, new UniswapV3(chainId));
  }
  return v3InstanceCache.get(chainId)!;
}

export class LiquidityService {
  private v3: UniswapV3;
  private v4: UniswapV4;
  private priceService: PriceService;
  private defaultChainId: number;

  constructor(chainIdOrRpcUrl?: number | string) {
    // Determine if it's a chain ID or RPC URL
    if (typeof chainIdOrRpcUrl === "number") {
      this.defaultChainId = chainIdOrRpcUrl;
      this.v3 = getV3Instance(chainIdOrRpcUrl);
    } else {
      this.defaultChainId = DEFAULT_CHAIN_ID;
      this.v3 = new UniswapV3(chainIdOrRpcUrl);
    }
    // V4 is only on Ethereum mainnet
    this.v4 = new UniswapV4(typeof chainIdOrRpcUrl === "string" ? chainIdOrRpcUrl : undefined);
    this.priceService = new PriceService(typeof chainIdOrRpcUrl === "string" ? chainIdOrRpcUrl : undefined);
  }

  /**
   * Auto-detect which chain a pool address exists on.
   * Queries all supported chains in parallel and returns the first match.
   * Returns the chain ID if found, or null if not found on any chain.
   */
  async detectPoolChain(poolAddress: string, onProgress?: ProgressCallback): Promise<number | null> {
    onProgress?.({
      phase: "detecting_chain",
      percent: 5,
      message: "Detecting pool chain...",
    });

    const chainIds = getSupportedChainIds();
    log.info(`Auto-detecting chain for pool ${poolAddress} across ${chainIds.length} chains`);

    // Query all chains in parallel
    const results = await Promise.all(
      chainIds.map(async (chainId) => {
        try {
          const v3 = getV3Instance(chainId);
          const isValid = await v3.isValidPool(poolAddress);
          if (isValid) {
            log.info(`Pool ${poolAddress} found on chain ${chainId} (${chains[chainId].displayName})`);
            return chainId;
          }
          return null;
        } catch (error) {
          // RPC errors shouldn't stop detection on other chains
          log.debug(`Chain ${chainId} check failed for ${poolAddress}:`, error);
          return null;
        }
      })
    );

    // Return the first chain where the pool was found
    const foundChainId = results.find(r => r !== null) ?? null;

    if (foundChainId) {
      onProgress?.({
        phase: "chain_detected",
        percent: 10,
        message: `Pool found on ${chains[foundChainId].displayName}`,
      });
    } else {
      log.warn(`Pool ${poolAddress} not found on any supported chain`);
    }

    return foundChainId;
  }

  /**
   * Get list of supported chains for client display
   */
  getSupportedChains(): Array<{ chainId: number; name: string; displayName: string }> {
    return Object.values(chains).map(c => ({
      chainId: c.chainId,
      name: c.name,
      displayName: c.displayName,
    }));
  }

  /**
   * Fetch price display info including historical prices
   * Tries CoinGecko first, falls back to on-chain swap events
   */
  private async getPriceDisplayInfo(
    poolAddress: string,
    token0Address: string,
    token0Symbol: string,
    token0Decimals: number,
    token1Address: string,
    token1Symbol: string,
    token1Decimals: number,
    onProgress?: ProgressCallback
  ): Promise<PriceDisplayInfo | undefined> {
    onProgress?.({
      phase: "fetching_prices",
      percent: 92,
      message: "Fetching historical price data...",
    });

    try {
      const priceHistory = await this.priceService.getPriceHistory(
        poolAddress,
        token0Address,
        token0Symbol,
        token0Decimals,
        token1Address,
        token1Symbol,
        token1Decimals
      );

      if (!priceHistory) {
        log.warn("Could not fetch price history from any source");
        return undefined;
      }

      log.info(`Got price history from ${priceHistory.source}`);

      return {
        baseToken: priceHistory.baseToken,
        quoteToken: priceHistory.quoteToken,
        currentPriceUSD: priceHistory.currentPriceUSD,
        priceHistory: priceHistory.prices,
        isInverted: priceHistory.isInverted,
      };
    } catch (error) {
      log.warn("Failed to fetch price display info:", error);
      return undefined;
    }
  }

  async getPoolLiquidity(
    poolAddress: string,
    priceRangePercent?: number,
    onProgress?: ProgressCallback,
    chainId?: number,
    autoDetect: boolean = false
  ): Promise<LiquidityDistribution> {
    // Determine which chain to use
    let targetChainId = chainId ?? this.defaultChainId;

    // Auto-detect chain if requested and no specific chain provided
    if (autoDetect && !chainId) {
      const detectedChainId = await this.detectPoolChain(poolAddress, onProgress);
      if (detectedChainId) {
        targetChainId = detectedChainId;
      } else {
        throw new Error(
          `Pool ${poolAddress} not found on any supported chain. ` +
          `Supported chains: ${this.getSupportedChains().map(c => c.displayName).join(", ")}`
        );
      }
    }

    const cacheKey = `liquidity:${targetChainId}:${poolAddress}:${priceRangePercent || config.priceRangePercent}`;

    // Check cache first
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        log.info(`Cache hit for pool ${poolAddress} on chain ${targetChainId}`);
        onProgress?.({
          phase: "cache_hit",
          percent: 100,
          message: "Loaded from cache",
        });
        return JSON.parse(cached);
      }
    } catch (error) {
      log.warn("Redis cache read failed:", error);
    }

    // Validate address format
    if (!ethers.isAddress(poolAddress)) {
      throw new Error(`Invalid address format: ${poolAddress}`);
    }

    // Get or create V3 instance for target chain
    const v3 = getV3Instance(targetChainId);
    log.info(`Fetching liquidity for pool ${poolAddress} on chain ${targetChainId} (${chains[targetChainId].displayName})`);

    let result: LiquidityDistribution;

    try {
      // Check if it's a V3 pool
      const isV3 = await v3.isValidPool(poolAddress);
      if (isV3) {
        result = await v3.getLiquidityDistribution(
          poolAddress,
          priceRangePercent,
          onProgress
        );

        // Fetch price display info (historical prices - CoinGecko or on-chain)
        const priceDisplay = await this.getPriceDisplayInfo(
          poolAddress,
          result.pool.token0.address,
          result.pool.token0.symbol,
          result.pool.token0.decimals,
          result.pool.token1.address,
          result.pool.token1.symbol,
          result.pool.token1.decimals,
          onProgress
        );
        if (priceDisplay) {
          result.priceDisplay = priceDisplay;

          // If quote token is WETH (not USD stablecoin), convert liquidity values to USD
          if (priceDisplay.quoteToken.isEth && !priceDisplay.quoteToken.isStable) {
            const ethPriceUSD = await this.getEthPriceUSD();
            if (ethPriceUSD > 0) {
              log.info(`Converting tick liquidity from ETH to USD (ETH = $${ethPriceUSD})`);
              // Multiply all tick liquidityUSD values by ETH price
              for (const tick of result.ticks) {
                tick.liquidityUSD = tick.liquidityUSD * ethPriceUSD;
              }
              // Also update total liquidity
              result.totalLiquidityUSD = result.totalLiquidityUSD * ethPriceUSD;
            }
          }
        }
      } else {
        // If not V3, it might be a V4 pool ID
        // For V4, we need additional parameters (tokens, fee, tickSpacing)
        // V4 is currently only on Ethereum mainnet
        if (targetChainId === 1) {
          throw new Error(
            "Pool not found as V3. For V4 pools, use the /api/v4/pool endpoint with pool key parameters."
          );
        } else {
          throw new Error(
            `Pool ${poolAddress} not found on ${chains[targetChainId].displayName}. ` +
            `Try using auto-detection by adding ?auto=true to the request.`
          );
        }
      }
    } catch (error: any) {
      log.error(`Failed to fetch liquidity for ${poolAddress} on chain ${targetChainId}:`, error);
      throw new Error(`Failed to fetch pool data: ${error.message}`);
    }

    // Cache the result
    try {
      await redis.setex(cacheKey, config.cacheTtl, JSON.stringify(result));
      log.info(`Cached liquidity data for pool ${poolAddress} on chain ${targetChainId}`);
    } catch (error) {
      log.warn("Redis cache write failed:", error);
    }

    return result;
  }

  async getV4PoolLiquidity(
    poolKey: PoolKey,
    priceRangePercent?: number,
    onProgress?: ProgressCallback
  ): Promise<LiquidityDistribution> {
    const poolId = this.v4.computePoolId(poolKey);
    const cacheKey = `liquidity:v4:${poolId}:${priceRangePercent || config.priceRangePercent}`;

    // Check cache first
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        log.info(`Cache hit for V4 pool ${poolId}`);
        onProgress?.({
          phase: "cache_hit",
          percent: 100,
          message: "Loaded from cache",
        });
        return JSON.parse(cached);
      }
    } catch (error) {
      log.warn("Redis cache read failed:", error);
    }

    log.info(`Fetching V4 liquidity for pool ${poolId}`);

    const result = await this.v4.getLiquidityDistribution(
      poolKey,
      priceRangePercent,
      onProgress
    );

    // Fetch price display info (historical prices - CoinGecko or on-chain)
    // For V4 pools, we use the poolId as the "address" for on-chain queries
    const priceDisplay = await this.getPriceDisplayInfo(
      poolId, // V4 uses poolId instead of pool address
      result.pool.token0.address,
      result.pool.token0.symbol,
      result.pool.token0.decimals,
      result.pool.token1.address,
      result.pool.token1.symbol,
      result.pool.token1.decimals,
      onProgress
    );
    if (priceDisplay) {
      result.priceDisplay = priceDisplay;

      // If quote token is WETH (not USD stablecoin), convert liquidity values to USD
      if (priceDisplay.quoteToken.isEth && !priceDisplay.quoteToken.isStable) {
        const ethPriceUSD = await this.getEthPriceUSD();
        if (ethPriceUSD > 0) {
          log.info(`Converting V4 tick liquidity from ETH to USD (ETH = $${ethPriceUSD})`);
          // Multiply all tick liquidityUSD values by ETH price
          for (const tick of result.ticks) {
            tick.liquidityUSD = tick.liquidityUSD * ethPriceUSD;
          }
          // Also update total liquidity
          result.totalLiquidityUSD = result.totalLiquidityUSD * ethPriceUSD;
        }
      }
    }

    // Cache the result
    try {
      await redis.setex(cacheKey, config.cacheTtl, JSON.stringify(result));
      log.info(`Cached V4 liquidity data for pool ${poolId}`);
    } catch (error) {
      log.warn("Redis cache write failed:", error);
    }

    return result;
  }

  // Get V4 pool by known pool name (e.g., "ETH-USDC-3000")
  async getV4PoolByName(
    poolName: string,
    priceRangePercent?: number,
    onProgress?: ProgressCallback
  ): Promise<LiquidityDistribution> {
    const poolKey = this.v4.getKnownPoolKey(poolName);
    if (!poolKey) {
      throw new Error(`Unknown V4 pool: ${poolName}. Available pools: ${Object.keys(KNOWN_V4_POOLS).join(", ")}`);
    }
    return this.getV4PoolLiquidity(poolKey, priceRangePercent, onProgress);
  }

  // List known V4 pools
  getKnownV4Pools() {
    return this.v4.getKnownPools();
  }

  // Compute V4 pool ID from pool key
  computeV4PoolId(poolKey: PoolKey): string {
    return this.v4.computePoolId(poolKey);
  }

  /**
   * Get current ETH price in USD from CoinGecko
   */
  private async getEthPriceUSD(): Promise<number> {
    try {
      return await coinGeckoService.getCurrentPrice("ethereum");
    } catch (error) {
      log.warn("Failed to get ETH/USD price:", error);
      return 0;
    }
  }

  async getPoolVersion(address: string): Promise<"v3" | "v4" | null> {
    if (await this.v3.isValidPool(address)) {
      return "v3";
    }
    // For V4, we'd need the full pool key to compute the ID
    return null;
  }

  /**
   * Detect the type of pool identifier (V3 address or V4 pool ID)
   */
  getPoolIdentifierType(value: string): PoolIdentifierType {
    if (isV3Address(value)) return "v3_address";
    if (isV4PoolId(value)) return "v4_pool_id";
    return "unknown";
  }

  /**
   * Check if a V4 pool ID is valid (exists on-chain)
   */
  async isValidV4PoolId(poolId: string): Promise<boolean> {
    return this.v4.isValidPool(poolId);
  }

  /**
   * Get basic V4 pool info from pool ID (without full liquidity distribution)
   * Useful for validating a pool exists before requesting full liquidity
   */
  async getV4PoolBasicInfo(poolId: string, onProgress?: ProgressCallback) {
    return this.v4.getPoolInfoFromId(poolId, onProgress);
  }

  /**
   * Get V4 pool liquidity by pool ID.
   * If poolKey is provided, validates it matches the pool ID.
   * If poolKey is not provided, looks it up from on-chain events.
   */
  async getV4PoolLiquidityById(
    poolId: string,
    poolKey?: PoolKey,
    priceRangePercent?: number,
    onProgress?: ProgressCallback
  ): Promise<LiquidityDistribution> {
    // Verify this is a valid pool ID format
    if (!isV4PoolId(poolId)) {
      throw new Error(`Invalid V4 pool ID format. Expected 0x + 64 hex characters, got: ${poolId}`);
    }

    // Verify the pool exists
    const isValid = await this.v4.isValidPool(poolId);
    if (!isValid) {
      throw new Error(`V4 pool ${poolId} not found or not initialized`);
    }

    // If pool key is provided, verify it matches the pool ID
    if (poolKey) {
      const computedId = this.v4.computePoolId(poolKey);
      if (computedId.toLowerCase() !== poolId.toLowerCase()) {
        throw new Error(
          `Pool key does not match pool ID. ` +
          `Expected ${poolId}, but pool key computes to ${computedId}`
        );
      }
      // Use the standard V4 liquidity method
      return this.getV4PoolLiquidity(poolKey, priceRangePercent, onProgress);
    }

    // No pool key provided - look it up from on-chain events
    log.info(`Looking up pool key for V4 pool ${poolId}`);
    return this.v4.getLiquidityDistributionById(poolId, priceRangePercent, onProgress);
  }

  /**
   * Look up pool key from pool ID using on-chain events
   */
  async getV4PoolKeyFromId(poolId: string, onProgress?: ProgressCallback): Promise<PoolKey | null> {
    return this.v4.getPoolKeyFromId(poolId, onProgress);
  }

  // Invalidate cache for a specific pool
  async invalidateCache(poolAddress: string): Promise<void> {
    const pattern = `liquidity:*${poolAddress}*`;
    try {
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        await redis.del(...keys);
        log.info(`Invalidated ${keys.length} cache entries for ${poolAddress}`);
      }
    } catch (error) {
      log.warn("Failed to invalidate cache:", error);
    }
  }
}

export default LiquidityService;
