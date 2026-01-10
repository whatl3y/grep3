"""Sport and league configuration."""

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import List


class SportType(Enum):
    """Top-level sport categories."""

    BASKETBALL = "basketball"
    FOOTBALL = "football"


class League(Enum):
    """Specific leagues within sports."""

    NCAAB = "ncaab"  # NCAA Men's Basketball
    NFL = "nfl"  # National Football League
    NCAAF = "ncaaf"  # NCAA Football (FBS)


@dataclass
class SportConfig:
    """Configuration for a specific sport/league combination."""

    league: League
    sport_type: SportType
    display_name: str

    # Data source configuration
    espn_sport: str  # "basketball" or "football"
    espn_league: str  # "mens-college-basketball", "nfl", "college-football"
    sports_ref_base: str  # Sports-Reference base URL

    # Season format
    season_format: str  # "academic" (2024-25) or "calendar" (2024)
    season_start_month: int  # Month season typically starts
    season_end_month: int  # Month season typically ends

    # Gameplay characteristics
    home_advantage_points: float  # Home field/court advantage
    typical_total_score: float  # Average combined score
    score_variance_std: float  # Typical game-to-game variance

    # Model configuration
    model_file_name: str  # e.g., "ncaab_model.joblib"

    # Feature columns for this sport
    feature_columns: List[str] = field(default_factory=list)


# Sport configuration registry
SPORT_CONFIGS: dict[League, SportConfig] = {
    League.NCAAB: SportConfig(
        league=League.NCAAB,
        sport_type=SportType.BASKETBALL,
        display_name="NCAA Basketball",
        espn_sport="basketball",
        espn_league="mens-college-basketball",
        sports_ref_base="https://www.sports-reference.com/cbb",
        season_format="academic",
        season_start_month=11,
        season_end_month=4,
        home_advantage_points=3.5,
        typical_total_score=140,
        score_variance_std=11.0,
        model_file_name="ncaab_model.joblib",
        feature_columns=[
            # Team A features
            "a_adj_ortg",
            "a_adj_drtg",
            "a_adj_net",
            "a_pace",
            "a_srs",
            "a_sos",
            "a_efg_pct",
            "a_tov_rate",
            "a_orb_rate",
            "a_ft_rate",
            "a_fg3_pct",
            "a_win_pct",
            "a_recent_win_pct",
            "a_recent_point_diff",
            # Team B features
            "b_adj_ortg",
            "b_adj_drtg",
            "b_adj_net",
            "b_pace",
            "b_srs",
            "b_sos",
            "b_efg_pct",
            "b_tov_rate",
            "b_orb_rate",
            "b_ft_rate",
            "b_fg3_pct",
            "b_win_pct",
            "b_recent_win_pct",
            "b_recent_point_diff",
            # Differential features
            "net_rating_diff",
            "srs_diff",
            "ortg_vs_drtg",
            "drtg_vs_ortg",
            "expected_pace",
            # Location
            "is_home",
            "is_away",
            "is_neutral",
        ],
    ),
    League.NFL: SportConfig(
        league=League.NFL,
        sport_type=SportType.FOOTBALL,
        display_name="NFL",
        espn_sport="football",
        espn_league="nfl",
        sports_ref_base="https://www.pro-football-reference.com",
        season_format="calendar",
        season_start_month=9,
        season_end_month=2,
        home_advantage_points=2.5,
        typical_total_score=46,
        score_variance_std=14.0,
        model_file_name="nfl_model.joblib",
        feature_columns=[
            # Team A features
            "a_pts_per_game",
            "a_pts_allowed",
            "a_pass_yds",
            "a_rush_yds",
            "a_total_yds",
            "a_turnover_diff",
            "a_third_down_pct",
            "a_red_zone_pct",
            "a_time_possession",
            "a_srs",
            "a_sos",
            "a_win_pct",
            "a_recent_win_pct",
            "a_recent_point_diff",
            # Team B features
            "b_pts_per_game",
            "b_pts_allowed",
            "b_pass_yds",
            "b_rush_yds",
            "b_total_yds",
            "b_turnover_diff",
            "b_third_down_pct",
            "b_red_zone_pct",
            "b_time_possession",
            "b_srs",
            "b_sos",
            "b_win_pct",
            "b_recent_win_pct",
            "b_recent_point_diff",
            # Differential features
            "pts_diff",
            "yards_diff",
            "turnover_diff_delta",
            "srs_diff",
            # Location
            "is_home",
            "is_away",
            "is_neutral",
        ],
    ),
    League.NCAAF: SportConfig(
        league=League.NCAAF,
        sport_type=SportType.FOOTBALL,
        display_name="NCAA Football",
        espn_sport="football",
        espn_league="college-football",
        sports_ref_base="https://www.sports-reference.com/cfb",
        season_format="calendar",
        season_start_month=8,
        season_end_month=1,
        home_advantage_points=3.0,
        typical_total_score=52,
        score_variance_std=16.0,
        model_file_name="ncaaf_model.joblib",
        feature_columns=[
            # Same as NFL but with additional college-specific features
            "a_pts_per_game",
            "a_pts_allowed",
            "a_pass_yds",
            "a_rush_yds",
            "a_total_yds",
            "a_turnover_diff",
            "a_third_down_pct",
            "a_red_zone_pct",
            "a_time_possession",
            "a_srs",
            "a_sos",
            "a_win_pct",
            "a_recent_win_pct",
            "a_recent_point_diff",
            "b_pts_per_game",
            "b_pts_allowed",
            "b_pass_yds",
            "b_rush_yds",
            "b_total_yds",
            "b_turnover_diff",
            "b_third_down_pct",
            "b_red_zone_pct",
            "b_time_possession",
            "b_srs",
            "b_sos",
            "b_win_pct",
            "b_recent_win_pct",
            "b_recent_point_diff",
            "pts_diff",
            "yards_diff",
            "turnover_diff_delta",
            "srs_diff",
            "is_home",
            "is_away",
            "is_neutral",
        ],
    ),
}


def get_sport_config(league: League) -> SportConfig:
    """Get configuration for a specific league."""
    return SPORT_CONFIGS[league]


def get_current_season(league: League) -> int:
    """Get the current season year for a league.

    For academic year sports (basketball), returns the ending year (2024-25 = 2025).
    For calendar year sports (football), returns the year the season started.
    """
    config = get_sport_config(league)
    now = datetime.now()

    if config.season_format == "academic":
        # Academic year: if before end month, we're in season ending this year
        if now.month <= config.season_end_month:
            return now.year
        else:
            return now.year + 1
    else:
        # Calendar year: if before start month, we're in previous season
        if now.month < config.season_start_month:
            return now.year - 1
        else:
            return now.year
