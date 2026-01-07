#!/bin/bash
set -e

# Exec Engine - Heroku Container Deployment Script
#
# This script deploys the exec-engine application to Heroku using Docker containers:
#   - web: Main web server (Dockerfile)
#   - scheduler: Resque scheduler worker (Dockerfile.scheduler)
#   - worker: Resque worker (Dockerfile.worker)
#
# Prerequisites:
#   - Docker installed and running
#   - Heroku CLI installed and logged in (heroku login + heroku container:login)
#
# Usage:
#   ./deploy-heroku.sh [APP_NAME] [OPTIONS]
#
# Options:
#   --web-only        Deploy only the web process
#   --scheduler-only  Deploy only the scheduler worker
#   --worker-only     Deploy only the worker process
#   --workers-only    Deploy both scheduler and worker (no web)
#   --skip-build      Skip building images (use existing local images)
#
# If APP_NAME is not provided, it will use 'grep3-exec-engine' as default.

APP_NAME="${1:-grep3-exec-engine}"

# Check if first arg is an option (starts with --)
if [[ "$APP_NAME" == --* ]]; then
    APP_NAME="grep3-exec-engine"
fi

# Parse options
DEPLOY_WEB=true
DEPLOY_SCHEDULER=true
DEPLOY_WORKER=true
SKIP_BUILD=false

for arg in "$@"; do
    case $arg in
        --web-only)
            DEPLOY_SCHEDULER=false
            DEPLOY_WORKER=false
            ;;
        --scheduler-only)
            DEPLOY_WEB=false
            DEPLOY_WORKER=false
            ;;
        --worker-only)
            DEPLOY_WEB=false
            DEPLOY_SCHEDULER=false
            ;;
        --workers-only)
            DEPLOY_WEB=false
            ;;
        --skip-build)
            SKIP_BUILD=true
            ;;
    esac
done

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$PROJECT_DIR/../.." && pwd)"

echo "========================================"
echo "Exec Engine"
echo "Heroku Container Deployment"
echo "========================================"
echo ""
echo "App: $APP_NAME"
echo "Deploy web: $DEPLOY_WEB"
echo "Deploy scheduler: $DEPLOY_SCHEDULER"
echo "Deploy worker: $DEPLOY_WORKER"
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

# Build Docker images
build_images() {
    if [ "$SKIP_BUILD" = true ]; then
        echo "Skipping build (--skip-build specified)"
        return 0
    fi

    echo "Building Docker images..."
    cd "$REPO_ROOT"

    if [ "$DEPLOY_WEB" = true ]; then
        echo ""
        echo "Building web image..."
        docker buildx build --platform linux/amd64 \
            -f apps/exec-engine/Dockerfile \
            -t "registry.heroku.com/$APP_NAME/web" \
            .
    fi

    if [ "$DEPLOY_SCHEDULER" = true ]; then
        echo ""
        echo "Building scheduler image..."
        docker buildx build --platform linux/amd64 \
            -f apps/exec-engine/Dockerfile.scheduler \
            -t "registry.heroku.com/$APP_NAME/scheduler" \
            .
    fi

    if [ "$DEPLOY_WORKER" = true ]; then
        echo ""
        echo "Building worker image..."
        docker buildx build --platform linux/amd64 \
            -f apps/exec-engine/Dockerfile.worker \
            -t "registry.heroku.com/$APP_NAME/worker" \
            .
    fi

    echo ""
    echo "All images built successfully."
}

# Push images to Heroku
push_images() {
    echo "Pushing images to Heroku Container Registry..."

    if [ "$DEPLOY_WEB" = true ]; then
        echo "Pushing web image..."
        docker push "registry.heroku.com/$APP_NAME/web"
    fi

    if [ "$DEPLOY_SCHEDULER" = true ]; then
        echo "Pushing scheduler image..."
        docker push "registry.heroku.com/$APP_NAME/scheduler"
    fi

    if [ "$DEPLOY_WORKER" = true ]; then
        echo "Pushing worker image..."
        docker push "registry.heroku.com/$APP_NAME/worker"
    fi

    echo ""
}

# Release containers
release_containers() {
    echo "Releasing containers..."

    # Build the list of process types to release
    PROCESS_TYPES=""

    if [ "$DEPLOY_WEB" = true ]; then
        PROCESS_TYPES="web"
    fi

    if [ "$DEPLOY_SCHEDULER" = true ]; then
        if [ -n "$PROCESS_TYPES" ]; then
            PROCESS_TYPES="$PROCESS_TYPES scheduler"
        else
            PROCESS_TYPES="scheduler"
        fi
    fi

    if [ "$DEPLOY_WORKER" = true ]; then
        if [ -n "$PROCESS_TYPES" ]; then
            PROCESS_TYPES="$PROCESS_TYPES worker"
        else
            PROCESS_TYPES="worker"
        fi
    fi

    echo "Releasing: $PROCESS_TYPES"
    heroku container:release --app "$APP_NAME" $PROCESS_TYPES

    echo ""
}

# Deploy to Heroku
deploy() {
    build_images
    push_images
    release_containers

    echo "========================================"
    echo "Deployment complete!"
    echo "========================================"
    echo ""
    echo "Your app is available at:"
    heroku apps:info -a "$APP_NAME" | grep "Web URL" || echo "  https://$APP_NAME.herokuapp.com"
    echo ""
    echo "Process types deployed:"
    if [ "$DEPLOY_WEB" = true ]; then
        echo "  - web (main server)"
    fi
    if [ "$DEPLOY_SCHEDULER" = true ]; then
        echo "  - scheduler (resque scheduler)"
    fi
    if [ "$DEPLOY_WORKER" = true ]; then
        echo "  - worker (resque worker)"
    fi
    echo ""
    echo "Scale workers with:"
    echo "  heroku ps:scale scheduler=1 worker=1 -a $APP_NAME"
    echo ""
    echo "View logs with:"
    echo "  heroku logs --tail -a $APP_NAME"
    echo "  heroku logs --tail --dyno scheduler -a $APP_NAME"
    echo "  heroku logs --tail --dyno worker -a $APP_NAME"
    echo ""
}

# Main
main() {
    check_prerequisites
    setup_heroku_app
    deploy
}

main
