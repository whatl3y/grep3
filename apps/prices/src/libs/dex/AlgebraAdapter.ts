import { ethers, Contract, JsonRpcProvider } from "ethers";
import { DexConfig } from "../../config";
import log from "../../logger";
import { PoolData } from "./types";

// Algebra Factory ABI (Camelot V3, QuickSwap V3, Aerodrome SlipStream)
const ALGEBRA_FACTORY_ABI = [
  "function poolByPair(address tokenA, address tokenB) external view returns (address pool)",
];

// Algebra Pool ABI
const ALGEBRA_POOL_ABI = [
  "function token0() external view returns (address)",
  "function token1() external view returns (address)",
  "function liquidity() external view returns (uint128)",
  "function globalState() external view returns (uint160 price, int24 tick, uint16 feeZto, uint16 feeOtz, uint16 timepointIndex, uint8 communityFeeToken0, uint8 communityFeeToken1, bool unlocked)",
];

export class AlgebraAdapter {
  async findBestPool(
    tokenAddress: string,
    quoteAssets: string[],
    dex: DexConfig,
    provider: JsonRpcProvider
  ): Promise<PoolData | null> {
    const factory = new Contract(dex.factory, ALGEBRA_FACTORY_ABI, provider);

    let bestPool: PoolData | null = null;
    let bestLiquidity = BigInt(0);

    for (const quoteAsset of quoteAssets) {
      if (quoteAsset.toLowerCase() === tokenAddress.toLowerCase()) continue;

      try {
        const poolAddress = await factory.poolByPair(tokenAddress, quoteAsset);
        if (poolAddress === ethers.ZeroAddress) continue;

        const pool = new Contract(poolAddress, ALGEBRA_POOL_ABI, provider);
        const [token0, token1, liquidity, globalState] = await Promise.all([
          pool.token0(),
          pool.token1(),
          pool.liquidity(),
          pool.globalState(),
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
            sqrtPriceX96: globalState[0], // price in Algebra is sqrtPriceX96
            tick: Number(globalState[1]),
          };
        }
      } catch (error) {
        log.debug(`Algebra pool lookup failed for ${dex.name}:`, error);
        continue;
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

    // Algebra uses same price formula as Uniswap V3
    // price = (sqrtPriceX96 / 2^96)^2
    const sqrtPrice = Number(pool.sqrtPriceX96) / 2 ** 96;
    let price = sqrtPrice * sqrtPrice;

    // Adjust for decimals
    if (isToken0) {
      price = price * 10 ** (tokenDecimals - quoteDecimals);
    } else {
      price = (1 / price) * 10 ** (tokenDecimals - quoteDecimals);
    }

    return price;
  }
}

export default new AlgebraAdapter();
