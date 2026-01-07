import { LiquidityDistribution } from '../types';
import { formatNumber, formatPrice, shortenAddress } from '../utils/api';
import './PoolInfo.css';

interface PoolInfoProps {
  data: LiquidityDistribution;
}

// Chain block explorers for links
const CHAIN_EXPLORERS: Record<number, string> = {
  1: 'https://etherscan.io',
  42161: 'https://arbiscan.io',
  10: 'https://optimistic.etherscan.io',
  137: 'https://polygonscan.com',
  8453: 'https://basescan.org',
  56: 'https://bscscan.com',
};

// Chain display names
const CHAIN_NAMES: Record<number, string> = {
  1: 'Ethereum',
  42161: 'Arbitrum',
  10: 'Optimism',
  137: 'Polygon',
  8453: 'Base',
  56: 'BNB Chain',
};

export function PoolInfo({ data }: PoolInfoProps) {
  const { pool, priceRange, totalLiquidityUSD } = data;

  const feePercent = pool.fee / 10000;
  const chainId = pool.chainId || 1;
  const explorer = CHAIN_EXPLORERS[chainId] || CHAIN_EXPLORERS[1];
  const chainName = pool.chainName || CHAIN_NAMES[chainId] || 'Ethereum';

  // Detect quote assets to show the more human-readable price prominently
  // Priority: USD stablecoins > ETH/WETH > default
  const usdStablecoins = ['USDC', 'USDT', 'DAI', 'BUSD', 'FRAX', 'TUSD', 'LUSD'];
  const ethTokens = ['WETH', 'ETH'];

  const token0Symbol = pool.token0.symbol.toUpperCase();
  const token1Symbol = pool.token1.symbol.toUpperCase();

  const token0IsUsdStable = usdStablecoins.includes(token0Symbol);
  const token1IsUsdStable = usdStablecoins.includes(token1Symbol);
  const token0IsEth = ethTokens.includes(token0Symbol);
  const token1IsEth = ethTokens.includes(token1Symbol);

  // Determine which price to show as primary
  // We want the quote (stable) asset in the denominator
  // e.g., WETH/USDC -> show "3218 USDC/WETH" (price of WETH in USDC)
  // e.g., UNI/WETH -> show "0.0045 WETH/UNI" (price of UNI in WETH)
  let showInvertedAsPrimary = false;

  // Priority 1: USD stablecoins are quote
  if (token1IsUsdStable && !token0IsUsdStable) {
    // Pool is like WETH/USDC - currentPrice shows token1 per token0, which is USDC per WETH
    showInvertedAsPrimary = false;
  } else if (token0IsUsdStable && !token1IsUsdStable) {
    // Pool is like USDC/WETH - need inverted to show USDC per WETH
    showInvertedAsPrimary = true;
  }
  // Priority 2: ETH tokens are quote when no USD stablecoin
  else if (token1IsEth && !token0IsEth) {
    // Pool is like UNI/WETH - currentPrice shows WETH per UNI, which is correct
    showInvertedAsPrimary = false;
  } else if (token0IsEth && !token1IsEth) {
    // Pool is like WETH/UNI - need inverted to show WETH per UNI
    showInvertedAsPrimary = true;
  }
  // Default: show the larger price as primary (more human-readable)
  else {
    const price = parseFloat(pool.currentPrice);
    const invertedPrice = parseFloat(pool.currentPriceInverted);
    showInvertedAsPrimary = invertedPrice > price;
  }

  const primaryPrice = showInvertedAsPrimary ? pool.currentPriceInverted : pool.currentPrice;
  const secondaryPrice = showInvertedAsPrimary ? pool.currentPrice : pool.currentPriceInverted;
  const primaryUnit = showInvertedAsPrimary
    ? `${pool.token0.symbol}/${pool.token1.symbol}`
    : `${pool.token1.symbol}/${pool.token0.symbol}`;
  const secondaryUnit = showInvertedAsPrimary
    ? `${pool.token1.symbol}/${pool.token0.symbol}`
    : `${pool.token0.symbol}/${pool.token1.symbol}`;

  return (
    <div className="pool-info">
      <div className="pool-header">
        <div className="pool-pair">
          <span className="token-symbol">{pool.token0.symbol}</span>
          <span className="separator">/</span>
          <span className="token-symbol">{pool.token1.symbol}</span>
          <span className="pool-fee">{feePercent}%</span>
          <span className="pool-version">{pool.version.toUpperCase()}</span>
          <span className="pool-chain">{chainName}</span>
        </div>
        <a
          href={`${explorer}/address/${pool.address}`}
          target="_blank"
          rel="noopener noreferrer"
          className="pool-address"
        >
          {shortenAddress(pool.address)}
        </a>
      </div>

      <div className="pool-stats">
        <div className="stat-card">
          <div className="stat-label">Current Price</div>
          <div className="stat-value">
            {formatPrice(primaryPrice)}
            <span className="stat-unit">{primaryUnit}</span>
          </div>
          <div className="stat-secondary">
            {formatPrice(secondaryPrice)}
            <span className="stat-unit">{secondaryUnit}</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Total Liquidity</div>
          <div className="stat-value">${formatNumber(totalLiquidityUSD)}</div>
          <div className="stat-secondary">in visible range</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Price Range</div>
          <div className="stat-range">
            <div className="range-bound">
              <span className="range-label">Min</span>
              <span className="range-value">{formatPrice(priceRange.min)}</span>
            </div>
            <div className="range-separator">-</div>
            <div className="range-bound">
              <span className="range-label">Max</span>
              <span className="range-value">{formatPrice(priceRange.max)}</span>
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Current Tick</div>
          <div className="stat-value">{pool.tick.toLocaleString()}</div>
          <div className="stat-secondary">
            Tick spacing: {pool.tickSpacing}
          </div>
        </div>
      </div>

      <div className="token-info">
        <div className="token-card">
          <div className="token-header">
            <span className="token-name">{pool.token0.name}</span>
            <span className="token-badge">{pool.token0.symbol}</span>
          </div>
          <a
            href={`${explorer}/token/${pool.token0.address}`}
            target="_blank"
            rel="noopener noreferrer"
            className="token-address"
          >
            {shortenAddress(pool.token0.address)}
          </a>
          <div className="token-decimals">Decimals: {pool.token0.decimals}</div>
        </div>

        <div className="token-card">
          <div className="token-header">
            <span className="token-name">{pool.token1.name}</span>
            <span className="token-badge">{pool.token1.symbol}</span>
          </div>
          <a
            href={`${explorer}/token/${pool.token1.address}`}
            target="_blank"
            rel="noopener noreferrer"
            className="token-address"
          >
            {shortenAddress(pool.token1.address)}
          </a>
          <div className="token-decimals">Decimals: {pool.token1.decimals}</div>
        </div>
      </div>
    </div>
  );
}
