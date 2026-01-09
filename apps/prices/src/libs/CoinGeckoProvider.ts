import config from "../config";
import log from "../logger";
import { PriceData, PriceProvider } from "../types";

// Exponential backoff configuration
const BACKOFF_CONFIG = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000, // CoinGecko can have longer rate limit windows
  backoffMultiplier: 2,
};

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Map common symbols to CoinGecko IDs
const SYMBOL_TO_COINGECKO: Record<string, string> = {
  btc: "bitcoin",
  eth: "ethereum",
  sol: "solana",
  bnb: "binancecoin",
  xrp: "ripple",
  usdc: "usd-coin",
  usdt: "tether",
  ada: "cardano",
  avax: "avalanche-2",
  doge: "dogecoin",
  dot: "polkadot",
  matic: "matic-network",
  dai: "dai",
  shib: "shiba-inu",
  trx: "tron",
  link: "chainlink",
  atom: "cosmos",
  ltc: "litecoin",
  uni: "uniswap",
  xlm: "stellar",
  xmr: "monero",
  etc: "ethereum-classic",
  bch: "bitcoin-cash",
  apt: "aptos",
  fil: "filecoin",
  ldo: "lido-dao",
  arb: "arbitrum",
  op: "optimism",
  near: "near",
  aave: "aave",
  grt: "the-graph",
  mkr: "maker",
  qnt: "quant-network",
  snx: "havven",
  crv: "curve-dao-token",
  rpl: "rocket-pool",
  inj: "injective-protocol",
  imx: "immutable-x",
  ape: "apecoin",
  sand: "the-sandbox",
  mana: "decentraland",
  axs: "axie-infinity",
  ftm: "fantom",
  algo: "algorand",
  flow: "flow",
  egld: "elrond-erd-2",
  xtz: "tezos",
  eos: "eos",
  neo: "neo",
  kcs: "kucoin-shares",
  icp: "internet-computer",
  vet: "vechain",
  hbar: "hedera-hashgraph",
  rune: "thorchain",
  cake: "pancakeswap-token",
  fxs: "frax-share",
  pepe: "pepe",
  wbtc: "wrapped-bitcoin",
  steth: "staked-ether",
  wsteth: "wrapped-steth",
  cbeth: "coinbase-wrapped-staked-eth",
  reth: "rocket-pool-eth",
  sui: "sui",
  sei: "sei-network",
  tia: "celestia",
  jup: "jupiter-exchange-solana",
  wif: "dogwifcoin",
  bonk: "bonk",
  jto: "jito-governance-token",
  pyth: "pyth-network",
  render: "render-token",
  fet: "fetch-ai",
  ondo: "ondo-finance",
  ena: "ethena",
  pendle: "pendle",
  strk: "starknet",
  zro: "layerzero",
  eigen: "eigenlayer",
  mog: "mog-coin",
  popcat: "popcat",
  wld: "worldcoin-wld",
  blur: "blur",
  trump: "official-trump",
  melania: "melania-meme",
};

// Map token addresses to CoinGecko IDs (Ethereum mainnet)
const ADDRESS_TO_COINGECKO: Record<string, string> = {
  "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2": "ethereum", // WETH
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
};

interface CoinGeckoSimplePrice {
  [id: string]: {
    usd: number;
    usd_market_cap?: number;
    usd_24h_vol?: number;
  };
}

interface CoinGeckoCoinData {
  id: string;
  symbol: string;
  name: string;
  market_data: {
    current_price: {
      usd: number;
    };
  };
}

export class CoinGeckoProvider implements PriceProvider {
  name = "coingecko";
  private baseUrl: string;
  private apiKey?: string;
  private isPro: boolean;
  private cache: Map<string, { data: PriceData; timestamp: number }> = new Map();
  private cacheTtl = 5 * 60 * 1000; // 5 minutes

  constructor() {
    this.baseUrl = config.coingecko.baseUrl;
    this.apiKey = config.coingecko.apiKey;
    this.isPro = config.coingecko.isPro;
  }

  isEnabled(): boolean {
    return config.coingecko.enabled;
  }

  async getPrice(token: string): Promise<PriceData | null> {
    const normalizedToken = token.toLowerCase();

    // Check cache first
    const cached = this.cache.get(normalizedToken);
    if (cached && Date.now() - cached.timestamp < this.cacheTtl) {
      log.info(`CoinGecko cache hit for ${token}`);
      return { ...cached.data, cached: true };
    }

    // Try to get CoinGecko ID
    let coingeckoId: string | null = SYMBOL_TO_COINGECKO[normalizedToken] || null;

    // If not found in symbol map, check if it's an address
    if (!coingeckoId) {
      coingeckoId = ADDRESS_TO_COINGECKO[normalizedToken] || null;
    }

    // If still not found, try searching by symbol
    if (!coingeckoId) {
      coingeckoId = await this.searchCoinBySymbol(normalizedToken);
    }

    if (!coingeckoId) {
      log.warn(`CoinGecko ID not found for ${token}`);
      return null;
    }

    log.debug(`CoinGecko: resolved ${token} to ID ${coingeckoId}`);

    try {
      const priceData = await this.fetchPrice(coingeckoId);
      if (priceData) {
        this.cache.set(normalizedToken, { data: priceData, timestamp: Date.now() });
      }
      return priceData;
    } catch (error) {
      log.error(`CoinGecko fetch error for ${token}:`, error);
      // Return stale cache if available
      if (cached) {
        log.warn("Returning stale cached data");
        return { ...cached.data, cached: true };
      }
      return null;
    }
  }

  async getCurrentPrice(coingeckoId: string): Promise<number> {
    try {
      const url = `${this.baseUrl}/simple/price?ids=${coingeckoId}&vs_currencies=usd`;
      const response = await this.fetch(url);

      if (!response.ok) {
        throw new Error(`CoinGecko API error: ${response.status}`);
      }

      const data: CoinGeckoSimplePrice = await response.json();
      return data[coingeckoId]?.usd || 0;
    } catch (error) {
      log.error(`Failed to fetch current price for ${coingeckoId}:`, error);
      return 0;
    }
  }

  private async fetchPrice(coingeckoId: string): Promise<PriceData | null> {
    const url = `${this.baseUrl}/coins/${coingeckoId}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false`;

    const response = await this.fetch(url);

    if (!response.ok) {
      if (response.status === 429) {
        log.warn("CoinGecko rate limit hit");
        throw new Error("Rate limited");
      }
      // Log response body for debugging 400/404 errors
      if (response.status === 400 || response.status === 404) {
        try {
          const errorBody = await response.text();
          log.error(`CoinGecko API error for ${coingeckoId}: ${response.status} - ${errorBody}`);
        } catch {
          // Ignore if we can't read body
        }
      }
      throw new Error(`CoinGecko API error: ${response.status}`);
    }

    const data: CoinGeckoCoinData = await response.json();

    return {
      token: data.symbol.toUpperCase(),
      priceUSD: data.market_data.current_price.usd,
      source: "coingecko",
      metadata: {
        name: data.name,
        symbol: data.symbol.toUpperCase(),
        lastUpdated: Date.now(),
      },
      cached: false,
    };
  }

  private async searchCoinBySymbol(symbol: string): Promise<string | null> {
    try {
      const url = `${this.baseUrl}/search?query=${symbol}`;
      const response = await this.fetch(url);

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      const coins = data.coins || [];

      // Find exact symbol match (case-insensitive)
      const exactMatch = coins.find(
        (coin: { symbol: string }) => coin.symbol.toLowerCase() === symbol.toLowerCase()
      );

      if (exactMatch) {
        return exactMatch.id;
      }

      return null;
    } catch (error) {
      log.error(`CoinGecko search error for ${symbol}:`, error);
      return null;
    }
  }

  private async fetch(url: string): Promise<Response> {
    const headers: Record<string, string> = {
      Accept: "application/json",
    };

    if (this.apiKey) {
      // Pro API uses different header name than demo API
      const headerName = this.isPro ? "x-cg-pro-api-key" : "x-cg-demo-api-key";
      headers[headerName] = this.apiKey;
    }

    return this.fetchWithBackoff(url, headers);
  }

  private async fetchWithBackoff(
    url: string,
    headers: Record<string, string>,
    config = BACKOFF_CONFIG
  ): Promise<Response> {
    let lastError: Error | null = null;
    let delay = config.initialDelayMs;

    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
      try {
        const response = await fetch(url, { headers });

        if (response.status === 429) {
          if (attempt === config.maxRetries) {
            throw new Error("Rate limited after max retries");
          }

          // Check for Retry-After header
          const retryAfter = response.headers.get("Retry-After");
          const waitTime = retryAfter ? parseInt(retryAfter, 10) * 1000 : delay;

          log.warn(
            `CoinGecko rate limit hit, retrying in ${waitTime}ms (attempt ${attempt + 1}/${config.maxRetries})`
          );

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

        log.warn(
          `CoinGecko request failed, retrying in ${delay}ms (attempt ${attempt + 1}/${config.maxRetries}): ${lastError.message}`
        );

        await sleep(delay);
        delay = Math.min(delay * config.backoffMultiplier, config.maxDelayMs);
      }
    }

    throw lastError || new Error("Request failed after max retries");
  }
}

export default new CoinGeckoProvider();
