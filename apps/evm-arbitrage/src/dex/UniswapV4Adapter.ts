import { Contract, AbiCoder } from "ethers";
import { BaseDexAdapter } from "./BaseDexAdapter";
import { PoolInfo } from "../types/dex";
import { DexType } from "../config";
import log from "../logger";

// Uniswap V4 PoolManager ABI (simplified)
const POOL_MANAGER_ABI = [
  "function getSlot0(bytes32 poolId) external view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)",
  "function getLiquidity(bytes32 poolId) external view returns (uint128)",
];

// V4 uses PoolKey to identify pools
interface PoolKey {
  currency0: string;
  currency1: string;
  fee: number;
  tickSpacing: number;
  hooks: string;
}

/**
 * Adapter for Uniswap V4 pools
 * V4 uses a singleton PoolManager contract with pool IDs
 */
export class UniswapV4Adapter extends BaseDexAdapter {
  readonly dexType: DexType = "uniswap_v4";

  get dexName(): string {
    return this.dexConfig.name;
  }

  private poolManagerContract: Contract;

  constructor(dexConfig: any, provider: any) {
    super(dexConfig, provider);
    if (!this.dexConfig.poolManager) {
      throw new Error("V4 poolManager address is required");
    }
    this.poolManagerContract = this.createContract(
      this.dexConfig.poolManager,
      POOL_MANAGER_ABI
    );
  }

  /**
   * V4 pool discovery is more complex - pools are identified by PoolKey hash
   * For now, we rely on pre-indexed pools from subgraph or events
   */
  async discoverPools(tokens: string[]): Promise<PoolInfo[]> {
    // V4 doesn't have factory.getPair like V2
    // Pools are discovered via events or subgraph
    // This is a placeholder - in production, query subgraph or index events
    log.debug(
      { chainId: this.chainId, tokenCount: tokens.length },
      "V4 pool discovery requires subgraph indexing"
    );
    return [];
  }

  async getPoolState(poolAddress: string): Promise<PoolInfo | null> {
    try {
      // poolAddress is actually the poolId (bytes32) for V4
      const poolId = poolAddress;

      const [slot0, liquidity] = await Promise.all([
        this.poolManagerContract.getSlot0(poolId),
        this.poolManagerContract.getLiquidity(poolId),
      ]);

      // Decode pool key from poolId (stored in extra config)
      // For now return null as we need pool key info
      return null;
    } catch (err) {
      log.debug({ poolAddress, err }, "Failed to get V4 pool state");
      return null;
    }
  }

  /**
   * Calculate output using V4 concentrated liquidity math
   * Similar to V3 but with different fee handling
   */
  getAmountOut(pool: PoolInfo, amountIn: bigint, tokenIn: string): bigint {
    if (amountIn === 0n) return 0n;
    if (!pool.sqrtPriceX96 || pool.liquidity === 0n) return 0n;

    const isToken0 = this.isToken0(pool, tokenIn);
    const sqrtPriceX96 = pool.sqrtPriceX96;
    const liquidity = pool.liquidity!;
    const fee = pool.fee;

    // Apply fee
    const amountInAfterFee = (amountIn * BigInt(1000000 - fee)) / 1000000n;

    // Concentrated liquidity math (simplified - assumes single tick range)
    const Q96 = 2n ** 96n;

    if (isToken0) {
      // token0 -> token1
      // deltaY = L * (sqrt(P_upper) - sqrt(P_lower))
      // For small swaps: deltaY ≈ deltaX * P
      const price = (sqrtPriceX96 * sqrtPriceX96) / Q96;
      return (amountInAfterFee * price) / Q96;
    } else {
      // token1 -> token0
      // deltaX = L * (1/sqrt(P_lower) - 1/sqrt(P_upper))
      const priceInverse = (Q96 * Q96) / sqrtPriceX96 / sqrtPriceX96;
      return (amountInAfterFee * priceInverse * Q96) / Q96 / Q96;
    }
  }

  getAmountIn(pool: PoolInfo, amountOut: bigint, tokenOut: string): bigint {
    if (amountOut === 0n) return 0n;
    if (!pool.sqrtPriceX96 || pool.liquidity === 0n) return 0n;

    const isToken0Out = this.isToken0(pool, tokenOut);
    const sqrtPriceX96 = pool.sqrtPriceX96;
    const fee = pool.fee;

    const Q96 = 2n ** 96n;

    let amountInBeforeFee: bigint;

    if (isToken0Out) {
      // token1 -> token0
      const price = (sqrtPriceX96 * sqrtPriceX96) / Q96;
      amountInBeforeFee = (amountOut * Q96) / price + 1n;
    } else {
      // token0 -> token1
      const priceInverse = (Q96 * Q96) / sqrtPriceX96 / sqrtPriceX96;
      amountInBeforeFee = (amountOut * Q96 * Q96) / priceInverse / Q96 + 1n;
    }

    // Add fee
    return (amountInBeforeFee * 1000000n) / BigInt(1000000 - fee) + 1n;
  }

  encodeSwapData(pool: PoolInfo, tokenIn: string, tokenOut: string): string {
    const abiCoder = AbiCoder.defaultAbiCoder();
    const zeroForOne = this.isToken0(pool, tokenIn);

    // Encode V4-specific swap data
    return abiCoder.encode(
      [
        "tuple(address poolManager, tuple(address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) poolKey, bool zeroForOne, uint160 sqrtPriceLimitX96)",
      ],
      [
        {
          poolManager: this.dexConfig.poolManager,
          poolKey: {
            currency0: pool.token0,
            currency1: pool.token1,
            fee: pool.fee,
            tickSpacing: pool.tickSpacing || 60,
            hooks: pool.hooks || "0x0000000000000000000000000000000000000000",
          },
          zeroForOne,
          sqrtPriceLimitX96: zeroForOne
            ? 4295128739n + 1n // MIN_SQRT_RATIO + 1
            : 1461446703485210103287273052203988822378723970342n - 1n, // MAX_SQRT_RATIO - 1
        },
      ]
    );
  }
}
