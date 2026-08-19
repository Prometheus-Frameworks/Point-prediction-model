import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { apiKeyAuth } from './middleware/apiKeyAuth.js';
import { registerDecisionBoardRoutes } from './routes/decisionBoard.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerPointScenarioLabRoutes } from './routes/pointScenarioLab.js';
import { registerProjectScenarioRoutes } from './routes/projectScenarios.js';
import { registerScenarioRoutes } from './routes/scenarios.js';
import { registerScoringRoutes } from './routes/scoring.js';
import { registerStudioRoutes } from './routes/studio.js';
import { registerTiberScoringRoutes } from './routes/tiberScoring.js';

const defaultAllowedOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173'];

// Compute/mutating surfaces gated behind the shared-secret API key (Issue
// #178). Read-only surfaces (/, /health, /studio, /api/scenarios,
// /api/decision-board/mock, /api/point-scenarios/lab) stay open.
const apiKeyGatedRoutes = ['/api/scoring/*', '/api/tiber/*', '/api/project/scenarios'];

const parseAllowedOrigins = () => {
  const configuredOrigins = process.env.CORS_ORIGIN
    ?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return configuredOrigins?.length ? configuredOrigins : defaultAllowedOrigins;
};

export const createApp = () => {
  const app = new Hono();
  const allowedOrigins = parseAllowedOrigins();

  app.use(
    '*',
    cors({
      origin: (origin) => {
        if (!origin) {
          return origin;
        }

        return allowedOrigins.includes(origin) ? origin : null;
      },
    }),
  );

  for (const route of apiKeyGatedRoutes) {
    app.use(route, apiKeyAuth());
  }

  app.get('/', (c) =>
    c.json({
      ok: true,
      service: 'point-prediction-model',
      name: 'Point-Prediction-Model (PPM)',
      description:
        'Point-Prediction-Model (PPM): a model-inference API and a read-only studio for inspecting seasonal PPR backtest artifacts and exports.',
      // Operator entry points for inspecting the deployed PPM Studio artifacts.
      studio: {
        page: '/studio',
        seasonalPprReport: '/api/studio/seasonal-ppr/report',
        seasonalPprPredictions: '/api/studio/seasonal-ppr/predictions',
        seasonalPprModelContext: '/api/studio/seasonal-ppr/export/model-context',
      },
      // Plain-language status of what is currently deployed. See
      // docs/deployment-inspection.md for the full operator guide.
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
      // In-season fantasy scoring kernel endpoints are retained for compatibility.
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
    }),
  );

  registerHealthRoutes(app);
  registerDecisionBoardRoutes(app);
  registerScoringRoutes(app);
  registerTiberScoringRoutes(app);
  registerScenarioRoutes(app);
  registerProjectScenarioRoutes(app);
  registerPointScenarioLabRoutes(app);
  registerStudioRoutes(app);

  app.notFound((c) => c.json({ ok: false, error: 'Not found' }, 404));

  return app;
};
