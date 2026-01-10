"""Abstract base class for data scrapers."""

import random
import time
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Optional

import pandas as pd
import requests
from rich.console import Console

from ..core.sport import League, SportConfig, get_sport_config, get_current_season
from ..utils.config import get_raw_data_dir

console = Console()


class BaseScraper(ABC):
    """Abstract base scraper with common functionality.

    This class provides common infrastructure for all sport scrapers including:
    - Rate limiting with jitter
    - Response caching for historical seasons
    - Session management
    - Error handling with retries
    """

    def __init__(self, league: League, delay: float = 3.0):
        """Initialize the scraper.

        Args:
            league: The league this scraper handles
            delay: Base delay between requests in seconds
        """
        self.league = league
        self.config: SportConfig = get_sport_config(league)
        self.delay = delay
        self.session = requests.Session()
        self._last_request_time: Optional[float] = None
        self._current_season = get_current_season(league)

        # Set up cache directory
        self.cache_dir = get_raw_data_dir(league) / "cache"
        self.cache_dir.mkdir(parents=True, exist_ok=True)

        # Set up raw data directory
        self.raw_data_dir = get_raw_data_dir(league)

    def _rate_limit(self):
        """Rate limiting with randomized jitter to appear more natural."""
        if self._last_request_time is not None:
            jitter = random.uniform(0.5, 1.5)
            min_delay = self.delay * jitter
            elapsed = time.time() - self._last_request_time
            if elapsed < min_delay:
                time.sleep(min_delay - elapsed)
        self._last_request_time = time.time()

    def _get_cache_path(self, season: int, data_type: str) -> Path:
        """Get cache file path for a season's data.

        Args:
            season: The season year
            data_type: Type of data (e.g., "team_stats", "games")

        Returns:
            Path to the cache file
        """
        return self.cache_dir / f"{data_type}_{season}.parquet"

    def _load_from_cache(self, season: int, data_type: str) -> Optional[pd.DataFrame]:
        """Load data from cache if available.

        Args:
            season: The season year
            data_type: Type of data to load

        Returns:
            DataFrame if cache exists and is valid, None otherwise
        """
        cache_path = self._get_cache_path(season, data_type)
        if cache_path.exists():
            try:
                return pd.read_parquet(cache_path)
            except Exception as e:
                console.print(f"[yellow]Cache read error for {season} {data_type}: {e}[/yellow]")
        return None

    def _save_to_cache(self, df: pd.DataFrame, season: int, data_type: str):
        """Save data to cache.

        Args:
            df: DataFrame to cache
            season: The season year
            data_type: Type of data being cached
        """
        if df.empty:
            return
        cache_path = self._get_cache_path(season, data_type)
        try:
            df.to_parquet(cache_path, index=False)
        except Exception as e:
            console.print(f"[yellow]Cache write error for {season} {data_type}: {e}[/yellow]")

    def _should_use_cache(self, season: int) -> bool:
        """Determine if we should use cached data for this season.

        Historical seasons (completed) should always use cache.
        Current season should always fetch fresh data.

        Args:
            season: The season year

        Returns:
            True if cache should be used, False otherwise
        """
        return season < self._current_season

    @abstractmethod
    def scrape_team_stats(self, season: int) -> pd.DataFrame:
        """Scrape team statistics for a season.

        Args:
            season: The season year to scrape

        Returns:
            DataFrame with team statistics
        """
        pass

    @abstractmethod
    def scrape_games(self, season: int) -> pd.DataFrame:
        """Scrape game results for a season.

        Args:
            season: The season year to scrape

        Returns:
            DataFrame with game results
        """
        pass

    @abstractmethod
    def scrape_all_seasons(
        self, start_season: int, end_season: int, force_refresh: bool = False
    ) -> tuple[pd.DataFrame, pd.DataFrame]:
        """Scrape multiple seasons of data.

        Args:
            start_season: First season to scrape
            end_season: Last season to scrape
            force_refresh: If True, ignore cache and re-fetch all data

        Returns:
            Tuple of (team_stats_df, games_df)
        """
        pass

    def _save_data(self, team_stats: pd.DataFrame, games: pd.DataFrame):
        """Save scraped data to disk with timestamp.

        Args:
            team_stats: Team statistics DataFrame
            games: Games DataFrame
        """
        from datetime import datetime

        timestamp = datetime.now().strftime("%Y%m%d")

        if not team_stats.empty:
            team_stats_path = self.raw_data_dir / f"team_stats_{timestamp}.parquet"
            team_stats.to_parquet(team_stats_path, index=False)
            console.print(f"[blue]Saved team stats to {team_stats_path}[/blue]")

        if not games.empty:
            games_path = self.raw_data_dir / f"games_{timestamp}.parquet"
            games.to_parquet(games_path, index=False)
            console.print(f"[blue]Saved games to {games_path}[/blue]")

    @staticmethod
    def _safe_int(value: str) -> Optional[int]:
        """Safely convert string to int.

        Args:
            value: String value to convert

        Returns:
            Integer value or None if conversion fails
        """
        try:
            return int(str(value).strip().replace(",", ""))
        except (ValueError, AttributeError):
            return None

    @staticmethod
    def _safe_float(value: str) -> Optional[float]:
        """Safely convert string to float.

        Args:
            value: String value to convert

        Returns:
            Float value or None if conversion fails
        """
        try:
            clean = str(value).strip().replace(",", "")
            if clean == "" or clean == "-":
                return None
            return float(clean)
        except (ValueError, AttributeError):
            return None
