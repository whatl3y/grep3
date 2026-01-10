"""Team feature building for model training."""

from typing import Optional

import pandas as pd
import numpy as np

from .efficiency import EfficiencyCalculator
from .strength import StrengthOfScheduleCalculator


class TeamFeatureBuilder:
    """Build feature vectors for teams and matchups."""

    def __init__(self):
        self.efficiency_calc = EfficiencyCalculator()
        self.sos_calc = StrengthOfScheduleCalculator()

    def build_team_features(
        self,
        team_stats: pd.DataFrame,
        games: pd.DataFrame,
    ) -> pd.DataFrame:
        """
        Build comprehensive feature set for all teams.

        Args:
            team_stats: Raw team statistics
            games: Game results

        Returns:
            DataFrame with all team features
        """
        # Start with team stats
        df = team_stats.copy()

        # Add efficiency metrics
        df = self.efficiency_calc.add_efficiency_to_stats(df)

        # Add adjusted efficiency (opponent-strength adjusted)
        df = self.sos_calc.calculate_adjusted_efficiency(df, games)

        # Rank teams
        df = self.sos_calc.rank_teams(df, "adj_net")

        # Add four factors (only if columns don't already exist)
        four_factor_cols = ["efg_pct", "tov_rate", "orb_rate", "ft_rate"]
        if not all(col in df.columns for col in four_factor_cols):
            four_factors = df.apply(
                lambda row: pd.Series(self.efficiency_calc.calculate_four_factors(row)),
                axis=1,
            )
            # Only add columns that don't exist
            for col in four_factors.columns:
                if col not in df.columns:
                    df[col] = four_factors[col]

        # Add recent form if we have games
        if not games.empty:
            recent_form = self.sos_calc.calculate_recent_form(games)
            if not recent_form.empty:
                # Drop any columns that would create duplicates (except keys)
                existing_cols = set(df.columns) - {"season", "team_id"}
                form_cols_to_add = [c for c in recent_form.columns
                                    if c not in existing_cols or c in ["season", "team_id"]]
                recent_form = recent_form[form_cols_to_add]
                df = df.merge(
                    recent_form,
                    on=["season", "team_id"],
                    how="left",
                )

        # Clean up any duplicate columns that might have been created
        if df.columns.duplicated().any():
            df = df.loc[:, ~df.columns.duplicated()]

        return df

    def create_matchup_features(
        self,
        team_a_stats: pd.Series,
        team_b_stats: pd.Series,
        location: str = "neutral",
    ) -> dict:
        """
        Create feature vector for a matchup between two teams.

        Args:
            team_a_stats: Stats for team A (the team we're predicting for)
            team_b_stats: Stats for team B (opponent)
            location: 'home', 'away', or 'neutral' for team A

        Returns:
            Dict of features for the matchup
        """
        def get_scalar(series, key, default):
            """Safely get a scalar value from a Series, handling Series-in-Series cases."""
            val = series.get(key, default)
            # Handle case where value is itself a Series (from concat issues)
            if isinstance(val, pd.Series):
                val = val.iloc[0] if len(val) > 0 else default
            # Handle numpy types and ensure numeric
            if pd.isna(val):
                return default
            try:
                return float(val)
            except (TypeError, ValueError):
                return default

        features = {}

        # Team A features (offensive perspective)
        features["a_adj_ortg"] = get_scalar(team_a_stats, "adj_ortg", 100)
        features["a_adj_drtg"] = get_scalar(team_a_stats, "adj_drtg", 100)
        features["a_adj_net"] = get_scalar(team_a_stats, "adj_net", 0)
        features["a_pace"] = get_scalar(team_a_stats, "pace", 68)
        features["a_srs"] = get_scalar(team_a_stats, "srs", 0)
        features["a_sos"] = get_scalar(team_a_stats, "sos", 0)
        features["a_efg_pct"] = get_scalar(team_a_stats, "efg_pct", 0.5)
        features["a_tov_rate"] = get_scalar(team_a_stats, "tov_rate", 0.15)
        features["a_orb_rate"] = get_scalar(team_a_stats, "orb_rate", 0.3)
        features["a_ft_rate"] = get_scalar(team_a_stats, "ft_rate", 0.3)
        features["a_fg3_pct"] = get_scalar(team_a_stats, "fg3_pct", 0.33)
        features["a_win_pct"] = get_scalar(team_a_stats, "win_pct", 0.5)

        # Recent form for team A
        features["a_recent_win_pct"] = get_scalar(team_a_stats, "recent_win_pct", 0.5)
        features["a_recent_point_diff"] = get_scalar(team_a_stats, "recent_point_diff", 0)

        # Team B features (defensive perspective for A)
        features["b_adj_ortg"] = get_scalar(team_b_stats, "adj_ortg", 100)
        features["b_adj_drtg"] = get_scalar(team_b_stats, "adj_drtg", 100)
        features["b_adj_net"] = get_scalar(team_b_stats, "adj_net", 0)
        features["b_pace"] = get_scalar(team_b_stats, "pace", 68)
        features["b_srs"] = get_scalar(team_b_stats, "srs", 0)
        features["b_sos"] = get_scalar(team_b_stats, "sos", 0)
        features["b_efg_pct"] = get_scalar(team_b_stats, "efg_pct", 0.5)
        features["b_tov_rate"] = get_scalar(team_b_stats, "tov_rate", 0.15)
        features["b_orb_rate"] = get_scalar(team_b_stats, "orb_rate", 0.3)
        features["b_ft_rate"] = get_scalar(team_b_stats, "ft_rate", 0.3)
        features["b_fg3_pct"] = get_scalar(team_b_stats, "fg3_pct", 0.33)
        features["b_win_pct"] = get_scalar(team_b_stats, "win_pct", 0.5)

        # Recent form for team B
        features["b_recent_win_pct"] = get_scalar(team_b_stats, "recent_win_pct", 0.5)
        features["b_recent_point_diff"] = get_scalar(team_b_stats, "recent_point_diff", 0)

        # Differential features (key for spread prediction)
        features["net_rating_diff"] = features["a_adj_net"] - features["b_adj_net"]
        features["srs_diff"] = features["a_srs"] - features["b_srs"]
        features["ortg_vs_drtg"] = features["a_adj_ortg"] - features["b_adj_drtg"]
        features["drtg_vs_ortg"] = features["b_adj_ortg"] - features["a_adj_drtg"]

        # Expected pace (average of both teams)
        features["expected_pace"] = (features["a_pace"] + features["b_pace"]) / 2

        # Location encoding
        features["is_home"] = 1 if location == "home" else 0
        features["is_away"] = 1 if location == "away" else 0
        features["is_neutral"] = 1 if location == "neutral" else 0

        return features

    def create_training_dataset(
        self,
        team_stats: pd.DataFrame,
        games: pd.DataFrame,
    ) -> pd.DataFrame:
        """
        Create training dataset from historical games.

        Each game creates one training sample from team A's perspective.

        Args:
            team_stats: Team statistics with features
            games: Game results

        Returns:
            DataFrame ready for model training
        """
        if games.empty or team_stats.empty:
            return pd.DataFrame()

        training_data = []

        # Create lookup for team stats
        stats_lookup = {}
        for _, row in team_stats.iterrows():
            key = (row["season"], row["team_id"])
            stats_lookup[key] = row

        for _, game in games.iterrows():
            season = game["season"]
            team_id = game["team_id"]
            opponent_id = game.get("opponent_id")

            if not opponent_id:
                continue

            # Get team stats
            team_key = (season, team_id)
            opp_key = (season, opponent_id)

            if team_key not in stats_lookup or opp_key not in stats_lookup:
                continue

            team_a_stats = stats_lookup[team_key]
            team_b_stats = stats_lookup[opp_key]

            # Create matchup features
            location = game.get("location", "neutral")
            features = self.create_matchup_features(team_a_stats, team_b_stats, location)

            # Add target variable (point differential from team A perspective)
            point_diff = game.get("point_diff")
            if point_diff is None:
                pts = game.get("pts")
                opp_pts = game.get("opp_pts")
                if pts is not None and opp_pts is not None:
                    point_diff = pts - opp_pts
                else:
                    continue

            features["target_spread"] = point_diff

            # Add metadata (not for training)
            features["_season"] = season
            features["_team_id"] = team_id
            features["_opponent_id"] = opponent_id
            features["_date"] = game.get("date")

            training_data.append(features)

        return pd.DataFrame(training_data)

    @staticmethod
    def get_feature_columns() -> list[str]:
        """Get list of feature columns for model training."""
        return [
            # Team A features
            "a_adj_ortg", "a_adj_drtg", "a_adj_net", "a_pace", "a_srs", "a_sos",
            "a_efg_pct", "a_tov_rate", "a_orb_rate", "a_ft_rate", "a_fg3_pct", "a_win_pct",
            "a_recent_win_pct", "a_recent_point_diff",
            # Team B features
            "b_adj_ortg", "b_adj_drtg", "b_adj_net", "b_pace", "b_srs", "b_sos",
            "b_efg_pct", "b_tov_rate", "b_orb_rate", "b_ft_rate", "b_fg3_pct", "b_win_pct",
            "b_recent_win_pct", "b_recent_point_diff",
            # Differential features
            "net_rating_diff", "srs_diff", "ortg_vs_drtg", "drtg_vs_ortg", "expected_pace",
            # Location
            "is_home", "is_away", "is_neutral",
        ]
