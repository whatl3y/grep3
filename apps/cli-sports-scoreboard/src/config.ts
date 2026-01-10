import { LeagueCode, LeagueConfig } from './types';

export const LEAGUES: Record<LeagueCode, LeagueConfig> = {
  mlb: {
    code: 'mlb',
    sport: 'baseball',
    leagueSlug: 'mlb',
    displayName: 'MLB',
  },
  nfl: {
    code: 'nfl',
    sport: 'football',
    leagueSlug: 'nfl',
    displayName: 'NFL',
  },
  nba: {
    code: 'nba',
    sport: 'basketball',
    leagueSlug: 'nba',
    displayName: 'NBA',
  },
  nhl: {
    code: 'nhl',
    sport: 'hockey',
    leagueSlug: 'nhl',
    displayName: 'NHL',
  },
  ncaaf: {
    code: 'ncaaf',
    sport: 'football',
    leagueSlug: 'college-football',
    displayName: 'NCAAF',
  },
  ncaab: {
    code: 'ncaab',
    sport: 'basketball',
    leagueSlug: 'mens-college-basketball',
    displayName: 'NCAAB',
  },
};

export const VALID_LEAGUES = Object.keys(LEAGUES) as LeagueCode[];

export const ESPN_BASE_URL = 'https://site.api.espn.com/apis/site/v2/sports';

export const DEFAULT_REFRESH_SECONDS = 30;
export const MIN_REFRESH_SECONDS = 10;
export const REQUEST_TIMEOUT_MS = 10000;
