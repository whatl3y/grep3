import { useParams, Link, useSearchParams } from 'react-router-dom';
import { usePoolDataStream, useV4PoolDataStream } from '../hooks/usePoolDataStream';
import { SearchBar } from './SearchBar';
import { PoolInfo } from './PoolInfo';
import { CombinedChart } from './CombinedChart';
import { ProgressBar } from './ProgressBar';
import { isV4PoolId, PoolKey } from '../utils/api';
import './PoolPage.css';

export function PoolPage() {
  const { address } = useParams<{ address: string }>();
  const [searchParams] = useSearchParams();

  // Parse chain and auto-detect params from URL
  const chainParam = searchParams.get('chain');
  const chainId = chainParam ? parseInt(chainParam, 10) : undefined;
  const autoDetect = searchParams.get('auto') === 'true' || !chainParam;

  // Check if this is a V4 pool request
  const isV4 = searchParams.get('v4') === 'true';
  const currency0 = searchParams.get('currency0');
  const currency1 = searchParams.get('currency1');
  const fee = searchParams.get('fee');
  const tickSpacing = searchParams.get('tickSpacing');
  const hooks = searchParams.get('hooks');

  // Determine if we have valid V4 params or if the address looks like a V4 pool ID
  const hasV4Params = isV4 && currency0 && currency1;
  const looksLikeV4PoolId = address && isV4PoolId(address);

  // Build V4 pool key if we have the params
  const v4PoolKey: PoolKey | undefined = hasV4Params ? {
    currency0: currency0!,
    currency1: currency1!,
    fee: fee ? parseInt(fee, 10) : 3000,
    tickSpacing: tickSpacing ? parseInt(tickSpacing, 10) : 60,
    hooks: hooks || '0x0000000000000000000000000000000000000000',
  } : undefined;

  // Use V4 hook if we have V4 params, otherwise use V3 hook
  const v3Result = usePoolDataStream(
    (!hasV4Params && !looksLikeV4PoolId) ? (address || null) : null,
    { chainId, autoDetect }
  );

  const v4Result = useV4PoolDataStream({
    poolKey: v4PoolKey,
    poolId: hasV4Params ? address : undefined,
  });

  // Use the appropriate result
  const { data, loading, error, progress, refetch } = hasV4Params ? v4Result : v3Result;

  // Show a message if we detected a V4 pool ID but don't have the pool key
  const needsV4Config = looksLikeV4PoolId && !hasV4Params;

  return (
    <div className="pool-page">
      <header className="page-header">
        <Link to="/" className="back-link">
          <span className="back-arrow">←</span>
          <span className="logo-text">Liquidity Visualizer</span>
        </Link>
        <SearchBar initialValue={address} initialChainId={chainId} />
      </header>

      <main className="page-content">
        {needsV4Config && (
          <div className="v4-config-needed">
            <div className="v4-config-icon">🔧</div>
            <h2>V4 Pool Configuration Required</h2>
            <p>
              This appears to be a Uniswap V4 pool ID (bytes32). To visualize a V4 pool,
              you need to provide the pool key parameters (token addresses, fee, tick spacing, hooks).
            </p>
            <p className="v4-pool-id-display">
              Pool ID: <code>{address}</code>
            </p>
            <p>
              Click the <strong>V4</strong> button in the search bar to configure the pool parameters,
              or enter the same pool ID again and click Visualize to open the configuration modal.
            </p>
          </div>
        )}

        {loading && progress && (
          <div className="loading-wrapper">
            <ProgressBar progress={progress} />
          </div>
        )}

        {error && !needsV4Config && (
          <div className="error-container">
            <div className="error-icon">⚠️</div>
            <h2 className="error-title">Failed to Load Pool</h2>
            <p className="error-message">{error}</p>
            <button className="retry-button" onClick={refetch}>
              Try Again
            </button>
          </div>
        )}

        {data && !loading && (
          <>
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
