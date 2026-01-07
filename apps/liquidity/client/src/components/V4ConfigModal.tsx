import { useState, FormEvent, useEffect } from 'react';
import { PoolKey, computeV4PoolId, fetchKnownV4Pools, KnownV4Pool } from '../utils/api';
import './V4ConfigModal.css';

interface V4ConfigModalProps {
  poolId?: string | null;  // If provided, we're configuring an existing pool ID
  onSubmit: (poolKey: PoolKey) => void;
  onClose: () => void;
}

// Common token addresses for quick selection
const COMMON_TOKENS: Record<string, { symbol: string; address: string; decimals: number }> = {
  ETH: { symbol: 'ETH', address: '0x0000000000000000000000000000000000000000', decimals: 18 },
  WETH: { symbol: 'WETH', address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', decimals: 18 },
  USDC: { symbol: 'USDC', address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6 },
  USDT: { symbol: 'USDT', address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6 },
  DAI: { symbol: 'DAI', address: '0x6B175474E89094C44Da98b954EesdeF6E3e8fDeF9', decimals: 18 },
  WBTC: { symbol: 'WBTC', address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', decimals: 8 },
};

// Common fee tiers and their tick spacings
const FEE_TIERS = [
  { fee: 100, tickSpacing: 1, label: '0.01%' },
  { fee: 500, tickSpacing: 10, label: '0.05%' },
  { fee: 3000, tickSpacing: 60, label: '0.3%' },
  { fee: 10000, tickSpacing: 200, label: '1%' },
];

export function V4ConfigModal({ poolId, onSubmit, onClose }: V4ConfigModalProps) {
  const [mode, setMode] = useState<'poolId' | 'manual'>('manual');
  const [currency0, setCurrency0] = useState('');
  const [currency1, setCurrency1] = useState('');
  const [fee, setFee] = useState(3000);
  const [tickSpacing, setTickSpacing] = useState(60);
  const [hooks, setHooks] = useState('0x0000000000000000000000000000000000000000');
  const [inputPoolId, setInputPoolId] = useState(poolId || '');
  const [computedPoolId, setComputedPoolId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [knownPools, setKnownPools] = useState<KnownV4Pool[]>([]);
  const [selectedKnownPool, setSelectedKnownPool] = useState<string>('');

  // Fetch known pools on mount
  useEffect(() => {
    fetchKnownV4Pools().then(response => {
      if (response.success && response.data) {
        setKnownPools(response.data);
      }
    });
  }, []);

  // If poolId is provided, switch to poolId mode
  useEffect(() => {
    if (poolId) {
      setMode('poolId');
      setInputPoolId(poolId);
    }
  }, [poolId]);

  // Compute pool ID when inputs change
  useEffect(() => {
    if (mode === 'manual' && currency0 && currency1) {
      const poolKey: PoolKey = {
        currency0,
        currency1,
        fee,
        tickSpacing,
        hooks,
      };
      computeV4PoolId(poolKey).then(response => {
        if (response.success && response.data) {
          setComputedPoolId(response.data.poolId);
        } else {
          setComputedPoolId(null);
        }
      });
    }
  }, [mode, currency0, currency1, fee, tickSpacing, hooks]);

  const handleQuickSelect = (token: string, field: 'currency0' | 'currency1') => {
    const tokenInfo = COMMON_TOKENS[token];
    if (tokenInfo) {
      if (field === 'currency0') {
        setCurrency0(tokenInfo.address);
      } else {
        setCurrency1(tokenInfo.address);
      }
    }
  };

  const handleFeeChange = (selectedFee: number) => {
    const tier = FEE_TIERS.find(t => t.fee === selectedFee);
    if (tier) {
      setFee(tier.fee);
      setTickSpacing(tier.tickSpacing);
    }
  };

  const handleKnownPoolSelect = (poolName: string) => {
    setSelectedKnownPool(poolName);
    const pool = knownPools.find(p => p.id === poolName);
    if (pool) {
      setInputPoolId(pool.poolId);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate addresses
    const addressRegex = /^0x[a-fA-F0-9]{40}$/;

    if (!addressRegex.test(currency0)) {
      setError('Invalid currency0 address format');
      return;
    }

    if (!addressRegex.test(currency1)) {
      setError('Invalid currency1 address format');
      return;
    }

    if (!addressRegex.test(hooks)) {
      setError('Invalid hooks address format');
      return;
    }

    if (fee <= 0 || fee > 1000000) {
      setError('Fee must be between 1 and 1,000,000 (in bps * 100)');
      return;
    }

    if (tickSpacing <= 0 || tickSpacing > 16384) {
      setError('Tick spacing must be between 1 and 16384');
      return;
    }

    // If in poolId mode, verify the computed pool ID matches
    if (mode === 'poolId' && inputPoolId && computedPoolId) {
      if (computedPoolId.toLowerCase() !== inputPoolId.toLowerCase()) {
        setError(
          `Pool key does not match the provided pool ID.\n` +
          `Expected: ${inputPoolId}\n` +
          `Computed: ${computedPoolId}`
        );
        return;
      }
    }

    const poolKey: PoolKey = {
      currency0,
      currency1,
      fee,
      tickSpacing,
      hooks,
    };

    onSubmit(poolKey);
  };

  return (
    <div className="v4-modal-overlay" onClick={onClose}>
      <div className="v4-modal" onClick={e => e.stopPropagation()}>
        <div className="v4-modal-header">
          <h2>Configure Uniswap V4 Pool</h2>
          <button className="v4-modal-close" onClick={onClose}>&times;</button>
        </div>

        <div className="v4-modal-tabs">
          <button
            className={`v4-tab ${mode === 'manual' ? 'active' : ''}`}
            onClick={() => setMode('manual')}
          >
            Configure Pool Key
          </button>
          <button
            className={`v4-tab ${mode === 'poolId' ? 'active' : ''}`}
            onClick={() => setMode('poolId')}
          >
            Use Pool ID
          </button>
        </div>

        <form onSubmit={handleSubmit} className="v4-modal-form">
          {mode === 'poolId' && (
            <div className="v4-form-section">
              <label>Pool ID (bytes32)</label>
              <input
                type="text"
                value={inputPoolId}
                onChange={(e) => setInputPoolId(e.target.value)}
                placeholder="0x..."
                className="v4-input"
              />
              {knownPools.length > 0 && (
                <div className="v4-quick-select">
                  <span>Known pools:</span>
                  <select
                    value={selectedKnownPool}
                    onChange={(e) => handleKnownPoolSelect(e.target.value)}
                  >
                    <option value="">Select a known pool...</option>
                    {knownPools.map(pool => (
                      <option key={pool.id} value={pool.id}>
                        {pool.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <p className="v4-help-text">
                You still need to provide the pool key below to fetch liquidity data.
              </p>
            </div>
          )}

          <div className="v4-form-section">
            <label>Currency 0 (Token Address)</label>
            <input
              type="text"
              value={currency0}
              onChange={(e) => setCurrency0(e.target.value)}
              placeholder="0x..."
              className="v4-input"
            />
            <div className="v4-quick-select">
              {Object.keys(COMMON_TOKENS).map(token => (
                <button
                  key={token}
                  type="button"
                  className="v4-quick-btn"
                  onClick={() => handleQuickSelect(token, 'currency0')}
                >
                  {token}
                </button>
              ))}
            </div>
          </div>

          <div className="v4-form-section">
            <label>Currency 1 (Token Address)</label>
            <input
              type="text"
              value={currency1}
              onChange={(e) => setCurrency1(e.target.value)}
              placeholder="0x..."
              className="v4-input"
            />
            <div className="v4-quick-select">
              {Object.keys(COMMON_TOKENS).map(token => (
                <button
                  key={token}
                  type="button"
                  className="v4-quick-btn"
                  onClick={() => handleQuickSelect(token, 'currency1')}
                >
                  {token}
                </button>
              ))}
            </div>
          </div>

          <div className="v4-form-row">
            <div className="v4-form-section">
              <label>Fee Tier</label>
              <select
                value={fee}
                onChange={(e) => handleFeeChange(parseInt(e.target.value, 10))}
                className="v4-select"
              >
                {FEE_TIERS.map(tier => (
                  <option key={tier.fee} value={tier.fee}>
                    {tier.label} (fee: {tier.fee}, tickSpacing: {tier.tickSpacing})
                  </option>
                ))}
                <option value={fee}>Custom</option>
              </select>
            </div>

            <div className="v4-form-section">
              <label>Tick Spacing</label>
              <input
                type="number"
                value={tickSpacing}
                onChange={(e) => setTickSpacing(parseInt(e.target.value, 10) || 1)}
                min={1}
                max={16384}
                className="v4-input"
              />
            </div>
          </div>

          <div className="v4-form-section">
            <label>Hooks Address</label>
            <input
              type="text"
              value={hooks}
              onChange={(e) => setHooks(e.target.value)}
              placeholder="0x0000000000000000000000000000000000000000"
              className="v4-input"
            />
            <p className="v4-help-text">
              Use zero address (0x000...000) for pools without hooks
            </p>
          </div>

          {computedPoolId && (
            <div className="v4-computed-id">
              <label>Computed Pool ID:</label>
              <code>{computedPoolId}</code>
              {mode === 'poolId' && inputPoolId && (
                <div className={`v4-id-match ${
                  computedPoolId.toLowerCase() === inputPoolId.toLowerCase() ? 'match' : 'mismatch'
                }`}>
                  {computedPoolId.toLowerCase() === inputPoolId.toLowerCase()
                    ? '✓ Pool ID matches'
                    : '✗ Pool ID does not match'}
                </div>
              )}
            </div>
          )}

          {error && <div className="v4-error">{error}</div>}

          <div className="v4-modal-actions">
            <button type="button" className="v4-btn-cancel" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="v4-btn-submit">
              Visualize Pool
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
