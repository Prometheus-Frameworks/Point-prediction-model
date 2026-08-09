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
      record_count_eligible: input.cutoff_evidence.record_count_eligible,
      record_count_post_cutoff: input.cutoff_evidence.record_count_post_cutoff,
      record_count_unresolved: input.cutoff_evidence.record_count_unresolved,
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
    census: {
      census_sha256: forManifest.population_census.census_sha256,
      population_row_ids: rowSet.map((r) => r.population_row_id),
      // Consumer-owned provenance pin: the governed owner, the semantics
      // reference and the source path the consumer resolved independently.
      owner_repository: WEEKLY_GOVERNED_CENSUS_OWNER,
      semantics_ref: forManifest.population_census.semantics_ref,
      source_uri_or_path: forManifest.population_census.census_artifact_ref.uri_or_path,
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
