import { Contract, AbiCoder } from "ethers";
import { BaseDexAdapter } from "./BaseDexAdapter";
import { PoolInfo } from "../types/dex";
import { DexType } from "../config";
import log from "../logger";

// Curve Registry ABI
const REGISTRY_ABI = [
  "function find_pool_for_coins(address from, address to, uint256 i) external view returns (address)",
  "function get_coin_indices(address pool, address from, address to) external view returns (int128, int128, bool)",
  "function get_n_coins(address pool) external view returns (uint256[2])",
  "function get_coins(address pool) external view returns (address[8])",
  "function get_balances(address pool) external view returns (uint256[8])",
  "function get_fees(address pool) external view returns (uint256, uint256)",
];

// Curve Pool ABI (StableSwap)
const POOL_ABI = [
  "function get_dy(int128 i, int128 j, uint256 dx) external view returns (uint256)",
  "function get_dy_underlying(int128 i, int128 j, uint256 dx) external view returns (uint256)",
  "function exchange(int128 i, int128 j, uint256 dx, uint256 min_dy) external returns (uint256)",
  "function coins(uint256 index) external view returns (address)",
  "function balances(uint256 index) external view returns (uint256)",
  "function fee() external view returns (uint256)",
  "function A() external view returns (uint256)",
];

// Curve CryptoSwap Pool ABI
const CRYPTO_POOL_ABI = [
  "function get_dy(uint256 i, uint256 j, uint256 dx) external view returns (uint256)",
  "function exchange(uint256 i, uint256 j, uint256 dx, uint256 min_dy) external returns (uint256)",
  "function coins(uint256 index) external view returns (address)",
  "function balances(uint256 index) external view returns (uint256)",
  "function fee() external view returns (uint256)",
  "function gamma() external view returns (uint256)",
];

enum CurvePoolType {
  STABLESWAP = 0,
  CRYPTOSWAP = 1,
  META = 2,
}

/**
 * Adapter for Curve Finance pools
 * Supports StableSwap (x³y + xy³), CryptoSwap, and Meta pools
 */
export class CurveAdapter extends BaseDexAdapter {
  readonly dexType: DexType = "curve";

  get dexName(): string {
    return this.dexConfig.name;
  }

  private registryContract: Contract | null = null;

  constructor(dexConfig: any, provider: any) {
    super(dexConfig, provider);
    if (this.dexConfig.registry) {
      this.registryContract = this.createContract(
        this.dexConfig.registry,
        REGISTRY_ABI
      );
    }
  }

  async discoverPools(tokens: string[]): Promise<PoolInfo[]> {
    const pools: PoolInfo[] = [];

    if (!this.registryContract) {
      log.debug(
        { chainId: this.chainId },
        "No Curve registry configured, using predefined pools"
      );
      return pools;
    }

    for (let i = 0; i < tokens.length; i++) {
      for (let j = i + 1; j < tokens.length; j++) {
        try {
          // Try to find pools for this pair (can have multiple)
          let poolIndex = 0;
          while (poolIndex < 5) {
            // Check up to 5 pools per pair
            const poolAddress = await this.registryContract.find_pool_for_coins(
              tokens[i],
              tokens[j],
              poolIndex
            );

            if (
              !poolAddress ||
              poolAddress === "0x0000000000000000000000000000000000000000"
            ) {
              break;
            }

            const poolState = await this.getPoolState(poolAddress);
            if (poolState) {
              // Get coin indices for this pool
              try {
                const [idxI, idxJ, isUnderlying] =
                  await this.registryContract.get_coin_indices(
                    poolAddress,
                    tokens[i],
                    tokens[j]
                  );

                poolState.extraConfig = {
                  ...poolState.extraConfig,
                  coinIndexI: Number(idxI),
                  coinIndexJ: Number(idxJ),
                  isUnderlying,
                };
              } catch {
                // Indices not found, skip
              }

              pools.push(poolState);
            }

            poolIndex++;
          }
        } catch (err) {
          log.debug(
            { tokenA: tokens[i], tokenB: tokens[j], err },
            "Failed to find Curve pool"
          );
        }
      }
    }

    return pools;
  }

  async getPoolState(poolAddress: string): Promise<PoolInfo | null> {
    try {
      const poolContract = this.createContract(poolAddress, POOL_ABI);

      // Get coins and balances
      const coins: string[] = [];
      const balances: bigint[] = [];

      for (let i = 0; i < 8; i++) {
        try {
          const coin = await poolContract.coins(i);
          if (
            coin &&
            coin !== "0x0000000000000000000000000000000000000000"
          ) {
            coins.push(coin);
            const balance = await poolContract.balances(i);
            balances.push(balance);
          } else {
            break;
          }
        } catch {
          break;
        }
      }

      if (coins.length < 2) {
        return null;
      }

      // Get fee (in 1e10 for Curve)
      let fee = 4000000n; // Default 0.04%
      try {
        fee = await poolContract.fee();
      } catch {
        // Some pools don't have fee() function
      }

      // Determine pool type
      let poolType = CurvePoolType.STABLESWAP;
      try {
        await poolContract.A(); // StableSwap has A parameter
      } catch {
        poolType = CurvePoolType.CRYPTOSWAP;
      }

      return {
        address: poolAddress,
        chainId: this.chainId,
        dexType: this.dexType,
        dexName: this.dexName,
        token0: coins[0],
        token1: coins[1],
        reserve0: balances[0] || 0n,
        reserve1: balances[1] || 0n,
        fee: Number(fee / 100000000n), // Convert from 1e10 to bps
        extraConfig: {
          poolType,
          coins,
          balances: balances.map((b) => b.toString()),
        },
      };
    } catch (err) {
      log.debug({ poolAddress, err }, "Failed to get Curve pool state");
      return null;
    }
  }

  /**
   * Calculate output using Curve's StableSwap math
   * For accuracy, we call the on-chain get_dy function
   */
  getAmountOut(pool: PoolInfo, amountIn: bigint, tokenIn: string): bigint {
    if (amountIn === 0n) return 0n;

    // For Curve, we should ideally call on-chain get_dy
    // This is a simplified off-chain approximation

    const isToken0 = this.isToken0(pool, tokenIn);
    const reserveIn = isToken0 ? pool.reserve0 : pool.reserve1;
    const reserveOut = isToken0 ? pool.reserve1 : pool.reserve0;

    if (reserveIn === 0n || reserveOut === 0n) return 0n;

    const fee = pool.fee;
    const amountInAfterFee = amountIn - (amountIn * BigInt(fee)) / 10000n;

    const poolType = pool.extraConfig?.poolType as CurvePoolType;

    if (poolType === CurvePoolType.STABLESWAP) {
      // StableSwap approximation for 1:1 pegged assets
      // Uses sum invariant for small trades
      return this.getStableSwapAmountOut(
        amountInAfterFee,
        reserveIn,
        reserveOut
      );
    } else {
      // CryptoSwap - uses product invariant similar to V2
      const numerator = amountInAfterFee * reserveOut;
      const denominator = reserveIn + amountInAfterFee;
      return numerator / denominator;
    }
  }

  /**
   * StableSwap calculation using the invariant
   * D = sum of balances when prices are equal
   * x' + y' = D and x'*y'*A^n = D^(n+1)/(n^n)
   */
  private getStableSwapAmountOut(
    amountIn: bigint,
    reserveIn: bigint,
    reserveOut: bigint
  ): bigint {
    // Simplified StableSwap for 2 coins with high A (near 1:1)
    // For highly correlated assets, output ≈ input
    const D = reserveIn + reserveOut;
    const newReserveIn = reserveIn + amountIn;

    // Newton-Raphson to find new y
    // For high A, y ≈ D - x
    let y = D - newReserveIn;

    // Bound check
    if (y < 0n) y = 0n;
    if (y > reserveOut) y = reserveOut;

    const amountOut = reserveOut - y;

    // Apply small slippage based on trade size vs reserves
    const slippageFactor =
      10000n - (amountIn * 100n) / (reserveIn > 0n ? reserveIn : 1n);
    return (amountOut * slippageFactor) / 10000n;
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
    const poolType = pool.extraConfig?.poolType as CurvePoolType;

    if (poolType === CurvePoolType.STABLESWAP) {
      // For stable pools, amountIn ≈ amountOut (1:1 peg)
      const amountInBeforeFee = amountOut + (amountOut * 100n) / (reserveOut > 0n ? reserveOut : 1n);
      return (amountInBeforeFee * 10000n) / BigInt(10000 - fee) + 1n;
    } else {
      // CryptoSwap
      const numerator = reserveIn * amountOut;
      const denominator = reserveOut - amountOut;
      const amountInBeforeFee = numerator / denominator + 1n;
      return (amountInBeforeFee * 10000n) / BigInt(10000 - fee) + 1n;
    }
  }

  encodeSwapData(pool: PoolInfo, tokenIn: string, tokenOut: string): string {
    const abiCoder = AbiCoder.defaultAbiCoder();

    const poolType = pool.extraConfig?.poolType || CurvePoolType.STABLESWAP;
    const i = pool.extraConfig?.coinIndexI ?? (this.isToken0(pool, tokenIn) ? 0 : 1);
    const j = pool.extraConfig?.coinIndexJ ?? (this.isToken0(pool, tokenIn) ? 1 : 0);

    return abiCoder.encode(
      [
        "tuple(address pool, uint8 poolType, int128 i, int128 j, uint256 iCrypto, uint256 jCrypto)",
      ],
      [
        {
          pool: pool.address,
          poolType,
          i,
          j,
          iCrypto: i,
          jCrypto: j,
        },
      ]
    );
  }
}
