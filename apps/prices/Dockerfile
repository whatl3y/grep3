FROM node:22 AS builder

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
COPY apps/prices/package.json ./apps/prices/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy the remainder of the source code
COPY packages/ ./packages/
COPY apps/prices/ ./apps/prices/

# Build core and prices
RUN pnpm --filter=@grep3/core build
RUN pnpm --filter=@grep3/prices build

# Deploy to a standalone directory with all dependencies
RUN pnpm --filter=@grep3/prices deploy --prod /app

# Production stage
FROM node:22-slim

WORKDIR /app

# Copy the deployed app (includes node_modules with all deps)
COPY --from=builder /app .

# Copy the built core package into node_modules
COPY --from=builder /usr/grep3/packages/core/dist ./node_modules/@grep3/core/dist

# Copy templates directory
COPY --from=builder /usr/grep3/apps/prices/templates ./templates

CMD ["node", "dist/webServer.js"]
