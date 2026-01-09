import { ethers, Contract, JsonRpcProvider } from "ethers";
import { DexConfig } from "../../config";
import log from "../../logger";
import { PoolData } from "./types";

// Trader Joe LB Factory V2.1 ABI
const LB_FACTORY_ABI = [
  "function getAllLBPairs(address tokenA, address tokenB) external view returns (tuple(uint16 binStep, address LBPair, bool createdByOwner, bool ignoredForRouting)[])",
];

// Trader Joe LB Pair V2.1 ABI
const LB_PAIR_ABI = [
  "function getTokenX() external view returns (address)",
  "function getTokenY() external view returns (address)",
  "function getActiveId() external view returns (uint24)",
  "function getBinStep() external view returns (uint16)",
  "function getReserves() external view returns (uint128 reserveX, uint128 reserveY)",
];

export class TraderJoeLBAdapter {
  async findBestPool(
    tokenAddress: string,
    quoteAssets: string[],
    dex: DexConfig,
    provider: JsonRpcProvider
  ): Promise<PoolData | null> {
    const factory = new Contract(dex.factory, LB_FACTORY_ABI, provider);

    let bestPool: PoolData | null = null;
    let bestLiquidity = BigInt(0);

    for (const quoteAsset of quoteAssets) {
      if (quoteAsset.toLowerCase() === tokenAddress.toLowerCase()) continue;

      try {
        // Get all LB pairs for this token pair
        const pairs = await factory.getAllLBPairs(tokenAddress, quoteAsset);

        for (const pairInfo of pairs) {
          if (!pairInfo.LBPair || pairInfo.LBPair === ethers.ZeroAddress) continue;
          if (pairInfo.ignoredForRouting) continue;

          try {
            const pair = new Contract(pairInfo.LBPair, LB_PAIR_ABI, provider);
            const [tokenX, tokenY, reserves, activeId, binStep] = await Promise.all([
              pair.getTokenX(),
              pair.getTokenY(),
              pair.getReserves(),
              pair.getActiveId(),
              pair.getBinStep(),
            ]);

            const liquidity = BigInt(reserves[0]) + BigInt(reserves[1]);

            if (liquidity > bestLiquidity) {
              bestLiquidity = liquidity;
              bestPool = {
                address: pairInfo.LBPair,
                dexName: dex.name,
                dexType: dex.type,
                token0: tokenX.toLowerCase(),
                token1: tokenY.toLowerCase(),
                liquidity,
                reserve0: BigInt(reserves[0]),
                reserve1: BigInt(reserves[1]),
                activeId: Number(activeId),
                binStep: Number(binStep),
              };
            }
          } catch (error) {
            log.debug(`LB pair fetch failed for ${pairInfo.LBPair}:`, error);
            continue;
          }
        }
      } catch (error) {
        log.debug(`LB factory lookup failed for ${dex.name}:`, error);
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
    if (pool.activeId === undefined || pool.binStep === undefined) return 0;

    // Trader Joe LB uses a different price formula based on active bin
    // price = (1 + binStep/10000)^(activeId - 2^23)
    const binStep = pool.binStep;
    const activeId = pool.activeId;

    // Base price calculation
    // The formula uses base 1.0001 for standard bin step of 1
    // For other bin steps: base = 1 + binStep/10000
    const base = 1 + binStep / 10000;
    const exponent = activeId - 8388608; // 2^23 = 8388608 (the center bin)
    let price = Math.pow(base, exponent);

    // Adjust for decimals
    // In LB, tokenX is typically the "base" and tokenY is the "quote"
    if (isToken0) {
      // Token is tokenX, price is in terms of tokenY
      price = price * 10 ** (tokenDecimals - quoteDecimals);
    } else {
      // Token is tokenY, we need inverse
      price = (1 / price) * 10 ** (tokenDecimals - quoteDecimals);
    }

    return price;
  }
}

export default new TraderJoeLBAdapter();
