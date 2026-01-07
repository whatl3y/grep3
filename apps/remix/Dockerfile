FROM node:22

LABEL AUTHOR="Lance Whatley"

# Install Playwright system dependencies
# Playwright requires these dependencies for Chromium
RUN apt-get update && apt-get install -y \
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libatspi2.0-0 \
    libxshmfence1 \
    && rm -rf /var/lib/apt/lists/*

# Install pnpm
RUN npm install -g pnpm

# specify working directory
WORKDIR /usr/grep3

# Copy workspace files for pnpm monorepo
COPY pnpm-workspace.yaml ./
COPY pnpm-lock.yaml ./
COPY package.json ./

# Copy package.json files from all workspaces
COPY packages/core/package.json ./packages/core/
COPY apps/remix/package.json ./apps/remix/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Install Playwright browsers (only Chromium to save space)
RUN npx playwright install chromium --with-deps

# Copy the remainder of the source code
COPY packages/ ./packages/
COPY apps/remix/ ./apps/remix/

# Build
RUN pnpm --filter=./apps/remix build

ADD https://github.com/ufoscout/docker-compose-wait/releases/download/2.2.1/wait /wait
RUN chmod +x /wait

CMD /wait && pnpm --filter=./apps/remix start
