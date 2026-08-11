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
  WEEKLY_GOVERNED_CENSUS_OWNER,
  WEEKLY_PRESEASON_INPUT_CLASSES,
  WEEKLY_WEEK1_PREKICKOFF_DEADLINE_UTC,
  WEEKLY_FORECAST_STATUSES,
  WEEKLY_PROHIBITED_PRESEASON_INPUT_CLASSES,
  WEEKLY_PUBLICATION_ARTIFACT_VERSION,
  WEEKLY_PUBLICATION_SCHEMA_EXAMPLE_VERSION,
  WEEKLY_REQUIRED_INPUT_CLASSES,
  WEEKLY_SEASONAL_CANDIDATE_BOUNDARY,
  WEEKLY_FORECAST_REPOSITORY,
  admitWeeklyPublication,
  isWeeklyPublicationDocument,
  isWeeklySchemaExampleDocument,
  parseWeeklyAdmissionReceipt,
  parseWeeklyPlayerRows,
  parseWeeklyPublicationManifest,
  validateWeeklyPublication,
  weeklyAdmissionReceiptSha256,
  weeklyManifestSha256,
  type WeeklyAdmissionReceipt,
  type WeeklyForecastPublicationManifest,
  type WeeklyPlayerRow,
  type WeeklyRecordLevelInputEvidence,
  type WeeklyTrustedAdmissionBinding,
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
const REAL_DECISION_SHA = '2'.repeat(63) + '3';
const REAL_VERIFICATION_SHA = '3'.repeat(63) + '4';

/**
 * Census evidence for a given manifest/rows pair.
 *
 * The digest must come from the manifest under test — `realisedManifest()`
 * swaps the example census digest for a real one, so a context pinned to the
 * example digest would (correctly) fail membership verification.
 */
/**
 * Which population rows an input of this class actually holds an eligible
 * record for, as a consumer deriving membership from the source bytes would
 * find it.
 *
 * This is not a formality. A row declaring `no_prior_season_history` is
 * asserting that the prior-season inputs have nothing for it; a context that
 * simultaneously lists it as an eligible member of those inputs is describing
 * a world that cannot exist, and the validator now rejects exactly that
 * combination. Modelling the honest world here keeps the harness from
 * encoding the contradiction it is supposed to detect.
 */
function inputHoldsRecordFor(inputClass: string, row: WeeklyPlayerRow): boolean {
  if (row.forecast_status === 'no_prior_season_history') {
    return inputClass !== 'prior_season_realized_outcomes' &&
      inputClass !== 'prior_season_usage_and_role';
  }
  return true;
}

/** The honest eligible-membership list for one input class over a row set. */
function eligibleRowIdsFor(inputClass: string, rowSet: readonly WeeklyPlayerRow[]): string[] {
  return rowSet.filter((r) => inputHoldsRecordFor(inputClass, r)).map((r) => r.population_row_id);
}

function censusContext(
  rowSet: readonly WeeklyPlayerRow[] = rows,
  forManifest: WeeklyForecastPublicationManifest = manifest,
  receipt?: WeeklyAdmissionReceipt,
): WeeklyVerificationContext {
  const recordLevelEvidence: WeeklyRecordLevelInputEvidence[] = forManifest.artifact_inputs.map(
    (input) => ({
      input_id: input.input_id,
      input_content_sha256: input.content_sha256,
      owner_repository: input.owner_repository,
      owner_commit_sha: input.owner_commit_sha,
      verified_forecast_cutoff: forManifest.forecast_cutoff,
      verified_source_as_of: input.source_as_of!,
      max_record_effective_at: input.source_as_of!,
      record_count_eligible: eligibleRowIdsFor(input.input_class, rowSet).length,
      record_count_post_cutoff: input.cutoff_evidence.record_count_post_cutoff,
      record_count_unresolved: input.cutoff_evidence.record_count_unresolved,
      // Consumer-derived membership: which population rows this input actually
      // holds an eligible record for.
      eligible_population_row_ids: eligibleRowIdsFor(input.input_class, rowSet),
      verification_artifact_ref: {
        artifact_type: 'weekly_input_cutoff_verification',
        artifact_version: 'weekly-input-cutoff-verification-v1',
        uri_or_path: `tiber-forecast://verification/${input.input_id}`,
        content_sha256:
          forManifest.artifact_version === WEEKLY_PUBLICATION_SCHEMA_EXAMPLE_VERSION
            ? PLACEHOLDER_SHA
            : REAL_VERIFICATION_SHA,
      },
    }),
  );
  return {
    // The consumer's own pin, from deployed configuration rather than the
    // document under test. The fixtures reuse the governed values because the
    // fixture IS the governed census in these tests.
    // Consumer-owned pins, from deployed configuration rather than the document
    // under test. Attacks override these explicitly.
    expected_input_identities: Object.fromEntries(
      forManifest.artifact_inputs.map((input) => [input.input_class, {
        owner_repository: input.owner_repository,
        uri_or_path: input.uri_or_path,
        content_sha256: input.content_sha256,
      }]),
    ),
    verified_scoring_reconciliation: {
      status: 'passed' as const,
      evidence_sha256: forManifest.scoring_profile.source_reconciliation?.evidence_ref?.content_sha256 ?? '',
      scoring_profile_sha256: forManifest.scoring_profile.profile_sha256,
      // Read from the verified artifact, not copied from the manifest.
      source_input_sha256s: [...new Set(forManifest.artifact_inputs.map((i) => i.content_sha256))],
    },
    expected_census_identity: {
      owner_repository: WEEKLY_GOVERNED_CENSUS_OWNER,
      semantics_ref: forManifest.population_census.semantics_ref,
      source_uri_or_path: forManifest.population_census.census_artifact_ref.uri_or_path,
      census_sha256: forManifest.population_census.census_sha256,
    },
    census: {
      census_sha256: forManifest.population_census.census_sha256,
      population_row_ids: rowSet.map((r) => r.population_row_id),
      owner_repository: WEEKLY_GOVERNED_CENSUS_OWNER,
      semantics_ref: forManifest.population_census.semantics_ref,
      source_uri_or_path: forManifest.population_census.census_artifact_ref.uri_or_path,
      canonical_player_ids_by_row_id: Object.fromEntries(
        rowSet.map((r) => [r.population_row_id, r.identity?.canonical_player_id ?? null]),
      ),
      // Governed census positions. The fixture rows ARE the census here, so the
      // verified position is the declared one; tests that attack the binding
      // override this explicitly.
      positions_by_row_id: Object.fromEntries(
        rowSet.map((r) => [r.population_row_id, r.identity?.position ?? null]),
      ),
      // Read from the census bytes, not copied from the manifest. Tests that
      // attack the binding override this explicitly.
      effective_at: forManifest.population_census.effective_at,
    },
    record_level_input_evidence: recordLevelEvidence,
    admission_authority: receipt ? trustedBindingFor(receipt) : undefined,
  };
}

function trustedBindingFor(receipt: WeeklyAdmissionReceipt): WeeklyTrustedAdmissionBinding {
  return {
    receipt_sha256: weeklyAdmissionReceiptSha256(receipt),
    authority_id: receipt.authority_id,
    authority_repository: receipt.authority_repository,
    decision_ref_uri_or_path: receipt.decision_ref.uri_or_path,
    decision_ref_content_sha256: receipt.decision_ref.content_sha256,
    decision_ref_record_id: receipt.decision_ref.record_id,
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
  next.model.implementation_repository = WEEKLY_FORECAST_REPOSITORY;
  next.model.implementation_commit_sha = REAL_COMMIT;
  next.model.implementation_commit_evidence_sha256 = REAL_SHA;
  next.model.fitted_model_ref = {
    artifact_type: 'weekly_fitted_model',
    artifact_version: 'weekly-fitted-model-v1',
    uri_or_path: 'tiber-forecast://models/weekly-base/1.0.0',
    content_sha256: REAL_SHA,
  };
  next.limitations = ['Point-only output; no calibrated interval is available.'];
  next.artifact_inputs = next.artifact_inputs.map((input: any) => ({
    ...input,
    owner_commit_sha: REAL_COMMIT,
    content_sha256: REAL_SHA,
    uri_or_path: `tiber-data://${input.input_class}`,
    cutoff_evidence: {
      ...input.cutoff_evidence,
      // A `locally_verified` input must declare the count the verification
      // evidence will actually carry; the two are bound.
      record_count_eligible: eligibleRowIdsFor(input.input_class, rowSet).length,
      record_level_verification: 'locally_verified',
    },
    limitations: [],
  }));
  next.scoring_profile.source_reconciliation = {
    status: 'passed',
    validator_id: 'weekly-scoring-reconciliation',
    validator_version: '1.0.0',
    evidence_ref: {
      repository: WEEKLY_FORECAST_REPOSITORY,
      path: 'data/verification/weekly-scoring-reconciliation.json',
      artifact_version: 'weekly-scoring-reconciliation-v1',
      content_sha256: REAL_SHA,
    },
    scoring_profile_sha256: next.scoring_profile.profile_sha256,
    source_input_sha256s: [REAL_SHA],
  };
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
  next.outputs[0].content_sha256 = next.digests.player_rows_sha256;
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
    authority_id: 'tiber-human-operator',
    authority_repository: 'Prometheus-Frameworks/TIBER-Ops',
    decided_by: 'operator',
    decided_at: '2026-09-09T18:00:00.000Z',
    decision_ref: {
      input_id: null,
      uri_or_path: 'tiber-ops://decision/weekly-2026-w01',
      content_sha256: REAL_DECISION_SHA,
      record_id: 'weekly-2026-w01-admission',
    },
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

  it('rejects unverified source bytes for a real publication', () => {
    const { manifest: real, rows: realRows } = realisedManifest();
    real.artifact_inputs[0].cutoff_evidence.record_level_verification =
      'unverified_requires_source_bytes';
    expect(codes(validateWeeklyPublication(real, realRows, censusContext(realRows, real))))
      .toContain('input_cutoff_unverified');
  });

  it('rejects a claimed local verification with no structured evidence', () => {
    const { manifest: real, rows: realRows } = realisedManifest();
    const context = censusContext(realRows, real);
    context.record_level_input_evidence = context.record_level_input_evidence?.slice(1);
    expect(codes(validateWeeklyPublication(real, realRows, context)))
      .toContain('input_cutoff_unverified');
  });

  it('rejects structured evidence bound to different source bytes', () => {
    const { manifest: real, rows: realRows } = realisedManifest();
    const context = censusContext(realRows, real);
    context.record_level_input_evidence = context.record_level_input_evidence?.map(
      (evidence, index) => index === 0
        ? { ...evidence, input_content_sha256: REAL_VERIFICATION_SHA }
        : evidence,
    );
    expect(codes(validateWeeklyPublication(real, realRows, context)))
      .toContain('input_verification_binding_mismatch');
  });

  it.each([
    ['owner commit', (evidence: any) => { evidence.owner_commit_sha = 'b'.repeat(40); }, 'input_verification_binding_mismatch'],
    ['forecast cutoff', (evidence: any) => { evidence.verified_forecast_cutoff = '2026-09-08T00:00:00.000Z'; }, 'input_verification_binding_mismatch'],
    ['maximum effective time', (evidence: any) => { evidence.max_record_effective_at = '2026-09-10T00:00:00.000Z'; }, 'input_verification_binding_mismatch'],
    ['eligible count', (evidence: any) => { evidence.record_count_eligible += 1; }, 'input_verification_binding_mismatch'],
    ['verification artifact hash', (evidence: any) => { evidence.verification_artifact_ref.content_sha256 = 'not-a-hash'; }, 'input_verification_artifact_invalid'],
  ])('rejects record evidence with a mismatched %s', (_label, mutate, expectedCode) => {
    const { manifest: real, rows: realRows } = realisedManifest();
    const context = censusContext(realRows, real);
    const evidence = context.record_level_input_evidence?.[0] as any;
    mutate(evidence);
    expect(codes(validateWeeklyPublication(real, realRows, context))).toContain(expectedCode);
  });

  it('accepts exact structured source-byte verification', () => {
    const { manifest: real, rows: realRows } = realisedManifest();
    const result = validateWeeklyPublication(real, realRows, censusContext(realRows, real));
    expect(codes(result)).not.toContain('input_cutoff_unverified');
    expect(result.valid).toBe(true);
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

describe('adversarial: canonical runtime semantics are load-bearing', () => {
  it.each([
    ['owner repository', (value: any) => { value.artifact_inputs[0].owner_repository = 'attacker/repo'; }],
    ['availability rule', (value: any) => { value.artifact_inputs[0].availability_rule_id = 'published_at_or_before_cutoff'; }],
    ['timestamp locator', (value: any) => { value.artifact_inputs[0].cutoff_evidence.source_timestamp_locator = 'record.updated_at'; }],
    ['normalization rule', (value: any) => { value.artifact_inputs[0].cutoff_evidence.normalization_rule_id = 'relaxed-local-time'; }],
  ])('rejects a mutated input %s', (_label, mutate) => {
    const { manifest: real, rows: realRows } = realisedManifest();
    mutate(real);
    expect(codes(validateWeeklyPublication(real, realRows, censusContext(realRows, real))))
      .toContain('input_rule_mismatch');
  });

  it('rejects an arbitrary extra input class', () => {
    const { manifest: real, rows: realRows } = realisedManifest();
    (real.artifact_inputs[0] as any).input_class = 'operator_favourite_players';
    expect(codes(validateWeeklyPublication(real, realRows, censusContext(realRows, real))))
      .toContain('input_class_not_canonical');
  });

  it('rejects scoring-profile drift', () => {
    const { manifest: real, rows: realRows } = realisedManifest();
    (real.scoring_profile.weights as any).reception = 0.5;
    expect(codes(validateWeeklyPublication(real, realRows, censusContext(realRows, real))))
      .toContain('scoring_profile_mismatch');
  });

  it('rejects FORGE as the truth label', () => {
    const { manifest: real, rows: realRows } = realisedManifest();
    (real.reliability_tracking as any).forge_is_truth_label = true;
    expect(codes(validateWeeklyPublication(real, realRows, censusContext(realRows, real))))
      .toContain('reliability_contract_invalid');
  });

  it.each([
    ['artifact type', (value: any) => { value.outputs[0].artifact_type = 'other'; }],
    ['content digest', (value: any) => { value.outputs[0].content_sha256 = REAL_SHA; }],
  ])('rejects broken output %s binding', (_label, mutate) => {
    const { manifest: real, rows: realRows } = realisedManifest();
    mutate(real);
    expect(codes(validateWeeklyPublication(real, realRows, censusContext(realRows, real))))
      .toContain('output_binding_invalid');
  });

  it('rejects missing Forecast implementation evidence', () => {
    const { manifest: real, rows: realRows } = realisedManifest();
    real.model.implementation_commit_evidence_sha256 = '';
    expect(codes(validateWeeklyPublication(real, realRows, censusContext(realRows, real))))
      .toContain('model_identity_invalid');
  });

  it('rejects a census that becomes effective after the forecast cutoff', () => {
    const { manifest: real, rows: realRows } = realisedManifest();
    real.population_census.effective_at = '2026-09-10T00:00:00.000Z';
    expect(codes(validateWeeklyPublication(real, realRows, censusContext(realRows, real))))
      .toContain('census_post_cutoff');
  });
});

describe('adversarial: 11 — the preseason path cannot be slid into the season', () => {
  it('rejects a forecast_cutoff after the Week 1 pre-kickoff deadline', () => {
    const { manifest: real, rows: realRows } = realisedManifest();
    real.forecast_cutoff = '2026-09-17T00:00:00.000Z';
    real.generated_at = '2026-09-17T12:00:00.000Z';
    expect(codes(validateWeeklyPublication(real, realRows, censusContext(realRows, real))))
      .toContain('cutoff_after_prekickoff_deadline');
  });

  it('rejects a generated_at after the deadline even when the cutoff is legal', () => {
    const { manifest: real, rows: realRows } = realisedManifest();
    real.generated_at = '2026-09-14T12:00:00.000Z';
    expect(codes(validateWeeklyPublication(real, realRows, censusContext(realRows, real))))
      .toContain('generated_at_after_prekickoff_deadline');
  });

  it('rejects an impossible calendar date that Date would silently roll over', () => {
    // 2026-09-31 does not exist; Date normalises it to October 1, which would
    // otherwise sail past the deadline comparison as a different instant.
    const { manifest: real, rows: realRows } = realisedManifest();
    real.forecast_cutoff = '2026-09-31T00:00:00.000Z';
    expect(codes(validateWeeklyPublication(real, realRows, censusContext(realRows, real))))
      .toContain('cutoff_not_canonical_utc');
  });
});

describe('adversarial: 12 — the census must be governed, not merely self-consistent', () => {
  it('rejects a census context that does not name the governed owner', () => {
    const { manifest: real, rows: realRows } = realisedManifest();
    const context = censusContext(realRows, real);
    (context.census as any).owner_repository = 'Prometheus-Frameworks/TIBER-Forecast';
    expect(codes(validateWeeklyPublication(real, realRows, context)))
      .toContain('census_provenance_ungoverned');
  });

  it('rejects a self-selected population that is internally consistent', () => {
    // The publisher controls both sides: it drops a player, rehashes, and
    // echoes its own digest back through the context. Digest equality alone
    // would accept this; pinned provenance is what refuses it.
    const { manifest: real, rows: realRows } = realisedManifest();
    const context = censusContext(realRows, real);
    (context.census as any).semantics_ref = 'example://self-selected-population';
    expect(codes(validateWeeklyPublication(real, realRows, context)))
      .toContain('census_provenance_ungoverned');
  });

  it('rejects a census whose source path is not the one the consumer pinned', () => {
    const { manifest: real, rows: realRows } = realisedManifest();
    const context = censusContext(realRows, real);
    (context.census as any).source_uri_or_path = 'tiber-forecast://locally-invented-census';
    expect(codes(validateWeeklyPublication(real, realRows, context)))
      .toContain('census_provenance_ungoverned');
  });
});

describe('adversarial: 13 — uncertainty cannot be calibrated by assertion', () => {
  it('rejects a row claiming calibration with plausible, well-ordered numbers', () => {
    // Every structural check would pass: a method string, finite values, and a
    // correctly ordered interval. None of it is evidence.
    const { manifest: real, rows: realRows } = realisedManifest();
    (realRows[0] as any).uncertainty = {
      status: 'calibrated',
      method_id: 'conformal-v1',
      method_version: '1.0.0',
      lower_quantile: 8.1, median: 14.2, upper_quantile: 21.0,
      interval_lower: 7.4, interval_upper: 22.6,
    };
    expect(codes(validateWeeklyPublication(real, realRows, censusContext(realRows, real))))
      .toContain('calibrated_uncertainty_unsupported');
  });

  it('rejects a manifest declaring calibrated uncertainty', () => {
    const { manifest: real, rows: realRows } = realisedManifest();
    real.uncertainty_status = 'calibrated' as any;
    expect(codes(validateWeeklyPublication(real, realRows, censusContext(realRows, real))))
      .toContain('calibrated_uncertainty_unsupported');
  });
});

describe('adversarial: 14 — identity evidence must be bound, not merely present', () => {
  it('rejects an identity record whose digest is not the governed census', () => {
    const { manifest: real, rows: realRows } = realisedManifest();
    (realRows[0] as any).identity.source_identity_ref.content_sha256 = 'a'.repeat(64);
    expect(codes(validateWeeklyPublication(real, realRows, censusContext(realRows, real))))
      .toContain('identity_evidence_unbound');
  });

  it('rejects an identity record belonging to a different population row', () => {
    // The attack this closes: a valid population row carrying another player's
    // canonical identity, with a syntactically perfect evidence reference.
    const { manifest: real, rows: realRows } = realisedManifest();
    (realRows[0] as any).identity.source_identity_ref.record_id =
      realRows[1].population_row_id;
    expect(codes(validateWeeklyPublication(real, realRows, censusContext(realRows, real))))
      .toContain('identity_evidence_unbound');
  });
});

describe('the published contract matches the validator', () => {
  const contractDoc = readFileSync(
    path.join(repoRoot, 'docs/weekly-forecast-publication-contract.md'),
    'utf8',
  );

  it('documents the receipt pre-kickoff upper bound', () => {
    // The doc states its receipt condition list is exhaustive. An omitted rule
    // there is not cosmetic: an independent implementation reading only the
    // contract would recreate the post-kickoff admission flaw.
    expect(contractDoc).toContain('WEEKLY_WEEK1_PREKICKOFF_DEADLINE_UTC');
    const receiptSection = contractDoc.slice(
      contractDoc.indexOf('A receipt is honoured only when'),
      contractDoc.indexOf('Consequence: mutating any manifest field'),
    );
    expect(receiptSection).toMatch(/no later\s+than `WEEKLY_WEEK1_PREKICKOFF_DEADLINE_UTC`/);
  });

  it('publishes the deadline the validator actually enforces', () => {
    expect(contractDoc).toContain(WEEKLY_WEEK1_PREKICKOFF_DEADLINE_UTC);
  });

  it('does not contradict itself about how position is established', () => {
    // The document gained a census-binding description while an older paragraph
    // still said position was publisher-declared and binding it was open
    // follow-up. A contract document that asserts both leaves a reader unable
    // to tell whether the status is governed or self-checked.
    expect(contractDoc).toContain('positions_by_row_id');
    expect(contractDoc).not.toMatch(/position is\s+publisher-declared/);
    expect(contractDoc).not.toMatch(/Binding position to the\s+governed census is an open follow-up/);
  });

  it('documents every unavailability reason the validator binds', () => {
    // An independent implementation reading only the contract must not be able
    // to recreate the selective-suppression path. Each bound reason has to be
    // named in the doc, not just in the code.
    const section = contractDoc.slice(
      contractDoc.indexOf('### An unavailability reason loses to the evidence'),
      contractDoc.indexOf('## Census reconciliation'),
    );
    expect(section.length).toBeGreaterThan(0);
    for (const reason of [
      'identity_unresolved',
      'identity_conflicting',
      'unavailable_missing_required_inputs',
      'no_prior_season_history',
      'roster_state_unresolved',
      'population_ineligible',
      'unsupported_position_domain',
    ]) {
      expect(section).toContain(reason);
    }
    // Every non-available status is accounted for; a new one added to the enum
    // without a documented binding fails here.
    for (const status of WEEKLY_FORECAST_STATUSES) {
      if (status === 'forecast_available') continue;
      expect(section).toContain(status);
    }
  });
});

describe('adversarial: 15 — the census must be pinned, not merely agreed upon', () => {
  it('refuses admission with no consumer-owned expected census identity', () => {
    const { manifest: real, rows: realRows } = realisedManifest();
    const context = censusContext(realRows, real);
    delete (context as any).expected_census_identity;
    expect(codes(validateWeeklyPublication(real, realRows, context)))
      .toContain('census_provenance_ungoverned');
  });

  it('refuses a self-consistent census the consumer never pinned', () => {
    // The exact reported bypass: a publisher controlling both the manifest and
    // the context names TIBER-Data but selects its own semantics ref, source
    // path, digest and population. Everything agrees with everything, and
    // before this change that passed.
    const { manifest: real, rows: realRows } = realisedManifest();
    const context = censusContext(realRows, real);
    const attackerRef = 'Prometheus-Frameworks/TIBER-Data#999';
    const attackerPath = 'tiber-data://census/2026/week-01-attacker';
    real.population_census.semantics_ref = attackerRef;
    real.population_census.census_artifact_ref.uri_or_path = attackerPath;
    (context.census as any).semantics_ref = attackerRef;
    (context.census as any).source_uri_or_path = attackerPath;
    // The consumer's pin is untouched — that is the whole point.
    expect(codes(validateWeeklyPublication(real, realRows, context)))
      .toContain('census_provenance_ungoverned');
  });

  it('refuses an expected identity that does not name the governed owner', () => {
    const { manifest: real, rows: realRows } = realisedManifest();
    const context = censusContext(realRows, real);
    (context.expected_census_identity as any).owner_repository = 'Prometheus-Frameworks/TIBER-Forecast';
    expect(codes(validateWeeklyPublication(real, realRows, context)))
      .toContain('census_provenance_ungoverned');
  });
});

describe('adversarial: 16 — a canonical id must belong to the record it cites', () => {
  it('refuses a row carrying another row\'s canonical id', () => {
    // The exact reported bypass: swap row 0's canonical id for row 1's, keep
    // row 0's own valid census record id and digest, recompute the output
    // digests. Every per-field check passes; the forecast is published for the
    // wrong player.
    const { manifest: real, rows: realRows } = realisedManifest();
    const swapped = clone(realRows) as any[];
    swapped[0].identity.canonical_player_id = realRows[1].identity!.canonical_player_id;
    // Census evidence still describes the TRUE mapping.
    const context = censusContext(realRows, real);
    expect(codes(validateWeeklyPublication(real, swapped as any, context)))
      .toContain('identity_evidence_unbound');
  });

  it('refuses admission without verified census record identities', () => {
    const { manifest: real, rows: realRows } = realisedManifest();
    const context = censusContext(realRows, real);
    delete (context.census as any).canonical_player_ids_by_row_id;
    expect(codes(validateWeeklyPublication(real, realRows, context)))
      .toContain('identity_evidence_unbound');
  });

  it('refuses a receipt decided after the pre-kickoff deadline', () => {
    // The receipt is the first independently trusted binding of these bytes.
    // An uncapped decision lets a document be authored after Week 1 is played,
    // carry backdated manifest timestamps, and be admitted as a governed
    // preseason forecast with results already in hand.
    const { manifest: real, rows: realRows } = realisedManifest();
    const receipt = receiptFor(real, realRows) as any;
    receipt.decided_at = '2026-09-15T00:00:00.000Z'; // after Week 1 kicked off
    const result = admitWeeklyPublication(
      real, realRows, receipt, censusContext(realRows, real, receipt),
    );
    expect(result.admit).toBe(false);
    expect(result.source).toBeNull();
  });

  it('refuses an available row the verified input holds no record for', () => {
    // The reproduction: a required input verified with ONE eligible record,
    // while two available rows each self-declare that they used it. Every count
    // is internally consistent and the digests and receipt recompute cleanly —
    // but the verified source says nothing about the second player.
    const { manifest: real, rows: realRows } = realisedManifest();
    const context = censusContext(realRows, real);
    const evidence = context.record_level_input_evidence!.map((e) =>
      e.input_id === 'tiber-data-prior-season-outcomes-2025'
        ? { ...e, eligible_population_row_ids: [realRows[0].population_row_id], record_count_eligible: 1 }
        : e,
    );
    const result = validateWeeklyPublication(
      real, realRows, { ...context, record_level_input_evidence: evidence },
    );
    expect(codes(result)).toContain('available_row_missing_required_input');
  });

  it('refuses input evidence whose membership contradicts its own count', () => {
    const { manifest: real, rows: realRows } = realisedManifest();
    const context = censusContext(realRows, real);
    const evidence = context.record_level_input_evidence!.map((e) =>
      e.input_id === 'tiber-data-prior-season-outcomes-2025'
        ? { ...e, record_count_eligible: 99 }
        : e,
    );
    expect(codes(validateWeeklyPublication(
      real, realRows, { ...context, record_level_input_evidence: evidence },
    ))).toContain('input_verification_binding_mismatch');
  });

  it('refuses claiming identity_unresolved while keeping the resolved identity', () => {
    // Third variant of the same suppression attack. The earlier fix bound
    // canonical_player_id, so this keeps the CORRECT id and identity_status
    // 'resolved' and instead flips forecast_status, clears the forecast and
    // rank, renumbers the survivors and recomputes every summary and digest.
    const { manifest: real, rows: realRows } = realisedManifest();
    const suppressed = clone(realRows) as any[];
    suppressed[0].forecast_status = 'identity_unresolved';
    suppressed[0].point_forecast = null;
    suppressed[0].rank = null;
    suppressed[0].status_reasons = ['canonical_identity_missing_in_governed_crosswalk'];
    // Identity itself is untouched and still correct.
    suppressed[1].rank = 1;
    const context = censusContext(realRows, real);
    expect(codes(validateWeeklyPublication(real, suppressed as any, context)))
      .toContain('identity_evidence_unbound');
  });

  it('refuses downgrading a governed resolved player to unresolved', () => {
    // Selective suppression: the trusted census resolves this row, but the
    // publication marks it identity_unresolved, nulls the canonical id,
    // forecast and rank, and recomputes counts and digests.
    const { manifest: real, rows: realRows } = realisedManifest();
    const suppressed = clone(realRows) as any[];
    suppressed[0].identity.canonical_player_id = null;
    suppressed[0].identity.identity_status = 'unresolved';
    suppressed[0].forecast_status = 'identity_unresolved';
    suppressed[0].point_forecast = null;
    suppressed[0].rank = null;
    suppressed[0].status_reasons = ['canonical_identity_missing_in_governed_crosswalk'];
    // Census evidence still carries the TRUE resolved mapping.
    const context = censusContext(realRows, real);
    expect(codes(validateWeeklyPublication(real, suppressed as any, context)))
      .toContain('identity_evidence_unbound');
  });

  it('refuses two population rows resolving to the same canonical player', () => {
    const { manifest: real, rows: realRows } = realisedManifest();
    const duplicated = clone(realRows) as any[];
    duplicated[1].identity.canonical_player_id = duplicated[0].identity.canonical_player_id;
    const context = censusContext(duplicated as any, real);
    expect(codes(validateWeeklyPublication(real, duplicated as any, context)))
      .toContain('identity_evidence_unbound');
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
    const decision = admitWeeklyPublication(
      edited,
      realRows,
      receipt,
      censusContext(realRows, edited, receipt),
    );
    expect(decision.admit).toBe(false);
    expect(decision).toMatchObject({ reason: 'receipt_manifest_digest_mismatch', source: null });
  });

  it('rejects a freshly self-minted receipt while the trusted pin remains on the original receipt', () => {
    const { manifest: real, rows: realRows } = realisedManifest();
    const originalReceipt = receiptFor(real, realRows);
    const edited = clone(real) as any;
    edited.forecast_cutoff = '2026-09-08T00:00:00.000Z';
    const freshlyMintedReceipt = receiptFor(edited, realRows);
    const context = censusContext(realRows, edited, freshlyMintedReceipt);
    context.admission_authority = trustedBindingFor(originalReceipt);
    expect(admitWeeklyPublication(edited, realRows, freshlyMintedReceipt, context))
      .toMatchObject({ admit: false, source: null, reason: 'receipt_not_trusted' });
  });

  it('admits edited bytes only after the separately governed authority pin is intentionally updated', () => {
    const { manifest: real, rows: realRows } = realisedManifest();
    const edited = clone(real) as any;
    edited.forecast_cutoff = '2026-09-08T00:00:00.000Z';
    const receipt = receiptFor(edited, realRows);
    const decision = admitWeeklyPublication(
      edited, realRows, receipt, censusContext(realRows, edited, receipt),
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
      census: {
        census_sha256: manifest.population_census.census_sha256,
        population_row_ids: ['other-1', 'other-2', 'other-3', 'other-4'],
        owner_repository: WEEKLY_GOVERNED_CENSUS_OWNER,
        semantics_ref: manifest.population_census.semantics_ref,
        source_uri_or_path: manifest.population_census.census_artifact_ref.uri_or_path,
      },
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

  it('rejects artifact_inputs containing null before semantic validation', () => {
    const malformed = clone(manifest) as any;
    malformed.artifact_inputs = [null];
    expect(() => parseWeeklyPublicationManifest(malformed)).not.toThrow();
    const result = parseWeeklyPublicationManifest(malformed);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.map((error) => error.path))
      .toContain('artifact_inputs[0]');
  });

  it('rejects a partial population_reconciliation object before it can dereference arrays', () => {
    const malformed = clone(manifest) as any;
    malformed.population_reconciliation = { one_to_one_complete: true };
    expect(() => parseWeeklyPublicationManifest(malformed)).not.toThrow();
    const result = parseWeeklyPublicationManifest(malformed);
    expect(result.ok).toBe(false);
    expect(admitWeeklyPublication(malformed, rows, null, censusContext()))
      .toMatchObject({ admit: false, source: null, reason: 'manifest_malformed' });
  });

  it('rejects cyclic or non-canonical hidden values without throwing', () => {
    const cyclic = clone(manifest) as any;
    cyclic.untrusted_extra = cyclic;
    expect(() => parseWeeklyPublicationManifest(cyclic)).not.toThrow();
    expect(parseWeeklyPublicationManifest(cyclic).ok).toBe(false);

    const nonCanonicalRows = clone(rows) as any;
    nonCanonicalRows[0].untrusted_extra = undefined;
    expect(() => parseWeeklyPlayerRows(nonCanonicalRows)).not.toThrow();
    expect(parseWeeklyPlayerRows(nonCanonicalRows).ok).toBe(false);
  });

  it.each([
    ['self-reported cutoff status', (value: any) => {
      value.artifact_inputs[0].cutoff_evidence.self_reported_status = 'trust_me';
    }],
    ['record verification status', (value: any) => {
      value.artifact_inputs[0].cutoff_evidence.record_level_verification = 'verified_by_producer';
    }],
  ])('rejects an unknown closed-enum %s during manifest parsing', (_label, mutate) => {
    const malformed = clone(manifest) as any;
    mutate(malformed);
    expect(parseWeeklyPublicationManifest(malformed).ok).toBe(false);
  });

  it('rejects an unknown identity status during row parsing', () => {
    const malformed = clone(rows) as any;
    malformed[2].identity.identity_status = 'mostly_resolved';
    expect(parseWeeklyPlayerRows(malformed).ok).toBe(false);
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

  it('rejects a receipt with a null decision hash and record id', () => {
    const { manifest: real, rows: realRows } = realisedManifest();
    const receipt = receiptFor(real, realRows) as any;
    receipt.decision_ref.content_sha256 = null;
    receipt.decision_ref.record_id = null;
    expect(() => admitWeeklyPublication(
      real,
      realRows,
      receipt,
      censusContext(realRows, real),
    )).not.toThrow();
    expect(parseWeeklyAdmissionReceipt(receipt).ok).toBe(false);
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

  it('refuses an otherwise valid receipt without a consumer-owned trust pin', () => {
    const { manifest: real, rows: realRows } = realisedManifest();
    const receipt = receiptFor(real, realRows);
    expect(admitWeeklyPublication(real, realRows, receipt, censusContext(realRows, real)))
      .toMatchObject({ admit: false, source: null, reason: 'trusted_admission_binding_missing' });
  });

  it('rejects any receipt mutation while the external digest pin is unchanged', () => {
    const { manifest: real, rows: realRows } = realisedManifest();
    const receipt = receiptFor(real, realRows);
    const context = censusContext(realRows, real, receipt);
    const mutated = { ...receipt, limitations: ['edited after review'] };
    expect(admitWeeklyPublication(real, realRows, mutated, context))
      .toMatchObject({ admit: false, source: null, reason: 'receipt_not_trusted' });
  });

  it('rejects a placeholder decision hash even if a binding repeats it', () => {
    const { manifest: real, rows: realRows } = realisedManifest();
    const receipt = receiptFor(real, realRows);
    receipt.decision_ref.content_sha256 = '4'.repeat(64);
    expect(admitWeeklyPublication(
      real,
      realRows,
      receipt,
      censusContext(realRows, real, receipt),
    )).toMatchObject({ admit: false, source: null, reason: 'receipt_decision_evidence_invalid' });
  });

  it('rejects example markers anywhere in an externally pinned real receipt', () => {
    const { manifest: real, rows: realRows } = realisedManifest();
    const receipt = receiptFor(real, realRows);
    receipt.limitations = ['schema example copied into an admission receipt'];
    expect(admitWeeklyPublication(
      real,
      realRows,
      receipt,
      censusContext(realRows, real, receipt),
    )).toMatchObject({
      admit: false,
      source: null,
      reason: 'receipt_example_or_placeholder_content',
    });
  });

  it('refuses a receipt bound to a different publication', () => {
    const { manifest: real, rows: realRows } = realisedManifest();
    const receipt = { ...receiptFor(real, realRows), publication_id: 'someone-else' };
    expect(admitWeeklyPublication(real, realRows, receipt, censusContext(realRows, real, receipt)))
      .toMatchObject({ admit: false, reason: 'receipt_publication_id_mismatch' });
  });

  it('refuses a receipt admitted via the in-season path', () => {
    const { manifest: real, rows: realRows } = realisedManifest();
    const receipt = { ...receiptFor(real, realRows), admission_path: 'meaningful_current_season_inputs' as const };
    expect(admitWeeklyPublication(real, realRows, receipt, censusContext(realRows, real, receipt)))
      .toMatchObject({ admit: false, reason: 'receipt_wrong_admission_path' });
  });

  it('refuses a receipt that admits having weakened the in-season gate', () => {
    const { manifest: real, rows: realRows } = realisedManifest();
    const receipt = { ...receiptFor(real, realRows), in_season_gate_weakened: true as unknown as false };
    expect(admitWeeklyPublication(real, realRows, receipt, censusContext(realRows, real, receipt)))
      .toMatchObject({ admit: false, reason: 'receipt_weakened_in_season_gate' });
  });

  it('refuses when census evidence is absent', () => {
    const { manifest: real, rows: realRows } = realisedManifest();
    expect(admitWeeklyPublication(real, realRows, receiptFor(real, realRows), {}))
      .toMatchObject({ admit: false, reason: 'contract_invalid' });
  });

  it('admits a real, valid, receipt-bound publication', () => {
    const { manifest: real, rows: realRows } = realisedManifest();
    const receipt = receiptFor(real, realRows);
    const decision = admitWeeklyPublication(
      real, realRows, receipt, censusContext(realRows, real, receipt),
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

// ---------------------------------------------------------------------------
// 17 — an unavailability REASON is a claim about evidence, and loses to it
// ---------------------------------------------------------------------------

/**
 * The full selective-suppression attack, parameterised by the reason given.
 *
 * Row 0 keeps its correct identity and its true census record. Only its
 * `forecast_status` flips: forecast and rank cleared, a typed reason attached,
 * the survivors renumbered, and the status counts, row digest and output
 * binding all recomputed. Nothing is left internally inconsistent — which is
 * precisely why the reason itself has to be checked against the evidence.
 */
function suppressRowAs(
  real: WeeklyForecastPublicationManifest,
  realRows: readonly WeeklyPlayerRow[],
  index: number,
  status: string,
  reason: string,
) {
  const next = clone(real) as any;
  const nextRows = clone(realRows as WeeklyPlayerRow[]) as any[];
  const victim = nextRows[index];
  const wasAvailable = victim.forecast_status === 'forecast_available';
  victim.forecast_status = status;
  victim.rank = null;
  victim.point_forecast = null;
  victim.status_reasons = [reason];
  let rank = 1;
  for (const row of nextRows) {
    if (row.forecast_status === 'forecast_available') row.rank = rank++;
  }
  next.status_counts = { ...next.status_counts };
  if (wasAvailable) next.status_counts.forecast_available -= 1;
  next.status_counts[status] += 1;
  next.digests.player_rows_sha256 = canonicalForwardJsonSha256(nextRows);
  next.outputs[0].content_sha256 = next.digests.player_rows_sha256;
  return { manifest: next as WeeklyForecastPublicationManifest, rows: nextRows as WeeklyPlayerRow[] };
}

describe('adversarial: 17 — an unavailability reason must lose to the verified evidence', () => {
  it('refuses "missing required inputs" when every verified input holds the row', () => {
    // The reported bypass. The membership check added for available rows only
    // guards the `forecast_available` branch, so a publisher escapes it simply
    // by declaring the row unavailable instead — suppressing a governed player
    // whose inputs are all verified present.
    const { manifest: real, rows: realRows } = realisedManifest();
    const attack = suppressRowAs(
      real, realRows, 0,
      'unavailable_missing_required_inputs',
      'required_input_holds_no_record_for_population_row',
    );
    const result = validateWeeklyPublication(
      attack.manifest, attack.rows, censusContext(realRows, real),
    );
    expect(result.valid).toBe(false);
    expect(codes(result)).toContain('unavailability_reason_contradicted');
  });

  it('refuses "no prior season history" when a verified prior-season input holds the row', () => {
    const { manifest: real, rows: realRows } = realisedManifest();
    const attack = suppressRowAs(
      real, realRows, 0,
      'no_prior_season_history',
      'no_prior_season_realized_outcomes_for_population_row',
    );
    expect(codes(validateWeeklyPublication(
      attack.manifest, attack.rows, censusContext(realRows, real),
    ))).toContain('unavailability_reason_contradicted');
  });

  it('refuses "roster state unresolved" as unverifiable, not as contradicted', () => {
    // An earlier revision refused this because the roster input held a record
    // for the row. That basis was wrong: membership establishes only that a
    // TIMELY record exists, and the governed row shape explicitly admits
    // `team_assignment_status: unknown | unavailable`, so a record can be
    // present while the state is genuinely unresolved. Absent the verified
    // assignment status, neither direction is decidable — so the status is not
    // admission-capable at all.
    const { manifest: real, rows: realRows } = realisedManifest();
    const attack = suppressRowAs(
      real, realRows, 0,
      'roster_state_unresolved',
      'roster_state_unknown_for_population_row',
    );
    const result = codes(validateWeeklyPublication(
      attack.manifest, attack.rows, censusContext(realRows, real),
    ));
    expect(result).toContain('unavailability_reason_unverifiable');
    expect(result).not.toContain('unavailability_reason_contradicted');
  });

  it('refuses "population ineligible" as unverifiable, not on census membership', () => {
    // Two wrong answers preceded this one. First the status was refused for
    // any census member — but §3.6 specifies a deliberately BROAD census that
    // "must include supported, unsupported, eligible, ineligible, and
    // unresolved records", so membership implies nothing about eligibility and
    // every row is a member by construction. Then the check was removed
    // outright, which made the status declarable on assertion alone.
    //
    // Both directions are undecidable without a governed eligibility decision,
    // so the status is not admission-capable — and the refusal must cite that,
    // not census membership.
    const { manifest: real, rows: realRows } = realisedManifest();
    const attack = suppressRowAs(
      real, realRows, 0,
      'population_ineligible',
      'population_row_outside_bounded_scope',
    );
    const result = codes(validateWeeklyPublication(
      attack.manifest, attack.rows, censusContext(realRows, real),
    ));
    expect(result).toContain('unavailability_reason_unverifiable');
    expect(result).not.toContain('unavailability_reason_contradicted');
  });

  it.each(['population_ineligible', 'roster_state_unresolved'] as const)(
    'refuses a publication that suppresses EVERY row as %s',
    (status) => {
      // The reported escalation: repeat the single-row transformation across
      // the whole population and recompute the publisher-controlled counts,
      // digests, receipt and trusted binding. Every structural check passes and
      // the result is an admitted publication containing no rankings at all.
      const { manifest: real, rows: realRows } = realisedManifest();
      let attack = { manifest: real, rows: realRows as WeeklyPlayerRow[] };
      for (let i = 0; i < realRows.length; i += 1) {
        attack = suppressRowAs(attack.manifest, attack.rows, i, status, `${status}_reason`);
      }
      expect(attack.rows.every((r) => r.forecast_status === status)).toBe(true);

      const result = validateWeeklyPublication(
        attack.manifest, attack.rows, censusContext(realRows, real),
      );
      expect(result.valid).toBe(false);
      expect(codes(result)).toContain('unavailability_reason_unverifiable');
    },
  );

  it('refuses "unsupported position domain" for a row declaring a supported position', () => {
    const { manifest: real, rows: realRows } = realisedManifest();
    const attack = suppressRowAs(
      real, realRows, 0,
      'unsupported_position_domain',
      'position_outside_supported_offensive_domain',
    );
    expect(codes(validateWeeklyPublication(
      attack.manifest, attack.rows, censusContext(realRows, real),
    ))).toContain('unavailability_reason_contradicted');
  });

  it('still accepts an unavailability reason the evidence supports', () => {
    // The guard must not turn every unavailable row into an error. The fixture
    // row that truthfully claims no prior season is absent from the verified
    // prior-season memberships, and stays admissible.
    const { manifest: real, rows: realRows } = realisedManifest();
    const truthful = realRows.find((r) => r.forecast_status === 'no_prior_season_history');
    expect(truthful).toBeDefined();
    const context = censusContext(realRows, real);
    for (const evidence of context.record_level_input_evidence!) {
      const input = real.artifact_inputs.find((i) => i.input_id === evidence.input_id)!;
      if (
        input.input_class === 'prior_season_realized_outcomes' ||
        input.input_class === 'prior_season_usage_and_role'
      ) {
        expect(evidence.eligible_population_row_ids).not.toContain(truthful!.population_row_id);
      }
    }
    expect(codes(validateWeeklyPublication(real, realRows, context)))
      .not.toContain('unavailability_reason_contradicted');
  });

  it('stays silent where the evidence is absent rather than guessing', () => {
    // Absence of evidence is not evidence of contradiction. With no verified
    // membership for the required inputs, the publisher's claim is undecidable
    // and must not be rejected on suspicion.
    const { manifest: real, rows: realRows } = realisedManifest();
    const attack = suppressRowAs(
      real, realRows, 0,
      'unavailable_missing_required_inputs',
      'required_input_holds_no_record_for_population_row',
    );
    const context = censusContext(realRows, real);
    const result = validateWeeklyPublication(attack.manifest, attack.rows, {
      ...context,
      record_level_input_evidence: [],
    });
    expect(codes(result)).not.toContain('unavailability_reason_contradicted');
    // It is still inadmissible — on the unverified-input ground, which is the
    // honest reason.
    expect(codes(result)).toContain('input_cutoff_unverified');
  });

  it('does not let a partially verified required set decide the claim', () => {
    // One required input unverified means it could genuinely be the missing
    // one. The check must abstain rather than reject on the other two.
    const { manifest: real, rows: realRows } = realisedManifest();
    const attack = suppressRowAs(
      real, realRows, 0,
      'unavailable_missing_required_inputs',
      'required_input_holds_no_record_for_population_row',
    );
    const context = censusContext(realRows, real);
    const partial = clone(attack.manifest) as any;
    partial.artifact_inputs = partial.artifact_inputs.map((i: any) =>
      i.input_class === 'roster_and_team_assignment_state'
        ? { ...i, cutoff_evidence: { ...i.cutoff_evidence, record_level_verification: 'unverified_requires_source_bytes' } }
        : i,
    );
    expect(codes(validateWeeklyPublication(partial, attack.rows, context)))
      .not.toContain('unavailability_reason_contradicted');
  });
});

describe('adversarial: 18 — records and members are different units', () => {
  // The reported defect: membership length was required to EQUAL
  // `record_count_eligible`. `prior_season_realized_outcomes` is defined as
  // *weekly* PPR outcomes, so one census player legitimately contributes ~17
  // eligible records to a single membership entry. The equality therefore
  // rejected every realistic publication, and only ever passed for inputs
  // holding exactly one record per player — which the fixture happens to be.

  /** Declare `perPlayer` records for each member, as a weekly input would. */
  const withRecordsPerPlayer = (
    real: WeeklyForecastPublicationManifest,
    context: WeeklyVerificationContext,
    perPlayer: number,
  ) => {
    const next = clone(real) as any;
    const evidence = context.record_level_input_evidence!.map((e) => ({
      ...e,
      record_count_eligible: e.eligible_population_row_ids.length * perPlayer,
    }));
    next.artifact_inputs = next.artifact_inputs.map((input: any) => {
      const match = evidence.find((e) => e.input_id === input.input_id)!;
      return {
        ...input,
        cutoff_evidence: { ...input.cutoff_evidence, record_count_eligible: match.record_count_eligible },
      };
    });
    return { manifest: next as WeeklyForecastPublicationManifest, context: { ...context, record_level_input_evidence: evidence } };
  };

  it('admits a weekly input holding many records per player', () => {
    const { manifest: real, rows: realRows } = realisedManifest();
    const { manifest, context } = withRecordsPerPlayer(real, censusContext(realRows, real), 17);
    const result = validateWeeklyPublication(manifest, realRows, context);
    expect(codes(result)).not.toContain('input_verification_binding_mismatch');
  });

  it.each([1, 2, 17, 272])('admits %i records per member', (perPlayer) => {
    const { manifest: real, rows: realRows } = realisedManifest();
    const { manifest, context } = withRecordsPerPlayer(real, censusContext(realRows, real), perPlayer);
    expect(codes(validateWeeklyPublication(manifest, realRows, context)))
      .not.toContain('input_verification_binding_mismatch');
  });

  it('still refuses more members than records', () => {
    // The containment relation that does hold: every member needs at least one
    // record behind it, so members can never outnumber records.
    const { manifest: real, rows: realRows } = realisedManifest();
    const context = censusContext(realRows, real);
    const evidence = context.record_level_input_evidence!.map((e) => ({ ...e, record_count_eligible: 1 }));
    expect(codes(validateWeeklyPublication(real, realRows, { ...context, record_level_input_evidence: evidence })))
      .toContain('input_verification_binding_mismatch');
  });

  it('still refuses records with no member, or a member with no records', () => {
    const { manifest: real, rows: realRows } = realisedManifest();
    const context = censusContext(realRows, real);

    const membersWithoutRecords = context.record_level_input_evidence!.map((e) => ({
      ...e, record_count_eligible: 0,
    }));
    expect(codes(validateWeeklyPublication(
      real, realRows, { ...context, record_level_input_evidence: membersWithoutRecords },
    ))).toContain('input_verification_binding_mismatch');

    const recordsWithoutMembers = context.record_level_input_evidence!.map((e) => ({
      ...e, eligible_population_row_ids: [],
    }));
    expect(codes(validateWeeklyPublication(
      real, realRows, { ...context, record_level_input_evidence: recordsWithoutMembers },
    ))).toContain('input_verification_binding_mismatch');
  });

  it('keeps the per-player membership guard working at realistic record counts', () => {
    // The multi-record fix must not weaken the selective-suppression guard the
    // count check sits next to: a row absent from verified membership is still
    // refused, however many records the input declares.
    const { manifest: real, rows: realRows } = realisedManifest();
    const { manifest, context } = withRecordsPerPlayer(real, censusContext(realRows, real), 17);
    const evidence = context.record_level_input_evidence!.map((e) =>
      e.input_id === 'tiber-data-prior-season-outcomes-2025'
        ? { ...e, eligible_population_row_ids: [realRows[0].population_row_id] }
        : e,
    );
    expect(codes(validateWeeklyPublication(manifest, realRows, { ...context, record_level_input_evidence: evidence })))
      .toContain('available_row_missing_required_input');
  });
});

describe('adversarial: 19 — position is governed census data, not a publisher assertion', () => {
  // The reported bypass: `unsupported_position_domain` was judged against the
  // row's OWN declared position, so relabelling a resolved WR as `K` made the
  // row internally consistent and suppressed it. Repeating that across the
  // population empties the rankings on assertion alone.

  it('refuses a row whose declared position diverges from the census', () => {
    const { manifest: real, rows: realRows } = realisedManifest();
    const tampered = clone(realRows) as any[];
    tampered[0].identity.position = 'K';
    expect(codes(validateWeeklyPublication(real, tampered as any, censusContext(realRows, real))))
      .toContain('identity_evidence_unbound');
  });

  it('refuses the relabel-then-suppress attack', () => {
    // The full transformation: relabel to an unsupported position, flip the
    // status to match, clear forecast and rank, renumber and recompute.
    const { manifest: real, rows: realRows } = realisedManifest();
    const context = censusContext(realRows, real); // census still says WR
    const attack = suppressRowAs(
      real, realRows, 0,
      'unsupported_position_domain',
      'position_outside_supported_offensive_domain',
    );
    (attack.rows[0] as any).identity.position = 'K';
    attack.manifest.digests.player_rows_sha256 = canonicalForwardJsonSha256(attack.rows);
    (attack.manifest.outputs[0] as any).content_sha256 = attack.manifest.digests.player_rows_sha256;

    const result = validateWeeklyPublication(attack.manifest, attack.rows, context);
    expect(result.valid).toBe(false);
    expect(codes(result)).toContain('identity_evidence_unbound');
  });

  it('refuses the status when the census assigns a supported position', () => {
    const { manifest: real, rows: realRows } = realisedManifest();
    const attack = suppressRowAs(
      real, realRows, 0,
      'unsupported_position_domain',
      'position_outside_supported_offensive_domain',
    );
    expect(codes(validateWeeklyPublication(
      attack.manifest, attack.rows, censusContext(realRows, real),
    ))).toContain('unavailability_reason_contradicted');
  });

  it('refuses the status as unverifiable when the census records no position', () => {
    // The census's own shape permits "<cutoff-bound position | unknown>", so an
    // unknown position makes the claim undecidable rather than true.
    const { manifest: real, rows: realRows } = realisedManifest();
    const attack = suppressRowAs(
      real, realRows, 0,
      'unsupported_position_domain',
      'position_outside_supported_offensive_domain',
    );
    (attack.rows[0] as any).identity.position = null;
    attack.manifest.digests.player_rows_sha256 = canonicalForwardJsonSha256(attack.rows);
    (attack.manifest.outputs[0] as any).content_sha256 = attack.manifest.digests.player_rows_sha256;

    const context = censusContext(realRows, real);
    const positions = { ...context.census!.positions_by_row_id!, [attack.rows[0].population_row_id]: null };
    const result = validateWeeklyPublication(attack.manifest, attack.rows, {
      ...context,
      census: { ...context.census!, positions_by_row_id: positions },
    });
    expect(codes(result)).toContain('unavailability_reason_unverifiable');
  });

  it('still admits a genuinely unsupported position the census agrees with', () => {
    // The guard must not make the status undeclarable: it is the only status
    // available for an unsupported-position census row, so refusing it outright
    // would deadlock any census containing one.
    const { manifest: real, rows: realRows } = realisedManifest();
    const attack = suppressRowAs(
      real, realRows, 0,
      'unsupported_position_domain',
      'position_outside_supported_offensive_domain',
    );
    (attack.rows[0] as any).identity.position = 'K';
    attack.manifest.digests.player_rows_sha256 = canonicalForwardJsonSha256(attack.rows);
    (attack.manifest.outputs[0] as any).content_sha256 = attack.manifest.digests.player_rows_sha256;

    const context = censusContext(realRows, real);
    const positions = { ...context.census!.positions_by_row_id!, [attack.rows[0].population_row_id]: 'K' };
    const result = validateWeeklyPublication(attack.manifest, attack.rows, {
      ...context,
      census: { ...context.census!, positions_by_row_id: positions },
    });
    expect(codes(result)).not.toContain('unavailability_reason_contradicted');
    expect(codes(result)).not.toContain('unavailability_reason_unverifiable');
    expect(codes(result)).not.toContain('identity_evidence_unbound');
  });

  it('refuses admission without verified census positions', () => {
    const { manifest: real, rows: realRows } = realisedManifest();
    const context = censusContext(realRows, real);
    delete (context.census as any).positions_by_row_id;
    expect(codes(validateWeeklyPublication(real, realRows, context)))
      .toContain('identity_evidence_unbound');
  });
});

describe('adversarial: 20 — the census effective instant is verified, not asserted', () => {
  // The reported bypass: the cutoff comparison read the manifest's own copy of
  // `population_census.effective_at`. A publisher could pin a census produced
  // AFTER the cutoff and backdate that copy, admitting post-cutoff membership,
  // identities and — since positions became census-derived — positions too.

  const afterCutoff = (real: WeeklyForecastPublicationManifest) =>
    new Date(new Date(real.forecast_cutoff).getTime() + 86_400_000).toISOString();

  it('refuses a backdated manifest copy when the verified census is post-cutoff', () => {
    const { manifest: real, rows: realRows } = realisedManifest();
    const context = censusContext(realRows, real);
    // The manifest keeps its compliant, backdated value; the verified bytes say
    // the census was produced a day after the cutoff.
    const result = validateWeeklyPublication(real, realRows, {
      ...context,
      census: { ...context.census!, effective_at: afterCutoff(real) },
    });
    expect(result.valid).toBe(false);
    expect(codes(result)).toContain('census_effective_at_invalid');
  });

  it('refuses when the verified census carries no effective instant', () => {
    const { manifest: real, rows: realRows } = realisedManifest();
    const context = censusContext(realRows, real);
    delete (context.census as any).effective_at;
    expect(codes(validateWeeklyPublication(real, realRows, context)))
      .toContain('census_effective_at_invalid');
  });

  it('still refuses a post-cutoff census when manifest and evidence agree', () => {
    // The honest case must keep failing on the cutoff ground, not silently
    // pass because the two now match.
    const { manifest: real, rows: realRows } = realisedManifest();
    const late = afterCutoff(real);
    const tampered = clone(real) as any;
    tampered.population_census.effective_at = late;
    const context = censusContext(realRows, real);
    const result = validateWeeklyPublication(tampered, realRows, {
      ...context,
      census: { ...context.census!, effective_at: late },
    });
    expect(result.valid).toBe(false);
    expect(codes(result)).toContain('census_post_cutoff');
  });

  it('admits a census whose verified instant matches and precedes the cutoff', () => {
    const { manifest: real, rows: realRows } = realisedManifest();
    expect(codes(validateWeeklyPublication(real, realRows, censusContext(realRows, real))))
      .not.toContain('census_effective_at_invalid');
  });
});

describe('adversarial: 21 — the source itself must be consumer-pinned', () => {
  // Verifying the publisher's chosen bytes proves those bytes are what they
  // claim, not that they are the source that SHOULD have been used.

  it('refuses a required input the consumer never pinned', () => {
    const { manifest: real, rows: realRows } = realisedManifest();
    const context = censusContext(realRows, real);
    const pins = { ...context.expected_input_identities! };
    delete (pins as any)['prior_season_realized_outcomes'];
    expect(codes(validateWeeklyPublication(real, realRows, {
      ...context, expected_input_identities: pins,
    }))).toContain('input_source_ungoverned');
  });

  it('refuses a truthfully verified but unpinned substitute source', () => {
    // The reported bypass: swap in a different, incomplete TIBER-Data artifact
    // and verify it honestly. Counts, membership and digests all agree with the
    // substituted bytes — only the consumer's own pin disagrees.
    const { manifest: real, rows: realRows } = realisedManifest();
    const substitute = clone(real) as any;
    const target = substitute.artifact_inputs.find(
      (i: any) => i.input_class === 'prior_season_realized_outcomes',
    );
    target.content_sha256 = 'd'.repeat(63) + 'e';
    target.uri_or_path = 'tiber-data://prior-season-outcomes-subset';

    // Evidence honestly describes the substituted bytes.
    const context = censusContext(realRows, real);
    const evidence = context.record_level_input_evidence!.map((e) =>
      e.input_id === target.input_id
        ? { ...e, input_content_sha256: target.content_sha256 }
        : e,
    );

    const result = validateWeeklyPublication(substitute, realRows, {
      ...context, record_level_input_evidence: evidence,
    });
    expect(result.valid).toBe(false);
    expect(codes(result)).toContain('input_source_ungoverned');
  });

  it('does not pin optional input classes', () => {
    // Only required classes gate admission; pinning everything would demand
    // consumer configuration for sources that cannot suppress a player.
    const { manifest: real, rows: realRows } = realisedManifest();
    const context = censusContext(realRows, real);
    const pins = { ...context.expected_input_identities! };
    for (const cls of Object.keys(pins)) {
      if (!(WEEKLY_REQUIRED_INPUT_CLASSES as readonly string[]).includes(cls)) delete (pins as any)[cls];
    }
    expect(codes(validateWeeklyPublication(real, realRows, {
      ...context, expected_input_identities: pins,
    }))).not.toContain('input_source_ungoverned');
  });
});

describe('adversarial: 22 — scoring reconciliation cannot certify itself', () => {
  it('refuses a real publication with no independently verified reconciliation', () => {
    const { manifest: real, rows: realRows } = realisedManifest();
    const context = censusContext(realRows, real);
    delete (context as any).verified_scoring_reconciliation;
    expect(codes(validateWeeklyPublication(real, realRows, context)))
      .toContain('scoring_reconciliation_invalid');
  });

  it('refuses when the verified result is not passed', () => {
    const { manifest: real, rows: realRows } = realisedManifest();
    const context = censusContext(realRows, real);
    expect(codes(validateWeeklyPublication(real, realRows, {
      ...context,
      verified_scoring_reconciliation: { ...context.verified_scoring_reconciliation!, status: 'failed' },
    }))).toContain('scoring_reconciliation_invalid');
  });

  it('refuses when the verified evidence is not the artifact the manifest cites', () => {
    const { manifest: real, rows: realRows } = realisedManifest();
    const context = censusContext(realRows, real);
    expect(codes(validateWeeklyPublication(real, realRows, {
      ...context,
      verified_scoring_reconciliation: {
        ...context.verified_scoring_reconciliation!,
        evidence_sha256: 'c'.repeat(63) + 'd',
      },
    }))).toContain('scoring_reconciliation_invalid');
  });
});

describe('adversarial: 23 — verified reconciliation must cover the admitted inputs', () => {
  // The reported bypass, and a direct consequence of leaving optional input
  // classes unpinned: they cannot suppress a player, but swapping one changes
  // the admitted hash set, and a genuine `passed` reconciliation covering the
  // OLD set could still be cited. The earlier coverage comparison ran on
  // manifest-owned copies on both sides, so it could not see the difference.

  it('refuses a genuine reconciliation that covers a different input set', () => {
    // The manifest stays entirely self-consistent: it declares its own
    // reconciliation over exactly the inputs it admits. Only the VERIFIED
    // artifact disagrees, covering one hash the publication does not admit —
    // which is what reusing a real `passed` reconciliation for another input
    // set looks like from here.
    //
    // Note this constructs the divergence directly rather than by swapping an
    // optional input: the committed fixture carries only the three required
    // classes, so there is no optional input in it to swap. The binding under
    // test is the same either way.
    const { manifest: real, rows: realRows } = realisedManifest();
    const context = censusContext(realRows, real);
    const covered = context.verified_scoring_reconciliation!.source_input_sha256s;
    const result = validateWeeklyPublication(real, realRows, {
      ...context,
      verified_scoring_reconciliation: {
        ...context.verified_scoring_reconciliation!,
        source_input_sha256s: [...covered.slice(1), 'b'.repeat(63) + 'f'],
      },
    });
    expect(result.valid).toBe(false);
    expect(codes(result)).toContain('scoring_reconciliation_invalid');
  });

  it('refuses when the verified artifact covers no inputs at all', () => {
    const { manifest: real, rows: realRows } = realisedManifest();
    const context = censusContext(realRows, real);
    expect(codes(validateWeeklyPublication(real, realRows, {
      ...context,
      verified_scoring_reconciliation: {
        ...context.verified_scoring_reconciliation!,
        source_input_sha256s: [],
      },
    }))).toContain('scoring_reconciliation_invalid');
  });

  it('admits when the verified coverage matches the admitted inputs', () => {
    const { manifest: real, rows: realRows } = realisedManifest();
    expect(codes(validateWeeklyPublication(real, realRows, censusContext(realRows, real))))
      .not.toContain('scoring_reconciliation_invalid');
  });
});
