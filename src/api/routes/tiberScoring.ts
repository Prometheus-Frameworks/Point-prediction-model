import { Hono } from 'hono';
import type { RosScoringRequest, WeeklyScoringRequest } from '../../contracts/scoring.js';
import type { TiberWeeklyCompareRequest } from '../../contracts/tiberScoring.js';
import {
  buildRosPlayerCardService,
  buildWeeklyCompareViewService,
  buildWeeklyPlayerCardService,
  buildWeeklyRankingsViewService,
} from '../../services/scoring/buildTiberViewsService.js';
import type { ServiceResult } from '../../services/result.js';
import {
  validateRosScoringRequest,
  validateWeeklyCompareRequest,
  validateWeeklyScoringRequest,
} from '../validation/validateScoringRequest.js';

const badRequest = (message: string): ServiceResult<never> => ({
  ok: false,
  warnings: [],
  errors: [{ code: 'BAD_REQUEST', message }],
});

const invalidRequest = (issues: string[]): ServiceResult<never> => ({
  ok: false,
  warnings: [],
  errors: issues.map((message) => ({ code: 'BAD_REQUEST', message })),
});

export const registerTiberScoringRoutes = (app: Hono) => {
  app.post('/api/tiber/weekly/player-card', async (c) => {
    const body = await c.req.json().catch(() => null);
    const issues = validateWeeklyScoringRequest(body);

    if (issues.length > 0) {
      return c.json(invalidRequest(issues), 400);
    }

    const request = body as WeeklyScoringRequest;

    if (request.players.length !== 1) {
      return c.json(badRequest('Weekly player card expects exactly one player.'), 400);
    }

    const result = buildWeeklyPlayerCardService(request);
    return c.json(result, result.ok ? 200 : 400);
  });

  app.post('/api/tiber/weekly/rankings', async (c) => {
    const body = await c.req.json().catch(() => null);
    const issues = validateWeeklyScoringRequest(body);

    if (issues.length > 0) {
      return c.json(invalidRequest(issues), 400);
    }

    const request = body as WeeklyScoringRequest;

    if (request.players.length === 0) {
      return c.json(badRequest('Body must include a non-empty players array and league_context.'), 400);
    }

    const result = buildWeeklyRankingsViewService(request);
    return c.json(result, result.ok ? 200 : 400);
  });

  app.post('/api/tiber/ros/player-card', async (c) => {
    const body = await c.req.json().catch(() => null);
    const issues = validateRosScoringRequest(body);

    if (issues.length > 0) {
      return c.json(invalidRequest(issues), 400);
    }

    const request = body as RosScoringRequest;

    if (request.players.length !== 1) {
      return c.json(badRequest('ROS player card expects exactly one player.'), 400);
    }

    const result = buildRosPlayerCardService(request);
    return c.json(result, result.ok ? 200 : 400);
  });

  app.post('/api/tiber/weekly/compare', async (c) => {
    const body = await c.req.json().catch(() => null);
    const issues = validateWeeklyCompareRequest(body);

    if (issues.length > 0) {
      return c.json(invalidRequest(issues), 400);
    }

    const request = body as {
      player_a: TiberWeeklyCompareRequest['player_a'];
      player_b: TiberWeeklyCompareRequest['player_b'];
      league_context: WeeklyScoringRequest['league_context'];
      comparison_pool?: WeeklyScoringRequest['comparison_pool'];
      replacement_points_override?: WeeklyScoringRequest['replacement_points_override'];
    };

    const result = buildWeeklyCompareViewService({
      player_a: request.player_a,
      player_b: request.player_b,
      league_context: request.league_context,
      comparison_pool: request.comparison_pool,
      replacement_points_override: request.replacement_points_override,
    });

    return c.json(result, result.ok ? 200 : 400);
  });
};
