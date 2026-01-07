import { SearchBar } from './SearchBar';
import { V4PoolSelector } from './V4PoolSelector';
import './HomePage.css';

const POPULAR_POOLS = [
  {
    name: 'USDC/ETH',
    address: '0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640',
    fee: '0.05%',
  },
  {
    name: 'WBTC/ETH',
    address: '0xCBCdF9626bC03E24f779434178A73a0B4bad62eD',
    fee: '0.3%',
  },
  {
    name: 'USDC/USDT',
    address: '0x3416cF6C708Da44DB2624D63ea0AAef7113527C6',
    fee: '0.01%',
  },
  {
    name: 'DAI/USDC',
    address: '0x5777d92f208679DB4b9778590Fa3CAB3aC9e2168',
    fee: '0.01%',
  },
  {
    name: 'PEPE/WETH',
    address: '0x11950d141EcB863F01007AdD7D1A342041227b58',
    fee: '0.3%',
  },
  {
    name: 'ARB/ETH',
    address: '0xC6F780497A95e246EB9449f5e4770916DCd6396A',
    fee: '0.3%',
  },
];

export function HomePage() {
  return (
    <div className="home-page">
      <div className="hero-section">
        <h1 className="hero-title">
          Uniswap Liquidity
          <span className="hero-highlight">Visualizer</span>
        </h1>
        <p className="hero-subtitle">
          Explore concentrated liquidity positions across Uniswap V3 and V4 pools.
          See where liquidity is concentrated and understand market depth at a glance.
        </p>

        <SearchBar />
      </div>

      <V4PoolSelector />

      <div className="popular-section">
        <h2 className="section-title">Popular V3 Pools</h2>
        <div className="pools-grid">
          {POPULAR_POOLS.map((pool) => (
            <a
              key={pool.address}
              href={`/${pool.address}`}
              className="pool-card"
            >
              <div className="pool-card-name">{pool.name}</div>
              <div className="pool-card-fee">{pool.fee}</div>
              <div className="pool-card-address">
                {pool.address.slice(0, 10)}...{pool.address.slice(-8)}
              </div>
            </a>
          ))}
        </div>
      </div>

      <div className="features-section">
        <h2 className="section-title">Features</h2>
        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-icon">📊</div>
            <h3 className="feature-title">Liquidity Heatmap</h3>
            <p className="feature-desc">
              Visualize where liquidity is concentrated with intuitive bar charts
              showing buy and sell pressure at each price level.
            </p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">💰</div>
            <h3 className="feature-title">USD Values</h3>
            <p className="feature-desc">
              See estimated USD liquidity at each tick. Hover over bars to get
              detailed information about liquidity amounts.
            </p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">⚡</div>
            <h3 className="feature-title">Fast & Cached</h3>
            <p className="feature-desc">
              Data is fetched directly from the blockchain and cached for quick
              repeated access. Real-time updates available.
            </p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">🔗</div>
            <h3 className="feature-title">V3 & V4 Support</h3>
            <p className="feature-desc">
              Works with both Uniswap V3 pools and the new V4 architecture.
              Simply paste the pool address to get started.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
