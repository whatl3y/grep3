"""Flask web application for NCAA basketball predictions."""

import logging
import os
import time
from flask import Flask, redirect, render_template, request, url_for

from ..analysis.matchup import MatchupAnalyzer
from ..data.loader import DataLoader

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)


def create_app():
    """Create and configure the Flask application."""
    app = Flask(__name__, template_folder="templates")

    logger.info("Initializing NCAA Basketball Predictor web application...")

    # Initialize shared instances
    logger.info("Loading data...")
    data_loader = DataLoader()

    logger.info("Initializing matchup analyzer...")
    analyzer = MatchupAnalyzer()

    # Cache teams list on startup
    logger.info("Loading teams list...")
    _teams_cache = None

    def get_teams_list():
        """Get sorted list of (team_id, team_name) tuples."""
        nonlocal _teams_cache
        if _teams_cache is None:
            team_names = data_loader.get_team_names()
            _teams_cache = sorted(team_names.items(), key=lambda x: x[1])
            logger.info(f"Loaded {len(_teams_cache)} teams")
        return _teams_cache

    # Pre-load teams on startup
    teams = get_teams_list()
    logger.info(f"Application initialized with {len(teams)} teams available")

    @app.route("/", methods=["GET"])
    def index():
        """Render the main prediction page."""
        logger.info("GET / - Rendering main page")
        teams = get_teams_list()
        return render_template(
            "index.html",
            teams=teams,
            analysis=None,
            error=None,
            selected_away=None,
            selected_home=None,
        )

    @app.route("/predict", methods=["GET"])
    def predict_get():
        """Redirect GET requests to /predict back to home page."""
        logger.info("GET /predict - Redirecting to home page")
        return redirect(url_for("index"))

    @app.route("/predict", methods=["POST"])
    def predict():
        """Handle prediction form submission."""
        teams = get_teams_list()

        away_team = request.form.get("away_team", "").strip()
        home_team = request.form.get("home_team", "").strip()

        logger.info(f"POST /predict - Prediction request: {away_team} @ {home_team}")

        # Validation
        if not away_team or not home_team:
            logger.warning("Prediction request missing team selection")
            return render_template(
                "index.html",
                teams=teams,
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
                analysis=None,
                error="Please select two different teams.",
                selected_away=away_team,
                selected_home=home_team,
            )

        # Run prediction - away team is team_a, home team is team_b
        # Location is "away" for team_a (they are playing away)
        try:
            start_time = time.time()
            logger.info(f"Running prediction: {away_team} @ {home_team}")

            analysis = analyzer.analyze(
                team_a=away_team,
                team_b=home_team,
                location="away",  # team_a is away, so home court advantage goes to team_b
            )

            elapsed = time.time() - start_time

            if analysis is None:
                logger.error(f"Prediction failed: Could not find teams {away_team} or {home_team}")
                return render_template(
                    "index.html",
                    teams=teams,
                    analysis=None,
                    error="Could not find one or both teams. Please try different selections.",
                    selected_away=away_team,
                    selected_home=home_team,
                )

            # Log prediction results
            spread = analysis["prediction"]["spread"]
            team_a_name = analysis["team_a"]["name"]
            team_b_name = analysis["team_b"]["name"]
            win_prob_a = analysis["prediction"]["win_prob_a"]

            logger.info(
                f"Prediction complete in {elapsed:.2f}s: "
                f"{team_a_name} @ {team_b_name} | "
                f"Spread: {-spread:+.1f} | "
                f"Win prob: {win_prob_a:.0%}"
            )

            return render_template(
                "index.html",
                teams=teams,
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
    logger.info("NCAA Basketball Predictor")
    logger.info("=" * 50)
    logger.info(f"Starting web server on port {port}")
    logger.info(f"Debug mode: {debug}")
    logger.info(f"Access the application at: http://localhost:{port}")
    logger.info("=" * 50)

    app = create_app()
    app.run(host="0.0.0.0", port=port, debug=debug)


if __name__ == "__main__":
    main()
