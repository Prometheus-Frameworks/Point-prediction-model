import type { ScoringPosition } from '../../contracts/scoring.js';

/**
 * Runtime validation for the scoring/tiber HTTP request bodies (Issue #178,
 * Finding 2). The route handlers previously trusted a TypeScript cast, which
 * only checks field presence at the call site — these validators follow the
 * accumulate-issues style of src/io/validateScenario.ts and return the issue
 * list so routes can respond 400 with every problem at once.
 *
 * Ranges are generous sanity bounds meant to reject malformed types and
 * nonsense values, not to encode football judgment.
 */

const scoringPositions: ScoringPosition[] = ['QB', 'RB', 'WR', 'TE'];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const addRequiredString = (issues: string[], value: unknown, path: string) => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    issues.push(`${path} is required and must be a non-empty string.`);
  }
};

const addNumberRange = (
  issues: string[],
  value: unknown,
  path: string,
  minimum: number,
  maximum: number,
) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    issues.push(`${path} is required and must be a finite number.`);
    return;
  }

  if (value < minimum || value > maximum) {
    issues.push(`${path} must be between ${minimum} and ${maximum}. Received ${value}.`);
  }
};

const addOptionalNumberRange = (
  issues: string[],
  value: unknown,
  path: string,
  minimum: number,
  maximum: number,
) => {
  if (value === undefined) {
    return;
  }

  addNumberRange(issues, value, path, minimum, maximum);
};

// Rates, shares, and 0-1 indexes from PlayerOpportunityInput.
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

// Per-game volume counts.
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

// Per-attempt/target yardage efficiency values.
const playerYardageFields = [
  'pass_yards_per_attempt',
  'rush_yards_per_attempt',
  'air_yards_per_target',
  'yards_per_target',
  'yards_per_carry',
  'yards_per_reception',
] as const;

const validatePlayer = (value: unknown, path: string, issues: string[]) => {
  if (!isRecord(value)) {
    issues.push(`${path} is required and must be an object.`);
    return;
  }

  addRequiredString(issues, value.player_id, `${path}.player_id`);
  addRequiredString(issues, value.player_name, `${path}.player_name`);
  addRequiredString(issues, value.team, `${path}.team`);

  if (!scoringPositions.includes(value.position as ScoringPosition)) {
    issues.push(`${path}.position must be one of ${scoringPositions.join(', ')}.`);
  }

  addNumberRange(issues, value.games_sampled, `${path}.games_sampled`, 0, 30);
  addOptionalNumberRange(issues, value.week, `${path}.week`, 1, 18);
  addOptionalNumberRange(issues, value.season, `${path}.season`, 2000, 2100);

  for (const field of playerRateFields) {
    addOptionalNumberRange(issues, value[field], `${path}.${field}`, 0, 1);
  }

  for (const field of playerVolumeFields) {
    addOptionalNumberRange(issues, value[field], `${path}.${field}`, 0, 100);
  }

  for (const field of playerYardageFields) {
    addOptionalNumberRange(issues, value[field], `${path}.${field}`, 0, 60);
  }
};

const validatePlayers = (value: unknown, path: string, issues: string[]) => {
  if (!Array.isArray(value)) {
    issues.push(`${path} is required and must be an array.`);
    return;
  }

  value.forEach((player, index) => validatePlayer(player, `${path}[${index}]`, issues));
};

const validateLeagueContext = (value: unknown, path: string, issues: string[]) => {
  if (!isRecord(value)) {
    issues.push(`${path} is required and must be an object.`);
    return;
  }

  addNumberRange(issues, value.teams, `${path}.teams`, 2, 32);

  if (!isRecord(value.starters)) {
    issues.push(`${path}.starters is required and must be an object.`);
  } else {
    for (const position of scoringPositions) {
      addNumberRange(issues, value.starters[position], `${path}.starters.${position}`, 0, 10);
    }

    addOptionalNumberRange(issues, value.starters.FLEX, `${path}.starters.FLEX`, 0, 10);
  }

  if (value.flex_allocation !== undefined) {
    if (!isRecord(value.flex_allocation)) {
      issues.push(`${path}.flex_allocation must be an object when provided.`);
    } else {
      for (const position of ['RB', 'WR', 'TE'] as const) {
        addOptionalNumberRange(
          issues,
          value.flex_allocation[position],
          `${path}.flex_allocation.${position}`,
          0,
          1,
        );
      }
    }
  }

  addOptionalNumberRange(issues, value.replacement_buffer, `${path}.replacement_buffer`, 0, 1);
};

const validateReplacementPointsOverride = (value: unknown, path: string, issues: string[]) => {
  if (value === undefined) {
    return;
  }

  if (!isRecord(value)) {
    issues.push(`${path} must be an object keyed by position when provided.`);
    return;
  }

  for (const position of scoringPositions) {
    addOptionalNumberRange(issues, value[position], `${path}.${position}`, 0, 100);
  }
};

const validateSharedOptionalFields = (body: Record<string, unknown>, issues: string[]) => {
  if (body.comparison_pool !== undefined) {
    validatePlayers(body.comparison_pool, 'comparison_pool', issues);
  }

  validateReplacementPointsOverride(body.replacement_points_override, 'replacement_points_override', issues);
};

const requireRecordBody = (body: unknown): string[] | null =>
  isRecord(body) ? null : ['Request body must be a JSON object.'];

/** Bodies with a players array + league_context (batch, rankings, replacement). */
export const validateWeeklyScoringRequest = (body: unknown): string[] => {
  const bodyIssue = requireRecordBody(body);
  if (bodyIssue) {
    return bodyIssue;
  }

  const record = body as Record<string, unknown>;
  const issues: string[] = [];

  validatePlayers(record.players, 'players', issues);
  validateLeagueContext(record.league_context, 'league_context', issues);
  validateSharedOptionalFields(record, issues);

  return issues;
};

/** Weekly request plus remaining_weeks (ROS routes). */
export const validateRosScoringRequest = (body: unknown): string[] => {
  const issues = validateWeeklyScoringRequest(body);

  if (isRecord(body)) {
    addNumberRange(issues, body.remaining_weeks, 'remaining_weeks', 1, 18);
  }

  return issues;
};

/** Single-player body ({ player, league_context, ... }) for /api/scoring/weekly/player. */
export const validateWeeklyPlayerScoringRequest = (body: unknown): string[] => {
  const bodyIssue = requireRecordBody(body);
  if (bodyIssue) {
    return bodyIssue;
  }

  const record = body as Record<string, unknown>;
  const issues: string[] = [];

  validatePlayer(record.player, 'player', issues);
  validateLeagueContext(record.league_context, 'league_context', issues);
  validateSharedOptionalFields(record, issues);

  return issues;
};

/** Compare body ({ player_a, player_b, league_context, ... }) for /api/tiber/weekly/compare. */
export const validateWeeklyCompareRequest = (body: unknown): string[] => {
  const bodyIssue = requireRecordBody(body);
  if (bodyIssue) {
    return bodyIssue;
  }

  const record = body as Record<string, unknown>;
  const issues: string[] = [];

  validatePlayer(record.player_a, 'player_a', issues);
  validatePlayer(record.player_b, 'player_b', issues);
  validateLeagueContext(record.league_context, 'league_context', issues);
  validateSharedOptionalFields(record, issues);

  return issues;
};
