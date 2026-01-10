"""Core module for sports prediction - configuration and registry."""

from .sport import League, SportType, SportConfig, get_sport_config, get_current_season, SPORT_CONFIGS
from .registry import ComponentRegistry

__all__ = [
    "League",
    "SportType",
    "SportConfig",
    "get_sport_config",
    "get_current_season",
    "SPORT_CONFIGS",
    "ComponentRegistry",
]
