import { SupportedChainId, DexType } from "../config";
import { PoolInfo } from "./dex";

export interface PoolEdge {
  pool: PoolInfo;
  tokenIn: string;
  tokenOut: string;
}

export interface ArbitragePath {
  chainId: SupportedChainId;
  startToken: string;
  hops: PoolEdge[];
  estimatedProfit?: bigint;
  estimatedProfitUsd?: number;
  optimalInputAmount?: bigint;
  expectedOutputAmount?: bigint;
}

export interface ArbitrageOpportunity {
  chainId: SupportedChainId;
  path: ArbitragePath;
  inputAmount: bigint;
  expectedOutput: bigint;
  expectedProfitWei: bigint;
  expectedProfitBps: number;
  priceImpactBps: number;
  gasCostWei: bigint;
  timestamp: number;
}

export interface SwapConfig {
  swapper: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: bigint;
  data: string; // DEX-specific encoded calldata
}

export interface ExecutionResult {
  status: "success" | "failed" | "reverted";
  chainId: SupportedChainId;
  opportunity: ArbitrageOpportunity;
  txHash?: string;
  gasUsed?: bigint;
  gasPrice?: bigint;
  actualProfitWei?: bigint;
  executionTimeMs?: number;
  error?: string;
  timestamp: number;
}

export interface ArbitrageStats {
  chainId: SupportedChainId;
  totalOpportunitiesFound: number;
  totalOpportunitiesExecuted: number;
  totalProfitWei: bigint;
  totalProfitUsd: number;
  totalGasSpent: bigint;
  successRate: number;
  avgProfitPerTrade: number;
}

export interface SwapperAddresses {
  uniswap_v2?: string;
  uniswap_v3?: string;
  uniswap_v4?: string;
  algebra?: string;
  solidly?: string;
  curve?: string;
  balancer?: string;
  [key: string]: string | undefined;
}

export interface ContractAddresses {
  arbitrage: string;
  swappers: SwapperAddresses;
}
