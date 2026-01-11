"""Point spread prediction model."""

from pathlib import Path
from typing import Optional, Any, List

import joblib
import numpy as np
import pandas as pd
from rich.console import Console
from sklearn.ensemble import GradientBoostingRegressor

# Try to import XGBoost, fall back to sklearn if not available
try:
    from xgboost import XGBRegressor
    XGBOOST_AVAILABLE = True
except ImportError:
    XGBOOST_AVAILABLE = False
    XGBRegressor = None  # type: ignore

from ..core.sport import League, get_sport_config
from ..core.registry import ComponentRegistry
from ..features.team_stats import TeamFeatureBuilder
from ..utils.config import get_model_path, MODEL_FILE, HOME_COURT_ADVANTAGE

console = Console()


class SpreadPredictor:
    """
    Predict point spreads for sports games.

    Uses XGBoost if available, falls back to sklearn GradientBoosting.
    Includes quantile regression for uncertainty estimation.
    """

    def __init__(self, league: League = League.NCAAB):
        """Initialize the predictor for a specific league.

        Args:
            league: The league to predict for
        """
        self.league = league
        self.config = get_sport_config(league)
        self.model: Optional[Any] = None
        self.model_lower: Optional[Any] = None  # 10th percentile
        self.model_upper: Optional[Any] = None  # 90th percentile

        # Get feature columns from sport-specific feature builder
        if ComponentRegistry.has_feature_builder(league):
            builder = ComponentRegistry.get_feature_builder(league)
            if hasattr(builder, 'get_feature_columns'):
                self.feature_columns: List[str] = builder.get_feature_columns()
            else:
                self.feature_columns = TeamFeatureBuilder.get_feature_columns()
        else:
            self.feature_columns = TeamFeatureBuilder.get_feature_columns()

        self._is_loaded = False
        self._using_xgboost = XGBOOST_AVAILABLE

    def load(self, model_path: Optional[Path] = None) -> bool:
        """
        Load trained model from disk.

        Args:
            model_path: Path to saved model (defaults to sport-specific path)

        Returns:
            True if loaded successfully
        """
        if model_path is None:
            model_path = get_model_path(self.league)

        if not model_path.exists():
            console.print(f"[yellow]Model not found at {model_path}[/yellow]")
            return False

        try:
            model_data = joblib.load(model_path)
            self.model = model_data["model"]
            self.model_lower = model_data.get("model_lower")
            self.model_upper = model_data.get("model_upper")
            self.feature_columns = model_data.get("feature_columns", self.feature_columns)
            self._is_loaded = True
            return True
        except Exception as e:
            console.print(f"[red]Error loading model: {e}[/red]")
            return False

    def save(self, model_path: Optional[Path] = None):
        """Save trained model to disk."""
        if model_path is None:
            model_path = get_model_path(self.league)

        model_data = {
            "model": self.model,
            "model_lower": self.model_lower,
            "model_upper": self.model_upper,
            "feature_columns": self.feature_columns,
        }
        joblib.dump(model_data, model_path)
        console.print(f"[green]Model saved to {model_path}[/green]")

    @property
    def is_loaded(self) -> bool:
        """Check if model is loaded."""
        return self._is_loaded and self.model is not None

    def predict(
        self,
        features: dict,
        include_intervals: bool = True,
        postseason: bool = False,
    ) -> dict:
        """
        Predict point spread for a matchup.

        Args:
            features: Matchup feature dictionary
            include_intervals: Whether to include prediction intervals
            postseason: Whether this is a postseason/playoff game

        Returns:
            Dict with predictions
        """
        if not self.is_loaded:
            if not self.load():
                return self._fallback_prediction(features, postseason=postseason)

        # Create feature vector
        X = self._prepare_features(features)

        # Main prediction
        spread = float(self.model.predict(X)[0])

        # Postseason adjustment: games tend to be tighter
        # Spreads compress toward zero in high-stakes games
        if postseason:
            # Compress spread toward zero by ~15-20%
            # Teams play more conservatively, closer games
            spread = spread * 0.85

        result = {
            "spread": round(spread, 1),
            "team_a_score": None,  # Will be calculated by analysis module
            "team_b_score": None,
            "postseason": postseason,
        }

        # Add prediction intervals
        if include_intervals and self.model_lower and self.model_upper:
            lower = float(self.model_lower.predict(X)[0])
            upper = float(self.model_upper.predict(X)[0])
            # Also compress intervals for postseason
            if postseason:
                lower = lower * 0.85
                upper = upper * 0.85
            result["spread_lower"] = round(lower, 1)
            result["spread_upper"] = round(upper, 1)
        else:
            # Use sport-specific score variance
            variance = self.config.score_variance_std
            # Postseason games have slightly less variance (more predictable outcomes)
            if postseason:
                variance = variance * 0.9
            result["spread_lower"] = round(spread - variance, 1)
            result["spread_upper"] = round(spread + variance, 1)

        # Calculate win probability using logistic function
        # Scale factor based on sport - higher variance sports have gentler slope
        scale_factor = 4.0 if self.config.score_variance_std <= 12 else 5.0
        win_prob = 1 / (1 + np.exp(-spread / scale_factor))
        result["win_prob_a"] = round(win_prob, 3)
        result["win_prob_b"] = round(1 - win_prob, 3)

        return result

    def _prepare_features(self, features: dict) -> np.ndarray:
        """Convert feature dict to numpy array."""
        X = []
        for col in self.feature_columns:
            val = features.get(col, 0)
            if val is None or (isinstance(val, float) and np.isnan(val)):
                val = 0
            X.append(val)
        return np.array([X])

    def _fallback_prediction(self, features: dict, postseason: bool = False) -> dict:
        """
        Simple fallback prediction when model isn't available.

        Uses a linear combination of key features.
        """
        # Simple prediction based on net rating difference or adjusted net
        net_diff = features.get("net_rating_diff", 0) or features.get("adj_net_delta", 0) or 0
        srs_diff = features.get("srs_diff", 0) or features.get("srs_delta", 0) or 0

        # Approximate: each point of efficiency difference ≈ 0.5 points of spread
        spread = (net_diff * 0.4) + (srs_diff * 0.6)

        # Home field/court advantage (sport-specific)
        home_advantage = self.config.home_advantage_points
        # Reduce home advantage for postseason
        if postseason:
            home_advantage *= 0.6
        if features.get("is_home"):
            spread += home_advantage
        elif features.get("is_away"):
            spread -= home_advantage

        # Compress spread for postseason (tighter games)
        if postseason:
            spread = spread * 0.85

        spread = round(spread, 1)

        # Win probability with sport-specific scaling
        scale_factor = 4.0 if self.config.score_variance_std <= 12 else 5.0
        win_prob = 1 / (1 + np.exp(-spread / scale_factor))

        variance = self.config.score_variance_std
        if postseason:
            variance = variance * 0.9

        return {
            "spread": spread,
            "spread_lower": spread - variance,
            "spread_upper": spread + variance,
            "win_prob_a": round(win_prob, 3),
            "win_prob_b": round(1 - win_prob, 3),
            "team_a_score": None,
            "team_b_score": None,
            "postseason": postseason,
            "_fallback": True,
        }

    def get_feature_importance(self) -> dict:
        """Get feature importance from the model."""
        if not self.is_loaded:
            return {}

        importances = self.model.feature_importances_
        return {
            col: float(imp)
            for col, imp in zip(self.feature_columns, importances)
        }
