import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/api/app.js';

describe('API server', () => {
  const app = createApp();
  const apiKey = 'server-test-api-key';
  const jsonHeaders = { 'content-type': 'application/json', 'x-api-key': apiKey };
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
  const leagueContext = {
    teams: 12,
    starters: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1 },
  };
  const weeklyPlayers = [
    {
      player_id: 'qb-a',
      player_name: 'Test QB',
      team: 'DAL',
      position: 'QB',
      games_sampled: 16,
      pass_attempts_pg: 33,
      pass_yards_per_attempt: 7.4,
      pass_td_rate: 0.06,
      interception_rate: 0.02,
      rush_attempts_pg: 5,
      rush_yards_per_attempt: 5.8,
      rush_td_rate: 0.03,
    },
    {
      player_id: 'wr-b',
      player_name: 'Test WR',
      team: 'MIA',
      position: 'WR',
      games_sampled: 16,
      routes_pg: 33,
      targets_per_route: 0.24,
      catch_rate: 0.67,
      yards_per_target: 8.7,
      receiving_td_rate: 0.061,
    },
  ];


  it('returns a friendly API root index', async () => {
    const response = await app.request('/');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      service: 'point-prediction-model',
      name: 'Point-Prediction-Model (PPM)',
      description:
        'Point-Prediction-Model (PPM): a model-inference API and a read-only studio for inspecting seasonal PPR backtest artifacts and exports.',
      studio: {
        page: '/studio',
        seasonalPprReport: '/api/studio/seasonal-ppr/report',
        seasonalPprPredictions: '/api/studio/seasonal-ppr/predictions',
        seasonalPprModelContext: '/api/studio/seasonal-ppr/export/model-context',
      },
      notice: {
        summary:
          'Currently deployed artifacts are model inference only — read-only, fixture/scaffold-backed, and not approved for 2026 predictive use.',
        artifactStatus: [
          'model inference',
          'read-only',
          'fixture/scaffold-backed',
          'not observed reality',
          'not advice',
          'not approved for 2026 predictive use unless a governed real TIBER-Data artifact has been mounted and verified',
        ],
        docs: 'docs/deployment-inspection.md',
      },
      endpoints: {
        health: '/health',
        scoringWeeklyPlayer: '/api/scoring/weekly/player',
        scoringWeeklyBatch: '/api/scoring/weekly/batch',
        scoringReplacement: '/api/scoring/replacement',
        scoringWeeklyRankings: '/api/scoring/weekly/rankings',
        scoringRos: '/api/scoring/ros',
        tiberWeeklyPlayerCard: '/api/tiber/weekly/player-card',
        tiberWeeklyRankings: '/api/tiber/weekly/rankings',
        tiberRosPlayerCard: '/api/tiber/ros/player-card',
        tiberWeeklyCompare: '/api/tiber/weekly/compare',
        legacyScenarios: '/api/scenarios',
        legacyScenarioProjection: '/api/project/scenarios',
        pointScenarioLabCompat: '/api/point-scenarios/lab',
        studio: '/studio',
        studioSeasonalPprReport: '/api/studio/seasonal-ppr/report',
        studioSeasonalPprPredictions: '/api/studio/seasonal-ppr/predictions',
        studioSeasonalPprModelContext: '/api/studio/seasonal-ppr/export/model-context',
      },
    });
  });

  it('returns health status', async () => {
    const response = await app.request('/health');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      service: 'tiber-fantasy-scoring-engine',
    });
  });


  it('scores weekly players through the scoring API', async () => {
    const response = await app.request('/api/scoring/weekly/batch', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({
        league_context: leagueContext,
        players: [weeklyPlayers[0]],
      }),
    });

    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.data.players[0]).toEqual(
      expect.objectContaining({
        expected_points: expect.any(Number),
        replacement_points: expect.any(Number),
        vorp: expect.any(Number),
      }),
    );
  });

  it('returns mock decision-board data', async () => {
    const response = await app.request('/api/decision-board/mock');
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.source).toBe('sampleDecisionBoardRun');
    expect(payload.rows.length).toBeGreaterThan(0);
    expect(payload.rows[0]).toEqual(
      expect.objectContaining({
        rowId: expect.any(String),
        playerName: expect.any(String),
      }),
    );
  });

  it('returns Tiber weekly player card payloads', async () => {
    const response = await app.request('/api/tiber/weekly/player-card', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({
        league_context: leagueContext,
        players: [weeklyPlayers[0]],
      }),
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.data.card).toEqual(
      expect.objectContaining({
        player_id: 'qb-a',
        scoring_mode: 'weekly',
        view_type: 'player_card',
        scoring_components: expect.objectContaining({
          expected_points: expect.any(Number),
          vorp: expect.any(Number),
        }),
      }),
    );
  });

  it('returns Tiber weekly rankings rows', async () => {
    const response = await app.request('/api/tiber/weekly/rankings', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({
        league_context: leagueContext,
        players: weeklyPlayers,
      }),
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.data.view.view_type).toBe('rankings');
    expect(payload.data.view.rows.length).toBe(2);
    expect(payload.data.view.rows[0]).toEqual(
      expect.objectContaining({
        rank: 1,
        player_id: expect.any(String),
        expected_points: expect.any(Number),
      }),
    );
  });

  it('returns Tiber ROS player card with weekly + ROS values', async () => {
    const response = await app.request('/api/tiber/ros/player-card', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({
        league_context: leagueContext,
        players: [weeklyPlayers[1]],
        remaining_weeks: 8,
      }),
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.data.remaining_weeks).toBe(8);
    expect(payload.data.card).toEqual(
      expect.objectContaining({
        player_id: 'wr-b',
        scoring_mode: 'ros',
        view_type: 'player_card',
        ros_expected_points: expect.any(Number),
        ros_vorp: expect.any(Number),
      }),
    );
  });

  it('returns clear 400s for invalid Tiber route shapes', async () => {
    const response = await app.request('/api/tiber/weekly/player-card', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({
        league_context: leagueContext,
        players: weeklyPlayers,
      }),
    });
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.ok).toBe(false);
    expect(payload.errors[0].code).toBe('BAD_REQUEST');
    expect(payload.errors[0].message).toContain('exactly one player');
  });

  it('returns a stable Tiber weekly comparison surface', async () => {
    const response = await app.request('/api/tiber/weekly/compare', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({
        league_context: leagueContext,
        player_a: weeklyPlayers[0],
        player_b: weeklyPlayers[1],
      }),
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.data.view).toEqual(
      expect.objectContaining({
        scoring_mode: 'weekly',
        view_type: 'compare',
        verdict: expect.stringMatching(/lean_a|lean_b|close/),
        deltas: expect.objectContaining({
          expected_points: expect.any(Number),
          vorp: expect.any(Number),
          floor: expect.any(Number),
          ceiling: expect.any(Number),
        }),
      }),
    );
  });

  it('returns seeded scenario metadata', async () => {
    const response = await app.request('/api/scenarios');
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.count).toBeGreaterThanOrEqual(5);
    expect(payload.scenarios).toContainEqual(
      expect.objectContaining({
        id: 'waddle-to-broncos',
        eventType: expect.any(String),
      }),
    );
  });

  it('projects scenarios through the API without duplicating business logic', async () => {
    const response = await app.request('/api/project/scenarios', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({
        scenarios: [
          {
            metadata: {
              id: 'api-projection-scenario',
              title: 'API projection scenario',
              description: 'Projects one seeded-style scenario through the HTTP layer.',
              tags: ['api', 'test'],
              defaultRun: false,
            },
            player: {
              id: 'api-test-player',
              name: 'API Test Player',
              position: 'WR',
              team: 'ATL',
              sampleSizeGames: 17,
              routesPerGame: 33,
              targetsPerRouteRun: 0.24,
              catchRate: 0.64,
              yardsPerTarget: 8.8,
              tdPerTarget: 0.06,
              rushPointsPerGame: 0.2,
            },
            previousTeamContext: {
              team: 'ATL',
              quarterback: 'Test QB',
              targetCompetitionIndex: 72,
              qbEfficiencyIndex: 101,
              passTdEnvironmentIndex: 102,
              playVolumeIndex: 100,
              passRateIndex: 99,
            },
            newTeamContext: {
              team: 'ATL',
              quarterback: 'Test QB',
              targetCompetitionIndex: 67,
              qbEfficiencyIndex: 102,
              passTdEnvironmentIndex: 102,
              playVolumeIndex: 101,
              passRateIndex: 100,
            },
            event: {
              type: 'TEAMMATE_INJURY',
              description: 'A teammate injury opens additional targets.',
              effectiveWeek: 1,
              severity: 6,
              clarity: 0.8,
            },
          },
        ],
      }),
    });

    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.data.results).toHaveLength(1);
    expect(payload.data.results[0]).toEqual(
      expect.objectContaining({
        scenarioId: 'api-projection-scenario',
      }),
    );
  });
});
