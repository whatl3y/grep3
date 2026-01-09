import { Contract, JsonRpcProvider } from "ethers";
import { chains, CHAIN_PRIORITY, ChainConfig, DexConfig } from "../config";
import log from "../logger";
import { PriceData, PriceProvider } from "../types";
import coinGeckoProvider from "./CoinGeckoProvider";
import {
  PoolData,
  ERC20_ABI,
  uniswapV4Adapter,
  uniswapV3Adapter,
  uniswapV2Adapter,
  algebraAdapter,
  solidlyAdapter,
  traderJoeLBAdapter,
} from "./dex";

// Provider cache
const providerCache = new Map<number, JsonRpcProvider>();

function getProvider(chainId: number): JsonRpcProvider {
  if (!providerCache.has(chainId)) {
    const chainConfig = chains[chainId];
    if (!chainConfig) {
      throw new Error(`Chain ${chainId} not supported`);
    }
    providerCache.set(chainId, new JsonRpcProvider(chainConfig.rpcUrl));
  }
  return providerCache.get(chainId)!;
}

export class EVMDexProvider implements PriceProvider {
  name = "dex";
  private cache: Map<string, { data: PriceData; timestamp: number }> = new Map();
  private cacheTtl = 60 * 1000; // 1 minute

  isEnabled(): boolean {
    return true;
  }

  async getPrice(tokenAddress: string, specificChainId?: number): Promise<PriceData | null> {
    const normalizedAddress = tokenAddress.toLowerCase();
    const cacheKey = specificChainId
      ? `${specificChainId}:${normalizedAddress}`
      : normalizedAddress;

    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTtl) {
      log.info(`EVM DEX cache hit for ${tokenAddress}`);
      return { ...cached.data, cached: true };
    }

    // If specific chain requested, only try that chain
    const chainsToTry = specificChainId ? [specificChainId] : CHAIN_PRIORITY;

    for (const chainId of chainsToTry) {
      try {
        const result = await this.getPriceOnChain(normalizedAddress, chainId);
        if (result) {
          this.cache.set(cacheKey, { data: result, timestamp: Date.now() });
          return result;
        }
      } catch (error) {
        log.debug(`Failed to get price on chain ${chainId}:`, error);
        continue;
      }
    }

    // Return stale cache if available
    if (cached) {
      log.warn("Returning stale cached data");
      return { ...cached.data, cached: true };
    }

    return null;
  }

  private async getPriceOnChain(
    tokenAddress: string,
    chainId: number
  ): Promise<PriceData | null> {
    const chainConfig = chains[chainId];
    if (!chainConfig) {
      return null;
    }

    const provider = getProvider(chainId);

    // First, verify the token exists on this chain
    const tokenInfo = await this.getTokenInfo(tokenAddress, provider);
    if (!tokenInfo) {
      return null;
    }

    log.info(
      `Found token ${tokenInfo.symbol} on ${chainConfig.displayName}, searching ${chainConfig.dexes.length} DEXes...`
    );

    // Find the best pool across all DEXes
    const bestPool = await this.findBestPoolAcrossDexes(
      tokenAddress,
      chainConfig,
      provider
    );

    if (!bestPool) {
      log.warn(`No pool found for ${tokenAddress} on ${chainConfig.displayName}`);
      return null;
    }

    log.info(`Best pool found on ${bestPool.dexName}: ${bestPool.address}`);

    // Calculate price based on pool type
    const price = await this.calculatePrice(
      tokenAddress,
      bestPool,
      tokenInfo.decimals,
      chainConfig,
      provider
    );

    if (price === null) {
      return null;
    }

    return {
      token: tokenAddress,
      priceUSD: price.priceUSD,
      source: "dex",
      metadata: {
        name: tokenInfo.name,
        symbol: tokenInfo.symbol,
        chain: chainConfig.name,
        chainId: chainConfig.chainId,
        address: tokenAddress,
        poolAddress: bestPool.address,
        quoteAsset: `${price.quoteSymbol} via ${bestPool.dexName}`,
        liquidity: Number(bestPool.liquidity),
        lastUpdated: Date.now(),
      },
      cached: false,
    };
  }

  private async getTokenInfo(
    tokenAddress: string,
    provider: JsonRpcProvider
  ): Promise<{ symbol: string; name: string; decimals: number } | null> {
    try {
      const token = new Contract(tokenAddress, ERC20_ABI, provider);
      const [symbol, name, decimals] = await Promise.all([
        token.symbol(),
        token.name(),
        token.decimals(),
      ]);
      return { symbol, name, decimals: Number(decimals) };
    } catch {
      return null;
    }
  }

  private async findBestPoolAcrossDexes(
    tokenAddress: string,
    chainConfig: ChainConfig,
    provider: JsonRpcProvider
  ): Promise<PoolData | null> {
    const quoteAssets = [...chainConfig.stablecoins, chainConfig.wrappedNative];

    let bestPool: PoolData | null = null;
    let bestLiquidity = BigInt(0);

    // Search all DEXes in parallel for efficiency
    const dexSearchPromises = chainConfig.dexes.map(async (dex) => {
      try {
        const pool = await this.findBestPoolOnDex(
          tokenAddress,
          quoteAssets,
          dex,
          provider
        );
        return pool;
      } catch (error) {
        log.debug(`Error searching ${dex.name}:`, error);
        return null;
      }
    });

    const results = await Promise.all(dexSearchPromises);

    for (const pool of results) {
      if (pool && pool.liquidity > bestLiquidity) {
        bestLiquidity = pool.liquidity;
        bestPool = pool;
      }
    }

    return bestPool;
  }

  private async findBestPoolOnDex(
    tokenAddress: string,
    quoteAssets: string[],
    dex: DexConfig,
    provider: JsonRpcProvider
  ): Promise<PoolData | null> {
    switch (dex.type) {
      case "uniswap_v4":
        return uniswapV4Adapter.findBestPool(tokenAddress, quoteAssets, dex, provider);
      case "uniswap_v3":
        return uniswapV3Adapter.findBestPool(tokenAddress, quoteAssets, dex, provider);
      case "uniswap_v2":
        return uniswapV2Adapter.findBestPool(tokenAddress, quoteAssets, dex, provider);
      case "algebra":
        return algebraAdapter.findBestPool(tokenAddress, quoteAssets, dex, provider);
      case "solidly":
        return solidlyAdapter.findBestPool(tokenAddress, quoteAssets, dex, provider);
      case "traderjoe_lb":
        return traderJoeLBAdapter.findBestPool(tokenAddress, quoteAssets, dex, provider);
      default:
        log.warn(`Unknown DEX type: ${dex.type}`);
        return null;
    }
  }

  private async calculatePrice(
    tokenAddress: string,
    pool: PoolData,
    tokenDecimals: number,
    chainConfig: ChainConfig,
    provider: JsonRpcProvider
  ): Promise<{ priceUSD: number; quoteSymbol: string } | null> {
    const normalizedToken = tokenAddress.toLowerCase();
    const isToken0 = pool.token0 === normalizedToken;
    const quoteTokenAddress = isToken0 ? pool.token1 : pool.token0;

    // Get quote token info
    const quoteInfo = await this.getTokenInfo(quoteTokenAddress, provider);
    if (!quoteInfo) {
      return null;
    }

    // Calculate price using appropriate adapter
    let price: number;
    switch (pool.dexType) {
      case "uniswap_v4":
        price = uniswapV4Adapter.calculatePrice(pool, isToken0, tokenDecimals, quoteInfo.decimals);
        break;
      case "uniswap_v3":
        price = uniswapV3Adapter.calculatePrice(pool, isToken0, tokenDecimals, quoteInfo.decimals);
        break;
      case "uniswap_v2":
        price = uniswapV2Adapter.calculatePrice(pool, isToken0, tokenDecimals, quoteInfo.decimals);
        break;
      case "algebra":
        price = algebraAdapter.calculatePrice(pool, isToken0, tokenDecimals, quoteInfo.decimals);
        break;
      case "solidly":
        price = solidlyAdapter.calculatePrice(pool, isToken0, tokenDecimals, quoteInfo.decimals);
        break;
      case "traderjoe_lb":
        price = traderJoeLBAdapter.calculatePrice(pool, isToken0, tokenDecimals, quoteInfo.decimals);
        break;
      default:
        return null;
    }

    if (price === 0) {
      return null;
    }

    // Check if quote token is a stablecoin (already USD)
    const isStablecoin = chainConfig.stablecoins.some(
      (s) => s.toLowerCase() === quoteTokenAddress
    );

    if (isStablecoin) {
      return { priceUSD: price, quoteSymbol: quoteInfo.symbol };
    }

    // Quote token is wrapped native - convert to USD
    const nativePrice = await this.getNativePrice(chainConfig);
    if (nativePrice === 0) {
      log.warn(`Could not get native token price for ${chainConfig.displayName}`);
      return null;
    }

    return {
      priceUSD: price * nativePrice,
      quoteSymbol: `${quoteInfo.symbol} (${nativePrice.toFixed(2)} USD)`,
    };
  }

  private async getNativePrice(chainConfig: ChainConfig): Promise<number> {
    const nativeTokenMap: Record<string, string> = {
      ETH: "ethereum",
      BNB: "binancecoin",
      MATIC: "matic-network",
      AVAX: "avalanche-2",
    };

    const coingeckoId = nativeTokenMap[chainConfig.nativeCurrency.symbol];
    if (!coingeckoId) {
      return 0;
    }

    return coinGeckoProvider.getCurrentPrice(coingeckoId);
  }
}

export default new EVMDexProvider();
