import config from "../config";
import log from "../logger";
import { PriceData, PriceProvider } from "../types";

interface CMCQuoteResponse {
  status: {
    error_code: number;
    error_message: string | null;
  };
  data: {
    [symbol: string]: Array<{
      id: number;
      name: string;
      symbol: string;
      quote: {
        USD: {
          price: number;
          market_cap: number;
          volume_24h: number;
        };
      };
    }>;
  };
}

export class CoinMarketCapProvider implements PriceProvider {
  name = "coinmarketcap";
  private baseUrl: string;
  private apiKey?: string;
  private cache: Map<string, { data: PriceData; timestamp: number }> = new Map();
  private cacheTtl = 5 * 60 * 1000; // 5 minutes

  constructor() {
    this.baseUrl = config.coinmarketcap.baseUrl;
    this.apiKey = config.coinmarketcap.apiKey;
  }

  isEnabled(): boolean {
    return config.coinmarketcap.enabled && !!this.apiKey;
  }

  async getPrice(token: string): Promise<PriceData | null> {
    if (!this.apiKey) {
      log.warn("CoinMarketCap API key not configured");
      return null;
    }

    const normalizedToken = token.toUpperCase();

    // Check cache first
    const cached = this.cache.get(normalizedToken);
    if (cached && Date.now() - cached.timestamp < this.cacheTtl) {
      log.info(`CoinMarketCap cache hit for ${token}`);
      return { ...cached.data, cached: true };
    }

    try {
      const url = `${this.baseUrl}/cryptocurrency/quotes/latest?symbol=${normalizedToken}&convert=USD`;

      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "X-CMC_PRO_API_KEY": this.apiKey,
        },
      });

      if (!response.ok) {
        if (response.status === 429) {
          log.warn("CoinMarketCap rate limit hit");
          throw new Error("Rate limited");
        }
        throw new Error(`CoinMarketCap API error: ${response.status}`);
      }

      const data: CMCQuoteResponse = await response.json();

      if (data.status.error_code !== 0) {
        log.warn(`CoinMarketCap error: ${data.status.error_message}`);
        return null;
      }

      const tokenData = data.data[normalizedToken];
      if (!tokenData || tokenData.length === 0) {
        log.warn(`Token ${normalizedToken} not found on CoinMarketCap`);
        return null;
      }

      // Take the first result (highest market cap if multiple)
      const coin = tokenData[0];

      const priceData: PriceData = {
        token: coin.symbol,
        priceUSD: coin.quote.USD.price,
        source: "coinmarketcap",
        metadata: {
          name: coin.name,
          symbol: coin.symbol,
          lastUpdated: Date.now(),
        },
        cached: false,
      };

      this.cache.set(normalizedToken, { data: priceData, timestamp: Date.now() });
      return priceData;
    } catch (error) {
      log.error(`CoinMarketCap fetch error for ${token}:`, error);
      // Return stale cache if available
      if (cached) {
        log.warn("Returning stale cached data");
        return { ...cached.data, cached: true };
      }
      return null;
    }
  }
}

export default new CoinMarketCapProvider();
