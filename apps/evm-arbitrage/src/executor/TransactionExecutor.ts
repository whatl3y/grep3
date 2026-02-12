import Logger from "bunyan";
import Redis from "ioredis";
import {
  Contract,
  Wallet,
  TransactionReceipt,
  TransactionResponse,
  AbiCoder,
} from "ethers";
import { SupportedChainId } from "../config";
import { ArbitrageOpportunity, ExecutionResult, SwapConfig } from "../types/arbitrage";
import { IDexAdapter } from "../types/dex";
import { NonceManager } from "./NonceManager";
import {
  createEvmArbitrageExecution,
  createEvmArbitrageOpportunity,
} from "@grep3/core";

// Flash loan provider enum (must match contract)
export enum FlashLoanProvider {
  BALANCER = 0,
  MORPHO = 1,
}

// Arbitrage contract ABI
const ARBITRAGE_ABI = [
  "function go(uint8 provider, address token, uint256 amount, tuple(tuple(address swapper, address tokenIn, address tokenOut, uint256 amountIn, bytes data)[] swaps, uint16 bribeBps) params) external",
  "function isSwapperApproved(address swapper) external view returns (bool)",
  "function emergencyStopped() external view returns (bool)",
  "function weth() external view returns (address)",
  "function balancerVault() external view returns (address)",
  "function morpho() external view returns (address)",
];

// ERC20 ABI for balance checks
const ERC20_ABI = [
  "function balanceOf(address account) external view returns (uint256)",
];

interface TransactionExecutorOptions {
  log: Logger;
  redis: Redis;
  wallet: Wallet;
  privateWallet?: Wallet; // Optional wallet connected to private RPC for tx execution
  chainId: SupportedChainId;
  arbitrageContractAddress: string;
  swapperAddresses: Record<string, string>;
  adapters: Map<string, IDexAdapter>;
  nonceManager: NonceManager;
  confirmationBlocks?: number;
  bribeBps?: number; // Bribe to block producer (0-10000, where 10000 = 100% of profit)
  flashLoanProvider?: FlashLoanProvider; // Which flash loan provider to use
}

/**
 * Executes arbitrage transactions on-chain
 */
export class TransactionExecutor {
  private log: Logger;
  private redis: Redis;
  private wallet: Wallet;
  private privateWallet?: Wallet; // Wallet connected to private RPC for tx execution
  private chainId: SupportedChainId;
  private arbitrageContract: Contract;
  private arbitrageAddress: string;
  private swapperAddresses: Record<string, string>;
  private adapters: Map<string, IDexAdapter>;
  private nonceManager: NonceManager;
  private confirmationBlocks: number;
  private bribeBps: number;
  private flashLoanProvider: FlashLoanProvider;

  constructor(options: TransactionExecutorOptions) {
    this.log = options.log.child({ component: "TransactionExecutor" });
    this.redis = options.redis;
    this.wallet = options.wallet;
    this.privateWallet = options.privateWallet;
    this.chainId = options.chainId;
    this.arbitrageAddress = options.arbitrageContractAddress;
    this.arbitrageContract = new Contract(
      options.arbitrageContractAddress,
      ARBITRAGE_ABI,
      this.wallet
    );
    this.swapperAddresses = options.swapperAddresses;
    this.adapters = options.adapters;
    this.nonceManager = options.nonceManager;
    this.confirmationBlocks = options.confirmationBlocks || 1;
    this.bribeBps = options.bribeBps || 0; // Default to no bribe (0-10000 basis points)
    this.flashLoanProvider = options.flashLoanProvider ?? FlashLoanProvider.BALANCER;

    if (this.privateWallet) {
      this.log.info("Using private RPC for transaction execution");
    }
  }

  /**
   * Execute an arbitrage opportunity
   */
  async execute(opportunity: ArbitrageOpportunity): Promise<ExecutionResult> {
    const startTime = Date.now();

    try {
      // Pre-flight checks
      await this.preflight(opportunity);

      // Build swap configs
      const swapConfigs = this.buildSwapConfigs(opportunity);

      // Get nonce
      const nonce = await this.nonceManager.getNextNonce();

      this.log.info(
        {
          chainId: this.chainId,
          nonce,
          hops: swapConfigs.length,
          inputAmount: opportunity.inputAmount.toString(),
          expectedProfit: opportunity.expectedProfitWei.toString(),
        },
        "Executing arbitrage"
      );

      // Execute transaction with flash loan
      const inputToken = opportunity.path.startToken;
      const tx = await this.sendTransaction(
        swapConfigs,
        nonce,
        inputToken,
        opportunity.inputAmount
      );

      // Wait for confirmation
      const receipt = await this.waitForConfirmation(tx);

      // Mark nonce as confirmed
      await this.nonceManager.confirmNonce(nonce);

      // Calculate actual profit
      const result = this.buildResult(
        opportunity,
        tx,
        receipt,
        startTime
      );

      // Record execution
      await this.recordExecution(opportunity, result);

      this.log.info(
        {
          chainId: this.chainId,
          txHash: tx.hash,
          gasUsed: receipt.gasUsed.toString(),
          status: result.status,
          profit: result.actualProfitWei?.toString(),
        },
        "Arbitrage execution completed"
      );

      return result;
    } catch (err: any) {
      this.log.error(
        {
          chainId: this.chainId,
          err,
          opportunity: {
            inputAmount: opportunity.inputAmount.toString(),
            expectedProfit: opportunity.expectedProfitWei.toString(),
          },
        },
        "Arbitrage execution failed"
      );

      return {
        status: "failed",
        chainId: this.chainId,
        opportunity,
        error: err.message,
        timestamp: Date.now(),
      };
    }
  }

  /**
   * Pre-flight checks before execution
   */
  private async preflight(opportunity: ArbitrageOpportunity): Promise<void> {
    // Check emergency stop
    const stopped = await this.arbitrageContract.emergencyStopped();
    if (stopped) {
      throw new Error("Arbitrage contract is emergency stopped");
    }

    // Verify flash loan provider is configured
    if (this.flashLoanProvider === FlashLoanProvider.BALANCER) {
      const vault = await this.arbitrageContract.balancerVault();
      if (vault === "0x0000000000000000000000000000000000000000") {
        throw new Error("Balancer Vault not configured on arbitrage contract");
      }
    } else if (this.flashLoanProvider === FlashLoanProvider.MORPHO) {
      const morpho = await this.arbitrageContract.morpho();
      if (morpho === "0x0000000000000000000000000000000000000000") {
        throw new Error("Morpho not configured on arbitrage contract");
      }
    }

    // Verify path ends in WETH (required for profit calculation)
    const weth = await this.arbitrageContract.weth();
    const lastHop = opportunity.path.hops[opportunity.path.hops.length - 1];
    if (lastHop.tokenOut.toLowerCase() !== weth.toLowerCase()) {
      throw new Error("Arbitrage path must end in WETH for profit calculation");
    }

    // Verify swappers are approved
    for (const hop of opportunity.path.hops) {
      const swapperAddress = this.swapperAddresses[hop.pool.dexType];
      if (!swapperAddress) {
        throw new Error(`No swapper configured for ${hop.pool.dexType}`);
      }

      const approved = await this.arbitrageContract.isSwapperApproved(
        swapperAddress
      );
      if (!approved) {
        throw new Error(`Swapper ${swapperAddress} not approved`);
      }
    }
  }

  /**
   * Build swap configs for the arbitrage contract
   */
  private buildSwapConfigs(opportunity: ArbitrageOpportunity): SwapConfig[] {
    const configs: SwapConfig[] = [];

    for (let i = 0; i < opportunity.path.hops.length; i++) {
      const hop = opportunity.path.hops[i];
      const adapter = this.adapters.get(hop.pool.dexName);

      if (!adapter) {
        throw new Error(`No adapter for ${hop.pool.dexName}`);
      }

      const swapperAddress = this.swapperAddresses[hop.pool.dexType];
      if (!swapperAddress) {
        throw new Error(`No swapper for ${hop.pool.dexType}`);
      }

      const swapData = adapter.encodeSwapData(
        hop.pool,
        hop.tokenIn,
        hop.tokenOut
      );

      configs.push({
        swapper: swapperAddress,
        tokenIn: hop.tokenIn,
        tokenOut: hop.tokenOut,
        amountIn: i === 0 ? opportunity.inputAmount : 0n, // Only first swap has input
        data: swapData,
      });
    }

    return configs;
  }

  /**
   * Send the arbitrage transaction
   * Uses privateWallet if configured, otherwise uses regular wallet
   */
  private async sendTransaction(
    swapConfigs: SwapConfig[],
    nonce: number,
    inputToken: string,
    inputAmount: bigint
  ): Promise<TransactionResponse> {
    // Build ArbParams struct
    const arbParams = {
      swaps: swapConfigs.map((c) => ({
        swapper: c.swapper,
        tokenIn: c.tokenIn,
        tokenOut: c.tokenOut,
        amountIn: c.amountIn,
        data: c.data,
      })),
      bribeBps: this.bribeBps,
    };

    // Encode function call with flash loan parameters
    const iface = this.arbitrageContract.interface;
    const data = iface.encodeFunctionData("go", [
      this.flashLoanProvider,
      inputToken,
      inputAmount,
      arbParams,
    ]);

    // Use regular wallet for gas estimation (reads from public RPC)
    const gasEstimate = await this.wallet.estimateGas({
      to: this.arbitrageAddress,
      data,
    });

    // Get fee data from the wallet that will send the tx
    const txWallet = this.privateWallet || this.wallet;
    const feeData = await txWallet.provider!.getFeeData();

    // Send transaction via private RPC if configured, otherwise use regular RPC
    const tx = await txWallet.sendTransaction({
      to: this.arbitrageAddress,
      data,
      nonce,
      gasLimit: (gasEstimate * 120n) / 100n, // 20% buffer
      maxFeePerGas: feeData.maxFeePerGas,
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
    });

    if (this.privateWallet) {
      this.log.debug({ txHash: tx.hash }, "Transaction sent via private RPC");
    }

    return tx;
  }

  /**
   * Wait for transaction confirmation
   */
  private async waitForConfirmation(
    tx: TransactionResponse
  ): Promise<TransactionReceipt> {
    const receipt = await tx.wait(this.confirmationBlocks);

    if (!receipt) {
      throw new Error("Transaction receipt not found");
    }

    if (receipt.status === 0) {
      throw new Error("Transaction reverted");
    }

    return receipt;
  }

  /**
   * Build execution result from transaction
   */
  private buildResult(
    opportunity: ArbitrageOpportunity,
    tx: TransactionResponse,
    receipt: TransactionReceipt,
    startTime: number
  ): ExecutionResult {
    const gasCost = receipt.gasUsed * receipt.gasPrice;

    // TODO: Parse logs to get actual output amount
    // For now, use expected values
    const actualProfitWei = opportunity.expectedProfitWei - gasCost;

    return {
      status: "success",
      chainId: this.chainId,
      opportunity,
      txHash: tx.hash,
      gasUsed: receipt.gasUsed,
      gasPrice: receipt.gasPrice,
      actualProfitWei,
      executionTimeMs: Date.now() - startTime,
      timestamp: Date.now(),
    };
  }

  /**
   * Record execution in database
   */
  private async recordExecution(
    opportunity: ArbitrageOpportunity,
    result: ExecutionResult
  ): Promise<void> {
    try {
      // Record opportunity
      const oppRecord = await createEvmArbitrageOpportunity({
        chain_id: this.chainId,
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
        was_executed: result.status === "success",
      });

      // Record execution
      if (result.txHash) {
        const execution = await createEvmArbitrageExecution({
          chain_id: this.chainId,
          tx_hash: result.txHash,
          input_token: opportunity.path.startToken,
          output_token: opportunity.path.startToken, // Arbitrage returns to start token
          input_amount: opportunity.inputAmount.toString(),
          output_amount: opportunity.expectedOutput.toString(),
          profit_amount: result.actualProfitWei?.toString() || "0",
          gas_used: result.gasUsed?.toString() || null,
          gas_price: result.gasPrice?.toString() || null,
          status: result.status,
          path: JSON.stringify(opportunity.path.hops.map((h) => ({
            pool_address: h.pool.address,
            dex_type: h.pool.dexType,
            token_in: h.tokenIn,
            token_out: h.tokenOut,
          }))),
          executed_at: new Date().toISOString(),
        });

        // Update opportunity with execution_id
        if (oppRecord && execution) {
          // Link execution to opportunity via execution_id on opportunity
        }
      }
    } catch (err) {
      this.log.error({ err }, "Failed to record execution in database");
    }
  }

  /**
   * Check if we can execute (not locked)
   */
  async canExecute(): Promise<boolean> {
    const lockKey = `arb:lock:${this.chainId}`;
    const locked = await this.redis.get(lockKey);
    return locked === null;
  }

  /**
   * Acquire execution lock
   */
  async acquireLock(ttlMs = 30000): Promise<boolean> {
    const lockKey = `arb:lock:${this.chainId}`;
    const result = await this.redis.set(
      lockKey,
      Date.now().toString(),
      "PX",
      ttlMs,
      "NX"
    );
    return result === "OK";
  }

  /**
   * Release execution lock
   */
  async releaseLock(): Promise<void> {
    const lockKey = `arb:lock:${this.chainId}`;
    await this.redis.del(lockKey);
  }
}
