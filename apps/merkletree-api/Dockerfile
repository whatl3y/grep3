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
COPY apps/merkletree-api/package.json ./apps/merkletree-api/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy the remainder of the source code
COPY packages/ ./packages/
COPY apps/merkletree-api/ ./apps/merkletree-api/

# Build
RUN pnpm --filter=./apps/merkletree-api build

ADD https://github.com/ufoscout/docker-compose-wait/releases/download/2.2.1/wait /wait
RUN chmod +x /wait

CMD ["sh", "-c", "/wait && pnpm --filter=./apps/merkletree-api start"]
