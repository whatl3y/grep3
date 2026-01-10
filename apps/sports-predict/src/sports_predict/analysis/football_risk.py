"""Football-specific risk analysis and uncertainty quantification."""

from typing import Optional

import numpy as np
import pandas as pd

from ..core.sport import League, get_sport_config
from ..core.registry import ComponentRegistry


def _get_scalar(series: pd.Series, key: str, default: float) -> float:
    """Safely get a scalar value from a Series, handling Series-in-Series cases."""
    val = series.get(key, default)
    if isinstance(val, pd.Series):
        val = val.iloc[0] if len(val) > 0 else default
    if pd.isna(val):
        return default
    try:
        return float(val)
    except (TypeError, ValueError):
        return default


class FootballRiskAnalyzer:
    """
    Analyze risk factors and quantify prediction uncertainty for football games.

    Provides football-specific risk factors that could cause the actual result
    to differ from the prediction.
    """

    # Historical standard deviations by game type
    GAME_TYPE_VARIANCE = {
        "rivalry": 16.0,
        "playoff": 12.0,
        "conference": 14.0,
        "non_conference": 15.0,
        "default": 14.0,
    }

    # Thresholds for flagging risk factors
    HIGH_TURNOVER_DIFF = 0.5  # Per game turnover differential threshold
    CLOSE_SPREAD_THRESHOLD = 3.0  # Spreads under this are toss-ups
    THIRD_DOWN_EFFICIENCY_GAP = 0.08  # 8% difference is significant
    TIME_OF_POSSESSION_GAP = 3.0  # 3 minute difference is significant

    def __init__(self, league: League = League.NFL):
        """Initialize the analyzer for a specific league.

        Args:
            league: The football league (NFL or NCAAF)
        """
        self.league = league
        self.config = get_sport_config(league)

    def analyze_matchup_risk(
        self,
        team_a_stats: pd.Series,
        team_b_stats: pd.Series,
        prediction: dict,
        location: str = "neutral",
    ) -> dict:
        """
        Analyze risk factors for a football matchup.

        Args:
            team_a_stats: Stats for team A
            team_b_stats: Stats for team B
            prediction: Prediction dict from SpreadPredictor
            location: Game location

        Returns:
            Dict with risk analysis
        """
        risk_factors = []
        confidence_adjustments = []

        # 1. Turnover-prone teams
        a_turnover_diff = _get_scalar(team_a_stats, "turnover_diff", 0)
        b_turnover_diff = _get_scalar(team_b_stats, "turnover_diff", 0)

        if a_turnover_diff < -self.HIGH_TURNOVER_DIFF:
            risk_factors.append({
                "factor": f"Turnover-prone team",
                "description": f"Team A has negative turnover differential ({a_turnover_diff:+.1f}/game)",
                "severity": "high",
            })
            confidence_adjustments.append(1.15)

        if b_turnover_diff < -self.HIGH_TURNOVER_DIFF:
            risk_factors.append({
                "factor": f"Turnover-prone team",
                "description": f"Team B has negative turnover differential ({b_turnover_diff:+.1f}/game)",
                "severity": "high",
            })
            confidence_adjustments.append(1.15)

        # 2. Third down efficiency mismatch
        a_third_down = _get_scalar(team_a_stats, "third_down_pct", 0.40)
        b_third_down = _get_scalar(team_b_stats, "third_down_pct", 0.40)
        third_down_gap = abs(a_third_down - b_third_down)

        if third_down_gap > self.THIRD_DOWN_EFFICIENCY_GAP:
            risk_factors.append({
                "factor": "Third down efficiency gap",
                "description": f"Large gap in 3rd down conversion ({third_down_gap:.0%}) - game flow could shift",
                "severity": "medium",
            })
            confidence_adjustments.append(1.1)

        # 3. Time of possession mismatch (pace/tempo)
        a_top = _get_scalar(team_a_stats, "time_possession", 30.0)
        b_top = _get_scalar(team_b_stats, "time_possession", 30.0)
        top_diff = abs(a_top - b_top)

        if top_diff > self.TIME_OF_POSSESSION_GAP:
            risk_factors.append({
                "factor": "Tempo mismatch",
                "description": f"Large time of possession difference ({top_diff:.1f} min) - game pace uncertain",
                "severity": "medium",
            })
            confidence_adjustments.append(1.1)

        # 4. Close matchup (spread near zero)
        spread = prediction.get("spread", 0)
        if abs(spread) < self.CLOSE_SPREAD_THRESHOLD:
            risk_factors.append({
                "factor": "Close matchup",
                "description": "Predicted spread is small - essentially a toss-up",
                "severity": "high",
            })
            confidence_adjustments.append(1.15)

        # 5. Recent form disparity
        a_recent_win_pct = _get_scalar(team_a_stats, "recent_win_pct", 0.5)
        b_recent_win_pct = _get_scalar(team_b_stats, "recent_win_pct", 0.5)
        form_diff = abs(a_recent_win_pct - b_recent_win_pct)

        if form_diff > 0.4:  # e.g., 80% vs 40%
            cold_team = "Team A" if a_recent_win_pct < b_recent_win_pct else "Team B"
            risk_factors.append({
                "factor": "Momentum mismatch",
                "description": f"{cold_team} is in poor recent form - could be turning point or continued struggle",
                "severity": "medium",
            })
            confidence_adjustments.append(1.1)

        # 6. Home field factor
        if location in ["home", "away"]:
            home_advantage = self.config.home_advantage_points
            risk_factors.append({
                "factor": "Home field factor",
                "description": f"Home field advantage adds ~{home_advantage:.1f} points but varies by venue",
                "severity": "low",
            })

        # 7. NCAAF specific: Larger skill gaps
        if self.league == League.NCAAF:
            a_srs = _get_scalar(team_a_stats, "srs", 0)
            b_srs = _get_scalar(team_b_stats, "srs", 0)
            srs_gap = abs(a_srs - b_srs)

            if srs_gap > 15:
                risk_factors.append({
                    "factor": "Major talent gap",
                    "description": "Large SRS difference - blowout possible in either direction",
                    "severity": "medium",
                })
                confidence_adjustments.append(1.15)

        # Calculate overall confidence
        base_std = self.config.score_variance_std
        adjusted_std = base_std * np.prod(confidence_adjustments) if confidence_adjustments else base_std

        # Determine confidence level based on interval width
        spread_lower = prediction.get("spread_lower", spread - base_std)
        spread_upper = prediction.get("spread_upper", spread + base_std)
        interval_width = spread_upper - spread_lower

        # Football has higher variance, adjust thresholds
        if interval_width < 24:
            confidence_level = "High"
        elif interval_width < 32:
            confidence_level = "Medium"
        else:
            confidence_level = "Low"

        return {
            "risk_factors": risk_factors,
            "confidence_level": confidence_level,
            "adjusted_std": round(adjusted_std, 1),
            "interval_width": round(interval_width, 1),
        }

    def calculate_expected_score(
        self,
        team_a_stats: pd.Series,
        team_b_stats: pd.Series,
        spread: float,
    ) -> tuple[int, int]:
        """
        Calculate expected final score based on spread and scoring patterns.

        Args:
            team_a_stats: Stats for team A
            team_b_stats: Stats for team B
            spread: Predicted point spread

        Returns:
            Tuple of (team_a_score, team_b_score)
        """
        # Average points per game for both teams
        a_ppg = _get_scalar(team_a_stats, "pts_per_game", 21 if self.league == League.NFL else 28)
        b_ppg = _get_scalar(team_b_stats, "pts_per_game", 21 if self.league == League.NFL else 28)
        a_opp_ppg = _get_scalar(team_a_stats, "pts_allowed", 21 if self.league == League.NFL else 28)
        b_opp_ppg = _get_scalar(team_b_stats, "pts_allowed", 21 if self.league == League.NFL else 28)

        # Estimate what each team would score vs the other
        # Team A's expected offense vs Team B's defense
        a_vs_b = (a_ppg + b_opp_ppg) / 2
        b_vs_a = (b_ppg + a_opp_ppg) / 2

        # Total expected points
        total = a_vs_b + b_vs_a

        # Split the total based on the spread
        team_a_score = (total + spread) / 2
        team_b_score = (total - spread) / 2

        # Round to reasonable football scores
        return round(team_a_score), round(team_b_score)

    def get_key_factors(
        self,
        team_a_stats: pd.Series,
        team_b_stats: pd.Series,
        team_a_name: str,
        team_b_name: str,
    ) -> list[dict]:
        """
        Get key statistical factors for the matchup.

        Args:
            team_a_stats: Stats for team A
            team_b_stats: Stats for team B
            team_a_name: Name of team A
            team_b_name: Name of team B

        Returns:
            List of key factor dicts
        """
        factors = []

        # Point differential comparison
        a_point_diff = _get_scalar(team_a_stats, "point_diff", 0)
        b_point_diff = _get_scalar(team_b_stats, "point_diff", 0)

        factors.append({
            "label": f"{team_a_name} Point Differential",
            "value": f"{a_point_diff:+.1f} pts/game",
            "favorable": a_point_diff > b_point_diff,
        })
        factors.append({
            "label": f"{team_b_name} Point Differential",
            "value": f"{b_point_diff:+.1f} pts/game",
            "favorable": b_point_diff > a_point_diff,
        })

        # Turnover battle
        a_turnover = _get_scalar(team_a_stats, "turnover_diff", 0)
        b_turnover = _get_scalar(team_b_stats, "turnover_diff", 0)

        factors.append({
            "label": "Turnover Battle",
            "value": f"{team_a_name} {a_turnover:+.1f} vs {team_b_name} {b_turnover:+.1f}",
            "favorable": a_turnover > b_turnover,
        })

        # Total offense comparison
        a_total_yds = _get_scalar(team_a_stats, "total_yds", 330)
        b_total_yds = _get_scalar(team_b_stats, "total_yds", 330)

        factors.append({
            "label": f"{team_a_name} Total Offense",
            "value": f"{a_total_yds:.0f} yds/game",
            "favorable": a_total_yds > b_total_yds,
        })
        factors.append({
            "label": f"{team_b_name} Total Offense",
            "value": f"{b_total_yds:.0f} yds/game",
            "favorable": b_total_yds > a_total_yds,
        })

        # Recent form (last 5 games)
        a_recent_diff = _get_scalar(team_a_stats, "recent_point_diff", 0)
        b_recent_diff = _get_scalar(team_b_stats, "recent_point_diff", 0)
        a_recent_wpct = _get_scalar(team_a_stats, "recent_win_pct", 0.5)
        b_recent_wpct = _get_scalar(team_b_stats, "recent_win_pct", 0.5)

        if a_recent_diff != 0 or b_recent_diff != 0:
            a_trend = " (hot)" if a_recent_wpct >= 0.7 else (" (cold)" if a_recent_wpct < 0.4 else "")
            b_trend = " (hot)" if b_recent_wpct >= 0.7 else (" (cold)" if b_recent_wpct < 0.4 else "")

            factors.append({
                "label": f"{team_a_name} Recent Form (L5)",
                "value": f"{a_recent_wpct:.0%} W, {a_recent_diff:+.1f} avg margin{a_trend}",
                "favorable": a_recent_diff > b_recent_diff,
            })
            factors.append({
                "label": f"{team_b_name} Recent Form (L5)",
                "value": f"{b_recent_wpct:.0%} W, {b_recent_diff:+.1f} avg margin{b_trend}",
                "favorable": b_recent_diff > a_recent_diff,
            })

        return factors


# Register for NFL and NCAAF
@ComponentRegistry.register_risk_analyzer(League.NFL)
class NFLRiskAnalyzer(FootballRiskAnalyzer):
    """Risk analyzer for NFL games."""

    def __init__(self, league: League = League.NFL):
        super().__init__(League.NFL)


@ComponentRegistry.register_risk_analyzer(League.NCAAF)
class NCAAFRiskAnalyzer(FootballRiskAnalyzer):
    """Risk analyzer for NCAA Football games."""

    def __init__(self, league: League = League.NCAAF):
        super().__init__(League.NCAAF)
