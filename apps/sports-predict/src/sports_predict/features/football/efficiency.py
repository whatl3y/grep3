"""Football efficiency calculations."""

from typing import Dict, Any, Optional

import pandas as pd
import numpy as np


class FootballEfficiencyCalculator:
    """Calculate football efficiency metrics.

    This calculator provides DVOA-style approximations for football teams
    using available statistics. Since we don't have play-by-play data,
    these are simplified versions based on aggregate team stats.
    """

    # League average benchmarks
    LEAGUE_AVG_PPG = 24.0
    LEAGUE_AVG_YARDS = 350.0
    LEAGUE_AVG_THIRD_DOWN = 0.40
    LEAGUE_AVG_RED_ZONE = 0.55

    def calculate_offensive_efficiency(
        self,
        points_per_game: float,
        total_yards: float,
        third_down_pct: Optional[float] = None,
        red_zone_pct: Optional[float] = None,
    ) -> float:
        """Calculate offensive efficiency rating.

        Args:
            points_per_game: Average points scored per game
            total_yards: Total yards per game
            third_down_pct: Third down conversion percentage (optional)
            red_zone_pct: Red zone scoring percentage (optional)

        Returns:
            Offensive efficiency rating (0 = average, positive = better)
        """
        # Points component (most important)
        pts_component = (points_per_game - self.LEAGUE_AVG_PPG) / self.LEAGUE_AVG_PPG

        # Yards component
        yards_component = (total_yards - self.LEAGUE_AVG_YARDS) / self.LEAGUE_AVG_YARDS

        # Third down component (if available)
        if third_down_pct is not None and not pd.isna(third_down_pct):
            third_component = (third_down_pct - self.LEAGUE_AVG_THIRD_DOWN) / self.LEAGUE_AVG_THIRD_DOWN
        else:
            third_component = 0.0

        # Red zone component (if available)
        if red_zone_pct is not None and not pd.isna(red_zone_pct):
            rz_component = (red_zone_pct - self.LEAGUE_AVG_RED_ZONE) / self.LEAGUE_AVG_RED_ZONE
        else:
            rz_component = 0.0

        # Weighted combination
        # Points and yards are most important, situational stats are supplementary
        efficiency = (
            0.5 * pts_component
            + 0.3 * yards_component
            + 0.1 * third_component
            + 0.1 * rz_component
        )

        return round(efficiency, 4)

    def calculate_defensive_efficiency(
        self,
        points_allowed: float,
        yards_allowed: Optional[float] = None,
    ) -> float:
        """Calculate defensive efficiency rating.

        Args:
            points_allowed: Average points allowed per game
            yards_allowed: Average yards allowed per game (optional)

        Returns:
            Defensive efficiency rating (0 = average, positive = better defense)
        """
        # Points component (note: lower is better, so we invert)
        pts_component = (self.LEAGUE_AVG_PPG - points_allowed) / self.LEAGUE_AVG_PPG

        # Yards component (if available)
        if yards_allowed is not None and not pd.isna(yards_allowed):
            yards_component = (self.LEAGUE_AVG_YARDS - yards_allowed) / self.LEAGUE_AVG_YARDS
        else:
            yards_component = 0.0

        # Weighted combination
        efficiency = 0.7 * pts_component + 0.3 * yards_component

        return round(efficiency, 4)

    def calculate_net_efficiency(
        self,
        off_efficiency: float,
        def_efficiency: float,
    ) -> float:
        """Calculate net efficiency (offense + defense).

        Args:
            off_efficiency: Offensive efficiency rating
            def_efficiency: Defensive efficiency rating

        Returns:
            Net efficiency rating
        """
        return round(off_efficiency + def_efficiency, 4)

    def add_efficiency_metrics(self, team_stats: pd.DataFrame) -> pd.DataFrame:
        """Add efficiency metrics to team stats DataFrame.

        Args:
            team_stats: DataFrame with team statistics

        Returns:
            DataFrame with added efficiency columns
        """
        df = team_stats.copy()

        # Convert columns to numeric first (handles None -> NaN)
        if "pts_per_game" in df.columns:
            df["pts_per_game"] = pd.to_numeric(df["pts_per_game"], errors="coerce")
        if "pts_allowed" in df.columns:
            df["pts_allowed"] = pd.to_numeric(df["pts_allowed"], errors="coerce")
        if "total_yds" in df.columns:
            df["total_yds"] = pd.to_numeric(df["total_yds"], errors="coerce")
        if "third_down_pct" in df.columns:
            df["third_down_pct"] = pd.to_numeric(df["third_down_pct"], errors="coerce")
        if "red_zone_pct" in df.columns:
            df["red_zone_pct"] = pd.to_numeric(df["red_zone_pct"], errors="coerce")

        # Calculate league averages for this data (using only non-null values)
        league_avg_pts = self.LEAGUE_AVG_PPG
        league_avg_allowed = self.LEAGUE_AVG_PPG
        if "pts_per_game" in df.columns:
            valid_pts = df["pts_per_game"].dropna()
            if len(valid_pts) > 0:
                league_avg_pts = valid_pts.mean()
        if "pts_allowed" in df.columns:
            valid_allowed = df["pts_allowed"].dropna()
            if len(valid_allowed) > 0:
                league_avg_allowed = valid_allowed.mean()

        # Calculate efficiency for each team
        off_eff = []
        def_eff = []
        net_eff = []

        for _, row in df.iterrows():
            ppg = row.get("pts_per_game")
            total_yds = row.get("total_yds")
            third_pct = row.get("third_down_pct")
            rz_pct = row.get("red_zone_pct")
            pts_allowed = row.get("pts_allowed")

            # Use defaults for None/NaN values
            ppg = ppg if pd.notna(ppg) else league_avg_pts
            total_yds = total_yds if pd.notna(total_yds) else self.LEAGUE_AVG_YARDS
            pts_allowed = pts_allowed if pd.notna(pts_allowed) else league_avg_allowed

            off = self.calculate_offensive_efficiency(
                ppg,
                total_yds,
                third_pct,
                rz_pct,
            )
            deff = self.calculate_defensive_efficiency(pts_allowed)
            net = self.calculate_net_efficiency(off, deff)

            off_eff.append(off)
            def_eff.append(deff)
            net_eff.append(net)

        df["off_efficiency"] = off_eff
        df["def_efficiency"] = def_eff
        df["net_efficiency"] = net_eff

        return df

    def estimate_expected_points(
        self,
        team_a_ppg: float,
        team_a_pts_allowed: float,
        team_b_ppg: float,
        team_b_pts_allowed: float,
    ) -> tuple[float, float]:
        """Estimate expected points for a matchup.

        Uses a simple average of offensive and defensive expectations.

        Args:
            team_a_ppg: Team A points per game
            team_a_pts_allowed: Team A points allowed per game
            team_b_ppg: Team B points per game
            team_b_pts_allowed: Team B points allowed per game

        Returns:
            Tuple of (team_a_expected, team_b_expected)
        """
        # Team A's expected points: average of their offense vs B's defense
        team_a_expected = (team_a_ppg + team_b_pts_allowed) / 2

        # Team B's expected points: average of their offense vs A's defense
        team_b_expected = (team_b_ppg + team_a_pts_allowed) / 2

        return round(team_a_expected, 1), round(team_b_expected, 1)
