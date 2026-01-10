"""Data loading and caching utilities."""

from pathlib import Path
from typing import Optional

import pandas as pd
from rich.console import Console

from ..core.sport import League, get_sport_config
from ..utils.config import (
    get_raw_data_dir,
    get_processed_data_dir,
    get_team_stats_file,
    get_games_file,
)

console = Console()


class DataLoader:
    """Load and manage sports data.

    This loader handles data for any supported league (NCAAB, NFL, NCAAF).
    Data is loaded from processed parquet files, falling back to raw data
    and per-season cache files if needed.
    """

    def __init__(self, league: League = League.NCAAB):
        """Initialize the data loader.

        Args:
            league: The league to load data for
        """
        self.league = league
        self.config = get_sport_config(league)
        self._team_stats: Optional[pd.DataFrame] = None
        self._games: Optional[pd.DataFrame] = None

    @property
    def raw_data_dir(self) -> Path:
        """Get the raw data directory for this league."""
        return get_raw_data_dir(self.league)

    @property
    def processed_data_dir(self) -> Path:
        """Get the processed data directory for this league."""
        return get_processed_data_dir(self.league)

    @property
    def team_stats_file(self) -> Path:
        """Get the team stats file path for this league."""
        return get_team_stats_file(self.league)

    @property
    def games_file(self) -> Path:
        """Get the games file path for this league."""
        return get_games_file(self.league)

    @property
    def cache_dir(self) -> Path:
        """Get the cache directory for this league."""
        cache = self.raw_data_dir / "cache"
        cache.mkdir(parents=True, exist_ok=True)
        return cache

    def load_team_stats(self, force_reload: bool = False) -> pd.DataFrame:
        """Load team statistics data.

        Args:
            force_reload: If True, reload from disk even if cached

        Returns:
            DataFrame with team statistics
        """
        if self._team_stats is not None and not force_reload:
            return self._team_stats

        # Try processed data first
        if self.team_stats_file.exists():
            self._team_stats = pd.read_parquet(self.team_stats_file)
            return self._team_stats

        # Fall back to raw data (combined file)
        raw_files = sorted(self.raw_data_dir.glob("team_stats_*.parquet"), reverse=True)
        if raw_files:
            self._team_stats = pd.read_parquet(raw_files[0])
            return self._team_stats

        # Fall back to per-season cache files
        cache_files = sorted(self.cache_dir.glob("team_stats_*.parquet"))
        if cache_files:
            dfs = [pd.read_parquet(f) for f in cache_files]
            self._team_stats = pd.concat(dfs, ignore_index=True)
            return self._team_stats

        console.print(
            f"[yellow]No {self.config.display_name} team stats found. "
            f"Run 'sports-predict update-data --sport {self.league.value}' to fetch data.[/yellow]"
        )
        return pd.DataFrame()

    def load_games(self, force_reload: bool = False) -> pd.DataFrame:
        """Load game results data.

        Args:
            force_reload: If True, reload from disk even if cached

        Returns:
            DataFrame with game results
        """
        if self._games is not None and not force_reload:
            return self._games

        # Try processed data first
        if self.games_file.exists():
            self._games = pd.read_parquet(self.games_file)
            return self._games

        # Fall back to raw data (combined file)
        raw_files = sorted(self.raw_data_dir.glob("games_*.parquet"), reverse=True)
        if raw_files:
            self._games = pd.read_parquet(raw_files[0])
            return self._games

        # Fall back to per-season cache files
        cache_files = sorted(self.cache_dir.glob("games_*.parquet"))
        if cache_files:
            dfs = [pd.read_parquet(f) for f in cache_files]
            self._games = pd.concat(dfs, ignore_index=True)
            return self._games

        console.print(
            f"[yellow]No {self.config.display_name} games found. "
            f"Run 'sports-predict update-data --sport {self.league.value}' to fetch data.[/yellow]"
        )
        return pd.DataFrame()

    def get_team_names(self) -> dict[str, str]:
        """Get a mapping of team IDs to team names.

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

    def get_team_current_stats(
        self, team_id: str, season: Optional[int] = None
    ) -> Optional[pd.Series]:
        """Get current season stats for a team.

        Args:
            team_id: Team ID (e.g., 'duke' for NCAAB, 'KC' for NFL)
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
        """Find a team by name using fuzzy matching.

        Searches team names, IDs, and aliases (acronyms, nicknames, locations).

        Args:
            query: Team name to search for

        Returns:
            Tuple of (team_id, team_name) or None if not found
        """
        from thefuzz import fuzz, process
        from .team_aliases import get_team_search_terms

        team_names = self.get_team_names()
        if not team_names:
            return None

        # Create lookup with team ID, name, and all aliases
        choices: dict[str, str] = {}
        for team_id, name in team_names.items():
            # Add standard entries
            choices[f"{name} ({team_id})"] = team_id
            choices[team_id] = team_id

            # Add all aliases for this team
            search_terms = get_team_search_terms(team_id, name, self.league.value)
            for term in search_terms:
                # Map each alias back to the team_id
                if term not in choices:
                    choices[term] = team_id

        # Find best match
        result = process.extractOne(query, choices.keys(), scorer=fuzz.token_sort_ratio)
        if result is None or result[1] < 60:
            return None

        matched_key = result[0]
        team_id = choices[matched_key]
        team_name = team_names.get(team_id, team_id)

        return (team_id, team_name)

    def get_teams_with_aliases(self) -> list[dict]:
        """Get teams with searchable aliases for UI dropdowns.

        Returns:
            List of dicts with id, name, and search_terms for each team
        """
        from .team_aliases import get_team_search_terms

        team_names = self.get_team_names()
        if not team_names:
            return []

        teams = []
        for team_id, name in team_names.items():
            search_terms = get_team_search_terms(team_id, name, self.league.value)
            teams.append({
                "id": team_id,
                "name": name,
                "search_terms": " ".join(search_terms),
            })

        return sorted(teams, key=lambda x: x["name"])

    def save_processed_data(self, team_stats: pd.DataFrame, games: pd.DataFrame):
        """Save processed data for faster loading.

        Args:
            team_stats: Processed team statistics DataFrame
            games: Processed games DataFrame
        """
        if not team_stats.empty:
            team_stats.to_parquet(self.team_stats_file, index=False)
            console.print(f"[blue]Saved processed team stats to {self.team_stats_file}[/blue]")

        if not games.empty:
            games.to_parquet(self.games_file, index=False)
            console.print(f"[blue]Saved processed games to {self.games_file}[/blue]")
