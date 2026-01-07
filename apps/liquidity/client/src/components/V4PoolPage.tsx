import { useParams, useSearchParams, Link } from 'react-router-dom';
import { useMemo } from 'react';
import { useV4PoolDataStream } from '../hooks/usePoolDataStream';
import { PoolKey } from '../utils/api';
import { PoolInfo } from './PoolInfo';
import { CombinedChart } from './CombinedChart';
import { ProgressBar } from './ProgressBar';
import './PoolPage.css';

// Check if a string is a V4 pool ID (bytes32 format: 0x + 64 hex chars)
function isPoolIdFormat(value: string): boolean {
  return /^0x[a-fA-F0-9]{64}$/.test(value);
}

// Format pool ID for display (first 10 + ... + last 8 chars)
function formatPoolId(poolId: string): string {
  if (poolId.length <= 20) return poolId;
  return `${poolId.slice(0, 10)}...${poolId.slice(-8)}`;
}

export function V4PoolPage() {
  const { name } = useParams<{ name: string }>();
  const [searchParams] = useSearchParams();

  // Check if this is a custom pool key query
  const isCustom = name === 'custom';

  // Check if this is a pool ID (bytes32 format)
  const isPoolId = name ? isPoolIdFormat(name) : false;
  const poolId = isPoolId ? name : undefined;

  // Parse custom pool key from search params
  const customPoolKey = useMemo<PoolKey | null>(() => {
    if (!isCustom) return null;

    const currency0 = searchParams.get('currency0');
    const currency1 = searchParams.get('currency1');
    const fee = searchParams.get('fee');
    const tickSpacing = searchParams.get('tickSpacing');
    const hooks = searchParams.get('hooks');

    if (!currency0 || !currency1) return null;

    return {
      currency0,
      currency1,
      fee: fee ? parseInt(fee, 10) : 3000,
      tickSpacing: tickSpacing ? parseInt(tickSpacing, 10) : 60,
      hooks: hooks || '0x0000000000000000000000000000000000000000',
    };
  }, [isCustom, searchParams]);

  // Use WebSocket hook for streaming data
  // Priority: poolId > poolKey > poolName
  const { data, loading, error, progress, refetch } = useV4PoolDataStream({
    poolId: poolId,
    poolKey: isCustom ? customPoolKey ?? undefined : undefined,
    poolName: (isCustom || isPoolId) ? undefined : name ?? undefined,
  });

  // Construct display title
  const displayTitle = useMemo(() => {
    if (isCustom && customPoolKey) {
      return `Custom V4 Pool`;
    }
    if (isPoolId && name) {
      return `V4 Pool ${formatPoolId(name)}`;
    }
    return name ? decodeURIComponent(name) : 'V4 Pool';
  }, [isCustom, customPoolKey, isPoolId, name]);

  return (
    <div className="pool-page">
      <header className="page-header">
        <Link to="/" className="back-link">
          <span className="back-arrow">←</span>
          <span className="logo-text">Liquidity Visualizer</span>
        </Link>
        <div className="v4-badge">V4</div>
      </header>

      <main className="page-content">
        {loading && progress && (
          <div className="loading-wrapper">
            <ProgressBar progress={progress} />
          </div>
        )}

        {error && (
          <div className="error-container">
            <div className="error-icon">⚠️</div>
            <h2 className="error-title">Failed to Load V4 Pool</h2>
            <p className="error-message">{error}</p>
            <button className="retry-button" onClick={refetch}>
              Try Again
            </button>
          </div>
        )}

        {data && !loading && (
          <>
            {/* V4 Pool Header */}
            <div className="v4-pool-header">
              <h1 className="v4-pool-title">{displayTitle}</h1>
              {isPoolId && poolId && (
                <div className="v4-pool-key-display">
                  <div className="v4-key-row">
                    <span className="v4-key-label">Pool ID:</span>
                    <code title={poolId}>{poolId}</code>
                  </div>
                </div>
              )}
              {isCustom && customPoolKey && (
                <div className="v4-pool-key-display">
                  <div className="v4-key-row">
                    <span className="v4-key-label">Currency0:</span>
                    <code>{customPoolKey.currency0}</code>
                  </div>
                  <div className="v4-key-row">
                    <span className="v4-key-label">Currency1:</span>
                    <code>{customPoolKey.currency1}</code>
                  </div>
                  <div className="v4-key-row">
                    <span className="v4-key-label">Fee:</span>
                    <code>{customPoolKey.fee} ({(customPoolKey.fee / 10000).toFixed(2)}%)</code>
                  </div>
                  <div className="v4-key-row">
                    <span className="v4-key-label">Tick Spacing:</span>
                    <code>{customPoolKey.tickSpacing}</code>
                  </div>
                  <div className="v4-key-row">
                    <span className="v4-key-label">Hooks:</span>
                    <code>{customPoolKey.hooks}</code>
                  </div>
                </div>
              )}
            </div>

            <PoolInfo data={data} />
            <CombinedChart data={data} height={500} bucketPercent={0.1} />

            <div className="data-timestamp">
              Data fetched at:{' '}
              {new Date(data.timestamp).toLocaleString()}
              <button className="refresh-button" onClick={refetch}>
                Refresh
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
