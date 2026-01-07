import { useState, useEffect, FormEvent, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchChains, ChainInfo, getPoolIdentifierType, PoolKey } from '../utils/api';
import { V4ConfigModal } from './V4ConfigModal';
import './SearchBar.css';

export type PoolType = 'v3' | 'v4';

interface SearchBarProps {
  initialValue?: string;
  initialChainId?: number;
  onSearch?: (address: string, chainId?: number, autoDetect?: boolean) => void;
  onV4Search?: (poolId: string, poolKey: PoolKey) => void;
}

export function SearchBar({ initialValue = '', initialChainId, onSearch, onV4Search }: SearchBarProps) {
  const [poolInput, setPoolInput] = useState(initialValue);
  const [chainId, setChainId] = useState<number | undefined>(initialChainId);
  const [autoDetect, setAutoDetect] = useState(true); // Auto-detect by default
  const [chains, setChains] = useState<ChainInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [detectedType, setDetectedType] = useState<'v3_address' | 'v4_pool_id' | 'unknown' | null>(null);
  const [showV4Modal, setShowV4Modal] = useState(false);
  const [pendingV4PoolId, setPendingV4PoolId] = useState<string | null>(null);
  const navigate = useNavigate();

  // Fetch supported chains on mount
  useEffect(() => {
    fetchChains().then(response => {
      if (response.success && response.data) {
        setChains(response.data);
      }
    });
  }, []);

  // Detect input type as user types
  useEffect(() => {
    const trimmed = poolInput.trim();
    if (!trimmed) {
      setDetectedType(null);
      return;
    }
    setDetectedType(getPoolIdentifierType(trimmed));
  }, [poolInput]);

  const handleSubmit = useCallback((e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmed = poolInput.trim();

    // Basic validation
    if (!trimmed) {
      setError('Please enter a pool address or V4 pool ID');
      return;
    }

    const inputType = getPoolIdentifierType(trimmed);

    if (inputType === 'v3_address') {
      // V3 address - proceed with normal flow
      if (onSearch) {
        onSearch(trimmed, autoDetect ? undefined : chainId, autoDetect);
      } else {
        const params = new URLSearchParams();
        if (!autoDetect && chainId) {
          params.set('chain', chainId.toString());
        }
        if (autoDetect) {
          params.set('auto', 'true');
        }
        const queryString = params.toString();
        navigate(`/${trimmed}${queryString ? '?' + queryString : ''}`);
      }
    } else if (inputType === 'v4_pool_id') {
      // V4 pool ID - navigate directly (pool key will be looked up from on-chain events)
      if (onV4Search) {
        // If callback provided, use it (for embedded use cases that still need config)
        setPendingV4PoolId(trimmed);
        setShowV4Modal(true);
      } else {
        // Navigate directly to V4 pool page using pool ID
        navigate(`/v4/${trimmed}`);
      }
    } else {
      setError('Invalid format. Enter a V3 pool address (0x + 40 hex chars) or V4 pool ID (0x + 64 hex chars)');
    }
  }, [poolInput, autoDetect, chainId, onSearch, navigate]);

  const handleChainChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    if (value === 'auto') {
      setAutoDetect(true);
      setChainId(undefined);
    } else {
      setAutoDetect(false);
      setChainId(parseInt(value, 10));
    }
  };

  const handleV4ConfigSubmit = (poolKey: PoolKey) => {
    setShowV4Modal(false);
    if (pendingV4PoolId) {
      if (onV4Search) {
        onV4Search(pendingV4PoolId, poolKey);
      } else {
        // Navigate with V4 params
        const params = new URLSearchParams();
        params.set('v4', 'true');
        params.set('currency0', poolKey.currency0);
        params.set('currency1', poolKey.currency1);
        params.set('fee', poolKey.fee.toString());
        params.set('tickSpacing', poolKey.tickSpacing.toString());
        params.set('hooks', poolKey.hooks);
        navigate(`/${pendingV4PoolId}?${params.toString()}`);
      }
      setPendingV4PoolId(null);
    }
  };

  const handleOpenV4Modal = () => {
    setPendingV4PoolId(null);
    setShowV4Modal(true);
  };

  const handleV4ModalClose = () => {
    setShowV4Modal(false);
    setPendingV4PoolId(null);
  };

  // Get placeholder text based on detected type
  const getPlaceholder = () => {
    if (detectedType === 'v4_pool_id') {
      return 'V4 Pool ID detected - click Visualize to view';
    }
    return 'Enter V3 pool address (0x...) or V4 pool ID';
  };

  return (
    <>
      <form className="search-bar" onSubmit={handleSubmit}>
        <div className="search-input-wrapper">
          <select
            className="chain-select"
            value={autoDetect ? 'auto' : (chainId?.toString() || '')}
            onChange={handleChainChange}
            title="Select network (V3 only)"
            disabled={detectedType === 'v4_pool_id'}
          >
            <option value="auto">Auto-detect</option>
            {chains.map(chain => (
              <option key={chain.chainId} value={chain.chainId}>
                {chain.displayName}
              </option>
            ))}
          </select>
          <input
            type="text"
            className={`search-input ${detectedType === 'v4_pool_id' ? 'v4-detected' : ''}`}
            placeholder={getPlaceholder()}
            value={poolInput}
            onChange={(e) => setPoolInput(e.target.value)}
          />
          <button type="submit" className="search-button">
            Visualize
          </button>
          <button
            type="button"
            className="v4-config-button"
            onClick={handleOpenV4Modal}
            title="Configure V4 pool manually"
          >
            V4
          </button>
        </div>
        {detectedType && (
          <div className={`search-type-indicator ${detectedType}`}>
            {detectedType === 'v3_address' && 'V3 Pool Address'}
            {detectedType === 'v4_pool_id' && 'V4 Pool ID'}
            {detectedType === 'unknown' && poolInput.trim() && 'Unknown format'}
          </div>
        )}
        {error && <div className="search-error">{error}</div>}
      </form>

      {showV4Modal && (
        <V4ConfigModal
          poolId={pendingV4PoolId}
          onSubmit={handleV4ConfigSubmit}
          onClose={handleV4ModalClose}
        />
      )}
    </>
  );
}
