"""Data loading and caching utilities."""

from pathlib import Path
from typing import Optional

import pandas as pd
from rich.console import Console

from ..utils.config import RAW_DATA_DIR, PROCESSED_DATA_DIR, TEAM_STATS_FILE, GAMES_FILE

console = Console()

# Cache directory (same as scraper uses for per-season caching)
CACHE_DIR = RAW_DATA_DIR / "cache"


class DataLoader:
    """Load and manage NCAA basketball data."""

    def __init__(self):
        self._team_stats: Optional[pd.DataFrame] = None
        self._games: Optional[pd.DataFrame] = None

    def load_team_stats(self, force_reload: bool = False) -> pd.DataFrame:
        """
        Load team statistics data.

        Args:
            force_reload: If True, reload from disk even if cached

        Returns:
            DataFrame with team statistics
        """
        if self._team_stats is not None and not force_reload:
            return self._team_stats

        # Try processed data first
        if TEAM_STATS_FILE.exists():
            self._team_stats = pd.read_parquet(TEAM_STATS_FILE)
            return self._team_stats

        # Fall back to raw data (combined file)
        raw_files = sorted(RAW_DATA_DIR.glob("team_stats_*.parquet"), reverse=True)
        if raw_files:
            self._team_stats = pd.read_parquet(raw_files[0])
            return self._team_stats

        # Fall back to per-season cache files
        cache_files = sorted(CACHE_DIR.glob("team_stats_*.parquet"))
        if cache_files:
            dfs = [pd.read_parquet(f) for f in cache_files]
            self._team_stats = pd.concat(dfs, ignore_index=True)
            return self._team_stats

        console.print("[yellow]No team stats data found. Run 'ncaa-predict update-data' to scrape.[/yellow]")
        return pd.DataFrame()

    def load_games(self, force_reload: bool = False) -> pd.DataFrame:
        """
        Load game results data.

        Args:
            force_reload: If True, reload from disk even if cached

        Returns:
            DataFrame with game results
        """
        if self._games is not None and not force_reload:
            return self._games

        # Try processed data first
        if GAMES_FILE.exists():
            self._games = pd.read_parquet(GAMES_FILE)
            return self._games

        # Fall back to raw data (combined file)
        raw_files = sorted(RAW_DATA_DIR.glob("games_*.parquet"), reverse=True)
        if raw_files:
            self._games = pd.read_parquet(raw_files[0])
            return self._games

        # Fall back to per-season cache files
        cache_files = sorted(CACHE_DIR.glob("games_*.parquet"))
        if cache_files:
            dfs = [pd.read_parquet(f) for f in cache_files]
            self._games = pd.concat(dfs, ignore_index=True)
            return self._games

        console.print("[yellow]No games data found. Run 'ncaa-predict update-data' to scrape.[/yellow]")
        return pd.DataFrame()

    def get_team_names(self) -> dict[str, str]:
        """
        Get a mapping of team IDs to team names.

        Returns:
            Dict mapping team_id -> team_name
        """
        team_stats = self.load_team_stats()
        if team_stats.empty:
            return {}

        # Get most recent name for each team
        return (
            team_stats.sort_values("season", ascending=False)
            .drop_duplicates("team_id")
            .set_index("team_id")["team_name"]
            .to_dict()
        )

    def get_team_current_stats(self, team_id: str, season: Optional[int] = None) -> Optional[pd.Series]:
        """
        Get current season stats for a team.

        Args:
            team_id: Sports-Reference team ID
            season: Season year (default: most recent)

        Returns:
            Series with team stats or None if not found
        """
        team_stats = self.load_team_stats()
        if team_stats.empty:
            return None

        if season is None:
            season = team_stats["season"].max()

        mask = (team_stats["team_id"] == team_id) & (team_stats["season"] == season)
        matches = team_stats[mask]

        if matches.empty:
            return None
        return matches.iloc[0]

    def find_team(self, query: str) -> Optional[tuple[str, str]]:
        """
        Find a team by name using fuzzy matching.

        Args:
            query: Team name to search for

        Returns:
            Tuple of (team_id, team_name) or None if not found
        """
        from thefuzz import fuzz, process

        team_names = self.get_team_names()
        if not team_names:
            return None

        # Create lookup with both ID and name
        choices = {f"{name} ({team_id})": team_id for team_id, name in team_names.items()}

        # Also add team IDs directly
        for team_id in team_names:
            choices[team_id] = team_id

        # Find best match
        result = process.extractOne(query, choices.keys(), scorer=fuzz.token_sort_ratio)
        if result is None or result[1] < 60:
            return None

        matched_key = result[0]
        team_id = choices[matched_key]
        team_name = team_names.get(team_id, team_id)

        return (team_id, team_name)

    def save_processed_data(self, team_stats: pd.DataFrame, games: pd.DataFrame):
        """Save processed data for faster loading."""
        if not team_stats.empty:
            team_stats.to_parquet(TEAM_STATS_FILE, index=False)
            console.print(f"[blue]Saved processed team stats to {TEAM_STATS_FILE}[/blue]")

        if not games.empty:
            games.to_parquet(GAMES_FILE, index=False)
            console.print(f"[blue]Saved processed games to {GAMES_FILE}[/blue]")
