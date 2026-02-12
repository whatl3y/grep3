import { Contract, AbiCoder } from "ethers";
import { BaseDexAdapter } from "./BaseDexAdapter";
import { PoolInfo } from "../types/dex";
import { DexType } from "../config";
import log from "../logger";

// ABIs
const FACTORY_ABI = [
  "function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool)",
];

const POOL_ABI = [
  "function token0() external view returns (address)",
  "function token1() external view returns (address)",
  "function fee() external view returns (uint24)",
  "function tickSpacing() external view returns (int24)",
  "function liquidity() external view returns (uint128)",
  "function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
];

// Q96 = 2^96
const Q96 = 2n ** 96n;

/**
 * Adapter for Uniswap V3 and compatible forks
 * Supports: Uniswap V3, PancakeSwap V3
 */
export class UniswapV3Adapter extends BaseDexAdapter {
  readonly dexType: DexType = "uniswap_v3";

  get dexName(): string {
    return this.dexConfig.name;
  }

  private factoryContract: Contract;

  constructor(dexConfig: any, provider: any) {
    super(dexConfig, provider);
    this.factoryContract = this.createContract(
      this.dexConfig.factory,
      FACTORY_ABI
    );
  }

  async discoverPools(tokens: string[]): Promise<PoolInfo[]> {
    const pools: PoolInfo[] = [];
    const feeTiers = this.dexConfig.feeTiers || [100, 500, 3000, 10000];

    // Get all pair + fee tier combinations
    for (let i = 0; i < tokens.length; i++) {
      for (let j = i + 1; j < tokens.length; j++) {
        for (const fee of feeTiers) {
          try {
            const poolAddress = await this.factoryContract.getPool(
              tokens[i],
              tokens[j],
              fee
            );

            if (
              poolAddress &&
              poolAddress !== "0x0000000000000000000000000000000000000000"
            ) {
              const poolState = await this.getPoolState(poolAddress);
              if (poolState && poolState.liquidity && poolState.liquidity > 0n) {
                pools.push(poolState);
              }
            }
          } catch (err) {
            log.debug(
              { tokenA: tokens[i], tokenB: tokens[j], fee, err },
              "Failed to get pool"
            );
          }
        }
      }
    }

    return pools;
  }

  async getPoolState(poolAddress: string): Promise<PoolInfo | null> {
    try {
      const poolContract = this.createContract(poolAddress, POOL_ABI);

      const [token0, token1, fee, tickSpacing, liquidity, slot0] =
        await Promise.all([
          poolContract.token0(),
          poolContract.token1(),
          poolContract.fee(),
          poolContract.tickSpacing(),
          poolContract.liquidity(),
          poolContract.slot0(),
        ]);

      return {
        address: poolAddress,
        chainId: this.chainId,
        dexType: this.dexType,
        dexName: this.dexName,
        token0,
        token1,
        reserve0: 0n, // V3 doesn't use simple reserves
        reserve1: 0n,
        fee: Number(fee) / 100, // Convert to basis points (e.g., 3000 -> 30)
        sqrtPriceX96: slot0.sqrtPriceX96,
        tick: Number(slot0.tick),
        liquidity: liquidity,
        tickSpacing: Number(tickSpacing),
      };
    } catch (err) {
      log.debug({ poolAddress, err }, "Failed to get V3 pool state");
      return null;
    }
  }

  /**
   * Calculate output amount for V3 pool
   * This is a simplified calculation that works for small trades within current tick range
   */
  getAmountOut(pool: PoolInfo, amountIn: bigint, tokenIn: string): bigint {
    if (amountIn === 0n || !pool.sqrtPriceX96 || !pool.liquidity) {
      return 0n;
    }

    const isToken0 = this.isToken0(pool, tokenIn);
    const sqrtPriceX96 = pool.sqrtPriceX96;
    const liquidity = pool.liquidity;

    // Fee deduction
    const feeAmount = (amountIn * BigInt(pool.fee)) / 10000n;
    const amountInAfterFee = amountIn - feeAmount;

    try {
      if (isToken0) {
        // Swap token0 -> token1
        // deltaY = L * (sqrt(P_new) - sqrt(P))
        // where sqrt(P_new) = L * sqrt(P) / (L + deltaX * sqrt(P))
        const sqrtP = sqrtPriceX96;
        const L = liquidity;
        const deltaX = amountInAfterFee;

        // Calculate new sqrt price
        const numerator = L * sqrtP;
        const denominator = L * Q96 + deltaX * sqrtP;
        const sqrtPNew = (numerator * Q96) / denominator;

        // Calculate output (token1)
        const amountOut = (L * (sqrtP - sqrtPNew)) / Q96;
        return amountOut > 0n ? amountOut : 0n;
      } else {
        // Swap token1 -> token0
        // deltaX = L * (1/sqrt(P_new) - 1/sqrt(P))
        // where sqrt(P_new) = sqrt(P) + deltaY / L
        const sqrtP = sqrtPriceX96;
        const L = liquidity;
        const deltaY = amountInAfterFee;

        // Calculate new sqrt price
        const sqrtPNew = sqrtP + (deltaY * Q96) / L;

        // Calculate output (token0)
        const amountOut = (L * Q96 * (sqrtPNew - sqrtP)) / (sqrtP * sqrtPNew);
        return amountOut > 0n ? amountOut : 0n;
      }
    } catch {
      return 0n;
    }
  }

  /**
   * Calculate input amount for desired output
   */
  getAmountIn(pool: PoolInfo, amountOut: bigint, tokenOut: string): bigint {
    if (amountOut === 0n || !pool.sqrtPriceX96 || !pool.liquidity) {
      return 0n;
    }

    // Simplified reverse calculation
    // Add fee buffer
    const amountOutWithBuffer = (amountOut * 10100n) / 10000n;

    // Use getAmountOut iteratively to find input
    let low = 0n;
    let high = amountOutWithBuffer * 10n;

    for (let i = 0; i < 100; i++) {
      const mid = (low + high) / 2n;
      const output = this.getAmountOut(
        pool,
        mid,
        this.isToken0(pool, tokenOut) ? pool.token1 : pool.token0
      );

      if (output >= amountOut) {
        high = mid;
      } else {
        low = mid + 1n;
      }
    }

    return high;
  }

  /**
   * Encode swap data for UniswapV3Swapper contract
   */
  encodeSwapData(
    pool: PoolInfo,
    tokenIn: string,
    tokenOut: string
  ): string {
    const abiCoder = AbiCoder.defaultAbiCoder();

    // V3 swap data includes fee tier and optional price limit
    return abiCoder.encode(
      ["tuple(address router, uint24 fee, uint160 sqrtPriceLimitX96)"],
      [
        {
          router: this.dexConfig.router,
          fee: pool.fee * 100, // Convert back to V3 format (30 -> 3000)
          sqrtPriceLimitX96: 0n, // No price limit
        },
      ]
    );
  }
}
