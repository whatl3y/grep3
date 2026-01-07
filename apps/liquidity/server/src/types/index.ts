export interface TickData {
  tick: number;
  tickIdx: number;
  liquidityNet: string;
  liquidityGross: string;
  price0: string;
  price1: string;
  liquidityUSD: number;
}

export interface PoolInfo {
  address: string;
  token0: TokenInfo;
  token1: TokenInfo;
  fee: number;
  tickSpacing: number;
  liquidity: string;
  sqrtPriceX96: string;
  tick: number;
  currentPrice: string;
  currentPriceInverted: string;
  version: "v3" | "v4";
  // Chain information
  chainId?: number;
  chainName?: string;
}

export interface TokenInfo {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
}

export interface OHLCData {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface PriceDisplayInfo {
  // The volatile asset (e.g., UNI, LINK)
  baseToken: {
    address: string;
    symbol: string;
  };
  // The stable/quote asset (e.g., USDC, or WETH when no stablecoin)
  quoteToken: {
    address: string;
    symbol: string;
    isStable: boolean;  // true if USD stablecoin (USDC, USDT, etc.)
    isEth: boolean;     // true if WETH/ETH (acting as quote when no stablecoin)
  };
  // Current price of baseToken in USD (always USD, even for ETH-quoted pools)
  currentPriceUSD: number;
  // Historical OHLC data (in USD from CoinGecko)
  priceHistory: OHLCData[];
  // Whether we need to invert the pool price to show base/quote correctly
  isInverted: boolean;
}

export interface LiquidityDistribution {
  pool: PoolInfo;
  ticks: TickData[];
  priceRange: {
    min: string;
    max: string;
    current: string;
  };
  totalLiquidityUSD: number;
  timestamp: number;
  // Price display information for charts
  priceDisplay?: PriceDisplayInfo;
}

export interface PriceHistory {
  timestamp: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
}

export interface PoolResponse {
  success: boolean;
  data?: LiquidityDistribution;
  error?: string;
}
