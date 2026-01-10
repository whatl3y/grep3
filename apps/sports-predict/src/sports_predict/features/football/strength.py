"""Football strength of schedule calculations."""

from typing import Dict, List, Optional, Tuple

import pandas as pd
import numpy as np


class FootballStrengthCalculator:
    """Calculate strength of schedule and adjusted ratings for football.

    This calculator uses iterative opponent adjustment to calculate
    more accurate team ratings that account for schedule difficulty.
    """

    def __init__(self, iterations: int = 10):
        """Initialize the calculator.

        Args:
            iterations: Number of iterations for rating convergence
        """
        self.iterations = iterations

    def calculate_adjusted_ratings(
        self, team_stats: pd.DataFrame, games: pd.DataFrame
    ) -> pd.DataFrame:
        """Calculate opponent-adjusted ratings.

        Args:
            team_stats: DataFrame with team statistics
            games: DataFrame with game results

        Returns:
            DataFrame with added adjusted rating columns
        """
        df = team_stats.copy()

        # Fill None/NaN values with league average defaults
        # NFL average is ~22 points per game
        default_pts = 22.0
        if "pts_per_game" in df.columns:
            df["pts_per_game"] = pd.to_numeric(df["pts_per_game"], errors="coerce").fillna(default_pts)
        else:
            df["pts_per_game"] = default_pts

        if "pts_allowed" in df.columns:
            df["pts_allowed"] = pd.to_numeric(df["pts_allowed"], errors="coerce").fillna(default_pts)
        else:
            df["pts_allowed"] = default_pts

        # Initialize point differential
        if "point_diff" not in df.columns:
            df["point_diff"] = df["pts_per_game"] - df["pts_allowed"]

        # Initialize SRS if not present
        if "srs" not in df.columns or df["srs"].isna().all():
            df["srs"] = df["point_diff"]

        # Initialize adjusted metrics
        df["adj_off"] = df["pts_per_game"]
        df["adj_def"] = df["pts_allowed"]

        # Perform iterative adjustment if we have game data
        if not games.empty:
            for _ in range(self.iterations):
                df = self._iterate_adjustments(df, games)

        # Calculate final adjusted net rating
        df["adj_net"] = df["adj_off"] - df["adj_def"]

        return df

    def _iterate_adjustments(
        self, team_stats: pd.DataFrame, games: pd.DataFrame
    ) -> pd.DataFrame:
        """Single iteration of rating adjustment.

        Args:
            team_stats: Current team statistics
            games: Game results

        Returns:
            Updated team statistics
        """
        # Build opponent strength lookup
        strength_lookup: Dict[Tuple[int, str], float] = {}
        for _, row in team_stats.iterrows():
            key = (row["season"], row["team_id"])
            strength_lookup[key] = row.get("srs", 0)

        # Calculate opponent average strength for each team
        opp_strength: Dict[Tuple[int, str], List[float]] = {}

        # Process games where team is home
        if "home_team_id" in games.columns:
            for _, game in games.iterrows():
                season = game["season"]
                home_id = game.get("home_team_id")
                away_id = game.get("away_team_id")

                if home_id and away_id:
                    # Home team's opponent is away team
                    home_key = (season, home_id)
                    away_key = (season, away_id)

                    if away_key in strength_lookup:
                        if home_key not in opp_strength:
                            opp_strength[home_key] = []
                        opp_strength[home_key].append(strength_lookup[away_key])

                    if home_key in strength_lookup:
                        if away_key not in opp_strength:
                            opp_strength[away_key] = []
                        opp_strength[away_key].append(strength_lookup[home_key])

        # Calculate average opponent strength
        avg_opp_strength: Dict[Tuple[int, str], float] = {}
        for key, strengths in opp_strength.items():
            if strengths:
                avg_opp_strength[key] = np.mean(strengths)

        # Adjust ratings based on opponent strength
        df = team_stats.copy()
        league_avg_srs = df["srs"].mean() if "srs" in df.columns else 0

        for idx, row in df.iterrows():
            key = (row["season"], row["team_id"])
            if key in avg_opp_strength:
                # Adjustment factor based on opponent quality
                adjustment = (avg_opp_strength[key] - league_avg_srs) * 0.3

                # Adjust offensive and defensive ratings
                # Use column values which are already cleaned/filled
                pts_off = row["pts_per_game"] if pd.notna(row["pts_per_game"]) else 22.0
                pts_def = row["pts_allowed"] if pd.notna(row["pts_allowed"]) else 22.0
                df.at[idx, "adj_off"] = pts_off + adjustment
                df.at[idx, "adj_def"] = pts_def - adjustment

        return df

    def calculate_recent_form(
        self, games: pd.DataFrame, window: int = 5
    ) -> pd.DataFrame:
        """Calculate recent form metrics (last N games).

        Args:
            games: DataFrame with game results
            window: Number of recent games to consider

        Returns:
            DataFrame with recent form metrics
        """
        if games.empty:
            return pd.DataFrame()

        form_data = []

        # Handle different game formats (home/away columns vs team_id column)
        if "home_team_id" in games.columns:
            # ESPN-style format with home/away
            all_team_games = []

            # Home team perspective
            home_games = games.copy()
            home_games["team_id"] = home_games["home_team_id"]
            home_games["pts"] = home_games["home_score"]
            home_games["opp_pts"] = home_games["away_score"]
            home_games["won"] = home_games["home_score"] > home_games["away_score"]
            all_team_games.append(
                home_games[["season", "date", "team_id", "pts", "opp_pts", "won"]]
            )

            # Away team perspective
            away_games = games.copy()
            away_games["team_id"] = away_games["away_team_id"]
            away_games["pts"] = away_games["away_score"]
            away_games["opp_pts"] = away_games["home_score"]
            away_games["won"] = away_games["away_score"] > away_games["home_score"]
            all_team_games.append(
                away_games[["season", "date", "team_id", "pts", "opp_pts", "won"]]
            )

            combined = pd.concat(all_team_games, ignore_index=True)
        else:
            # Sports-Reference style format with team_id perspective
            combined = games.copy()
            if "won" not in combined.columns:
                combined["won"] = combined["pts"] > combined["opp_pts"]

        # Calculate recent form for each team-season
        for (season, team_id), team_games in combined.groupby(["season", "team_id"]):
            team_games = team_games.sort_values("date")
            recent = team_games.tail(window)

            if len(recent) < 3:
                continue

            wins = recent["won"].sum()
            games_count = len(recent)
            point_diff = (recent["pts"] - recent["opp_pts"]).mean()
            avg_pts = recent["pts"].mean()
            avg_opp_pts = recent["opp_pts"].mean()

            form_data.append(
                {
                    "season": season,
                    "team_id": team_id,
                    "recent_wins": wins,
                    "recent_games": games_count,
                    "recent_win_pct": wins / games_count,
                    "recent_point_diff": point_diff,
                    "recent_ppg": avg_pts,
                    "recent_opp_ppg": avg_opp_pts,
                }
            )

        return pd.DataFrame(form_data)

    def calculate_sos(
        self, team_stats: pd.DataFrame, games: pd.DataFrame
    ) -> pd.DataFrame:
        """Calculate strength of schedule.

        Args:
            team_stats: Team statistics
            games: Game results

        Returns:
            DataFrame with added SOS column
        """
        df = team_stats.copy()

        if games.empty:
            df["sos"] = 0.0
            return df

        # Build win percentage lookup
        win_pct_lookup: Dict[Tuple[int, str], float] = {}
        for _, row in df.iterrows():
            key = (row["season"], row["team_id"])
            win_pct_lookup[key] = row.get("win_pct", 0.5)

        # Calculate opponent win percentage for each team
        opp_win_pcts: Dict[Tuple[int, str], List[float]] = {}

        if "home_team_id" in games.columns:
            for _, game in games.iterrows():
                season = game["season"]
                home_id = game.get("home_team_id")
                away_id = game.get("away_team_id")

                if home_id and away_id:
                    home_key = (season, home_id)
                    away_key = (season, away_id)

                    if away_key in win_pct_lookup:
                        if home_key not in opp_win_pcts:
                            opp_win_pcts[home_key] = []
                        opp_win_pcts[home_key].append(win_pct_lookup[away_key])

                    if home_key in win_pct_lookup:
                        if away_key not in opp_win_pcts:
                            opp_win_pcts[away_key] = []
                        opp_win_pcts[away_key].append(win_pct_lookup[home_key])

        # Calculate SOS as average opponent win percentage - 0.5
        sos_values = []
        for _, row in df.iterrows():
            key = (row["season"], row["team_id"])
            if key in opp_win_pcts and opp_win_pcts[key]:
                sos = (np.mean(opp_win_pcts[key]) - 0.5) * 10  # Scale to ~-5 to +5
            else:
                sos = 0.0
            sos_values.append(sos)

        df["sos"] = sos_values

        return df
