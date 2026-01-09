import { ethers, Contract, JsonRpcProvider } from "ethers";
import { DexConfig } from "../../config";
import log from "../../logger";
import { PoolData } from "./types";

// Solidly/Velodrome/Aerodrome V2 Factory ABI
// Note: Different forks use different method names
const SOLIDLY_FACTORY_ABI = [
  "function getPool(address tokenA, address tokenB, bool stable) external view returns (address pool)",
  "function getPair(address tokenA, address tokenB, bool stable) external view returns (address pair)",
];

// Solidly Pool ABI
const SOLIDLY_POOL_ABI = [
  "function token0() external view returns (address)",
  "function token1() external view returns (address)",
  "function stable() external view returns (bool)",
  "function getReserves() external view returns (uint256 reserve0, uint256 reserve1, uint256 blockTimestampLast)",
];

export class SolidlyAdapter {
  async findBestPool(
    tokenAddress: string,
    quoteAssets: string[],
    dex: DexConfig,
    provider: JsonRpcProvider
  ): Promise<PoolData | null> {
    const factory = new Contract(dex.factory, SOLIDLY_FACTORY_ABI, provider);

    let bestPool: PoolData | null = null;
    let bestLiquidity = BigInt(0);

    for (const quoteAsset of quoteAssets) {
      if (quoteAsset.toLowerCase() === tokenAddress.toLowerCase()) continue;

      // Try both stable and volatile pools
      for (const stable of [false, true]) {
        try {
          // Try getPool first (Aerodrome), then getPair (older Solidly forks)
          let poolAddress: string;
          try {
            poolAddress = await factory.getPool(tokenAddress, quoteAsset, stable);
          } catch {
            try {
              poolAddress = await factory.getPair(tokenAddress, quoteAsset, stable);
            } catch {
              continue;
            }
          }

          if (!poolAddress || poolAddress === ethers.ZeroAddress) continue;

          const pool = new Contract(poolAddress, SOLIDLY_POOL_ABI, provider);
          const [token0, token1, reserves] = await Promise.all([
            pool.token0(),
            pool.token1(),
            pool.getReserves(),
          ]);

          const liquidity = BigInt(reserves[0]) + BigInt(reserves[1]);

          if (liquidity > bestLiquidity) {
            bestLiquidity = liquidity;
            bestPool = {
              address: poolAddress,
              dexName: dex.name,
              dexType: dex.type,
              token0: token0.toLowerCase(),
              token1: token1.toLowerCase(),
              liquidity,
              reserve0: BigInt(reserves[0]),
              reserve1: BigInt(reserves[1]),
            };
          }
        } catch (error) {
          log.debug(`Solidly pool lookup failed for ${dex.name} stable=${stable}:`, error);
          continue;
        }
      }
    }

    return bestPool;
  }

  calculatePrice(
    pool: PoolData,
    isToken0: boolean,
    tokenDecimals: number,
    quoteDecimals: number
  ): number {
    if (!pool.reserve0 || !pool.reserve1) return 0;

    const reserve0 = Number(pool.reserve0);
    const reserve1 = Number(pool.reserve1);

    if (reserve0 === 0 || reserve1 === 0) return 0;

    let price: number;
    if (isToken0) {
      price = (reserve1 / reserve0) * 10 ** (tokenDecimals - quoteDecimals);
    } else {
      price = (reserve0 / reserve1) * 10 ** (tokenDecimals - quoteDecimals);
    }

    return price;
  }
}

export default new SolidlyAdapter();
