import axios from 'axios';
import { LEAGUES, ESPN_BASE_URL, REQUEST_TIMEOUT_MS } from '../config';
import { LeagueCode, ScoreboardResponse } from '../types';

export async function fetchScoreboard(
  league: LeagueCode,
  date?: string
): Promise<ScoreboardResponse> {
  const config = LEAGUES[league];
  const url = `${ESPN_BASE_URL}/${config.sport}/${config.leagueSlug}/scoreboard`;

  const params: Record<string, string> = {};
  if (date) {
    params.dates = date;
  }
  if (config.groups) {
    params.groups = config.groups;
  }

  try {
    const response = await axios.get<ScoreboardResponse>(url, {
      params,
      timeout: REQUEST_TIMEOUT_MS,
    });
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.code === 'ECONNABORTED') {
        throw new Error('Request timed out. ESPN API may be slow or unavailable.');
      }
      if (error.response?.status === 404) {
        throw new Error(`No scoreboard data found for ${league} on ${date || 'today'}`);
      }
      if (error.response?.status && error.response.status >= 500) {
        throw new Error('ESPN API is currently unavailable. Try again later.');
      }
      throw new Error(`ESPN API error: ${error.message}`);
    }
    throw error;
  }
}
