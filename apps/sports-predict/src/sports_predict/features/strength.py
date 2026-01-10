"""Strength of Schedule and opponent-adjusted metrics."""

from typing import Optional

import numpy as np
import pandas as pd


class StrengthOfScheduleCalculator:
    """
    Calculate strength of schedule and adjusted efficiency ratings.

    Uses iterative adjustment to account for opponent strength when
    calculating team ratings.
    """

    def __init__(self, iterations: int = 10):
        """
        Initialize calculator.

        Args:
            iterations: Number of iterations for rating convergence
        """
        self.iterations = iterations

    def calculate_simple_rating(self, team_stats: pd.DataFrame) -> pd.DataFrame:
        """
        Use Sports-Reference's SRS (Simple Rating System) directly.

        SRS = Point Differential + Strength of Schedule
        It's already calculated by Sports-Reference.

        Args:
            team_stats: DataFrame with team statistics

        Returns:
            DataFrame with SRS column ensured
        """
        df = team_stats.copy()

        # SRS should already exist, but calculate point diff if not
        if "srs" not in df.columns or df["srs"].isna().all():
            df["point_diff"] = df["pts_per_game"] - df["opp_pts_per_game"]
            df["srs"] = df["point_diff"]  # Simplified without opponent adjustment

        return df

    def calculate_adjusted_efficiency(
        self,
        team_stats: pd.DataFrame,
        games: pd.DataFrame,
    ) -> pd.DataFrame:
        """
        Calculate opponent-adjusted efficiency ratings.

        This is a simplified version of KenPom's methodology:
        1. Start with raw efficiency ratings
        2. Iteratively adjust based on opponent strength
        3. Converge to stable adjusted ratings

        Args:
            team_stats: DataFrame with team statistics and raw efficiency
            games: DataFrame with game results

        Returns:
            DataFrame with adjusted efficiency ratings
        """
        df = team_stats.copy()

        if games.empty or "ortg" not in df.columns:
            # No games data, return unadjusted
            df["adj_ortg"] = df.get("ortg", 100)
            df["adj_drtg"] = df.get("drtg", 100)
            df["adj_net"] = df["adj_ortg"] - df["adj_drtg"]
            return df

        # Initialize adjusted ratings with raw ratings
        df["adj_ortg"] = df["ortg"]
        df["adj_drtg"] = df["drtg"]

        # Create team lookup for efficiency
        for _ in range(self.iterations):
            # Build lookup of current ratings by (season, team_id)
            rating_lookup = {}
            for _, row in df.iterrows():
                key = (row["season"], row["team_id"])
                rating_lookup[key] = {
                    "adj_ortg": row["adj_ortg"],
                    "adj_drtg": row["adj_drtg"],
                }

            # Calculate average opponent ratings for each team
            opp_ratings = self._calculate_opponent_ratings(games, rating_lookup)

            # Adjust ratings based on opponent strength
            league_avg_ortg = df["adj_ortg"].mean()
            league_avg_drtg = df["adj_drtg"].mean()

            for idx, row in df.iterrows():
                key = (row["season"], row["team_id"])
                if key in opp_ratings:
                    opp_ortg, opp_drtg = opp_ratings[key]

                    # Adjust offensive rating: better rating if playing tough defenses
                    ortg_adjustment = (opp_drtg - league_avg_drtg) * 0.5
                    df.at[idx, "adj_ortg"] = row["ortg"] + ortg_adjustment

                    # Adjust defensive rating: better rating if playing good offenses
                    drtg_adjustment = (opp_ortg - league_avg_ortg) * 0.5
                    df.at[idx, "adj_drtg"] = row["drtg"] - drtg_adjustment

        # Calculate adjusted net rating
        df["adj_net"] = df["adj_ortg"] - df["adj_drtg"]

        return df

    def _calculate_opponent_ratings(
        self,
        games: pd.DataFrame,
        rating_lookup: dict,
    ) -> dict:
        """
        Calculate average opponent ratings for each team.

        Args:
            games: DataFrame with game results
            rating_lookup: Dict of (season, team_id) -> ratings

        Returns:
            Dict of (season, team_id) -> (avg_opp_ortg, avg_opp_drtg)
        """
        opp_ratings = {}

        # Group games by team
        for (season, team_id), team_games in games.groupby(["season", "team_id"]):
            opp_ortgs = []
            opp_drtgs = []

            for _, game in team_games.iterrows():
                opp_id = game.get("opponent_id")
                if opp_id:
                    opp_key = (season, opp_id)
                    if opp_key in rating_lookup:
                        opp_ortgs.append(rating_lookup[opp_key]["adj_ortg"])
                        opp_drtgs.append(rating_lookup[opp_key]["adj_drtg"])

            if opp_ortgs:
                opp_ratings[(season, team_id)] = (
                    np.mean(opp_ortgs),
                    np.mean(opp_drtgs),
                )

        return opp_ratings

    def calculate_recent_form(
        self,
        games: pd.DataFrame,
        window: int = 10,
    ) -> pd.DataFrame:
        """
        Calculate recent form metrics based on last N games.

        Args:
            games: DataFrame with game results
            window: Number of recent games to consider

        Returns:
            DataFrame with recent form metrics per team/season
        """
        if games.empty:
            return pd.DataFrame()

        form_data = []

        for (season, team_id), team_games in games.groupby(["season", "team_id"]):
            # Sort by date and take last N games
            team_games = team_games.sort_values("date")
            recent = team_games.tail(window)

            if len(recent) < 3:
                continue

            # Calculate recent metrics
            wins = recent["won"].sum() if "won" in recent.columns else 0
            games_count = len(recent)

            pts = recent["pts"].mean() if "pts" in recent.columns else 70
            opp_pts = recent["opp_pts"].mean() if "opp_pts" in recent.columns else 70
            point_diff = pts - opp_pts

            form_data.append({
                "season": season,
                "team_id": team_id,
                "recent_wins": wins,
                "recent_games": games_count,
                "recent_win_pct": wins / games_count if games_count > 0 else 0.5,
                "recent_pts": pts,
                "recent_opp_pts": opp_pts,
                "recent_point_diff": point_diff,
            })

        return pd.DataFrame(form_data)

    @staticmethod
    def rank_teams(team_stats: pd.DataFrame, metric: str = "adj_net") -> pd.DataFrame:
        """
        Rank teams by a given metric within each season.

        Args:
            team_stats: DataFrame with team statistics
            metric: Column to rank by

        Returns:
            DataFrame with rank column added
        """
        df = team_stats.copy()

        if metric not in df.columns:
            return df

        # Rank within each season
        df[f"{metric}_rank"] = df.groupby("season")[metric].rank(
            ascending=False,
            method="min",
        ).astype(int)

        return df
