import { Contract, AbiCoder } from "ethers";
import { BaseDexAdapter } from "./BaseDexAdapter";
import { PoolInfo } from "../types/dex";
import { DexType } from "../config";
import log from "../logger";

// Algebra Factory ABI
const FACTORY_ABI = [
  "function poolByPair(address tokenA, address tokenB) external view returns (address pool)",
];

// Algebra Pool ABI
const POOL_ABI = [
  "function token0() external view returns (address)",
  "function token1() external view returns (address)",
  "function globalState() external view returns (uint160 price, int24 tick, uint16 feeZto, uint16 feeOtz, uint16 timepointIndex, uint8 communityFeeToken0, uint8 communityFeeToken1, bool unlocked)",
  "function liquidity() external view returns (uint128)",
  "function tickSpacing() external view returns (int24)",
];

/**
 * Adapter for Algebra-based DEXs (Camelot V3, QuickSwap V3)
 * Algebra uses dynamic fees instead of fixed fee tiers
 */
export class AlgebraAdapter extends BaseDexAdapter {
  readonly dexType: DexType = "algebra";

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

    for (let i = 0; i < tokens.length; i++) {
      for (let j = i + 1; j < tokens.length; j++) {
        try {
          const poolAddress = await this.factoryContract.poolByPair(
            tokens[i],
            tokens[j]
          );

          if (
            poolAddress &&
            poolAddress !== "0x0000000000000000000000000000000000000000"
          ) {
            const poolState = await this.getPoolState(poolAddress);
            if (poolState) {
              pools.push(poolState);
            }
          }
        } catch (err) {
          log.debug(
            { tokenA: tokens[i], tokenB: tokens[j], err },
            "Failed to get Algebra pool"
          );
        }
      }
    }

    return pools;
  }

  async getPoolState(poolAddress: string): Promise<PoolInfo | null> {
    try {
      const poolContract = this.createContract(poolAddress, POOL_ABI);

      const [token0, token1, globalState, liquidity, tickSpacing] =
        await Promise.all([
          poolContract.token0(),
          poolContract.token1(),
          poolContract.globalState(),
          poolContract.liquidity(),
          poolContract.tickSpacing(),
        ]);

      // Algebra uses dynamic fees - feeZto for 0->1, feeOtz for 1->0
      // Fee is in hundredths of a bip (1e-6)
      const avgFee = (Number(globalState.feeZto) + Number(globalState.feeOtz)) / 2;

      return {
        address: poolAddress,
        chainId: this.chainId,
        dexType: this.dexType,
        dexName: this.dexName,
        token0,
        token1,
        reserve0: 0n, // Not used for concentrated liquidity
        reserve1: 0n,
        fee: Math.round(avgFee), // Dynamic fee
        sqrtPriceX96: globalState.price,
        tick: globalState.tick,
        liquidity,
        tickSpacing: Number(tickSpacing),
        // Store directional fees in extra config
        extraConfig: {
          feeZtoOne: Number(globalState.feeZto),
          feeOneToZero: Number(globalState.feeOtz),
        },
      };
    } catch (err) {
      log.debug({ poolAddress, err }, "Failed to get Algebra pool state");
      return null;
    }
  }

  /**
   * Calculate output using concentrated liquidity math with dynamic fees
   */
  getAmountOut(pool: PoolInfo, amountIn: bigint, tokenIn: string): bigint {
    if (amountIn === 0n) return 0n;
    if (!pool.sqrtPriceX96 || pool.liquidity === 0n) return 0n;

    const isToken0 = this.isToken0(pool, tokenIn);

    // Get directional fee
    const fee = isToken0
      ? (pool.extraConfig?.feeZtoOne as number) ?? pool.fee
      : (pool.extraConfig?.feeOneToZero as number) ?? pool.fee;

    const sqrtPriceX96 = pool.sqrtPriceX96;
    const liquidity = pool.liquidity!;

    // Apply fee (fee is in hundredths of a bip, so divide by 1e6)
    const amountInAfterFee = amountIn - (amountIn * BigInt(Math.floor(fee))) / 1000000n;

    const Q96 = 2n ** 96n;

    if (isToken0) {
      // token0 -> token1: deltaY = L * deltaP / Q96
      // Simplified: amountOut ≈ amountIn * price
      const price = (sqrtPriceX96 * sqrtPriceX96) / Q96;
      return (amountInAfterFee * price) / Q96;
    } else {
      // token1 -> token0: deltaX = L * Q96 / deltaP
      const priceInverse = (Q96 * Q96) / (sqrtPriceX96 * sqrtPriceX96);
      return (amountInAfterFee * priceInverse) / Q96;
    }
  }

  getAmountIn(pool: PoolInfo, amountOut: bigint, tokenOut: string): bigint {
    if (amountOut === 0n) return 0n;
    if (!pool.sqrtPriceX96 || pool.liquidity === 0n) return 0n;

    const isToken0Out = this.isToken0(pool, tokenOut);

    // Get directional fee (reversed since we're calculating input)
    const fee = isToken0Out
      ? (pool.extraConfig?.feeOneToZero as number) ?? pool.fee
      : (pool.extraConfig?.feeZtoOne as number) ?? pool.fee;

    const sqrtPriceX96 = pool.sqrtPriceX96;
    const Q96 = 2n ** 96n;

    let amountInBeforeFee: bigint;

    if (isToken0Out) {
      // token1 -> token0
      const price = (sqrtPriceX96 * sqrtPriceX96) / Q96;
      amountInBeforeFee = (amountOut * Q96) / price + 1n;
    } else {
      // token0 -> token1
      const priceInverse = (Q96 * Q96) / (sqrtPriceX96 * sqrtPriceX96);
      amountInBeforeFee = (amountOut * Q96) / priceInverse + 1n;
    }

    // Add fee
    return (amountInBeforeFee * 1000000n) / BigInt(Math.floor(1000000 - fee)) + 1n;
  }

  encodeSwapData(pool: PoolInfo, tokenIn: string, tokenOut: string): string {
    const abiCoder = AbiCoder.defaultAbiCoder();

    return abiCoder.encode(
      ["tuple(address router, uint160 limitSqrtPrice)"],
      [
        {
          router: this.dexConfig.router,
          limitSqrtPrice: 0n, // No price limit
        },
      ]
    );
  }
}
