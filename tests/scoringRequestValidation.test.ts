import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/api/app.js';
import {
  validateRosScoringRequest,
  validateWeeklyCompareRequest,
  validateWeeklyPlayerScoringRequest,
  validateWeeklyScoringRequest,
} from '../src/api/validation/validateScoringRequest.js';

const leagueContext = {
  teams: 12,
  starters: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1 },
};

const validPlayer = {
  player_id: 'wr-valid',
  player_name: 'Valid WR',
  team: 'MIA',
  position: 'WR',
  games_sampled: 16,
  routes_pg: 33,
  targets_per_route: 0.24,
  catch_rate: 0.67,
  yards_per_target: 8.7,
  receiving_td_rate: 0.061,
};

describe('validateScoringRequest', () => {
  it('accepts a well-formed weekly request', () => {
    expect(validateWeeklyScoringRequest({ players: [validPlayer], league_context: leagueContext })).toEqual([]);
  });

  it('rejects non-object bodies', () => {
    expect(validateWeeklyScoringRequest(null)).toEqual(['Request body must be a JSON object.']);
    expect(validateWeeklyScoringRequest([validPlayer])).toEqual(['Request body must be a JSON object.']);
  });

  it('rejects missing players and league_context', () => {
    const issues = validateWeeklyScoringRequest({});

    expect(issues).toContain('players is required and must be an array.');
    expect(issues).toContain('league_context is required and must be an object.');
  });

  it('rejects malformed field types instead of passing them through', () => {
    const issues = validateWeeklyScoringRequest({
      players: [{ ...validPlayer, games_sampled: 'sixteen', catch_rate: { nested: true } }],
      league_context: leagueContext,
    });

    expect(issues).toContain('players[0].games_sampled is required and must be a finite number.');
    expect(issues).toContain('players[0].catch_rate is required and must be a finite number.');
  });

  it('rejects out-of-range values', () => {
    const issues = validateWeeklyScoringRequest({
      players: [{ ...validPlayer, catch_rate: 1.4, position: 'K' }],
      league_context: { ...leagueContext, teams: 1 },
    });

    expect(issues).toContain('players[0].catch_rate must be between 0 and 1. Received 1.4.');
    expect(issues).toContain('players[0].position must be one of QB, RB, WR, TE.');
    expect(issues).toContain('league_context.teams must be between 2 and 32. Received 1.');
  });

  it('validates remaining_weeks on ROS requests', () => {
    const issues = validateRosScoringRequest({
      players: [validPlayer],
      league_context: leagueContext,
      remaining_weeks: 0,
    });

    expect(issues).toContain('remaining_weeks must be between 1 and 18. Received 0.');
  });

  it('validates single-player and compare request shapes', () => {
    expect(validateWeeklyPlayerScoringRequest({ player: validPlayer, league_context: leagueContext })).toEqual([]);
    expect(validateWeeklyPlayerScoringRequest({ league_context: leagueContext })).toContain(
      'player is required and must be an object.',
    );
    expect(validateWeeklyCompareRequest({ player_a: validPlayer, league_context: leagueContext })).toContain(
      'player_b is required and must be an object.',
    );
  });

  it('validates the optional comparison pool and replacement override', () => {
    const issues = validateWeeklyScoringRequest({
      players: [validPlayer],
      league_context: leagueContext,
      comparison_pool: [{ ...validPlayer, player_id: '' }],
      replacement_points_override: { QB: -3 },
    });

    expect(issues).toContain('comparison_pool[0].player_id is required and must be a non-empty string.');
    expect(issues).toContain('replacement_points_override.QB must be between 0 and 100. Received -3.');
  });
});

describe('scoring routes reject invalid runtime input', () => {
  const app = createApp();
  const apiKey = 'validation-test-api-key';
  let previousApiKey: string | undefined;

  beforeAll(() => {
    previousApiKey = process.env.FORECAST_API_KEY;
    process.env.FORECAST_API_KEY = apiKey;
  });

  afterAll(() => {
    if (previousApiKey === undefined) {
      delete process.env.FORECAST_API_KEY;
    } else {
      process.env.FORECAST_API_KEY = previousApiKey;
    }
  });

  it('returns 400 with the issue list on the scoring routes', async () => {
    const response = await app.request('/api/scoring/weekly/batch', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({
        players: [{ ...validPlayer, catch_rate: 'high' }],
        league_context: leagueContext,
      }),
    });
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.ok).toBe(false);
    expect(payload.issues).toContain('players[0].catch_rate is required and must be a finite number.');
  });

  it('returns BAD_REQUEST errors on the tiber routes', async () => {
    const response = await app.request('/api/tiber/weekly/rankings', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({
        players: [{ ...validPlayer, games_sampled: 99 }],
        league_context: leagueContext,
      }),
    });
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.ok).toBe(false);
    expect(payload.errors[0].code).toBe('BAD_REQUEST');
    expect(payload.errors[0].message).toContain('games_sampled');
  });
});
