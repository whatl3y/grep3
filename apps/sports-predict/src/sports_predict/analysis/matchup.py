"""Matchup analysis combining predictions and risk analysis."""

from datetime import datetime
from typing import Optional

import pandas as pd
from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from rich.text import Text

from ..core.sport import League, SportType, get_sport_config, get_current_season
from ..core.registry import ComponentRegistry
from ..data.loader import DataLoader
from ..features.team_stats import TeamFeatureBuilder
from ..models.spread import SpreadPredictor
from ..utils.config import HOME_COURT_ADVANTAGE
from .risk import RiskAnalyzer

console = Console()


class MatchupAnalyzer:
    """
    Complete matchup analysis combining prediction and risk assessment.

    Provides the full analysis output shown to users.
    """

    def __init__(self, league: League = League.NCAAB):
        """Initialize the analyzer for a specific league.

        Args:
            league: The league to analyze matchups for
        """
        self.league = league
        self.config = get_sport_config(league)
        self.data_loader = DataLoader(league)

        # Get sport-specific components from registry
        if ComponentRegistry.has_feature_builder(league):
            self.feature_builder = ComponentRegistry.get_feature_builder(league)
        else:
            self.feature_builder = TeamFeatureBuilder()

        self.predictor = SpreadPredictor(league)

        # Get sport-specific risk analyzer
        if ComponentRegistry.has_risk_analyzer(league):
            self.risk_analyzer = ComponentRegistry.get_risk_analyzer(league)
        else:
            self.risk_analyzer = RiskAnalyzer()

    def analyze(
        self,
        team_a: str,
        team_b: str,
        location: str = "neutral",
        season: Optional[int] = None,
    ) -> Optional[dict]:
        """
        Perform complete matchup analysis.

        Args:
            team_a: Name or ID of team A
            team_b: Name or ID of team B
            location: 'home' (for A), 'away' (for A), or 'neutral'
            season: Season to use for stats (default: most recent)

        Returns:
            Complete analysis dict or None if teams not found
        """
        # Find teams
        team_a_result = self.data_loader.find_team(team_a)
        team_b_result = self.data_loader.find_team(team_b)

        if team_a_result is None:
            console.print(f"[red]Team not found: {team_a}[/red]")
            return None
        if team_b_result is None:
            console.print(f"[red]Team not found: {team_b}[/red]")
            return None

        team_a_id, team_a_name = team_a_result
        team_b_id, team_b_name = team_b_result

        # Get team stats
        team_stats = self.data_loader.load_team_stats()
        games = self.data_loader.load_games()

        if team_stats.empty:
            console.print(f"[red]No team data available. Run 'sports-predict update-data --sport {self.league.value}' first.[/red]")
            return None

        # Build features
        team_features = self.feature_builder.build_team_features(team_stats, games)

        # Get current season stats - use actual current season, not just max in data
        using_stale_data = False
        if season is None:
            current_season = get_current_season(self.league)
            # Check if current season data exists, otherwise fall back to most recent
            if current_season in team_features["season"].values:
                season = current_season
            else:
                season = team_features["season"].max()
                using_stale_data = True
                console.print(f"[yellow]WARNING: Current season ({current_season}) data not available![/yellow]")
                console.print(f"[yellow]Using season {season} data instead. Records shown are from last season.[/yellow]")
                console.print(f"[yellow]Run 'sports-predict update-data --sport {self.league.value}' to fetch current season data.[/yellow]")

        team_a_stats = team_features[
            (team_features["team_id"] == team_a_id) &
            (team_features["season"] == season)
        ]
        team_b_stats = team_features[
            (team_features["team_id"] == team_b_id) &
            (team_features["season"] == season)
        ]

        if team_a_stats.empty:
            console.print(f"[red]No stats found for {team_a_name} in season {season}[/red]")
            return None
        if team_b_stats.empty:
            console.print(f"[red]No stats found for {team_b_name} in season {season}[/red]")
            return None

        team_a_stats = team_a_stats.iloc[0]
        team_b_stats = team_b_stats.iloc[0]

        # Create matchup features
        features = self.feature_builder.create_matchup_features(
            team_a_stats, team_b_stats, location
        )

        # Get prediction
        prediction = self.predictor.predict(features)

        # Calculate expected scores
        team_a_score, team_b_score = self.risk_analyzer.calculate_expected_score(
            team_a_stats, team_b_stats, prediction["spread"]
        )
        prediction["team_a_score"] = team_a_score
        prediction["team_b_score"] = team_b_score

        # Risk analysis
        risk = self.risk_analyzer.analyze_matchup_risk(
            team_a_stats, team_b_stats, prediction, location
        )

        # Key factors
        key_factors = self.risk_analyzer.get_key_factors(
            team_a_stats, team_b_stats, team_a_name, team_b_name
        )

        return {
            "team_a": {
                "id": team_a_id,
                "name": team_a_name,
                "stats": team_a_stats.to_dict(),
            },
            "team_b": {
                "id": team_b_id,
                "name": team_b_name,
                "stats": team_b_stats.to_dict(),
            },
            "location": location,
            "season": season,
            "using_stale_data": using_stale_data,
            "prediction": prediction,
            "risk": risk,
            "key_factors": key_factors,
        }

    def print_analysis(self, analysis: dict):
        """
        Print formatted analysis to console.

        Args:
            analysis: Analysis dict from analyze()
        """
        team_a = analysis["team_a"]
        team_b = analysis["team_b"]
        pred = analysis["prediction"]
        risk = analysis["risk"]
        factors = analysis["key_factors"]
        location = analysis["location"]

        # Header - sport-specific title
        sport_titles = {
            League.NCAAB: "NCAA BASKETBALL PREDICTION",
            League.NFL: "NFL PREDICTION",
            League.NCAAF: "NCAA FOOTBALL PREDICTION",
        }
        title = sport_titles.get(self.league, "SPORTS PREDICTION")

        console.print()
        console.print("═" * 65, style="bold blue")
        console.print(title.center(65), style="bold white")
        console.print("═" * 65, style="bold blue")
        console.print()

        # Matchup with records
        location_text = {
            "home": f"@ {team_a['name']}",
            "away": f"@ {team_b['name']}",
            "neutral": "Neutral Site",
        }[location]

        # Get team records from stats
        a_wins = int(team_a['stats'].get('wins', 0) or 0)
        a_losses = int(team_a['stats'].get('losses', 0) or 0)
        b_wins = int(team_b['stats'].get('wins', 0) or 0)
        b_losses = int(team_b['stats'].get('losses', 0) or 0)

        console.print(f"  [bold]{team_a['name'].upper()}[/bold] ({a_wins}-{a_losses})  vs  [bold]{team_b['name'].upper()}[/bold] ({b_wins}-{b_losses})")
        console.print(f"  Location: {location_text}")
        console.print()

        # Prediction Section
        console.print("─" * 65)
        console.print("  [bold]PREDICTION[/bold]")
        console.print("─" * 65)

        spread = pred["spread"]
        # Convention: negative spread means team A is favored
        spread_str = f"{team_a['name']} {-spread:+.1f}" if spread != 0 else "Pick 'em"

        console.print(f"  Expected Score:     {team_a['name']} {pred['team_a_score']}  -  {team_b['name']} {pred['team_b_score']}")
        console.print(f"  Point Spread:       {spread_str}")
        console.print(f"  Win Probability:    {team_a['name']} {pred['win_prob_a']:.0%}  |  {team_b['name']} {pred['win_prob_b']:.0%}")
        console.print()

        # Confidence Section
        console.print("─" * 65)
        console.print("  [bold]CONFIDENCE ANALYSIS[/bold]")
        console.print("─" * 65)

        spread_lower = pred.get("spread_lower", spread - 11)
        spread_upper = pred.get("spread_upper", spread + 11)

        # Format interval (negate for display convention)
        # Model outputs positive spread = team A wins by that much
        # Display convention: negative = favored
        interval_str = f"{team_a['name']} {-spread_upper:+.1f} to {-spread_lower:+.1f}"

        confidence_color = {
            "High": "green",
            "Medium": "yellow",
            "Low": "red",
        }.get(risk["confidence_level"], "white")

        console.print(f"  80% Confidence:     {interval_str}")
        console.print(f"  Model Confidence:   [{confidence_color}]{risk['confidence_level']}[/{confidence_color}] (±{risk['adjusted_std']:.1f} pts typical variance)")
        console.print()

        # Key Factors Section
        console.print("─" * 65)
        console.print("  [bold]KEY FACTORS[/bold]")
        console.print("─" * 65)

        for factor in factors:
            icon = "✓" if factor.get("favorable") else "•"
            console.print(f"  {icon} {factor['label']}: {factor['value']}")
        console.print()

        # Risk Factors Section
        if risk["risk_factors"]:
            console.print("─" * 65)
            console.print("  [bold]RISK FACTORS[/bold]")
            console.print("─" * 65)

            for rf in risk["risk_factors"]:
                severity_color = {
                    "high": "red",
                    "medium": "yellow",
                    "low": "dim",
                }.get(rf["severity"], "white")
                console.print(f"  [{severity_color}]•[/{severity_color}] {rf['factor']}: {rf['description']}")

            console.print()

        # Fallback warning
        if pred.get("_fallback"):
            console.print()
            console.print(f"[yellow]⚠ Using simplified prediction (model not trained). Run 'sports-predict train --sport {self.league.value}' for better accuracy.[/yellow]")

        console.print("═" * 65, style="bold blue")
        console.print()
