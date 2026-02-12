FROM node:22 AS builder

LABEL AUTHOR="Lance Whatley"

# Install pnpm
RUN npm install -g pnpm

# Specify working directory
WORKDIR /usr/grep3

# Copy workspace files for pnpm monorepo
COPY pnpm-workspace.yaml ./
COPY pnpm-lock.yaml ./
COPY package.json ./
COPY tsconfig.base.json ./

# Copy package.json files from all workspaces
COPY packages/core/package.json ./packages/core/
COPY apps/evm-arbitrage/package.json ./apps/evm-arbitrage/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy the remainder of the source code
COPY packages/ ./packages/
COPY apps/evm-arbitrage/ ./apps/evm-arbitrage/

# Build core and evm-arbitrage
RUN pnpm --filter=@grep3/core build
RUN pnpm --filter=./apps/evm-arbitrage build

# Deploy to a standalone directory with all dependencies
RUN pnpm --filter=./apps/evm-arbitrage deploy --prod --legacy /app

# Production stage
FROM node:22-slim

WORKDIR /app

# Install tini for proper signal handling
RUN apt-get update && apt-get install -y tini && rm -rf /var/lib/apt/lists/*

# Copy the deployed app (includes node_modules with all deps)
COPY --from=builder /app .

# Copy the built core package into node_modules
COPY --from=builder /usr/grep3/packages/core/dist ./node_modules/@grep3/core/dist

# Wait for dependencies
ADD https://github.com/ufoscout/docker-compose-wait/releases/download/2.2.1/wait /wait
RUN chmod +x /wait

# Use tini as init system for proper signal handling
ENTRYPOINT ["/usr/bin/tini", "--"]

CMD ["sh", "-c", "/wait && node dist/tasks/migrate.js && node dist/index.js"]
