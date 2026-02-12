import { DexType, SupportedChainId, DexConfig } from "../config";

export interface PoolInfo {
  address: string;
  chainId: SupportedChainId;
  dexType: DexType;
  dexName: string;
  token0: string;
  token1: string;
  reserve0: bigint;
  reserve1: bigint;
  fee: number; // In basis points (e.g., 30 = 0.3%)

  // V3/V4/Algebra specific
  sqrtPriceX96?: bigint;
  tick?: number;
  liquidity?: bigint;
  tickSpacing?: number;

  // V4 specific
  hooks?: string;

  // Solidly specific
  isStable?: boolean;

  // Curve specific
  coinIndices?: { [token: string]: number };

  // Balancer specific
  poolId?: string;
  weights?: bigint[];
  tokens?: string[];

  // Extra config
  extraConfig?: Record<string, unknown>;
}

export interface SwapQuote {
  amountIn: bigint;
  amountOut: bigint;
  priceImpactBps: number;
  pool: PoolInfo;
}

export interface IDexAdapter {
  readonly dexType: DexType;
  readonly dexName: string;
  readonly dexConfig: DexConfig;

  // Pool discovery
  discoverPools(tokens: string[]): Promise<PoolInfo[]>;

  // Get current pool state
  getPoolState(poolAddress: string): Promise<PoolInfo | null>;

  // Calculate output amount for given input
  getAmountOut(pool: PoolInfo, amountIn: bigint, tokenIn: string): bigint;

  // Calculate input amount for desired output
  getAmountIn(pool: PoolInfo, amountOut: bigint, tokenOut: string): bigint;

  // Get swap quote with price impact
  getSwapQuote(pool: PoolInfo, amountIn: bigint, tokenIn: string): SwapQuote;

  // Encode swap calldata for the Arbitrage contract
  encodeSwapData(
    pool: PoolInfo,
    tokenIn: string,
    tokenOut: string
  ): string;
}

export interface ReserveUpdate {
  poolAddress: string;
  reserve0: bigint;
  reserve1: bigint;
  sqrtPriceX96?: bigint;
  tick?: number;
  liquidity?: bigint;
  timestamp: number;
}
