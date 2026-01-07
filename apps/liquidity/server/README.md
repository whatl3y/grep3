# Liquidity Visualization API

A REST API for fetching and visualizing concentrated liquidity positions from Uniswap V3 and V4 pools.

## Features

- Fetch liquidity distribution data for any Uniswap V3 pool
- Support for Uniswap V4 pools (with full pool key parameters)
- Configurable price range (default: +/- 50% of current price)
- Redis caching for improved performance
- Real-time tick data with USD liquidity estimates

## API Endpoints

### Get V3 Pool Liquidity

```
GET /api/pool/:address
```

Query parameters:
- `range` (optional): Price range percentage (default: 50)

Example:
```bash
curl http://localhost:8095/api/pool/0x8ad599c3A0ff1De082011EFDDc58f1908eb6e6D8
```

### Get V4 Pool Liquidity

```
POST /api/pool/v4
```

Body:
```json
{
  "currency0": "0x...",
  "currency1": "0x...",
  "fee": 3000,
  "tickSpacing": 60,
  "hooks": "0x0000000000000000000000000000000000000000",
  "range": 50
}
```

### Get Pool Info

```
GET /api/pool/:address/info
```

Returns basic pool information without full liquidity distribution.

### Invalidate Cache

```
POST /api/pool/:address/invalidate
```

Clears cached data for a specific pool.

### Get Configuration

```
GET /api/config
```

Returns current API configuration including supported chains and contract addresses.

## Response Format

```json
{
  "success": true,
  "data": {
    "pool": {
      "address": "0x...",
      "token0": { "address": "0x...", "symbol": "USDC", "decimals": 6 },
      "token1": { "address": "0x...", "symbol": "ETH", "decimals": 18 },
      "fee": 3000,
      "tickSpacing": 60,
      "currentPrice": "1850.50",
      "version": "v3"
    },
    "ticks": [
      {
        "tick": -202560,
        "liquidityGross": "123456789",
        "liquidityNet": "123456789",
        "price0": "1800.00",
        "price1": "0.000555",
        "liquidityUSD": 1234567.89
      }
    ],
    "priceRange": {
      "min": "925.25",
      "max": "2775.75",
      "current": "1850.50"
    },
    "totalLiquidityUSD": 12345678.90,
    "timestamp": 1704067200000
  }
}
```

## Environment Variables

- `HOST`: Server host (default: http://localhost:8095)
- `PORT`: Server port (default: 8095)
- `LOG_LEVEL`: Logging level (default: info)
- `REDIS_URL`: Redis connection URL
- `ETH_RPC_URL`: Ethereum RPC endpoint
- `PRICE_RANGE_PERCENT`: Default price range percentage (default: 50)
- `CACHE_TTL`: Cache TTL in seconds (default: 300)

## Popular Pool Addresses (Ethereum Mainnet)

- USDC/ETH 0.3%: `0x8ad599c3A0ff1De082011EFDDc58f1908eb6e6D8`
- WBTC/ETH 0.3%: `0xCBCdF9626bC03E24f779434178A73a0B4bad62eD`
- USDC/USDT 0.01%: `0x3416cF6C708Da44DB2624D63ea0AAef7113527C6`
- DAI/USDC 0.01%: `0x5777d92f208679DB4b9778590Fa3CAB3aC9e2168`
