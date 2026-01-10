"""Configuration management for Sports Predict."""

import os
from pathlib import Path
from typing import Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from ..core.sport import League

# Base paths - use environment variable or default to /app/data for Docker
# For local development, falls back to relative path from source
_default_data_dir = Path(__file__).parent.parent.parent.parent / "data"
BASE_DATA_DIR = Path(os.environ.get("SPORTS_PREDICT_DATA_DIR", "/app/data"))

# If /app/data doesn't exist (local dev), use relative path
if not BASE_DATA_DIR.exists():
    BASE_DATA_DIR = _default_data_dir

# Ensure base directories exist
BASE_DATA_DIR.mkdir(parents=True, exist_ok=True)
(BASE_DATA_DIR / "models").mkdir(parents=True, exist_ok=True)


def get_data_dir(league: Optional["League"] = None) -> Path:
    """Get data directory for a specific league or base directory.

    Args:
        league: Optional league to get sport-specific directory

    Returns:
        Path to data directory
    """
    if league is None:
        return BASE_DATA_DIR
    return BASE_DATA_DIR / league.value


def get_raw_data_dir(league: "League") -> Path:
    """Get raw data directory for a league.

    Args:
        league: The league to get the raw data directory for

    Returns:
        Path to raw data directory (created if doesn't exist)
    """
    path = get_data_dir(league) / "raw"
    path.mkdir(parents=True, exist_ok=True)
    return path


def get_processed_data_dir(league: "League") -> Path:
    """Get processed data directory for a league.

    Args:
        league: The league to get the processed data directory for

    Returns:
        Path to processed data directory (created if doesn't exist)
    """
    path = get_data_dir(league) / "processed"
    path.mkdir(parents=True, exist_ok=True)
    return path


def get_models_dir() -> Path:
    """Get models directory (shared across sports).

    Returns:
        Path to models directory (created if doesn't exist)
    """
    path = BASE_DATA_DIR / "models"
    path.mkdir(parents=True, exist_ok=True)
    return path


def get_model_path(league: "League") -> Path:
    """Get model file path for a league.

    Args:
        league: The league to get the model path for

    Returns:
        Path to the model file
    """
    from ..core.sport import get_sport_config

    config = get_sport_config(league)
    return get_models_dir() / config.model_file_name


def get_team_stats_file(league: "League") -> Path:
    """Get team stats file path for a league.

    Args:
        league: The league to get the team stats file for

    Returns:
        Path to the team stats parquet file
    """
    return get_processed_data_dir(league) / "team_stats.parquet"


def get_games_file(league: "League") -> Path:
    """Get games file path for a league.

    Args:
        league: The league to get the games file for

    Returns:
        Path to the games parquet file
    """
    return get_processed_data_dir(league) / "games.parquet"


# Default settings
SCRAPE_DELAY_SECONDS = 3.0

# Season ranges per sport (imported lazily to avoid circular imports)
def get_season_range(league: "League") -> tuple[int, int]:
    """Get default season range for a league.

    Args:
        league: The league to get the season range for

    Returns:
        Tuple of (start_season, end_season)
    """
    from ..core.sport import League

    ranges = {
        League.NCAAB: (2020, 2026),
        League.NFL: (2020, 2025),
        League.NCAAF: (2020, 2025),
    }
    return ranges.get(league, (2020, 2025))


# Legacy compatibility - for NCAAB (the original sport)
# These are kept for backward compatibility with existing code
def _init_legacy_paths():
    """Initialize legacy paths for backward compatibility."""
    from ..core.sport import League

    global DATA_DIR, RAW_DATA_DIR, PROCESSED_DATA_DIR, MODELS_DIR
    global MODEL_FILE, TEAM_STATS_FILE, GAMES_FILE

    DATA_DIR = BASE_DATA_DIR
    RAW_DATA_DIR = get_raw_data_dir(League.NCAAB)
    PROCESSED_DATA_DIR = get_processed_data_dir(League.NCAAB)
    MODELS_DIR = get_models_dir()
    MODEL_FILE = get_model_path(League.NCAAB)
    TEAM_STATS_FILE = get_team_stats_file(League.NCAAB)
    GAMES_FILE = get_games_file(League.NCAAB)


# Legacy variables - will be initialized on first import from core module
DATA_DIR = BASE_DATA_DIR
RAW_DATA_DIR = BASE_DATA_DIR / "ncaab" / "raw"
PROCESSED_DATA_DIR = BASE_DATA_DIR / "ncaab" / "processed"
MODELS_DIR = BASE_DATA_DIR / "models"

# Ensure NCAAB directories exist
RAW_DATA_DIR.mkdir(parents=True, exist_ok=True)
PROCESSED_DATA_DIR.mkdir(parents=True, exist_ok=True)

# Legacy model settings (NCAAB)
MODEL_FILE = MODELS_DIR / "ncaab_model.joblib"
TEAM_STATS_FILE = PROCESSED_DATA_DIR / "team_stats.parquet"
GAMES_FILE = PROCESSED_DATA_DIR / "games.parquet"

# Legacy feature settings (NCAAB)
HOME_COURT_ADVANTAGE = 3.5  # Points
ROLLING_WINDOW_GAMES = 10  # Games for recent form

# Legacy data collection settings
START_SEASON = 2020
END_SEASON = 2026

# Sports-Reference URLs
SPORTS_REF_BASE = "https://www.sports-reference.com/cbb"
