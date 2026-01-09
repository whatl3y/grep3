import { ethers, Contract, JsonRpcProvider } from "ethers";
import { DexConfig } from "../../config";
import log from "../../logger";
import { PoolData } from "./types";

// Uniswap V3 / SushiSwap V3 / PancakeSwap V3 Factory ABI
const V3_FACTORY_ABI = [
  "function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool)",
];

// Uniswap V3 Pool ABI
const V3_POOL_ABI = [
  "function token0() external view returns (address)",
  "function token1() external view returns (address)",
  "function fee() external view returns (uint24)",
  "function liquidity() external view returns (uint128)",
  "function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
];

// Default fee tiers
const DEFAULT_FEE_TIERS = [100, 500, 3000, 10000];

export class UniswapV3Adapter {
  async findBestPool(
    tokenAddress: string,
    quoteAssets: string[],
    dex: DexConfig,
    provider: JsonRpcProvider
  ): Promise<PoolData | null> {
    const factory = new Contract(dex.factory, V3_FACTORY_ABI, provider);
    const feeTiers = dex.feeTiers || DEFAULT_FEE_TIERS;

    let bestPool: PoolData | null = null;
    let bestLiquidity = BigInt(0);

    for (const quoteAsset of quoteAssets) {
      if (quoteAsset.toLowerCase() === tokenAddress.toLowerCase()) continue;

      for (const fee of feeTiers) {
        try {
          const poolAddress = await factory.getPool(tokenAddress, quoteAsset, fee);
          if (poolAddress === ethers.ZeroAddress) continue;

          const pool = new Contract(poolAddress, V3_POOL_ABI, provider);
          const [token0, token1, liquidity, slot0] = await Promise.all([
            pool.token0(),
            pool.token1(),
            pool.liquidity(),
            pool.slot0(),
          ]);

          if (liquidity > bestLiquidity) {
            bestLiquidity = liquidity;
            bestPool = {
              address: poolAddress,
              dexName: dex.name,
              dexType: dex.type,
              token0: token0.toLowerCase(),
              token1: token1.toLowerCase(),
              liquidity,
              sqrtPriceX96: slot0[0],
              tick: Number(slot0[1]),
            };
          }
        } catch (error) {
          log.debug(`V3 pool lookup failed for ${dex.name} fee ${fee}:`, error);
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
    if (!pool.sqrtPriceX96) return 0;

    // price = (sqrtPriceX96 / 2^96)^2
    const sqrtPrice = Number(pool.sqrtPriceX96) / 2 ** 96;
    let price = sqrtPrice * sqrtPrice;

    // Adjust for decimals
    if (isToken0) {
      // price is token1/token0
      price = price * 10 ** (tokenDecimals - quoteDecimals);
    } else {
      // price is token0/token1, we need inverse
      price = (1 / price) * 10 ** (tokenDecimals - quoteDecimals);
    }

    return price;
  }
}

export default new UniswapV3Adapter();
