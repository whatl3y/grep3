# NCAA Basketball Prediction Tool

A command-line tool for predicting NCAA basketball game outcomes, including point spreads, expected scores, and statistical risk analysis.

## Features

- **Point Spread Prediction**: Predicts the expected margin of victory
- **Win Probability**: Calculates each team's chance of winning
- **Confidence Intervals**: 80% prediction intervals showing uncertainty range
- **Risk Analysis**: Identifies factors that could affect the outcome
- **Team Rankings**: View teams ranked by adjusted efficiency

## Quick Start

### Using Docker (Recommended)

```bash
# Build the container
docker build -t ncaa-predict .

# First time setup: download data and train model
docker run --rm -v ncaa-data:/app/data ncaa-predict update-data
docker run --rm -v ncaa-data:/app/data ncaa-predict train

# Make predictions
docker run --rm -v ncaa-data:/app/data ncaa-predict Duke "North Carolina"
```

### Using docker-compose

```bash
# First time setup
docker-compose run --rm update-data
docker-compose run --rm train

# Make predictions
docker-compose run --rm predict Duke "North Carolina"

# View rankings
docker-compose run --rm rankings
```

### Local Installation

```bash
# Install the package
pip install -e .

# Download data (takes 10-30 minutes)
ncaa-predict update-data

# Train the model
ncaa-predict train

# Make predictions
ncaa-predict "Duke" "North Carolina"
```

## Commands

### Predict a Matchup

```bash
# Basic prediction (neutral site)
ncaa-predict Duke "North Carolina"

# With location (home = team A is home)
ncaa-predict Duke "North Carolina" --location home
ncaa-predict Duke "North Carolina" -l away
ncaa-predict Duke "North Carolina" -l neutral

# Specific season
ncaa-predict Duke "North Carolina" --season 2024
```

### Update Data

```bash
# Download last 5 seasons (default)
ncaa-predict update-data

# Specify season range
ncaa-predict update-data --start 2020 --end 2025
```

### Train Model

```bash
# Train with default settings
ncaa-predict train

# Custom test set size
ncaa-predict train --test-size 0.3
```

### View Teams and Rankings

```bash
# List all teams
ncaa-predict teams

# Search for a team
ncaa-predict teams Duke
ncaa-predict teams "North"

# View rankings
ncaa-predict rankings
ncaa-predict rankings --limit 50
ncaa-predict rankings --season 2024
```

## Sample Output

```
═══════════════════════════════════════════════════════════════
                    NCAA BASKETBALL PREDICTION
═══════════════════════════════════════════════════════════════

  DUKE BLUE DEVILS  vs  NORTH CAROLINA TAR HEELS
  Location: Neutral Site

───────────────────────────────────────────────────────────────
  PREDICTION
───────────────────────────────────────────────────────────────
  Expected Score:     Duke 78  -  North Carolina 74
  Point Spread:       Duke -4.0
  Win Probability:    Duke 62%  |  North Carolina 38%

───────────────────────────────────────────────────────────────
  CONFIDENCE ANALYSIS
───────────────────────────────────────────────────────────────
  80% Confidence:     Duke -9.5 to Duke +1.5
  Model Confidence:   Medium (±11.0 pts typical variance)

───────────────────────────────────────────────────────────────
  KEY FACTORS
───────────────────────────────────────────────────────────────
  ✓ Duke Adj. Efficiency: +22.4 (#8)
  • North Carolina Adj. Efficiency: +18.1 (#15)
  • Expected Pace: 71.2 + 73.8 = ~72 possessions

───────────────────────────────────────────────────────────────
  RISK FACTORS
───────────────────────────────────────────────────────────────
  • High 3-point variance: Both teams shoot >36% from 3
  • Close matchup: Predicted spread is small
═══════════════════════════════════════════════════════════════
```

## How It Works

### Data Collection
- Scrapes team statistics from Sports-Reference.com
- Collects 5 years of historical game data (~15,000 games)
- Calculates advanced metrics (efficiency ratings, pace, four factors)

### Feature Engineering
Key predictive features (KenPom-inspired):
- **Adjusted Offensive/Defensive Efficiency**: Points per 100 possessions, adjusted for opponent strength
- **Pace**: Possessions per 40 minutes
- **Four Factors**: Effective FG%, turnover rate, offensive rebound rate, free throw rate
- **Strength of Schedule**: Average opponent quality
- **Recent Form**: Last 10 games performance

### Model
- **Algorithm**: XGBoost Gradient Boosting
- **Target**: Point differential (positive = team A wins by X points)
- **Uncertainty**: Quantile regression for prediction intervals
- **Expected MAE**: ~8-9 points

### Risk Analysis
Factors that increase prediction uncertainty:
- High 3-point shooting variance
- Pace mismatches
- Close predicted spreads
- Turnover-prone teams

## Project Structure

```
bet-analytics/
├── src/ncaa_predict/
│   ├── cli.py              # Command-line interface
│   ├── data/
│   │   ├── scraper.py      # Data collection
│   │   └── loader.py       # Data loading/caching
│   ├── features/
│   │   ├── efficiency.py   # Efficiency calculations
│   │   ├── strength.py     # Strength of schedule
│   │   └── team_stats.py   # Feature engineering
│   ├── models/
│   │   ├── spread.py       # Prediction model
│   │   └── trainer.py      # Training pipeline
│   └── analysis/
│       ├── matchup.py      # Matchup analysis
│       └── risk.py         # Risk assessment
├── data/
│   ├── raw/                # Scraped data
│   ├── processed/          # Processed features
│   └── models/             # Trained models
├── Dockerfile
├── docker-compose.yml
└── pyproject.toml
```

## Requirements

- Python 3.10+
- Dependencies: pandas, numpy, scikit-learn, xgboost, requests, beautifulsoup4, typer, rich

## License

MIT
