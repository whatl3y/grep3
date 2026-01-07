import { useState, useEffect, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchKnownV4Pools, KnownV4Pool } from '../utils/api';
import './V4PoolSelector.css';

interface V4PoolSelectorProps {
  onSelectPool?: (poolName: string) => void;
}

export function V4PoolSelector({ onSelectPool }: V4PoolSelectorProps) {
  const [knownPools, setKnownPools] = useState<KnownV4Pool[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCustomForm, setShowCustomForm] = useState(false);
  const navigate = useNavigate();

  // Custom pool key form state
  const [currency0, setCurrency0] = useState('');
  const [currency1, setCurrency1] = useState('');
  const [fee, setFee] = useState('3000');
  const [tickSpacing, setTickSpacing] = useState('60');
  const [hooks, setHooks] = useState('0x0000000000000000000000000000000000000000');

  useEffect(() => {
    loadKnownPools();
  }, []);

  async function loadKnownPools() {
    setLoading(true);
    setError(null);

    const result = await fetchKnownV4Pools();
    if (result.success && result.data) {
      setKnownPools(result.data);
    } else {
      setError(result.error || 'Failed to load V4 pools');
    }
    setLoading(false);
  }

  function handleSelectKnownPool(poolName: string) {
    if (onSelectPool) {
      onSelectPool(poolName);
    } else {
      navigate(`/v4/${encodeURIComponent(poolName)}`);
    }
  }

  function handleCustomPoolSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!currency0 || !currency1) {
      setError('Currency0 and Currency1 addresses are required');
      return;
    }

    if (!/^0x[a-fA-F0-9]{40}$/.test(currency0) || !/^0x[a-fA-F0-9]{40}$/.test(currency1)) {
      setError('Invalid currency address format');
      return;
    }

    // Navigate to custom V4 pool page with query params
    const params = new URLSearchParams({
      currency0,
      currency1,
      fee,
      tickSpacing,
      hooks,
    });
    navigate(`/v4/custom?${params.toString()}`);
  }

  return (
    <div className="v4-pool-selector">
      <div className="v4-header">
        <h3 className="v4-title">Uniswap V4 Pools</h3>
        <p className="v4-subtitle">
          V4 pools are identified by a Pool ID (bytes32 hash) derived from the pool key.
          Enter a pool ID directly in the search bar above, or configure a custom pool key below.
          Pool IDs can be found by querying Initialize events on the{' '}
          <a href="https://etherscan.io/address/0x000000000004444c5dc75cb358380d2e3de08a90#events" target="_blank" rel="noopener noreferrer">
            PoolManager contract
          </a>.
        </p>
      </div>

      {loading ? (
        <div className="v4-loading">Loading V4 pools...</div>
      ) : error && !showCustomForm ? (
        <div className="v4-error">{error}</div>
      ) : null}

      {/* Known Pools Section - only show if there are known pools */}
      {knownPools.length > 0 ? (
        <div className="v4-known-pools">
          <h4 className="v4-section-title">Known V4 Pools</h4>
          <div className="v4-pools-list">
            {knownPools.map((pool) => (
              <button
                key={pool.id}
                className="v4-pool-button"
                onClick={() => handleSelectKnownPool(pool.id)}
              >
                <span className="v4-pool-name">{pool.name}</span>
                <span className="v4-pool-id" title={pool.poolId}>
                  {pool.poolId.slice(0, 10)}...{pool.poolId.slice(-8)}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : !loading && !error && (
        <div className="v4-no-pools">
          <p>
            To visualize a V4 pool, enter the pool ID (0x + 64 hex characters) in the search bar above,
            or configure a custom pool key below.
          </p>
        </div>
      )}

      {/* Custom Pool Form Toggle */}
      <button
        className="v4-custom-toggle"
        onClick={() => setShowCustomForm(!showCustomForm)}
      >
        {showCustomForm ? 'Hide Custom Form' : 'Enter Custom Pool Key'}
      </button>

      {/* Custom Pool Form */}
      {showCustomForm && (
        <form className="v4-custom-form" onSubmit={handleCustomPoolSubmit}>
          <h4 className="v4-section-title">Custom Pool Key</h4>

          <div className="v4-form-row">
            <label className="v4-label">
              Currency0 (Address)
              <input
                type="text"
                className="v4-input"
                placeholder="0x0000000000000000000000000000000000000000 for native ETH"
                value={currency0}
                onChange={(e) => setCurrency0(e.target.value)}
              />
            </label>
          </div>

          <div className="v4-form-row">
            <label className="v4-label">
              Currency1 (Address)
              <input
                type="text"
                className="v4-input"
                placeholder="0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48 (USDC)"
                value={currency1}
                onChange={(e) => setCurrency1(e.target.value)}
              />
            </label>
          </div>

          <div className="v4-form-row v4-form-row-split">
            <label className="v4-label">
              Fee (bps)
              <select
                className="v4-select"
                value={fee}
                onChange={(e) => setFee(e.target.value)}
              >
                <option value="100">0.01% (100)</option>
                <option value="500">0.05% (500)</option>
                <option value="3000">0.3% (3000)</option>
                <option value="10000">1% (10000)</option>
              </select>
            </label>

            <label className="v4-label">
              Tick Spacing
              <select
                className="v4-select"
                value={tickSpacing}
                onChange={(e) => setTickSpacing(e.target.value)}
              >
                <option value="1">1</option>
                <option value="10">10</option>
                <option value="60">60</option>
                <option value="200">200</option>
              </select>
            </label>
          </div>

          <div className="v4-form-row">
            <label className="v4-label">
              Hooks (Address)
              <input
                type="text"
                className="v4-input"
                placeholder="0x0000000000000000000000000000000000000000 for no hooks"
                value={hooks}
                onChange={(e) => setHooks(e.target.value)}
              />
            </label>
          </div>

          {error && <div className="v4-form-error">{error}</div>}

          <button type="submit" className="v4-submit-button">
            Visualize V4 Pool
          </button>
        </form>
      )}
    </div>
  );
}
