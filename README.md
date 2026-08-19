# Tiber Fantasy Scoring Engine

## Mission
This repository is now a **scoring-first kernel** for in-season fantasy football decisions. The core output is practical player-level scoring with deterministic, typed interfaces built around:
- xFPG / expected fantasy points
- replacement-level baselines
- VORP
- weekly and ROS scoring utilities
- range outputs (`floor`, `median`, `ceiling`)
- stability indicators (`confidence_band`, `volatility_tag`, `fragility_tag`)

## Architecture (scoring-first)
- `src/contracts/` canonical request/output contracts
- `src/core/` scoring constants and shared math helpers
- `src/calculators/xfpg/` position-native xFPG calculators (QB / RB / WR-TE)
- `src/calculators/replacement/` replacement baseline calculators
- `src/calculators/vorp/` VORP calculators
- `src/calculators/range/` floor/median/ceiling and stability profile calculators
- `src/services/scoring/` single-player, batch, rankings, replacement, and ROS services
- `src/api/routes/scoring.ts` service API routes

## Legacy modules
Scenario-first infrastructure is preserved but intentionally demoted from the primary execution identity:
- `src/models/scenarios/`
- `src/models/adjustments/`
- `src/ingestion/`
- `src/io/`
- scenario-oriented services in `src/services/`

See `docs/migration-scoring-kernel.md` and `src/legacy/README.md`.

## Forecast lane (seasonal Fantasy Point Forecast)
The seasonal modeling lane (historically "Point Prediction Model / PPM") is being
reframed as a **Fantasy Point Forecast** lane: it produces uncertain **forecasts**
of future fantasy outcomes from inputs available at a cutoff — **model inference,
not observed reality, and not advice**. The seasonal backtest is the current
baseline ("Run 1"). "PPM" / "PPM Studio" remain valid as legacy/internal
shorthand (Forecast Lab). The GitHub repository is now
`Prometheus-Frameworks/TIBER-Forecast` (the old `point-prediction-model` path
redirects); the npm package name, scripts, code symbols, and artifact fields are
unchanged.

- [Forecast lane naming & framing + backwards-compatibility policy](docs/forecast-lane.md)
- [Run 2 TTS feature contract (what Forecast wants from Teamstate, governance & cutoff gates)](docs/run2-tts-feature-contract.md)
- [Run 1 path audit for Run 2 integration (where the existing Run 1 pipeline builds inputs/targets/splits/eval and where Run 2 attaches)](docs/run1-path-audit-for-run2.md)
- [Run manifest & run-to-run visibility spec](docs/run-manifest-spec.md)

The seasonal runner is available as `npm run backtest:seasonal-ppr` and, as a
backwards-compatible alias, `npm run forecast:seasonal-ppr` (identical command).

## Architecture / governance docs
- [Ownership boundaries and contract map](docs/ownership-boundaries.md)
- [TIBER-Data ingestion readiness report](docs/tiber-data-ingestion-readiness.md)
- [Seasonal PPR backtest (2024 → 2025), model inference only](docs/seasonal-ppr-backtest.md)
- [Seasonal PPR mounted-artifact verification](docs/seasonal-ppr-artifact-verification.md)
- [Deployment & inspection guide (PPM Studio / Forecast Lab)](docs/deployment-inspection.md)
- `docs/migration-scoring-kernel.md`
- `src/legacy/README.md`

## API endpoints (primary)
- `POST /api/scoring/weekly/player`
- `POST /api/scoring/weekly/batch`
- `POST /api/scoring/replacement`
- `POST /api/scoring/weekly/rankings`
- `POST /api/scoring/ros`

Legacy scenario endpoints are still available for compatibility.

### Compatibility / Data Lab surfaces
- `/api/scoring/*` and `/api/tiber/*` remain the **primary** scoring-first surfaces.
- `GET /api/point-scenarios/lab` is a **compatibility / Data Lab route** for TIBER-Fantasy's Point Scenario Lab adapter. It composes the existing legacy scenario projection path and adds no scoring logic; it is not part of the scoring kernel.
- `point_scenario_lab.json` is supported **only as an on-demand export** (`npm run export:point-scenario-lab`), not an auto-promoted artifact.
- See [Point-scenario lab compatibility surface](docs/point-scenario-lab-compatibility.md).

### Replacement baseline behavior
- `FLEX` now contributes to replacement-rank demand for RB/WR/TE via `league_context.flex_allocation` (defaults: RB 35%, WR 50%, TE 15%).
- Single-player scoring supports meaningful VORP via:
  - `comparison_pool` (preferred when available),
  - `replacement_points_override`, or
  - deterministic league-default replacement tables.

## Development
```bash
npm install
npm run build
npm test
npm run dev:api
```

### API authentication
The compute routes (`/api/scoring/*`, `/api/tiber/*`, `/api/project/scenarios`) are gated behind a shared-secret API key:

- Set `FORECAST_API_KEY` in the server environment. When it is unset, the gated routes fail closed with `503`.
- Clients must send the key in the `x-api-key` header.
- Read-only routes (`/`, `/health`, `/studio`, `/api/scenarios`, `/api/decision-board/mock`, `/api/point-scenarios/lab`) remain open.

```bash
FORECAST_API_KEY=local-dev-key npm run dev:api
curl -X POST http://localhost:3000/api/scoring/weekly/batch \
  -H 'content-type: application/json' -H 'x-api-key: local-dev-key' \
  -d '{"players":[...],"league_context":{...}}'
```

## Frontend
`app/web/` is retained as a non-core/legacy companion app and is not the architectural center of this repository.
