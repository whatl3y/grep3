# NCAA Basketball Prediction Web Server
#
# Local usage:
#   docker build -t ncaa-predict .
#   docker run --rm -p 5000:5000 -v ncaa-data:/app/data ncaa-predict
#
# Heroku deployment:
#   ./scripts/deploy-heroku.sh

FROM python:3.11-slim

WORKDIR /app

# Install system dependencies (including OpenMP for XGBoost)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Copy project files
COPY pyproject.toml .
COPY src/ src/

# Create a README.md placeholder for the build (required by pyproject.toml)
RUN echo "# NCAA Predict" > README.md

# Install Python dependencies (including xgboost and web extras)
RUN pip install --no-cache-dir ".[xgboost,web]"

# Create data directories
RUN mkdir -p /app/data/raw /app/data/processed /app/data/models

# Copy pre-trained model and data if available in build context
# For Heroku: data is baked in from local data/ directory
# For local dev: mount a volume over /app/data
COPY data/ /app/data/

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

# Run the web server (uses $PORT from environment)
CMD ["python", "-m", "ncaa_predict.web.app"]
