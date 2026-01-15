import { Command } from 'commander';
import { fetchScoreboard } from '../api/espn';
import { LEAGUES, VALID_LEAGUES, DEFAULT_REFRESH_SECONDS, MIN_REFRESH_SECONDS, isCollegeLeague } from '../config';
import { LeagueCode, ScoreboardResponse, ScoreboardRow, CLIOptions } from '../types';
import { renderTable, renderNoGames } from '../ui/table';
import { clearScreen, showCursor, hideCursor } from '../ui/screen';

function parseEvents(data: ScoreboardResponse, league: LeagueCode): ScoreboardRow[] {
  const rows: ScoreboardRow[] = [];
  const showRankings = isCollegeLeague(league);

  for (const event of data.events) {
    const competition = event.competitions[0];
    if (!competition) continue;

    const status = competition.status;
    const homeTeam = competition.competitors.find((c) => c.homeAway === 'home');
    const awayTeam = competition.competitors.find((c) => c.homeAway === 'away');

    if (!homeTeam || !awayTeam) continue;

    let statusText: string;
    if (status.type.state === 'pre') {
      statusText = status.type.shortDetail.split(' - ')[0] || 'Scheduled';
    } else if (status.type.state === 'in') {
      statusText = 'Live';
    } else {
      statusText = 'Final';
    }

    const row: ScoreboardRow = {
      status: statusText,
      awayTeam: awayTeam.team.abbreviation,
      awayScore: awayTeam.score ?? '-',
      homeTeam: homeTeam.team.abbreviation,
      homeScore: homeTeam.score ?? '-',
      detail: status.type.shortDetail,
    };

    if (showRankings) {
      const awayRank = awayTeam.curatedRank?.current;
      const homeRank = homeTeam.curatedRank?.current;
      if (awayRank && awayRank <= 25) {
        row.awayRank = awayRank;
      }
      if (homeRank && homeRank <= 25) {
        row.homeRank = homeRank;
      }
    }

    rows.push(row);
  }

  return rows;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function getDateString(dateArg?: string): string {
  if (dateArg) return dateArg;
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

function parseDateArg(dateStr: string): Date {
  const year = parseInt(dateStr.slice(0, 4), 10);
  const month = parseInt(dateStr.slice(4, 6), 10) - 1;
  const day = parseInt(dateStr.slice(6, 8), 10);
  return new Date(year, month, day);
}

async function displayScoreboard(
  league: LeagueCode,
  date: string,
  isWatch: boolean,
  refreshSeconds: number
): Promise<void> {
  const leagueConfig = LEAGUES[league];
  const displayDate = formatDate(parseDateArg(date));

  try {
    const data = await fetchScoreboard(league, date);
    const rows = parseEvents(data, league);

    if (isWatch) {
      clearScreen();
    }

    console.log(`\n${leagueConfig.displayName} Scoreboard - ${displayDate}\n`);

    if (rows.length === 0) {
      console.log(renderNoGames());
    } else {
      console.log(renderTable(rows));
    }

    if (isWatch) {
      console.log(`\nLast updated: ${formatTime(new Date())} | Refresh: ${refreshSeconds}s | Ctrl+C to exit`);
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error(`\nError: ${error.message}`);
    } else {
      console.error('\nAn unexpected error occurred');
    }
    if (!isWatch) {
      process.exit(1);
    }
  }
}

export function createScoresCommand(): Command {
  const command = new Command('scores')
    .description('Display live sports scores for a league')
    .argument('<league>', `League code: ${VALID_LEAGUES.join(', ')}`)
    .option('-d, --date <YYYYMMDD>', 'Date to show scores for (default: today)')
    .option('-w, --watch', 'Watch mode: continuously refresh scores', false)
    .option(
      '-r, --refresh <seconds>',
      `Refresh interval in seconds (min: ${MIN_REFRESH_SECONDS})`,
      String(DEFAULT_REFRESH_SECONDS)
    )
    .action(async (leagueArg: string, options: CLIOptions) => {
      const league = leagueArg.toLowerCase() as LeagueCode;

      if (!VALID_LEAGUES.includes(league)) {
        console.error(`Invalid league: ${leagueArg}`);
        console.error(`Valid leagues: ${VALID_LEAGUES.join(', ')}`);
        process.exit(1);
      }

      const date = getDateString(options.date);
      const refreshSeconds = Math.max(MIN_REFRESH_SECONDS, parseInt(String(options.refresh), 10));
      const isWatch = options.watch;

      if (options.date && !/^\d{8}$/.test(options.date)) {
        console.error('Invalid date format. Use YYYYMMDD (e.g., 20260110)');
        process.exit(1);
      }

      if (isWatch) {
        hideCursor();

        const cleanup = () => {
          showCursor();
          console.log('\n\nGoodbye!');
          process.exit(0);
        };

        process.on('SIGINT', cleanup);
        process.on('SIGTERM', cleanup);

        await displayScoreboard(league, date, isWatch, refreshSeconds);

        setInterval(async () => {
          await displayScoreboard(league, date, isWatch, refreshSeconds);
        }, refreshSeconds * 1000);
      } else {
        await displayScoreboard(league, date, isWatch, refreshSeconds);
      }
    });

  return command;
}
