"""Data scraper for NCAA basketball statistics from Sports-Reference."""

import random
import time
from datetime import datetime
from pathlib import Path
from typing import Optional

import pandas as pd
import requests
from bs4 import BeautifulSoup
from rich.console import Console
from rich.progress import Progress, SpinnerColumn, TextColumn, BarColumn

from ..utils.config import (
    SCRAPE_DELAY_SECONDS,
    SPORTS_REF_BASE,
    RAW_DATA_DIR,
    START_SEASON,
    END_SEASON,
)

console = Console()

# Cache directory for per-season data
CACHE_DIR = RAW_DATA_DIR / "cache"
CACHE_DIR.mkdir(parents=True, exist_ok=True)


def get_current_season() -> int:
    """Get the current NCAA basketball season year.

    The season year is the year the season ends (e.g., 2024-25 season = 2025).
    Season typically runs November to April.
    """
    now = datetime.now()
    # If we're in Jan-June, we're in the season that ends this year
    # If we're in July-Dec, we're approaching the season that ends next year
    if now.month <= 6:
        return now.year
    else:
        return now.year + 1


# Common browser user agents for rotation
USER_AGENTS = [
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
]


class NCAADataScraper:
    """Scrapes NCAA basketball data from Sports-Reference.com."""

    def __init__(self, delay: float = SCRAPE_DELAY_SECONDS):
        self.delay = delay
        self.session = requests.Session()
        self._update_headers()
        self._last_request_time: Optional[float] = None
        self._current_season = get_current_season()
        self._request_count = 0
        self._session_initialized = False

    def _init_session(self):
        """Initialize session by visiting the main page to get cookies."""
        if self._session_initialized:
            return

        try:
            # Visit main CBB page to establish session/cookies
            self._rate_limit()
            response = self.session.get(
                f"{SPORTS_REF_BASE}/",
                timeout=30,
                allow_redirects=True,
            )
            if response.ok:
                self._session_initialized = True
                console.print("[dim]Session initialized[/dim]")
        except requests.RequestException:
            pass  # Continue anyway

    def _update_headers(self):
        """Update session headers with browser-like headers."""
        self.session.headers.update({
            "User-Agent": random.choice(USER_AGENTS),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Accept-Encoding": "gzip, deflate, br",
            "Connection": "keep-alive",
            "Upgrade-Insecure-Requests": "1",
            "Sec-Fetch-Dest": "document",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-Site": "same-origin",
            "Sec-Fetch-User": "?1",
            "Sec-Ch-Ua": '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
            "Sec-Ch-Ua-Mobile": "?0",
            "Sec-Ch-Ua-Platform": '"macOS"',
            "Cache-Control": "max-age=0",
            "Referer": "https://www.sports-reference.com/cbb/",
        })

    def _rate_limit(self):
        """Ensure we don't hammer the server with randomized delays."""
        if self._last_request_time is not None:
            # Add some randomness to appear more human-like
            jitter = random.uniform(0.5, 1.5)
            min_delay = self.delay * jitter
            elapsed = time.time() - self._last_request_time
            if elapsed < min_delay:
                time.sleep(min_delay - elapsed)

        # Rotate user agent every 10 requests
        self._request_count += 1
        if self._request_count % 10 == 0:
            self._update_headers()

        self._last_request_time = time.time()

    def _get_cache_path(self, season: int, data_type: str) -> Path:
        """Get the cache file path for a season's data."""
        return CACHE_DIR / f"{data_type}_{season}.parquet"

    def _load_from_cache(self, season: int, data_type: str) -> Optional[pd.DataFrame]:
        """Load data from cache if available."""
        cache_path = self._get_cache_path(season, data_type)
        if cache_path.exists():
            try:
                return pd.read_parquet(cache_path)
            except Exception as e:
                console.print(f"[yellow]Cache read error for {season} {data_type}: {e}[/yellow]")
        return None

    def _save_to_cache(self, df: pd.DataFrame, season: int, data_type: str):
        """Save data to cache."""
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
        """
        return season < self._current_season

    def _fetch_page(self, url: str, max_retries: int = 3) -> Optional[BeautifulSoup]:
        """Fetch a page and return parsed HTML with retry logic."""
        # Initialize session on first request
        self._init_session()

        for attempt in range(max_retries):
            self._rate_limit()
            try:
                response = self.session.get(url, timeout=30)
                response.raise_for_status()
                return BeautifulSoup(response.content, "lxml")
            except requests.RequestException as e:
                if attempt < max_retries - 1:
                    # Exponential backoff: 10s, 20s, 40s...
                    wait_time = 10 * (2 ** attempt)
                    if "403" in str(e):
                        # For 403s, wait longer and rotate headers
                        wait_time *= 2
                        self._update_headers()
                        console.print(f"[yellow]Rate limited, waiting {wait_time}s before retry...[/yellow]")
                    time.sleep(wait_time)
                else:
                    console.print(f"[red]Error fetching {url}: {e}[/red]")
                    return None
        return None

    def get_season_schedule(self, season: int) -> pd.DataFrame:
        """
        Get all games for a season.

        Args:
            season: The ending year of the season (e.g., 2024 for 2023-24 season)

        Returns:
            DataFrame with game results
        """
        url = f"{SPORTS_REF_BASE}/seasons/{season}-school-stats.html"
        console.print(f"  [dim]Fetching {url}[/dim]")
        soup = self._fetch_page(url)
        if soup is None:
            console.print(f"  [red]Failed to fetch page for season {season}[/red]")
            return pd.DataFrame()

        # Find the main stats table
        table = soup.find("table", {"id": "basic_school_stats"})
        if table is None:
            console.print(f"[yellow]No stats table found for {season}[/yellow]")
            return pd.DataFrame()

        # Parse the table
        rows = []
        tbody = table.find("tbody")
        if tbody is None:
            return pd.DataFrame()

        for row in tbody.find_all("tr"):
            if row.get("class") and "thead" in row.get("class"):
                continue

            cells = row.find_all(["th", "td"])
            if len(cells) < 20:
                continue

            # Extract team info - column 1 has the team name (column 0 is rank)
            team_cell = cells[1]
            team_link = team_cell.find("a")
            if team_link is None:
                continue

            team_name = team_link.text.strip()
            # Extract team_id from href like "/cbb/schools/duke/men/2025.html"
            href = team_link.get("href", "")
            if "/schools/" in href:
                team_id = href.split("/schools/")[1].split("/")[0]
            else:
                team_id = ""

            try:
                # Column indices (0=Rk, 1=School, 2=G, 3=W, 4=L, etc.)
                games = self._safe_int(cells[2].text) or 1  # Avoid division by zero

                # Get totals from the table
                total_pts = self._safe_float(cells[18].text) or 0
                total_opp_pts = self._safe_float(cells[19].text) or 0
                total_fg = self._safe_float(cells[22].text) if len(cells) > 22 else 0
                total_fga = self._safe_float(cells[23].text) if len(cells) > 23 else 0
                total_fg3 = self._safe_float(cells[25].text) if len(cells) > 25 else 0
                total_fg3a = self._safe_float(cells[26].text) if len(cells) > 26 else 0
                total_ft = self._safe_float(cells[28].text) if len(cells) > 28 else 0
                total_fta = self._safe_float(cells[29].text) if len(cells) > 29 else 0
                total_orb = self._safe_float(cells[31].text) if len(cells) > 31 else 0
                total_trb = self._safe_float(cells[32].text) if len(cells) > 32 else 0
                total_ast = self._safe_float(cells[33].text) if len(cells) > 33 else 0
                total_stl = self._safe_float(cells[34].text) if len(cells) > 34 else 0
                total_blk = self._safe_float(cells[35].text) if len(cells) > 35 else 0
                total_tov = self._safe_float(cells[36].text) if len(cells) > 36 else 0
                total_pf = self._safe_float(cells[37].text) if len(cells) > 37 else 0

                row_data = {
                    "season": season,
                    "team_name": team_name,
                    "team_id": team_id,
                    "games": games,
                    "wins": self._safe_int(cells[3].text),
                    "losses": self._safe_int(cells[4].text),
                    "win_pct": self._safe_float(cells[5].text),
                    "srs": self._safe_float(cells[6].text),  # Simple Rating System
                    "sos": self._safe_float(cells[7].text),  # Strength of Schedule
                    "conf_wins": self._safe_int(cells[9].text),
                    "conf_losses": self._safe_int(cells[10].text),
                    "home_wins": self._safe_int(cells[12].text),
                    "home_losses": self._safe_int(cells[13].text),
                    "away_wins": self._safe_int(cells[15].text),
                    "away_losses": self._safe_int(cells[16].text),
                    # Per-game stats (calculated from totals)
                    "pts_per_game": round(total_pts / games, 1) if games else None,
                    "opp_pts_per_game": round(total_opp_pts / games, 1) if games else None,
                    "fg_per_game": round((total_fg or 0) / games, 1) if games else None,
                    "fga_per_game": round((total_fga or 0) / games, 1) if games else None,
                    "fg_pct": self._safe_float(cells[24].text) if len(cells) > 24 else None,
                    "fg3_per_game": round((total_fg3 or 0) / games, 1) if games else None,
                    "fg3a_per_game": round((total_fg3a or 0) / games, 1) if games else None,
                    "fg3_pct": self._safe_float(cells[27].text) if len(cells) > 27 else None,
                    "ft_per_game": round((total_ft or 0) / games, 1) if games else None,
                    "fta_per_game": round((total_fta or 0) / games, 1) if games else None,
                    "ft_pct": self._safe_float(cells[30].text) if len(cells) > 30 else None,
                    "orb_per_game": round((total_orb or 0) / games, 1) if games else None,
                    "trb_per_game": round((total_trb or 0) / games, 1) if games else None,
                    "ast_per_game": round((total_ast or 0) / games, 1) if games else None,
                    "stl_per_game": round((total_stl or 0) / games, 1) if games else None,
                    "blk_per_game": round((total_blk or 0) / games, 1) if games else None,
                    "tov_per_game": round((total_tov or 0) / games, 1) if games else None,
                    "pf_per_game": round((total_pf or 0) / games, 1) if games else None,
                }
                rows.append(row_data)
            except (IndexError, ValueError) as e:
                console.print(f"[yellow]Error parsing row for {team_name}: {e}[/yellow]")
                continue

        return pd.DataFrame(rows)

    def get_team_game_log(self, team_id: str, season: int, silent: bool = False) -> pd.DataFrame:
        """
        Get game-by-game results for a team.

        Note: Sports-Reference may block these requests. If blocked, empty
        DataFrame is returned and predictions can still work using team
        season stats.

        Args:
            team_id: Sports-Reference team ID (e.g., 'duke')
            season: The ending year of the season
            silent: If True, don't print errors (for bulk fetching)

        Returns:
            DataFrame with individual game results
        """
        # Try schedule URL first (more reliable), then fall back to gamelogs
        urls_to_try = [
            f"{SPORTS_REF_BASE}/schools/{team_id}/men/{season}-schedule.html",
            f"{SPORTS_REF_BASE}/schools/{team_id}/men/{season}-gamelogs.html",
        ]

        soup = None
        for url in urls_to_try:
            soup = self._fetch_page(url, max_retries=2)
            if soup is not None:
                break

        if soup is None:
            return pd.DataFrame()

        # Try different table IDs (schedule page uses "schedule", gamelogs uses "sgl-basic")
        table = soup.find("table", {"id": "schedule"})
        if table is None:
            table = soup.find("table", {"id": "sgl-basic"})
        if table is None:
            table = soup.find("table", {"id": "sgl-basic_NCAAM"})
        if table is None:
            return pd.DataFrame()

        games = []
        tbody = table.find("tbody")
        if tbody is None:
            return pd.DataFrame()

        # Determine table type from ID
        table_id = table.get("id", "")
        is_schedule_table = table_id == "schedule"

        for row in tbody.find_all("tr"):
            if row.get("class") and ("thead" in row.get("class") or "partial_table" in row.get("class")):
                continue

            cells = row.find_all(["th", "td"])
            if len(cells) < 10:
                continue

            try:
                if is_schedule_table:
                    # Schedule table format:
                    # [0]=G, [1]=Date, [2]=Time, [3]=Type, [4]=Location (@/N/blank), [5]=Opponent,
                    # [6]=Conf, [7]=SRS, [8]=W/L, [9]=Tm, [10]=Opp, [11]=OT
                    date_text = cells[1].text.strip()

                    # Location: @ = away, N = neutral, blank = home
                    location_cell = cells[4].text.strip()
                    if location_cell == "@":
                        location = "away"
                    elif location_cell == "N":
                        location = "neutral"
                    else:
                        location = "home"

                    # Opponent (cell 5) - may include ranking in parentheses
                    opp_cell = cells[5]
                    opp_link = opp_cell.find("a")
                    opponent_raw = opp_link.text.strip() if opp_link else opp_cell.text.strip()
                    # Clean up opponent name (remove ranking and non-breaking spaces)
                    opponent = opponent_raw.replace("\xa0", " ").split("(")[0].strip()
                    if opp_link and opp_link.get("href"):
                        # Extract team ID from href like "/cbb/schools/dartmouth/men/2024.html"
                        href_parts = opp_link.get("href", "").split("/")
                        opponent_id = href_parts[3] if len(href_parts) > 3 else ""
                    else:
                        opponent_id = ""

                    # Result (cell 8)
                    result_cell = cells[8].text.strip()
                    won = result_cell == "W"

                    # Score (cells 9 and 10)
                    pts = self._safe_int(cells[9].text)
                    opp_pts = self._safe_int(cells[10].text)

                else:
                    # Game log table format (original parsing)
                    date_text = cells[1].text.strip()

                    location_cell = cells[2].text.strip()
                    if location_cell == "@":
                        location = "away"
                    elif location_cell == "N":
                        location = "neutral"
                    else:
                        location = "home"

                    opp_cell = cells[3]
                    opp_link = opp_cell.find("a")
                    opponent = opp_link.text.strip() if opp_link else opp_cell.text.strip()
                    opponent_id = opp_link.get("href", "").split("/")[-2] if opp_link and opp_link.get("href") else ""

                    result_cell = cells[4].text.strip()
                    won = result_cell.startswith("W")

                    pts = self._safe_int(cells[5].text)
                    opp_pts = self._safe_int(cells[6].text)

                # Skip rows without valid game data
                if pts is None or opp_pts is None:
                    continue

                game_data = {
                    "season": season,
                    "team_id": team_id,
                    "date": date_text,
                    "location": location,
                    "opponent": opponent,
                    "opponent_id": opponent_id,
                    "won": won,
                    "pts": pts,
                    "opp_pts": opp_pts,
                    "point_diff": pts - opp_pts,
                }

                # Add detailed stats if available (only in gamelog format)
                if not is_schedule_table and len(cells) > 20:
                    game_data.update({
                        "fg": self._safe_int(cells[8].text) if len(cells) > 8 else None,
                        "fga": self._safe_int(cells[9].text) if len(cells) > 9 else None,
                        "fg_pct": self._safe_float(cells[10].text) if len(cells) > 10 else None,
                        "fg3": self._safe_int(cells[11].text) if len(cells) > 11 else None,
                        "fg3a": self._safe_int(cells[12].text) if len(cells) > 12 else None,
                        "fg3_pct": self._safe_float(cells[13].text) if len(cells) > 13 else None,
                        "ft": self._safe_int(cells[14].text) if len(cells) > 14 else None,
                        "fta": self._safe_int(cells[15].text) if len(cells) > 15 else None,
                        "ft_pct": self._safe_float(cells[16].text) if len(cells) > 16 else None,
                        "orb": self._safe_int(cells[17].text) if len(cells) > 17 else None,
                        "trb": self._safe_int(cells[18].text) if len(cells) > 18 else None,
                        "ast": self._safe_int(cells[19].text) if len(cells) > 19 else None,
                        "stl": self._safe_int(cells[20].text) if len(cells) > 20 else None,
                        "blk": self._safe_int(cells[21].text) if len(cells) > 21 else None,
                        "tov": self._safe_int(cells[22].text) if len(cells) > 22 else None,
                        "pf": self._safe_int(cells[23].text) if len(cells) > 23 else None,
                    })

                games.append(game_data)
            except (IndexError, ValueError) as e:
                continue

        return pd.DataFrame(games)

    def scrape_all_seasons(
        self,
        start_season: int = START_SEASON,
        end_season: int = END_SEASON,
        save: bool = True,
        force_refresh: bool = False,
    ) -> tuple[pd.DataFrame, pd.DataFrame]:
        """
        Scrape team stats and game logs for multiple seasons.

        Uses caching for historical seasons to avoid re-fetching data that won't change.
        Current season data is always fetched fresh.

        Args:
            start_season: First season to scrape
            end_season: Last season to scrape
            save: Whether to save data to disk
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
            task = progress.add_task(f"Processing {len(seasons)} seasons...", total=len(seasons))

            for season in seasons:
                season_label = f"{season-1}-{str(season)[2:]}"
                use_cache = self._should_use_cache(season) and not force_refresh

                # Try to load from cache for historical seasons
                if use_cache:
                    cached_stats = self._load_from_cache(season, "team_stats")
                    cached_games = self._load_from_cache(season, "games")

                    # Fully cached - use both
                    if cached_stats is not None and cached_games is not None:
                        progress.update(task, description=f"Season {season_label} [dim](cached)[/dim]")
                        all_team_stats.append(cached_stats)
                        all_games.append(cached_games)
                        console.print(f"  [cyan]Loaded {len(cached_stats)} teams, {len(cached_games)} games from cache[/cyan]")
                        progress.advance(task)
                        continue

                    # Partially cached (team stats only) - use cached stats, re-fetch games
                    if cached_stats is not None and cached_games is None:
                        console.print(f"  [yellow]Team stats cached but games missing - fetching games...[/yellow]")
                        all_team_stats.append(cached_stats)

                        # Fetch games for this season
                        top_teams = cached_stats.nlargest(100, "srs")["team_id"].tolist()
                        season_games = []

                        game_task = progress.add_task(
                            f"  Getting game logs...", total=len(top_teams)
                        )

                        for team_id in top_teams:
                            if team_id:
                                game_log = self.get_team_game_log(team_id, season)
                                if not game_log.empty:
                                    season_games.append(game_log)
                                    all_games.append(game_log)
                            progress.advance(game_task)

                        progress.remove_task(game_task)

                        # Cache the games now
                        if season_games:
                            season_games_df = pd.concat(season_games, ignore_index=True)
                            season_games_df = self._dedupe_games(season_games_df)
                            self._save_to_cache(season_games_df, season, "games")
                            console.print(f"  [blue]Cached {len(season_games_df)} games for {season_label}[/blue]")

                        progress.advance(task)
                        continue

                progress.update(task, description=f"Season {season_label} [dim](fetching)[/dim]")

                # Get team stats for this season
                team_stats = self.get_season_schedule(season)
                season_games = []
                is_historical = season < self._current_season

                if team_stats.empty:
                    console.print(f"  [red]WARNING: No data retrieved for season {season_label}![/red]")
                    console.print(f"  [red]Sports-Reference may be blocking requests. Try again later.[/red]")
                    progress.advance(task)
                    continue

                if not team_stats.empty:
                    all_team_stats.append(team_stats)
                    console.print(f"  [green]Found {len(team_stats)} teams[/green]")

                    # Cache team stats immediately (for historical seasons)
                    if is_historical:
                        self._save_to_cache(team_stats, season, "team_stats")
                        console.print(f"  [blue]Cached team stats for {season_label}[/blue]")

                    # Get game logs for each team (top 100 teams only to save time)
                    top_teams = team_stats.nlargest(100, "srs")["team_id"].tolist()

                    game_task = progress.add_task(
                        f"  Getting game logs...", total=len(top_teams)
                    )

                    for team_id in top_teams:
                        if team_id:
                            game_log = self.get_team_game_log(team_id, season)
                            if not game_log.empty:
                                season_games.append(game_log)
                                all_games.append(game_log)
                        progress.advance(game_task)

                    progress.remove_task(game_task)

                    # Cache games data after all teams fetched (for historical seasons)
                    if is_historical and season_games:
                        season_games_df = pd.concat(season_games, ignore_index=True)
                        # Dedupe before caching
                        season_games_df = self._dedupe_games(season_games_df)
                        self._save_to_cache(season_games_df, season, "games")
                        console.print(f"  [blue]Cached {len(season_games_df)} games for {season_label}[/blue]")

                progress.advance(task)

        # Combine all data
        team_stats_df = pd.concat(all_team_stats, ignore_index=True) if all_team_stats else pd.DataFrame()
        games_df = pd.concat(all_games, ignore_index=True) if all_games else pd.DataFrame()

        # Remove duplicate games (same game appears in both teams' logs)
        if not games_df.empty:
            games_df = self._dedupe_games(games_df)

        if save:
            self._save_data(team_stats_df, games_df)

        console.print(f"\n[bold green]Scraped {len(team_stats_df)} team-seasons and {len(games_df)} unique games[/bold green]")
        return team_stats_df, games_df

    def _dedupe_games(self, games_df: pd.DataFrame) -> pd.DataFrame:
        """Remove duplicate games (keep one record per game)."""
        if games_df.empty:
            return games_df

        # Create a game ID that's the same regardless of perspective
        def make_game_id(row):
            teams = sorted([str(row.get("team_id", "")), str(row.get("opponent_id", ""))])
            return f"{row.get('season', '')}_{row.get('date', '')}_{teams[0]}_{teams[1]}"

        games_df["game_id"] = games_df.apply(make_game_id, axis=1)
        games_df = games_df.drop_duplicates(subset=["game_id"], keep="first")
        return games_df

    def _save_data(self, team_stats: pd.DataFrame, games: pd.DataFrame):
        """Save scraped data to disk."""
        timestamp = datetime.now().strftime("%Y%m%d")

        if not team_stats.empty:
            team_stats_path = RAW_DATA_DIR / f"team_stats_{timestamp}.parquet"
            team_stats.to_parquet(team_stats_path, index=False)
            console.print(f"[blue]Saved team stats to {team_stats_path}[/blue]")

        if not games.empty:
            games_path = RAW_DATA_DIR / f"games_{timestamp}.parquet"
            games.to_parquet(games_path, index=False)
            console.print(f"[blue]Saved games to {games_path}[/blue]")

    @staticmethod
    def _safe_int(value: str) -> Optional[int]:
        """Safely convert string to int."""
        try:
            return int(value.strip().replace(",", ""))
        except (ValueError, AttributeError):
            return None

    @staticmethod
    def _safe_float(value: str) -> Optional[float]:
        """Safely convert string to float."""
        try:
            clean = value.strip().replace(",", "")
            if clean == "" or clean == "-":
                return None
            return float(clean)
        except (ValueError, AttributeError):
            return None
