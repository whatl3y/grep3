# Liquidity Visualizer Client

A React frontend for visualizing Uniswap V3 and V4 concentrated liquidity positions.

## Getting Started

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Build for production
pnpm build
```

## Configuration

Set the API URL via environment variable:

```bash
VITE_API_URL=http://localhost:8095
```

## Accessing Pool Liquidity

### Uniswap V3 Pools

V3 pools are accessed by their contract address:

```
http://localhost:3000/{POOL_ADDRESS}
```

**Examples:**
- USDC/ETH (0.05%): `http://localhost:3000/0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640`
- WBTC/ETH (0.3%): `http://localhost:3000/0xCBCdF9626bC03E24f779434178A73a0B4bad62eD`
- USDC/USDT (0.01%): `http://localhost:3000/0x3416cF6C708Da44DB2624D63ea0AAef7113527C6`

### Uniswap V4 Pools

V4 pools use a PoolKey (not an address) to identify pools. Access them in two ways:

#### By Known Pool Name

Pre-configured pools can be accessed by name:

```
http://localhost:3000/v4/{POOL_NAME}
```

**Examples:**
- `http://localhost:3000/v4/ETH-USDC-3000`
- `http://localhost:3000/v4/ETH-USDC-500`

#### By Custom Pool Key

For arbitrary V4 pools, provide the full pool key as query parameters:

```
http://localhost:3000/v4/custom?currency0={ADDR}&currency1={ADDR}&fee={FEE}&tickSpacing={SPACING}&hooks={HOOKS}
```

**Parameters:**
| Parameter | Description | Example |
|-----------|-------------|---------|
| `currency0` | First token address (use `0x0000000000000000000000000000000000000000` for native ETH) | `0x0000000000000000000000000000000000000000` |
| `currency1` | Second token address | `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` (USDC) |
| `fee` | Fee tier in basis points | `3000` (0.3%), `500` (0.05%), `100` (0.01%) |
| `tickSpacing` | Tick spacing for the pool | `60`, `10`, `1` |
| `hooks` | Hooks contract address | `0x0000000000000000000000000000000000000000` (no hooks) |

**Example:**
```
http://localhost:3000/v4/custom?currency0=0x0000000000000000000000000000000000000000&currency1=0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48&fee=3000&tickSpacing=60&hooks=0x0000000000000000000000000000000000000000
```

## Features

- **Liquidity Heatmap**: Visualize liquidity concentration with color-coded bars
  - Blue bars: Buy liquidity (below current price)
  - Pink bars: Sell liquidity (above current price)
- **Price Curve**: Yellow line showing the price at each tick
- **Hover Tooltips**: Detailed tick information on hover
- **USD Estimates**: Approximate USD value of liquidity at each price level
- **Responsive Design**: Works on desktop and mobile

## Common Token Addresses (Ethereum Mainnet)

| Token | Address |
|-------|---------|
| Native ETH (V4) | `0x0000000000000000000000000000000000000000` |
| WETH | `0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2` |
| USDC | `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` |
| USDT | `0xdAC17F958D2ee523a2206206994597C13D831ec7` |
| DAI | `0x6B175474E89094C44Da98b954EescdeCB5BE3D2` |
| WBTC | `0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599` |

## Fee Tiers

| Fee (bps) | Percentage | Typical Use |
|-----------|------------|-------------|
| 100 | 0.01% | Stable pairs |
| 500 | 0.05% | Stable/major pairs |
| 3000 | 0.3% | Most pairs |
| 10000 | 1% | Exotic pairs |

## Docker

Build and run with Docker:

```bash
docker build -t liquidity-client .
docker run -p 3000:3000 -e VITE_API_URL=http://api:8095 liquidity-client
```

Or use docker-compose from the project root:

```bash
docker-compose up liquidity-client
```
