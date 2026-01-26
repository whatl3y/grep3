# Trustless Agent Dockerfile for Oasis ROFL TEE Execution
FROM node:22-alpine

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++ git tini

# Copy package files and install
COPY package.json ./
RUN npm install

# Copy character configuration
COPY characters/ ./characters/

# Create data directory
RUN mkdir -p /app/data

# Set environment
ENV NODE_ENV=production

# Use tini as init system
ENTRYPOINT ["/sbin/tini", "--"]

# Use ElizaOS CLI to start with character (handles DB automatically)
CMD ["npx", "elizaos", "start", "--character", "characters/trustless.json"]
