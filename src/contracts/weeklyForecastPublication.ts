/**
 * Publication contract for a governed **2026 Week 1 weekly Forecast ranking**.
 *
 * TIBER-Forecast #176. Types, canonical policy constants, a parser that accepts
 * `unknown`, a validator, and a consumer-admission seam. It does not run a
 * model, train anything, generate a real candidate, promote an artifact, or
 * grant consumer eligibility.
 *
 * ## Design: the manifest cannot admit itself
 *
 * An earlier revision put a mutable `lifecycle.admission` block inside the
 * manifest. That is self-inconsistent: the manifest is content-hashed, so
 * editing the admission record to admit a publication invalidates the very
 * digest that identifies it — and a reviewer could flip
 * `consumer_eligibility` by hand.
 *
 * Admission is therefore a **separate, independently hashed receipt**
 * (`WeeklyAdmissionReceipt`) that binds to an exact `manifest_sha256`. This
 * mirrors the house pattern established by the Forward Run 1 admission binding
 * on `main` (`src/contracts/forwardRun1/forwardRun1AdmissionBinding.ts`), where
 * admission evidence is a hashed artifact separate from what it admits.
 *
 * Consequences, all enforced:
 *   - a manifest may declare `draft` or `candidate` only, never eligibility;
 *   - a receipt is valid only against the manifest digest it names;
 *   - mutating any manifest field, row, or score breaks that binding and the
 *     consumer refuses.
 *
 * ## Lineage
 *
 * This repository is the renamed Point-prediction-Model. Legacy package name,
 * routes, symbols, and Fantasy's `SCORING_SERVICE_BASE_URL` remain for
 * compatibility. This contract extends that existing service lineage with a
 * governed pre-Week-1 publication path; it does not introduce a competing
 * producer, and it neither relabels, promotes, nor consumes the seasonal
 * candidate governed by #167/#170.
 */

import { canonicalForwardJsonSha256 } from '../serialization/canonicalForwardArtifacts.js';
import type {
  GenericFullPprProfileV1,
  ScoringReconciliationEvidenceRef,
  TIBER_GENERIC_FULL_PPR_V1_SHA256,
} from './genericFullPprProfile.js';

// ---------------------------------------------------------------------------
// Artifact identity
// ---------------------------------------------------------------------------

export const WEEKLY_PUBLICATION_ARTIFACT_TYPE =
  'weekly_fantasy_point_forecast_publication' as const;
export const WEEKLY_PUBLICATION_ARTIFACT_VERSION =
  'weekly-fantasy-point-forecast-publication-v1' as const;
export const WEEKLY_PUBLICATION_SCHEMA_EXAMPLE_VERSION =
  'weekly-fantasy-point-forecast-publication-v1-example' as const;
export const WEEKLY_PLAYER_ROWS_ARTIFACT_TYPE =
  'weekly_fantasy_point_forecast_player_rows' as const;
export const WEEKLY_PLAYER_ROWS_ARTIFACT_VERSION =
  'weekly-fantasy-point-forecast-player-rows-v1' as const;
export const WEEKLY_ADMISSION_RECEIPT_ARTIFACT_TYPE =
  'weekly_fantasy_point_forecast_admission_receipt' as const;
export const WEEKLY_ADMISSION_RECEIPT_ARTIFACT_VERSION =
  'weekly-fantasy-point-forecast-admission-receipt-v1' as const;

export const WEEKLY_OUTPUT_KIND = 'model-inference' as const;
export const WEEKLY_SERIALIZER_ID = 'tiber-canonical-json-v1' as const;
export const WEEKLY_SERIALIZER_VERSION = '1.0.0' as const;
export const WEEKLY_SCORING_PROFILE_ID = 'tiber-generic-full-ppr-v1' as const;
export const WEEKLY_CUTOFF_RULE = 'fact_available_at <= forecast_cutoff' as const;
export const WEEKLY_RANK_BASIS = 'expected_generic_full_ppr_points_week' as const;

export const WEEKLY_SUPPORTED_POSITIONS = ['QB', 'RB', 'WR', 'TE'] as const;
export type WeeklySupportedPosition = (typeof WEEKLY_SUPPORTED_POSITIONS)[number];

/**
 * Documented deterministic ordering for published ranks.
 *
 * Ranks are 1..N over available rows, ordered by descending point forecast with
 * ties broken by ascending canonical player id. Stated here so contiguity and
 * ordering are both checkable rather than conventions.
 */
export const WEEKLY_RANK_ORDERING_RULE =
  'point_forecast_desc_then_canonical_player_id_asc' as const;

// ---------------------------------------------------------------------------
// Canonical policy — the document may not weaken it
// ---------------------------------------------------------------------------

export const WEEKLY_PRESEASON_INPUT_CLASSES = [
  'prior_season_realized_outcomes',
  'prior_season_usage_and_role',
  'depth_chart_and_role_priors',
  'roster_and_team_assignment_state',
  'schedule_and_opponent_context',
  'player_availability_status',
] as const;
export type WeeklyPreseasonInputClass =
  (typeof WEEKLY_PRESEASON_INPUT_CLASSES)[number];

export const WEEKLY_PROHIBITED_PRESEASON_INPUT_CLASSES = [
  'current_season_realized_outcomes',
  'current_season_usage_and_role',
  'target_week_in_game_facts',
] as const;
export type WeeklyProhibitedPreseasonInputClass =
  (typeof WEEKLY_PROHIBITED_PRESEASON_INPUT_CLASSES)[number];

export type WeeklyAvailabilityRuleId =
  | 'prior_season_final_and_governed'
  | 'state_effective_at_or_before_cutoff'
  | 'published_at_or_before_cutoff';

export interface WeeklyPreseasonInputClassRule {
  input_class: WeeklyPreseasonInputClass;
  availability_rule_id: WeeklyAvailabilityRuleId;
  source_timestamp_locator: string;
  owner_repository: string;
  required: boolean;
  notes: string;
}

/**
 * The canonical admissible-input policy.
 *
 * A publication **declares** these rules but cannot alter them: the validator
 * compares the document's declaration against this constant and rejects any
 * divergence. A document that shipped a relaxed rule set, a shortened
 * prohibited list, or an alternate seasonal boundary would otherwise be able to
 * weaken its own governance.
 */
export const WEEKLY_CANONICAL_INPUT_CLASS_RULES: readonly WeeklyPreseasonInputClassRule[] =
  Object.freeze([
    {
      input_class: 'prior_season_realized_outcomes',
      availability_rule_id: 'prior_season_final_and_governed',
      source_timestamp_locator: 'artifact.source_as_of',
      owner_repository: 'Prometheus-Frameworks/TIBER-Data',
      required: true,
      notes: 'Realized prior-season weekly PPR outcomes. Never current season.',
    },
    {
      input_class: 'prior_season_usage_and_role',
      availability_rule_id: 'prior_season_final_and_governed',
      source_timestamp_locator: 'artifact.source_as_of',
      owner_repository: 'Prometheus-Frameworks/TIBER-Data',
      required: true,
      notes: 'Prior-season usage/role aggregates.',
    },
    {
      input_class: 'depth_chart_and_role_priors',
      availability_rule_id: 'state_effective_at_or_before_cutoff',
      source_timestamp_locator: 'artifact.source_as_of',
      owner_repository: 'Prometheus-Frameworks/TIBER-Data',
      required: false,
      notes: 'Preseason depth-chart state as of the cutoff.',
    },
    {
      input_class: 'roster_and_team_assignment_state',
      availability_rule_id: 'state_effective_at_or_before_cutoff',
      source_timestamp_locator: 'artifact.source_as_of',
      owner_repository: 'Prometheus-Frameworks/TIBER-Data',
      required: true,
      notes: 'Team assignment / free-agency state.',
    },
    {
      input_class: 'schedule_and_opponent_context',
      availability_rule_id: 'published_at_or_before_cutoff',
      source_timestamp_locator: 'artifact.source_as_of',
      owner_repository: 'Prometheus-Frameworks/TIBER-Data',
      required: false,
      notes: 'Week 1 opponent context from the published schedule.',
    },
    {
      input_class: 'player_availability_status',
      availability_rule_id: 'state_effective_at_or_before_cutoff',
      source_timestamp_locator: 'artifact.source_as_of',
      owner_repository: 'Prometheus-Frameworks/TIBER-Data',
      required: false,
      notes: 'Injury/availability designations known at the cutoff.',
    },
  ]);

export const WEEKLY_REQUIRED_INPUT_CLASSES: readonly WeeklyPreseasonInputClass[] =
  Object.freeze(
    WEEKLY_CANONICAL_INPUT_CLASS_RULES.filter((rule) => rule.required).map(
      (rule) => rule.input_class,
    ),
  );

export const WEEKLY_SEASONAL_CANDIDATE_BOUNDARY = Object.freeze({
  seasonal_candidate_run_id: 'seasonal-ppr-2026-forward-001',
  relationship: 'disjoint',
  may_relabel_seasonal_candidate: false,
  may_promote_seasonal_candidate: false,
  may_consume_seasonal_candidate: false,
  note:
    'The seasonal candidate governed by Forecast #167/#170 is point-only, ' +
    'candidate_only, non_promotable and consumer_eligibility: never. It is not a ' +
    'weekly publication and is not an input to one.',
} as const);

/**
 * Markers that identify example/placeholder content.
 *
 * A **real** publication must contain none of these anywhere in its manifest,
 * rows, or receipt. This is what stops a schema example from becoming a real
 * publication by relabelling `artifact_version`.
 */
export const WEEKLY_EXAMPLE_MARKERS: readonly string[] = Object.freeze([
  'example://',
  '-example',
  'example-canonical',
  'not a real publication',
  'schema example',
  'placeholder',
]);

/** A hash consisting of a single repeated character is a placeholder. */
export const WEEKLY_PLACEHOLDER_HASH_PATTERN = /^([0-9a-f])\1{63}$/;
export const WEEKLY_SHA256_PATTERN = /^[0-9a-f]{64}$/;
export const WEEKLY_COMMIT_SHA_PATTERN = /^[0-9a-f]{40}$/;
/** Canonical UTC instant with millisecond precision. */
export const WEEKLY_UTC_INSTANT_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------

export interface WeeklyEvidenceRef {
  input_id: string | null;
  uri_or_path: string;
  content_sha256: string | null;
  record_id: string | null;
}

export interface WeeklyContentRef {
  artifact_type: string;
  artifact_version: string;
  uri_or_path: string;
  content_sha256: string;
}

/**
 * Cutoff evidence for one input.
 *
 * `self_reported_status` is exactly that — a producer claim, deliberately named
 * so nothing reads it as a verification. The validator performs its own local
 * check against `source_as_of`, and `record_level_verification` states honestly
 * whether record-level timestamps could be checked at all without the source
 * bytes. `unverified_requires_source_bytes` is the honest default and blocks
 * admission unless a verification context supplies the missing evidence.
 */
export type WeeklyCutoffStatus =
  | 'eligible'
  | 'ineligible_after_cutoff'
  | 'unresolved';

export type WeeklyRecordVerification =
  | 'locally_verified'
  | 'unverified_requires_source_bytes';

export interface WeeklyInputCutoffEvidence {
  source_timestamp_locator: string;
  normalization_rule_id: string;
  self_reported_status: WeeklyCutoffStatus;
  record_level_verification: WeeklyRecordVerification;
  record_count_eligible: number;
  record_count_post_cutoff: number;
  record_count_unresolved: number;
}

export interface WeeklyArtifactInput {
  input_id: string;
  input_class: WeeklyPreseasonInputClass;
  owner_repository: string;
  owner_commit_sha: string;
  artifact_type: string;
  artifact_version: string;
  uri_or_path: string;
  content_sha256: string;
  /** The instant the validator locally compares with `forecast_cutoff`. */
  source_as_of: string | null;
  availability_rule_id: WeeklyAvailabilityRuleId;
  cutoff_evidence: WeeklyInputCutoffEvidence;
  limitations: readonly string[];
}

// ---------------------------------------------------------------------------
// Identity, census, rows
// ---------------------------------------------------------------------------

export type WeeklyIdentityStatus = 'resolved' | 'unresolved' | 'conflicting';

export interface WeeklyPlayerIdentity {
  canonical_player_id: string | null;
  identity_status: WeeklyIdentityStatus;
  source_identity_ref: WeeklyEvidenceRef;
  display_name: string;
  position: string | null;
  nfl_team_abbr: string | null;
  fuzzy_join_used: false;
  synthetic_namespace_used: false;
}

export interface WeeklyIdentityCoverage {
  census_row_count: number;
  resolved_count: number;
  unresolved_count: number;
  conflicting_count: number;
  coverage_rate: number;
  unresolved_population_row_ids: readonly string[];
  conflicting_population_row_ids: readonly string[];
}

export interface WeeklyPopulationCensusRef {
  census_artifact_ref: WeeklyContentRef;
  census_sha256: string;
  semantics_owner: string;
  semantics_ref: string;
  scope_definition: string;
  effective_at: string;
  row_count: number;
}

export interface WeeklyPopulationReconciliation {
  output_row_count: number;
  duplicate_population_row_ids: readonly string[];
  missing_population_row_ids: readonly string[];
  extra_population_row_ids: readonly string[];
  one_to_one_complete: boolean;
}

export const WEEKLY_FORECAST_STATUSES = [
  'forecast_available',
  'unavailable_missing_required_inputs',
  'unsupported_position_domain',
  'identity_unresolved',
  'identity_conflicting',
  'population_ineligible',
  'no_prior_season_history',
  'roster_state_unresolved',
] as const;
export type WeeklyForecastStatus = (typeof WEEKLY_FORECAST_STATUSES)[number];
export type WeeklyStatusCounts = Record<WeeklyForecastStatus, number>;

export interface WeeklyUnavailableUncertainty {
  status: 'unavailable_not_calibrated';
  method_id: null;
  method_version: null;
  lower_quantile: null;
  median: null;
  upper_quantile: null;
  interval_lower: null;
  interval_upper: null;
}

export interface WeeklyCalibratedUncertainty {
  status: 'calibrated';
  method_id: string;
  method_version: string;
  lower_quantile: number;
  median: number;
  upper_quantile: number;
  interval_lower: number;
  interval_upper: number;
}

export type WeeklyUncertainty =
  | WeeklyUnavailableUncertainty
  | WeeklyCalibratedUncertainty;

export interface WeeklyAvailablePlayerRow {
  population_row_id: string;
  forecast_status: 'forecast_available';
  identity: WeeklyPlayerIdentity & { canonical_player_id: string };
  point_forecast: number;
  rank: number;
  uncertainty: WeeklyUncertainty;
  input_ids_used: readonly string[];
  actual_outcome: null;
  status_reasons?: never;
}

export interface WeeklyUnavailablePlayerRow {
  population_row_id: string;
  forecast_status: Exclude<WeeklyForecastStatus, 'forecast_available'>;
  identity: WeeklyPlayerIdentity;
  point_forecast: null;
  rank: null;
  uncertainty: WeeklyUnavailableUncertainty;
  input_ids_used: readonly string[];
  actual_outcome: null;
  status_reasons: readonly string[];
}

export type WeeklyPlayerRow =
  | WeeklyAvailablePlayerRow
  | WeeklyUnavailablePlayerRow;

// ---------------------------------------------------------------------------
// Lifecycle (manifest side — pre-admission only)
// ---------------------------------------------------------------------------

/** States a manifest may declare about itself. Admission is not among them. */
export const WEEKLY_MANIFEST_LIFECYCLE_STATES = ['draft', 'candidate'] as const;
export type WeeklyManifestLifecycleState =
  (typeof WEEKLY_MANIFEST_LIFECYCLE_STATES)[number];

export const WEEKLY_DEFAULT_CONSUMER_ELIGIBILITY =
  'not_eligible_pending_admission' as const;

export const WEEKLY_ADMISSION_PATHS = [
  'meaningful_current_season_inputs',
  'governed_preseason_publication',
] as const;
export type WeeklyAdmissionPath = (typeof WEEKLY_ADMISSION_PATHS)[number];

export interface WeeklyManifestLifecycle {
  state: WeeklyManifestLifecycleState;
  /** Literal. A manifest can never self-declare eligibility. */
  consumer_eligibility: typeof WEEKLY_DEFAULT_CONSUMER_ELIGIBILITY;
  admission_requires_receipt: true;
}

export interface WeeklyReliabilityTracking {
  truth_label_owner: 'TIBER-Data';
  truth_label_artifact_kind: 'realized_weekly_ppr_outcomes';
  truth_label_ref: WeeklyEvidenceRef | null;
  forge_role: 'explanatory_context_only';
  forge_is_truth_label: false;
  scored_at: string | null;
}

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------

export interface WeeklySerializationIdentity {
  serializer_id: typeof WEEKLY_SERIALIZER_ID;
  serializer_version: typeof WEEKLY_SERIALIZER_VERSION;
}

export interface WeeklyModelIdentity {
  model_id: string;
  model_version: string;
  configuration_sha256: string;
  feature_configuration_sha256: string;
  fitted_model_ref: WeeklyContentRef | null;
}

export interface WeeklyScoringProfile extends GenericFullPprProfileV1 {
  profile_sha256: typeof TIBER_GENERIC_FULL_PPR_V1_SHA256;
  source_reconciliation: ScoringReconciliationEvidenceRef;
}

export interface WeeklyTargetDefinition {
  target_season: number;
  target_week: number;
  target_kind: 'single_scoring_week';
  is_seasonal_total: false;
  rank_basis: typeof WEEKLY_RANK_BASIS;
  rank_ordering_rule: typeof WEEKLY_RANK_ORDERING_RULE;
  scoring_profile_id: typeof WEEKLY_SCORING_PROFILE_ID;
  league_specific: false;
  supported_positions: readonly WeeklySupportedPosition[];
  unsupported_domain: readonly string[];
}

export interface WeeklyDigests {
  player_rows_sha256: string;
  serialization: WeeklySerializationIdentity;
}

export interface WeeklyForecastPublicationManifest {
  artifact_type: typeof WEEKLY_PUBLICATION_ARTIFACT_TYPE;
  artifact_version:
    | typeof WEEKLY_PUBLICATION_ARTIFACT_VERSION
    | typeof WEEKLY_PUBLICATION_SCHEMA_EXAMPLE_VERSION;
  document_kind: 'weekly_publication_manifest';
  publication_id: string;
  output_kind: typeof WEEKLY_OUTPUT_KIND;

  target: WeeklyTargetDefinition;

  forecast_cutoff: string;
  generated_at: string;
  cutoff_rule: typeof WEEKLY_CUTOFF_RULE;

  preseason_input_class_rules: readonly WeeklyPreseasonInputClassRule[];
  prohibited_input_classes: readonly WeeklyProhibitedPreseasonInputClass[];
  artifact_inputs: readonly WeeklyArtifactInput[];

  scoring_profile: WeeklyScoringProfile;
  model: WeeklyModelIdentity;

  population_census: WeeklyPopulationCensusRef;
  population_reconciliation: WeeklyPopulationReconciliation;
  identity_coverage: WeeklyIdentityCoverage;
  status_counts: WeeklyStatusCounts;

  uncertainty_status: 'unavailable_not_calibrated' | 'calibrated';
  lifecycle: WeeklyManifestLifecycle;
  reliability_tracking: WeeklyReliabilityTracking;
  seasonal_candidate_boundary: typeof WEEKLY_SEASONAL_CANDIDATE_BOUNDARY;

  outputs: readonly WeeklyContentRef[];
  /** Note: contains no manifest digest — see `weeklyManifestSha256`. */
  digests: WeeklyDigests;
  limitations: readonly string[];
}

/**
 * The manifest digest.
 *
 * Computed over the whole manifest. Because the manifest contains no
 * self-referential digest field, this is well defined and stable — the earlier
 * "digest of the manifest minus its digest block" arrangement was the source of
 * the self-inconsistency.
 */
export function weeklyManifestSha256(
  manifest: WeeklyForecastPublicationManifest,
): string {
  return canonicalForwardJsonSha256(manifest);
}

// ---------------------------------------------------------------------------
// Admission receipt — separate, hashed, binds to an exact manifest
// ---------------------------------------------------------------------------

export interface WeeklyAdmissionReceipt {
  artifact_type: typeof WEEKLY_ADMISSION_RECEIPT_ARTIFACT_TYPE;
  artifact_version: typeof WEEKLY_ADMISSION_RECEIPT_ARTIFACT_VERSION;
  document_kind: 'weekly_publication_admission_receipt';

  /** The publication this receipt admits, bound by identity *and* digest. */
  publication_id: string;
  manifest_sha256: string;
  player_rows_sha256: string;

  decided_by: string;
  decided_at: string;
  decision_ref: WeeklyEvidenceRef;
  admission_path: WeeklyAdmissionPath;
  in_season_gate_weakened: false;
  consumer_eligibility: 'eligible_admitted';
  limitations: readonly string[];
}

// ---------------------------------------------------------------------------
// Safe parsing of unknown input
// ---------------------------------------------------------------------------

export type WeeklyValidationErrorCode =
  | 'malformed_document'
  | 'wrong_artifact_type'
  | 'wrong_artifact_version'
  | 'target_not_single_week'
  | 'target_is_seasonal_total'
  | 'target_field_invalid'
  | 'cutoff_missing'
  | 'cutoff_not_canonical_utc'
  | 'generated_at_missing'
  | 'generated_at_not_canonical_utc'
  | 'generated_at_before_cutoff'
  | 'policy_input_rules_altered'
  | 'policy_prohibited_list_altered'
  | 'policy_seasonal_boundary_altered'
  | 'prohibited_input_class_admitted'
  | 'required_input_class_missing'
  | 'duplicate_input_id'
  | 'duplicate_input_class'
  | 'undeclared_input_id_referenced'
  | 'input_post_cutoff'
  | 'input_cutoff_unresolved'
  | 'input_cutoff_unverified'
  | 'input_source_as_of_invalid'
  | 'population_reconciliation_incomplete'
  | 'status_counts_mismatch'
  | 'identity_coverage_mismatch'
  | 'duplicate_population_row_id'
  | 'empty_rows_for_non_empty_census'
  | 'census_membership_unverified'
  | 'census_membership_mismatch'
  | 'identity_fuzzy_join_used'
  | 'identity_synthetic_namespace_used'
  | 'available_row_identity_unresolved'
  | 'available_row_point_forecast_invalid'
  | 'available_row_rank_invalid'
  | 'rank_not_unique'
  | 'rank_not_contiguous'
  | 'rank_ordering_violated'
  | 'available_row_missing_required_input'
  | 'fabricated_uncertainty'
  | 'actual_outcome_present_before_target_week'
  | 'rank_on_unavailable_row'
  | 'unavailable_row_missing_reason'
  | 'manifest_lifecycle_claims_eligibility'
  | 'example_marker_in_real_publication'
  | 'placeholder_hash_in_real_publication'
  | 'placeholder_commit_in_real_publication'
  | 'invalid_sha256'
  | 'player_rows_digest_mismatch';

export interface WeeklyValidationIssue {
  code: WeeklyValidationErrorCode;
  path: string;
  message: string;
}

export interface WeeklyParseSuccess<T> {
  ok: true;
  value: T;
}
export interface WeeklyParseFailure {
  ok: false;
  errors: readonly WeeklyValidationIssue[];
}
export type WeeklyParseResult<T> = WeeklyParseSuccess<T> | WeeklyParseFailure;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function issue(
  code: WeeklyValidationErrorCode,
  path: string,
  message: string,
): WeeklyValidationIssue {
  return { code, path, message };
}

/**
 * Structural parse of untrusted input.
 *
 * Never throws: malformed input returns typed errors. Deep field semantics are
 * checked by `validateWeeklyPublication`; this establishes only that the shape
 * can be walked safely.
 */
export function parseWeeklyPublicationManifest(
  input: unknown,
): WeeklyParseResult<WeeklyForecastPublicationManifest> {
  const errors: WeeklyValidationIssue[] = [];

  if (!isRecord(input)) {
    return { ok: false, errors: [issue('malformed_document', '', 'Document is not an object.')] };
  }
  if (input.artifact_type !== WEEKLY_PUBLICATION_ARTIFACT_TYPE) {
    errors.push(issue('wrong_artifact_type', 'artifact_type', 'Unexpected artifact_type.'));
  }
  if (
    input.artifact_version !== WEEKLY_PUBLICATION_ARTIFACT_VERSION &&
    input.artifact_version !== WEEKLY_PUBLICATION_SCHEMA_EXAMPLE_VERSION
  ) {
    errors.push(issue('wrong_artifact_version', 'artifact_version', 'Unexpected artifact_version.'));
  }

  const requiredObjects = [
    'target', 'scoring_profile', 'model', 'population_census',
    'population_reconciliation', 'identity_coverage', 'status_counts',
    'lifecycle', 'reliability_tracking', 'seasonal_candidate_boundary', 'digests',
  ];
  for (const key of requiredObjects) {
    if (!isRecord(input[key])) {
      errors.push(issue('malformed_document', key, `Missing or non-object "${key}".`));
    }
  }
  const requiredArrays = [
    'preseason_input_class_rules', 'prohibited_input_classes',
    'artifact_inputs', 'outputs', 'limitations',
  ];
  for (const key of requiredArrays) {
    if (!Array.isArray(input[key])) {
      errors.push(issue('malformed_document', key, `Missing or non-array "${key}".`));
    }
  }
  for (const key of ['publication_id', 'forecast_cutoff', 'generated_at']) {
    if (typeof input[key] !== 'string' || input[key] === '') {
      errors.push(issue('malformed_document', key, `Missing or non-string "${key}".`));
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: input as unknown as WeeklyForecastPublicationManifest };
}

/** Structural parse of an untrusted rows document. Never throws. */
export function parseWeeklyPlayerRows(
  input: unknown,
): WeeklyParseResult<readonly WeeklyPlayerRow[]> {
  if (!Array.isArray(input)) {
    return { ok: false, errors: [issue('malformed_document', '', 'Rows document is not an array.')] };
  }
  const errors: WeeklyValidationIssue[] = [];
  input.forEach((row, index) => {
    if (!isRecord(row)) {
      errors.push(issue('malformed_document', `[${index}]`, 'Row is not an object.'));
      return;
    }
    if (typeof row.population_row_id !== 'string' || row.population_row_id === '') {
      errors.push(issue('malformed_document', `[${index}].population_row_id`, 'Missing population_row_id.'));
    }
    if (typeof row.forecast_status !== 'string' ||
        !(WEEKLY_FORECAST_STATUSES as readonly string[]).includes(row.forecast_status)) {
      errors.push(issue('malformed_document', `[${index}].forecast_status`, 'Unknown forecast_status.'));
    }
    if (!isRecord(row.identity)) {
      errors.push(issue('malformed_document', `[${index}].identity`, 'Missing identity.'));
    }
    if (!isRecord(row.uncertainty)) {
      errors.push(issue('malformed_document', `[${index}].uncertainty`, 'Missing uncertainty.'));
    }
    if (!Array.isArray(row.input_ids_used)) {
      errors.push(issue('malformed_document', `[${index}].input_ids_used`, 'Missing input_ids_used.'));
    }
  });
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: input as readonly WeeklyPlayerRow[] };
}

/** Structural parse of an untrusted admission receipt. Never throws. */
export function parseWeeklyAdmissionReceipt(
  input: unknown,
): WeeklyParseResult<WeeklyAdmissionReceipt> {
  if (!isRecord(input)) {
    return { ok: false, errors: [issue('malformed_document', '', 'Receipt is not an object.')] };
  }
  const errors: WeeklyValidationIssue[] = [];
  if (input.artifact_type !== WEEKLY_ADMISSION_RECEIPT_ARTIFACT_TYPE) {
    errors.push(issue('wrong_artifact_type', 'artifact_type', 'Unexpected receipt artifact_type.'));
  }
  if (input.artifact_version !== WEEKLY_ADMISSION_RECEIPT_ARTIFACT_VERSION) {
    errors.push(issue('wrong_artifact_version', 'artifact_version', 'Unexpected receipt artifact_version.'));
  }
  for (const key of ['publication_id', 'manifest_sha256', 'player_rows_sha256', 'decided_by', 'decided_at']) {
    if (typeof input[key] !== 'string' || input[key] === '') {
      errors.push(issue('malformed_document', key, `Missing or non-string "${key}".`));
    }
  }
  if (!isRecord(input.decision_ref)) {
    errors.push(issue('malformed_document', 'decision_ref', 'Missing decision_ref.'));
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: input as unknown as WeeklyAdmissionReceipt };
}

// ---------------------------------------------------------------------------
// Verification context
// ---------------------------------------------------------------------------

/**
 * Evidence a validator cannot derive from the documents alone.
 *
 * Without a census context, exact one-to-one membership is **unproven** — a
 * census reference plus a self-declared `one_to_one_complete: true` is a claim,
 * not evidence. `validateWeeklyPublication` reports that as
 * `census_membership_unverified` and the consumer refuses admission.
 */
export interface WeeklyVerificationContext {
  census?: {
    census_sha256: string;
    population_row_ids: readonly string[];
  };
  /** Input ids whose record-level timestamps were verified against source bytes. */
  record_level_verified_input_ids?: readonly string[];
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface WeeklyValidationResult {
  validator_id: 'tiber-weekly-forecast-publication-validator';
  validator_version: '2.0.0';
  valid: boolean;
  promotion_authority: false;
  /** True when the document is a schema example rather than a real publication. */
  is_schema_example: boolean;
  errors: readonly WeeklyValidationIssue[];
}

function collectStrings(value: unknown, out: string[], depth = 0): void {
  if (depth > 12) return;
  if (typeof value === 'string') { out.push(value); return; }
  if (Array.isArray(value)) { for (const item of value) collectStrings(item, out, depth + 1); return; }
  if (isRecord(value)) { for (const item of Object.values(value)) collectStrings(item, out, depth + 1); }
}

function isCanonicalUtc(value: unknown): value is string {
  return typeof value === 'string' && WEEKLY_UTC_INSTANT_PATTERN.test(value) &&
    !Number.isNaN(new Date(value).getTime());
}

/**
 * Full semantic validation.
 *
 * Recomputes everything it can from the supplied rows rather than trusting the
 * manifest's own summary fields.
 */
export function validateWeeklyPublication(
  manifest: WeeklyForecastPublicationManifest,
  rows: readonly WeeklyPlayerRow[],
  context: WeeklyVerificationContext = {},
): WeeklyValidationResult {
  const errors: WeeklyValidationIssue[] = [];
  const fail = (code: WeeklyValidationErrorCode, path: string, message: string) =>
    errors.push(issue(code, path, message));

  const isExample = manifest.artifact_version === WEEKLY_PUBLICATION_SCHEMA_EXAMPLE_VERSION;

  // --- target -------------------------------------------------------------
  const target = manifest.target;
  if (target?.target_kind !== 'single_scoring_week') {
    fail('target_not_single_week', 'target.target_kind', 'Target must be a single scoring week.');
  }
  if (target?.is_seasonal_total !== false) {
    fail('target_is_seasonal_total', 'target.is_seasonal_total', 'A seasonal total may not be published as weekly output.');
  }
  if (!Number.isInteger(target?.target_season) || !Number.isInteger(target?.target_week) || target.target_week < 1) {
    fail('target_field_invalid', 'target', 'target_season and target_week must be positive integers.');
  }
  if (target?.rank_basis !== WEEKLY_RANK_BASIS) {
    fail('target_field_invalid', 'target.rank_basis', 'Unexpected rank_basis.');
  }
  if (target?.rank_ordering_rule !== WEEKLY_RANK_ORDERING_RULE) {
    fail('target_field_invalid', 'target.rank_ordering_rule', 'Unexpected rank_ordering_rule.');
  }

  // --- timestamps ---------------------------------------------------------
  if (!manifest.forecast_cutoff) fail('cutoff_missing', 'forecast_cutoff', 'forecast_cutoff is required.');
  else if (!isCanonicalUtc(manifest.forecast_cutoff)) {
    fail('cutoff_not_canonical_utc', 'forecast_cutoff', 'forecast_cutoff must be a canonical UTC instant.');
  }
  if (!manifest.generated_at) fail('generated_at_missing', 'generated_at', 'generated_at is required.');
  else if (!isCanonicalUtc(manifest.generated_at)) {
    fail('generated_at_not_canonical_utc', 'generated_at', 'generated_at must be a canonical UTC instant.');
  }
  if (isCanonicalUtc(manifest.forecast_cutoff) && isCanonicalUtc(manifest.generated_at)) {
    if (new Date(manifest.generated_at).getTime() < new Date(manifest.forecast_cutoff).getTime()) {
      fail('generated_at_before_cutoff', 'generated_at', 'generated_at must be at or after forecast_cutoff.');
    }
  }

  // --- canonical policy cannot be weakened by the document -----------------
  const declaredRules = manifest.preseason_input_class_rules ?? [];
  const canonicalRuleJson = canonicalForwardJsonSha256(WEEKLY_CANONICAL_INPUT_CLASS_RULES);
  if (canonicalForwardJsonSha256(declaredRules) !== canonicalRuleJson) {
    fail('policy_input_rules_altered', 'preseason_input_class_rules',
      'Declared input-class rules differ from the canonical policy.');
  }
  const declaredProhibited = manifest.prohibited_input_classes ?? [];
  if (
    canonicalForwardJsonSha256(declaredProhibited) !==
    canonicalForwardJsonSha256(WEEKLY_PROHIBITED_PRESEASON_INPUT_CLASSES)
  ) {
    fail('policy_prohibited_list_altered', 'prohibited_input_classes',
      'Declared prohibited-input list differs from the canonical policy.');
  }
  if (
    canonicalForwardJsonSha256(manifest.seasonal_candidate_boundary) !==
    canonicalForwardJsonSha256(WEEKLY_SEASONAL_CANDIDATE_BOUNDARY)
  ) {
    fail('policy_seasonal_boundary_altered', 'seasonal_candidate_boundary',
      'Declared seasonal-candidate boundary differs from the canonical policy.');
  }

  // --- inputs -------------------------------------------------------------
  const inputs = manifest.artifact_inputs ?? [];
  const seenInputIds = new Set<string>();
  const seenInputClasses = new Set<string>();
  const cutoffMs = isCanonicalUtc(manifest.forecast_cutoff)
    ? new Date(manifest.forecast_cutoff).getTime()
    : null;
  const verifiedIds = new Set(context.record_level_verified_input_ids ?? []);

  inputs.forEach((input, index) => {
    const at = `artifact_inputs[${index}]`;
    if (seenInputIds.has(input.input_id)) {
      fail('duplicate_input_id', at, `Duplicate input_id "${input.input_id}".`);
    }
    seenInputIds.add(input.input_id);

    if (seenInputClasses.has(input.input_class)) {
      fail('duplicate_input_class', at, `Duplicate input_class "${input.input_class}".`);
    }
    seenInputClasses.add(input.input_class);

    if ((WEEKLY_PROHIBITED_PRESEASON_INPUT_CLASSES as readonly string[]).includes(input.input_class)) {
      fail('prohibited_input_class_admitted', at, `Input class ${input.input_class} is prohibited before kickoff.`);
    }

    // Local cutoff check — the producer's own status is not sufficient.
    if (!isCanonicalUtc(input.source_as_of)) {
      fail('input_source_as_of_invalid', `${at}.source_as_of`, 'source_as_of must be a canonical UTC instant.');
    } else if (cutoffMs !== null && new Date(input.source_as_of).getTime() > cutoffMs) {
      fail('input_post_cutoff', `${at}.source_as_of`,
        `source_as_of ${input.source_as_of} is after forecast_cutoff ${manifest.forecast_cutoff}.`);
    }

    const evidence = input.cutoff_evidence;
    if (evidence?.record_count_post_cutoff > 0) {
      fail('input_post_cutoff', `${at}.cutoff_evidence`, 'Input admits records after the declared cutoff.');
    }
    if (evidence?.record_count_unresolved > 0 || evidence?.self_reported_status === 'unresolved') {
      fail('input_cutoff_unresolved', `${at}.cutoff_evidence`, 'Input has unresolved availability evidence.');
    }
    if (evidence?.self_reported_status === 'ineligible_after_cutoff') {
      fail('input_post_cutoff', `${at}.cutoff_evidence`, 'Producer reports the input ineligible after cutoff.');
    }
    // Record-level verification is only real when a context vouches for it.
    if (
      evidence?.record_level_verification === 'locally_verified' &&
      !verifiedIds.has(input.input_id)
    ) {
      fail('input_cutoff_unverified', `${at}.cutoff_evidence.record_level_verification`,
        'Record-level verification is claimed but no verification context vouches for this input.');
    }
  });

  // Required classes must actually be present as inputs.
  for (const required of WEEKLY_REQUIRED_INPUT_CLASSES) {
    if (!seenInputClasses.has(required)) {
      fail('required_input_class_missing', 'artifact_inputs',
        `Required input class "${required}" has no artifact input.`);
    }
  }

  // --- rows: recompute rather than trust ----------------------------------
  const censusRowCount = manifest.population_census?.row_count ?? 0;

  if (rows.length === 0 && censusRowCount > 0) {
    fail('empty_rows_for_non_empty_census', 'rows',
      `Manifest claims a census of ${censusRowCount} rows but no rows were supplied.`);
  }

  const rowIdCounts = new Map<string, number>();
  for (const row of rows) {
    rowIdCounts.set(row.population_row_id, (rowIdCounts.get(row.population_row_id) ?? 0) + 1);
  }
  const duplicateRowIds = Array.from(rowIdCounts.entries()).filter(([, n]) => n > 1).map(([id]) => id);
  for (const id of duplicateRowIds) {
    fail('duplicate_population_row_id', 'rows', `Duplicate population_row_id "${id}".`);
  }

  // Recomputed status counts.
  const recomputedStatusCounts = Object.fromEntries(
    WEEKLY_FORECAST_STATUSES.map((status) => [status, 0]),
  ) as WeeklyStatusCounts;
  for (const row of rows) recomputedStatusCounts[row.forecast_status] += 1;
  if (
    canonicalForwardJsonSha256(recomputedStatusCounts) !==
    canonicalForwardJsonSha256(manifest.status_counts)
  ) {
    fail('status_counts_mismatch', 'status_counts',
      'Declared status counts do not match the counts recomputed from rows.');
  }

  // Recomputed identity coverage.
  const resolvedRows = rows.filter((r) => r.identity?.identity_status === 'resolved');
  const unresolvedRows = rows.filter((r) => r.identity?.identity_status === 'unresolved');
  const conflictingRows = rows.filter((r) => r.identity?.identity_status === 'conflicting');
  const recomputedCoverage: WeeklyIdentityCoverage = {
    census_row_count: rows.length,
    resolved_count: resolvedRows.length,
    unresolved_count: unresolvedRows.length,
    conflicting_count: conflictingRows.length,
    coverage_rate: rows.length === 0 ? 0 : resolvedRows.length / rows.length,
    unresolved_population_row_ids: unresolvedRows.map((r) => r.population_row_id),
    conflicting_population_row_ids: conflictingRows.map((r) => r.population_row_id),
  };
  if (
    canonicalForwardJsonSha256(recomputedCoverage) !==
    canonicalForwardJsonSha256(manifest.identity_coverage)
  ) {
    fail('identity_coverage_mismatch', 'identity_coverage',
      'Declared identity coverage does not match the coverage recomputed from rows.');
  }

  // Reconciliation recomputed against the rows actually supplied.
  const reconciliation = manifest.population_reconciliation;
  if (
    !reconciliation?.one_to_one_complete ||
    reconciliation.duplicate_population_row_ids.length > 0 ||
    reconciliation.missing_population_row_ids.length > 0 ||
    reconciliation.extra_population_row_ids.length > 0 ||
    reconciliation.output_row_count !== rows.length ||
    rows.length !== censusRowCount ||
    duplicateRowIds.length > 0
  ) {
    fail('population_reconciliation_incomplete', 'population_reconciliation',
      'Every census row must map to exactly one output row or typed unavailable status.');
  }

  // Exact membership needs the census itself.
  if (!context.census) {
    fail('census_membership_unverified', 'population_census',
      'Census membership cannot be verified from a reference alone; supply verified census evidence.');
  } else {
    if (context.census.census_sha256 !== manifest.population_census.census_sha256) {
      fail('census_membership_mismatch', 'population_census.census_sha256',
        'Verification context census digest does not match the manifest.');
    }
    const censusIds = new Set(context.census.population_row_ids);
    const rowIds = new Set(rows.map((r) => r.population_row_id));
    const missing = context.census.population_row_ids.filter((id) => !rowIds.has(id));
    const extra = Array.from(rowIds).filter((id) => !censusIds.has(id));
    if (missing.length > 0 || extra.length > 0) {
      fail('census_membership_mismatch', 'rows',
        `Rows do not match census membership (missing ${missing.length}, extra ${extra.length}).`);
    }
  }

  // --- per-row semantics --------------------------------------------------
  const declaredInputIds = new Set(inputs.map((i) => i.input_id));
  const requiredInputIds = new Set(
    inputs.filter((i) => (WEEKLY_REQUIRED_INPUT_CLASSES as readonly string[]).includes(i.input_class))
      .map((i) => i.input_id),
  );
  const availableRows: WeeklyAvailablePlayerRow[] = [];

  rows.forEach((row, index) => {
    const at = `rows[${index}]`;
    if (row.identity?.fuzzy_join_used !== false) {
      fail('identity_fuzzy_join_used', `${at}.identity`, 'Fuzzy identity joining is not permitted.');
    }
    if (row.identity?.synthetic_namespace_used !== false) {
      fail('identity_synthetic_namespace_used', `${at}.identity`, 'Synthetic identifier namespaces are not permitted.');
    }
    if (row.actual_outcome !== null) {
      fail('actual_outcome_present_before_target_week', `${at}.actual_outcome`,
        'actual_outcome must be null before the target week is played.');
    }
    if (row.uncertainty?.status === 'unavailable_not_calibrated') {
      const u = row.uncertainty;
      if (u.lower_quantile !== null || u.median !== null || u.upper_quantile !== null ||
          u.interval_lower !== null || u.interval_upper !== null || u.method_id !== null) {
        fail('fabricated_uncertainty', `${at}.uncertainty`, 'Range fields must be null when uncertainty is not calibrated.');
      }
    }
    for (const id of row.input_ids_used ?? []) {
      if (!declaredInputIds.has(id)) {
        fail('undeclared_input_id_referenced', `${at}.input_ids_used`,
          `Row references undeclared input id "${id}".`);
      }
    }

    if (row.forecast_status === 'forecast_available') {
      const available = row as WeeklyAvailablePlayerRow;
      availableRows.push(available);
      if (!available.identity?.canonical_player_id || available.identity.identity_status !== 'resolved') {
        fail('available_row_identity_unresolved', `${at}.identity`,
          'An available forecast requires a resolved canonical identity.');
      }
      if (typeof available.point_forecast !== 'number' || !Number.isFinite(available.point_forecast)) {
        fail('available_row_point_forecast_invalid', `${at}.point_forecast`, 'Point forecast must be finite.');
      }
      if (!Number.isInteger(available.rank) || available.rank < 1) {
        fail('available_row_rank_invalid', `${at}.rank`, 'Rank must be a positive integer.');
      }
      for (const requiredId of requiredInputIds) {
        if (!(available.input_ids_used ?? []).includes(requiredId)) {
          fail('available_row_missing_required_input', `${at}.input_ids_used`,
            `An available forecast must use required input "${requiredId}".`);
        }
      }
    } else {
      if (row.rank !== null || row.point_forecast !== null) {
        fail('rank_on_unavailable_row', at, 'An unavailable row may not carry a rank or a point forecast.');
      }
      if (!Array.isArray(row.status_reasons) || row.status_reasons.length === 0) {
        fail('unavailable_row_missing_reason', `${at}.status_reasons`,
          'An unavailable row requires at least one typed reason.');
      }
    }
  });

  // Ranks: unique, contiguous 1..N, and consistent with the documented ordering.
  const ranks = availableRows.map((r) => r.rank).filter((r) => Number.isInteger(r) && r >= 1);
  if (new Set(ranks).size !== ranks.length) {
    fail('rank_not_unique', 'rows', 'Ranks must be unique among available rows.');
  }
  if (ranks.length === availableRows.length && availableRows.length > 0) {
    const sorted = [...ranks].sort((a, b) => a - b);
    const contiguous = sorted.every((rank, index) => rank === index + 1);
    if (!contiguous) {
      fail('rank_not_contiguous', 'rows', 'Ranks must be contiguous 1..N over available rows.');
    } else {
      const expected = [...availableRows].sort((a, b) => {
        if (b.point_forecast !== a.point_forecast) return b.point_forecast - a.point_forecast;
        return a.identity.canonical_player_id.localeCompare(b.identity.canonical_player_id);
      });
      expected.forEach((row, index) => {
        if (row.rank !== index + 1) {
          fail('rank_ordering_violated', 'rows',
            `Rank ${row.rank} violates ${WEEKLY_RANK_ORDERING_RULE}; expected ${index + 1}.`);
        }
      });
    }
  }

  // --- lifecycle ----------------------------------------------------------
  if (manifest.lifecycle?.consumer_eligibility !== WEEKLY_DEFAULT_CONSUMER_ELIGIBILITY) {
    fail('manifest_lifecycle_claims_eligibility', 'lifecycle.consumer_eligibility',
      'A manifest may never self-declare consumer eligibility; admission requires a receipt.');
  }
  if (!(WEEKLY_MANIFEST_LIFECYCLE_STATES as readonly string[]).includes(manifest.lifecycle?.state)) {
    fail('manifest_lifecycle_claims_eligibility', 'lifecycle.state',
      'A manifest may only declare draft or candidate.');
  }

  // --- digests ------------------------------------------------------------
  const recomputedRowsDigest = canonicalForwardJsonSha256(rows);
  if (manifest.digests?.player_rows_sha256 !== recomputedRowsDigest) {
    fail('player_rows_digest_mismatch', 'digests.player_rows_sha256',
      'Declared player-rows digest does not match the supplied rows.');
  }

  // --- example vs real ----------------------------------------------------
  if (!isExample) {
    const strings: string[] = [];
    collectStrings(manifest, strings);
    collectStrings(rows, strings);
    for (const value of strings) {
      const lower = value.toLowerCase();
      for (const marker of WEEKLY_EXAMPLE_MARKERS) {
        if (lower.includes(marker)) {
          fail('example_marker_in_real_publication', 'manifest',
            `A real publication may not contain example/placeholder marker "${marker}" (found in "${value.slice(0, 60)}").`);
          break;
        }
      }
      if (WEEKLY_PLACEHOLDER_HASH_PATTERN.test(value)) {
        fail('placeholder_hash_in_real_publication', 'manifest',
          'A real publication may not carry a placeholder hash.');
      }
    }
    const hashFields: Array<[string, string | null | undefined]> = [
      ['population_census.census_sha256', manifest.population_census?.census_sha256],
      ['model.configuration_sha256', manifest.model?.configuration_sha256],
      ['model.feature_configuration_sha256', manifest.model?.feature_configuration_sha256],
      ['digests.player_rows_sha256', manifest.digests?.player_rows_sha256],
    ];
    for (const [path, value] of hashFields) {
      if (typeof value !== 'string' || !WEEKLY_SHA256_PATTERN.test(value)) {
        fail('invalid_sha256', path, 'Expected a lowercase 64-character SHA-256.');
      }
    }
    for (const [index, input] of inputs.entries()) {
      if (!WEEKLY_COMMIT_SHA_PATTERN.test(input.owner_commit_sha) ||
          /^0{40}$/.test(input.owner_commit_sha)) {
        fail('placeholder_commit_in_real_publication', `artifact_inputs[${index}].owner_commit_sha`,
          'A real publication requires a genuine 40-character owner commit SHA.');
      }
    }
  }

  return {
    validator_id: 'tiber-weekly-forecast-publication-validator',
    validator_version: '2.0.0',
    valid: errors.length === 0,
    promotion_authority: false,
    is_schema_example: isExample,
    errors,
  };
}

// ---------------------------------------------------------------------------
// Discriminants
// ---------------------------------------------------------------------------

export function isWeeklySchemaExampleDocument(value: unknown): boolean {
  return isRecord(value) &&
    value.artifact_type === WEEKLY_PUBLICATION_ARTIFACT_TYPE &&
    value.artifact_version === WEEKLY_PUBLICATION_SCHEMA_EXAMPLE_VERSION;
}

export function isWeeklyPublicationDocument(value: unknown): boolean {
  return isRecord(value) &&
    value.artifact_type === WEEKLY_PUBLICATION_ARTIFACT_TYPE &&
    value.artifact_version === WEEKLY_PUBLICATION_ARTIFACT_VERSION;
}

// ---------------------------------------------------------------------------
// Consumer admission seam
// ---------------------------------------------------------------------------

export type WeeklyAdmissionDecision =
  | {
      admit: true;
      source: 'forecast_weekly_publication';
      publication_id: string;
      manifest_sha256: string;
      available_row_count: number;
    }
  | { admit: false; source: null; reason: string; errors: readonly WeeklyValidationIssue[] };

/**
 * The decision TIBER-Fantasy must make, from untrusted bytes.
 *
 * Accepts `unknown` for all three documents. Any refusal yields `source: null`
 * — there is deliberately **no FORGE fallback here**; an unavailable Forecast
 * publication produces an explicit unavailable state and the consumer decides
 * what to render.
 */
export function admitWeeklyPublication(
  manifestInput: unknown,
  rowsInput: unknown,
  receiptInput: unknown,
  context: WeeklyVerificationContext = {},
): WeeklyAdmissionDecision {
  const refuse = (reason: string, errors: readonly WeeklyValidationIssue[] = []) =>
    ({ admit: false as const, source: null, reason, errors });

  const parsedManifest = parseWeeklyPublicationManifest(manifestInput);
  if (!parsedManifest.ok) return refuse('manifest_malformed', parsedManifest.errors);

  const parsedRows = parseWeeklyPlayerRows(rowsInput);
  if (!parsedRows.ok) return refuse('rows_malformed', parsedRows.errors);

  const manifest = parsedManifest.value;
  const rows = parsedRows.value;

  if (isWeeklySchemaExampleDocument(manifest)) {
    return refuse('schema_example_not_a_publication');
  }
  if (!isWeeklyPublicationDocument(manifest)) {
    return refuse('unrecognised_artifact');
  }

  const validation = validateWeeklyPublication(manifest, rows, context);
  if (!validation.valid) return refuse('contract_invalid', validation.errors);

  const parsedReceipt = parseWeeklyAdmissionReceipt(receiptInput);
  if (!parsedReceipt.ok) return refuse('admission_receipt_missing_or_malformed', parsedReceipt.errors);
  const receipt = parsedReceipt.value;

  if (receipt.consumer_eligibility !== 'eligible_admitted') return refuse('receipt_not_eligible');
  if (receipt.admission_path !== 'governed_preseason_publication') return refuse('receipt_wrong_admission_path');
  if (receipt.in_season_gate_weakened !== false) return refuse('receipt_weakened_in_season_gate');
  if (receipt.publication_id !== manifest.publication_id) return refuse('receipt_publication_id_mismatch');

  // The binding: the receipt admits exactly these bytes and no others.
  const manifestDigest = weeklyManifestSha256(manifest);
  if (receipt.manifest_sha256 !== manifestDigest) return refuse('receipt_manifest_digest_mismatch');
  if (receipt.player_rows_sha256 !== canonicalForwardJsonSha256(rows)) {
    return refuse('receipt_rows_digest_mismatch');
  }

  return {
    admit: true,
    source: 'forecast_weekly_publication',
    publication_id: manifest.publication_id,
    manifest_sha256: manifestDigest,
    available_row_count: rows.filter((r) => r.forecast_status === 'forecast_available').length,
  };
}
