import { ethers, Contract, JsonRpcProvider } from "ethers";
import { DexConfig } from "../../config";
import log from "../../logger";
import { PoolData } from "./types";

// Uniswap V2 / SushiSwap / PancakeSwap V2 / Camelot V2 Factory ABI
const V2_FACTORY_ABI = [
  "function getPair(address tokenA, address tokenB) external view returns (address pair)",
];

// Uniswap V2 Pair ABI
const V2_PAIR_ABI = [
  "function token0() external view returns (address)",
  "function token1() external view returns (address)",
  "function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
];

export class UniswapV2Adapter {
  async findBestPool(
    tokenAddress: string,
    quoteAssets: string[],
    dex: DexConfig,
    provider: JsonRpcProvider
  ): Promise<PoolData | null> {
    const factory = new Contract(dex.factory, V2_FACTORY_ABI, provider);

    let bestPool: PoolData | null = null;
    let bestLiquidity = BigInt(0);

    for (const quoteAsset of quoteAssets) {
      if (quoteAsset.toLowerCase() === tokenAddress.toLowerCase()) continue;

      try {
        const pairAddress = await factory.getPair(tokenAddress, quoteAsset);
        if (pairAddress === ethers.ZeroAddress) continue;

        const pair = new Contract(pairAddress, V2_PAIR_ABI, provider);
        const [token0, token1, reserves] = await Promise.all([
          pair.token0(),
          pair.token1(),
          pair.getReserves(),
        ]);

        // Use total reserves as proxy for liquidity
        const liquidity = BigInt(reserves[0]) + BigInt(reserves[1]);

        if (liquidity > bestLiquidity) {
          bestLiquidity = liquidity;
          bestPool = {
            address: pairAddress,
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
        log.debug(`V2 pair lookup failed for ${dex.name}:`, error);
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
    if (!pool.reserve0 || !pool.reserve1) return 0;

    const reserve0 = Number(pool.reserve0);
    const reserve1 = Number(pool.reserve1);

    if (reserve0 === 0 || reserve1 === 0) return 0;

    let price: number;
    if (isToken0) {
      // Token is token0, price = reserve1/reserve0
      price = (reserve1 / reserve0) * 10 ** (tokenDecimals - quoteDecimals);
    } else {
      // Token is token1, price = reserve0/reserve1
      price = (reserve0 / reserve1) * 10 ** (tokenDecimals - quoteDecimals);
    }

    return price;
  }
}

export default new UniswapV2Adapter();
