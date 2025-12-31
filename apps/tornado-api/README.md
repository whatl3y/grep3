# tornado-api

RESTful API for Tornado Cash operations - privacy-preserving cryptocurrency transactions.

## Overview

This API provides a programmatic interface to interact with Tornado Cash, allowing users to:
- Generate deposit notes
- Check deposit note status
- Deposit funds into Tornado Cash
- Withdraw funds anonymously to any address
- Query supported currencies and amounts

## Development

You will need to have Docker and Docker Compose installed and running.

```sh
$ git clone https://github.com/whatl3y/grep3
$ cd grep3
$ npm install

# Set up environment variables
$ cp apps/tornado-api/.env.example apps/tornado-api/.env
# Edit .env and add required values:
# - WITHDRAWAL_PK: Private key for relay wallet (pays gas for withdrawals)
# - RELAY_ADDRESS: Address that receives relay fees
# - WEB3_HTTP_NODE: Ethereum node HTTP endpoint
# - WEB3_WS_NODE: Ethereum node WebSocket endpoint

# Run the API
$ docker-compose up tornado-api
```

The API will be available at `http://localhost:8090`

## API Endpoints

### Generate Deposit Note
Generate a new deposit note for a specific currency and amount.

```bash
POST /note/generate
Content-Type: application/json

{
  "currency": "eth",
  "amount": "0.1",
  "networkId": 1
}
```

### Check Deposit Note Status
Check if a deposit note has been deposited and/or spent.

```bash
POST /note/check
Content-Type: application/json

{
  "depositNote": "tornado-eth-0.1-1-0x...",
  "networkId": 1
}
```

### Deposit Funds
Deposit funds into Tornado Cash (requires user's private key).

```bash
POST /deposit
Content-Type: application/json

{
  "currency": "eth",
  "amount": "0.1",
  "userPrivateKey": "0x...",
  "networkId": 1
}
```

### Withdraw Funds
Withdraw funds from Tornado Cash to any address (uses relay wallet).

```bash
POST /withdraw
Content-Type: application/json

{
  "depositNote": "tornado-eth-0.1-1-0x...",
  "destinationAddress": "0x...",
  "networkId": 1
}
```

### Get Supported Currencies
Get list of supported currencies for a network.

```bash
GET /currencies?networkId=1
```

### Get Available Amounts
Get available deposit amounts for a specific currency.

```bash
GET /amounts/eth?networkId=1
```

### API Info
Get API information and configuration.

```bash
GET /info
```

### Health Check
```bash
GET /health/check
```

## Supported Networks

- Ethereum Mainnet (netId: 1)
- Goerli Testnet (netId: 5)
- BSC (netId: 56)
- xDai (netId: 100)
- Polygon (netId: 137)
- Arbitrum (netId: 42161)
- Avalanche (netId: 43114)
- Optimism (netId: 10)

## Architecture

The API is built with:
- **Express.js** - Web framework
- **TypeScript** - Type safety
- **tornado-ts** - Tornado Cash operations library
- **web3.js** - Ethereum interactions
- **snarkjs/websnark** - Zero-knowledge proof generation

## Environment Variables

Required:
- `WITHDRAWAL_PK` - Private key for relay wallet (pays gas fees)
- `RELAY_ADDRESS` - Address receiving relay fees
- `WEB3_HTTP_NODE` - Ethereum HTTP RPC endpoint
- `WEB3_WS_NODE` - Ethereum WebSocket RPC endpoint (for events)

Optional:
- `PORT` - Server port (default: 8090)
- `RELAY_FEE_PERCENTAGE` - Relay fee % (default: 0.35)
- `RELAY_FEE_MAX` - Maximum relay fee
- `RELAY_FEE_MIN` - Minimum relay fee

## Security Notes

⚠️ **Important Security Considerations:**

1. **Private Keys**: The deposit endpoint requires users to send their private key. This should only be used in trusted environments or for testing. In production, consider implementing proper authentication and key management.

2. **Relay Wallet**: The withdrawal private key should have sufficient ETH to pay for gas fees but should be kept secure and rotated regularly.

3. **Rate Limiting**: Consider implementing rate limiting to prevent abuse.

4. **HTTPS**: Always use HTTPS in production to encrypt API traffic.

## License

MIT
