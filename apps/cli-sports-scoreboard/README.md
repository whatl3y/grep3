# CLI Sports Scoreboard

A real-time sports scoreboard CLI that displays live scores, final results, and upcoming games directly in your terminal.

## Data Source

This CLI uses the **ESPN Site API**, an unofficial but publicly accessible API that powers ESPN's website and mobile apps.

### API Endpoints

The base URL pattern is:
```
https://site.api.espn.com/apis/site/v2/sports/{sport}/{league}/scoreboard
```

| League | Sport | League Slug | Full Endpoint |
|--------|-------|-------------|---------------|
| MLB | baseball | mlb | `https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard` |
| NFL | football | nfl | `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard` |
| NBA | basketball | nba | `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard` |
| NHL | hockey | nhl | `https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard` |
| NCAAF | football | college-football | `https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard` |
| NCAAB | basketball | mens-college-basketball | `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard` |

### Query Parameters

- `dates=YYYYMMDD` - Filter scores by a specific date (e.g., `?dates=20260110`)
- `week=N` - Specify week number (useful for NFL/college football)
- `seasontype=N` - Season type (1=preseason, 2=regular, 3=postseason)
- `groups=N` - Conference filtering for college sports
- `limit=N` - Limit number of events returned

### API Response Structure

The ESPN API returns JSON with the following key fields:

```json
{
  "leagues": [...],
  "events": [
    {
      "id": "401234567",
      "name": "Team A at Team B",
      "shortName": "TA @ TB",
      "competitions": [
        {
          "competitors": [
            {
              "homeAway": "home",
              "team": { "abbreviation": "TB", "displayName": "Team B" },
              "score": "105"
            },
            {
              "homeAway": "away",
              "team": { "abbreviation": "TA", "displayName": "Team A" },
              "score": "98"
            }
          ],
          "status": {
            "type": {
              "state": "in",
              "description": "In Progress",
              "detail": "3rd Quarter",
              "shortDetail": "3rd - 4:32"
            }
          }
        }
      ]
    }
  ]
}
```

### API Notes

- **No authentication required** - The API is publicly accessible
- **Rate limits** - While undocumented, be respectful with request frequency (10+ second intervals recommended)
- **Unofficial API** - ESPN does not officially support this API; endpoints may change without notice
- **Data freshness** - Scores typically update within seconds of real-time

## Installation

### Prerequisites

- Node.js >= 18.0.0
- pnpm (for monorepo workspace)

### Build

```bash
# From the monorepo root
pnpm install

# Build the CLI
cd apps/cli-sports-scoreboard
pnpm build
```

### Global Installation (Optional)

```bash
cd apps/cli-sports-scoreboard
npm run dev  # Runs build + npm link
```

This makes the `sports` command available globally.

## Usage

### Basic Syntax

```bash
sports scores <league> [options]
```

### Arguments

| Argument | Description | Required |
|----------|-------------|----------|
| `league` | League code to display scores for | Yes |

**Supported Leagues:**
- `mlb` - Major League Baseball
- `nfl` - National Football League
- `nba` - National Basketball Association
- `nhl` - National Hockey League
- `ncaaf` - NCAA Football (FBS)
- `ncaab` - NCAA Men's Basketball

### Options

| Option | Alias | Description | Default |
|--------|-------|-------------|---------|
| `--date <YYYYMMDD>` | `-d` | Show scores for a specific date | Today |
| `--watch` | `-w` | Enable watch mode (continuous refresh) | `false` |
| `--refresh <seconds>` | `-r` | Refresh interval in seconds (min: 10) | `30` |
| `--help` | `-h` | Display help information | - |

### Examples

```bash
# Show today's NBA scores
sports scores nba

# Show NFL scores for January 5, 2026
sports scores nfl --date 20260105
sports scores nfl -d 20260105

# Watch live MLB scores with 30-second refresh (default)
sports scores mlb --watch
sports scores mlb -w

# Watch NCAAB scores with 15-second refresh
sports scores ncaab --watch --refresh 15
sports scores ncaab -w -r 15

# Watch NHL scores with minimum refresh (10 seconds)
sports scores nhl -w -r 10
```

### Output Format

The CLI displays scores in an ASCII table format:

```
NBA Scoreboard - Saturday, January 10, 2026

+------------+--------+-------+--------+-------+--------------------+
| Status     | Away   | Score | Home   | Score | Detail             |
+------------+--------+-------+--------+-------+--------------------+
| Final      | BOS    |   118 | NYK    |   112 | Final              |
| Live       | LAL    |    67 | GSW    |    72 | 3rd - 4:32         |
| 7:30 PM    | MIA    |     - | CHI    |     - | 7:30 PM EST        |
+------------+--------+-------+--------+-------+--------------------+

Last updated: 14:32:15 | Refresh: 30s | Ctrl+C to exit
```

**Status Column Values:**
- `Final` - Game has ended
- `Live` - Game is currently in progress
- `{Time}` - Scheduled game start time

**Detail Column:**
- For completed games: "Final" or "Final/OT"
- For live games: Current period/quarter/inning and time remaining
- For scheduled games: Start time with timezone

## Shell Function Setup

For convenient access, add this function to your shell profile (`~/.zshrc`, `~/.bashrc`, or `~/.zprofile`):

```bash
sports() {
  node ~/nodejs/grep3/apps/cli-sports-scoreboard/dist/index.js scores ${1:-ncaab} -w -r 15
}
```

Usage:
```bash
sports         # Watch NCAAB (default)
sports nba     # Watch NBA
sports nfl     # Watch NFL
```

After adding, reload your shell:
```bash
source ~/.zshrc  # or ~/.bashrc or ~/.zprofile
```

## Project Structure

```
apps/cli-sports-scoreboard/
├── package.json           # Dependencies and scripts
├── tsconfig.json          # TypeScript configuration
├── README.md              # This file
├── src/
│   ├── index.ts           # CLI entry point
│   ├── config.ts          # League configurations and constants
│   ├── types.ts           # TypeScript interfaces
│   ├── api/
│   │   └── espn.ts        # ESPN API client
│   ├── commands/
│   │   ├── index.ts       # Command registration
│   │   └── scores.ts      # Scores command implementation
│   └── ui/
│       ├── table.ts       # ASCII table renderer
│       └── screen.ts      # Terminal screen utilities
└── dist/                  # Compiled JavaScript (after build)
```

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| axios | ^1.4.0 | HTTP client for API requests |
| commander | ^11.0.0 | CLI argument parsing |
| dotenv | ^16.3.1 | Environment variable loading |

## Error Handling

The CLI handles common error scenarios:

**Invalid League:**
```
Invalid league: xyz
Valid leagues: mlb, nfl, nba, nhl, ncaaf, ncaab
```

**Invalid Date Format:**
```
Invalid date format. Use YYYYMMDD (e.g., 20260110)
```

**Network/API Errors:**
- Request timeouts (10 second limit)
- ESPN API unavailability
- In watch mode, errors are logged but polling continues

**No Games:**
```
No games scheduled for this date.

Tip: Try a different date with --date YYYYMMDD
```

## Keyboard Controls

In watch mode (`-w`):
- `Ctrl+C` - Exit cleanly and restore cursor

## API Resources

For more information about the ESPN API:
- [ESPN Hidden API Documentation (Gist)](https://gist.github.com/akeaswaran/b48b02f1c94f873c6655e7129910fc3b)
- [Public ESPN API Reference](https://github.com/pseudo-r/Public-ESPN-API)
- [NFL ESPN Endpoints (Gist)](https://gist.github.com/nntrn/ee26cb2a0716de0947a0a4e9a157bc1c)

## License

MIT
