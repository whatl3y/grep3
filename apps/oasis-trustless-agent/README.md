# Oasis Trustless Agent

A trustless AI agent built on [ElizaOS](https://elizaos.github.io/eliza/) that runs in a Trusted Execution Environment (TEE) using [Oasis ROFL](https://docs.oasis.io/build/rofl/) technology. The agent is registered via [ERC-8004](https://github.com/oasisprotocol/erc-8004) for on-chain verification, ensuring the deployed code can be fully audited and verified.

## Features

- **Trustless Execution**: Runs in a hardware-isolated TEE (Intel TDX) where even the operator cannot access internal state
- **Verifiable Code**: ERC-8004 registration proves the deployed instance matches the audited source code
- **Privacy-Preserving**: Conversations and computations are protected by hardware security
- **Blockchain Integration**: Can interact with Ethereum and Oasis Sapphire smart contracts

## Prerequisites

Before you begin, ensure you have the following:

1. **Node.js 22+**: [Download](https://nodejs.org/)
2. **Docker**: For containerization
3. **OpenAI API Key**: Get one at [OpenAI Platform](https://platform.openai.com/api-keys)

For ROFL deployment, you also need:
4. **Oasis CLI**: For ROFL deployment
5. **Oasis Testnet Tokens**: Get 120+ TEST tokens from the [Oasis Faucet](https://faucet.testnet.oasis.io/?paratime=sapphire)

## Quick Start

### Local Development with Docker

1. **Configure environment**:
   ```bash
   cd apps/oasis-trustless-agent
   cp .env.example .env
   # Edit .env and set your OPENAI_API_KEY
   ```

2. **Run with Docker Compose**:
   ```bash
   docker compose up --build
   ```

The agent will be available on port 3000.

### Interacting with the Agent

Send messages via the REST API:

```bash
curl -X POST http://localhost:3000/api/agents/Trustless/message \
  -H "Content-Type: application/json" \
  -d '{"text": "What is a TEE?", "userId": "user1", "roomId": "room1"}'
```

## Project Structure

```
oasis-trustless-agent/
├── characters/
│   └── trustless.json    # Agent personality and plugin config
├── docker-compose.yaml   # Docker configuration
├── Dockerfile            # Container build instructions
├── package.json          # Dependencies
├── rofl.yaml             # ROFL application manifest
├── .env.example          # Environment variable template
└── README.md
```

## Configuration

### Character Configuration

The agent's personality, knowledge, and plugin configuration are in `characters/trustless.json`:

- **plugins**: Array of ElizaOS plugins to load (e.g., `@elizaos/plugin-openai`)
- **settings**: Plugin-specific settings (model names, etc.)
- **bio**: Agent's personality/background
- **knowledge**: Domain knowledge
- **messageExamples**: Example conversations for training
- **style**: Response style guidelines

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | **Yes** | OpenAI API key for the LLM |
| `RPC_URL` | ROFL only | Ethereum RPC for ERC-8004 |
| `PINATA_JWT` | ROFL only | IPFS storage for metadata |

## ROFL Deployment (TEE)

To deploy to an Oasis ROFL TEE:

### Step 1: Install Oasis CLI

```bash
# macOS
brew install oasisprotocol/tools/oasis

# Verify
oasis --version
```

### Step 2: Create ROFL App

```bash
oasis rofl create --network testnet --account myaccount
```

### Step 3: Configure Docker Image

Uncomment and update `docker-compose.yaml`:

```yaml
image: docker.io/YOUR_USERNAME/oasis-trustless-agent:latest
```

### Step 4: Build and Push

```bash
docker login
docker compose build
docker compose push
```

### Step 5: Set Secrets

```bash
echo -n "sk-your-key" | oasis rofl secret set OPENAI_API_KEY -
oasis rofl update
```

### Step 6: Deploy

```bash
oasis rofl build
oasis rofl deploy
```

### Step 7: Monitor

```bash
oasis rofl machine show
oasis rofl machine logs
```

## Resources

- [Oasis ROFL Documentation](https://docs.oasis.io/build/rofl/)
- [ElizaOS Documentation](https://elizaos.github.io/eliza/)
- [ERC-8004 Specification](https://github.com/oasisprotocol/erc-8004)
- [Demo Repository](https://github.com/oasisprotocol/demo-trustless-agent)

## License

MIT
