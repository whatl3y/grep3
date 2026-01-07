#!/bin/bash

# Heroku Deployment Script for Liquidity Client and Server
# Usage: ./deploy-heroku.sh [options]
#
# Options:
#   --server-only    Deploy only the server
#   --client-only    Deploy only the client
#   --create         Create new Heroku apps (first-time setup)

set -e

# Configuration - Update these values for your deployment
SERVER_APP_NAME="${HEROKU_SERVER_APP:-grep3-liquidity-server}"
CLIENT_APP_NAME="${HEROKU_CLIENT_APP:-grep3-liquidity-client}"
SERVER_URL="${HEROKU_SERVER_URL:-https://liquidity-api.grep3.com}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Parse arguments
DEPLOY_SERVER=true
DEPLOY_CLIENT=true
CREATE_APPS=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --server-only)
            DEPLOY_CLIENT=false
            shift
            ;;
        --client-only)
            DEPLOY_SERVER=false
            shift
            ;;
        --create)
            CREATE_APPS=true
            shift
            ;;
        *)
            log_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Check for Heroku CLI
if ! command -v heroku &> /dev/null; then
    log_error "Heroku CLI is not installed. Please install it first:"
    echo "  brew tap heroku/brew && brew install heroku"
    echo "  or visit: https://devcenter.heroku.com/articles/heroku-cli"
    exit 1
fi

# Check for Docker
if ! command -v docker &> /dev/null; then
    log_error "Docker is not installed. Please install Docker Desktop first."
    exit 1
fi

# Ensure logged into Heroku
if ! heroku auth:whoami &> /dev/null; then
    log_warn "Not logged into Heroku. Please log in:"
    heroku login
fi

# Ensure logged into Heroku Container Registry
log_info "Logging into Heroku Container Registry..."
heroku container:login

# Get the root directory of the repo
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

log_info "Repository root: $REPO_ROOT"

# Create apps if requested
if [ "$CREATE_APPS" = true ]; then
    log_info "Creating Heroku apps..."

    if [ "$DEPLOY_SERVER" = true ]; then
        if heroku apps:info "$SERVER_APP_NAME" &> /dev/null; then
            log_warn "Server app '$SERVER_APP_NAME' already exists"
        else
            log_info "Creating server app: $SERVER_APP_NAME"
            heroku create "$SERVER_APP_NAME" --stack container
        fi
    fi

    if [ "$DEPLOY_CLIENT" = true ]; then
        if heroku apps:info "$CLIENT_APP_NAME" &> /dev/null; then
            log_warn "Client app '$CLIENT_APP_NAME' already exists"
        else
            log_info "Creating client app: $CLIENT_APP_NAME"
            heroku create "$CLIENT_APP_NAME" --stack container
        fi
    fi
fi

# Deploy Server
if [ "$DEPLOY_SERVER" = true ]; then
    log_info "=========================================="
    log_info "Deploying Server to: $SERVER_APP_NAME"
    log_info "=========================================="

    # Build and push server image
    log_info "Building server Docker image for linux/amd64..."
    docker buildx build --platform linux/amd64 \
        -f apps/liquidity/server/Dockerfile \
        -t liquidity-server \
        .

    log_info "Tagging image for Heroku registry..."
    docker tag liquidity-server "registry.heroku.com/${SERVER_APP_NAME}/web"

    log_info "Pushing server image to Heroku..."
    docker push "registry.heroku.com/${SERVER_APP_NAME}/web"

    log_info "Releasing server..."
    heroku container:release web -a "$SERVER_APP_NAME"

    log_info "Server deployed successfully!"
    log_info "Server URL: https://${SERVER_APP_NAME}.herokuapp.com"
    # Note: SERVER_URL is NOT updated here - we keep the configured custom domain (default: liquidity-api.grep3.com)
    # To use herokuapp.com URL instead, explicitly set: HEROKU_SERVER_URL=https://your-app.herokuapp.com
fi

# Deploy Client
if [ "$DEPLOY_CLIENT" = true ]; then
    log_info "=========================================="
    log_info "Deploying Client to: $CLIENT_APP_NAME"
    log_info "API URL: $SERVER_URL"
    log_info "=========================================="

    # Build and push client image with API URL
    log_info "Building client Docker image for linux/amd64..."
    docker buildx build --platform linux/amd64 \
        -f apps/liquidity/client/Dockerfile \
        --build-arg VITE_API_URL="$SERVER_URL" \
        -t liquidity-client \
        .

    log_info "Tagging image for Heroku registry..."
    docker tag liquidity-client "registry.heroku.com/${CLIENT_APP_NAME}/web"

    log_info "Pushing client image to Heroku..."
    docker push "registry.heroku.com/${CLIENT_APP_NAME}/web"

    log_info "Releasing client..."
    heroku container:release web -a "$CLIENT_APP_NAME"

    log_info "Client deployed successfully!"
    log_info "Client URL: https://${CLIENT_APP_NAME}.herokuapp.com"
fi

# Summary
echo ""
log_info "=========================================="
log_info "Deployment Complete!"
log_info "=========================================="

if [ "$DEPLOY_SERVER" = true ]; then
    echo -e "  Server: ${GREEN}https://${SERVER_APP_NAME}.herokuapp.com${NC}"
fi

if [ "$DEPLOY_CLIENT" = true ]; then
    echo -e "  Client: ${GREEN}https://${CLIENT_APP_NAME}.herokuapp.com${NC}"
fi

echo ""
log_info "Next steps:"
echo "  1. Configure server environment variables:"
echo "     heroku config:set ETH_RPC_URL=your_rpc_url -a $SERVER_APP_NAME"
echo "     heroku config:set REDIS_URL=your_redis_url -a $SERVER_APP_NAME"
echo ""
echo "  2. View logs:"
echo "     heroku logs --tail -a $SERVER_APP_NAME"
echo "     heroku logs --tail -a $CLIENT_APP_NAME"
echo ""
echo "  3. To redeploy with different app names, use environment variables:"
echo "     HEROKU_SERVER_APP=my-server HEROKU_CLIENT_APP=my-client ./deploy-heroku.sh"
