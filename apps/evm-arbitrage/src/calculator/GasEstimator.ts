import Logger from "bunyan";
import { JsonRpcProvider } from "ethers";
import { DexType, SupportedChainId } from "../config";
import { ArbitragePath } from "../types/arbitrage";

interface GasEstimatorOptions {
  log: Logger;
  provider: JsonRpcProvider;
}

/**
 * Gas costs per DEX type (in gas units)
 * Based on empirical measurements
 */
const DEX_GAS_COSTS: Record<DexType, number> = {
  uniswap_v2: 100000, // ~100k gas per swap
  uniswap_v3: 150000, // ~150k gas per swap (more complex)
  uniswap_v4: 120000, // ~120k gas (PoolManager)
  algebra: 140000, // Similar to V3
  solidly: 110000, // Similar to V2
  curve: 200000, // ~200k gas (complex math)
  balancer: 180000, // ~180k gas
};

/**
 * Base transaction costs
 */
const BASE_GAS = {
  txOverhead: 21000, // Base transaction cost
  calldataPerByte: 16, // Non-zero calldata byte
  calldataZeroByte: 4, // Zero calldata byte
  tokenApproval: 46000, // ERC20 approve
  tokenTransfer: 65000, // ERC20 transfer
};

/**
 * Estimates gas costs for arbitrage execution
 */
export class GasEstimator {
  private log: Logger;
  private provider: JsonRpcProvider;
  private cachedGasPrice: bigint = 0n;
  private lastGasPriceUpdate = 0;
  private gasPriceTtl = 10000; // 10 seconds

  constructor(options: GasEstimatorOptions) {
    this.log = options.log.child({ component: "GasEstimator" });
    this.provider = options.provider;
  }

  /**
   * Estimate total gas for executing an arbitrage path
   */
  estimatePathGas(path: ArbitragePath): number {
    let totalGas = BASE_GAS.txOverhead;

    // Gas for each swap
    for (const hop of path.hops) {
      const dexGas = DEX_GAS_COSTS[hop.pool.dexType] || 150000;
      totalGas += dexGas;
    }

    // Token approval (if needed)
    totalGas += BASE_GAS.tokenApproval;

    // Add buffer for execution overhead (20%)
    totalGas = Math.ceil(totalGas * 1.2);

    return totalGas;
  }

  /**
   * Estimate gas cost in wei
   */
  async estimateGasCostWei(
    path: ArbitragePath,
    chainId: SupportedChainId
  ): Promise<bigint> {
    const gasUnits = this.estimatePathGas(path);
    const gasPrice = await this.getGasPrice(chainId);

    return BigInt(gasUnits) * gasPrice;
  }

  /**
   * Get current gas price (cached)
   */
  async getGasPrice(chainId: SupportedChainId): Promise<bigint> {
    const now = Date.now();

    if (now - this.lastGasPriceUpdate < this.gasPriceTtl && this.cachedGasPrice > 0n) {
      return this.cachedGasPrice;
    }

    try {
      const feeData = await this.provider.getFeeData();

      // Use maxFeePerGas for EIP-1559 chains, otherwise gasPrice
      let gasPrice = feeData.maxFeePerGas || feeData.gasPrice;

      if (!gasPrice || gasPrice === 0n) {
        // Fallback to default based on chain
        gasPrice = this.getDefaultGasPrice(chainId);
      }

      this.cachedGasPrice = gasPrice;
      this.lastGasPriceUpdate = now;

      return gasPrice;
    } catch (err) {
      this.log.error({ chainId, err }, "Failed to get gas price");
      return this.getDefaultGasPrice(chainId);
    }
  }

  /**
   * Get max priority fee (tip) for EIP-1559 chains
   */
  async getMaxPriorityFee(chainId: SupportedChainId): Promise<bigint> {
    try {
      const feeData = await this.provider.getFeeData();
      return feeData.maxPriorityFeePerGas || 0n;
    } catch {
      return 0n;
    }
  }

  /**
   * Get default gas price for a chain (fallback)
   */
  private getDefaultGasPrice(chainId: SupportedChainId): bigint {
    const defaults: Partial<Record<SupportedChainId, bigint>> = {
      1: 30n * 10n ** 9n, // 30 gwei for Ethereum
      42161: 1n * 10n ** 8n, // 0.1 gwei for Arbitrum
      8453: 1n * 10n ** 6n, // 0.001 gwei for Base
      56: 3n * 10n ** 9n, // 3 gwei for BSC
      137: 50n * 10n ** 9n, // 50 gwei for Polygon
      10: 1n * 10n ** 6n, // 0.001 gwei for Optimism
      43114: 25n * 10n ** 9n, // 25 gwei for Avalanche
    };

    return defaults[chainId] || 30n * 10n ** 9n;
  }

  /**
   * Check if execution is profitable after gas
   */
  isProfitableAfterGas(
    grossProfitWei: bigint,
    gasCostWei: bigint,
    minProfitBps: number,
    inputAmount: bigint
  ): boolean {
    if (grossProfitWei <= gasCostWei) {
      return false;
    }

    const netProfit = grossProfitWei - gasCostWei;
    const netProfitBps = Number((netProfit * 10000n) / inputAmount);

    return netProfitBps >= minProfitBps;
  }

  /**
   * Calculate the formula used in the Arbitrage contract
   * gasCost = tx.gasprice * (28000 + (24 * msg.data.length) + (initGas - gasleft()))
   */
  calculateContractGasCost(
    gasPrice: bigint,
    calldataLength: number,
    executionGas: number
  ): bigint {
    const baseCost = 28000n;
    const calldataCost = BigInt(24 * calldataLength);
    const executionCost = BigInt(executionGas);

    return gasPrice * (baseCost + calldataCost + executionCost);
  }

  /**
   * Estimate calldata size for a path
   */
  estimateCalldataSize(path: ArbitragePath): number {
    // Base: function selector (4 bytes) + array length (32 bytes)
    let size = 36;

    // Per swap config (approximate)
    // swapper address: 32 bytes
    // tokenIn: 32 bytes
    // tokenOut: 32 bytes
    // amountIn: 32 bytes
    // data offset + length + data: ~128 bytes average
    const perSwap = 256;

    size += path.hops.length * perSwap;

    return size;
  }

  /**
   * Get gas statistics for monitoring
   */
  async getGasStats(chainId: SupportedChainId): Promise<{
    gasPrice: bigint;
    maxPriorityFee: bigint;
    estimatedBlockBaseFee: bigint;
  }> {
    const feeData = await this.provider.getFeeData();

    return {
      gasPrice: feeData.gasPrice || 0n,
      maxPriorityFee: feeData.maxPriorityFeePerGas || 0n,
      estimatedBlockBaseFee:
        (feeData.maxFeePerGas || 0n) - (feeData.maxPriorityFeePerGas || 0n),
    };
  }
}
