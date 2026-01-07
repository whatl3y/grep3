import { ApiResponse, LiquidityDistribution } from '../types';

const API_BASE = import.meta.env.VITE_API_URL || '';

// Chain info type
export interface ChainInfo {
  chainId: number;
  name: string;
  displayName: string;
  blockExplorer: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
}

// Fetch supported chains
export async function fetchChains(): Promise<ApiResponse<ChainInfo[]>> {
  const url = `${API_BASE}/api/chains`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    return data;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      error: message,
    };
  }
}

// Detect which chain a pool is on
export async function detectPoolChain(
  poolAddress: string
): Promise<ApiResponse<{ chainId: number; name: string; displayName: string }>> {
  const url = `${API_BASE}/api/pool/${poolAddress}/detect`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    return data;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      error: message,
    };
  }
}

export async function fetchPoolLiquidity(
  poolAddress: string,
  options?: {
    priceRange?: number;
    chainId?: number;
    autoDetect?: boolean;
  }
): Promise<ApiResponse<LiquidityDistribution>> {
  const params = new URLSearchParams();
  if (options?.priceRange) {
    params.set('range', options.priceRange.toString());
  }
  if (options?.chainId) {
    params.set('chain', options.chainId.toString());
  }
  if (options?.autoDetect) {
    params.set('auto', 'true');
  }

  const url = `${API_BASE}/api/pool/${poolAddress}${params.toString() ? '?' + params : ''}`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    return data;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      error: message,
    };
  }
}

export async function fetchPoolInfo(
  poolAddress: string
): Promise<ApiResponse<LiquidityDistribution>> {
  const url = `${API_BASE}/api/pool/${poolAddress}/info`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    return data;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      error: message,
    };
  }
}

export function formatNumber(value: number | string, decimals: number = 2): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '0';

  if (num >= 1e9) {
    return (num / 1e9).toFixed(decimals) + 'B';
  } else if (num >= 1e6) {
    return (num / 1e6).toFixed(decimals) + 'M';
  } else if (num >= 1e3) {
    return (num / 1e3).toFixed(decimals) + 'K';
  } else if (num >= 1) {
    return num.toFixed(decimals);
  } else if (num >= 0.01) {
    // Small prices like $0.64 - show with more precision
    return num.toFixed(Math.max(decimals, 4));
  } else if (num >= 0.0001) {
    // Very small prices - show with 6 decimals
    return num.toFixed(6);
  } else if (num > 0) {
    // Extremely small - use scientific notation
    return num.toExponential(decimals);
  }

  return num.toFixed(decimals);
}

export function formatPrice(value: string | number, significantDigits: number = 6): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '0';

  if (num >= 1) {
    return num.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  return num.toPrecision(significantDigits);
}

export function shortenAddress(address: string): string {
  if (address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// V4 Pool Types
export interface PoolKey {
  currency0: string;
  currency1: string;
  fee: number;
  tickSpacing: number;
  hooks: string;
}

export interface KnownV4Pool {
  id: string;
  name: string;
  poolId: string;
}

export interface V4PoolResponse extends LiquidityDistribution {
  poolId?: string;
}

// Fetch V4 pool liquidity by pool key
export async function fetchV4PoolLiquidity(
  poolKey: PoolKey,
  priceRange?: number
): Promise<ApiResponse<V4PoolResponse>> {
  const url = `${API_BASE}/api/v4/pool`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...poolKey,
        range: priceRange,
      }),
    });
    const data = await response.json();
    return data;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      error: message,
    };
  }
}

// Fetch V4 pool liquidity by known pool name
export async function fetchV4PoolByName(
  poolName: string,
  priceRange?: number
): Promise<ApiResponse<LiquidityDistribution>> {
  const params = new URLSearchParams();
  if (priceRange) {
    params.set('range', priceRange.toString());
  }

  const url = `${API_BASE}/api/v4/pool/${encodeURIComponent(poolName)}${params.toString() ? '?' + params : ''}`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    return data;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      error: message,
    };
  }
}

// List known V4 pools
export async function fetchKnownV4Pools(): Promise<ApiResponse<KnownV4Pool[]>> {
  const url = `${API_BASE}/api/v4/pools`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    return data;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      error: message,
    };
  }
}

// Compute V4 pool ID from pool key
export async function computeV4PoolId(
  poolKey: PoolKey
): Promise<ApiResponse<{ poolId: string; poolKey: PoolKey }>> {
  const url = `${API_BASE}/api/v4/compute-id`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(poolKey),
    });
    const data = await response.json();
    return data;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      error: message,
    };
  }
}

// Validate V4 pool ID
export async function validateV4PoolId(
  poolId: string
): Promise<ApiResponse<{ poolId: string; isValid: boolean; basicInfo?: unknown }>> {
  const url = `${API_BASE}/api/v4/pool-id/${poolId}/validate`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    return data;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      error: message,
    };
  }
}

// Identify pool value type (V3 address or V4 pool ID)
export type PoolIdentifierType = 'v3_address' | 'v4_pool_id' | 'unknown';

export interface IdentifyResult {
  value: string;
  type: PoolIdentifierType;
  isValid: boolean;
  chainId?: number;
  chainName?: string;
  basicInfo?: unknown;
}

export async function identifyPoolValue(
  value: string
): Promise<ApiResponse<IdentifyResult>> {
  const url = `${API_BASE}/api/identify/${value}`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    return data;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      error: message,
    };
  }
}

// Fetch V4 pool by pool ID with pool key
export async function fetchV4PoolByIdWithKey(
  poolId: string,
  poolKey: PoolKey,
  priceRange?: number
): Promise<ApiResponse<V4PoolResponse>> {
  const url = `${API_BASE}/api/v4/pool-id/${poolId}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...poolKey,
        range: priceRange,
      }),
    });
    const data = await response.json();
    return data;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      error: message,
    };
  }
}

// Helper functions to check pool identifier format
export function isV3Address(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

export function isV4PoolId(value: string): boolean {
  return /^0x[a-fA-F0-9]{64}$/.test(value);
}

export function getPoolIdentifierType(value: string): PoolIdentifierType {
  if (isV3Address(value)) return 'v3_address';
  if (isV4PoolId(value)) return 'v4_pool_id';
  return 'unknown';
}
