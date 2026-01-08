FROM node:22-slim AS builder

LABEL AUTHOR="Lance Whatley"

# Install pnpm
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

# exec-engine depends on core
COPY apps/exec-engine/package.json ./apps/exec-engine/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy the remainder of the source code
COPY packages/ ./packages/
COPY apps/exec-engine/ ./apps/exec-engine/

# Build core and exec-engine
RUN pnpm --filter=@grep3/core build
RUN pnpm --filter=./apps/exec-engine build

# Deploy to a standalone directory with all dependencies
RUN pnpm --filter=./apps/exec-engine deploy --prod /app

# Production stage
FROM node:22-slim

# Install git (required for git server functionality)
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy the deployed app (includes node_modules with all deps)
COPY --from=builder /app .

# Copy the built core package into node_modules
COPY --from=builder /usr/grep3/packages/core/dist ./node_modules/@grep3/core/dist

# Copy the templates directory (needed by webServer.ts)
COPY --from=builder /usr/grep3/apps/exec-engine/src/templates ./dist/templates

# Run migrations then start server
CMD ["sh", "-c", "node dist/tasks/migrate.js && node dist/webServer.js"]
