import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/api/app.js';

const apiKey = 'auth-test-api-key';

const leagueContext = {
  teams: 12,
  starters: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1 },
};

const validBatchBody = JSON.stringify({
  league_context: leagueContext,
  players: [
    {
      player_id: 'wr-auth',
      player_name: 'Auth Test WR',
      team: 'MIA',
      position: 'WR',
      games_sampled: 16,
      routes_pg: 33,
      targets_per_route: 0.24,
      catch_rate: 0.67,
      yards_per_target: 8.7,
      receiving_td_rate: 0.061,
    },
  ],
});

describe('API key gate', () => {
  const app = createApp();
  let previousApiKey: string | undefined;

  beforeEach(() => {
    previousApiKey = process.env.FORECAST_API_KEY;
    process.env.FORECAST_API_KEY = apiKey;
  });

  afterEach(() => {
    if (previousApiKey === undefined) {
      delete process.env.FORECAST_API_KEY;
    } else {
      process.env.FORECAST_API_KEY = previousApiKey;
    }
  });

  it('fails closed with 503 on gated routes when no key is configured', async () => {
    delete process.env.FORECAST_API_KEY;

    const response = await app.request('/api/scoring/weekly/batch', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
      body: validBatchBody,
    });
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.ok).toBe(false);
    expect(payload.error).toContain('FORECAST_API_KEY');
  });

  it('rejects gated requests without an API key header', async () => {
    const gatedRoutes = [
      '/api/scoring/weekly/batch',
      '/api/tiber/weekly/rankings',
      '/api/project/scenarios',
    ];

    for (const route of gatedRoutes) {
      const response = await app.request(route, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: validBatchBody,
      });
      const payload = await response.json();

      expect(response.status).toBe(401);
      expect(payload.ok).toBe(false);
      expect(payload.error).toContain('x-api-key');
    }
  });

  it('rejects gated requests with a wrong API key', async () => {
    const response = await app.request('/api/scoring/weekly/batch', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': 'not-the-key' },
      body: validBatchBody,
    });

    expect(response.status).toBe(401);
  });

  it('accepts any key from a comma-separated list, and only those keys', async () => {
    process.env.FORECAST_API_KEY = 'first-key, second-key';

    const requestWithKey = (key: string) =>
      app.request('/api/scoring/weekly/batch', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key },
        body: validBatchBody,
      });

    expect((await requestWithKey('first-key')).status).toBe(200);
    expect((await requestWithKey('second-key')).status).toBe(200);
    expect((await requestWithKey('third-key')).status).toBe(401);
  });

  it('accepts gated requests with the configured API key', async () => {
    const response = await app.request('/api/scoring/weekly/batch', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
      body: validBatchBody,
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
  });

  it('leaves read-only routes open without an API key', async () => {
    delete process.env.FORECAST_API_KEY;

    for (const route of ['/', '/health', '/api/scenarios', '/api/decision-board/mock']) {
      const response = await app.request(route);
      expect(response.status).toBe(200);
    }
  });
});
