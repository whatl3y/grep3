import config from "../config";
import log from "../logger";
import { getRedis } from "../redis";
import { PriceResponse, PriceData } from "../types";
import { identifyTokenInput } from "./AddressValidator";
import coinGeckoProvider from "./CoinGeckoProvider";
import coinMarketCapProvider from "./CoinMarketCapProvider";
import jupiterProvider from "./JupiterProvider";
import pumpFunProvider from "./PumpFunProvider";
import dexScreenerProvider from "./DexScreenerProvider";
import evmDexProvider from "./EVMDexProvider";

// Canonical on-chain addresses for major tickers, used ONLY as a last-resort
// fallback in getSymbolPrice when the symbol price APIs (CoinGecko / CMC) are
// both unavailable. Resolving to a known address lets us reuse the reliable,
// auth-free address path (DexScreener / on-chain DEX) instead of unreliable
// ticker search. We do NOT use DexScreener's raw symbol search here: tickers
// are not unique on-chain, and the highest-liquidity match for a bare ticker is
// frequently a scam token (a Solana "ETH"/"Ethereumdog Coin" reports ~$3.9k),
// which would return a confidently-wrong price.
const SYMBOL_TO_ADDRESS: Record<string, { address: string; type: "evm" | "solana" }> = {
  eth: { address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", type: "evm" }, // WETH
  weth: { address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", type: "evm" },
  btc: { address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", type: "evm" }, // WBTC
  wbtc: { address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", type: "evm" },
  bnb: { address: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", type: "evm" }, // WBNB (BSC)
  wbnb: { address: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", type: "evm" },
  matic: { address: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270", type: "evm" }, // WMATIC (Polygon)
  pol: { address: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270", type: "evm" },
  avax: { address: "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7", type: "evm" }, // WAVAX (Avalanche)
  wavax: { address: "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7", type: "evm" },
  usdc: { address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", type: "evm" },
  usdt: { address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", type: "evm" },
  dai: { address: "0x6B175474E89094C44Da98b954EedeAC495271d0F", type: "evm" },
  link: { address: "0x514910771AF9Ca656af840dff83E8264EcF986CA", type: "evm" },
  uni: { address: "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984", type: "evm" },
  aave: { address: "0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9", type: "evm" },
  sol: { address: "So11111111111111111111111111111111111111112", type: "solana" }, // wSOL
  wsol: { address: "So11111111111111111111111111111111111111112", type: "solana" },
  bonk: { address: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", type: "solana" },
  wif: { address: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm", type: "solana" },
  jup: { address: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN", type: "solana" },
};

export class PriceService {
  private redis = getRedis();
  private cacheTtl = config.cache.ttlSeconds;

  async getPrice(token: string): Promise<PriceResponse> {
    const startTime = Date.now();

    try {
      // Check Redis cache first
      if (this.redis && config.cache.enabled) {
        const cacheKey = `price:${token.toLowerCase()}`;
        const cached = await this.redis.get(cacheKey);
        if (cached) {
          log.info(`Redis cache hit for ${token}`);
          const data = JSON.parse(cached) as PriceData;
          // Calculate nextUpdateAt based on when it was cached + TTL
          const nextUpdateAt = data.metadata.lastUpdated + this.cacheTtl * 1000;
          return {
            success: true,
            data: {
              ...data,
              cached: true,
              metadata: {
                ...data.metadata,
                nextUpdateAt,
              },
            },
          };
        }
      }

      // Identify input type
      const inputType = identifyTokenInput(token);
      log.info(`Token ${token} identified as ${inputType}`);

      let result: PriceData | null = null;

      switch (inputType) {
        case "symbol":
          result = await this.getSymbolPrice(token);
          break;
        case "solana_address":
          result = await this.getSolanaPrice(token);
          break;
        case "evm_address":
          result = await this.getEvmPrice(token);
          break;
      }

      if (!result) {
        return {
          success: false,
          error: `Could not find price for ${token}`,
        };
      }

      // Cache in Redis
      if (this.redis && config.cache.enabled) {
        const cacheKey = `price:${token.toLowerCase()}`;
        await this.redis.setex(cacheKey, this.cacheTtl, JSON.stringify(result));
        log.info(`Cached price for ${token} in Redis`);
      }

      log.info(`Price lookup for ${token} completed in ${Date.now() - startTime}ms`);

      // Add nextUpdateAt to fresh responses
      const nextUpdateAt = result.metadata.lastUpdated + this.cacheTtl * 1000;

      return {
        success: true,
        data: {
          ...result,
          metadata: {
            ...result.metadata,
            nextUpdateAt,
          },
        },
      };
    } catch (error: any) {
      log.error(`Price lookup error for ${token}:`, error);
      return {
        success: false,
        error: error.message || "Internal error",
      };
    }
  }

  private async getSymbolPrice(symbol: string): Promise<PriceData | null> {
    // Try CoinGecko first
    if (coinGeckoProvider.isEnabled()) {
      log.info(`Trying CoinGecko for ${symbol}`);
      const result = await coinGeckoProvider.getPrice(symbol);
      if (result) {
        return result;
      }
    }

    // Fallback to CoinMarketCap
    if (coinMarketCapProvider.isEnabled()) {
      log.info(`Trying CoinMarketCap for ${symbol}`);
      const result = await coinMarketCapProvider.getPrice(symbol);
      if (result) {
        return result;
      }
    }

    // Final fallback: resolve a well-known ticker to its canonical on-chain
    // address and price it via the auth-free address path. This keeps majors
    // (eth, btc, sol, ...) resolving even when CoinGecko AND CoinMarketCap are
    // both down — the exact failure mode that took every symbol offline when
    // the CoinGecko Pro key lapsed. See SYMBOL_TO_ADDRESS for why we avoid
    // DexScreener's ticker search.
    const known = SYMBOL_TO_ADDRESS[symbol.toLowerCase()];
    if (known) {
      log.info(`Trying address fallback for symbol ${symbol} via ${known.address}`);
      const fallback =
        known.type === "solana"
          ? await this.getSolanaPrice(known.address)
          : await this.getEvmPrice(known.address);
      if (fallback) {
        // Price comes from the wrapped/canonical token; relabel the top-level
        // token to the requested ticker to match CoinGecko's response shape.
        return { ...fallback, token: symbol.toUpperCase() };
      }
    }

    return null;
  }

  private async getSolanaPrice(tokenMint: string): Promise<PriceData | null> {
    // Try Jupiter first (best for established tokens)
    if (jupiterProvider.isEnabled()) {
      log.info(`Trying Jupiter for Solana token ${tokenMint}`);
      const jupiterResult = await jupiterProvider.getPrice(tokenMint);
      if (jupiterResult) {
        return jupiterResult;
      }
    }

    // Fallback to PumpFun (for pump.fun launched tokens)
    log.info(`Trying PumpFun for Solana token ${tokenMint}`);
    const pumpFunResult = await pumpFunProvider.getPrice(tokenMint);
    if (pumpFunResult) {
      return pumpFunResult;
    }

    // Fallback to DexScreener (aggregates Raydium, Orca, Meteora, etc.)
    log.info(`Trying DexScreener for Solana token ${tokenMint}`);
    const dexScreenerResult = await dexScreenerProvider.getPrice(tokenMint);
    if (dexScreenerResult) {
      return dexScreenerResult;
    }

    return null;
  }

  private async getEvmPrice(
    tokenAddress: string,
    chainId?: number
  ): Promise<PriceData | null> {
    // First, check if this token address is known to CoinGecko
    // This can provide faster/more reliable prices for major tokens
    if (coinGeckoProvider.isEnabled()) {
      log.info(`Checking CoinGecko for EVM address ${tokenAddress}`);
      const cgResult = await coinGeckoProvider.getPrice(tokenAddress);
      if (cgResult) {
        return cgResult;
      }
    }

    // Try DexScreener API - fastest and most reliable for DEX prices
    // Aggregates data from all major DEXs across chains
    log.info(`Trying DexScreener for ${tokenAddress}`);
    const dexScreenerResult = await dexScreenerProvider.getPrice(tokenAddress, chainId);
    if (dexScreenerResult) {
      return dexScreenerResult;
    }

    // Fall back to on-chain DEX price discovery (slower, but works for newer tokens)
    log.info(`Falling back to on-chain DEX lookup for ${tokenAddress}`);
    return evmDexProvider.getPrice(tokenAddress, chainId);
  }
}

export default new PriceService();
