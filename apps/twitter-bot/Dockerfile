FROM node:22-slim AS builder

LABEL AUTHOR="Lance Whatley"

# Install build tools for native modules and pnpm
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm

# specify working directory
WORKDIR /usr/grep3

# Copy workspace files for pnpm monorepo
COPY pnpm-workspace.yaml ./
COPY pnpm-lock.yaml ./
COPY package.json ./
COPY tsconfig.base.json ./

# Copy package.json files from all workspaces
COPY packages/core/package.json ./packages/core/

# twitter-bot depends on core
COPY apps/twitter-bot/package.json ./apps/twitter-bot/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy the remainder of the source code
COPY packages/ ./packages/
COPY apps/twitter-bot/ ./apps/twitter-bot/

# Build core and twitter-bot
RUN pnpm --filter=@grep3/core build
RUN pnpm --filter=./apps/twitter-bot build

# Deploy to a standalone directory with all dependencies
RUN pnpm --filter=./apps/twitter-bot deploy --prod /app

# Production stage
FROM node:22-slim

WORKDIR /app

# Copy the deployed app (includes node_modules with all deps)
COPY --from=builder /app .

# Copy the built core package into node_modules
COPY --from=builder /usr/grep3/packages/core/dist ./node_modules/@grep3/core/dist

# Copy the views and public directories (at app root level, not in dist)
COPY --from=builder /usr/grep3/apps/twitter-bot/views ./views
COPY --from=builder /usr/grep3/apps/twitter-bot/public ./public

# Add docker-compose-wait to wait for dependencies (postgres, redis) before starting
ADD https://github.com/ufoscout/docker-compose-wait/releases/download/2.2.1/wait /wait
RUN chmod +x /wait

# Wait for dependencies, run migrations, then start server
CMD ["sh", "-c", "/wait && node dist/tasks/migrate.js && node dist/webServer.js"]
