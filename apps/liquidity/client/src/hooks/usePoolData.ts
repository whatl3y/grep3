import { useState, useEffect, useCallback } from 'react';
import { LiquidityDistribution } from '../types';
import { fetchPoolLiquidity } from '../utils/api';

interface UsePoolDataResult {
  data: LiquidityDistribution | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

interface UsePoolDataOptions {
  priceRange?: number;
  chainId?: number;
  autoDetect?: boolean;
}

export function usePoolData(
  poolAddress: string | null,
  options?: UsePoolDataOptions
): UsePoolDataResult {
  const { priceRange, chainId, autoDetect = true } = options || {};
  const [data, setData] = useState<LiquidityDistribution | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!poolAddress) {
      setData(null);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    const result = await fetchPoolLiquidity(poolAddress, { priceRange, chainId, autoDetect });

    if (result.success && result.data) {
      setData(result.data);
      setError(null);
    } else {
      setData(null);
      setError(result.error || 'Failed to fetch pool data');
    }

    setLoading(false);
  }, [poolAddress, priceRange, chainId, autoDetect]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    data,
    loading,
    error,
    refetch: fetchData,
  };
}
