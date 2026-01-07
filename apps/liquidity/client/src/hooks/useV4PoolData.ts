import { useState, useEffect, useCallback } from 'react';
import { LiquidityDistribution } from '../types';
import { fetchV4PoolByName, fetchV4PoolLiquidity, PoolKey, V4PoolResponse } from '../utils/api';

interface UseV4PoolDataResult {
  data: LiquidityDistribution | null;
  poolId: string | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

// Hook for fetching V4 pool by name
export function useV4PoolByName(
  poolName: string | null,
  priceRange?: number
): UseV4PoolDataResult {
  const [data, setData] = useState<LiquidityDistribution | null>(null);
  const [poolId, setPoolId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!poolName) {
      setData(null);
      setPoolId(null);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    const result = await fetchV4PoolByName(poolName, priceRange);

    if (result.success && result.data) {
      setData(result.data);
      setPoolId((result as any).poolId || null);
      setError(null);
    } else {
      setData(null);
      setPoolId(null);
      setError(result.error || 'Failed to fetch V4 pool data');
    }

    setLoading(false);
  }, [poolName, priceRange]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    data,
    poolId,
    loading,
    error,
    refetch: fetchData,
  };
}

// Hook for fetching V4 pool by custom pool key
export function useV4PoolByKey(
  poolKey: PoolKey | null,
  priceRange?: number
): UseV4PoolDataResult {
  const [data, setData] = useState<LiquidityDistribution | null>(null);
  const [poolId, setPoolId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!poolKey) {
      setData(null);
      setPoolId(null);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    const result = await fetchV4PoolLiquidity(poolKey, priceRange);

    if (result.success && result.data) {
      setData(result.data);
      setPoolId((result.data as V4PoolResponse).poolId || null);
      setError(null);
    } else {
      setData(null);
      setPoolId(null);
      setError(result.error || 'Failed to fetch V4 pool data');
    }

    setLoading(false);
  }, [poolKey, priceRange]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    data,
    poolId,
    loading,
    error,
    refetch: fetchData,
  };
}
