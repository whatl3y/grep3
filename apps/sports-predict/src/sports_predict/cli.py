"""Command-line interface for Sports Prediction."""

from typing import Optional

import typer
from rich.console import Console
from rich.table import Table

from . import __version__
from .core.sport import League, get_sport_config, get_current_season
from .core.registry import ComponentRegistry
from .analysis.matchup import MatchupAnalyzer
from .data.loader import DataLoader
from .models.trainer import ModelTrainer
from .utils.config import get_season_range

app = typer.Typer(
    name="sports-predict",
    help="Sports game prediction with point spread and risk analysis. Supports NCAAB, NFL, and NCAAF.",
    add_completion=False,
)
console = Console()


def parse_league(sport: str) -> League:
    """Parse sport string to League enum."""
    sport_lower = sport.lower()
    try:
        return League(sport_lower)
    except ValueError:
        valid = ", ".join([l.value for l in League])
        console.print(f"[red]Invalid sport: {sport}. Valid options: {valid}[/red]")
        raise typer.Exit(1)


@app.command()
def predict(
    team_a: str = typer.Argument(..., help="First team name (e.g., 'Duke' or 'Kansas City')"),
    team_b: str = typer.Argument(..., help="Second team name (e.g., 'North Carolina' or 'Buffalo')"),
    sport: str = typer.Option(
        "ncaab",
        "--sport", "-S",
        help="Sport/league: ncaab, nfl, or ncaaf",
    ),
    location: str = typer.Option(
        "neutral",
        "--location", "-l",
        help="Game location: 'home' (team A home), 'away' (team A away), or 'neutral'",
    ),
    season: Optional[int] = typer.Option(
        None,
        "--season", "-s",
        help="Season year to use for stats (default: most recent)",
    ),
):
    """
    Predict the outcome of a matchup between two teams.

    Examples:
        sports-predict predict Duke "North Carolina" --sport ncaab
        sports-predict predict "Kansas City" Buffalo --sport nfl -l home
        sports-predict predict Alabama Georgia --sport ncaaf
    """
    league = parse_league(sport)
    analyzer = MatchupAnalyzer(league)
    analysis = analyzer.analyze(team_a, team_b, location, season)

    if analysis:
        analyzer.print_analysis(analysis)


@app.command("update-data")
def update_data(
    sport: str = typer.Option(
        "ncaab",
        "--sport", "-S",
        help="Sport/league: ncaab, nfl, or ncaaf",
    ),
    start: Optional[int] = typer.Option(
        None,
        "--start", "-s",
        help="First season to scrape (default: sport-specific)",
    ),
    end: Optional[int] = typer.Option(
        None,
        "--end", "-e",
        help="Last season to scrape (default: sport-specific)",
    ),
    force_refresh: bool = typer.Option(
        False,
        "--force-refresh", "-f",
        help="Ignore cache and re-fetch all data",
    ),
):
    """
    Update the local data by scraping from data sources.

    For NCAAB, uses Sports-Reference. For NFL/NCAAF, uses ESPN API.
    Historical seasons are cached locally - use --force-refresh to re-download.

    Examples:
        sports-predict update-data --sport ncaab
        sports-predict update-data --sport nfl --start 2022 --end 2024
        sports-predict update-data --sport ncaaf --force-refresh
    """
    league = parse_league(sport)

    # Get sport-specific season range if not specified
    default_start, default_end = get_season_range(league)
    start = start or default_start
    end = end or default_end

    console.print(f"[bold]Scraping {league.value.upper()} data for seasons {start}-{end}...[/bold]")
    if force_refresh:
        console.print("[yellow]Force refresh enabled - ignoring cache[/yellow]")
    else:
        console.print("[dim]Historical seasons will load from cache if available.[/dim]")
    console.print()

    # Get sport-specific scraper from registry
    if not ComponentRegistry.has_scraper(league):
        console.print(f"[red]No scraper available for {league.value}[/red]")
        raise typer.Exit(1)

    scraper = ComponentRegistry.get_scraper(league)
    team_stats, games = scraper.scrape_all_seasons(start, end, force_refresh=force_refresh)

    if not team_stats.empty:
        console.print(f"\n[green]Successfully scraped {len(team_stats)} team-seasons and {len(games)} games![/green]")
    else:
        console.print("[red]No data was scraped. Check your internet connection.[/red]")


@app.command()
def train(
    sport: str = typer.Option(
        "ncaab",
        "--sport", "-S",
        help="Sport/league: ncaab, nfl, or ncaaf",
    ),
    test_size: float = typer.Option(
        0.2,
        "--test-size", "-t",
        help="Fraction of data to use for testing",
    ),
):
    """
    Train the prediction model on available data.

    Requires data to be downloaded first via 'update-data' command.

    Examples:
        sports-predict train --sport ncaab
        sports-predict train --sport nfl --test-size 0.3
    """
    league = parse_league(sport)
    trainer = ModelTrainer(league)
    metrics = trainer.train(test_size=test_size)

    if "error" not in metrics:
        console.print(f"\n[bold green]{league.value.upper()} model training complete![/bold green]")


@app.command()
def teams(
    search: Optional[str] = typer.Argument(None, help="Search query for team name"),
    sport: str = typer.Option(
        "ncaab",
        "--sport", "-S",
        help="Sport/league: ncaab, nfl, or ncaaf",
    ),
    limit: int = typer.Option(20, "--limit", "-n", help="Maximum teams to show"),
):
    """
    List available teams or search for a specific team.

    Examples:
        sports-predict teams --sport ncaab
        sports-predict teams Duke --sport ncaab
        sports-predict teams Chiefs --sport nfl --limit 10
    """
    league = parse_league(sport)
    loader = DataLoader(league)
    team_names = loader.get_team_names()

    if not team_names:
        console.print(f"[yellow]No team data available. Run 'sports-predict update-data --sport {league.value}' first.[/yellow]")
        return

    # Filter by search query
    if search:
        from thefuzz import process
        matches = process.extract(search, team_names.values(), limit=limit)
        filtered = {
            team_id: name
            for team_id, name in team_names.items()
            if name in [m[0] for m in matches]
        }
    else:
        # Sort alphabetically and limit
        filtered = dict(sorted(team_names.items(), key=lambda x: x[1])[:limit])

    # Display as table
    table = Table(title=f"Available {league.value.upper()} Teams")
    table.add_column("Team ID", style="cyan")
    table.add_column("Team Name", style="white")

    for team_id, name in filtered.items():
        table.add_row(team_id, name)

    console.print(table)
    console.print(f"\n[dim]Showing {len(filtered)} of {len(team_names)} total teams[/dim]")


@app.command()
def rankings(
    sport: str = typer.Option(
        "ncaab",
        "--sport", "-S",
        help="Sport/league: ncaab, nfl, or ncaaf",
    ),
    season: Optional[int] = typer.Option(None, "--season", "-s", help="Season year"),
    limit: int = typer.Option(25, "--limit", "-n", help="Number of teams to show"),
):
    """
    Show team rankings by adjusted efficiency/rating.

    Examples:
        sports-predict rankings --sport ncaab
        sports-predict rankings --sport nfl --season 2024 --limit 32
    """
    league = parse_league(sport)
    config = get_sport_config(league)
    loader = DataLoader(league)
    team_stats = loader.load_team_stats()

    if team_stats.empty:
        console.print(f"[yellow]No team data available. Run 'sports-predict update-data --sport {league.value}' first.[/yellow]")
        return

    # Build features to get adjusted ratings
    if ComponentRegistry.has_feature_builder(league):
        builder = ComponentRegistry.get_feature_builder(league)
    else:
        from .features.team_stats import TeamFeatureBuilder
        builder = TeamFeatureBuilder()

    games = loader.load_games()
    features = builder.build_team_features(team_stats, games)

    if season is None:
        season = features["season"].max()

    # Filter to season and sort by rating
    season_data = features[features["season"] == season].copy()

    if season_data.empty:
        console.print(f"[yellow]No data for season {season}[/yellow]")
        return

    # Determine ranking column based on sport
    rank_col = "adj_net" if "adj_net" in season_data.columns else "point_diff"

    # Add rank if not present
    if f"{rank_col}_rank" not in season_data.columns:
        season_data[f"{rank_col}_rank"] = season_data[rank_col].rank(
            ascending=False, method="min"
        ).astype(int)

    top_teams = season_data.nsmallest(limit, f"{rank_col}_rank")

    # Display - sport-specific columns
    if config.sport_type.value == "basketball":
        table = Table(title=f"Top {limit} {league.value.upper()} Teams - {season-1}-{str(season)[2:]} Season")
        table.add_column("Rank", style="bold", justify="right")
        table.add_column("Team", style="white")
        table.add_column("Record", justify="center")
        table.add_column("Net Rtg", justify="right", style="green")
        table.add_column("Off Rtg", justify="right")
        table.add_column("Def Rtg", justify="right")
        table.add_column("SRS", justify="right")

        for _, row in top_teams.iterrows():
            wins = int(row.get("wins", 0) or 0)
            losses = int(row.get("losses", 0) or 0)
            record = f"{wins}-{losses}"

            adj_net = row.get("adj_net", 0) or 0
            adj_ortg = row.get("adj_ortg", 100) or 100
            adj_drtg = row.get("adj_drtg", 100) or 100
            srs = row.get("srs", 0) or 0

            table.add_row(
                str(int(row.get(f"{rank_col}_rank", 0))),
                row.get("team_name", row.get("team_id", "Unknown")),
                record,
                f"{adj_net:+.1f}",
                f"{adj_ortg:.1f}",
                f"{adj_drtg:.1f}",
                f"{srs:+.1f}",
            )
    else:
        # Football rankings
        table = Table(title=f"Top {limit} {league.value.upper()} Teams - {season} Season")
        table.add_column("Rank", style="bold", justify="right")
        table.add_column("Team", style="white")
        table.add_column("Record", justify="center")
        table.add_column("Pt Diff", justify="right", style="green")
        table.add_column("PPG", justify="right")
        table.add_column("Opp PPG", justify="right")
        table.add_column("SRS", justify="right")

        for _, row in top_teams.iterrows():
            wins = int(row.get("wins", 0) or 0)
            losses = int(row.get("losses", 0) or 0)
            record = f"{wins}-{losses}"

            point_diff = row.get("point_diff", 0) or 0
            ppg = row.get("pts_per_game", 21) or 21
            opp_ppg = row.get("pts_allowed", 21) or 21
            srs = row.get("srs", 0) or 0

            table.add_row(
                str(int(row.get(f"{rank_col}_rank", 0))),
                row.get("team_name", row.get("team_id", "Unknown")),
                record,
                f"{point_diff:+.1f}",
                f"{ppg:.1f}",
                f"{opp_ppg:.1f}",
                f"{srs:+.1f}",
            )

    console.print(table)


@app.command()
def version():
    """Show the version number."""
    console.print(f"sports-predict version {__version__}")


@app.callback()
def main():
    """
    Sports Prediction Tool

    Predict point spreads and analyze matchups for NCAA Basketball, NFL, and NCAA Football.
    Uses historical data and machine learning to generate predictions with
    confidence intervals and risk analysis.

    Supported sports: ncaab, nfl, ncaaf

    Get started:
        1. sports-predict update-data --sport ncaab  # Download data
        2. sports-predict train --sport ncaab        # Train the model
        3. sports-predict predict Duke UNC --sport ncaab  # Make a prediction
    """
    pass


if __name__ == "__main__":
    app()
