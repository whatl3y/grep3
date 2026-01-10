# Sports Prediction Tool

A command-line and web tool for predicting sports game outcomes, including point spreads, expected scores, and statistical risk analysis.

**Supported Sports:**
- NCAA Basketball (NCAAB)
- NFL (Pro Football)
- NCAA Football (NCAAF)

## Features

- **Point Spread Prediction**: Predicts the expected margin of victory
- **Win Probability**: Calculates each team's chance of winning
- **Confidence Intervals**: 80% prediction intervals showing uncertainty range
- **Risk Analysis**: Identifies factors that could affect the outcome
- **Team Rankings**: View teams ranked by adjusted efficiency
- **Web UI**: Browser-based interface with sport selector

## Quick Start

### Using Docker (Recommended)

```bash
# Build the container
docker build -t sports-predict .

# First time setup: download data and train model for each sport
docker run --rm -v sports-data:/app/data sports-predict sports-predict update-data --sport ncaab
docker run --rm -v sports-data:/app/data sports-predict sports-predict train --sport ncaab

docker run --rm -v sports-data:/app/data sports-predict sports-predict update-data --sport nfl
docker run --rm -v sports-data:/app/data sports-predict sports-predict train --sport nfl

# Make predictions
docker run --rm -v sports-data:/app/data sports-predict sports-predict predict Duke "North Carolina" --sport ncaab
docker run --rm -v sports-data:/app/data sports-predict sports-predict predict "Kansas City" Buffalo --sport nfl

# Run the web UI
docker run --rm -p 5000:5000 -v sports-data:/app/data sports-predict
```

### Local Installation

```bash
# Install the package
pip install -e ".[xgboost,web]"

# Download data for desired sports
sports-predict update-data --sport ncaab
sports-predict update-data --sport nfl
sports-predict update-data --sport ncaaf

# Train models
sports-predict train --sport ncaab
sports-predict train --sport nfl

# Make predictions
sports-predict predict Duke "North Carolina" --sport ncaab
sports-predict predict "Kansas City" Buffalo --sport nfl -l home
```

## Commands

### Predict a Matchup

```bash
# NCAA Basketball
sports-predict predict Duke "North Carolina" --sport ncaab
sports-predict predict Kentucky Louisville --sport ncaab -l home

# NFL
sports-predict predict "Kansas City" Buffalo --sport nfl -l home
sports-predict predict "San Francisco" "Dallas" --sport nfl

# NCAA Football
sports-predict predict Alabama Georgia --sport ncaaf
sports-predict predict "Ohio State" Michigan --sport ncaaf -l away
```

### Update Data

```bash
# Download data for a specific sport
sports-predict update-data --sport ncaab
sports-predict update-data --sport nfl
sports-predict update-data --sport ncaaf

# Specify season range
sports-predict update-data --sport nfl --start 2022 --end 2024

# Force refresh (ignore cache)
sports-predict update-data --sport ncaab --force-refresh
```

### Train Model

```bash
# Train for a specific sport
sports-predict train --sport ncaab
sports-predict train --sport nfl
sports-predict train --sport ncaaf

# Custom test set size
sports-predict train --sport ncaab --test-size 0.3
```

### View Teams and Rankings

```bash
# List teams for a sport
sports-predict teams --sport ncaab
sports-predict teams --sport nfl

# Search for a team
sports-predict teams Duke --sport ncaab
sports-predict teams Chiefs --sport nfl

# View rankings
sports-predict rankings --sport ncaab
sports-predict rankings --sport nfl --limit 32
sports-predict rankings --sport ncaaf --season 2024
```

### Run Web Server

```bash
# Using the web module
python -m sports_predict.web.app

# Access at http://localhost:5000
```

## Sample Output

### NCAAB Prediction
```
═══════════════════════════════════════════════════════════════
                    NCAA BASKETBALL PREDICTION
═══════════════════════════════════════════════════════════════

  DUKE  vs  NORTH CAROLINA
  Location: Neutral Site

───────────────────────────────────────────────────────────────
  PREDICTION
───────────────────────────────────────────────────────────────
  Expected Score:     Duke 78  -  North Carolina 74
  Point Spread:       Duke -4.0
  Win Probability:    Duke 62%  |  North Carolina 38%
```

### NFL Prediction
```
═══════════════════════════════════════════════════════════════
                        NFL PREDICTION
═══════════════════════════════════════════════════════════════

  KANSAS CITY CHIEFS  vs  BUFFALO BILLS
  Location: @ Buffalo Bills

───────────────────────────────────────────────────────────────
  PREDICTION
───────────────────────────────────────────────────────────────
  Expected Score:     Kansas City 24  -  Buffalo 27
  Point Spread:       Kansas City +3.0
  Win Probability:    Kansas City 42%  |  Buffalo 58%
```

## How It Works

### Data Collection
- **NCAAB**: Scrapes team statistics from Sports-Reference.com
- **NFL/NCAAF**: Uses ESPN API for team stats and game results
- Collects multiple years of historical game data
- Calculates advanced metrics appropriate for each sport

### Feature Engineering

**Basketball Features (KenPom-inspired):**
- Adjusted Offensive/Defensive Efficiency (points per 100 possessions)
- Pace (possessions per 40 minutes)
- Four Factors: Effective FG%, turnover rate, offensive rebound rate, free throw rate
- Strength of Schedule, Recent Form

**Football Features:**
- Points per game, Points allowed
- Passing/Rushing yards efficiency
- Turnover differential
- Third down conversion rate, Red zone efficiency
- Strength of Schedule, Recent Form

### Model
- **Algorithm**: XGBoost Gradient Boosting (with sklearn fallback)
- **Target**: Point differential (positive = team A wins by X points)
- **Uncertainty**: Quantile regression for prediction intervals
- **Sport-specific models**: Each sport has its own trained model

## Project Structure

```
sports-predict/
├── src/sports_predict/
│   ├── core/
│   │   ├── sport.py          # Sport configuration
│   │   └── registry.py       # Component registry
│   ├── cli.py                # Command-line interface
│   ├── data/
│   │   ├── base_scraper.py   # Abstract base scraper
│   │   ├── sports_ref_scraper.py  # NCAAB scraper
│   │   ├── espn_scraper.py   # NFL/NCAAF scraper
│   │   └── loader.py         # Data loading
│   ├── features/
│   │   ├── basketball/       # Basketball features
│   │   └── football/         # Football features
│   ├── models/
│   │   ├── spread.py         # Prediction model
│   │   └── trainer.py        # Training pipeline
│   ├── analysis/
│   │   ├── matchup.py        # Matchup analysis
│   │   ├── risk.py           # Basketball risk
│   │   └── football_risk.py  # Football risk
│   └── web/
│       ├── app.py            # Flask web server
│       └── templates/        # HTML templates
├── data/
│   ├── ncaab/               # NCAA Basketball data
│   ├── nfl/                 # NFL data
│   ├── ncaaf/               # NCAA Football data
│   └── models/              # Trained models
├── Dockerfile
├── docker-compose.yml
└── pyproject.toml
```

## Requirements

- Python 3.10+
- Core: pandas, numpy, scikit-learn, requests, beautifulsoup4, typer, rich
- Optional: xgboost (better model performance), flask (web UI)

## License

MIT
