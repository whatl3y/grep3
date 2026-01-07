"""Command-line interface for NCAA Basketball Prediction."""

from typing import Optional

import typer
from rich.console import Console
from rich.table import Table

from . import __version__
from .analysis.matchup import MatchupAnalyzer
from .data.scraper import NCAADataScraper
from .data.loader import DataLoader
from .models.trainer import ModelTrainer
from .utils.config import START_SEASON, END_SEASON

app = typer.Typer(
    name="ncaa-predict",
    help="NCAA Basketball game prediction with point spread and risk analysis.",
    add_completion=False,
)
console = Console()


@app.command()
def predict(
    team_a: str = typer.Argument(..., help="First team name (e.g., 'Duke')"),
    team_b: str = typer.Argument(..., help="Second team name (e.g., 'North Carolina')"),
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
        ncaa-predict Duke "North Carolina"
        ncaa-predict Duke "North Carolina" --location home
        ncaa-predict Kentucky Louisville -l neutral -s 2024
    """
    analyzer = MatchupAnalyzer()
    analysis = analyzer.analyze(team_a, team_b, location, season)

    if analysis:
        analyzer.print_analysis(analysis)


@app.command("update-data")
def update_data(
    start: int = typer.Option(
        START_SEASON,
        "--start", "-s",
        help="First season to scrape",
    ),
    end: int = typer.Option(
        END_SEASON,
        "--end", "-e",
        help="Last season to scrape",
    ),
    force_refresh: bool = typer.Option(
        False,
        "--force-refresh", "-f",
        help="Ignore cache and re-fetch all data",
    ),
):
    """
    Update the local data by scraping from Sports-Reference.

    This will download team statistics and game results for the specified
    seasons. Historical seasons are cached locally - use --force-refresh
    to re-download everything.

    Examples:
        ncaa-predict update-data
        ncaa-predict update-data --start 2022 --end 2025
        ncaa-predict update-data --force-refresh
    """
    console.print(f"[bold]Scraping data for seasons {start}-{end}...[/bold]")
    if force_refresh:
        console.print("[yellow]Force refresh enabled - ignoring cache[/yellow]")
    else:
        console.print("[dim]Historical seasons will load from cache if available.[/dim]")
    console.print()

    scraper = NCAADataScraper()
    team_stats, games = scraper.scrape_all_seasons(start, end, force_refresh=force_refresh)

    if not team_stats.empty:
        console.print(f"\n[green]Successfully scraped {len(team_stats)} team-seasons and {len(games)} games![/green]")
    else:
        console.print("[red]No data was scraped. Check your internet connection.[/red]")


@app.command()
def train(
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
        ncaa-predict train
        ncaa-predict train --test-size 0.3
    """
    trainer = ModelTrainer()
    metrics = trainer.train(test_size=test_size)

    if "error" not in metrics:
        console.print("\n[bold green]Model training complete![/bold green]")


@app.command()
def teams(
    search: Optional[str] = typer.Argument(None, help="Search query for team name"),
    limit: int = typer.Option(20, "--limit", "-n", help="Maximum teams to show"),
):
    """
    List available teams or search for a specific team.

    Examples:
        ncaa-predict teams
        ncaa-predict teams Duke
        ncaa-predict teams "North" --limit 10
    """
    loader = DataLoader()
    team_names = loader.get_team_names()

    if not team_names:
        console.print("[yellow]No team data available. Run 'ncaa-predict update-data' first.[/yellow]")
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
    table = Table(title="Available Teams")
    table.add_column("Team ID", style="cyan")
    table.add_column("Team Name", style="white")

    for team_id, name in filtered.items():
        table.add_row(team_id, name)

    console.print(table)
    console.print(f"\n[dim]Showing {len(filtered)} of {len(team_names)} total teams[/dim]")


@app.command()
def rankings(
    season: Optional[int] = typer.Option(None, "--season", "-s", help="Season year"),
    limit: int = typer.Option(25, "--limit", "-n", help="Number of teams to show"),
):
    """
    Show team rankings by adjusted efficiency.

    Examples:
        ncaa-predict rankings
        ncaa-predict rankings --season 2024 --limit 50
    """
    loader = DataLoader()
    team_stats = loader.load_team_stats()

    if team_stats.empty:
        console.print("[yellow]No team data available. Run 'ncaa-predict update-data' first.[/yellow]")
        return

    # Build features to get adjusted ratings
    from .features.team_stats import TeamFeatureBuilder
    games = loader.load_games()
    builder = TeamFeatureBuilder()
    features = builder.build_team_features(team_stats, games)

    if season is None:
        season = features["season"].max()

    # Filter to season and sort by rating
    season_data = features[features["season"] == season].copy()

    if season_data.empty:
        console.print(f"[yellow]No data for season {season}[/yellow]")
        return

    # Add rank if not present
    if "adj_net_rank" not in season_data.columns:
        season_data["adj_net_rank"] = season_data["adj_net"].rank(
            ascending=False, method="min"
        ).astype(int)

    top_teams = season_data.nsmallest(limit, "adj_net_rank")

    # Display
    table = Table(title=f"Top {limit} Teams - {season-1}-{str(season)[2:]} Season")
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
            str(int(row.get("adj_net_rank", 0))),
            row["team_name"],
            record,
            f"{adj_net:+.1f}",
            f"{adj_ortg:.1f}",
            f"{adj_drtg:.1f}",
            f"{srs:+.1f}",
        )

    console.print(table)


@app.command()
def version():
    """Show the version number."""
    console.print(f"ncaa-predict version {__version__}")


@app.callback()
def main():
    """
    NCAA Basketball Prediction Tool

    Predict point spreads and analyze matchups between NCAA basketball teams.
    Uses historical data and machine learning to generate predictions with
    confidence intervals and risk analysis.

    Get started:
        1. ncaa-predict update-data  # Download historical data
        2. ncaa-predict train        # Train the prediction model
        3. ncaa-predict "Duke" "UNC" # Make a prediction
    """
    pass


if __name__ == "__main__":
    app()
