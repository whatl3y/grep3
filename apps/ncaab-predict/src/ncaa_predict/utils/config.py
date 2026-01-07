"""Configuration management for NCAA Predict."""

import os
from pathlib import Path

# Base paths - use environment variable or default to /app/data for Docker
# For local development, falls back to relative path from source
_default_data_dir = Path(__file__).parent.parent.parent.parent / "data"
DATA_DIR = Path(os.environ.get("NCAA_PREDICT_DATA_DIR", "/app/data"))

# If /app/data doesn't exist (local dev), use relative path
if not DATA_DIR.exists():
    DATA_DIR = _default_data_dir
RAW_DATA_DIR = DATA_DIR / "raw"
PROCESSED_DATA_DIR = DATA_DIR / "processed"
MODELS_DIR = DATA_DIR / "models"

# Ensure directories exist
for dir_path in [RAW_DATA_DIR, PROCESSED_DATA_DIR, MODELS_DIR]:
    dir_path.mkdir(parents=True, exist_ok=True)

# Data collection settings
SCRAPE_DELAY_SECONDS = 5.0  # Be respectful to Sports-Reference (increased to avoid 403s)
START_SEASON = 2020  # First season to collect (2019-20)
END_SEASON = 2026    # Last season to collect (2025-26)

# Model settings
MODEL_FILE = MODELS_DIR / "spread_model.joblib"
TEAM_STATS_FILE = PROCESSED_DATA_DIR / "team_stats.parquet"
GAMES_FILE = PROCESSED_DATA_DIR / "games.parquet"

# Feature settings
HOME_COURT_ADVANTAGE = 3.5  # Points
ROLLING_WINDOW_GAMES = 10   # Games for recent form

# Sports-Reference URLs
SPORTS_REF_BASE = "https://www.sports-reference.com/cbb"
