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

        team_stats = None

        # Try processed data first
        if self.team_stats_file.exists():
            team_stats = pd.read_parquet(self.team_stats_file)

        # Fall back to raw data (combined file)
        if team_stats is None:
            raw_files = sorted(self.raw_data_dir.glob("team_stats_*.parquet"), reverse=True)
            if raw_files:
                team_stats = pd.read_parquet(raw_files[0])

        # Fall back to per-season cache files
        if team_stats is None:
            cache_files = sorted(self.cache_dir.glob("team_stats_*.parquet"))
            if cache_files:
                dfs = [pd.read_parquet(f) for f in cache_files]
                team_stats = pd.concat(dfs, ignore_index=True)

        if team_stats is None or team_stats.empty:
            console.print(
                f"[yellow]No {self.config.display_name} team stats found. "
                f"Run 'sports-predict update-data --sport {self.league.value}' to fetch data.[/yellow]"
            )
            return pd.DataFrame()

        # Supplement missing teams from games data (ESPN API sometimes misses teams)
        team_stats = self._supplement_missing_teams_on_load(team_stats)

        self._team_stats = team_stats
        return self._team_stats

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

    def _supplement_missing_teams_on_load(
        self, team_stats: pd.DataFrame
    ) -> pd.DataFrame:
        """Supplement team stats with missing teams from games data.

        ESPN's teams API sometimes doesn't return all teams (e.g., Tennessee Volunteers).
        This method extracts teams from games data and adds them to team_stats.

        Args:
            team_stats: Team statistics DataFrame

        Returns:
            Updated team_stats with missing teams added
        """
        # Only applies to ESPN-based leagues (NFL, NCAAF)
        if self.league not in (League.NFL, League.NCAAF):
            return team_stats

        # Load games data
        games = self.load_games()
        if games.empty:
            return team_stats

        # Get all team IDs that appear in games
        game_team_ids = set()
        game_team_names = {}

        for _, game in games.iterrows():
            home_id = game.get("home_team_id")
            away_id = game.get("away_team_id")
            if home_id:
                game_team_ids.add(home_id)
                if game.get("home_team_name"):
                    game_team_names[home_id] = game["home_team_name"]
            if away_id:
                game_team_ids.add(away_id)
                if game.get("away_team_name"):
                    game_team_names[away_id] = game["away_team_name"]

        # Find teams in games that aren't in team_stats
        existing_team_ids = set(team_stats["team_id"].unique())
        missing_team_ids = game_team_ids - existing_team_ids

        if not missing_team_ids:
            return team_stats

        console.print(
            f"[yellow]Found {len(missing_team_ids)} teams in games missing from teams data[/yellow]"
        )

        # For each missing team, create basic stats from games data
        new_team_rows = []
        for team_id in missing_team_ids:
            team_name = game_team_names.get(team_id, team_id.upper())

            # Get all games for this team by season
            team_games = games[
                (games["home_team_id"] == team_id) | (games["away_team_id"] == team_id)
            ]

            for season in team_games["season"].unique():
                season_games = team_games[team_games["season"] == season]

                # Calculate basic stats from games
                wins = 0
                losses = 0
                total_pts = 0
                total_pts_allowed = 0

                for _, game in season_games.iterrows():
                    if game["home_team_id"] == team_id:
                        pts = game.get("home_score", 0)
                        opp_pts = game.get("away_score", 0)
                    else:
                        pts = game.get("away_score", 0)
                        opp_pts = game.get("home_score", 0)

                    total_pts += pts
                    total_pts_allowed += opp_pts
                    if pts > opp_pts:
                        wins += 1
                    else:
                        losses += 1

                num_games = wins + losses
                if num_games > 0:
                    new_team_rows.append({
                        "season": season,
                        "team_id": team_id,
                        "team_name": team_name,
                        "wins": wins,
                        "losses": losses,
                        "games": num_games,
                        "win_pct": wins / num_games,
                        "pts_per_game": total_pts / num_games,
                        "pts_allowed": total_pts_allowed / num_games,
                    })

            console.print(f"  [dim]Added {team_name} ({team_id})[/dim]")

        if new_team_rows:
            new_teams_df = pd.DataFrame(new_team_rows)
            team_stats = pd.concat([team_stats, new_teams_df], ignore_index=True)
            console.print(
                f"[green]Added {len(new_team_rows)} missing team-seasons from games data[/green]"
            )

        return team_stats

    def save_processed_data(self, team_stats: pd.DataFrame, games: pd.DataFrame):
        """Save processed data for faster loading.

        Args:
            team_stats: Processed team statistics DataFrame
            games: Processed games DataFrame
        """
        if not team_stats.empty:
            # Make a copy and convert object columns to strings to avoid pyarrow issues
            stats_to_save = team_stats.copy()
            for col in stats_to_save.columns:
                if stats_to_save[col].dtype == "object":
                    stats_to_save[col] = stats_to_save[col].astype(str)
            try:
                stats_to_save.to_parquet(self.team_stats_file, index=False)
                console.print(f"[blue]Saved processed team stats to {self.team_stats_file}[/blue]")
            except Exception as e:
                console.print(f"[yellow]Warning: Could not save team stats to parquet: {e}[/yellow]")

        if not games.empty:
            # Make a copy and convert object columns to strings to avoid pyarrow issues
            games_to_save = games.copy()
            for col in games_to_save.columns:
                if games_to_save[col].dtype == "object":
                    games_to_save[col] = games_to_save[col].astype(str)
            try:
                games_to_save.to_parquet(self.games_file, index=False)
                console.print(f"[blue]Saved processed games to {self.games_file}[/blue]")
            except Exception as e:
                console.print(f"[yellow]Warning: Could not save games to parquet: {e}[/yellow]")
