import log from "../logger";
import { PriceData, PriceProvider } from "../types";

// PumpFun API response for token info
interface PumpFunTokenResponse {
  mint: string;
  name: string;
  symbol: string;
  description?: string;
  image_uri?: string;
  metadata_uri?: string;
  twitter?: string;
  telegram?: string;
  website?: string;
  bonding_curve?: string;
  associated_bonding_curve?: string;
  creator?: string;
  created_timestamp?: number;
  raydium_pool?: string;
  complete?: boolean;
  virtual_sol_reserves?: number;
  virtual_token_reserves?: number;
  total_supply?: number;
  market_cap?: number;
  usd_market_cap?: number;
}

/**
 * PumpFun API provider for Solana meme tokens
 * PumpFun is the primary launchpad for Solana meme tokens
 */
export class PumpFunProvider implements PriceProvider {
  name = "pumpfun";
  private baseUrl = "https://frontend-api.pump.fun";
  private cache: Map<string, { data: PriceData; timestamp: number }> = new Map();
  private cacheTtl = 30 * 1000; // 30 seconds

  isEnabled(): boolean {
    return true;
  }

  async getPrice(tokenMint: string): Promise<PriceData | null> {
    // Check cache first
    const cached = this.cache.get(tokenMint);
    if (cached && Date.now() - cached.timestamp < this.cacheTtl) {
      log.debug(`PumpFun cache hit for ${tokenMint}`);
      return { ...cached.data, cached: true };
    }

    try {
      const url = `${this.baseUrl}/coins/${tokenMint}`;

      log.info(`PumpFun: fetching price for ${tokenMint}`);

      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "grep3-prices/1.0",
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          log.debug(`Token ${tokenMint} not found on PumpFun`);
          return null;
        }
        throw new Error(`PumpFun API returned ${response.status}`);
      }

      const data: PumpFunTokenResponse = await response.json();

      // Calculate price from market cap or bonding curve
      let priceUSD = 0;

      if (data.usd_market_cap && data.total_supply) {
        // Calculate price from market cap
        priceUSD = data.usd_market_cap / data.total_supply;
      } else if (data.virtual_sol_reserves && data.virtual_token_reserves) {
        // Calculate from bonding curve reserves
        // Need SOL price for this - skip for now, use market cap approach
        log.debug(`Token ${tokenMint} only has bonding curve data`);
      }

      if (priceUSD <= 0) {
        log.debug(`Could not calculate price for ${tokenMint} from PumpFun`);
        return null;
      }

      const result: PriceData = {
        token: tokenMint,
        priceUSD,
        source: "dex",
        metadata: {
          name: data.name,
          symbol: data.symbol,
          chain: "solana",
          address: tokenMint,
          poolAddress: data.raydium_pool || data.bonding_curve,
          quoteAsset: data.raydium_pool ? "SOL via Raydium" : "SOL via PumpFun Bonding Curve",
          liquidity: data.usd_market_cap,
          lastUpdated: Date.now(),
        },
        cached: false,
      };

      this.cache.set(tokenMint, { data: result, timestamp: Date.now() });
      return result;
    } catch (error) {
      log.error(`PumpFun API error for ${tokenMint}:`, error);

      // Return stale cache if available
      if (cached) {
        log.warn("Returning stale PumpFun cached data");
        return { ...cached.data, cached: true };
      }

      return null;
    }
  }
}

export default new PumpFunProvider();
