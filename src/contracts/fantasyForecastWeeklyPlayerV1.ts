/**
 * FFI-1 — Fantasy ↔ Forecast weekly-player contract v1 (TIBER-Forecast #182,
 * TIBER-Ops #71).
 *
 * This module is the single semantic source for the first shared seam
 * contract: the weekly player-card request and response exchanged between
 * TIBER-Fantasy and TIBER-Forecast. It defines
 *
 *   - `FantasyForecastWeeklyPlayerRequestV1` — the canonical request body;
 *   - `FantasyForecastWeeklyPlayerCardV1` — the canonical weekly card;
 *   - the response envelope (success / unavailable) around the card;
 *   - the seven golden fixtures required by FFI-1;
 *   - the frozen-artifact manifest with sha256 digests.
 *
 * The frozen JSON artifacts under `data/contracts/fantasyForecastWeeklyPlayerV1/`
 * are generated from this module via
 * `scripts/generateFantasyForecastWeeklyPlayerContractV1.ts` using the
 * repository's canonical serializer, so their bytes are reproducible and
 * hashable. Consumers (TIBER-Fantasy) vendor and verify those frozen bytes by
 * digest; they must not import this module at runtime. Forecast remains the
 * semantic owner.
 *
 * Contract-only scope: nothing in this module is wired into live routes,
 * validators, scoring math, or auth. Where the contract requires fields the
 * current runtime does not yet emit (see `docs/fantasy-forecast-weekly-player-
 * contract-v1.md`), that is recorded FFI-2 conformance debt, not a runtime
 * change here.
 */

import { roundTo } from '../core/scoringSystem.js';
import {
  canonicalForwardJsonBytes,
  forwardArtifactSha256,
} from '../serialization/canonicalForwardArtifacts.js';
import {
  TIBER_GENERIC_FULL_PPR_V1_PROFILE_ID,
  TIBER_GENERIC_FULL_PPR_V1_SHA256,
} from './genericFullPprProfile.js';
import { scoreRosService } from '../services/scoring/scoreRosService.js';
import { scoreWeeklyPlayerService } from '../services/scoring/scoreWeeklyPlayerService.js';
import { toTiberRosPlayerCard, toTiberWeeklyPlayerCard } from '../transforms/tiberScoring.js';
import type { LeagueContextInput, PlayerOpportunityInput, ScoringPosition } from './scoring.js';
import type { TiberWeeklyPlayerCard } from './tiberScoring.js';
import {
  validateJsonSchemaSubset,
  type JsonSchemaSubsetObject,
} from '../validation/validateJsonSchemaSubset.js';

// ---------------------------------------------------------------------------
// Contract identity
// ---------------------------------------------------------------------------

export const FANTASY_FORECAST_WEEKLY_PLAYER_CONTRACT_VERSION = '1.0.0';

export const FANTASY_FORECAST_WEEKLY_PLAYER_REQUEST_CONTRACT = 'fantasy_forecast.weekly_player_request';
export const FANTASY_FORECAST_WEEKLY_PLAYER_CARD_CONTRACT = 'fantasy_forecast.weekly_player_card';
export const FANTASY_FORECAST_WEEKLY_PLAYER_CARD_RESPONSE_CONTRACT =
  'fantasy_forecast.weekly_player_card_response';

/**
 * The only scoring profile the current Forecast scoring kernel implements.
 * Reuses the repository's canonical pinned profile identity
 * (`src/contracts/genericFullPprProfile.ts`) rather than inventing a second
 * scoring-identity vocabulary; declared as a closed constant so a consumer can
 * never silently assume a different scoring format was applied.
 */
export const FANTASY_FORECAST_WEEKLY_PLAYER_SCORING_PROFILE = TIBER_GENERIC_FULL_PPR_V1_PROFILE_ID;

/** Deterministic clock used by every frozen fixture. */
export const FIXTURE_GENERATED_AT = '2026-08-22T00:00:00.000Z';

/** Root of the frozen artifacts, relative to the repository root. */
export const FANTASY_FORECAST_WEEKLY_PLAYER_CONTRACT_V1_DIR =
  'data/contracts/fantasyForecastWeeklyPlayerV1';

// Canonical UTC instant, calendar-shaped: month 01-12, day 01-31, 24h clock,
// optional exactly-three-digit milliseconds (the runtime emits
// `new Date().toISOString()`). The regex is a shape gate for frozen-bytes
// consumers; the reference card validator additionally round-trips the value
// through Date parsing so impossible dates like Feb 30 are rejected too.
const ISO_UTC_TIMESTAMP_PATTERN =
  '^\\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])T([01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(\\.\\d{3})?Z$';

// ---------------------------------------------------------------------------
// TypeScript views of the contract (convenience only — the JSON Schemas below
// are the normative artifact that gets frozen and vendored).
// ---------------------------------------------------------------------------

/**
 * V1 player entry: the runtime `PlayerOpportunityInput` minus per-player
 * `week`/`season` — the request's top-level horizon is the only horizon
 * source, for `players` and `comparison_pool` alike.
 */
export type FantasyForecastWeeklyPlayerOpportunityV1 = Omit<PlayerOpportunityInput, 'week' | 'season'>;

export interface FantasyForecastWeeklyPlayerRequestV1 {
  contract: typeof FANTASY_FORECAST_WEEKLY_PLAYER_REQUEST_CONTRACT;
  contract_version: typeof FANTASY_FORECAST_WEEKLY_PLAYER_CONTRACT_VERSION;
  horizon: 'weekly';
  season: number;
  week: number;
  scoring_profile: typeof FANTASY_FORECAST_WEEKLY_PLAYER_SCORING_PROFILE;
  players: [FantasyForecastWeeklyPlayerOpportunityV1];
  league_context: LeagueContextInput;
  comparison_pool?: FantasyForecastWeeklyPlayerOpportunityV1[];
  replacement_points_override?: Partial<Record<ScoringPosition, number>>;
}

export interface FantasyForecastWeeklyPlayerCardV1 extends TiberWeeklyPlayerCard {
  contract: typeof FANTASY_FORECAST_WEEKLY_PLAYER_CARD_CONTRACT;
  contract_version: typeof FANTASY_FORECAST_WEEKLY_PLAYER_CONTRACT_VERSION;
  season: number;
  week: number;
  scoring_profile: typeof FANTASY_FORECAST_WEEKLY_PLAYER_SCORING_PROFILE;
}

export interface FantasyForecastWeeklyPlayerCardResponseEnvelopeIssue {
  code: string;
  message: string;
  details?: unknown;
}

export type FantasyForecastWeeklyPlayerCardResponseV1 =
  | {
      contract: typeof FANTASY_FORECAST_WEEKLY_PLAYER_CARD_RESPONSE_CONTRACT;
      contract_version: typeof FANTASY_FORECAST_WEEKLY_PLAYER_CONTRACT_VERSION;
      ok: true;
      warnings: FantasyForecastWeeklyPlayerCardResponseEnvelopeIssue[];
      errors: [];
      data: { card: FantasyForecastWeeklyPlayerCardV1 };
    }
  | {
      contract: typeof FANTASY_FORECAST_WEEKLY_PLAYER_CARD_RESPONSE_CONTRACT;
      contract_version: typeof FANTASY_FORECAST_WEEKLY_PLAYER_CONTRACT_VERSION;
      ok: false;
      warnings: FantasyForecastWeeklyPlayerCardResponseEnvelopeIssue[];
      // Non-empty tuple: the normative schema requires minItems 1 on the
      // failure branch, so a type-correct unavailable response can never
      // carry an empty error list.
      errors: [
        FantasyForecastWeeklyPlayerCardResponseEnvelopeIssue,
        ...FantasyForecastWeeklyPlayerCardResponseEnvelopeIssue[],
      ];
    };

// ---------------------------------------------------------------------------
// JSON Schemas (normative). Field bounds mirror the current runtime validator
// in src/api/validation/validateScoringRequest.ts exactly; the schema must not
// be looser or stricter than Forecast's own scoring semantics.
// ---------------------------------------------------------------------------

// Required strings must contain at least one non-whitespace character,
// mirroring the runtime validator's trim-then-check semantics — `" "` is not a
// valid identity value there and must not be valid here.
const requiredString: JsonSchemaSubsetObject = { type: 'string', minLength: 1, pattern: '\\S' };
const rateField: JsonSchemaSubsetObject = { type: 'number', minimum: 0, maximum: 1 };
const volumeField: JsonSchemaSubsetObject = { type: 'number', minimum: 0, maximum: 100 };
const yardageField: JsonSchemaSubsetObject = { type: 'number', minimum: -20, maximum: 60 };
const starterSlots: JsonSchemaSubsetObject = { type: 'integer', minimum: 0, maximum: 10 };
// Request-side override bound — mirrors the runtime validator's 0..100 check.
const replacementOverridePoints: JsonSchemaSubsetObject = { type: 'number', minimum: 0, maximum: 100 };
// Card outputs carry no magnitude bounds: the scoring kernel does not clamp,
// so any request the contract admits must yield a card the contract admits
// (finiteness is enforced by the subset validator's number check). Inventing
// tighter bounds here made contract-valid requests able to produce
// contract-invalid cards (Codex review on PR #183).
const finiteNumber: JsonSchemaSubsetObject = { type: 'number' };

const playerRateFields = [
  'injury_risk',
  'pass_td_rate',
  'interception_rate',
  'rush_td_rate',
  'route_participation',
  'targets_per_route',
  'first_read_target_share',
  'red_zone_target_share',
  'catch_rate',
  'receiving_td_rate',
  'rush_td_opportunity',
  'receiving_role_strength',
  'role_stability',
  'td_dependency',
] as const;

const playerVolumeFields = [
  'pass_attempts_pg',
  'rush_attempts_pg',
  'designed_rush_attempts_pg',
  'scramble_rush_attempts_pg',
  'goal_line_rush_attempts_pg',
  'routes_pg',
  'end_zone_targets_pg',
  'carries_pg',
  'inside_10_carries_pg',
  'targets_pg',
] as const;

const playerYardageFields = [
  'pass_yards_per_attempt',
  'rush_yards_per_attempt',
  'air_yards_per_target',
  'yards_per_target',
  'yards_per_carry',
  'yards_per_reception',
] as const;

const playerOpportunitySchema: JsonSchemaSubsetObject = {
  title: 'PlayerOpportunityInput (weekly, v1)',
  type: 'object',
  additionalProperties: false,
  required: ['player_id', 'player_name', 'team', 'position', 'games_sampled'],
  properties: {
    player_id: requiredString,
    player_name: requiredString,
    team: requiredString,
    position: { type: 'string', enum: ['QB', 'RB', 'WR', 'TE'] },
    games_sampled: { type: 'integer', minimum: 0, maximum: 30 },
    // The request's top-level season/week is the ONLY horizon source. Per-player
    // week/season are rejected outright so a players or comparison_pool entry can
    // never carry a different horizon than the declared request — the comparison
    // pool feeds the replacement baseline once the combined pool reaches eight
    // players, and this exclusion is enforceable from the frozen schema bytes
    // alone (Codex review rounds 1–2 on PR #183).
    week: false,
    season: false,
    ...Object.fromEntries(playerRateFields.map((field) => [field, rateField])),
    ...Object.fromEntries(playerVolumeFields.map((field) => [field, volumeField])),
    ...Object.fromEntries(playerYardageFields.map((field) => [field, yardageField])),
  },
};

const leagueContextSchema: JsonSchemaSubsetObject = {
  title: 'LeagueContextInput (v1)',
  type: 'object',
  additionalProperties: false,
  required: ['teams', 'starters'],
  properties: {
    teams: { type: 'integer', minimum: 2, maximum: 32 },
    starters: {
      type: 'object',
      additionalProperties: false,
      required: ['QB', 'RB', 'WR', 'TE'],
      properties: { QB: starterSlots, RB: starterSlots, WR: starterSlots, TE: starterSlots, FLEX: starterSlots },
    },
    flex_allocation: {
      type: 'object',
      additionalProperties: false,
      properties: { RB: rateField, WR: rateField, TE: rateField },
    },
    replacement_buffer: rateField,
  },
};

export const fantasyForecastWeeklyPlayerRequestV1Schema: JsonSchemaSubsetObject = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: `tiber-forecast:${FANTASY_FORECAST_WEEKLY_PLAYER_REQUEST_CONTRACT}:${FANTASY_FORECAST_WEEKLY_PLAYER_CONTRACT_VERSION}`,
  title: 'FantasyForecastWeeklyPlayerRequestV1',
  description:
    'Canonical weekly player-card scoring request from TIBER-Fantasy to TIBER-Forecast. ' +
    'Unknown fields are REJECTED (fail closed). Optional opportunity fields are OMITTED when ' +
    'unsampled — null is never a valid field value, and 0 always means an observed zero. ' +
    'ROS fields (remaining_weeks) are mechanically excluded from the weekly horizon.',
  type: 'object',
  additionalProperties: false,
  required: [
    'contract',
    'contract_version',
    'horizon',
    'season',
    'week',
    'scoring_profile',
    'players',
    'league_context',
  ],
  properties: {
    contract: { const: FANTASY_FORECAST_WEEKLY_PLAYER_REQUEST_CONTRACT },
    contract_version: { const: FANTASY_FORECAST_WEEKLY_PLAYER_CONTRACT_VERSION },
    horizon: { const: 'weekly' },
    season: { type: 'integer', minimum: 2000, maximum: 2100 },
    week: { type: 'integer', minimum: 1, maximum: 18 },
    scoring_profile: { const: FANTASY_FORECAST_WEEKLY_PLAYER_SCORING_PROFILE },
    players: { type: 'array', minItems: 1, maxItems: 1, items: playerOpportunitySchema },
    league_context: leagueContextSchema,
    comparison_pool: { type: 'array', items: playerOpportunitySchema },
    replacement_points_override: {
      type: 'object',
      additionalProperties: false,
      properties: {
        QB: replacementOverridePoints,
        RB: replacementOverridePoints,
        WR: replacementOverridePoints,
        TE: replacementOverridePoints,
      },
    },
    // Reserved by the ROS contract family; mechanically rejected on the weekly seam.
    remaining_weeks: false,
    scoring_mode: false,
  },
};

export const fantasyForecastWeeklyPlayerCardV1Schema: JsonSchemaSubsetObject = {
  title: 'FantasyForecastWeeklyPlayerCardV1',
  description:
    'Canonical Forecast weekly player card. scoring_mode/horizon is load-bearing: values on ' +
    'this card are single-week expected fantasy points and MUST NOT be consumed as ' +
    'rest-of-season values. The reserved ROS field names are rejected outright; other unknown ' +
    'fields are tolerated for additive minor-version evolution and must be ignored by consumers.',
  type: 'object',
  required: [
    'contract',
    'contract_version',
    'player_id',
    'player_name',
    'team',
    'position',
    'season',
    'week',
    'scoring_profile',
    'expected_points',
    'replacement_points',
    'vorp',
    'floor',
    'median',
    'ceiling',
    'confidence_band',
    'volatility_tag',
    'fragility_tag',
    'weekly_outlook',
    'role_summary',
    'value_summary',
    'role_notes',
    'scoring_components',
    'generated_at',
    'scoring_mode',
    'view_type',
  ],
  properties: {
    contract: { const: FANTASY_FORECAST_WEEKLY_PLAYER_CARD_CONTRACT },
    contract_version: { const: FANTASY_FORECAST_WEEKLY_PLAYER_CONTRACT_VERSION },
    player_id: requiredString,
    player_name: requiredString,
    team: requiredString,
    position: { type: 'string', enum: ['QB', 'RB', 'WR', 'TE'] },
    season: { type: 'integer', minimum: 2000, maximum: 2100 },
    week: { type: 'integer', minimum: 1, maximum: 18 },
    scoring_profile: { const: FANTASY_FORECAST_WEEKLY_PLAYER_SCORING_PROFILE },
    expected_points: finiteNumber,
    replacement_points: finiteNumber,
    vorp: finiteNumber,
    floor: finiteNumber,
    median: finiteNumber,
    ceiling: finiteNumber,
    confidence_band: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'] },
    volatility_tag: { type: 'string', enum: ['STABLE', 'MODERATE', 'VOLATILE'] },
    fragility_tag: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'] },
    weekly_outlook: requiredString,
    role_summary: requiredString,
    value_summary: requiredString,
    role_notes: { type: 'array', items: requiredString },
    scoring_components: {
      type: 'object',
      additionalProperties: false,
      required: ['expected_points', 'replacement_points', 'vorp', 'floor', 'median', 'ceiling'],
      properties: {
        expected_points: finiteNumber,
        replacement_points: finiteNumber,
        vorp: finiteNumber,
        floor: finiteNumber,
        median: finiteNumber,
        ceiling: finiteNumber,
      },
    },
    generated_at: { type: 'string', pattern: ISO_UTC_TIMESTAMP_PATTERN },
    scoring_mode: { const: 'weekly' },
    view_type: { const: 'player_card' },
    // Reserved ROS namespace: a numeric points field alone must never be enough
    // for a consumer to treat this card as a rest-of-season projection, so the
    // ROS field names are rejected on the weekly card outright.
    ros_expected_points: false,
    ros_vorp: false,
    ros_summary: false,
    remaining_weeks: false,
  },
};

const envelopeIssueSchema: JsonSchemaSubsetObject = {
  type: 'object',
  additionalProperties: false,
  required: ['code', 'message'],
  properties: { code: requiredString, message: requiredString, details: true },
};

export const fantasyForecastWeeklyPlayerCardResponseV1Schema: JsonSchemaSubsetObject = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: `tiber-forecast:${FANTASY_FORECAST_WEEKLY_PLAYER_CARD_RESPONSE_CONTRACT}:${FANTASY_FORECAST_WEEKLY_PLAYER_CONTRACT_VERSION}`,
  title: 'FantasyForecastWeeklyPlayerCardResponseV1',
  description:
    'Response envelope for the weekly player card. Exactly one branch applies: a success ' +
    'envelope carrying one card, or a failure envelope (unavailable/stale/rejected) carrying ' +
    'machine-readable errors and NO card. Unavailability is always an explicit failure state — ' +
    'never a card with zeroed or nulled values — so zero, null, omitted, unavailable, and ' +
    'malformed remain mechanically distinguishable.',
  oneOf: [
    {
      title: 'WeeklyPlayerCardSuccess',
      type: 'object',
      additionalProperties: false,
      required: ['contract', 'contract_version', 'ok', 'data', 'warnings', 'errors'],
      properties: {
        contract: { const: FANTASY_FORECAST_WEEKLY_PLAYER_CARD_RESPONSE_CONTRACT },
        contract_version: { const: FANTASY_FORECAST_WEEKLY_PLAYER_CONTRACT_VERSION },
        ok: { const: true },
        warnings: { type: 'array', items: envelopeIssueSchema },
        errors: { type: 'array', maxItems: 0 },
        data: {
          type: 'object',
          additionalProperties: false,
          required: ['card'],
          properties: { card: fantasyForecastWeeklyPlayerCardV1Schema },
        },
      },
    },
    {
      title: 'WeeklyPlayerCardUnavailable',
      type: 'object',
      additionalProperties: false,
      required: ['contract', 'contract_version', 'ok', 'warnings', 'errors'],
      properties: {
        contract: { const: FANTASY_FORECAST_WEEKLY_PLAYER_CARD_RESPONSE_CONTRACT },
        contract_version: { const: FANTASY_FORECAST_WEEKLY_PLAYER_CONTRACT_VERSION },
        ok: { const: false },
        warnings: { type: 'array', items: envelopeIssueSchema },
        errors: { type: 'array', minItems: 1, items: envelopeIssueSchema },
        data: false,
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// Cross-field invariants the schema subset cannot express.
// ---------------------------------------------------------------------------

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const CARD_COMPONENT_FIELDS = ['expected_points', 'replacement_points', 'vorp', 'floor', 'median', 'ceiling'] as const;

/**
 * Range bracket, component mirror, VORP identity (2-decimal rounding), and
 * real-instant `generated_at`.
 *
 * Range semantics mirror the CURRENT engine: for non-negative projections
 * `calculateRangeProfile` always yields `floor <= median <= ceiling`; for a
 * negative projection its multiplicative downside/upside factors invert the
 * bracket ends (e.g. expected −100 → floor −64.49, ceiling −137.16), so the
 * invariant there is that the median lies within the floor/ceiling bracket.
 * FFI-1 records this degenerate-corner behavior instead of changing scoring
 * math; renaming/reordering the negative bracket is an FFI-2+ question
 * (Codex review round 2 on PR #183).
 */
export const checkFantasyForecastWeeklyPlayerCardV1Invariants = (card: unknown): string[] => {
  const issues: string[] = [];
  if (!isRecord(card)) return ['card must be an object'];

  const { floor, median, ceiling, expected_points, replacement_points, vorp } = card as Record<string, number>;

  if ([median, expected_points].every((value) => typeof value === 'number')) {
    // calculateRangeProfile always computes median as the two-decimal-rounded
    // expected points, so a card whose median drifts from its own expected
    // points is corrupted even when it stays inside the floor/ceiling bracket.
    if (Math.abs(median - roundTo(expected_points)) > 1e-9) {
      issues.push(
        `median must equal expected_points under the engine's 2-decimal rounding. Received median ${median} vs expected_points ${expected_points}.`,
      );
    }
  }

  if ([floor, median, ceiling, expected_points].every((value) => typeof value === 'number')) {
    if (expected_points >= 0) {
      if (!(floor <= median && median <= ceiling)) {
        issues.push(
          `floor <= median <= ceiling must hold for non-negative projections. Received ${floor} / ${median} / ${ceiling}.`,
        );
      }
    } else if (!(Math.min(floor, ceiling) <= median && median <= Math.max(floor, ceiling))) {
      issues.push(
        `median must lie within the floor/ceiling bracket. Received floor ${floor}, median ${median}, ceiling ${ceiling}.`,
      );
    }
  }

  const generatedAt = card.generated_at;
  if (typeof generatedAt === 'string') {
    const parsedMs = Date.parse(generatedAt);
    const normalizedInput = generatedAt.includes('.') ? generatedAt : generatedAt.replace('Z', '.000Z');
    if (!Number.isFinite(parsedMs) || new Date(parsedMs).toISOString() !== normalizedInput) {
      issues.push(
        `generated_at must be a real canonical UTC instant (impossible calendar dates are rejected). Received ${JSON.stringify(generatedAt)}.`,
      );
    }
  }

  if ([expected_points, replacement_points, vorp].every((value) => typeof value === 'number')) {
    // calculateVorp guarantees vorp === roundTo(expected_points -
    // replacement_points), so compare against that exact rounded result
    // (floating-point epsilon only) — a looser cent-scale tolerance would
    // accept a consistently corrupted vorp/component pair.
    if (Math.abs(vorp - roundTo(expected_points - replacement_points)) > 1e-9) {
      issues.push(
        `vorp must equal roundTo(expected_points - replacement_points, 2). ` +
          `Received ${vorp} vs ${expected_points} - ${replacement_points}.`,
      );
    }
  }

  const components = card.scoring_components;
  if (isRecord(components)) {
    for (const field of CARD_COMPONENT_FIELDS) {
      if (components[field] !== card[field]) {
        issues.push(
          `scoring_components.${field} (${String(components[field])}) must mirror card ${field} (${String(card[field])}).`,
        );
      }
    }
  }

  return issues;
};

// ---------------------------------------------------------------------------
// Combined reference validators — the documented validation path for
// TypeScript consumers. Frozen-bytes consumers get the same request-side
// guarantees from the schema alone (every request rule, including the
// horizon-exclusion of per-player week/season, is schema-mechanical); the
// response validator layers the cross-field card invariants, which the schema
// subset cannot express, on top of the schema check.
// ---------------------------------------------------------------------------

export const validateFantasyForecastWeeklyPlayerRequestV1 = (request: unknown): string[] =>
  validateJsonSchemaSubset(request, fantasyForecastWeeklyPlayerRequestV1Schema);

export const validateFantasyForecastWeeklyPlayerCardResponseV1 = (response: unknown): string[] => {
  const issues = validateJsonSchemaSubset(response, fantasyForecastWeeklyPlayerCardResponseV1Schema);
  if (isRecord(response) && response.ok === true && isRecord(response.data) && isRecord(response.data.card)) {
    issues.push(...checkFantasyForecastWeeklyPlayerCardV1Invariants(response.data.card));
  }
  return issues;
};

/** Card fields the engine copies verbatim from the request's single player. */
const EXCHANGE_IDENTITY_FIELDS = ['player_id', 'player_name', 'team', 'position'] as const;

/**
 * Exchange-level validation: a response is only a valid answer TO A REQUEST
 * when, beyond both documents being individually valid, the success card
 * echoes the request's player identity and horizon. Without this, a correctly
 * shaped but unrelated forecast (another player, another week) would pass the
 * documented validators and could be displayed against the wrong player
 * (Codex review round 5 on PR #183).
 */
export const validateFantasyForecastWeeklyPlayerExchangeV1 = (request: unknown, response: unknown): string[] => {
  const issues = [
    ...validateFantasyForecastWeeklyPlayerRequestV1(request).map((issue) => `request: ${issue}`),
    ...validateFantasyForecastWeeklyPlayerCardResponseV1(response).map((issue) => `response: ${issue}`),
  ];

  if (
    isRecord(request) &&
    isRecord(response) &&
    response.ok === true &&
    isRecord(response.data) &&
    isRecord(response.data.card)
  ) {
    const card = response.data.card;
    const player = Array.isArray(request.players) && isRecord(request.players[0]) ? request.players[0] : undefined;

    if (player) {
      for (const field of EXCHANGE_IDENTITY_FIELDS) {
        if (card[field] !== player[field]) {
          issues.push(
            `exchange: card ${field} (${JSON.stringify(card[field])}) must echo the requested player ${field} (${JSON.stringify(player[field])}).`,
          );
        }
      }
    }

    for (const field of ['season', 'week'] as const) {
      if (card[field] !== request[field]) {
        issues.push(
          `exchange: card ${field} (${JSON.stringify(card[field])}) must echo the request ${field} (${JSON.stringify(request[field])}).`,
        );
      }
    }
  }

  return issues;
};

// ---------------------------------------------------------------------------
// Golden fixtures. The valid request is the source of the valid response card:
// the card fixture is produced by the actual scoring services and transforms,
// never hand-written, so there is exactly one semantic source of truth.
// ---------------------------------------------------------------------------

export const FIXTURE_SEASON = 2026;
export const FIXTURE_WEEK = 1;

const fixturePlayer: FantasyForecastWeeklyPlayerOpportunityV1 = {
  player_id: 'TIBER-FIXTURE-WR-0001',
  player_name: 'Fixture Wideout',
  team: 'TST',
  position: 'WR',
  games_sampled: 16,
  routes_pg: 34,
  route_participation: 0.86,
  targets_per_route: 0.24,
  targets_pg: 8.2,
  catch_rate: 0.66,
  yards_per_target: 8.4,
  air_yards_per_target: 9.1,
  red_zone_target_share: 0.21,
  end_zone_targets_pg: 0.8,
  receiving_td_rate: 0.05,
  // Explicit observed zero — deliberately distinct from the omitted optional
  // fields below it (e.g. td_dependency), which mean "not sampled".
  goal_line_rush_attempts_pg: 0,
  role_stability: 0.74,
};

const fixtureLeagueContext: LeagueContextInput = {
  teams: 12,
  starters: { QB: 1, RB: 2, WR: 3, TE: 1, FLEX: 1 },
  flex_allocation: { RB: 0.35, WR: 0.45, TE: 0.2 },
  replacement_buffer: 0.1,
};

export const buildValidWeeklyPlayerRequestFixture = (): FantasyForecastWeeklyPlayerRequestV1 => ({
  contract: FANTASY_FORECAST_WEEKLY_PLAYER_REQUEST_CONTRACT,
  contract_version: FANTASY_FORECAST_WEEKLY_PLAYER_CONTRACT_VERSION,
  horizon: 'weekly',
  season: FIXTURE_SEASON,
  week: FIXTURE_WEEK,
  scoring_profile: FANTASY_FORECAST_WEEKLY_PLAYER_SCORING_PROFILE,
  players: [{ ...fixturePlayer }],
  league_context: {
    ...fixtureLeagueContext,
    starters: { ...fixtureLeagueContext.starters },
    flex_allocation: { ...fixtureLeagueContext.flex_allocation },
  },
});

/**
 * The league_context TIBER-Fantasy actually sends today
 * (`toUpstreamLeagueContext()` at Fantasy 9e5f2b41): season/week/format/count,
 * but none of the replacement context Forecast requires. Frozen as the
 * canonical "missing required league context" rejection case.
 */
export const buildMissingLeagueContextRequestFixture = (): Record<string, unknown> => ({
  players: [{ ...fixturePlayer }],
  league_context: {
    season: FIXTURE_SEASON,
    week: FIXTURE_WEEK,
    scoring_format: 'ppr',
    num_teams: 12,
  },
});

/** Null identity fields, an unsupported position, and a null sample count. */
export const buildNullPlayerIdentityRequestFixture = (): Record<string, unknown> => ({
  contract: FANTASY_FORECAST_WEEKLY_PLAYER_REQUEST_CONTRACT,
  contract_version: FANTASY_FORECAST_WEEKLY_PLAYER_CONTRACT_VERSION,
  horizon: 'weekly',
  season: FIXTURE_SEASON,
  week: FIXTURE_WEEK,
  scoring_profile: FANTASY_FORECAST_WEEKLY_PLAYER_SCORING_PROFILE,
  players: [
    {
      player_id: '',
      player_name: null,
      team: null,
      position: 'K',
      games_sampled: null,
    },
  ],
  league_context: { teams: 12, starters: { QB: 1, RB: 2, WR: 3, TE: 1 } },
});

const scoreFixturePlayerWeekly = (): TiberWeeklyPlayerCard => {
  const request = buildValidWeeklyPlayerRequestFixture();
  const result = scoreWeeklyPlayerService({
    players: request.players,
    league_context: request.league_context,
  });
  if (!result.ok) {
    throw new Error(
      `Fixture scoring failed; the golden fixture request no longer scores: ${result.errors
        .map((error) => error.message)
        .join(' ')}`,
    );
  }
  return toTiberWeeklyPlayerCard(result.data.player, FIXTURE_GENERATED_AT);
};

export const buildValidWeeklyPlayerCardFixture = (): FantasyForecastWeeklyPlayerCardV1 => ({
  ...scoreFixturePlayerWeekly(),
  contract: FANTASY_FORECAST_WEEKLY_PLAYER_CARD_CONTRACT,
  contract_version: FANTASY_FORECAST_WEEKLY_PLAYER_CONTRACT_VERSION,
  season: FIXTURE_SEASON,
  week: FIXTURE_WEEK,
  scoring_profile: FANTASY_FORECAST_WEEKLY_PLAYER_SCORING_PROFILE,
});

export const buildValidWeeklyPlayerCardResponseFixture = (): FantasyForecastWeeklyPlayerCardResponseV1 => ({
  contract: FANTASY_FORECAST_WEEKLY_PLAYER_CARD_RESPONSE_CONTRACT,
  contract_version: FANTASY_FORECAST_WEEKLY_PLAYER_CONTRACT_VERSION,
  ok: true,
  warnings: [],
  errors: [],
  data: { card: buildValidWeeklyPlayerCardFixture() },
});

/**
 * Unavailability is an explicit, well-formed failure state. A consumer must
 * fail closed (no card rendered, no zero substituted) — this fixture is
 * expected to VALIDATE against the response schema.
 */
export const buildUnavailableOrStaleResponseFixture = (): FantasyForecastWeeklyPlayerCardResponseV1 => ({
  contract: FANTASY_FORECAST_WEEKLY_PLAYER_CARD_RESPONSE_CONTRACT,
  contract_version: FANTASY_FORECAST_WEEKLY_PLAYER_CONTRACT_VERSION,
  ok: false,
  warnings: [
    {
      code: 'STALE_SOURCE_WINDOW',
      message: 'Most recent admissible opportunity sample predates the requested week window.',
    },
  ],
  errors: [
    {
      code: 'WEEKLY_PLAYER_CARD_UNAVAILABLE',
      message:
        'Weekly player card is unavailable for the requested player and week. Consumers must not substitute zero, cached, or rest-of-season values.',
    },
  ],
});

/** Type violations a consumer must reject: strings/nulls for numbers, missing fields, bad enums/clock. */
export const buildMalformedWeeklyPlayerCardResponseFixture = (): Record<string, unknown> => {
  const card = buildValidWeeklyPlayerCardFixture() as unknown as Record<string, unknown>;
  const malformedCard: Record<string, unknown> = {
    ...card,
    expected_points: String(card.expected_points),
    replacement_points: null,
    confidence_band: 'VERY_HIGH',
    generated_at: 'yesterday',
  };
  delete malformedCard.vorp;
  delete malformedCard.scoring_components;

  return {
    contract: FANTASY_FORECAST_WEEKLY_PLAYER_CARD_RESPONSE_CONTRACT,
    contract_version: FANTASY_FORECAST_WEEKLY_PLAYER_CONTRACT_VERSION,
    ok: true,
    warnings: [],
    errors: [],
    data: { card: malformedCard },
  };
};

export const SEMANTIC_REGRESSION_REMAINING_WEEKS = 11;

/**
 * The semantic-regression fixture: an honest CURRENT-runtime ROS card (built by
 * the real ROS scoring service and transform), wrapped in an envelope that
 * claims to be a weekly player-card response. It carries plausible numeric
 * points fields — which is exactly why it must be mechanically rejected: the
 * horizon is proven by `scoring_mode: 'weekly'` plus the rejected ROS field
 * names, never by the mere existence of a numeric expected-points field.
 */
export const buildWeeklyMustNotBeRosRegressionFixture = (): Record<string, unknown> => {
  const request = buildValidWeeklyPlayerRequestFixture();
  const result = scoreRosService({
    players: request.players,
    league_context: request.league_context,
    remaining_weeks: SEMANTIC_REGRESSION_REMAINING_WEEKS,
  });
  if (!result.ok) {
    throw new Error(
      `Fixture ROS scoring failed; the regression fixture no longer scores: ${result.errors
        .map((error) => error.message)
        .join(' ')}`,
    );
  }

  const rosCard = toTiberRosPlayerCard(
    result.data.players[0],
    FIXTURE_GENERATED_AT,
    SEMANTIC_REGRESSION_REMAINING_WEEKS,
  );

  return {
    contract: FANTASY_FORECAST_WEEKLY_PLAYER_CARD_RESPONSE_CONTRACT,
    contract_version: FANTASY_FORECAST_WEEKLY_PLAYER_CONTRACT_VERSION,
    ok: true,
    warnings: [],
    errors: [],
    data: {
      card: {
        ...rosCard,
        // A mislabeling consumer would stamp the weekly contract identity on it:
        contract: FANTASY_FORECAST_WEEKLY_PLAYER_CARD_CONTRACT,
        contract_version: FANTASY_FORECAST_WEEKLY_PLAYER_CONTRACT_VERSION,
        season: FIXTURE_SEASON,
        week: FIXTURE_WEEK,
        scoring_profile: FANTASY_FORECAST_WEEKLY_PLAYER_SCORING_PROFILE,
        remaining_weeks: SEMANTIC_REGRESSION_REMAINING_WEEKS,
      },
    },
  };
};

// ---------------------------------------------------------------------------
// Frozen-artifact assembly (schemas + fixtures + manifest with sha256 digests).
// ---------------------------------------------------------------------------

export const REQUEST_SCHEMA_FILE = 'fantasy_forecast_weekly_player_request.v1.schema.json';
export const RESPONSE_SCHEMA_FILE = 'fantasy_forecast_weekly_player_card_response.v1.schema.json';
export const MANIFEST_FILE = 'manifest.v1.json';

export type FixtureExpectedOutcome = 'accept' | 'reject';

export interface FantasyForecastWeeklyPlayerFixtureDefinition {
  fixture_id: string;
  validates_against: typeof REQUEST_SCHEMA_FILE | typeof RESPONSE_SCHEMA_FILE;
  expected_outcome: FixtureExpectedOutcome;
  build: () => unknown;
}

export const fantasyForecastWeeklyPlayerV1Fixtures: FantasyForecastWeeklyPlayerFixtureDefinition[] = [
  {
    fixture_id: 'valid_weekly_player_request',
    validates_against: REQUEST_SCHEMA_FILE,
    expected_outcome: 'accept',
    build: buildValidWeeklyPlayerRequestFixture,
  },
  {
    fixture_id: 'invalid_missing_required_league_context',
    validates_against: REQUEST_SCHEMA_FILE,
    expected_outcome: 'reject',
    build: buildMissingLeagueContextRequestFixture,
  },
  {
    fixture_id: 'invalid_null_or_unsupported_player_identity',
    validates_against: REQUEST_SCHEMA_FILE,
    expected_outcome: 'reject',
    build: buildNullPlayerIdentityRequestFixture,
  },
  {
    fixture_id: 'valid_weekly_player_card_response',
    validates_against: RESPONSE_SCHEMA_FILE,
    expected_outcome: 'accept',
    build: buildValidWeeklyPlayerCardResponseFixture,
  },
  {
    fixture_id: 'weekly_player_card_unavailable_or_stale_state',
    validates_against: RESPONSE_SCHEMA_FILE,
    expected_outcome: 'accept',
    build: buildUnavailableOrStaleResponseFixture,
  },
  {
    fixture_id: 'invalid_malformed_weekly_player_card_response',
    validates_against: RESPONSE_SCHEMA_FILE,
    expected_outcome: 'reject',
    build: buildMalformedWeeklyPlayerCardResponseFixture,
  },
  {
    fixture_id: 'semantic_regression_weekly_must_not_be_ros',
    validates_against: RESPONSE_SCHEMA_FILE,
    expected_outcome: 'reject',
    build: buildWeeklyMustNotBeRosRegressionFixture,
  },
];

export interface FantasyForecastWeeklyPlayerContractV1Artifact {
  /** Path relative to FANTASY_FORECAST_WEEKLY_PLAYER_CONTRACT_V1_DIR. */
  relativePath: string;
  kind: 'json_schema' | 'fixture' | 'manifest';
  value: unknown;
  bytes: Buffer;
  sha256: string;
}

const toArtifact = (
  relativePath: string,
  kind: FantasyForecastWeeklyPlayerContractV1Artifact['kind'],
  value: unknown,
): FantasyForecastWeeklyPlayerContractV1Artifact => {
  const bytes = canonicalForwardJsonBytes(value);
  return { relativePath, kind, value, bytes, sha256: forwardArtifactSha256(bytes) };
};

/**
 * Build every frozen artifact deterministically. Identical source must yield
 * identical bytes and digests; the contract test suite enforces that the
 * committed files match this builder's output exactly.
 */
export const buildFantasyForecastWeeklyPlayerContractV1Artifacts =
  (): FantasyForecastWeeklyPlayerContractV1Artifact[] => {
    const schemaArtifacts = [
      toArtifact(REQUEST_SCHEMA_FILE, 'json_schema', fantasyForecastWeeklyPlayerRequestV1Schema),
      toArtifact(RESPONSE_SCHEMA_FILE, 'json_schema', fantasyForecastWeeklyPlayerCardResponseV1Schema),
    ];

    const fixtureArtifacts = fantasyForecastWeeklyPlayerV1Fixtures.map((fixture) =>
      toArtifact(`fixtures/${fixture.fixture_id}.json`, 'fixture', fixture.build()),
    );

    const manifest = {
      contract_family: 'fantasy_forecast.weekly_player',
      contract_version: FANTASY_FORECAST_WEEKLY_PLAYER_CONTRACT_VERSION,
      semantic_owner: 'Prometheus-Frameworks/TIBER-Forecast',
      source_module: 'src/contracts/fantasyForecastWeeklyPlayerV1.ts',
      generator: 'scripts/generateFantasyForecastWeeklyPlayerContractV1.ts',
      canonicalization:
        'src/serialization/canonicalForwardArtifacts.ts canonicalForwardJsonBytes (UTF-8, sorted keys, compact, single trailing LF); sha256 over exact file bytes',
      scoring_profile: FANTASY_FORECAST_WEEKLY_PLAYER_SCORING_PROFILE,
      scoring_profile_sha256: TIBER_GENERIC_FULL_PPR_V1_SHA256,
      horizon: 'weekly',
      generated_at_policy: `All fixture clocks are pinned to ${FIXTURE_GENERATED_AT} for byte determinism.`,
      schemas: schemaArtifacts.map((artifact) => ({
        path: artifact.relativePath,
        sha256: artifact.sha256,
      })),
      fixtures: fantasyForecastWeeklyPlayerV1Fixtures.map((fixture, index) => ({
        fixture_id: fixture.fixture_id,
        path: fixtureArtifacts[index].relativePath,
        validates_against: fixture.validates_against,
        expected_outcome: fixture.expected_outcome,
        sha256: fixtureArtifacts[index].sha256,
      })),
    };

    return [...schemaArtifacts, ...fixtureArtifacts, toArtifact(MANIFEST_FILE, 'manifest', manifest)];
  };
