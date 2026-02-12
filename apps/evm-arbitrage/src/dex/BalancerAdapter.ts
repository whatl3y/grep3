import { Contract, AbiCoder } from "ethers";
import { BaseDexAdapter } from "./BaseDexAdapter";
import { PoolInfo } from "../types/dex";
import { DexType } from "../config";
import log from "../logger";

// Balancer Vault ABI
const VAULT_ABI = [
  "function getPoolTokens(bytes32 poolId) external view returns (address[] tokens, uint256[] balances, uint256 lastChangeBlock)",
  "function getPool(bytes32 poolId) external view returns (address, uint8)",
];

// Balancer Pool ABI
const POOL_ABI = [
  "function getPoolId() external view returns (bytes32)",
  "function getNormalizedWeights() external view returns (uint256[])",
  "function getSwapFeePercentage() external view returns (uint256)",
  "function totalSupply() external view returns (uint256)",
  "function getAmplificationParameter() external view returns (uint256 value, bool isUpdating, uint256 precision)",
];

enum BalancerPoolType {
  WEIGHTED = 0,
  STABLE = 1,
  LINEAR = 2,
  COMPOSABLE_STABLE = 3,
}

/**
 * Adapter for Balancer V2 pools
 * Supports Weighted, Stable, and ComposableStable pools
 */
export class BalancerAdapter extends BaseDexAdapter {
  readonly dexType: DexType = "balancer";

  get dexName(): string {
    return this.dexConfig.name;
  }

  private vaultContract: Contract;

  constructor(dexConfig: any, provider: any) {
    super(dexConfig, provider);
    if (!this.dexConfig.vault) {
      throw new Error("Balancer vault address is required");
    }
    this.vaultContract = this.createContract(this.dexConfig.vault, VAULT_ABI);
  }

  /**
   * Balancer pools are indexed by poolId
   * For discovery, we rely on subgraph or pre-indexed pools
   */
  async discoverPools(tokens: string[]): Promise<PoolInfo[]> {
    // Balancer pool discovery requires subgraph or event indexing
    // Return empty for now - pools should be pre-configured
    log.debug(
      { chainId: this.chainId, tokenCount: tokens.length },
      "Balancer pool discovery requires subgraph indexing"
    );
    return [];
  }

  async getPoolState(poolAddress: string): Promise<PoolInfo | null> {
    try {
      const poolContract = this.createContract(poolAddress, POOL_ABI);

      // Get pool ID
      const poolId = await poolContract.getPoolId();

      // Get pool tokens from vault
      const [tokens, balances] = await this.vaultContract.getPoolTokens(poolId);

      if (tokens.length < 2) {
        return null;
      }

      // Get swap fee
      let swapFee = 0n;
      try {
        swapFee = await poolContract.getSwapFeePercentage();
      } catch {
        // Default fee
      }

      // Determine pool type and get weights if weighted
      let poolType = BalancerPoolType.WEIGHTED;
      let weights: bigint[] = [];
      let amplification: bigint | undefined;

      try {
        weights = await poolContract.getNormalizedWeights();
      } catch {
        // Not a weighted pool, try stable
        try {
          const ampResult = await poolContract.getAmplificationParameter();
          amplification = ampResult.value;
          poolType = BalancerPoolType.STABLE;
        } catch {
          // Unknown pool type
        }
      }

      return {
        address: poolAddress,
        chainId: this.chainId,
        dexType: this.dexType,
        dexName: this.dexName,
        token0: tokens[0],
        token1: tokens[1],
        reserve0: balances[0],
        reserve1: balances[1],
        fee: Number(swapFee / 10n ** 14n), // Convert from 1e18 to bps
        extraConfig: {
          poolId,
          poolType,
          tokens,
          balances: balances.map((b: bigint) => b.toString()),
          weights: weights.map((w: bigint) => w.toString()),
          amplification: amplification?.toString(),
        },
      };
    } catch (err) {
      log.debug({ poolAddress, err }, "Failed to get Balancer pool state");
      return null;
    }
  }

  /**
   * Calculate output based on pool type
   * Weighted: constant weighted product formula
   * Stable: StableSwap invariant
   */
  getAmountOut(pool: PoolInfo, amountIn: bigint, tokenIn: string): bigint {
    if (amountIn === 0n) return 0n;

    const isToken0 = this.isToken0(pool, tokenIn);
    const balanceIn = isToken0 ? pool.reserve0 : pool.reserve1;
    const balanceOut = isToken0 ? pool.reserve1 : pool.reserve0;

    if (balanceIn === 0n || balanceOut === 0n) return 0n;

    const fee = pool.fee;
    const amountInAfterFee = amountIn - (amountIn * BigInt(fee)) / 10000n;

    const poolType = pool.extraConfig?.poolType as BalancerPoolType;
    const weights = (pool.extraConfig?.weights as string[]) || [];

    if (poolType === BalancerPoolType.WEIGHTED && weights.length >= 2) {
      // Weighted pool: constant weighted product formula
      // amountOut = balanceOut * (1 - (balanceIn / (balanceIn + amountIn))^(weightIn/weightOut))
      return this.getWeightedAmountOut(
        amountInAfterFee,
        balanceIn,
        balanceOut,
        BigInt(weights[isToken0 ? 0 : 1] || "0"),
        BigInt(weights[isToken0 ? 1 : 0] || "0")
      );
    } else if (poolType === BalancerPoolType.STABLE) {
      // Stable pool: StableSwap invariant
      return this.getStableAmountOut(
        amountInAfterFee,
        balanceIn,
        balanceOut
      );
    } else {
      // Default to constant product
      const numerator = amountInAfterFee * balanceOut;
      const denominator = balanceIn + amountInAfterFee;
      return numerator / denominator;
    }
  }

  /**
   * Weighted pool calculation using power function approximation
   */
  private getWeightedAmountOut(
    amountIn: bigint,
    balanceIn: bigint,
    balanceOut: bigint,
    weightIn: bigint,
    weightOut: bigint
  ): bigint {
    // For equal weights (50/50), this reduces to constant product
    if (weightIn === weightOut) {
      const numerator = amountIn * balanceOut;
      const denominator = balanceIn + amountIn;
      return numerator / denominator;
    }

    // Weighted formula: out = balanceOut * (1 - (balanceIn / (balanceIn + amountIn))^(wIn/wOut))
    // Using Taylor series approximation for small trades

    const ONE = 10n ** 18n;
    const ratio = (balanceIn * ONE) / (balanceIn + amountIn);
    const exponent = (weightIn * ONE) / weightOut;

    // Approximate (ratio)^exponent using: x^y ≈ 1 + y*(x-1) for x close to 1
    // ratio is balanceIn/(balanceIn+amountIn), which is close to 1 for small trades
    const deltaRatio = ONE - ratio;
    const powerApprox = ONE - (deltaRatio * exponent) / ONE;

    const amountOut = (balanceOut * (ONE - powerApprox)) / ONE;
    return amountOut;
  }

  /**
   * Stable pool calculation (simplified)
   */
  private getStableAmountOut(
    amountIn: bigint,
    balanceIn: bigint,
    balanceOut: bigint
  ): bigint {
    // For stable pools with similar assets, output ≈ input
    // Apply small slippage based on imbalance
    const total = balanceIn + balanceOut;
    if (total === 0n) return 0n;

    const imbalance = balanceIn > balanceOut
      ? (balanceIn - balanceOut) * 10000n / total
      : (balanceOut - balanceIn) * 10000n / total;

    // More imbalance = more slippage against the trade direction
    const slippageFactor = 10000n - imbalance / 10n;
    return (amountIn * slippageFactor) / 10000n;
  }

  getAmountIn(pool: PoolInfo, amountOut: bigint, tokenOut: string): bigint {
    if (amountOut === 0n) return 0n;

    const isToken0Out = this.isToken0(pool, tokenOut);
    const balanceIn = isToken0Out ? pool.reserve1 : pool.reserve0;
    const balanceOut = isToken0Out ? pool.reserve0 : pool.reserve1;

    if (balanceIn === 0n || balanceOut === 0n || amountOut >= balanceOut) {
      return 0n;
    }

    const fee = pool.fee;
    const poolType = pool.extraConfig?.poolType as BalancerPoolType;

    if (poolType === BalancerPoolType.STABLE) {
      // For stable pools
      const amountInBeforeFee = amountOut + amountOut / 100n; // 1% buffer
      return (amountInBeforeFee * 10000n) / BigInt(10000 - fee) + 1n;
    } else {
      // Weighted/default
      const numerator = balanceIn * amountOut;
      const denominator = balanceOut - amountOut;
      const amountInBeforeFee = numerator / denominator + 1n;
      return (amountInBeforeFee * 10000n) / BigInt(10000 - fee) + 1n;
    }
  }

  encodeSwapData(pool: PoolInfo, tokenIn: string, tokenOut: string): string {
    const abiCoder = AbiCoder.defaultAbiCoder();

    return abiCoder.encode(
      ["tuple(address vault, bytes32 poolId, bytes userData)"],
      [
        {
          vault: this.dexConfig.vault,
          poolId: pool.extraConfig?.poolId || "0x",
          userData: "0x", // Empty for basic swaps
        },
      ]
    );
  }
}
