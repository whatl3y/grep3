"""Model training pipeline."""

from datetime import datetime
from typing import Optional

import numpy as np
import pandas as pd
from rich.console import Console
from rich.progress import Progress, SpinnerColumn, TextColumn
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.model_selection import cross_val_score, train_test_split

# Try to import XGBoost, fall back to sklearn if not available
try:
    from xgboost import XGBRegressor
    XGBOOST_AVAILABLE = True
except ImportError:
    XGBOOST_AVAILABLE = False
    XGBRegressor = None  # type: ignore

from ..core.sport import League, SportType, get_sport_config, get_current_season
from ..core.registry import ComponentRegistry
from ..data.loader import DataLoader
from ..features.team_stats import TeamFeatureBuilder
from ..utils.config import get_model_path, MODEL_FILE
from .spread import SpreadPredictor

console = Console()


class ModelTrainer:
    """Train and evaluate spread prediction models."""

    def __init__(self, league: League = League.NCAAB):
        """Initialize the trainer for a specific league.

        Args:
            league: The league to train a model for
        """
        self.league = league
        self.config = get_sport_config(league)
        self.data_loader = DataLoader(league)

        # Get sport-specific feature builder from registry
        if ComponentRegistry.has_feature_builder(league):
            self.feature_builder = ComponentRegistry.get_feature_builder(league)
        else:
            # Fallback to basketball feature builder for NCAAB
            self.feature_builder = TeamFeatureBuilder()

        self.predictor = SpreadPredictor(league)

    def train(
        self,
        test_size: float = 0.2,
        random_state: int = 42,
    ) -> dict:
        """
        Train the spread prediction model.

        Args:
            test_size: Fraction of data for testing
            random_state: Random seed for reproducibility

        Returns:
            Dict with training metrics
        """
        console.print("[bold]Starting model training...[/bold]")

        # Load data
        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            console=console,
        ) as progress:
            task = progress.add_task("Loading data...", total=None)

            team_stats = self.data_loader.load_team_stats()
            games = self.data_loader.load_games()

            if team_stats.empty:
                console.print(f"[red]No team stats data found. Run 'sports-predict update-data --sport {self.league.value}' first.[/red]")
                return {"error": "No data"}

            progress.update(task, description="Building features...")

            # Build team features
            team_features = self.feature_builder.build_team_features(team_stats, games)

            progress.update(task, description="Creating training dataset...")

            # Create training dataset - use sport-specific method if available
            if hasattr(self.feature_builder, 'prepare_training_data'):
                # Football uses prepare_training_data
                training_data = self.feature_builder.prepare_training_data(team_features, games)
            else:
                # Basketball uses create_training_dataset
                training_data = self.feature_builder.create_training_dataset(team_features, games)

            if training_data.empty:
                console.print("[red]No training data created. Check data quality.[/red]")
                return {"error": "No training data"}

            progress.remove_task(task)

        console.print(f"[cyan]Training {self.league.value.upper()} model on {len(training_data)} games[/cyan]")

        # Prepare features and target - use sport-specific columns
        if hasattr(self.feature_builder, 'get_feature_columns'):
            feature_cols = self.feature_builder.get_feature_columns()
        else:
            feature_cols = TeamFeatureBuilder.get_feature_columns()

        # Get target column (football uses 'actual_diff', basketball uses 'target_spread')
        target_col = "actual_diff" if "actual_diff" in training_data.columns else "target_spread"

        # Filter to only include feature columns that exist in training data
        available_cols = [c for c in feature_cols if c in training_data.columns]
        X = training_data[available_cols].fillna(0)
        y = training_data[target_col]

        # Calculate sample weights - heavily weight current season data
        current_season = get_current_season(self.league)
        sample_weights = self._calculate_sample_weights(training_data, current_season)

        # Show weighting distribution - handle different column names
        season_col = "_season" if "_season" in training_data.columns else "season"
        current_games = (training_data[season_col] == current_season).sum()
        prev_season_games = (training_data[season_col] == current_season - 1).sum()
        console.print(f"[cyan]Recency weighting: {current_games} current season games (5x weight), "
                      f"{prev_season_games} last season (2x)[/cyan]")

        # Split data (stratify by season to ensure current season represented in both sets)
        X_train, X_test, y_train, y_test, w_train, w_test = train_test_split(
            X, y, sample_weights, test_size=test_size, random_state=random_state,
            stratify=training_data[season_col]
        )

        console.print(f"Train size: {len(X_train)}, Test size: {len(X_test)}")

        # Train main model (mean prediction)
        console.print("\n[bold]Training main model...[/bold]")

        if XGBOOST_AVAILABLE:
            console.print("[dim]Using XGBoost[/dim]")
            self.predictor.model = XGBRegressor(
                n_estimators=200,
                max_depth=6,
                learning_rate=0.05,
                subsample=0.8,
                colsample_bytree=0.8,
                random_state=random_state,
                n_jobs=-1,
            )
            self.predictor._using_xgboost = True
        else:
            console.print("[dim]Using sklearn GradientBoosting (XGBoost not available)[/dim]")
            self.predictor.model = GradientBoostingRegressor(
                n_estimators=200,
                max_depth=6,
                learning_rate=0.05,
                subsample=0.8,
                random_state=random_state,
            )
            self.predictor._using_xgboost = False

        self.predictor.model.fit(X_train, y_train, sample_weight=w_train)

        # Train quantile models for prediction intervals
        console.print("[bold]Training quantile models for uncertainty...[/bold]")

        if XGBOOST_AVAILABLE:
            # Lower bound (10th percentile)
            self.predictor.model_lower = XGBRegressor(
                n_estimators=150,
                max_depth=5,
                learning_rate=0.05,
                objective="reg:quantileerror",
                quantile_alpha=0.1,
                random_state=random_state,
                n_jobs=-1,
            )
            self.predictor.model_lower.fit(X_train, y_train, sample_weight=w_train)

            # Upper bound (90th percentile)
            self.predictor.model_upper = XGBRegressor(
                n_estimators=150,
                max_depth=5,
                learning_rate=0.05,
                objective="reg:quantileerror",
                quantile_alpha=0.9,
                random_state=random_state,
                n_jobs=-1,
            )
            self.predictor.model_upper.fit(X_train, y_train, sample_weight=w_train)
        else:
            # sklearn GradientBoosting with quantile loss
            self.predictor.model_lower = GradientBoostingRegressor(
                n_estimators=150,
                max_depth=5,
                learning_rate=0.05,
                loss="quantile",
                alpha=0.1,
                random_state=random_state,
            )
            self.predictor.model_lower.fit(X_train, y_train, sample_weight=w_train)

            self.predictor.model_upper = GradientBoostingRegressor(
                n_estimators=150,
                max_depth=5,
                learning_rate=0.05,
                loss="quantile",
                alpha=0.9,
                random_state=random_state,
            )
            self.predictor.model_upper.fit(X_train, y_train, sample_weight=w_train)

        # Evaluate
        console.print("\n[bold]Evaluating model...[/bold]")
        metrics = self._evaluate(X_test, y_test)

        # Cross-validation
        console.print("\n[bold]Running cross-validation...[/bold]")
        cv_scores = cross_val_score(
            self.predictor.model, X, y, cv=5, scoring="neg_mean_absolute_error"
        )
        metrics["cv_mae_mean"] = -cv_scores.mean()
        metrics["cv_mae_std"] = cv_scores.std()

        console.print(f"Cross-validation MAE: {metrics['cv_mae_mean']:.2f} ± {metrics['cv_mae_std']:.2f}")

        # Save model
        self.predictor.feature_columns = available_cols  # Use actual available columns
        self.predictor._is_loaded = True
        model_path = get_model_path(self.league)
        self.predictor.save(model_path)

        # Save processed data for faster loading
        self.data_loader.save_processed_data(team_features, games)

        return metrics

    def _calculate_sample_weights(
        self, training_data: pd.DataFrame, current_season: int
    ) -> np.ndarray:
        """
        Calculate sample weights to heavily emphasize current season games.

        The model should prioritize current season performance while still
        learning from historical patterns. This weighting scheme ensures:
        1. Current season games have the strongest influence on predictions
        2. Recent seasons contribute meaningful signal but don't overshadow current form
        3. Older data provides baseline patterns without dominating

        Weighting scheme:
        - Current season: 5.0x weight (highest priority - current team form)
        - Last season: 2.0x weight (recent but rosters may have changed)
        - 2 seasons ago: 1.0x weight (baseline)
        - 3 seasons ago: 0.6x weight (diminishing relevance)
        - 4+ seasons ago: 0.4x weight (minimal but still useful for patterns)

        Args:
            training_data: DataFrame with training samples
            current_season: The current season year

        Returns:
            Array of sample weights
        """
        # Handle different column names
        season_col = "_season" if "_season" in training_data.columns else "season"
        seasons = training_data[season_col]
        weights = np.ones(len(training_data))

        # Current season gets highest weight - these games reflect current team form
        weights[seasons == current_season] = 5.0

        # Last season still very relevant but rosters change
        weights[seasons == current_season - 1] = 2.0

        # Two seasons ago is baseline (1.0)
        weights[seasons == current_season - 2] = 1.0

        # Three seasons ago has diminishing value
        weights[seasons == current_season - 3] = 0.6

        # Older seasons provide historical patterns but shouldn't dominate
        weights[seasons < current_season - 3] = 0.4

        return weights

    def _evaluate(self, X_test: pd.DataFrame, y_test: pd.Series) -> dict:
        """Evaluate model on test set."""
        y_pred = self.predictor.model.predict(X_test)

        # Mean Absolute Error
        mae = np.mean(np.abs(y_test - y_pred))

        # Root Mean Squared Error
        rmse = np.sqrt(np.mean((y_test - y_pred) ** 2))

        # Directional accuracy (did we predict the right winner?)
        direction_correct = np.mean((y_test > 0) == (y_pred > 0))

        # Spread accuracy (within 3 points)
        within_3 = np.mean(np.abs(y_test - y_pred) <= 3)
        within_7 = np.mean(np.abs(y_test - y_pred) <= 7)

        metrics = {
            "mae": mae,
            "rmse": rmse,
            "direction_accuracy": direction_correct,
            "within_3_points": within_3,
            "within_7_points": within_7,
        }

        console.print(f"\n[green]Test Set Results:[/green]")
        console.print(f"  MAE: {mae:.2f} points")
        console.print(f"  RMSE: {rmse:.2f} points")
        console.print(f"  Direction Accuracy: {direction_correct:.1%}")
        console.print(f"  Within 3 points: {within_3:.1%}")
        console.print(f"  Within 7 points: {within_7:.1%}")

        # Evaluate prediction intervals
        if self.predictor.model_lower and self.predictor.model_upper:
            y_lower = self.predictor.model_lower.predict(X_test)
            y_upper = self.predictor.model_upper.predict(X_test)

            coverage = np.mean((y_test >= y_lower) & (y_test <= y_upper))
            avg_interval_width = np.mean(y_upper - y_lower)

            metrics["interval_coverage"] = coverage
            metrics["interval_width"] = avg_interval_width

            console.print(f"\n[green]Prediction Intervals (80%):[/green]")
            console.print(f"  Coverage: {coverage:.1%}")
            console.print(f"  Average Width: {avg_interval_width:.1f} points")

        return metrics

    def get_feature_importance(self) -> pd.DataFrame:
        """Get feature importance as a DataFrame."""
        if not self.predictor.is_loaded:
            self.predictor.load()

        importance = self.predictor.get_feature_importance()
        if not importance:
            return pd.DataFrame()

        df = pd.DataFrame([
            {"feature": k, "importance": v}
            for k, v in importance.items()
        ])
        return df.sort_values("importance", ascending=False)
