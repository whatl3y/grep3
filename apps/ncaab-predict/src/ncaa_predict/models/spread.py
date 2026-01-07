"""Point spread prediction model."""

from pathlib import Path
from typing import Optional, Any

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

from ..features.team_stats import TeamFeatureBuilder
from ..utils.config import MODEL_FILE, HOME_COURT_ADVANTAGE

console = Console()


class SpreadPredictor:
    """
    Predict point spreads for NCAA basketball games.

    Uses XGBoost if available, falls back to sklearn GradientBoosting.
    Includes quantile regression for uncertainty estimation.
    """

    def __init__(self):
        self.model: Optional[Any] = None
        self.model_lower: Optional[Any] = None  # 10th percentile
        self.model_upper: Optional[Any] = None  # 90th percentile
        self.feature_columns = TeamFeatureBuilder.get_feature_columns()
        self._is_loaded = False
        self._using_xgboost = XGBOOST_AVAILABLE

    def load(self, model_path: Path = MODEL_FILE) -> bool:
        """
        Load trained model from disk.

        Args:
            model_path: Path to saved model

        Returns:
            True if loaded successfully
        """
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

    def save(self, model_path: Path = MODEL_FILE):
        """Save trained model to disk."""
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
    ) -> dict:
        """
        Predict point spread for a matchup.

        Args:
            features: Matchup feature dictionary
            include_intervals: Whether to include prediction intervals

        Returns:
            Dict with predictions
        """
        if not self.is_loaded:
            if not self.load():
                return self._fallback_prediction(features)

        # Create feature vector
        X = self._prepare_features(features)

        # Main prediction
        spread = float(self.model.predict(X)[0])

        result = {
            "spread": round(spread, 1),
            "team_a_score": None,  # Will be calculated by analysis module
            "team_b_score": None,
        }

        # Add prediction intervals
        if include_intervals and self.model_lower and self.model_upper:
            lower = float(self.model_lower.predict(X)[0])
            upper = float(self.model_upper.predict(X)[0])
            result["spread_lower"] = round(lower, 1)
            result["spread_upper"] = round(upper, 1)
        else:
            # Use historical standard deviation (~11 points for college basketball)
            result["spread_lower"] = round(spread - 11, 1)
            result["spread_upper"] = round(spread + 11, 1)

        # Calculate win probability using logistic function
        # Spread of 0 = 50%, each point ≈ 3% change
        win_prob = 1 / (1 + np.exp(-spread / 4))
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

    def _fallback_prediction(self, features: dict) -> dict:
        """
        Simple fallback prediction when model isn't available.

        Uses a linear combination of key features.
        """
        # Simple prediction based on net rating difference
        net_diff = features.get("net_rating_diff", 0) or 0
        srs_diff = features.get("srs_diff", 0) or 0

        # Approximate: each point of efficiency difference ≈ 0.5 points of spread
        spread = (net_diff * 0.4) + (srs_diff * 0.6)

        # Home court advantage
        if features.get("is_home"):
            spread += HOME_COURT_ADVANTAGE
        elif features.get("is_away"):
            spread -= HOME_COURT_ADVANTAGE

        spread = round(spread, 1)

        # Win probability
        win_prob = 1 / (1 + np.exp(-spread / 4))

        return {
            "spread": spread,
            "spread_lower": spread - 11,
            "spread_upper": spread + 11,
            "win_prob_a": round(win_prob, 3),
            "win_prob_b": round(1 - win_prob, 3),
            "team_a_score": None,
            "team_b_score": None,
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
