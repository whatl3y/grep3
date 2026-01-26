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

# Copy package.json files
COPY apps/about-me/client/package.json ./apps/about-me/client/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy the source code
COPY apps/about-me/client/ ./apps/about-me/client/

# Build the app with API URL configured
WORKDIR /usr/grep3/apps/about-me/client
ARG VITE_API_URL=http://localhost:8020
ENV VITE_API_URL=${VITE_API_URL}
RUN echo "Building with VITE_API_URL=${VITE_API_URL}" && pnpm build

# Production stage
FROM node:22-slim

RUN npm install -g serve

WORKDIR /app

# Copy built files from builder
COPY --from=builder /usr/grep3/apps/about-me/client/dist ./dist

CMD ["sh", "-c", "serve -s dist -l ${PORT:-3000}"]
