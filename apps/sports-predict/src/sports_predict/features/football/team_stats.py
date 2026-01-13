"""Football team statistics and feature builder."""

from typing import Dict, List, Optional

import pandas as pd
import numpy as np

from ...core.sport import League, get_sport_config
from ...core.registry import ComponentRegistry
from .efficiency import FootballEfficiencyCalculator
from .strength import FootballStrengthCalculator


class FootballFeatureBuilder:
    """Build features for football game predictions.

    This class combines efficiency metrics, strength of schedule,
    and other football-specific features for use in ML models.
    """

    # Matchup feature columns for football models (used in training)
    FEATURE_COLUMNS = [
        # Basic differential features
        "point_diff_delta",
        "win_pct_delta",
        # Offensive/defensive matchups
        "off_vs_def",
        "def_vs_off",
        # Adjusted rating differentials
        "adj_net_delta",
        "srs_delta",
        # Yardage differentials
        "total_yds_delta",
        "rush_yds_delta",
        "pass_yds_delta",
        # Efficiency battles
        "turnover_battle",
        "third_down_battle",
        # Recent form differentials
        "recent_form_delta",
        "recent_point_diff_delta",
        # Home field advantage
        "home_advantage",
        # Game context
        "is_postseason",
        # Expected differential
        "expected_diff",
    ]

    def __init__(self, league: League):
        """Initialize the feature builder.

        Args:
            league: The football league (NFL or NCAAF)
        """
        self.league = league
        self.config = get_sport_config(league)
        self.efficiency_calc = FootballEfficiencyCalculator()
        self.strength_calc = FootballStrengthCalculator()

    def build_team_features(
        self, team_stats: pd.DataFrame, games: pd.DataFrame
    ) -> pd.DataFrame:
        """Build all features for team statistics.

        Args:
            team_stats: Raw team statistics DataFrame
            games: Game results DataFrame

        Returns:
            DataFrame with all computed features
        """
        if team_stats.empty:
            return team_stats

        df = team_stats.copy()

        # Calculate pts_per_game and pts_allowed from games if missing
        df = self._calculate_points_from_games(df, games)

        # Calculate efficiency metrics
        df = self.efficiency_calc.add_efficiency_metrics(df)

        # Calculate strength of schedule
        df = self.strength_calc.calculate_sos(df, games)

        # Calculate adjusted ratings
        df = self.strength_calc.calculate_adjusted_ratings(df, games)

        # Add recent form metrics (only if not already present)
        recent_form = self.strength_calc.calculate_recent_form(games)
        if not recent_form.empty:
            # Only merge if recent_form columns don't already exist
            recent_form_cols = [c for c in recent_form.columns if c not in ["season", "team_id"]]
            if not any(col in df.columns for col in recent_form_cols):
                df = df.merge(
                    recent_form,
                    on=["season", "team_id"],
                    how="left",
                    suffixes=("", "_form"),
                )

        # Clean up any duplicate columns that might have been created
        if df.columns.duplicated().any():
            df = df.loc[:, ~df.columns.duplicated()]

        # Fill missing values with reasonable defaults
        df = self._fill_missing_values(df)

        return df

    def _calculate_points_from_games(
        self, team_stats: pd.DataFrame, games: pd.DataFrame
    ) -> pd.DataFrame:
        """Calculate pts_per_game and pts_allowed from games data when missing.

        The ESPN statistics API often returns 404 for team stats, but we can
        calculate scoring averages directly from game results.

        Args:
            team_stats: Team statistics DataFrame (may have None values)
            games: Game results DataFrame with scores

        Returns:
            DataFrame with pts_per_game and pts_allowed calculated from games
        """
        if games.empty:
            return team_stats

        df = team_stats.copy()

        # Check if we need to calculate from games
        needs_pts_calc = (
            "pts_per_game" not in df.columns
            or df["pts_per_game"].isna().all()
            or (df["pts_per_game"].apply(lambda x: x is None)).all()
        )
        needs_allowed_calc = (
            "pts_allowed" not in df.columns
            or df["pts_allowed"].isna().all()
            or (df["pts_allowed"].apply(lambda x: x is None)).all()
        )

        if not needs_pts_calc and not needs_allowed_calc:
            return df

        # Calculate points for and against from games
        points_data = {}

        if "home_team_id" in games.columns:
            for _, game in games.iterrows():
                season = game["season"]
                home_id = game.get("home_team_id")
                away_id = game.get("away_team_id")
                home_score = game.get("home_score", 0)
                away_score = game.get("away_score", 0)

                if not home_id or not away_id:
                    continue

                # Initialize if needed
                for team_id in [home_id, away_id]:
                    key = (season, team_id)
                    if key not in points_data:
                        points_data[key] = {"pts_for": [], "pts_against": []}

                # Home team
                home_key = (season, home_id)
                points_data[home_key]["pts_for"].append(home_score)
                points_data[home_key]["pts_against"].append(away_score)

                # Away team
                away_key = (season, away_id)
                points_data[away_key]["pts_for"].append(away_score)
                points_data[away_key]["pts_against"].append(home_score)

        # Update team stats with calculated averages
        for idx, row in df.iterrows():
            key = (row["season"], row["team_id"])
            if key in points_data:
                data = points_data[key]
                if needs_pts_calc and data["pts_for"]:
                    df.at[idx, "pts_per_game"] = np.mean(data["pts_for"])
                if needs_allowed_calc and data["pts_against"]:
                    df.at[idx, "pts_allowed"] = np.mean(data["pts_against"])

        return df

    def _fill_missing_values(self, df: pd.DataFrame) -> pd.DataFrame:
        """Fill missing values with sport-appropriate defaults.

        Args:
            df: DataFrame with potential missing values

        Returns:
            DataFrame with filled values
        """
        defaults = {
            "pts_per_game": 21.0 if self.league == League.NFL else 28.0,
            "pts_allowed": 21.0 if self.league == League.NFL else 28.0,
            "point_diff": 0.0,
            "win_pct": 0.5,
            "pass_yds": 220.0 if self.league == League.NFL else 240.0,
            "rush_yds": 110.0 if self.league == League.NFL else 150.0,
            "total_yds": 330.0 if self.league == League.NFL else 390.0,
            "pass_yds_allowed": 220.0 if self.league == League.NFL else 240.0,
            "rush_yds_allowed": 110.0 if self.league == League.NFL else 150.0,
            "total_yds_allowed": 330.0 if self.league == League.NFL else 390.0,
            "off_efficiency": 0.0,
            "def_efficiency": 0.0,
            "turnover_diff": 0.0,
            "third_down_pct": 0.40,
            "opp_third_down_pct": 0.40,
            "red_zone_pct": 0.55,
            "opp_red_zone_pct": 0.55,
            "srs": 0.0,
            "sos": 0.0,
            "adj_off": 21.0 if self.league == League.NFL else 28.0,
            "adj_def": 21.0 if self.league == League.NFL else 28.0,
            "adj_net": 0.0,
            "recent_win_pct": 0.5,
            "recent_point_diff": 0.0,
            "recent_ppg": 21.0 if self.league == League.NFL else 28.0,
            "recent_opp_ppg": 21.0 if self.league == League.NFL else 28.0,
        }

        for col, default_val in defaults.items():
            if col in df.columns:
                # Convert to numeric first (handles None -> NaN), then fill NaN
                df[col] = pd.to_numeric(df[col], errors="coerce").fillna(default_val)

        return df

    def create_matchup_features(
        self,
        team1_stats: pd.Series,
        team2_stats: pd.Series,
        team1_home: bool = True,
        postseason: bool = False,
    ) -> Dict[str, float]:
        """Create features for a specific matchup.

        Args:
            team1_stats: Statistics for team 1
            team2_stats: Statistics for team 2
            team1_home: Whether team 1 is the home team
            postseason: Whether this is a postseason/playoff game

        Returns:
            Dictionary of matchup features
        """
        features = {}

        # Basic differential features
        features["point_diff_delta"] = (
            team1_stats.get("point_diff", 0) - team2_stats.get("point_diff", 0)
        )
        features["win_pct_delta"] = (
            team1_stats.get("win_pct", 0.5) - team2_stats.get("win_pct", 0.5)
        )

        # Offensive matchup (team1 offense vs team2 defense)
        features["off_vs_def"] = (
            team1_stats.get("off_efficiency", 0) + team2_stats.get("def_efficiency", 0)
        )

        # Defensive matchup (team1 defense vs team2 offense)
        features["def_vs_off"] = (
            team1_stats.get("def_efficiency", 0) + team2_stats.get("off_efficiency", 0)
        )

        # Adjusted rating differential
        features["adj_net_delta"] = (
            team1_stats.get("adj_net", 0) - team2_stats.get("adj_net", 0)
        )

        # SRS differential
        features["srs_delta"] = (
            team1_stats.get("srs", 0) - team2_stats.get("srs", 0)
        )

        # Yardage differentials
        features["total_yds_delta"] = (
            team1_stats.get("total_yds", 330) - team2_stats.get("total_yds", 330)
        )
        features["rush_yds_delta"] = (
            team1_stats.get("rush_yds", 110) - team2_stats.get("rush_yds", 110)
        )
        features["pass_yds_delta"] = (
            team1_stats.get("pass_yds", 220) - team2_stats.get("pass_yds", 220)
        )

        # Turnover differential
        features["turnover_battle"] = (
            team1_stats.get("turnover_diff", 0) - team2_stats.get("turnover_diff", 0)
        )

        # Third down efficiency battle
        features["third_down_battle"] = (
            team1_stats.get("third_down_pct", 0.4)
            - team2_stats.get("opp_third_down_pct", 0.4)
        ) - (
            team2_stats.get("third_down_pct", 0.4)
            - team1_stats.get("opp_third_down_pct", 0.4)
        )

        # Recent form differential
        features["recent_form_delta"] = (
            team1_stats.get("recent_win_pct", 0.5)
            - team2_stats.get("recent_win_pct", 0.5)
        )
        features["recent_point_diff_delta"] = (
            team1_stats.get("recent_point_diff", 0)
            - team2_stats.get("recent_point_diff", 0)
        )

        # Home field advantage (reduced in postseason)
        home_advantage = self.config.home_advantage_points
        if postseason:
            # Postseason games have reduced home field advantage
            # Playoff teams are more experienced and less affected by crowd
            home_advantage *= 0.6
        features["home_advantage"] = home_advantage if team1_home else -home_advantage

        # Postseason flag - games tend to be tighter, more conservative
        features["is_postseason"] = 1.0 if postseason else 0.0

        # Expected point differential
        features["expected_diff"] = (
            features["adj_net_delta"] + features["home_advantage"]
        )

        return features

    def get_feature_columns(self) -> List[str]:
        """Get the list of feature columns used by the model.

        Returns:
            List of feature column names
        """
        return self.FEATURE_COLUMNS.copy()

    def prepare_training_data(
        self, team_stats: pd.DataFrame, games: pd.DataFrame
    ) -> pd.DataFrame:
        """Prepare training data from team stats and game results.

        Args:
            team_stats: Team statistics DataFrame (should already have features built)
            games: Game results DataFrame

        Returns:
            DataFrame with features and target variable
        """
        if games.empty:
            return pd.DataFrame()

        # Use provided team_stats directly - features should already be built by caller
        team_features = team_stats

        training_rows = []

        for _, game in games.iterrows():
            season = game["season"]
            home_id = game.get("home_team_id")
            away_id = game.get("away_team_id")
            home_score = game.get("home_score", 0)
            away_score = game.get("away_score", 0)

            if not home_id or not away_id:
                continue

            # Get team stats
            home_stats = team_features[
                (team_features["season"] == season)
                & (team_features["team_id"] == home_id)
            ]
            away_stats = team_features[
                (team_features["season"] == season)
                & (team_features["team_id"] == away_id)
            ]

            if home_stats.empty or away_stats.empty:
                continue

            home_stats = home_stats.iloc[0]
            away_stats = away_stats.iloc[0]

            # Create matchup features
            features = self.create_matchup_features(home_stats, away_stats, True)

            # Add target variable (home team point differential)
            features["actual_diff"] = home_score - away_score
            features["home_win"] = 1 if home_score > away_score else 0

            # Add metadata
            features["season"] = season
            features["home_team_id"] = home_id
            features["away_team_id"] = away_id

            training_rows.append(features)

        return pd.DataFrame(training_rows)


# Register for both NFL and NCAAF leagues
@ComponentRegistry.register_feature_builder(League.NFL)
class NFLFeatureBuilder(FootballFeatureBuilder):
    """Feature builder for NFL games."""

    def __init__(self, league: League = League.NFL):
        super().__init__(League.NFL)


@ComponentRegistry.register_feature_builder(League.NCAAF)
class NCAAFFeatureBuilder(FootballFeatureBuilder):
    """Feature builder for NCAA Football games."""

    def __init__(self, league: League = League.NCAAF):
        super().__init__(League.NCAAF)
