/**
 * TIBER-Forecast #176 — weekly Week 1 publication contract.
 *
 * Emphasis is on the adversarial cases: what a hostile or careless document
 * could claim about itself, and whether the validator and the consumer seam
 * refuse it.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { canonicalForwardJson, canonicalForwardJsonSha256 } from '../src/serialization/canonicalForwardArtifacts.js';
import {
  WEEKLY_ADMISSION_RECEIPT_ARTIFACT_TYPE,
  WEEKLY_ADMISSION_RECEIPT_ARTIFACT_VERSION,
  WEEKLY_CANONICAL_INPUT_CLASS_RULES,
  WEEKLY_DEFAULT_CONSUMER_ELIGIBILITY,
  WEEKLY_PRESEASON_INPUT_CLASSES,
  WEEKLY_PROHIBITED_PRESEASON_INPUT_CLASSES,
  WEEKLY_PUBLICATION_ARTIFACT_VERSION,
  WEEKLY_PUBLICATION_SCHEMA_EXAMPLE_VERSION,
  WEEKLY_REQUIRED_INPUT_CLASSES,
  WEEKLY_SEASONAL_CANDIDATE_BOUNDARY,
  admitWeeklyPublication,
  isWeeklyPublicationDocument,
  isWeeklySchemaExampleDocument,
  parseWeeklyPlayerRows,
  parseWeeklyPublicationManifest,
  validateWeeklyPublication,
  weeklyManifestSha256,
  type WeeklyAdmissionReceipt,
  type WeeklyForecastPublicationManifest,
  type WeeklyPlayerRow,
  type WeeklyVerificationContext,
} from '../src/contracts/weeklyForecastPublication.js';

const repoRoot = path.resolve(import.meta.dirname, '..');
const fixtureDir = path.join(repoRoot, 'data/fixtures/weekly-forecast-publication');

const manifest = JSON.parse(
  readFileSync(path.join(fixtureDir, '2026-week-01.example.manifest.json'), 'utf8'),
) as WeeklyForecastPublicationManifest;
const rows = JSON.parse(
  readFileSync(path.join(fixtureDir, '2026-week-01.example.rows.json'), 'utf8'),
) as WeeklyPlayerRow[];

const PLACEHOLDER_SHA = 'e'.repeat(64);
const REAL_SHA = '1'.repeat(63) + '2';
const REAL_COMMIT = 'a'.repeat(39) + 'b';

/**
 * Census evidence for a given manifest/rows pair.
 *
 * The digest must come from the manifest under test — `realisedManifest()`
 * swaps the example census digest for a real one, so a context pinned to the
 * example digest would (correctly) fail membership verification.
 */
function censusContext(
  rowSet: readonly WeeklyPlayerRow[] = rows,
  forManifest: WeeklyForecastPublicationManifest = manifest,
): WeeklyVerificationContext {
  return {
    census: {
      census_sha256: forManifest.population_census.census_sha256,
      population_row_ids: rowSet.map((r) => r.population_row_id),
    },
  };
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/**
 * Promote the example into a document that is *structurally* a real
 * publication: no example markers, no placeholder hashes, real commit SHAs.
 * This is what a genuine publication would have to look like.
 */
function realisedManifest(rowSet: readonly WeeklyPlayerRow[] = rows) {
  const next = clone(manifest) as any;
  next.artifact_version = WEEKLY_PUBLICATION_ARTIFACT_VERSION;
  next.publication_id = 'weekly-ppr-2026-w01-001';
  next.population_census.census_sha256 = REAL_SHA;
  next.population_census.census_artifact_ref.content_sha256 = REAL_SHA;
  next.population_census.census_artifact_ref.uri_or_path = 'tiber-data://census/2026/week-01';
  next.population_census.scope_definition = 'Bounded 2026 Week 1 offensive census.';
  next.model.configuration_sha256 = REAL_SHA;
  next.model.feature_configuration_sha256 = REAL_SHA;
  next.model.model_id = 'weekly-base';
  next.model.model_version = '1.0.0';
  next.limitations = ['Point-only output; no calibrated interval is available.'];
  next.artifact_inputs = next.artifact_inputs.map((input: any) => ({
    ...input,
    owner_commit_sha: REAL_COMMIT,
    content_sha256: REAL_SHA,
    uri_or_path: `tiber-data://${input.input_class}`,
    limitations: [],
  }));
  next.outputs = next.outputs.map((output: any) => ({
    ...output,
    uri_or_path: 'tiber-forecast://weekly/2026/week-01/rows.json',
  }));
  const realRows = clone(rowSet as WeeklyPlayerRow[]).map((row) => {
    row.identity.source_identity_ref.uri_or_path = 'tiber-data://census/2026/week-01';
    row.identity.source_identity_ref.content_sha256 = REAL_SHA;
    if (row.identity.canonical_player_id) {
      row.identity.canonical_player_id = row.identity.canonical_player_id.replace('example-canonical', 'canon');
    }
    row.identity.display_name = row.identity.display_name.replace('Example ', '');
    return row;
  });
  next.digests.player_rows_sha256 = canonicalForwardJsonSha256(realRows);
  return { manifest: next as WeeklyForecastPublicationManifest, rows: realRows };
}

function receiptFor(m: WeeklyForecastPublicationManifest, r: readonly WeeklyPlayerRow[]): WeeklyAdmissionReceipt {
  return {
    artifact_type: WEEKLY_ADMISSION_RECEIPT_ARTIFACT_TYPE,
    artifact_version: WEEKLY_ADMISSION_RECEIPT_ARTIFACT_VERSION,
    document_kind: 'weekly_publication_admission_receipt',
    publication_id: m.publication_id,
    manifest_sha256: weeklyManifestSha256(m),
    player_rows_sha256: canonicalForwardJsonSha256(r),
    decided_by: 'operator',
    decided_at: '2026-09-09T18:00:00.000Z',
    decision_ref: { input_id: null, uri_or_path: 'tiber-ops://decision/1', content_sha256: null, record_id: null },
    admission_path: 'governed_preseason_publication',
    in_season_gate_weakened: false,
    consumer_eligibility: 'eligible_admitted',
    limitations: [],
  };
}

const codes = (result: { errors: readonly { code: string }[] }) => result.errors.map((e) => e.code);

// ---------------------------------------------------------------------------

describe('fixture baseline', () => {
  it('validates with a census verification context', () => {
    expect(validateWeeklyPublication(manifest, rows, censusContext()).valid).toBe(true);
  });

  it('is a schema example, not a real publication', () => {
    expect(isWeeklySchemaExampleDocument(manifest)).toBe(true);
    expect(isWeeklyPublicationDocument(manifest)).toBe(false);
  });

  it('declares every canonical input-class rule verbatim', () => {
    expect(manifest.preseason_input_class_rules).toEqual(WEEKLY_CANONICAL_INPUT_CLASS_RULES);
    for (const cls of WEEKLY_PRESEASON_INPUT_CLASSES) {
      expect(manifest.preseason_input_class_rules.map((r) => r.input_class)).toContain(cls);
    }
  });

  it('supplies an artifact input for every required class', () => {
    const present = new Set(manifest.artifact_inputs.map((i) => i.input_class));
    for (const required of WEEKLY_REQUIRED_INPUT_CLASSES) expect(present.has(required)).toBe(true);
  });

  it('keeps target, cutoff and generated-at honest', () => {
    expect(manifest.target.target_season).toBe(2026);
    expect(manifest.target.target_week).toBe(1);
    expect(manifest.target.is_seasonal_total).toBe(false);
    expect(manifest.target.rank_basis).not.toMatch(/^expected_points$/i);
    expect(new Date(manifest.generated_at).getTime()).toBeGreaterThanOrEqual(
      new Date(manifest.forecast_cutoff).getTime(),
    );
  });

  it('is point-only with no fabricated range', () => {
    for (const row of rows) {
      expect(row.uncertainty.status).toBe('unavailable_not_calibrated');
      expect(row.uncertainty.interval_lower).toBeNull();
      expect(row.uncertainty.interval_upper).toBeNull();
    }
  });

  it('keeps reliability truth with TIBER-Data and FORGE explanatory only', () => {
    expect(manifest.reliability_tracking.truth_label_owner).toBe('TIBER-Data');
    expect(manifest.reliability_tracking.forge_is_truth_label).toBe(false);
  });

  it('keeps the seasonal candidate boundary canonical and disjoint', () => {
    expect(manifest.seasonal_candidate_boundary).toEqual(WEEKLY_SEASONAL_CANDIDATE_BOUNDARY);
  });
});

// --- adversarial regressions ------------------------------------------------

describe('adversarial: 1 — schema example relabelled as real/admitted', () => {
  it('rejects a bare version flip that keeps placeholder content', () => {
    const relabelled = clone(manifest) as any;
    relabelled.artifact_version = WEEKLY_PUBLICATION_ARTIFACT_VERSION;
    const result = validateWeeklyPublication(relabelled, rows, censusContext());
    expect(result.valid).toBe(false);
    expect(codes(result)).toContain('example_marker_in_real_publication');
    expect(codes(result)).toContain('placeholder_hash_in_real_publication');
    expect(codes(result)).toContain('placeholder_commit_in_real_publication');
  });

  it('refuses it at the consumer seam even with a matching receipt', () => {
    const relabelled = clone(manifest) as any;
    relabelled.artifact_version = WEEKLY_PUBLICATION_ARTIFACT_VERSION;
    const decision = admitWeeklyPublication(
      relabelled, rows, receiptFor(relabelled, rows), censusContext(),
    );
    expect(decision.admit).toBe(false);
    expect(decision.source).toBeNull();
  });

  it('rejects a manifest that self-declares eligibility', () => {
    const selfAdmitting = clone(manifest) as any;
    selfAdmitting.lifecycle.consumer_eligibility = 'eligible_admitted';
    expect(codes(validateWeeklyPublication(selfAdmitting, rows, censusContext())))
      .toContain('manifest_lifecycle_claims_eligibility');
  });
});

describe('adversarial: 2 — empty rows with claimed census counts', () => {
  it('rejects an empty rows array against a non-empty census', () => {
    const result = validateWeeklyPublication(manifest, [], censusContext([]));
    expect(result.valid).toBe(false);
    expect(codes(result)).toContain('empty_rows_for_non_empty_census');
  });

  it('refuses at the consumer seam', () => {
    const { manifest: real } = realisedManifest();
    const decision = admitWeeklyPublication(real, [], receiptFor(real, []), censusContext([], real));
    expect(decision.admit).toBe(false);
    expect(decision.source).toBeNull();
  });
});

describe('adversarial: 3 — missing required input class', () => {
  it('rejects a publication with no artifact input for a required class', () => {
    const stripped = clone(manifest) as any;
    stripped.artifact_inputs = stripped.artifact_inputs.filter(
      (i: any) => i.input_class !== 'prior_season_usage_and_role',
    );
    const result = validateWeeklyPublication(stripped, rows, censusContext());
    expect(result.valid).toBe(false);
    expect(codes(result)).toContain('required_input_class_missing');
  });

  it('rejects it for a structurally-real publication too', () => {
    const { manifest: real, rows: realRows } = realisedManifest();
    const stripped = clone(real) as any;
    stripped.artifact_inputs = stripped.artifact_inputs.filter(
      (i: any) => i.input_class !== 'roster_and_team_assignment_state',
    );
    expect(codes(validateWeeklyPublication(stripped, realRows, censusContext(realRows, real))))
      .toContain('required_input_class_missing');
  });
});

describe('adversarial: 4 — post-cutoff source with a falsely claimed eligible status', () => {
  it('catches it by local comparison, not by trusting the claim', () => {
    const tampered = clone(manifest) as any;
    // A day after the declared cutoff, while still asserting "eligible".
    tampered.artifact_inputs[0].source_as_of = '2026-09-10T00:00:00.000Z';
    tampered.artifact_inputs[0].cutoff_evidence.self_reported_status = 'eligible';
    const result = validateWeeklyPublication(tampered, rows, censusContext());
    expect(result.valid).toBe(false);
    expect(codes(result)).toContain('input_post_cutoff');
  });

  it('rejects a claimed local verification with no verification context', () => {
    const tampered = clone(manifest) as any;
    tampered.artifact_inputs[0].cutoff_evidence.record_level_verification = 'locally_verified';
    expect(codes(validateWeeklyPublication(tampered, rows, censusContext())))
      .toContain('input_cutoff_unverified');
  });

  it('accepts a claimed local verification when a context vouches for it', () => {
    const tampered = clone(manifest) as any;
    tampered.artifact_inputs[0].cutoff_evidence.record_level_verification = 'locally_verified';
    const result = validateWeeklyPublication(tampered, rows, {
      ...censusContext(),
      record_level_verified_input_ids: [tampered.artifact_inputs[0].input_id],
    });
    expect(codes(result)).not.toContain('input_cutoff_unverified');
  });
});

describe('adversarial: 5 — manifest-provided policy weakened', () => {
  it('rejects an emptied prohibited-input list', () => {
    const weakened = clone(manifest) as any;
    weakened.prohibited_input_classes = [];
    const result = validateWeeklyPublication(weakened, rows, censusContext());
    expect(result.valid).toBe(false);
    expect(codes(result)).toContain('policy_prohibited_list_altered');
  });

  it('rejects altered admissible input rules', () => {
    const weakened = clone(manifest) as any;
    weakened.preseason_input_class_rules[0].required = false;
    expect(codes(validateWeeklyPublication(weakened, rows, censusContext())))
      .toContain('policy_input_rules_altered');
  });

  it('rejects an alternate seasonal-candidate boundary', () => {
    const weakened = clone(manifest) as any;
    weakened.seasonal_candidate_boundary.may_consume_seasonal_candidate = true;
    expect(codes(validateWeeklyPublication(weakened, rows, censusContext())))
      .toContain('policy_seasonal_boundary_altered');
  });

  it('still rejects an admitted prohibited class even if the list were accepted', () => {
    const bad = clone(manifest) as any;
    bad.artifact_inputs[0].input_class = 'current_season_realized_outcomes';
    expect(codes(validateWeeklyPublication(bad, rows, censusContext())))
      .toContain('prohibited_input_class_admitted');
  });
});

describe('adversarial: 6 — row altered after digest creation', () => {
  it('detects a mutated score against the declared rows digest', () => {
    const tamperedRows = clone(rows);
    (tamperedRows[0] as any).point_forecast = 99.9;
    const result = validateWeeklyPublication(manifest, tamperedRows, censusContext(tamperedRows));
    expect(result.valid).toBe(false);
    expect(codes(result)).toContain('player_rows_digest_mismatch');
  });

  it('refuses at the consumer seam when rows no longer match the receipt', () => {
    const { manifest: real, rows: realRows } = realisedManifest();
    const receipt = receiptFor(real, realRows);
    const tampered = clone(realRows);
    (tampered[0] as any).point_forecast = 99.9;
    const decision = admitWeeklyPublication(real, tampered, receipt, censusContext(tampered, real));
    expect(decision.admit).toBe(false);
    expect(decision.source).toBeNull();
  });

  it('refuses when a manifest field is edited after the receipt was issued', () => {
    const { manifest: real, rows: realRows } = realisedManifest();
    const receipt = receiptFor(real, realRows);
    const edited = clone(real) as any;
    edited.forecast_cutoff = '2026-09-08T00:00:00.000Z';
    const decision = admitWeeklyPublication(edited, realRows, receipt, censusContext(realRows, real));
    expect(decision.admit).toBe(false);
    expect(decision).toMatchObject({ reason: 'receipt_manifest_digest_mismatch', source: null });
  });

  it('admits again only when the receipt is regenerated for the new bytes', () => {
    const { manifest: real, rows: realRows } = realisedManifest();
    const edited = clone(real) as any;
    edited.forecast_cutoff = '2026-09-08T00:00:00.000Z';
    const decision = admitWeeklyPublication(
      edited, realRows, receiptFor(edited, realRows), censusContext(realRows, edited),
    );
    expect(decision.admit).toBe(true);
  });
});

describe('adversarial: 7 — duplicate population row ID', () => {
  it('rejects duplicated census row ids', () => {
    const duped = clone(rows);
    duped[1].population_row_id = duped[0].population_row_id;
    const result = validateWeeklyPublication(manifest, duped, censusContext(duped));
    expect(result.valid).toBe(false);
    expect(codes(result)).toContain('duplicate_population_row_id');
  });
});

describe('adversarial: 8 — mismatched status counts and identity coverage', () => {
  it('rejects status counts that disagree with the rows', () => {
    const lying = clone(manifest) as any;
    lying.status_counts.forecast_available += 3;
    const result = validateWeeklyPublication(lying, rows, censusContext());
    expect(result.valid).toBe(false);
    expect(codes(result)).toContain('status_counts_mismatch');
  });

  it('rejects identity coverage that disagrees with the rows', () => {
    const lying = clone(manifest) as any;
    lying.identity_coverage.resolved_count = 4;
    lying.identity_coverage.unresolved_count = 0;
    lying.identity_coverage.coverage_rate = 1;
    lying.identity_coverage.unresolved_population_row_ids = [];
    expect(codes(validateWeeklyPublication(lying, rows, censusContext())))
      .toContain('identity_coverage_mismatch');
  });

  it('rejects a census membership claim without verified census evidence', () => {
    const result = validateWeeklyPublication(manifest, rows, {});
    expect(result.valid).toBe(false);
    expect(codes(result)).toContain('census_membership_unverified');
  });

  it('rejects rows that do not match verified census membership', () => {
    const result = validateWeeklyPublication(manifest, rows, {
      census: { census_sha256: manifest.population_census.census_sha256, population_row_ids: ['other-1', 'other-2', 'other-3', 'other-4'] },
    });
    expect(codes(result)).toContain('census_membership_mismatch');
  });
});

describe('adversarial: 9 — duplicate / non-contiguous / mis-ordered rank', () => {
  it('rejects duplicate ranks', () => {
    const bad = clone(rows);
    (bad[1] as any).rank = (bad[0] as any).rank;
    expect(codes(validateWeeklyPublication(manifest, bad, censusContext(bad))))
      .toContain('rank_not_unique');
  });

  it('rejects non-contiguous ranks', () => {
    const bad = clone(rows);
    (bad[1] as any).rank = 7;
    expect(codes(validateWeeklyPublication(manifest, bad, censusContext(bad))))
      .toContain('rank_not_contiguous');
  });

  it('rejects ranks that contradict the documented ordering', () => {
    const bad = clone(rows);
    // Swap ranks so the lower forecast ranks first.
    (bad[0] as any).rank = 2;
    (bad[1] as any).rank = 1;
    expect(codes(validateWeeklyPublication(manifest, bad, censusContext(bad))))
      .toContain('rank_ordering_violated');
  });

  it('rejects a rank or point forecast on an unavailable row', () => {
    const bad = clone(rows);
    (bad[2] as any).rank = 3;
    expect(codes(validateWeeklyPublication(manifest, bad, censusContext(bad))))
      .toContain('rank_on_unavailable_row');
  });

  it('rejects an available row missing a required input', () => {
    const bad = clone(rows);
    (bad[0] as any).input_ids_used = ['tiber-data-prior-season-outcomes-2025'];
    expect(codes(validateWeeklyPublication(manifest, bad, censusContext(bad))))
      .toContain('available_row_missing_required_input');
  });

  it('rejects an undeclared input id referenced by a row', () => {
    const bad = clone(rows);
    (bad[0] as any).input_ids_used = [...(bad[0] as any).input_ids_used, 'not-declared'];
    expect(codes(validateWeeklyPublication(manifest, bad, censusContext(bad))))
      .toContain('undeclared_input_id_referenced');
  });

  it('rejects an available row without a resolved canonical identity', () => {
    const bad = clone(rows);
    (bad[0] as any).identity.canonical_player_id = null;
    (bad[0] as any).identity.identity_status = 'unresolved';
    expect(codes(validateWeeklyPublication(manifest, bad, censusContext(bad))))
      .toContain('available_row_identity_unresolved');
  });

  it('rejects an unavailable row with no typed reason', () => {
    const bad = clone(rows);
    (bad[2] as any).status_reasons = [];
    expect(codes(validateWeeklyPublication(manifest, bad, censusContext(bad))))
      .toContain('unavailable_row_missing_reason');
  });
});

describe('adversarial: 10 — malformed unknown input returns typed errors', () => {
  it.each([
    ['null', null],
    ['a string', 'not-a-manifest'],
    ['a number', 42],
    ['an array', []],
    ['an empty object', {}],
    ['missing nested objects', { artifact_type: 'weekly_fantasy_point_forecast_publication' }],
  ])('parses %s without throwing', (_label, input) => {
    const result = parseWeeklyPublicationManifest(input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThan(0);
      for (const error of result.errors) expect(typeof error.code).toBe('string');
    }
  });

  it.each([
    ['null rows', null],
    ['a non-array', { items: [] }],
    ['rows containing null', [null]],
    ['rows missing fields', [{}]],
  ])('parses %s rows without throwing', (_label, input) => {
    const result = parseWeeklyPlayerRows(input);
    expect(result.ok).toBe(false);
  });

  it('admits nothing from malformed bytes and never throws', () => {
    for (const bad of [null, undefined, 'x', 0, [], {}]) {
      const decision = admitWeeklyPublication(bad, bad, bad, censusContext());
      expect(decision.admit).toBe(false);
      expect(decision.source).toBeNull();
    }
  });

  it('a truncated JSON document surfaces as a typed error, not an exception', () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse('{"artifact_type": "weekly_fantasy');
    } catch {
      parsed = undefined; // malformed JSON never reaches the contract
    }
    const decision = admitWeeklyPublication(parsed, rows, null, censusContext());
    expect(decision.admit).toBe(false);
    expect(decision.source).toBeNull();
  });
});

// --- consumer seam ----------------------------------------------------------

describe('TIBER-Fantasy consumer seam', () => {
  it('refuses the schema example', () => {
    const decision = admitWeeklyPublication(manifest, rows, receiptFor(manifest, rows), censusContext());
    expect(decision).toMatchObject({ admit: false, source: null, reason: 'schema_example_not_a_publication' });
  });

  it('refuses a real, valid publication with no receipt', () => {
    const { manifest: real, rows: realRows } = realisedManifest();
    const decision = admitWeeklyPublication(real, realRows, null, censusContext(realRows, real));
    expect(decision).toMatchObject({ admit: false, source: null, reason: 'admission_receipt_missing_or_malformed' });
  });

  it('refuses a receipt bound to a different publication', () => {
    const { manifest: real, rows: realRows } = realisedManifest();
    const receipt = { ...receiptFor(real, realRows), publication_id: 'someone-else' };
    expect(admitWeeklyPublication(real, realRows, receipt, censusContext(realRows, real)))
      .toMatchObject({ admit: false, reason: 'receipt_publication_id_mismatch' });
  });

  it('refuses a receipt admitted via the in-season path', () => {
    const { manifest: real, rows: realRows } = realisedManifest();
    const receipt = { ...receiptFor(real, realRows), admission_path: 'meaningful_current_season_inputs' as const };
    expect(admitWeeklyPublication(real, realRows, receipt, censusContext(realRows, real)))
      .toMatchObject({ admit: false, reason: 'receipt_wrong_admission_path' });
  });

  it('refuses a receipt that admits having weakened the in-season gate', () => {
    const { manifest: real, rows: realRows } = realisedManifest();
    const receipt = { ...receiptFor(real, realRows), in_season_gate_weakened: true as unknown as false };
    expect(admitWeeklyPublication(real, realRows, receipt, censusContext(realRows, real)))
      .toMatchObject({ admit: false, reason: 'receipt_weakened_in_season_gate' });
  });

  it('refuses when census evidence is absent', () => {
    const { manifest: real, rows: realRows } = realisedManifest();
    expect(admitWeeklyPublication(real, realRows, receiptFor(real, realRows), {}))
      .toMatchObject({ admit: false, reason: 'contract_invalid' });
  });

  it('admits a real, valid, receipt-bound publication', () => {
    const { manifest: real, rows: realRows } = realisedManifest();
    const decision = admitWeeklyPublication(
      real, realRows, receiptFor(real, realRows), censusContext(realRows, real),
    );
    expect(decision.admit).toBe(true);
    expect(decision).toMatchObject({
      source: 'forecast_weekly_publication',
      publication_id: 'weekly-ppr-2026-w01-001',
      available_row_count: realRows.filter((r) => r.forecast_status === 'forecast_available').length,
    });
  });

  it('never substitutes FORGE — every refusal yields a null source', () => {
    const { manifest: real, rows: realRows } = realisedManifest();
    const refusals = [
      admitWeeklyPublication(manifest, rows, receiptFor(manifest, rows), censusContext()),
      admitWeeklyPublication(real, realRows, null, censusContext(realRows, real)),
      admitWeeklyPublication(real, [], receiptFor(real, []), censusContext([], real)),
      admitWeeklyPublication({ artifact_type: 'other' }, rows, null, censusContext()),
      admitWeeklyPublication(null, null, null, {}),
    ];
    for (const decision of refusals) {
      expect(decision.admit).toBe(false);
      expect(decision.source).toBeNull();
      expect(JSON.stringify(decision).toLowerCase()).not.toContain('forge');
    }
  });
});

describe('determinism', () => {
  it('recomputes the published rows digest', () => {
    expect(canonicalForwardJsonSha256(rows)).toBe(manifest.digests.player_rows_sha256);
    expect(manifest.outputs[0].content_sha256).toBe(manifest.digests.player_rows_sha256);
  });

  it('has no self-referential manifest digest field', () => {
    expect((manifest.digests as unknown as Record<string, unknown>).manifest_sha256).toBeUndefined();
  });

  it('serialises byte-identically on repeat', () => {
    expect(canonicalForwardJson(manifest)).toBe(canonicalForwardJson(manifest));
    expect(canonicalForwardJson(rows)).toBe(canonicalForwardJson(rows));
  });

  it('keeps the default consumer eligibility fail-closed', () => {
    expect(WEEKLY_DEFAULT_CONSUMER_ELIGIBILITY).toBe('not_eligible_pending_admission');
    expect(manifest.lifecycle.consumer_eligibility).toBe('not_eligible_pending_admission');
  });

  it('keeps the prohibited-class list non-empty and canonical', () => {
    expect(WEEKLY_PROHIBITED_PRESEASON_INPUT_CLASSES.length).toBeGreaterThan(0);
    expect(manifest.prohibited_input_classes).toEqual(WEEKLY_PROHIBITED_PRESEASON_INPUT_CLASSES);
  });
});
