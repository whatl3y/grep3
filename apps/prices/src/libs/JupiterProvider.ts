import config from "../config";
import log from "../logger";
import { PriceData, PriceProvider } from "../types";

// Jupiter Price API response
interface JupiterPriceResponse {
  data: {
    [mint: string]: {
      id: string;
      type: string;
      price: string;
    };
  };
  timeTaken: number;
}

// Jupiter token info response
interface JupiterTokenInfo {
  address: string;
  chainId: number;
  decimals: number;
  name: string;
  symbol: string;
  logoURI?: string;
}

// Exponential backoff configuration
const BACKOFF_CONFIG = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
};

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithBackoff(
  url: string,
  headers: Record<string, string>,
  config = BACKOFF_CONFIG
): Promise<Response> {
  let lastError: Error | null = null;
  let delay = config.initialDelayMs;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      const response = await fetch(url, { headers });

      // If rate limited, apply backoff and retry
      if (response.status === 429) {
        if (attempt === config.maxRetries) {
          throw new Error("Rate limited after max retries");
        }

        // Check for Retry-After header
        const retryAfter = response.headers.get("Retry-After");
        const waitTime = retryAfter ? parseInt(retryAfter, 10) * 1000 : delay;

        log.warn(`Jupiter rate limit hit, retrying in ${waitTime}ms (attempt ${attempt + 1}/${config.maxRetries})`);
        await sleep(Math.min(waitTime, config.maxDelayMs));
        delay = Math.min(delay * config.backoffMultiplier, config.maxDelayMs);
        continue;
      }

      return response;
    } catch (error) {
      lastError = error as Error;

      if (attempt === config.maxRetries) {
        break;
      }

      log.warn(`Jupiter request failed, retrying in ${delay}ms (attempt ${attempt + 1}/${config.maxRetries}): ${lastError.message}`);
      await sleep(delay);
      delay = Math.min(delay * config.backoffMultiplier, config.maxDelayMs);
    }
  }

  throw lastError || new Error("Request failed after max retries");
}

// Well-known Solana token mints
const KNOWN_TOKENS: Record<string, { symbol: string; name: string; decimals: number }> = {
  So11111111111111111111111111111111111111112: { symbol: "SOL", name: "Wrapped SOL", decimals: 9 },
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: { symbol: "USDC", name: "USD Coin", decimals: 6 },
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: { symbol: "USDT", name: "Tether USD", decimals: 6 },
  mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So: { symbol: "mSOL", name: "Marinade Staked SOL", decimals: 9 },
  "7dHbWXmci3dT8UFYWYZweBLXgycu7Y3iL6trKn1Y7ARj": { symbol: "stSOL", name: "Lido Staked SOL", decimals: 9 },
  DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263: { symbol: "BONK", name: "Bonk", decimals: 5 },
  EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm: { symbol: "WIF", name: "dogwifhat", decimals: 6 },
  JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN: { symbol: "JUP", name: "Jupiter", decimals: 6 },
  jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL: { symbol: "JTO", name: "Jito", decimals: 9 },
  HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3: { symbol: "PYTH", name: "Pyth Network", decimals: 6 },
  rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof: { symbol: "RENDER", name: "Render Token", decimals: 8 },
  hntyVP6YFm1Hg25TN9WGLqM12b8TQmcknKrdu1oxWux: { symbol: "HNT", name: "Helium", decimals: 8 },
  "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr": { symbol: "POPCAT", name: "Popcat", decimals: 9 },
};

export class JupiterProvider implements PriceProvider {
  name = "jupiter";
  private priceUrl: string;
  private cache: Map<string, { data: PriceData; timestamp: number }> = new Map();
  private cacheTtl = 30 * 1000; // 30 seconds (Jupiter prices are more real-time)

  constructor() {
    this.priceUrl = config.jupiter.priceUrl;
  }

  isEnabled(): boolean {
    return config.jupiter.enabled;
  }

  async getPrice(tokenMint: string): Promise<PriceData | null> {
    // Check cache first
    const cached = this.cache.get(tokenMint);
    if (cached && Date.now() - cached.timestamp < this.cacheTtl) {
      log.info(`Jupiter cache hit for ${tokenMint}`);
      return { ...cached.data, cached: true };
    }

    try {
      // Use Jupiter Price API v2
      const url = `${this.priceUrl}?ids=${tokenMint}&showExtraInfo=true`;

      const headers: Record<string, string> = {
        Accept: "application/json",
      };

      // Jupiter API requires an API key as of Jan 2026
      if (config.jupiter.apiKey) {
        headers["x-api-key"] = config.jupiter.apiKey;
      }

      const response = await fetchWithBackoff(url, headers);

      // 404 means token not found on Jupiter - not an error, just return null
      if (response.status === 404) {
        log.info(`Token ${tokenMint} not indexed by Jupiter`);
        return null;
      }

      if (!response.ok) {
        throw new Error(`Jupiter API error: ${response.status}`);
      }

      const data: JupiterPriceResponse = await response.json();

      const priceInfo = data.data[tokenMint];
      if (!priceInfo) {
        log.warn(`Token ${tokenMint} not found on Jupiter`);
        return null;
      }

      const price = parseFloat(priceInfo.price);
      if (isNaN(price) || price === 0) {
        log.warn(`Invalid price for ${tokenMint}: ${priceInfo.price}`);
        return null;
      }

      // Get token info
      const tokenInfo = await this.getTokenInfo(tokenMint);

      const priceData: PriceData = {
        token: tokenMint,
        priceUSD: price,
        source: "jupiter",
        metadata: {
          name: tokenInfo?.name,
          symbol: tokenInfo?.symbol,
          chain: "solana",
          address: tokenMint,
          lastUpdated: Date.now(),
        },
        cached: false,
      };

      this.cache.set(tokenMint, { data: priceData, timestamp: Date.now() });
      return priceData;
    } catch (error) {
      log.error(`Jupiter fetch error for ${tokenMint}:`, error);
      // Return stale cache if available
      if (cached) {
        log.warn("Returning stale cached data");
        return { ...cached.data, cached: true };
      }
      return null;
    }
  }

  private async getTokenInfo(
    tokenMint: string
  ): Promise<{ symbol: string; name: string; decimals: number } | null> {
    // Check known tokens first
    const known = KNOWN_TOKENS[tokenMint];
    if (known) {
      return known;
    }

    // Try Jupiter token list API
    try {
      const url = `https://tokens.jup.ag/token/${tokenMint}`;
      const headers: Record<string, string> = { Accept: "application/json" };
      if (config.jupiter.apiKey) {
        headers["x-api-key"] = config.jupiter.apiKey;
      }
      const response = await fetchWithBackoff(url, headers);

      if (!response.ok) {
        return null;
      }

      const data: JupiterTokenInfo = await response.json();
      return {
        symbol: data.symbol,
        name: data.name,
        decimals: data.decimals,
      };
    } catch {
      return null;
    }
  }
}

export default new JupiterProvider();
