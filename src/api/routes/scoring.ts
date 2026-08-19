import { Hono } from 'hono';
import type { LeagueContextInput, PlayerOpportunityInput, ReplacementPointsOverride, RosScoringRequest, WeeklyScoringRequest } from '../../contracts/scoring.js';
import { generateReplacementBaselinesService } from '../../services/scoring/generateReplacementBaselinesService.js';
import { rankWeeklyScoringService } from '../../services/scoring/rankWeeklyScoringService.js';
import { scoreRosService } from '../../services/scoring/scoreRosService.js';
import { scoreWeeklyBatchService } from '../../services/scoring/scoreWeeklyBatchService.js';
import { scoreWeeklyPlayerService } from '../../services/scoring/scoreWeeklyPlayerService.js';
import {
  validateRosScoringRequest,
  validateWeeklyPlayerScoringRequest,
  validateWeeklyScoringRequest,
} from '../validation/validateScoringRequest.js';

const invalidRequest = (issues: string[]) => ({
  ok: false,
  error: issues[0],
  issues,
});

export const registerScoringRoutes = (app: Hono) => {
  app.post('/api/scoring/weekly/player', async (c) => {
    const body = await c.req.json().catch(() => null);
    const issues = validateWeeklyPlayerScoringRequest(body);

    if (issues.length > 0) {
      return c.json(invalidRequest(issues), 400);
    }

    const request = body as {
      player: PlayerOpportunityInput;
      league_context: LeagueContextInput;
      comparison_pool?: PlayerOpportunityInput[];
      replacement_points_override?: ReplacementPointsOverride;
    };

    const result = scoreWeeklyPlayerService({
      players: [request.player],
      league_context: request.league_context,
      comparison_pool: request.comparison_pool,
      replacement_points_override: request.replacement_points_override,
    });
    return c.json(result, result.ok ? 200 : 400);
  });

  app.post('/api/scoring/weekly/batch', async (c) => {
    const body = await c.req.json().catch(() => null);
    const issues = validateWeeklyScoringRequest(body);

    if (issues.length > 0) {
      return c.json(invalidRequest(issues), 400);
    }

    const result = scoreWeeklyBatchService(body as WeeklyScoringRequest);
    return c.json(result, result.ok ? 200 : 400);
  });

  app.post('/api/scoring/replacement', async (c) => {
    const body = await c.req.json().catch(() => null);
    const issues = validateWeeklyScoringRequest(body);

    if (issues.length > 0) {
      return c.json(invalidRequest(issues), 400);
    }

    const request = body as { players: PlayerOpportunityInput[]; league_context: LeagueContextInput };

    const result = generateReplacementBaselinesService(request.players, request.league_context);
    return c.json(result, result.ok ? 200 : 400);
  });

  app.post('/api/scoring/weekly/rankings', async (c) => {
    const body = await c.req.json().catch(() => null);
    const issues = validateWeeklyScoringRequest(body);

    if (issues.length > 0) {
      return c.json(invalidRequest(issues), 400);
    }

    const result = rankWeeklyScoringService(body as WeeklyScoringRequest);
    return c.json(result, result.ok ? 200 : 400);
  });

  app.post('/api/scoring/ros', async (c) => {
    const body = await c.req.json().catch(() => null);
    const issues = validateRosScoringRequest(body);

    if (issues.length > 0) {
      return c.json(invalidRequest(issues), 400);
    }

    const result = scoreRosService(body as RosScoringRequest);
    return c.json(result, result.ok ? 200 : 400);
  });
};
