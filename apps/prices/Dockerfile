FROM node:22 AS builder

LABEL AUTHOR="Lance Whatley"

# Install pnpm (pinned to the version in the repo's packageManager field so
# the build is reproducible and pnpm behavior changes don't land silently)
RUN npm install -g pnpm@10.28.1

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

# Deploy to a standalone directory with all dependencies.
# --legacy: pnpm v10 refuses to deploy non-injected workspaces by default
# (ERR_PNPM_DEPLOY_NONINJECTED_WORKSPACE); --legacy restores the pre-v10
# symlink-based deploy this image relies on.
RUN pnpm --filter=@grep3/prices deploy --prod --legacy /app

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
