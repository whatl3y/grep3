import { DexType } from "../../config";

export interface PoolData {
  address: string;
  dexName: string;
  dexType: DexType;
  token0: string;
  token1: string;
  liquidity: bigint;
  // V3/Algebra specific
  sqrtPriceX96?: bigint;
  tick?: number;
  // V2/Solidly specific
  reserve0?: bigint;
  reserve1?: bigint;
  // Trader Joe LB specific
  activeId?: number;
  binStep?: number;
}

export interface TokenInfo {
  symbol: string;
  name: string;
  decimals: number;
}

// ERC20 ABI (minimal) - shared across all DEX adapters
export const ERC20_ABI = [
  "function symbol() external view returns (string)",
  "function name() external view returns (string)",
  "function decimals() external view returns (uint8)",
];
