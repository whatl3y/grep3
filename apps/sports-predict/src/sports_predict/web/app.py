"""Flask web application for sports predictions."""

import logging
import os
import time
from flask import Flask, jsonify, redirect, render_template, request, url_for

from ..core.sport import League, get_sport_config
from ..analysis.matchup import MatchupAnalyzer
from ..data.loader import DataLoader

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

# Supported leagues
LEAGUES = [League.NCAAB, League.NFL, League.NCAAF]
DEFAULT_LEAGUE = League.NCAAB


def create_app():
    """Create and configure the Flask application."""
    app = Flask(__name__, template_folder="templates")

    logger.info("Initializing Sports Predictor web application...")

    # Initialize sport-specific components
    data_loaders = {}
    analyzers = {}
    teams_cache = {}

    for league in LEAGUES:
        logger.info(f"Loading {league.value.upper()} components...")
        try:
            data_loaders[league] = DataLoader(league)
            analyzers[league] = MatchupAnalyzer(league)
            logger.info(f"  {league.value.upper()} initialized")
        except Exception as e:
            logger.warning(f"  Could not initialize {league.value.upper()}: {e}")

    def get_teams_list(league: League):
        """Get sorted list of (team_id, team_name) tuples for a league."""
        if league not in teams_cache:
            if league in data_loaders:
                team_names = data_loaders[league].get_team_names()
                teams_cache[league] = sorted(team_names.items(), key=lambda x: x[1])
                logger.info(f"Loaded {len(teams_cache[league])} {league.value.upper()} teams")
            else:
                teams_cache[league] = []
        return teams_cache[league]

    def get_teams_with_aliases(league: League):
        """Get teams with searchable aliases for API responses."""
        if league in data_loaders:
            return data_loaders[league].get_teams_with_aliases()
        return []

    def get_league_info():
        """Get list of league info for template, sorted alphabetically by label."""
        leagues_info = [
            {"value": league.value, "label": league.value.upper(), "config": get_sport_config(league)}
            for league in LEAGUES
        ]
        return sorted(leagues_info, key=lambda x: x["label"])

    # Pre-load teams for default league on startup
    default_teams = get_teams_list(DEFAULT_LEAGUE)
    logger.info(f"Application initialized with {len(default_teams)} {DEFAULT_LEAGUE.value.upper()} teams available")

    @app.route("/", methods=["GET"])
    def index():
        """Render the main prediction page."""
        sport = request.args.get("sport", DEFAULT_LEAGUE.value)
        try:
            league = League(sport.lower())
        except ValueError:
            league = DEFAULT_LEAGUE

        logger.info(f"GET / - Rendering main page for {league.value.upper()}")
        teams = get_teams_with_aliases(league)
        return render_template(
            "index.html",
            teams=teams,
            leagues=get_league_info(),
            selected_sport=league.value,
            analysis=None,
            error=None,
            selected_away=None,
            selected_home=None,
        )

    @app.route("/api/teams/<sport>")
    def api_teams(sport):
        """Get teams list for a specific sport (API endpoint).

        Returns teams with searchable aliases (acronyms, nicknames, locations).
        """
        try:
            league = League(sport.lower())
        except ValueError:
            return jsonify({"error": f"Invalid sport: {sport}"}), 400

        # Return teams with search_terms for enhanced searching
        teams = get_teams_with_aliases(league)
        return jsonify(teams)

    @app.route("/predict", methods=["GET"])
    def predict_get():
        """Redirect GET requests to /predict back to home page."""
        logger.info("GET /predict - Redirecting to home page")
        return redirect(url_for("index"))

    @app.route("/predict", methods=["POST"])
    def predict():
        """Handle prediction form submission."""
        sport = request.form.get("sport", DEFAULT_LEAGUE.value)
        try:
            league = League(sport.lower())
        except ValueError:
            league = DEFAULT_LEAGUE

        teams = get_teams_with_aliases(league)

        away_team = request.form.get("away_team", "").strip()
        home_team = request.form.get("home_team", "").strip()
        postseason = request.form.get("postseason") == "on"

        game_type = "Postseason" if postseason else "Regular season"
        logger.info(f"POST /predict - {league.value.upper()} {game_type} prediction: {away_team} @ {home_team}")

        # Validation
        if not away_team or not home_team:
            logger.warning("Prediction request missing team selection")
            return render_template(
                "index.html",
                teams=teams,
                leagues=get_league_info(),
                selected_sport=league.value,
                analysis=None,
                error="Please select both teams.",
                selected_away=away_team,
                selected_home=home_team,
            )

        if away_team == home_team:
            logger.warning(f"Prediction request with same team: {away_team}")
            return render_template(
                "index.html",
                teams=teams,
                leagues=get_league_info(),
                selected_sport=league.value,
                analysis=None,
                error="Please select two different teams.",
                selected_away=away_team,
                selected_home=home_team,
            )

        # Run prediction - away team is team_a, home team is team_b
        # Location is "away" for team_a (they are playing away)
        try:
            start_time = time.time()
            logger.info(f"Running {league.value.upper()} prediction: {away_team} @ {home_team}")

            if league not in analyzers:
                raise ValueError(f"No analyzer available for {league.value}")

            analysis = analyzers[league].analyze(
                team_a=away_team,
                team_b=home_team,
                location="away",  # team_a is away, so home field/court advantage goes to team_b
                postseason=postseason,
            )

            elapsed = time.time() - start_time

            if analysis is None:
                logger.error(f"Prediction failed: Could not find teams {away_team} or {home_team}")
                return render_template(
                    "index.html",
                    teams=teams,
                    leagues=get_league_info(),
                    selected_sport=league.value,
                    analysis=None,
                    error="Could not find one or both teams. Please try different selections.",
                    selected_away=away_team,
                    selected_home=home_team,
                )

            # Add sport info to analysis
            analysis["sport"] = league.value
            analysis["sport_label"] = league.value.upper()

            # Log prediction results
            spread = analysis["prediction"]["spread"]
            team_a_name = analysis["team_a"]["name"]
            team_b_name = analysis["team_b"]["name"]
            win_prob_a = analysis["prediction"]["win_prob_a"]

            logger.info(
                f"{league.value.upper()} prediction complete in {elapsed:.2f}s: "
                f"{team_a_name} @ {team_b_name} | "
                f"Spread: {-spread:+.1f} | "
                f"Win prob: {win_prob_a:.0%}"
            )

            return render_template(
                "index.html",
                teams=teams,
                leagues=get_league_info(),
                selected_sport=league.value,
                analysis=analysis,
                error=None,
                selected_away=away_team,
                selected_home=home_team,
            )
        except Exception as e:
            logger.exception(f"Prediction error for {away_team} @ {home_team}: {str(e)}")
            return render_template(
                "index.html",
                teams=teams,
                leagues=get_league_info(),
                selected_sport=league.value,
                analysis=None,
                error=f"Prediction error: {str(e)}",
                selected_away=away_team,
                selected_home=home_team,
            )

    @app.route("/health")
    def health():
        """Health check endpoint."""
        logger.debug("GET /health - Health check")
        return {"status": "healthy"}

    logger.info("Application setup complete")
    return app


def main():
    """Run the Flask development server."""
    port = int(os.environ.get("PORT", 5000))
    debug = os.environ.get("FLASK_DEBUG", "0") == "1"

    logger.info("=" * 50)
    logger.info("Sports Predictor")
    logger.info("=" * 50)
    logger.info("Supported sports: NCAAB, NFL, NCAAF")
    logger.info(f"Starting web server on port {port}")
    logger.info(f"Debug mode: {debug}")
    logger.info(f"Access the application at: http://localhost:{port}")
    logger.info("=" * 50)

    app = create_app()
    app.run(host="0.0.0.0", port=port, debug=debug)


if __name__ == "__main__":
    main()
