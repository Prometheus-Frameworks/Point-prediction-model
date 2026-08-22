import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/api/app.js';
import { validateWeeklyScoringRequest } from '../src/api/validation/validateScoringRequest.js';
import {
  FANTASY_FORECAST_WEEKLY_PLAYER_CARD_CONTRACT,
  FANTASY_FORECAST_WEEKLY_PLAYER_CONTRACT_V1_DIR,
  FANTASY_FORECAST_WEEKLY_PLAYER_CONTRACT_VERSION,
  FANTASY_FORECAST_WEEKLY_PLAYER_SCORING_PROFILE,
  FIXTURE_GENERATED_AT,
  FIXTURE_SEASON,
  FIXTURE_WEEK,
  MANIFEST_FILE,
  REQUEST_SCHEMA_FILE,
  RESPONSE_SCHEMA_FILE,
  buildFantasyForecastWeeklyPlayerContractV1Artifacts,
  buildValidWeeklyPlayerCardFixture,
  buildValidWeeklyPlayerRequestFixture,
  checkFantasyForecastWeeklyPlayerCardV1Invariants,
  fantasyForecastWeeklyPlayerV1Fixtures,
  validateFantasyForecastWeeklyPlayerCardResponseV1,
  validateFantasyForecastWeeklyPlayerExchangeV1,
  validateFantasyForecastWeeklyPlayerRequestV1,
} from '../src/contracts/fantasyForecastWeeklyPlayerV1.js';
import { canonicalForwardJson } from '../src/serialization/canonicalForwardArtifacts.js';
import {
  UnsupportedJsonSchemaKeywordError,
  validateJsonSchemaSubset,
  type JsonSchemaSubset,
} from '../src/validation/validateJsonSchemaSubset.js';

const CONTRACT_DIR = path.resolve(__dirname, '..', FANTASY_FORECAST_WEEKLY_PLAYER_CONTRACT_V1_DIR);

const readFrozenBytes = (relativePath: string): Buffer => readFileSync(path.join(CONTRACT_DIR, relativePath));
const readFrozenJson = (relativePath: string): unknown => JSON.parse(readFrozenBytes(relativePath).toString('utf8'));

const frozenRequestSchema = readFrozenJson(REQUEST_SCHEMA_FILE) as JsonSchemaSubset;
const frozenResponseSchema = readFrozenJson(RESPONSE_SCHEMA_FILE) as JsonSchemaSubset;
const frozenManifest = readFrozenJson(MANIFEST_FILE) as {
  contract_version: string;
  schemas: Array<{ path: string; sha256: string }>;
  fixtures: Array<{ fixture_id: string; path: string; validates_against: string; expected_outcome: string; sha256: string }>;
};

const schemaFor = (validatesAgainst: string): JsonSchemaSubset =>
  validatesAgainst === REQUEST_SCHEMA_FILE ? frozenRequestSchema : frozenResponseSchema;

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

describe('FFI-1 frozen artifact reproducibility', () => {
  const artifacts = buildFantasyForecastWeeklyPlayerContractV1Artifacts();

  it('produces identical bytes on repeated builds', () => {
    const rebuilt = buildFantasyForecastWeeklyPlayerContractV1Artifacts();
    for (const [index, artifact] of artifacts.entries()) {
      expect(rebuilt[index].relativePath).toBe(artifact.relativePath);
      expect(rebuilt[index].sha256).toBe(artifact.sha256);
    }
  });

  it('matches every committed artifact byte-for-byte', () => {
    for (const artifact of artifacts) {
      expect(readFrozenBytes(artifact.relativePath).equals(artifact.bytes), artifact.relativePath).toBe(true);
    }
  });

  it('records digests in the manifest that match the frozen fixture and schema bytes', () => {
    const digestByPath = new Map(artifacts.map((artifact) => [artifact.relativePath, artifact.sha256]));
    for (const entry of [...frozenManifest.schemas, ...frozenManifest.fixtures]) {
      expect(digestByPath.get(entry.path), entry.path).toBe(entry.sha256);
    }
    expect(frozenManifest.contract_version).toBe(FANTASY_FORECAST_WEEKLY_PLAYER_CONTRACT_VERSION);
  });

  it('lists exactly the seven required fixture classes', () => {
    expect(frozenManifest.fixtures.map((fixture) => fixture.fixture_id)).toEqual([
      'valid_weekly_player_request',
      'invalid_missing_required_league_context',
      'invalid_null_or_unsupported_player_identity',
      'valid_weekly_player_card_response',
      'weekly_player_card_unavailable_or_stale_state',
      'invalid_malformed_weekly_player_card_response',
      'semantic_regression_weekly_must_not_be_ros',
    ]);
  });
});

describe('FFI-1 fixture validation outcomes (frozen bytes against frozen schemas)', () => {
  for (const entry of fantasyForecastWeeklyPlayerV1Fixtures) {
    it(`${entry.fixture_id} → ${entry.expected_outcome}`, () => {
      const manifestRow = frozenManifest.fixtures.find((fixture) => fixture.fixture_id === entry.fixture_id);
      expect(manifestRow?.expected_outcome).toBe(entry.expected_outcome);

      const fixture = readFrozenJson(`fixtures/${entry.fixture_id}.json`);
      const issues = validateJsonSchemaSubset(fixture, schemaFor(entry.validates_against));

      if (entry.expected_outcome === 'accept') {
        expect(issues).toEqual([]);
      } else {
        expect(issues.length).toBeGreaterThan(0);
      }
    });
  }

  it('rejects the missing-league-context fixture for the replacement context Fantasy omits today', () => {
    const fixture = readFrozenJson('fixtures/invalid_missing_required_league_context.json');
    const issues = validateJsonSchemaSubset(fixture, frozenRequestSchema).join('\n');

    expect(issues).toContain('$.league_context.teams is required.');
    expect(issues).toContain('$.league_context.starters is required.');
    // The fields Fantasy currently sends instead are rejected, not ignored:
    expect(issues).toContain('$.league_context.num_teams is not a recognized field');
    expect(issues).toContain('$.league_context.scoring_format is not a recognized field');
    expect(issues).toContain('$.contract is required.');
    expect(issues).toContain('$.horizon is required.');
  });

  it('rejects null and unsupported player identity distinctly from omission', () => {
    const fixture = readFrozenJson('fixtures/invalid_null_or_unsupported_player_identity.json');
    const issues = validateJsonSchemaSubset(fixture, frozenRequestSchema).join('\n');

    expect(issues).toContain('$.players[0].player_id must have at least 1 character(s).');
    expect(issues).toContain('$.players[0].player_name must be of type string. Received null.');
    expect(issues).toContain('$.players[0].team must be of type string. Received null.');
    expect(issues).toContain('$.players[0].position must be one of "QB", "RB", "WR", "TE". Received "K".');
    expect(issues).toContain('$.players[0].games_sampled must be of type integer. Received null.');
  });

  it('rejects the malformed card for type, enum, clock, and missing-field violations', () => {
    const fixture = readFrozenJson('fixtures/invalid_malformed_weekly_player_card_response.json');
    const issues = validateJsonSchemaSubset(fixture, frozenResponseSchema).join('\n');

    expect(issues).toContain('expected_points must be of type number. Received string');
    expect(issues).toContain('replacement_points must be of type number. Received null');
    expect(issues).toContain('vorp is required');
    expect(issues).toContain('scoring_components is required');
    expect(issues).toContain('confidence_band must be one of "LOW", "MEDIUM", "HIGH". Received "VERY_HIGH"');
    expect(issues).toContain('generated_at must match pattern');
  });
});

describe('FFI-1 semantic regression: weekly must not be consumable as ROS', () => {
  const frozenRegression = readFrozenJson('fixtures/semantic_regression_weekly_must_not_be_ros.json') as {
    data: { card: Record<string, unknown> };
  };

  it('rejects a real ROS card presented as a weekly card response', () => {
    const issues = validateJsonSchemaSubset(frozenRegression, frozenResponseSchema).join('\n');

    expect(issues).toContain('scoring_mode must equal "weekly". Received "ros"');
    expect(issues).toContain('ros_expected_points is not allowed by this contract');
    expect(issues).toContain('ros_vorp is not allowed by this contract');
    expect(issues).toContain('ros_summary is not allowed by this contract');
    expect(issues).toContain('remaining_weeks is not allowed by this contract');
  });

  it('still rejects the card when the ROS field names are stripped but the horizon tag is ROS', () => {
    const doctored = clone(frozenRegression);
    const card = doctored.data.card;
    delete card.ros_expected_points;
    delete card.ros_vorp;
    delete card.ros_summary;
    delete card.remaining_weeks;
    // Backfill the weekly-only structural fields so ONLY the horizon tag differs.
    const validCard = buildValidWeeklyPlayerCardFixture() as unknown as Record<string, unknown>;
    card.replacement_points = validCard.replacement_points;
    card.scoring_components = validCard.scoring_components;

    const issues = validateJsonSchemaSubset(doctored, frozenResponseSchema).join('\n');
    expect(issues).toContain('scoring_mode must equal "weekly". Received "ros"');
  });

  it('still rejects the card when the horizon tag is forged to weekly but ROS fields remain', () => {
    const doctored = clone(frozenRegression);
    doctored.data.card.scoring_mode = 'weekly';

    const issues = validateJsonSchemaSubset(doctored, frozenResponseSchema).join('\n');
    expect(issues).toContain('ros_expected_points is not allowed by this contract');
  });

  it('rejects remaining_weeks on the weekly request (reserved for the ROS contract family)', () => {
    const request = { ...buildValidWeeklyPlayerRequestFixture(), remaining_weeks: 11 } as Record<string, unknown>;
    const issues = validateJsonSchemaSubset(request, frozenRequestSchema).join('\n');
    expect(issues).toContain('$.remaining_weeks is not allowed by this contract');
  });
});

describe('FFI-1 zero / null / omitted / unavailable distinguishability', () => {
  it('accepts an explicit observed zero and an omitted optional field in the same valid request', () => {
    const request = readFrozenJson('fixtures/valid_weekly_player_request.json') as {
      players: Array<Record<string, unknown>>;
    };
    expect(request.players[0].goal_line_rush_attempts_pg).toBe(0);
    expect('td_dependency' in request.players[0]).toBe(false);
    expect(validateJsonSchemaSubset(request, frozenRequestSchema)).toEqual([]);
  });

  it('rejects null where zero or omission is meant', () => {
    const request = readFrozenJson('fixtures/valid_weekly_player_request.json') as {
      players: Array<Record<string, unknown>>;
    };
    request.players[0].goal_line_rush_attempts_pg = null;
    const issues = validateJsonSchemaSubset(request, frozenRequestSchema).join('\n');
    expect(issues).toContain('goal_line_rush_attempts_pg must be of type number. Received null');
  });

  it('rejects whitespace-only required identity strings like the runtime trim check does', () => {
    const request = buildValidWeeklyPlayerRequestFixture();
    request.players[0].player_id = ' ';
    request.players[0].player_name = '\t';

    const schemaIssues = validateJsonSchemaSubset(request, frozenRequestSchema).join('\n');
    expect(schemaIssues).toContain('$.players[0].player_id must match pattern');
    expect(schemaIssues).toContain('$.players[0].player_name must match pattern');

    const runtimeIssues = validateWeeklyScoringRequest(request).join('\n');
    expect(runtimeIssues).toContain('players[0].player_id');
    expect(runtimeIssues).toContain('players[0].player_name');
  });

  it('rejects unknown request fields instead of ignoring them (fail-closed extensibility)', () => {
    const request = { ...buildValidWeeklyPlayerRequestFixture(), projection_horizon: 'ros' } as Record<string, unknown>;
    const issues = validateJsonSchemaSubset(request, frozenRequestSchema).join('\n');
    expect(issues).toContain('$.projection_horizon is not a recognized field');
  });

  it('keeps unavailability an explicit failure envelope, never a zeroed card', () => {
    const unavailable = readFrozenJson('fixtures/weekly_player_card_unavailable_or_stale_state.json') as Record<
      string,
      unknown
    >;
    expect(validateJsonSchemaSubset(unavailable, frozenResponseSchema)).toEqual([]);
    expect(unavailable.ok).toBe(false);
    expect('data' in unavailable).toBe(false);

    // The same envelope carrying a card while claiming failure is malformed:
    const contradiction = {
      ...unavailable,
      data: { card: buildValidWeeklyPlayerCardFixture() },
    };
    expect(validateJsonSchemaSubset(contradiction, frozenResponseSchema).length).toBeGreaterThan(0);
  });
});

describe('FFI-1 cross-field invariants and reference validators', () => {
  it('accepts the frozen valid request and response through the combined validators', () => {
    expect(validateFantasyForecastWeeklyPlayerRequestV1(readFrozenJson('fixtures/valid_weekly_player_request.json'))).toEqual([]);
    const response = readFrozenJson('fixtures/valid_weekly_player_card_response.json');
    expect(validateFantasyForecastWeeklyPlayerCardResponseV1(response)).toEqual([]);
    expect(checkFantasyForecastWeeklyPlayerCardV1Invariants((response as { data: { card: unknown } }).data.card)).toEqual([]);
  });

  it('mechanically rejects per-player horizons on players AND comparison_pool from the frozen schema alone', () => {
    const request = buildValidWeeklyPlayerRequestFixture() as unknown as {
      players: Array<Record<string, unknown>>;
      comparison_pool?: Array<Record<string, unknown>>;
    };
    request.players[0].week = FIXTURE_WEEK + 2;
    request.comparison_pool = [
      { ...request.players[0], player_id: 'TIBER-FIXTURE-WR-0002', week: undefined, season: FIXTURE_SEASON - 1 },
    ];
    delete request.comparison_pool[0].week;

    const issues = validateJsonSchemaSubset(request, frozenRequestSchema).join('\n');
    // The comparison pool feeds the replacement baseline once the combined
    // pool reaches eight players, so a divergent horizon there must be
    // impossible for frozen-bytes consumers, not just for callers of a TS
    // helper: per-player week/season are rejected outright.
    expect(issues).toContain('$.players[0].week is not allowed by this contract');
    expect(issues).toContain('$.comparison_pool[0].season is not allowed by this contract');

    const combined = validateFantasyForecastWeeklyPlayerRequestV1(request).join('\n');
    expect(combined).toContain('$.players[0].week is not allowed by this contract');
  });

  it('ships the exchange rule across the seam: frozen manifest declaration + public package export', async () => {
    const manifest = readFrozenJson(MANIFEST_FILE) as {
      exchange_rule?: {
        rule_id: string;
        success_card_must_echo: { from_request_player: string[]; from_request: string[] };
        failure_envelope_is_valid_for_any_request: boolean;
      };
    };
    // Frozen-bytes consumers get the binding machine-legibly from the manifest:
    expect(manifest.exchange_rule?.rule_id).toBe('fantasy_forecast.weekly_player_exchange');
    expect(manifest.exchange_rule?.success_card_must_echo.from_request_player).toEqual([
      'player_id',
      'player_name',
      'team',
      'position',
    ]);
    expect(manifest.exchange_rule?.success_card_must_echo.from_request).toEqual(['season', 'week']);
    expect(manifest.exchange_rule?.failure_envelope_is_valid_for_any_request).toBe(true);

    // Package consumers reach the executable validators via the supported
    // entry point (package.json exports only src/public/index.ts):
    const publicApi = await import('../src/public/index.js');
    expect(publicApi.validateFantasyForecastWeeklyPlayerExchangeV1).toBe(validateFantasyForecastWeeklyPlayerExchangeV1);
    expect(typeof publicApi.validateFantasyForecastWeeklyPlayerRequestV1).toBe('function');
    expect(typeof publicApi.validateFantasyForecastWeeklyPlayerCardResponseV1).toBe('function');
    expect(publicApi.FANTASY_FORECAST_WEEKLY_PLAYER_EXCHANGE_RULE_V1.rule_id).toBe(
      'fantasy_forecast.weekly_player_exchange',
    );
  });

  it('binds a response to its request: an unrelated but well-formed card fails the exchange', () => {
    const request = readFrozenJson('fixtures/valid_weekly_player_request.json');
    const response = readFrozenJson('fixtures/valid_weekly_player_card_response.json') as {
      data: { card: Record<string, unknown> };
    };
    expect(validateFantasyForecastWeeklyPlayerExchangeV1(request, response)).toEqual([]);

    response.data.card.player_id = 'OTHER';
    response.data.card.season = 2027;
    response.data.card.week = 18;
    const issues = validateFantasyForecastWeeklyPlayerExchangeV1(request, response).join('\n');
    expect(issues).toContain('exchange: card player_id ("OTHER") must echo the requested player player_id');
    expect(issues).toContain('exchange: card season (2027) must echo the request season (2026)');
    expect(issues).toContain('exchange: card week (18) must echo the request week (1)');

    // The unavailable envelope is a valid exchange outcome for any request:
    const unavailable = readFrozenJson('fixtures/weekly_player_card_unavailable_or_stale_state.json');
    expect(validateFantasyForecastWeeklyPlayerExchangeV1(request, unavailable)).toEqual([]);
  });

  it('rejects impossible generated_at calendar instants, not just malformed shapes', () => {
    const response = readFrozenJson('fixtures/valid_weekly_player_card_response.json') as {
      data: { card: Record<string, unknown> };
    };
    // Shape-invalid clocks die in the frozen schema pattern:
    response.data.card.generated_at = '2026-99-99T99:99:99Z';
    expect(validateFantasyForecastWeeklyPlayerCardResponseV1(response).join('\n')).toContain(
      'generated_at must match pattern',
    );
    // Calendar-impossible but shape-valid clocks die in the instant round-trip:
    response.data.card.generated_at = '2026-02-30T12:00:00.000Z';
    expect(validateFantasyForecastWeeklyPlayerCardResponseV1(response).join('\n')).toContain(
      'generated_at must be a real canonical UTC instant',
    );
    // A real leap-day instant passes both layers:
    response.data.card.generated_at = '2028-02-29T12:00:00.000Z';
    expect(validateFantasyForecastWeeklyPlayerCardResponseV1(response)).toEqual([]);
  });

  it('accepts the engine-shaped inverted bracket for negative projections', () => {
    const card = buildValidWeeklyPlayerCardFixture() as unknown as Record<string, unknown>;
    // calculateRangeProfile output for expected_points -100 (volatility 0.5,
    // fragility 0.4 scale): multiplicative factors invert the bracket ends.
    card.expected_points = -100;
    card.replacement_points = 0;
    card.vorp = -100;
    card.floor = -64.49;
    card.median = -100;
    card.ceiling = -137.16;
    card.scoring_components = {
      expected_points: -100,
      replacement_points: 0,
      vorp: -100,
      floor: -64.49,
      median: -100,
      ceiling: -137.16,
    };
    expect(checkFantasyForecastWeeklyPlayerCardV1Invariants(card)).toEqual([]);

    // But a median outside the bracket is still flagged:
    card.median = -200;
    (card.scoring_components as Record<string, unknown>).median = -200;
    expect(checkFantasyForecastWeeklyPlayerCardV1Invariants(card).join('\n')).toContain(
      'median must lie within the floor/ceiling bracket',
    );
  });

  it('accepts unbounded but finite card magnitudes (the kernel does not clamp)', () => {
    const response = readFrozenJson('fixtures/valid_weekly_player_card_response.json') as {
      data: { card: Record<string, unknown> };
    };
    const card = response.data.card;
    card.expected_points = 640.55;
    card.replacement_points = 8.68;
    card.vorp = 631.87;
    card.floor = -12.4;
    card.median = 640.55;
    card.ceiling = 980.14;
    card.scoring_components = {
      expected_points: 640.55,
      replacement_points: 8.68,
      vorp: 631.87,
      floor: -12.4,
      median: 640.55,
      ceiling: 980.14,
    };
    expect(validateJsonSchemaSubset(response, frozenResponseSchema)).toEqual([]);
  });

  it('flags a one-cent VORP drift even when the component mirror carries the same wrong value', () => {
    const card = buildValidWeeklyPlayerCardFixture() as unknown as Record<string, unknown>;
    // Engine identity for the fixture: 15.43 - 8.68 = 6.75. A consistent 6.76
    // on both fields must still be rejected.
    card.vorp = (card.vorp as number) + 0.01;
    (card.scoring_components as Record<string, unknown>).vorp = card.vorp;
    expect(checkFantasyForecastWeeklyPlayerCardV1Invariants(card).join('\n')).toContain(
      'vorp must equal roundTo(expected_points - replacement_points, 2)',
    );
  });

  it('flags a median that drifts from expected_points even inside the bracket', () => {
    const card = buildValidWeeklyPlayerCardFixture() as unknown as Record<string, unknown>;
    card.expected_points = 10;
    card.floor = 5;
    card.median = 9;
    card.ceiling = 15;
    card.replacement_points = 8;
    card.vorp = 2;
    card.scoring_components = {
      expected_points: 10,
      replacement_points: 8,
      vorp: 2,
      floor: 5,
      median: 9,
      ceiling: 15,
    };
    expect(checkFantasyForecastWeeklyPlayerCardV1Invariants(card).join('\n')).toContain(
      "median must equal expected_points under the engine's 2-decimal rounding",
    );
  });

  it('flags broken range ordering and component mirrors on the card', () => {
    const card = buildValidWeeklyPlayerCardFixture() as unknown as Record<string, unknown>;
    card.median = (card.ceiling as number) + 5;
    (card.scoring_components as Record<string, unknown>).vorp = (card.vorp as number) + 1;
    const issues = checkFantasyForecastWeeklyPlayerCardV1Invariants(card).join('\n');
    expect(issues).toContain('floor <= median <= ceiling');
    expect(issues).toContain('scoring_components.vorp');
  });
});

describe('FFI-1 agreement with current Forecast runtime semantics', () => {
  it('valid request fixture passes the current runtime request validator unchanged', () => {
    expect(validateWeeklyScoringRequest(readFrozenJson('fixtures/valid_weekly_player_request.json'))).toEqual([]);
  });

  it('invalid request fixtures fail the current runtime request validator too', () => {
    const missingContext = validateWeeklyScoringRequest(
      readFrozenJson('fixtures/invalid_missing_required_league_context.json'),
    );
    expect(missingContext.join('\n')).toContain('league_context.teams');
    expect(missingContext.join('\n')).toContain('league_context.starters');

    const nullIdentity = validateWeeklyScoringRequest(
      readFrozenJson('fixtures/invalid_null_or_unsupported_player_identity.json'),
    );
    expect(nullIdentity.join('\n')).toContain('players[0].player_name');
    expect(nullIdentity.join('\n')).toContain('players[0].position');
  });

  it('the frozen card is exactly the current engine output plus contract identity fields', () => {
    const frozenCard = (readFrozenJson('fixtures/valid_weekly_player_card_response.json') as {
      data: { card: Record<string, unknown> };
    }).data.card;

    const rebuilt = buildValidWeeklyPlayerCardFixture() as unknown as Record<string, unknown>;
    expect(canonicalForwardJson(rebuilt)).toBe(canonicalForwardJson(frozenCard));

    // The contract identity fields are additive over the runtime card — the
    // remainder is byte-identical engine output (FFI-2 conformance debt is
    // exactly this delta, nothing else).
    const identityFields = ['contract', 'contract_version', 'season', 'week', 'scoring_profile'];
    expect(frozenCard.contract).toBe(FANTASY_FORECAST_WEEKLY_PLAYER_CARD_CONTRACT);
    expect(frozenCard.scoring_profile).toBe(FANTASY_FORECAST_WEEKLY_PLAYER_SCORING_PROFILE);
    for (const field of identityFields) {
      expect(frozenCard[field], field).toBeDefined();
    }
  });
});

describe('FFI-1 offline seam proof against the live route (in-process, no network)', () => {
  const app = createApp();
  const apiKey = 'ffi1-contract-test-api-key';
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

  it('POST /api/tiber/weekly/player-card returns EXACTLY the frozen v1 response for the frozen request (clock aside)', async () => {
    const response = await app.request('/api/tiber/weekly/player-card', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
      body: readFrozenBytes('fixtures/valid_weekly_player_request.json').toString('utf8'),
    });
    expect(response.status).toBe(200);

    const payload = (await response.json()) as { ok: boolean; data: { card: Record<string, unknown> } };

    // The live response satisfies the frozen response schema, the card
    // invariants, and the exchange binding to the request it answered.
    const request = readFrozenJson('fixtures/valid_weekly_player_request.json');
    expect(validateFantasyForecastWeeklyPlayerCardResponseV1(payload)).toEqual([]);
    expect(validateFantasyForecastWeeklyPlayerExchangeV1(request, payload)).toEqual([]);

    // Byte-level: pinning the live clock to the fixture clock makes the whole
    // envelope canonical-identical to the frozen golden response. FFI-2 leaves
    // no identity-field delta.
    expect(typeof payload.data.card.generated_at).toBe('string');
    payload.data.card.generated_at = FIXTURE_GENERATED_AT;
    expect(canonicalForwardJson(payload)).toBe(
      canonicalForwardJson(readFrozenJson('fixtures/valid_weekly_player_card_response.json')),
    );
  });

  it('POST /api/tiber/weekly/player-card rejects invalid and pre-contract bodies with identified v1 failure envelopes', async () => {
    const oldFantasyShape = {
      players: [(readFrozenJson('fixtures/valid_weekly_player_request.json') as { players: unknown[] }).players[0]],
      league_context: { season: 2026, week: 1, scoring_format: 'ppr', num_teams: 12 },
    };

    const bodies: Array<[string, string]> = [
      ['invalid_missing_required_league_context', readFrozenBytes('fixtures/invalid_missing_required_league_context.json').toString('utf8')],
      ['invalid_null_or_unsupported_player_identity', readFrozenBytes('fixtures/invalid_null_or_unsupported_player_identity.json').toString('utf8')],
      ['pre_contract_fantasy_shape', JSON.stringify(oldFantasyShape)],
    ];

    for (const [label, body] of bodies) {
      const response = await app.request('/api/tiber/weekly/player-card', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
        body,
      });
      expect(response.status, label).toBe(400);

      const payload = (await response.json()) as { ok: boolean; errors: Array<{ code: string }> };
      expect(payload.ok, label).toBe(false);
      expect(payload.errors.length, label).toBeGreaterThan(0);
      // The failure envelope itself is a valid instance of the frozen
      // response contract — failures are identified, never anonymous.
      expect(validateFantasyForecastWeeklyPlayerCardResponseV1(payload), label).toEqual([]);
    }
  });
});

describe('FFI-1 subset validator fails closed', () => {
  it('throws on schema keywords it cannot enforce instead of skipping them', () => {
    expect(() =>
      validateJsonSchemaSubset({ a: 1 }, { type: 'object', patternProperties: {} } as unknown as JsonSchemaSubset),
    ).toThrow(UnsupportedJsonSchemaKeywordError);
  });

  it('throws on unsupported keywords in subschemas the instance never reaches', () => {
    const schema = {
      type: 'object',
      properties: { optional: { patternProperties: {} } },
    } as unknown as JsonSchemaSubset;
    // The instance omits `optional`, so only a full schema-tree pre-pass can
    // catch the unsupported keyword.
    expect(() => validateJsonSchemaSubset({}, schema)).toThrow(UnsupportedJsonSchemaKeywordError);

    const nested = {
      oneOf: [{ type: 'object', properties: { deep: { items: { unevaluatedProperties: false } } } }],
    } as unknown as JsonSchemaSubset;
    expect(() => validateJsonSchemaSubset({}, nested)).toThrow(UnsupportedJsonSchemaKeywordError);
  });
});
