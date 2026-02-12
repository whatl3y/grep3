import { Contract, AbiCoder } from "ethers";
import { BaseDexAdapter } from "./BaseDexAdapter";
import { PoolInfo } from "../types/dex";
import { DexType } from "../config";
import log from "../logger";

// Solidly Factory ABI
const FACTORY_ABI = [
  "function getPair(address tokenA, address tokenB, bool stable) external view returns (address pair)",
  "function allPairsLength() external view returns (uint256)",
  "function allPairs(uint256) external view returns (address pair)",
];

// Solidly Pair ABI
const PAIR_ABI = [
  "function token0() external view returns (address)",
  "function token1() external view returns (address)",
  "function getReserves() external view returns (uint256 reserve0, uint256 reserve1, uint256 blockTimestampLast)",
  "function stable() external view returns (bool)",
  "function decimals() external view returns (uint8)",
  "function getAmountOut(uint256 amountIn, address tokenIn) external view returns (uint256)",
];

/**
 * Adapter for Solidly-style DEXs (Velodrome, Aerodrome)
 * Supports both volatile (xy=k) and stable (x³y+xy³=k) pools
 */
export class SolidlyAdapter extends BaseDexAdapter {
  readonly dexType: DexType = "solidly";

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
        // Check both stable and volatile pools
        for (const stable of [false, true]) {
          try {
            const pairAddress = await this.factoryContract.getPair(
              tokens[i],
              tokens[j],
              stable
            );

            if (
              pairAddress &&
              pairAddress !== "0x0000000000000000000000000000000000000000"
            ) {
              const poolState = await this.getPoolState(pairAddress);
              if (poolState) {
                pools.push(poolState);
              }
            }
          } catch (err) {
            log.debug(
              { tokenA: tokens[i], tokenB: tokens[j], stable, err },
              "Failed to get Solidly pair"
            );
          }
        }
      }
    }

    return pools;
  }

  async getPoolState(poolAddress: string): Promise<PoolInfo | null> {
    try {
      const pairContract = this.createContract(poolAddress, PAIR_ABI);

      const [token0, token1, reserves, isStable] = await Promise.all([
        pairContract.token0(),
        pairContract.token1(),
        pairContract.getReserves(),
        pairContract.stable(),
      ]);

      return {
        address: poolAddress,
        chainId: this.chainId,
        dexType: this.dexType,
        dexName: this.dexName,
        token0,
        token1,
        reserve0: reserves.reserve0,
        reserve1: reserves.reserve1,
        fee: isStable ? 4 : 30, // 0.04% for stable, 0.3% for volatile (Velodrome/Aerodrome fees)
        isStable,
      };
    } catch (err) {
      log.debug({ poolAddress, err }, "Failed to get Solidly pool state");
      return null;
    }
  }

  /**
   * Calculate output amount
   * Volatile pools: xy=k (same as Uniswap V2)
   * Stable pools: x³y + xy³ = k (Curve-like)
   */
  getAmountOut(pool: PoolInfo, amountIn: bigint, tokenIn: string): bigint {
    if (amountIn === 0n) return 0n;

    const isToken0 = this.isToken0(pool, tokenIn);
    const reserveIn = isToken0 ? pool.reserve0 : pool.reserve1;
    const reserveOut = isToken0 ? pool.reserve1 : pool.reserve0;

    if (reserveIn === 0n || reserveOut === 0n) return 0n;

    // Apply fee
    const fee = pool.fee;
    const amountInAfterFee = amountIn - (amountIn * BigInt(fee)) / 10000n;

    if (pool.isStable) {
      // Stable swap: x³y + xy³ = k
      // Use the formula from Solidly/Velodrome
      return this.getStableAmountOut(
        amountInAfterFee,
        reserveIn,
        reserveOut
      );
    } else {
      // Volatile: xy = k (same as Uniswap V2)
      const numerator = amountInAfterFee * reserveOut;
      const denominator = reserveIn + amountInAfterFee;
      return numerator / denominator;
    }
  }

  /**
   * Stable swap calculation using x³y + xy³ = k invariant
   */
  private getStableAmountOut(
    amountIn: bigint,
    reserveIn: bigint,
    reserveOut: bigint
  ): bigint {
    // For stable pools, we use Newton-Raphson iteration
    // k = x³y + xy³
    // This is a simplified version - production should use more iterations

    const xy = reserveIn * reserveOut;
    const k = this.getK(reserveIn, reserveOut);

    const newReserveIn = reserveIn + amountIn;

    // Solve for new y using Newton-Raphson
    let y = reserveOut;
    for (let i = 0; i < 255; i++) {
      const yPrev = y;
      const kCurrent = this.getK(newReserveIn, y);

      if (kCurrent < k) {
        const dy = ((k - kCurrent) * y) / this.getKDerivative(newReserveIn, y);
        y = y + dy;
      } else {
        const dy = ((kCurrent - k) * y) / this.getKDerivative(newReserveIn, y);
        y = y - dy;
      }

      if (y > yPrev) {
        if (y - yPrev <= 1n) break;
      } else {
        if (yPrev - y <= 1n) break;
      }
    }

    return reserveOut - y;
  }

  /**
   * Calculate k = x³y + xy³
   */
  private getK(x: bigint, y: bigint): bigint {
    const xy = x * y;
    return (x * x * x * y + x * y * y * y) / (10n ** 18n);
  }

  /**
   * Derivative of k with respect to y: dk/dy = x³ + 3xy²
   */
  private getKDerivative(x: bigint, y: bigint): bigint {
    return (x * x * x + 3n * x * y * y) / (10n ** 18n);
  }

  getAmountIn(pool: PoolInfo, amountOut: bigint, tokenOut: string): bigint {
    if (amountOut === 0n) return 0n;

    const isToken0Out = this.isToken0(pool, tokenOut);
    const reserveIn = isToken0Out ? pool.reserve1 : pool.reserve0;
    const reserveOut = isToken0Out ? pool.reserve0 : pool.reserve1;

    if (reserveIn === 0n || reserveOut === 0n || amountOut >= reserveOut) {
      return 0n;
    }

    const fee = pool.fee;

    if (pool.isStable) {
      // For stable pools, iterate to find amountIn
      // This is a simplified binary search
      let low = 0n;
      let high = reserveIn * 2n;

      for (let i = 0; i < 256; i++) {
        const mid = (low + high) / 2n;
        const out = this.getAmountOut(pool, mid, isToken0Out ? pool.token1 : pool.token0);

        if (out >= amountOut) {
          high = mid;
        } else {
          low = mid + 1n;
        }

        if (high - low <= 1n) break;
      }

      return high;
    } else {
      // Volatile: standard formula
      const numerator = reserveIn * amountOut * 10000n;
      const denominator = (reserveOut - amountOut) * BigInt(10000 - fee);
      return numerator / denominator + 1n;
    }
  }

  encodeSwapData(pool: PoolInfo, tokenIn: string, tokenOut: string): string {
    const abiCoder = AbiCoder.defaultAbiCoder();

    return abiCoder.encode(
      ["tuple(address router, bool stable, address factory)"],
      [
        {
          router: this.dexConfig.router,
          stable: pool.isStable || false,
          factory: this.dexConfig.factory,
        },
      ]
    );
  }
}
