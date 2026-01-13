"""ESPN API scraper for NFL and NCAA Football."""

from typing import Any, Dict, List, Optional

import pandas as pd
import requests
from rich.console import Console
from rich.progress import Progress, SpinnerColumn, TextColumn, BarColumn

from .base_scraper import BaseScraper
from ..core.sport import League, get_current_season
from ..core.registry import ComponentRegistry

console = Console()

ESPN_BASE_URL = "https://site.api.espn.com/apis/site/v2/sports"


class ESPNScraper(BaseScraper):
    """Scraper for ESPN API (NFL and NCAAF).

    Uses ESPN's public API to fetch team statistics, standings, and game results.
    This scraper is registered for both NFL and NCAAF leagues.
    """

    def __init__(self, league: League, delay: float = 1.0):
        """Initialize the ESPN scraper.

        Args:
            league: The league to scrape (NFL or NCAAF)
            delay: Delay between API requests in seconds
        """
        super().__init__(league, delay)
        self._setup_endpoints()
        self._setup_session()

    def _setup_endpoints(self):
        """Set up ESPN API endpoints based on league."""
        sport = self.config.espn_sport
        league_path = self.config.espn_league

        self.base_url = f"{ESPN_BASE_URL}/{sport}/{league_path}"
        self.teams_url = f"{self.base_url}/teams"
        self.scoreboard_url = f"{self.base_url}/scoreboard"

    def _setup_session(self):
        """Configure session with appropriate headers."""
        self.session.headers.update(
            {
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
                "Accept": "application/json",
                "Accept-Language": "en-US,en;q=0.9",
            }
        )

    def _fetch_json(self, url: str, params: Optional[Dict] = None) -> Optional[Dict[str, Any]]:
        """Fetch JSON from ESPN API.

        Args:
            url: The URL to fetch
            params: Optional query parameters

        Returns:
            Parsed JSON dict or None on error
        """
        self._rate_limit()
        try:
            response = self.session.get(url, params=params, timeout=30)
            response.raise_for_status()
            return response.json()
        except requests.RequestException as e:
            console.print(f"[red]Error fetching {url}: {e}[/red]")
            return None

    def scrape_team_stats(self, season: int) -> pd.DataFrame:
        """Scrape team statistics from ESPN API.

        Args:
            season: The season year to scrape

        Returns:
            DataFrame with team statistics
        """
        console.print(
            f"[dim]Fetching {self.config.display_name} teams for {season}...[/dim]"
        )

        # Get all teams
        params: Dict[str, Any] = {"limit": 500}
        if self.league == League.NCAAF:
            params["groups"] = "80"  # FBS teams only

        data = self._fetch_json(self.teams_url, params)
        if not data:
            return pd.DataFrame()

        teams = []

        # Navigate ESPN response structure
        sports = data.get("sports", [])
        if not sports:
            console.print("[yellow]No sports data in response[/yellow]")
            return pd.DataFrame()

        leagues = sports[0].get("leagues", [])
        if not leagues:
            console.print("[yellow]No leagues data in response[/yellow]")
            return pd.DataFrame()

        team_list = leagues[0].get("teams", [])
        console.print(f"[dim]Found {len(team_list)} teams[/dim]")

        for team_data in team_list:
            team = team_data.get("team", {})
            team_id = team.get("id")

            if not team_id:
                continue

            # Get team statistics
            stats_url = f"{self.teams_url}/{team_id}/statistics"
            stats_params = {"season": season}
            stats_data = self._fetch_json(stats_url, stats_params)

            # Get team record
            record_url = f"{self.teams_url}/{team_id}"
            record_params = {"season": season}
            record_data = self._fetch_json(record_url, record_params)

            team_stats = self._parse_team_stats(team, stats_data, record_data, season)
            if team_stats:
                teams.append(team_stats)

        return pd.DataFrame(teams)

    def _parse_team_stats(
        self,
        team: Dict,
        stats_data: Optional[Dict],
        record_data: Optional[Dict],
        season: int,
    ) -> Optional[Dict]:
        """Parse team statistics from ESPN response.

        Args:
            team: Team info dict
            stats_data: Statistics API response
            record_data: Team record API response
            season: The season year

        Returns:
            Dict with parsed team stats or None
        """
        # Extract record
        wins = 0
        losses = 0

        if record_data:
            team_info = record_data.get("team", {})
            record = team_info.get("record", {})
            items = record.get("items", [])
            if items:
                overall = items[0]
                for stat in overall.get("stats", []):
                    if stat.get("name") == "wins":
                        wins = int(stat.get("value", 0))
                    elif stat.get("name") == "losses":
                        losses = int(stat.get("value", 0))

        # Extract statistics
        stats: Dict[str, Any] = {}
        if stats_data:
            splits = stats_data.get("splits", {})
            categories = splits.get("categories", [])

            for category in categories:
                for stat in category.get("stats", []):
                    stat_name = stat.get("name", "").lower().replace(" ", "_")
                    stat_value = stat.get("value")
                    if stat_value is not None:
                        stats[stat_name] = stat_value

        # Calculate derived stats
        games = wins + losses if (wins + losses) > 0 else 1
        win_pct = wins / games if games > 0 else 0.0

        return {
            "season": season,
            "team_id": team.get("abbreviation", "").lower(),
            "team_name": team.get("displayName"),
            "espn_id": team.get("id"),
            "wins": wins,
            "losses": losses,
            "games": games,
            "win_pct": win_pct,
            # Football-specific stats
            "pts_per_game": stats.get("pointsPerGame", stats.get("points_per_game")),
            "pts_allowed": stats.get(
                "pointsAgainstPerGame", stats.get("points_against_per_game")
            ),
            "pass_yds": stats.get(
                "netPassingYardsPerGame", stats.get("passing_yards_per_game")
            ),
            "rush_yds": stats.get(
                "rushingYardsPerGame", stats.get("rushing_yards_per_game")
            ),
            "total_yds": stats.get(
                "totalYardsPerGame", stats.get("total_yards_per_game")
            ),
            "turnovers": stats.get("totalGiveaways", stats.get("turnovers")),
            "takeaways": stats.get("totalTakeaways", stats.get("takeaways")),
            "third_down_pct": stats.get(
                "thirdDownConvPct", stats.get("third_down_conversion_pct")
            ),
            "red_zone_pct": stats.get(
                "redZoneScoringPct", stats.get("red_zone_scoring_pct")
            ),
            "time_possession": stats.get(
                "avgTimeOfPossession", stats.get("time_of_possession")
            ),
            # SRS placeholder (would need to calculate or get from elsewhere)
            "srs": 0.0,
            "sos": 0.0,
        }

    def scrape_games(self, season: int) -> pd.DataFrame:
        """Scrape game results from ESPN API.

        Args:
            season: The season year to scrape

        Returns:
            DataFrame with game results
        """
        console.print(
            f"[dim]Fetching {self.config.display_name} games for {season}...[/dim]"
        )

        games = []

        # Iterate through weeks
        max_weeks = 18 if self.league == League.NFL else 16

        for week in range(1, max_weeks + 1):
            params = {
                "dates": season,
                "seasontype": 2,  # Regular season
                "week": week,
                "limit": 100,
            }

            data = self._fetch_json(self.scoreboard_url, params)
            if not data:
                continue

            events = data.get("events", [])
            for event in events:
                game = self._parse_game(event, season)
                if game:
                    games.append(game)

        # Also get postseason games
        for week in range(1, 5):
            params = {
                "dates": season,
                "seasontype": 3,  # Postseason
                "week": week,
                "limit": 100,
            }

            data = self._fetch_json(self.scoreboard_url, params)
            if not data:
                continue

            events = data.get("events", [])
            for event in events:
                game = self._parse_game(event, season)
                if game:
                    games.append(game)

        return pd.DataFrame(games)

    def _parse_game(self, event: Dict, season: int) -> Optional[Dict]:
        """Parse a single game from ESPN event data.

        Args:
            event: Event dict from ESPN API
            season: The season year

        Returns:
            Dict with parsed game data or None
        """
        # Check if game is completed
        status = event.get("status", {})
        if status.get("type", {}).get("completed") != True:
            return None

        competitions = event.get("competitions", [])
        if not competitions:
            return None

        competition = competitions[0]
        competitors = competition.get("competitors", [])

        if len(competitors) != 2:
            return None

        home_team = None
        away_team = None

        for comp in competitors:
            if comp.get("homeAway") == "home":
                home_team = comp
            elif comp.get("homeAway") == "away":
                away_team = comp

        if not home_team or not away_team:
            return None

        try:
            home_score = int(home_team.get("score", 0))
            away_score = int(away_team.get("score", 0))
        except (ValueError, TypeError):
            return None

        return {
            "season": season,
            "date": event.get("date", ""),
            "home_team_id": home_team.get("team", {}).get("abbreviation", "").lower(),
            "away_team_id": away_team.get("team", {}).get("abbreviation", "").lower(),
            "home_team_name": home_team.get("team", {}).get("displayName"),
            "away_team_name": away_team.get("team", {}).get("displayName"),
            "home_score": home_score,
            "away_score": away_score,
            "point_diff": home_score - away_score,
            "neutral_site": competition.get("neutralSite", False),
        }

    def _supplement_missing_teams(
        self, team_stats: pd.DataFrame, games: pd.DataFrame
    ) -> pd.DataFrame:
        """Add missing teams that appear in games but not in team stats.

        ESPN's teams API sometimes doesn't return all teams (e.g., Tennessee Volunteers
        is often missing). This method extracts teams from games data and fetches
        their stats individually.

        Args:
            team_stats: Existing team statistics DataFrame
            games: Games DataFrame with team info

        Returns:
            Updated team_stats DataFrame with missing teams added
        """
        if team_stats.empty or games.empty:
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
            f"[yellow]Found {len(missing_team_ids)} teams in games missing from teams API[/yellow]"
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
                        pts = game["home_score"]
                        opp_pts = game["away_score"]
                    else:
                        pts = game["away_score"]
                        opp_pts = game["home_score"]

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
                        "espn_id": None,
                        "wins": wins,
                        "losses": losses,
                        "games": num_games,
                        "win_pct": wins / num_games,
                        "pts_per_game": total_pts / num_games,
                        "pts_allowed": total_pts_allowed / num_games,
                        # Other stats will be None/NaN
                        "pass_yds": None,
                        "rush_yds": None,
                        "total_yds": None,
                        "turnovers": None,
                        "takeaways": None,
                        "third_down_pct": None,
                        "red_zone_pct": None,
                        "time_possession": None,
                        "srs": None,
                        "sos": None,
                    })

            console.print(f"  [dim]Added {team_name} ({team_id})[/dim]")

        if new_team_rows:
            new_teams_df = pd.DataFrame(new_team_rows)
            team_stats = pd.concat([team_stats, new_teams_df], ignore_index=True)
            console.print(
                f"[green]Added {len(new_team_rows)} missing team-seasons from games data[/green]"
            )

        return team_stats

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
        all_team_stats = []
        all_games = []

        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            BarColumn(),
            TextColumn("[progress.percentage]{task.percentage:>3.0f}%"),
            console=console,
        ) as progress:
            seasons = list(range(start_season, end_season + 1))
            task = progress.add_task(
                f"Scraping {self.config.display_name}...", total=len(seasons)
            )

            for season in seasons:
                use_cache = self._should_use_cache(season) and not force_refresh

                if use_cache:
                    cached_stats = self._load_from_cache(season, "team_stats")
                    cached_games = self._load_from_cache(season, "games")

                    if cached_stats is not None and cached_games is not None:
                        progress.update(
                            task, description=f"Season {season} [dim](cached)[/dim]"
                        )
                        all_team_stats.append(cached_stats)
                        all_games.append(cached_games)
                        console.print(
                            f"  [cyan]Loaded {len(cached_stats)} teams, {len(cached_games)} games from cache[/cyan]"
                        )
                        progress.advance(task)
                        continue

                progress.update(
                    task, description=f"Season {season} [dim](fetching)[/dim]"
                )

                # Fetch team stats
                team_stats = self.scrape_team_stats(season)
                is_historical = season < self._current_season

                if not team_stats.empty:
                    all_team_stats.append(team_stats)
                    console.print(f"  [green]Found {len(team_stats)} teams[/green]")

                    if is_historical:
                        self._save_to_cache(team_stats, season, "team_stats")

                # Fetch games
                games = self.scrape_games(season)
                if not games.empty:
                    all_games.append(games)
                    console.print(f"  [green]Found {len(games)} games[/green]")

                    if is_historical:
                        self._save_to_cache(games, season, "games")

                progress.advance(task)

        # Combine all data
        team_stats_df = (
            pd.concat(all_team_stats, ignore_index=True)
            if all_team_stats
            else pd.DataFrame()
        )
        games_df = (
            pd.concat(all_games, ignore_index=True) if all_games else pd.DataFrame()
        )

        # Supplement missing teams from games data
        # ESPN teams API sometimes misses teams that appear in games
        if not games_df.empty and not team_stats_df.empty:
            team_stats_df = self._supplement_missing_teams(team_stats_df, games_df)

        # Save combined data
        self._save_data(team_stats_df, games_df)

        console.print(
            f"\n[bold green]Scraped {len(team_stats_df)} team-seasons and {len(games_df)} games[/bold green]"
        )
        return team_stats_df, games_df


# Register for NFL and NCAAF leagues
@ComponentRegistry.register_scraper(League.NFL)
class NFLScraper(ESPNScraper):
    """NFL-specific scraper using ESPN API."""

    def __init__(self, league: League = League.NFL, delay: float = 1.0):
        super().__init__(League.NFL, delay)


@ComponentRegistry.register_scraper(League.NCAAF)
class NCAAFScraper(ESPNScraper):
    """NCAA Football-specific scraper using ESPN API."""

    def __init__(self, league: League = League.NCAAF, delay: float = 1.0):
        super().__init__(League.NCAAF, delay)
