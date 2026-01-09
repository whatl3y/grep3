export type TokenInputType = "symbol" | "evm_address" | "solana_address";

export type PriceSource = "coingecko" | "coinmarketcap" | "jupiter" | "dex";

export interface PriceMetadata {
  name?: string;
  symbol?: string;
  chain?: string;
  chainId?: number;
  address?: string;
  poolAddress?: string;
  quoteAsset?: string;
  liquidity?: number;
  lastUpdated: number;
  nextUpdateAt?: number;
}

export interface PriceData {
  token: string;
  priceUSD: number;
  source: PriceSource;
  metadata: PriceMetadata;
  cached: boolean;
}

export interface PriceResponse {
  success: boolean;
  data?: PriceData;
  error?: string;
}

export interface PriceProvider {
  name: string;
  isEnabled(): boolean;
  getPrice(token: string): Promise<PriceData | null>;
}

export interface TokenInfo {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
}

export interface PoolInfo {
  address: string;
  token0: TokenInfo;
  token1: TokenInfo;
  fee: number;
  liquidity: bigint;
  sqrtPriceX96: bigint;
}
