#!/bin/bash
set -e

# Prices API - Heroku Container Deployment Script
#
# This script deploys the prices API to Heroku using Docker containers.
#
# Prerequisites:
#   - Docker installed and running
#   - Heroku CLI installed and logged in (heroku login + heroku container:login)
#
# Usage:
#   ./deploy-heroku.sh [APP_NAME] [OPTIONS]
#
# Options:
#   --skip-build      Skip building images (use existing local images)
#
# If APP_NAME is not provided, it will use 'grep3-prices' as default.

APP_NAME="${1:-grep3-prices}"

# Check if first arg is an option (starts with --)
if [[ "$APP_NAME" == --* ]]; then
    APP_NAME="grep3-prices"
fi

# Parse options
SKIP_BUILD=false

for arg in "$@"; do
    case $arg in
        --skip-build)
            SKIP_BUILD=true
            ;;
    esac
done

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$PROJECT_DIR/../.." && pwd)"

echo "========================================"
echo "Prices API"
echo "Heroku Container Deployment"
echo "========================================"
echo ""
echo "App: $APP_NAME"
echo ""

# Check prerequisites
check_prerequisites() {
    echo "Checking prerequisites..."

    if ! command -v docker &> /dev/null; then
        echo "Error: Docker is not installed. Please install Docker first."
        exit 1
    fi

    if ! docker info &> /dev/null; then
        echo "Error: Docker is not running. Please start Docker first."
        exit 1
    fi

    if ! command -v heroku &> /dev/null; then
        echo "Error: Heroku CLI is not installed."
        echo "Install it with: brew install heroku/brew/heroku"
        exit 1
    fi

    if ! heroku auth:whoami &> /dev/null; then
        echo "Error: Not logged in to Heroku. Please run: heroku login"
        exit 1
    fi

    # Login to Heroku Container Registry
    echo "Logging in to Heroku Container Registry..."
    heroku container:login

    echo "All prerequisites met."
    echo ""
}

# Create or verify Heroku app
setup_heroku_app() {
    echo "Setting up Heroku app: $APP_NAME"

    # Check if app exists
    if heroku apps:info -a "$APP_NAME" &> /dev/null; then
        echo "App '$APP_NAME' already exists."
    else
        echo "Creating new Heroku app: $APP_NAME"
        heroku create "$APP_NAME" || {
            echo ""
            echo "Could not create app with name '$APP_NAME'."
            echo "The name might be taken. Please provide a unique name:"
            read -p "App name: " NEW_APP_NAME
            APP_NAME="$NEW_APP_NAME"
            heroku create "$APP_NAME"
        }
    fi

    # Set stack to container
    echo "Setting stack to container..."
    heroku stack:set container -a "$APP_NAME"

    echo ""
}

# Build Docker image
build_image() {
    if [ "$SKIP_BUILD" = true ]; then
        echo "Skipping build (--skip-build specified)"
        return 0
    fi

    echo "Building Docker image..."
    cd "$REPO_ROOT"

    echo ""
    echo "Building web image..."
    docker buildx build --platform linux/amd64 \
        -f apps/prices/Dockerfile \
        -t "registry.heroku.com/$APP_NAME/web" \
        .

    echo ""
    echo "Image built successfully."
}

# Push image to Heroku
push_image() {
    echo "Pushing image to Heroku Container Registry..."
    docker push "registry.heroku.com/$APP_NAME/web"
    echo ""
}

# Release container
release_container() {
    echo "Releasing container..."
    heroku container:release --app "$APP_NAME" web
    echo ""
}

# Deploy to Heroku
deploy() {
    build_image
    push_image
    release_container

    echo "========================================"
    echo "Deployment complete!"
    echo "========================================"
    echo ""
    echo "Your app is available at:"
    heroku apps:info -a "$APP_NAME" | grep "Web URL" || echo "  https://$APP_NAME.herokuapp.com"
    echo ""
    echo "View logs with:"
    echo "  heroku logs --tail -a $APP_NAME"
    echo ""
    echo "Configure environment variables with:"
    echo "  heroku config:set REDIS_URL=<your-redis-url> -a $APP_NAME"
    echo "  heroku config:set COINGECKO_API_KEY=<your-key> -a $APP_NAME"
    echo "  heroku config:set JUPITER_API_KEY=<your-key> -a $APP_NAME"
    echo ""
}

# Main
main() {
    check_prerequisites
    setup_heroku_app
    deploy
}

main
