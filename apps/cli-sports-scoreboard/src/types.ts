export type LeagueCode = 'mlb' | 'nfl' | 'nba' | 'nhl' | 'ncaaf' | 'ncaab';

export interface LeagueConfig {
  code: LeagueCode;
  sport: string;
  leagueSlug: string;
  displayName: string;
}

export interface Team {
  id: string;
  abbreviation: string;
  displayName: string;
  shortDisplayName: string;
  logo?: string;
  score?: string;
  winner?: boolean;
  homeAway: 'home' | 'away';
  records?: Array<{ summary: string }>;
}

export interface Competitor {
  id: string;
  homeAway: 'home' | 'away';
  team: {
    id: string;
    abbreviation: string;
    displayName: string;
    shortDisplayName: string;
    logo?: string;
  };
  score?: string;
  winner?: boolean;
  records?: Array<{ summary: string }>;
}

export interface GameStatus {
  clock?: number;
  displayClock?: string;
  period?: number;
  type: {
    id: string;
    name: string;
    state: 'pre' | 'in' | 'post';
    completed: boolean;
    description: string;
    detail: string;
    shortDetail: string;
  };
}

export interface Broadcast {
  market: string;
  names: string[];
}

export interface Competition {
  id: string;
  date: string;
  venue?: {
    fullName: string;
    city?: string;
    state?: string;
  };
  competitors: Competitor[];
  status: GameStatus;
  broadcasts?: Broadcast[];
}

export interface Event {
  id: string;
  uid: string;
  date: string;
  name: string;
  shortName: string;
  competitions: Competition[];
  status: GameStatus;
}

export interface ScoreboardResponse {
  leagues?: Array<{
    id: string;
    name: string;
    abbreviation: string;
  }>;
  events: Event[];
  day?: { date: string };
}

export interface CLIOptions {
  date?: string;
  refresh: number;
  watch: boolean;
}

export interface ScoreboardRow {
  status: string;
  awayTeam: string;
  awayScore: string;
  homeTeam: string;
  homeScore: string;
  detail: string;
}
