#!/bin/bash
set -e

# Sports Predictor - Heroku Container Deployment Script
#
# This script:
# 1. Runs the training pipeline (if needed) to generate model and data
# 2. Extracts data from Docker volume to local directory
# 3. Builds Docker image and pushes to Heroku Container Registry
# 4. Releases the container on Heroku
#
# Prerequisites:
#   - Docker installed and running
#   - Heroku CLI installed and logged in (heroku login + heroku container:login)
#
# Usage:
#   ./deploy-heroku.sh [OPTIONS] [APP_NAME]
#
# Options:
#   --skip-sync    Skip syncing data from Docker volume (use existing local data)
#
# If APP_NAME is not provided, it will use 'grep3-sports-predict' as default
# or prompt you to create a new app.

# Parse arguments
SKIP_SYNC=false
APP_NAME="grep3-sports-predict"

while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-sync)
            SKIP_SYNC=true
            shift
            ;;
        *)
            APP_NAME="$1"
            shift
            ;;
    esac
done
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="$PROJECT_DIR/data"
IMAGE_NAME="sports-predict"

echo "========================================"
echo "Sports Predictor"
echo "Heroku Container Deployment"
echo "========================================"
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

# Sync data from Docker volume to local directory
sync_data_from_volume() {
    echo "Syncing data from Docker volume to local directory..."

    # Check if Docker volume exists
    if ! docker volume inspect sports-predict-data &> /dev/null; then
        echo "Warning: Docker volume 'sports-predict-data' not found."
        echo "Skipping sync. Using existing local data if available."
        return 1
    fi

    # Check if a container is using the volume (get data from running container)
    CONTAINER_NAME=$(docker ps --filter "volume=sports-predict-data" --format "{{.Names}}" | head -1)

    if [ -n "$CONTAINER_NAME" ]; then
        echo "Found running container: $CONTAINER_NAME"
        echo "Copying data from container..."
        mkdir -p "$DATA_DIR"
        docker cp "$CONTAINER_NAME:/app/data/." "$DATA_DIR/"
    else
        echo "No running container found. Extracting from volume..."
        extract_data_from_volume
    fi

    echo "Data synced to $DATA_DIR"
    return 0
}

# Check if data exists, if not run setup
ensure_data_exists() {
    # Always sync from Docker volume unless --skip-sync was passed
    if [ "$SKIP_SYNC" = false ]; then
        sync_data_from_volume
    else
        echo "Skipping data sync (--skip-sync flag provided)"
    fi

    echo ""
    echo "Checking for trained model..."

    # Check if data directory has the required files
    if [ -f "$DATA_DIR/models/spread_model.joblib" ] && \
       [ -f "$DATA_DIR/processed/team_stats.parquet" ]; then
        echo "Found trained model and data."
        return 0
    fi

    echo "No trained model found in local data directory."
    echo ""
    echo "Options:"
    echo "  1. Run 'docker compose run --rm setup' to scrape and train"
    echo "  2. Run 'docker compose run --rm train' if data already scraped"
    echo ""
    echo "This will scrape data and train the model (may take 10-15 minutes)."
    echo ""
    read -p "Run setup now? (y/n) " -n 1 -r
    echo ""

    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Aborted. Please run setup manually first."
        exit 1
    fi

    # Run the setup pipeline
    cd "$PROJECT_DIR"
    docker compose run --rm setup

    # Sync data from volume after setup
    sync_data_from_volume
}

# Extract data from Docker volume to local directory
extract_data_from_volume() {
    echo "Extracting data from Docker volume..."

    # Create local data directories
    mkdir -p "$DATA_DIR/raw" "$DATA_DIR/processed" "$DATA_DIR/models"

    # Use a temporary container to copy data from volume
    docker run --rm \
        -v sports-predict-data:/source:ro \
        -v "$DATA_DIR":/dest \
        alpine sh -c "cp -r /source/* /dest/ 2>/dev/null || true"

    echo "Data extracted to $DATA_DIR"
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

# Deploy to Heroku using Container Registry
deploy() {
    echo "Deploying to Heroku Container Registry..."
    echo ""

    cd "$PROJECT_DIR"

    # Build Docker image for linux/amd64 (Heroku's platform)
    echo "Building Docker image for linux/amd64..."
    docker buildx build --platform linux/amd64 -t "$IMAGE_NAME" .

    # Tag for Heroku registry
    echo "Tagging image for Heroku registry..."
    docker tag "$IMAGE_NAME" "registry.heroku.com/$APP_NAME/web"

    # Push to Heroku Container Registry
    echo "Pushing image to Heroku (this may take a few minutes)..."
    docker push "registry.heroku.com/$APP_NAME/web"

    # Release the container
    echo "Releasing container..."
    heroku container:release --app "$APP_NAME" web

    echo ""
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
}

# Main
main() {
    check_prerequisites
    ensure_data_exists
    setup_heroku_app
    deploy
}

main
