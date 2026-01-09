import log from "../logger";
import { PriceData, PriceProvider } from "../types";

// DexScreener chain IDs (number for EVM, string for non-EVM)
const CHAIN_MAP: Record<number | string, string> = {
  1: "ethereum",
  8453: "base",
  56: "bsc",
  42161: "arbitrum",
  43114: "avalanche",
  137: "polygon",
  solana: "solana",
};

// Solana first since we use DexScreener as fallback for Solana tokens
const CHAIN_PRIORITY = ["solana", "ethereum", "base", "bsc", "arbitrum", "avalanche", "polygon"];

interface DexScreenerPair {
  chainId: string;
  dexId: string;
  url: string;
  pairAddress: string;
  baseToken: {
    address: string;
    name: string;
    symbol: string;
  };
  quoteToken: {
    address: string;
    name: string;
    symbol: string;
  };
  priceNative: string;
  priceUsd: string;
  liquidity?: {
    usd: number;
    base: number;
    quote: number;
  };
  fdv?: number;
  marketCap?: number;
  volume?: {
    h24: number;
    h6: number;
    h1: number;
    m5: number;
  };
}

interface DexScreenerResponse {
  schemaVersion: string;
  pairs: DexScreenerPair[] | null;
}

/**
 * DexScreener API provider - aggregates prices from all major DEXs
 * Much faster and more reliable than on-chain queries
 */
export class DexScreenerProvider implements PriceProvider {
  name = "dexscreener";
  private baseUrl = "https://api.dexscreener.com/latest/dex";
  private cache: Map<string, { data: PriceData; timestamp: number }> = new Map();
  private cacheTtl = 30 * 1000; // 30 seconds

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
      log.debug(`DexScreener cache hit for ${tokenAddress}`);
      return { ...cached.data, cached: true };
    }

    try {
      // If specific chain requested, search only that chain
      if (specificChainId) {
        const chainName = CHAIN_MAP[specificChainId];
        if (!chainName) {
          return null;
        }
        return this.searchOnChain(normalizedAddress, chainName, cacheKey);
      }

      // Search across all chains - DexScreener handles this in one call
      const result = await this.searchAllChains(normalizedAddress, cacheKey);
      return result;
    } catch (error) {
      log.error("DexScreener API error:", error);

      // Return stale cache if available
      if (cached) {
        log.warn("Returning stale DexScreener cached data");
        return { ...cached.data, cached: true };
      }

      return null;
    }
  }

  private async searchAllChains(
    tokenAddress: string,
    cacheKey: string
  ): Promise<PriceData | null> {
    const url = `${this.baseUrl}/tokens/${tokenAddress}`;

    log.info(`DexScreener: searching for ${tokenAddress}`);

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`DexScreener API returned ${response.status}`);
    }

    const data: DexScreenerResponse = await response.json();

    if (!data.pairs || data.pairs.length === 0) {
      return null;
    }

    // Find the best pair (highest liquidity) with valid USD price
    const bestPair = this.findBestPair(data.pairs);

    if (!bestPair || !bestPair.priceUsd) {
      return null;
    }

    const result = this.formatResult(bestPair);
    this.cache.set(cacheKey, { data: result, timestamp: Date.now() });

    return result;
  }

  private async searchOnChain(
    tokenAddress: string,
    chainName: string,
    cacheKey: string
  ): Promise<PriceData | null> {
    // DexScreener supports chain-specific search
    const url = `${this.baseUrl}/tokens/${chainName}/${tokenAddress}`;

    log.info(`DexScreener: searching for ${tokenAddress} on ${chainName}`);

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`DexScreener API returned ${response.status}`);
    }

    const data: DexScreenerResponse = await response.json();

    if (!data.pairs || data.pairs.length === 0) {
      return null;
    }

    const bestPair = this.findBestPair(data.pairs);

    if (!bestPair || !bestPair.priceUsd) {
      return null;
    }

    const result = this.formatResult(bestPair);
    this.cache.set(cacheKey, { data: result, timestamp: Date.now() });

    return result;
  }

  private findBestPair(pairs: DexScreenerPair[]): DexScreenerPair | null {
    // Filter to only pairs with USD price and sort by liquidity
    const validPairs = pairs
      .filter((p) => p.priceUsd && parseFloat(p.priceUsd) > 0)
      .sort((a, b) => {
        // Prefer pairs by chain priority first
        const aChainIdx = CHAIN_PRIORITY.indexOf(a.chainId);
        const bChainIdx = CHAIN_PRIORITY.indexOf(b.chainId);

        // If same chain priority, sort by liquidity
        if (aChainIdx === bChainIdx) {
          const aLiq = a.liquidity?.usd || 0;
          const bLiq = b.liquidity?.usd || 0;
          return bLiq - aLiq;
        }

        // Prefer earlier chains in priority
        const aIdx = aChainIdx === -1 ? 999 : aChainIdx;
        const bIdx = bChainIdx === -1 ? 999 : bChainIdx;
        return aIdx - bIdx;
      });

    // Return the best pair (first after sorting)
    return validPairs[0] || null;
  }

  private formatResult(pair: DexScreenerPair): PriceData {
    const chainIdNum = Object.entries(CHAIN_MAP).find(
      ([, name]) => name === pair.chainId
    )?.[0];

    return {
      token: pair.baseToken.address,
      priceUSD: parseFloat(pair.priceUsd),
      source: "dex",
      metadata: {
        name: pair.baseToken.name,
        symbol: pair.baseToken.symbol,
        chain: pair.chainId,
        chainId: chainIdNum ? parseInt(chainIdNum) : undefined,
        address: pair.baseToken.address,
        poolAddress: pair.pairAddress,
        quoteAsset: `${pair.quoteToken.symbol} via ${pair.dexId}`,
        liquidity: pair.liquidity?.usd,
        lastUpdated: Date.now(),
      },
      cached: false,
    };
  }

  /**
   * Search by token symbol instead of address (useful for popular tokens)
   */
  async searchBySymbol(symbol: string): Promise<PriceData | null> {
    const cacheKey = `symbol:${symbol.toLowerCase()}`;

    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTtl) {
      return { ...cached.data, cached: true };
    }

    try {
      const url = `${this.baseUrl}/search?q=${encodeURIComponent(symbol)}`;

      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        return null;
      }

      const data: { pairs: DexScreenerPair[] | null } = await response.json();

      if (!data.pairs || data.pairs.length === 0) {
        return null;
      }

      // Filter to exact symbol matches and find best pair
      const exactMatches = data.pairs.filter(
        (p) => p.baseToken.symbol.toUpperCase() === symbol.toUpperCase()
      );

      const bestPair = this.findBestPair(exactMatches.length > 0 ? exactMatches : data.pairs);

      if (!bestPair || !bestPair.priceUsd) {
        return null;
      }

      const result = this.formatResult(bestPair);
      this.cache.set(cacheKey, { data: result, timestamp: Date.now() });

      return result;
    } catch (error) {
      log.error("DexScreener search error:", error);
      return null;
    }
  }
}

export default new DexScreenerProvider();
