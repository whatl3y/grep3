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
COPY apps/about-me/server/package.json ./apps/about-me/server/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy the remainder of the source code
COPY packages/ ./packages/
COPY apps/about-me/server/ ./apps/about-me/server/

# Build core and server
RUN pnpm --filter=@grep3/core build
RUN pnpm --filter=@grep3/about-me-server build

# Deploy to a standalone directory with all dependencies
RUN pnpm --filter=@grep3/about-me-server deploy --prod /app

# Production stage
FROM node:22-slim

# Install Playwright dependencies for headless browser
RUN apt-get update && apt-get install -y \
    wget \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libglib2.0-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libx11-6 \
    libxcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy the deployed app (includes node_modules with all deps)
COPY --from=builder /app .

# Copy the built core package into node_modules
COPY --from=builder /usr/grep3/packages/core/dist ./node_modules/@grep3/core/dist

# Install Playwright browsers
RUN npx playwright install chromium

# Set environment for Playwright
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

CMD ["node", "dist/webServer.js"]
