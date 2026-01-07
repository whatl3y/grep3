"""Prediction models for NCAA basketball."""

from .spread import SpreadPredictor
from .trainer import ModelTrainer

__all__ = ["SpreadPredictor", "ModelTrainer"]
