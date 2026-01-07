import log from "../logger";

// Map common token addresses to CoinGecko IDs
const TOKEN_TO_COINGECKO: Record<string, string> = {
  // Ethereum mainnet
  "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2": "ethereum", // WETH
  "0x0000000000000000000000000000000000000000": "ethereum", // Native ETH
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": "usd-coin", // USDC
  "0xdac17f958d2ee523a2206206994597c13d831ec7": "tether", // USDT
  "0x6b175474e89094c44da98b954eedeac495271d0f": "dai", // DAI
  "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599": "wrapped-bitcoin", // WBTC
  "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984": "uniswap", // UNI
  "0x514910771af9ca656af840dff83e8264ecf986ca": "chainlink", // LINK
  "0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9": "aave", // AAVE
  "0xc00e94cb662c3520282e6f5717214004a7f26888": "compound-governance-token", // COMP
  "0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2": "maker", // MKR
  "0xae7ab96520de3a18e5e111b5eaab095312d7fe84": "lido-staked-ether", // stETH
  "0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0": "wrapped-steth", // wstETH
  "0xbe9895146f7af43049ca1c1ae358b0541ea49704": "coinbase-wrapped-staked-eth", // cbETH
  "0xae78736cd615f374d3085123a210448e74fc6393": "rocket-pool-eth", // rETH
  "0x4d224452801aced8b2f0aebe155379bb5d594381": "apecoin", // APE
  "0x95ad61b0a150d79219dcf64e1e6cc01f0b64c4ce": "shiba-inu", // SHIB
  "0xe0f63a424a4439cbe457d80e4f4b51ad25b2c56c": "spx6900", // SPX
};

// USD Stablecoins - highest priority quote assets
const USD_STABLECOINS = new Set([
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", // USDC
  "0xdac17f958d2ee523a2206206994597c13d831ec7", // USDT
  "0x6b175474e89094c44da98b954eedeac495271d0f", // DAI
  "0x853d955acef822db058eb8505911ed77f175b99e", // FRAX
  "0x4fabb145d64652a948d72533023f6e7a623c7c53", // BUSD
  "0x8e870d67f660d95d5be530380d0ec0bd388289e1", // USDP
  "0x0000000000085d4780b73119b644ae5ecd22b376", // TUSD
  "0x5f98805a4e8be255a32880fdec7f6728c6568ba0", // LUSD
]);

// ETH-based tokens - act as "stable" quote when paired with non-stablecoins
// (e.g., in UNI/WETH, WETH is the quote and UNI is the volatile base)
const ETH_TOKENS = new Set([
  "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2", // WETH
  "0x0000000000000000000000000000000000000000", // Native ETH
]);

// Legacy alias for backward compatibility
const STABLECOINS = USD_STABLECOINS;

export interface OHLCData {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface PriceHistoryResult {
  prices: OHLCData[];
  baseToken: {
    address: string;
    symbol: string;
    coingeckoId: string;
  };
  quoteToken: {
    address: string;
    symbol: string;
    isStable: boolean;
  };
  currentPrice: number;
}

export class CoinGeckoService {
  private baseUrl = "https://api.coingecko.com/api/v3";
  private cache: Map<string, { data: OHLCData[]; timestamp: number }> = new Map();
  private cacheTtl = 5 * 60 * 1000; // 5 minutes

  /**
   * Determine which token is the volatile (base) asset and which is stable (quote)
   * Returns tokens in order: [volatileToken, stableToken]
   *
   * Priority for quote (stable) asset:
   * 1. USD stablecoins (USDC, USDT, DAI, etc.) - highest priority
   * 2. ETH tokens (WETH, ETH) - when paired with non-stablecoins
   * 3. Default to token1 as quote if no clear preference
   */
  getTokenOrdering(
    token0Address: string,
    token0Symbol: string,
    token1Address: string,
    token1Symbol: string
  ): {
    baseToken: { address: string; symbol: string };
    quoteToken: { address: string; symbol: string };
    isInverted: boolean;
  } {
    const token0Normalized = token0Address.toLowerCase();
    const token1Normalized = token1Address.toLowerCase();

    const token0IsUsdStable = USD_STABLECOINS.has(token0Normalized);
    const token1IsUsdStable = USD_STABLECOINS.has(token1Normalized);
    const token0IsEth = ETH_TOKENS.has(token0Normalized);
    const token1IsEth = ETH_TOKENS.has(token1Normalized);

    // Priority 1: USD stablecoins are always the quote asset
    // e.g., WETH/USDC -> WETH is base, USDC is quote (show ETH price in USD)
    if (token1IsUsdStable && !token0IsUsdStable) {
      return {
        baseToken: { address: token0Address, symbol: token0Symbol },
        quoteToken: { address: token1Address, symbol: token1Symbol },
        isInverted: false,
      };
    } else if (token0IsUsdStable && !token1IsUsdStable) {
      return {
        baseToken: { address: token1Address, symbol: token1Symbol },
        quoteToken: { address: token0Address, symbol: token0Symbol },
        isInverted: true,
      };
    }

    // Priority 2: ETH tokens act as quote when paired with non-stablecoins
    // e.g., UNI/WETH -> UNI is base, WETH is quote (show UNI price in ETH terms)
    if (token1IsEth && !token0IsEth && !token0IsUsdStable) {
      return {
        baseToken: { address: token0Address, symbol: token0Symbol },
        quoteToken: { address: token1Address, symbol: token1Symbol },
        isInverted: false,
      };
    } else if (token0IsEth && !token1IsEth && !token1IsUsdStable) {
      return {
        baseToken: { address: token1Address, symbol: token1Symbol },
        quoteToken: { address: token0Address, symbol: token0Symbol },
        isInverted: true,
      };
    }

    // Default: token0 is base, token1 is quote
    return {
      baseToken: { address: token0Address, symbol: token0Symbol },
      quoteToken: { address: token1Address, symbol: token1Symbol },
      isInverted: false,
    };
  }

  /**
   * Get CoinGecko ID for a token address
   */
  getCoingeckoId(tokenAddress: string): string | null {
    return TOKEN_TO_COINGECKO[tokenAddress.toLowerCase()] || null;
  }

  /**
   * Check if a token is a USD stablecoin
   */
  isStablecoin(tokenAddress: string): boolean {
    return USD_STABLECOINS.has(tokenAddress.toLowerCase());
  }

  /**
   * Check if a token is WETH or ETH
   */
  isEthToken(tokenAddress: string): boolean {
    return ETH_TOKENS.has(tokenAddress.toLowerCase());
  }

  /**
   * Check if a token should be treated as a quote asset (stablecoin or ETH)
   */
  isQuoteAsset(tokenAddress: string): boolean {
    const normalized = tokenAddress.toLowerCase();
    return USD_STABLECOINS.has(normalized) || ETH_TOKENS.has(normalized);
  }

  /**
   * Fetch OHLC data from CoinGecko
   * @param coingeckoId The CoinGecko ID of the token
   * @param days Number of days of history to fetch (1, 7, 14, 30, 90, 180, 365, max)
   */
  async getOHLC(coingeckoId: string, days: number = 30): Promise<OHLCData[]> {
    const cacheKey = `${coingeckoId}-${days}`;
    const cached = this.cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.cacheTtl) {
      log.info(`Cache hit for CoinGecko OHLC: ${coingeckoId}`);
      return cached.data;
    }

    try {
      const url = `${this.baseUrl}/coins/${coingeckoId}/ohlc?vs_currency=usd&days=${days}`;
      log.info(`Fetching CoinGecko OHLC: ${url}`);

      const response = await fetch(url);

      if (!response.ok) {
        if (response.status === 429) {
          log.warn("CoinGecko rate limit hit, using cached data if available");
          if (cached) return cached.data;
          throw new Error("CoinGecko rate limit exceeded");
        }
        throw new Error(`CoinGecko API error: ${response.status}`);
      }

      const data = await response.json();

      // CoinGecko returns: [[timestamp, open, high, low, close], ...]
      const ohlcData: OHLCData[] = data.map((item: number[]) => ({
        timestamp: item[0],
        open: item[1],
        high: item[2],
        low: item[3],
        close: item[4],
      }));

      this.cache.set(cacheKey, { data: ohlcData, timestamp: Date.now() });
      log.info(`Fetched ${ohlcData.length} OHLC data points for ${coingeckoId}`);

      return ohlcData;
    } catch (error: any) {
      log.error(`Failed to fetch CoinGecko data for ${coingeckoId}:`, error);

      // Return cached data if available
      if (cached) {
        log.warn("Using stale cached data");
        return cached.data;
      }

      throw error;
    }
  }

  /**
   * Get current price from CoinGecko
   */
  async getCurrentPrice(coingeckoId: string): Promise<number> {
    try {
      const url = `${this.baseUrl}/simple/price?ids=${coingeckoId}&vs_currencies=usd`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`CoinGecko API error: ${response.status}`);
      }

      const data = await response.json();
      return data[coingeckoId]?.usd || 0;
    } catch (error) {
      log.error(`Failed to fetch current price for ${coingeckoId}:`, error);
      return 0;
    }
  }

  /**
   * Get price history for a token pair
   * Returns prices normalized so stable token is the quote currency
   */
  async getPriceHistory(
    token0Address: string,
    token0Symbol: string,
    token1Address: string,
    token1Symbol: string,
    days: number = 30
  ): Promise<PriceHistoryResult | null> {
    const { baseToken, quoteToken, isInverted } = this.getTokenOrdering(
      token0Address,
      token0Symbol,
      token1Address,
      token1Symbol
    );

    const coingeckoId = this.getCoingeckoId(baseToken.address);

    if (!coingeckoId) {
      log.warn(`No CoinGecko ID found for token: ${baseToken.address} (${baseToken.symbol})`);
      return null;
    }

    try {
      const ohlcData = await this.getOHLC(coingeckoId, days);
      const currentPrice = await this.getCurrentPrice(coingeckoId);

      return {
        prices: ohlcData,
        baseToken: {
          ...baseToken,
          coingeckoId,
        },
        quoteToken: {
          ...quoteToken,
          isStable: this.isStablecoin(quoteToken.address),
        },
        currentPrice,
      };
    } catch (error) {
      log.error("Failed to get price history:", error);
      return null;
    }
  }
}

export default new CoinGeckoService();
