"""Efficiency rating calculations (KenPom-style metrics)."""

from typing import Optional

import numpy as np
import pandas as pd


class EfficiencyCalculator:
    """
    Calculate offensive and defensive efficiency ratings.

    Efficiency is measured as points per 100 possessions, which normalizes
    for pace and allows fair comparison between teams.
    """

    @staticmethod
    def estimate_possessions(
        fga: float,
        orb: float,
        tov: float,
        fta: float,
    ) -> float:
        """
        Estimate possessions using the standard formula.

        Possessions ≈ FGA - ORB + TOV + 0.44 * FTA

        Args:
            fga: Field goal attempts
            orb: Offensive rebounds
            tov: Turnovers
            fta: Free throw attempts

        Returns:
            Estimated possessions
        """
        return fga - orb + tov + 0.44 * fta

    @staticmethod
    def calculate_pace(
        possessions: float,
        minutes: float = 40.0,
    ) -> float:
        """
        Calculate pace (possessions per 40 minutes).

        Args:
            possessions: Number of possessions
            minutes: Minutes played (default 40)

        Returns:
            Pace
        """
        if minutes == 0:
            return 0.0
        return (possessions / minutes) * 40.0

    @staticmethod
    def calculate_offensive_rating(
        points: float,
        possessions: float,
    ) -> float:
        """
        Calculate offensive efficiency (points per 100 possessions).

        Args:
            points: Points scored
            possessions: Number of possessions

        Returns:
            Offensive rating
        """
        if possessions == 0:
            return 0.0
        return (points / possessions) * 100.0

    @staticmethod
    def calculate_defensive_rating(
        opp_points: float,
        possessions: float,
    ) -> float:
        """
        Calculate defensive efficiency (opponent points per 100 possessions).

        Lower is better for defense.

        Args:
            opp_points: Opponent points allowed
            possessions: Number of possessions

        Returns:
            Defensive rating
        """
        if possessions == 0:
            return 0.0
        return (opp_points / possessions) * 100.0

    def calculate_team_efficiency(self, team_stats: pd.Series) -> dict:
        """
        Calculate efficiency metrics for a team from their stats.

        Args:
            team_stats: Series with team statistics

        Returns:
            Dict with efficiency metrics
        """
        # Get per-game stats
        fga = team_stats.get("fga_per_game", 60)
        orb = team_stats.get("orb_per_game", 10)
        tov = team_stats.get("tov_per_game", 12)
        fta = team_stats.get("fta_per_game", 18)
        pts = team_stats.get("pts_per_game", 70)
        opp_pts = team_stats.get("opp_pts_per_game", 70)

        # Handle missing data with defaults
        fga = fga if pd.notna(fga) else 60
        orb = orb if pd.notna(orb) else 10
        tov = tov if pd.notna(tov) else 12
        fta = fta if pd.notna(fta) else 18
        pts = pts if pd.notna(pts) else 70
        opp_pts = opp_pts if pd.notna(opp_pts) else 70

        possessions = self.estimate_possessions(fga, orb, tov, fta)
        pace = self.calculate_pace(possessions)
        ortg = self.calculate_offensive_rating(pts, possessions)
        drtg = self.calculate_defensive_rating(opp_pts, possessions)

        return {
            "possessions": possessions,
            "pace": pace,
            "ortg": ortg,
            "drtg": drtg,
            "net_rating": ortg - drtg,
        }

    def add_efficiency_to_stats(self, team_stats: pd.DataFrame) -> pd.DataFrame:
        """
        Add efficiency columns to team stats DataFrame.

        Args:
            team_stats: DataFrame with team statistics

        Returns:
            DataFrame with added efficiency columns
        """
        df = team_stats.copy()

        # Calculate possessions
        df["est_possessions"] = df.apply(
            lambda row: self.estimate_possessions(
                row.get("fga_per_game", 60) or 60,
                row.get("orb_per_game", 10) or 10,
                row.get("tov_per_game", 12) or 12,
                row.get("fta_per_game", 18) or 18,
            ),
            axis=1,
        )

        # Calculate pace
        df["pace"] = df["est_possessions"].apply(lambda p: self.calculate_pace(p))

        # Calculate offensive rating
        df["ortg"] = df.apply(
            lambda row: self.calculate_offensive_rating(
                row.get("pts_per_game", 70) or 70,
                row["est_possessions"],
            ),
            axis=1,
        )

        # Calculate defensive rating
        df["drtg"] = df.apply(
            lambda row: self.calculate_defensive_rating(
                row.get("opp_pts_per_game", 70) or 70,
                row["est_possessions"],
            ),
            axis=1,
        )

        # Net rating
        df["net_rating"] = df["ortg"] - df["drtg"]

        return df

    @staticmethod
    def calculate_four_factors(team_stats: pd.Series) -> dict:
        """
        Calculate Dean Oliver's Four Factors.

        The four factors are:
        1. Effective FG% (shooting)
        2. Turnover Rate (ball security)
        3. Offensive Rebound Rate (second chances)
        4. Free Throw Rate (getting to the line)

        Args:
            team_stats: Series with team statistics

        Returns:
            Dict with four factors
        """
        # Get stats with defaults
        fg = team_stats.get("fg_per_game", 25) or 25
        fg3 = team_stats.get("fg3_per_game", 7) or 7
        fga = team_stats.get("fga_per_game", 60) or 60
        fta = team_stats.get("fta_per_game", 18) or 18
        ft = team_stats.get("ft_per_game", 14) or 14
        orb = team_stats.get("orb_per_game", 10) or 10
        tov = team_stats.get("tov_per_game", 12) or 12
        trb = team_stats.get("trb_per_game", 35) or 35

        # Effective FG% = (FG + 0.5 * 3FG) / FGA
        efg_pct = (fg + 0.5 * fg3) / fga if fga > 0 else 0.0

        # Turnover Rate = TOV / (FGA + 0.44 * FTA + TOV)
        possessions_proxy = fga + 0.44 * fta + tov
        tov_rate = tov / possessions_proxy if possessions_proxy > 0 else 0.0

        # Offensive Rebound Rate = ORB / (ORB + opponent DRB)
        # Approximate opponent DRB as TRB - ORB for the opponent
        drb = trb - orb
        orb_rate = orb / (orb + drb) if (orb + drb) > 0 else 0.0

        # Free Throw Rate = FT / FGA
        ft_rate = ft / fga if fga > 0 else 0.0

        return {
            "efg_pct": efg_pct,
            "tov_rate": tov_rate,
            "orb_rate": orb_rate,
            "ft_rate": ft_rate,
        }
