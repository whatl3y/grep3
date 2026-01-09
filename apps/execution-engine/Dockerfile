FROM node:22

LABEL AUTHOR="Lance Whatley"

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
COPY apps/execution-engine/package.json ./apps/execution-engine/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy the remainder of the source code
COPY packages/ ./packages/
COPY apps/execution-engine/ ./apps/execution-engine/

# Build
RUN pnpm --filter=@grep3/execution-engine build

ADD https://github.com/ufoscout/docker-compose-wait/releases/download/2.2.1/wait /wait
RUN chmod +x /wait

CMD ["sh", "-c", "/wait && pnpm --filter=@grep3/execution-engine start"]
