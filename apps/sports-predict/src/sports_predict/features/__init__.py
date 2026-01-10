"""Feature engineering for sports prediction.

This module contains sport-specific feature builders that are registered
with the ComponentRegistry for automatic discovery.
"""

# Import basketball features (also registers with registry)
from .basketball import (
    EfficiencyCalculator,
    StrengthOfScheduleCalculator,
    BasketballFeatureBuilder,
    TeamFeatureBuilder,  # Backward compatibility alias
)

# Import football features when available (also registers with registry)
try:
    from .football import FootballFeatureBuilder
except ImportError:
    FootballFeatureBuilder = None

__all__ = [
    # Basketball
    "EfficiencyCalculator",
    "StrengthOfScheduleCalculator",
    "BasketballFeatureBuilder",
    "TeamFeatureBuilder",
    # Football
    "FootballFeatureBuilder",
]
