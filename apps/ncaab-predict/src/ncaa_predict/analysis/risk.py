"""Risk analysis and uncertainty quantification."""

from typing import Optional

import numpy as np
import pandas as pd


def _get_scalar(series: pd.Series, key: str, default: float) -> float:
    """Safely get a scalar value from a Series, handling Series-in-Series cases."""
    val = series.get(key, default)
    # Handle case where value is itself a Series (from concat/merge issues with duplicate columns)
    if isinstance(val, pd.Series):
        val = val.iloc[0] if len(val) > 0 else default
    # Handle numpy types and ensure numeric
    if pd.isna(val):
        return default
    try:
        return float(val)
    except (TypeError, ValueError):
        return default


class RiskAnalyzer:
    """
    Analyze risk factors and quantify prediction uncertainty.

    Provides context about what could cause the actual result
    to differ from the prediction.
    """

    # Historical standard deviations by game type
    GAME_TYPE_VARIANCE = {
        "rivalry": 12.0,
        "tournament": 10.5,
        "conference": 11.0,
        "non_conference": 11.5,
        "default": 11.0,
    }

    # Thresholds for flagging risk factors
    HIGH_3PT_PCT = 0.36  # Teams shooting above this are volatile
    LOW_3PT_PCT = 0.30   # Teams shooting below this are more consistent
    HIGH_TOV_RATE = 0.18  # High turnover teams are unpredictable
    PACE_DIFF_THRESHOLD = 5  # Large pace difference creates variance

    def analyze_matchup_risk(
        self,
        team_a_stats: pd.Series,
        team_b_stats: pd.Series,
        prediction: dict,
        location: str = "neutral",
    ) -> dict:
        """
        Analyze risk factors for a matchup.

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

        # 1. Three-point shooting volatility
        a_3pt = _get_scalar(team_a_stats, "fg3_pct", 0.33)
        b_3pt = _get_scalar(team_b_stats, "fg3_pct", 0.33)

        if a_3pt > self.HIGH_3PT_PCT and b_3pt > self.HIGH_3PT_PCT:
            risk_factors.append({
                "factor": "High 3-point variance",
                "description": f"Both teams shoot >{self.HIGH_3PT_PCT:.0%} from 3 - outcome sensitive to hot/cold shooting",
                "severity": "high",
            })
            confidence_adjustments.append(1.2)

        elif a_3pt > self.HIGH_3PT_PCT or b_3pt > self.HIGH_3PT_PCT:
            risk_factors.append({
                "factor": "3-point shooter present",
                "description": "One team relies heavily on 3-point shooting",
                "severity": "medium",
            })
            confidence_adjustments.append(1.1)

        # 2. Turnover-prone teams
        a_tov = _get_scalar(team_a_stats, "tov_rate", 0.15)
        b_tov = _get_scalar(team_b_stats, "tov_rate", 0.15)

        if a_tov > self.HIGH_TOV_RATE or b_tov > self.HIGH_TOV_RATE:
            risk_factors.append({
                "factor": "Turnover-prone team",
                "description": "High turnover rate increases game-to-game variance",
                "severity": "medium",
            })
            confidence_adjustments.append(1.1)

        # 3. Pace mismatch
        a_pace = _get_scalar(team_a_stats, "pace", 68)
        b_pace = _get_scalar(team_b_stats, "pace", 68)
        pace_diff = abs(a_pace - b_pace)

        if pace_diff > self.PACE_DIFF_THRESHOLD:
            risk_factors.append({
                "factor": "Pace mismatch",
                "description": f"Large pace difference ({pace_diff:.1f}) - game tempo uncertain",
                "severity": "medium",
            })
            confidence_adjustments.append(1.05)

        # 4. Close matchup (spread near zero)
        spread = prediction.get("spread", 0)
        if abs(spread) < 3:
            risk_factors.append({
                "factor": "Close matchup",
                "description": "Predicted spread is small - essentially a toss-up",
                "severity": "high",
            })
            confidence_adjustments.append(1.15)

        # 5. Strength of schedule disparity
        a_sos = _get_scalar(team_a_stats, "sos", 0)
        b_sos = _get_scalar(team_b_stats, "sos", 0)
        sos_diff = abs(a_sos - b_sos)

        if sos_diff > 5:
            risk_factors.append({
                "factor": "Schedule strength disparity",
                "description": "Teams have played very different levels of competition",
                "severity": "low",
            })
            confidence_adjustments.append(1.05)

        # 6. Home court in conference play
        if location == "home" or location == "away":
            risk_factors.append({
                "factor": "Home court factor",
                "description": f"Home court advantage adds ~3.5 points but varies by venue",
                "severity": "low",
            })

        # Calculate overall confidence
        base_std = self.GAME_TYPE_VARIANCE["default"]
        adjusted_std = base_std * np.prod(confidence_adjustments) if confidence_adjustments else base_std

        # Determine confidence level
        spread_lower = prediction.get("spread_lower", spread - 11)
        spread_upper = prediction.get("spread_upper", spread + 11)
        interval_width = spread_upper - spread_lower

        if interval_width < 18:
            confidence_level = "High"
        elif interval_width < 24:
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
        Calculate expected final score based on spread and pace.

        Args:
            team_a_stats: Stats for team A
            team_b_stats: Stats for team B
            spread: Predicted point spread

        Returns:
            Tuple of (team_a_score, team_b_score)
        """
        # Average points per game for both teams
        a_ppg = _get_scalar(team_a_stats, "pts_per_game", 72)
        b_ppg = _get_scalar(team_b_stats, "pts_per_game", 72)
        a_opp_ppg = _get_scalar(team_a_stats, "opp_pts_per_game", 70)
        b_opp_ppg = _get_scalar(team_b_stats, "opp_pts_per_game", 70)

        # Expected pace (average of both teams' typical games)
        a_pace = _get_scalar(team_a_stats, "pace", 68)
        b_pace = _get_scalar(team_b_stats, "pace", 68)
        expected_pace = (a_pace + b_pace) / 2

        # Average game pace in college basketball
        avg_pace = 68.0

        # Pace factor (how much faster/slower than average)
        pace_factor = expected_pace / avg_pace

        # Estimate what each team would score vs the other
        # Team A's expected offense (their ppg) vs Team B's expected defense (their opp_ppg)
        a_vs_b = (a_ppg + b_opp_ppg) / 2
        b_vs_a = (b_ppg + a_opp_ppg) / 2

        # Apply pace factor and use spread to adjust
        # The total comes from what these teams typically score/allow
        total = (a_vs_b + b_vs_a) * pace_factor

        # Split the total based on the spread
        # If spread is +12 for team A, they score (total + 12) / 2
        team_a_score = (total + spread) / 2
        team_b_score = (total - spread) / 2

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

        # Adjusted efficiency comparison
        a_net = _get_scalar(team_a_stats, "adj_net", 0)
        b_net = _get_scalar(team_b_stats, "adj_net", 0)
        # Rank can be int or N/A, handle separately
        a_rank_val = team_a_stats.get("adj_net_rank")
        if isinstance(a_rank_val, pd.Series):
            a_rank_val = a_rank_val.iloc[0] if len(a_rank_val) > 0 else "N/A"
        a_rank = int(a_rank_val) if pd.notna(a_rank_val) and a_rank_val != "N/A" else "N/A"
        b_rank_val = team_b_stats.get("adj_net_rank")
        if isinstance(b_rank_val, pd.Series):
            b_rank_val = b_rank_val.iloc[0] if len(b_rank_val) > 0 else "N/A"
        b_rank = int(b_rank_val) if pd.notna(b_rank_val) and b_rank_val != "N/A" else "N/A"

        factors.append({
            "label": f"{team_a_name} Adj. Efficiency",
            "value": f"{a_net:+.1f} (#{a_rank})" if a_rank != "N/A" else f"{a_net:+.1f}",
            "favorable": a_net > b_net,
        })

        factors.append({
            "label": f"{team_b_name} Adj. Efficiency",
            "value": f"{b_net:+.1f} (#{b_rank})" if b_rank != "N/A" else f"{b_net:+.1f}",
            "favorable": b_net > a_net,
        })

        # Pace
        a_pace = _get_scalar(team_a_stats, "pace", 68)
        b_pace = _get_scalar(team_b_stats, "pace", 68)
        expected_pace = (a_pace + b_pace) / 2

        factors.append({
            "label": "Expected Pace",
            "value": f"{a_pace:.1f} + {b_pace:.1f} = ~{expected_pace:.0f} possessions",
            "favorable": None,
        })

        # Recent form (last 10 games) - critical for current season predictions
        a_recent_diff = _get_scalar(team_a_stats, "recent_point_diff", 0)
        b_recent_diff = _get_scalar(team_b_stats, "recent_point_diff", 0)
        a_recent_wpct = _get_scalar(team_a_stats, "recent_win_pct", 0.5)
        b_recent_wpct = _get_scalar(team_b_stats, "recent_win_pct", 0.5)

        # Only show if we have meaningful recent form data
        if a_recent_diff != 0 or b_recent_diff != 0:
            a_trend = " (hot)" if a_recent_wpct >= 0.7 else (" (cold)" if a_recent_wpct < 0.4 else "")
            b_trend = " (hot)" if b_recent_wpct >= 0.7 else (" (cold)" if b_recent_wpct < 0.4 else "")

            factors.append({
                "label": f"{team_a_name} Recent Form (L10)",
                "value": f"{a_recent_wpct:.0%} W, {a_recent_diff:+.1f} avg margin{a_trend}",
                "favorable": a_recent_diff > b_recent_diff,
            })

            factors.append({
                "label": f"{team_b_name} Recent Form (L10)",
                "value": f"{b_recent_wpct:.0%} W, {b_recent_diff:+.1f} avg margin{b_trend}",
                "favorable": b_recent_diff > a_recent_diff,
            })

        # Three-point shooting
        a_3pt = _get_scalar(team_a_stats, "fg3_pct", 0.33)
        b_3pt = _get_scalar(team_b_stats, "fg3_pct", 0.33)

        if a_3pt > 0.35 or b_3pt > 0.35:
            better = team_a_name if a_3pt > b_3pt else team_b_name
            better_pct = max(a_3pt, b_3pt)
            factors.append({
                "label": "3-Point Shooting Edge",
                "value": f"{better} ({better_pct:.1%} 3FG%)",
                "favorable": None,
            })

        return factors
