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

      return {
        success: true,
        data: result,
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
