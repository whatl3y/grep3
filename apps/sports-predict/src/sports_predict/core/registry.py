"""Registry pattern for sport-specific components."""

from typing import Any, Callable, Dict, Optional, Type, TypeVar

from .sport import League

T = TypeVar("T")


class ComponentRegistry:
    """Registry for sport-specific components.

    This class provides a central registry for sport-specific implementations
    of scrapers, feature builders, and risk analyzers. Components are registered
    using decorators and retrieved by league.
    """

    _scrapers: Dict[League, Type[Any]] = {}
    _feature_builders: Dict[League, Type[Any]] = {}
    _risk_analyzers: Dict[League, Type[Any]] = {}

    # Instance caches for singletons
    _scraper_instances: Dict[League, Any] = {}
    _feature_builder_instances: Dict[League, Any] = {}
    _risk_analyzer_instances: Dict[League, Any] = {}

    @classmethod
    def register_scraper(cls, league: League) -> Callable[[Type[T]], Type[T]]:
        """Decorator to register a scraper for a league.

        Example:
            @ComponentRegistry.register_scraper(League.NFL)
            class NFLScraper(BaseScraper):
                ...
        """

        def decorator(scraper_class: Type[T]) -> Type[T]:
            cls._scrapers[league] = scraper_class
            return scraper_class

        return decorator

    @classmethod
    def register_feature_builder(cls, league: League) -> Callable[[Type[T]], Type[T]]:
        """Decorator to register a feature builder for a league.

        Example:
            @ComponentRegistry.register_feature_builder(League.NFL)
            class NFLFeatureBuilder:
                ...
        """

        def decorator(builder_class: Type[T]) -> Type[T]:
            cls._feature_builders[league] = builder_class
            return builder_class

        return decorator

    @classmethod
    def register_risk_analyzer(cls, league: League) -> Callable[[Type[T]], Type[T]]:
        """Decorator to register a risk analyzer for a league.

        Example:
            @ComponentRegistry.register_risk_analyzer(League.NFL)
            class NFLRiskAnalyzer:
                ...
        """

        def decorator(analyzer_class: Type[T]) -> Type[T]:
            cls._risk_analyzers[league] = analyzer_class
            return analyzer_class

        return decorator

    @classmethod
    def get_scraper(cls, league: League) -> Any:
        """Get scraper instance for a league.

        Returns a singleton instance of the scraper for the specified league.

        Args:
            league: The league to get the scraper for

        Returns:
            An instance of the registered scraper class

        Raises:
            KeyError: If no scraper is registered for the league
        """
        if league not in cls._scraper_instances:
            if league not in cls._scrapers:
                raise KeyError(f"No scraper registered for {league.value}")
            cls._scraper_instances[league] = cls._scrapers[league](league)
        return cls._scraper_instances[league]

    @classmethod
    def get_feature_builder(cls, league: League) -> Any:
        """Get feature builder instance for a league.

        Returns a singleton instance of the feature builder for the specified league.

        Args:
            league: The league to get the feature builder for

        Returns:
            An instance of the registered feature builder class

        Raises:
            KeyError: If no feature builder is registered for the league
        """
        if league not in cls._feature_builder_instances:
            if league not in cls._feature_builders:
                raise KeyError(f"No feature builder registered for {league.value}")
            cls._feature_builder_instances[league] = cls._feature_builders[league](league)
        return cls._feature_builder_instances[league]

    @classmethod
    def get_risk_analyzer(cls, league: League) -> Any:
        """Get risk analyzer instance for a league.

        Returns a singleton instance of the risk analyzer for the specified league.

        Args:
            league: The league to get the risk analyzer for

        Returns:
            An instance of the registered risk analyzer class

        Raises:
            KeyError: If no risk analyzer is registered for the league
        """
        if league not in cls._risk_analyzer_instances:
            if league not in cls._risk_analyzers:
                raise KeyError(f"No risk analyzer registered for {league.value}")
            cls._risk_analyzer_instances[league] = cls._risk_analyzers[league](league)
        return cls._risk_analyzer_instances[league]

    @classmethod
    def has_scraper(cls, league: League) -> bool:
        """Check if a scraper is registered for a league."""
        return league in cls._scrapers

    @classmethod
    def has_feature_builder(cls, league: League) -> bool:
        """Check if a feature builder is registered for a league."""
        return league in cls._feature_builders

    @classmethod
    def has_risk_analyzer(cls, league: League) -> bool:
        """Check if a risk analyzer is registered for a league."""
        return league in cls._risk_analyzers

    @classmethod
    def clear_instances(cls) -> None:
        """Clear all cached instances. Useful for testing."""
        cls._scraper_instances.clear()
        cls._feature_builder_instances.clear()
        cls._risk_analyzer_instances.clear()

    @classmethod
    def clear_all(cls) -> None:
        """Clear all registrations and instances. Useful for testing."""
        cls._scrapers.clear()
        cls._feature_builders.clear()
        cls._risk_analyzers.clear()
        cls.clear_instances()
