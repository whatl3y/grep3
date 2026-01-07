import { useState, useEffect, useCallback, useRef } from 'react';
import { LiquidityDistribution, ProgressData } from '../types';
import { fetchV3PoolViaSocket, fetchV4PoolViaSocket } from '../utils/socket';
import { PoolKey } from '../utils/api';

interface UsePoolDataStreamResult {
  data: LiquidityDistribution | null;
  loading: boolean;
  error: string | null;
  progress: ProgressData | null;
  refetch: () => void;
}

interface UsePoolDataStreamOptions {
  priceRange?: number;
  chainId?: number;
  autoDetect?: boolean;
}

export function usePoolDataStream(
  poolAddress: string | null,
  options?: UsePoolDataStreamOptions
): UsePoolDataStreamResult {
  const { priceRange, chainId, autoDetect = true } = options || {};
  const [data, setData] = useState<LiquidityDistribution | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProgressData | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  const fetchData = useCallback(() => {
    if (!poolAddress) {
      setData(null);
      setError(null);
      setProgress(null);
      return;
    }

    // Cleanup previous fetch if any
    if (cleanupRef.current) {
      cleanupRef.current();
    }

    setLoading(true);
    setError(null);
    setProgress({ phase: 'connecting', percent: 0, message: 'Connecting...' });

    cleanupRef.current = fetchV3PoolViaSocket({
      poolAddress,
      priceRange,
      chainId,
      autoDetect,
      onProgress: (progressData) => {
        setProgress(progressData);
      },
      onData: (liquidityData) => {
        setData(liquidityData);
        setLoading(false);
        setProgress(null);
        cleanupRef.current = null;
      },
      onError: (errorMessage) => {
        setError(errorMessage);
        setLoading(false);
        setProgress(null);
        cleanupRef.current = null;
      },
    });
  }, [poolAddress, priceRange, chainId, autoDetect]);

  useEffect(() => {
    fetchData();

    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
    };
  }, [fetchData]);

  return {
    data,
    loading,
    error,
    progress,
    refetch: fetchData,
  };
}

interface UseV4PoolDataStreamOptions {
  poolKey?: PoolKey;
  poolId?: string;
  poolName?: string;
  priceRange?: number;
}

export function useV4PoolDataStream(
  options: UseV4PoolDataStreamOptions
): UsePoolDataStreamResult {
  const { poolKey, poolId, poolName, priceRange } = options;
  const [data, setData] = useState<LiquidityDistribution | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProgressData | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  const fetchData = useCallback(() => {
    if (!poolKey && !poolName && !poolId) {
      setData(null);
      setError(null);
      setProgress(null);
      return;
    }

    // Cleanup previous fetch if any
    if (cleanupRef.current) {
      cleanupRef.current();
    }

    setLoading(true);
    setError(null);
    setProgress({ phase: 'connecting', percent: 0, message: 'Connecting...' });

    cleanupRef.current = fetchV4PoolViaSocket({
      poolKey,
      poolId,
      poolName,
      priceRange,
      onProgress: (progressData) => {
        setProgress(progressData);
      },
      onData: (liquidityData) => {
        setData(liquidityData);
        setLoading(false);
        setProgress(null);
        cleanupRef.current = null;
      },
      onError: (errorMessage) => {
        setError(errorMessage);
        setLoading(false);
        setProgress(null);
        cleanupRef.current = null;
      },
    });
  }, [poolKey, poolId, poolName, priceRange]);

  useEffect(() => {
    fetchData();

    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
    };
  }, [fetchData]);

  return {
    data,
    loading,
    error,
    progress,
    refetch: fetchData,
  };
}
