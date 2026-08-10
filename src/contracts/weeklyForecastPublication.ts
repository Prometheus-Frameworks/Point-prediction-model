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
 * Admission is therefore a **separate, content-addressed receipt**
 * (`WeeklyAdmissionReceipt`) that binds to an exact `manifest_sha256`. The
 * consumer must independently pin the digest of that whole receipt plus its
 * authority/decision identity through `WeeklyTrustedAdmissionBinding`; receipt
 * bytes cannot establish their own authority. This mirrors the house pattern
 * established by the Forward Run 1 binding on `main`
 * (`src/experiments/forwardRun1/forwardRun1AdmissionBinding.ts`).
 *
 * Consequences, all enforced:
 *   - a manifest may declare `draft` or `candidate` only, never eligibility;
 *   - a receipt is valid only against the manifest digest it names and an
 *     independently configured expected receipt digest;
 *   - mutating a manifest, row, score, or receipt breaks the unchanged trust
 *     binding and the consumer refuses.
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

import {
  canonicalForwardJsonSha256,
  compareForwardCanonicalStrings,
} from '../serialization/canonicalForwardArtifacts.js';
import {
  TIBER_GENERIC_FULL_PPR_V1,
  TIBER_GENERIC_FULL_PPR_V1_PROFILE_ID,
  TIBER_GENERIC_FULL_PPR_V1_PROFILE_VERSION,
  TIBER_GENERIC_FULL_PPR_V1_SHA256,
  type GenericFullPprProfileV1,
  type ScoringReconciliationEvidenceRef,
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
export const WEEKLY_TARGET_SEASON = 2026 as const;
export const WEEKLY_TARGET_WEEK = 1 as const;

/**
 * Contract-owned pre-kickoff deadline for the 2026 Week 1 publication.
 *
 * The entire `governed_preseason_publication` path assumes every fact backing
 * the forecast was knowable before Week 1 began. Prohibiting in-season input
 * *classes* is not sufficient on its own: without a declared ceiling, a
 * document could move its `forecast_cutoff`, census `effective_at`, input
 * evidence and `generated_at` into the regular season, keep every class label
 * legal, and still be admitted through the preseason path — carrying exactly
 * the information the prohibited-class list exists to keep out.
 *
 * This is a policy boundary owned by this contract, **not** an ingested
 * schedule. A real publication whose governed schedule disagrees must amend
 * this constant deliberately; it may not declare its own deadline.
 */
export const WEEKLY_WEEK1_PREKICKOFF_DEADLINE_UTC = '2026-09-10T20:00:00.000Z' as const;
export const WEEKLY_FORECAST_REPOSITORY =
  'Prometheus-Frameworks/TIBER-Forecast' as const;
/**
 * The only repository whose census may bound this publication's population.
 * TIBER-Data owns census semantics; a population sourced from anywhere else —
 * including this repository — is not a governed census.
 */
export const WEEKLY_GOVERNED_CENSUS_OWNER =
  'Prometheus-Frameworks/TIBER-Data' as const;
export const WEEKLY_INPUT_NORMALIZATION_RULE_ID = 'utc-instant-v1' as const;

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
  normalization_rule_id: typeof WEEKLY_INPUT_NORMALIZATION_RULE_ID;
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
      normalization_rule_id: WEEKLY_INPUT_NORMALIZATION_RULE_ID,
      required: true,
      notes: 'Realized prior-season weekly PPR outcomes. Never current season.',
    },
    {
      input_class: 'prior_season_usage_and_role',
      availability_rule_id: 'prior_season_final_and_governed',
      source_timestamp_locator: 'artifact.source_as_of',
      owner_repository: 'Prometheus-Frameworks/TIBER-Data',
      normalization_rule_id: WEEKLY_INPUT_NORMALIZATION_RULE_ID,
      required: true,
      notes: 'Prior-season usage/role aggregates.',
    },
    {
      input_class: 'depth_chart_and_role_priors',
      availability_rule_id: 'state_effective_at_or_before_cutoff',
      source_timestamp_locator: 'record.effective_at',
      owner_repository: 'Prometheus-Frameworks/TIBER-Data',
      normalization_rule_id: WEEKLY_INPUT_NORMALIZATION_RULE_ID,
      required: false,
      notes: 'Preseason depth-chart state as of the cutoff.',
    },
    {
      input_class: 'roster_and_team_assignment_state',
      availability_rule_id: 'state_effective_at_or_before_cutoff',
      source_timestamp_locator: 'record.effective_at',
      owner_repository: 'Prometheus-Frameworks/TIBER-Data',
      normalization_rule_id: WEEKLY_INPUT_NORMALIZATION_RULE_ID,
      required: true,
      notes: 'Team assignment / free-agency state.',
    },
    {
      input_class: 'schedule_and_opponent_context',
      availability_rule_id: 'published_at_or_before_cutoff',
      source_timestamp_locator: 'artifact.published_at',
      owner_repository: 'Prometheus-Frameworks/TIBER-Data',
      normalization_rule_id: WEEKLY_INPUT_NORMALIZATION_RULE_ID,
      required: false,
      notes: 'Week 1 opponent context from the published schedule.',
    },
    {
      input_class: 'player_availability_status',
      availability_rule_id: 'state_effective_at_or_before_cutoff',
      source_timestamp_locator: 'record.effective_at',
      owner_repository: 'Prometheus-Frameworks/TIBER-Data',
      normalization_rule_id: WEEKLY_INPUT_NORMALIZATION_RULE_ID,
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
 * bytes. `unverified_requires_source_bytes` is the honest example default and
 * always blocks a real publication. A real document must declare
 * `locally_verified` and the verification context must independently bind the
 * exact source bytes and evidence artifact.
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
  implementation_repository: typeof WEEKLY_FORECAST_REPOSITORY;
  implementation_commit_sha: string;
  /** SHA-256 of the exact commit object or an independently archived code bundle. */
  implementation_commit_evidence_sha256: string;
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

  /** Must match a consumer-configured authority binding, not caller input. */
  authority_id: string;
  authority_repository: string;
  decided_by: string;
  decided_at: string;
  decision_ref: WeeklyDecisionRef;
  admission_path: WeeklyAdmissionPath;
  in_season_gate_weakened: false;
  consumer_eligibility: 'eligible_admitted';
  limitations: readonly string[];
}

/** A durable, content-addressed operator decision. Null hashes are forbidden. */
export interface WeeklyDecisionRef {
  input_id: null;
  uri_or_path: string;
  content_sha256: string;
  record_id: string;
}

/** Digest of the whole, non-self-referential admission receipt. */
export function weeklyAdmissionReceiptSha256(receipt: WeeklyAdmissionReceipt): string {
  return canonicalForwardJsonSha256(receipt);
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
  | 'cutoff_after_prekickoff_deadline'
  | 'generated_at_after_prekickoff_deadline'
  | 'policy_input_rules_altered'
  | 'policy_prohibited_list_altered'
  | 'policy_seasonal_boundary_altered'
  | 'prohibited_input_class_admitted'
  | 'required_input_class_missing'
  | 'duplicate_input_id'
  | 'duplicate_input_class'
  | 'input_class_not_canonical'
  | 'input_rule_mismatch'
  | 'undeclared_input_id_referenced'
  | 'input_post_cutoff'
  | 'input_cutoff_unresolved'
  | 'input_cutoff_unverified'
  | 'input_source_as_of_invalid'
  | 'input_verification_binding_mismatch'
  | 'input_verification_artifact_invalid'
  | 'census_effective_at_invalid'
  | 'census_post_cutoff'
  | 'population_reconciliation_incomplete'
  | 'status_counts_mismatch'
  | 'identity_coverage_mismatch'
  | 'duplicate_population_row_id'
  | 'empty_rows_for_non_empty_census'
  | 'census_membership_unverified'
  | 'census_provenance_ungoverned'
  | 'calibrated_uncertainty_unsupported'
  | 'identity_evidence_unbound'
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
  | 'uncertainty_contract_mismatch'
  | 'actual_outcome_present_before_target_week'
  | 'rank_on_unavailable_row'
  | 'unavailable_row_missing_reason'
  | 'manifest_lifecycle_claims_eligibility'
  | 'manifest_identity_invalid'
  | 'scoring_profile_mismatch'
  | 'scoring_reconciliation_invalid'
  | 'model_identity_invalid'
  | 'output_binding_invalid'
  | 'serializer_identity_invalid'
  | 'reliability_contract_invalid'
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

const malformed = (
  errors: WeeklyValidationIssue[],
  path: string,
  message: string,
): void => {
  errors.push(issue('malformed_document', path, message));
};

function expectRecord(
  value: unknown,
  path: string,
  errors: WeeklyValidationIssue[],
): Record<string, unknown> | null {
  if (!isRecord(value)) {
    malformed(errors, path, 'Expected an object.');
    return null;
  }
  return value;
}

function expectString(
  value: unknown,
  path: string,
  errors: WeeklyValidationIssue[],
  nullable = false,
): void {
  if ((nullable && value === null) || (typeof value === 'string' && value.length > 0)) return;
  malformed(errors, path, nullable ? 'Expected a non-empty string or null.' : 'Expected a non-empty string.');
}

function expectBoolean(value: unknown, path: string, errors: WeeklyValidationIssue[]): void {
  if (typeof value !== 'boolean') malformed(errors, path, 'Expected a boolean.');
}

function expectNumber(value: unknown, path: string, errors: WeeklyValidationIssue[]): void {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    malformed(errors, path, 'Expected a finite number.');
  }
}

function expectNullableNumber(value: unknown, path: string, errors: WeeklyValidationIssue[]): void {
  if (value !== null) expectNumber(value, path, errors);
}

function expectArray(
  value: unknown,
  path: string,
  errors: WeeklyValidationIssue[],
  item: (entry: unknown, entryPath: string, errors: WeeklyValidationIssue[]) => void,
): void {
  if (!Array.isArray(value)) {
    malformed(errors, path, 'Expected an array.');
    return;
  }
  value.forEach((entry, index) => item(entry, `${path}[${index}]`, errors));
}

const expectStringItem = (value: unknown, path: string, errors: WeeklyValidationIssue[]): void =>
  expectString(value, path, errors);

function parseEvidenceRefShape(
  value: unknown,
  path: string,
  errors: WeeklyValidationIssue[],
): void {
  const ref = expectRecord(value, path, errors);
  if (!ref) return;
  expectString(ref.input_id, `${path}.input_id`, errors, true);
  expectString(ref.uri_or_path, `${path}.uri_or_path`, errors);
  expectString(ref.content_sha256, `${path}.content_sha256`, errors, true);
  expectString(ref.record_id, `${path}.record_id`, errors, true);
}

function parseContentRefShape(
  value: unknown,
  path: string,
  errors: WeeklyValidationIssue[],
): void {
  const ref = expectRecord(value, path, errors);
  if (!ref) return;
  expectString(ref.artifact_type, `${path}.artifact_type`, errors);
  expectString(ref.artifact_version, `${path}.artifact_version`, errors);
  expectString(ref.uri_or_path, `${path}.uri_or_path`, errors);
  expectString(ref.content_sha256, `${path}.content_sha256`, errors);
}

function parseInputRuleShape(
  value: unknown,
  path: string,
  errors: WeeklyValidationIssue[],
): void {
  const rule = expectRecord(value, path, errors);
  if (!rule) return;
  for (const key of [
    'input_class', 'availability_rule_id', 'source_timestamp_locator',
    'owner_repository', 'normalization_rule_id', 'notes',
  ]) expectString(rule[key], `${path}.${key}`, errors);
  expectBoolean(rule.required, `${path}.required`, errors);
}

function parseArtifactInputShape(
  value: unknown,
  path: string,
  errors: WeeklyValidationIssue[],
): void {
  const input = expectRecord(value, path, errors);
  if (!input) return;
  for (const key of [
    'input_id', 'input_class', 'owner_repository', 'owner_commit_sha',
    'artifact_type', 'artifact_version', 'uri_or_path', 'content_sha256',
    'availability_rule_id',
  ]) expectString(input[key], `${path}.${key}`, errors);
  expectString(input.source_as_of, `${path}.source_as_of`, errors, true);
  expectArray(input.limitations, `${path}.limitations`, errors, expectStringItem);
  const cutoff = expectRecord(input.cutoff_evidence, `${path}.cutoff_evidence`, errors);
  if (!cutoff) return;
  for (const key of [
    'source_timestamp_locator', 'normalization_rule_id', 'self_reported_status',
    'record_level_verification',
  ]) expectString(cutoff[key], `${path}.cutoff_evidence.${key}`, errors);
  if (
    typeof cutoff.self_reported_status === 'string' &&
    !['eligible', 'ineligible_after_cutoff', 'unresolved'].includes(
      cutoff.self_reported_status,
    )
  ) malformed(errors, `${path}.cutoff_evidence.self_reported_status`, 'Unknown cutoff status.');
  if (
    typeof cutoff.record_level_verification === 'string' &&
    !['locally_verified', 'unverified_requires_source_bytes'].includes(
      cutoff.record_level_verification,
    )
  ) malformed(errors, `${path}.cutoff_evidence.record_level_verification`,
    'Unknown record-level verification status.');
  for (const key of [
    'record_count_eligible', 'record_count_post_cutoff', 'record_count_unresolved',
  ]) expectNumber(cutoff[key], `${path}.cutoff_evidence.${key}`, errors);
}

function parseScoringProfileShape(
  value: unknown,
  path: string,
  errors: WeeklyValidationIssue[],
): void {
  const profile = expectRecord(value, path, errors);
  if (!profile) return;
  for (const key of ['profile_id', 'profile_version', 'profile_sha256']) {
    expectString(profile[key], `${path}.${key}`, errors);
  }
  expectBoolean(profile.league_specific, `${path}.league_specific`, errors);
  expectBoolean(profile.regular_season_only, `${path}.regular_season_only`, errors);
  const weights = expectRecord(profile.weights, `${path}.weights`, errors);
  if (weights) {
    for (const key of [
      'reception', 'receiving_yard', 'receiving_touchdown', 'rushing_yard',
      'rushing_touchdown', 'passing_yard', 'passing_touchdown', 'interception',
    ]) expectNumber(weights[key], `${path}.weights.${key}`, errors);
  }
  expectArray(profile.bonuses, `${path}.bonuses`, errors, () => undefined);
  expectArray(profile.supported_positions, `${path}.supported_positions`, errors, expectStringItem);
  expectArray(profile.unsupported_domains, `${path}.unsupported_domains`, errors, expectStringItem);
  const reconciliation = expectRecord(
    profile.source_reconciliation,
    `${path}.source_reconciliation`,
    errors,
  );
  if (!reconciliation) return;
  for (const key of ['status', 'validator_id', 'validator_version', 'scoring_profile_sha256']) {
    expectString(reconciliation[key], `${path}.source_reconciliation.${key}`, errors);
  }
  const evidenceRefPath = `${path}.source_reconciliation.evidence_ref`;
  const evidenceRef = expectRecord(reconciliation.evidence_ref, evidenceRefPath, errors);
  if (evidenceRef) {
    for (const key of ['repository', 'path', 'artifact_version', 'content_sha256']) {
      expectString(evidenceRef[key], `${evidenceRefPath}.${key}`, errors);
    }
  }
  expectArray(
    reconciliation.source_input_sha256s,
    `${path}.source_reconciliation.source_input_sha256s`,
    errors,
    expectStringItem,
  );
}

function parseIdentityShape(
  value: unknown,
  path: string,
  errors: WeeklyValidationIssue[],
): void {
  const identity = expectRecord(value, path, errors);
  if (!identity) return;
  expectString(identity.canonical_player_id, `${path}.canonical_player_id`, errors, true);
  expectString(identity.identity_status, `${path}.identity_status`, errors);
  if (
    typeof identity.identity_status === 'string' &&
    !['resolved', 'unresolved', 'conflicting'].includes(identity.identity_status)
  ) malformed(errors, `${path}.identity_status`, 'Unknown identity status.');
  parseEvidenceRefShape(identity.source_identity_ref, `${path}.source_identity_ref`, errors);
  expectString(identity.display_name, `${path}.display_name`, errors);
  expectString(identity.position, `${path}.position`, errors, true);
  expectString(identity.nfl_team_abbr, `${path}.nfl_team_abbr`, errors, true);
  expectBoolean(identity.fuzzy_join_used, `${path}.fuzzy_join_used`, errors);
  expectBoolean(identity.synthetic_namespace_used, `${path}.synthetic_namespace_used`, errors);
}

function parseUncertaintyShape(
  value: unknown,
  path: string,
  errors: WeeklyValidationIssue[],
): void {
  const uncertainty = expectRecord(value, path, errors);
  if (!uncertainty) return;
  expectString(uncertainty.status, `${path}.status`, errors);
  expectString(uncertainty.method_id, `${path}.method_id`, errors, true);
  expectString(uncertainty.method_version, `${path}.method_version`, errors, true);
  for (const key of [
    'lower_quantile', 'median', 'upper_quantile', 'interval_lower', 'interval_upper',
  ]) expectNullableNumber(uncertainty[key], `${path}.${key}`, errors);
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
  try {
    const document = expectRecord(input, '', errors);
    if (!document) return { ok: false, errors };
    if (document.artifact_type !== WEEKLY_PUBLICATION_ARTIFACT_TYPE) {
      errors.push(issue('wrong_artifact_type', 'artifact_type', 'Unexpected artifact_type.'));
    }
    if (
      document.artifact_version !== WEEKLY_PUBLICATION_ARTIFACT_VERSION &&
      document.artifact_version !== WEEKLY_PUBLICATION_SCHEMA_EXAMPLE_VERSION
    ) {
      errors.push(issue('wrong_artifact_version', 'artifact_version', 'Unexpected artifact_version.'));
    }
    for (const key of [
      'artifact_type', 'artifact_version', 'document_kind', 'publication_id',
      'output_kind', 'forecast_cutoff', 'generated_at', 'cutoff_rule',
      'uncertainty_status',
    ]) expectString(document[key], key, errors);

    const target = expectRecord(document.target, 'target', errors);
    if (target) {
      expectNumber(target.target_season, 'target.target_season', errors);
      expectNumber(target.target_week, 'target.target_week', errors);
      for (const key of [
        'target_kind', 'rank_basis', 'rank_ordering_rule', 'scoring_profile_id',
      ]) expectString(target[key], `target.${key}`, errors);
      expectBoolean(target.is_seasonal_total, 'target.is_seasonal_total', errors);
      expectBoolean(target.league_specific, 'target.league_specific', errors);
      expectArray(target.supported_positions, 'target.supported_positions', errors, expectStringItem);
      expectArray(target.unsupported_domain, 'target.unsupported_domain', errors, expectStringItem);
    }

    expectArray(
      document.preseason_input_class_rules,
      'preseason_input_class_rules',
      errors,
      parseInputRuleShape,
    );
    expectArray(
      document.prohibited_input_classes,
      'prohibited_input_classes',
      errors,
      expectStringItem,
    );
    expectArray(document.artifact_inputs, 'artifact_inputs', errors, parseArtifactInputShape);
    parseScoringProfileShape(document.scoring_profile, 'scoring_profile', errors);

    const model = expectRecord(document.model, 'model', errors);
    if (model) {
      for (const key of [
        'model_id', 'model_version', 'implementation_repository',
        'implementation_commit_sha', 'implementation_commit_evidence_sha256',
        'configuration_sha256', 'feature_configuration_sha256',
      ]) expectString(model[key], `model.${key}`, errors);
      if (model.fitted_model_ref !== null) {
        parseContentRefShape(model.fitted_model_ref, 'model.fitted_model_ref', errors);
      }
    }

    const census = expectRecord(document.population_census, 'population_census', errors);
    if (census) {
      parseContentRefShape(census.census_artifact_ref, 'population_census.census_artifact_ref', errors);
      for (const key of [
        'census_sha256', 'semantics_owner', 'semantics_ref', 'scope_definition', 'effective_at',
      ]) expectString(census[key], `population_census.${key}`, errors);
      expectNumber(census.row_count, 'population_census.row_count', errors);
    }

    const reconciliation = expectRecord(
      document.population_reconciliation,
      'population_reconciliation',
      errors,
    );
    if (reconciliation) {
      expectNumber(reconciliation.output_row_count, 'population_reconciliation.output_row_count', errors);
      for (const key of [
        'duplicate_population_row_ids', 'missing_population_row_ids', 'extra_population_row_ids',
      ]) expectArray(reconciliation[key], `population_reconciliation.${key}`, errors, expectStringItem);
      expectBoolean(reconciliation.one_to_one_complete, 'population_reconciliation.one_to_one_complete', errors);
    }

    const coverage = expectRecord(document.identity_coverage, 'identity_coverage', errors);
    if (coverage) {
      for (const key of [
        'census_row_count', 'resolved_count', 'unresolved_count', 'conflicting_count', 'coverage_rate',
      ]) expectNumber(coverage[key], `identity_coverage.${key}`, errors);
      for (const key of ['unresolved_population_row_ids', 'conflicting_population_row_ids']) {
        expectArray(coverage[key], `identity_coverage.${key}`, errors, expectStringItem);
      }
    }

    const counts = expectRecord(document.status_counts, 'status_counts', errors);
    if (counts) {
      for (const status of WEEKLY_FORECAST_STATUSES) {
        expectNumber(counts[status], `status_counts.${status}`, errors);
      }
    }

    const lifecycle = expectRecord(document.lifecycle, 'lifecycle', errors);
    if (lifecycle) {
      expectString(lifecycle.state, 'lifecycle.state', errors);
      expectString(lifecycle.consumer_eligibility, 'lifecycle.consumer_eligibility', errors);
      expectBoolean(lifecycle.admission_requires_receipt, 'lifecycle.admission_requires_receipt', errors);
    }

    const reliability = expectRecord(document.reliability_tracking, 'reliability_tracking', errors);
    if (reliability) {
      for (const key of ['truth_label_owner', 'truth_label_artifact_kind', 'forge_role']) {
        expectString(reliability[key], `reliability_tracking.${key}`, errors);
      }
      if (reliability.truth_label_ref !== null) {
        parseEvidenceRefShape(reliability.truth_label_ref, 'reliability_tracking.truth_label_ref', errors);
      }
      expectBoolean(reliability.forge_is_truth_label, 'reliability_tracking.forge_is_truth_label', errors);
      expectString(reliability.scored_at, 'reliability_tracking.scored_at', errors, true);
    }

    const boundary = expectRecord(document.seasonal_candidate_boundary, 'seasonal_candidate_boundary', errors);
    if (boundary) {
      for (const key of ['seasonal_candidate_run_id', 'relationship', 'note']) {
        expectString(boundary[key], `seasonal_candidate_boundary.${key}`, errors);
      }
      for (const key of [
        'may_relabel_seasonal_candidate', 'may_promote_seasonal_candidate',
        'may_consume_seasonal_candidate',
      ]) expectBoolean(boundary[key], `seasonal_candidate_boundary.${key}`, errors);
    }

    expectArray(document.outputs, 'outputs', errors, parseContentRefShape);
    const digests = expectRecord(document.digests, 'digests', errors);
    if (digests) {
      expectString(digests.player_rows_sha256, 'digests.player_rows_sha256', errors);
      const serialization = expectRecord(digests.serialization, 'digests.serialization', errors);
      if (serialization) {
        expectString(serialization.serializer_id, 'digests.serialization.serializer_id', errors);
        expectString(serialization.serializer_version, 'digests.serialization.serializer_version', errors);
      }
    }
    expectArray(document.limitations, 'limitations', errors, expectStringItem);
    // Establish canonical-serialization safety as part of parsing. This also
    // rejects cycles, accessors, exotic prototypes, undefined values, and
    // non-finite values hidden in otherwise-unused fields before admission.
    canonicalForwardJsonSha256(document);
  } catch (error) {
    malformed(errors, '', `Document could not be inspected safely: ${error instanceof Error ? error.message : 'unknown error'}`);
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: input as WeeklyForecastPublicationManifest };
}

/** Structural parse of an untrusted rows document. Never throws. */
export function parseWeeklyPlayerRows(
  input: unknown,
): WeeklyParseResult<readonly WeeklyPlayerRow[]> {
  const errors: WeeklyValidationIssue[] = [];
  try {
    expectArray(input, '', errors, (value, path, rowErrors) => {
      const row = expectRecord(value, path, rowErrors);
      if (!row) return;
      expectString(row.population_row_id, `${path}.population_row_id`, rowErrors);
      expectString(row.forecast_status, `${path}.forecast_status`, rowErrors);
      if (
        typeof row.forecast_status === 'string' &&
        !(WEEKLY_FORECAST_STATUSES as readonly string[]).includes(row.forecast_status)
      ) malformed(rowErrors, `${path}.forecast_status`, 'Unknown forecast_status.');
      parseIdentityShape(row.identity, `${path}.identity`, rowErrors);
      parseUncertaintyShape(row.uncertainty, `${path}.uncertainty`, rowErrors);
      expectArray(row.input_ids_used, `${path}.input_ids_used`, rowErrors, expectStringItem);
      if (row.point_forecast !== null) expectNumber(row.point_forecast, `${path}.point_forecast`, rowErrors);
      if (row.rank !== null) expectNumber(row.rank, `${path}.rank`, rowErrors);
      if (row.actual_outcome !== null) malformed(rowErrors, `${path}.actual_outcome`, 'Expected null before the target week.');
      if (row.forecast_status !== 'forecast_available') {
        expectArray(row.status_reasons, `${path}.status_reasons`, rowErrors, expectStringItem);
      }
    });
    canonicalForwardJsonSha256(input);
  } catch (error) {
    malformed(errors, '', `Rows could not be inspected safely: ${error instanceof Error ? error.message : 'unknown error'}`);
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: input as readonly WeeklyPlayerRow[] };
}

/** Structural parse of an untrusted admission receipt. Never throws. */
export function parseWeeklyAdmissionReceipt(
  input: unknown,
): WeeklyParseResult<WeeklyAdmissionReceipt> {
  const errors: WeeklyValidationIssue[] = [];
  try {
    const receipt = expectRecord(input, '', errors);
    if (!receipt) return { ok: false, errors };
    if (receipt.artifact_type !== WEEKLY_ADMISSION_RECEIPT_ARTIFACT_TYPE) {
      errors.push(issue('wrong_artifact_type', 'artifact_type', 'Unexpected receipt artifact_type.'));
    }
    if (receipt.artifact_version !== WEEKLY_ADMISSION_RECEIPT_ARTIFACT_VERSION) {
      errors.push(issue('wrong_artifact_version', 'artifact_version', 'Unexpected receipt artifact_version.'));
    }
    for (const key of [
      'artifact_type', 'artifact_version', 'document_kind', 'publication_id',
      'manifest_sha256', 'player_rows_sha256', 'authority_id',
      'authority_repository', 'decided_by', 'decided_at', 'admission_path',
      'consumer_eligibility',
    ]) expectString(receipt[key], key, errors);
    expectBoolean(receipt.in_season_gate_weakened, 'in_season_gate_weakened', errors);
    const decisionRef = expectRecord(receipt.decision_ref, 'decision_ref', errors);
    if (decisionRef) {
      if (decisionRef.input_id !== null) malformed(errors, 'decision_ref.input_id', 'Expected null.');
      expectString(decisionRef.uri_or_path, 'decision_ref.uri_or_path', errors);
      expectString(decisionRef.content_sha256, 'decision_ref.content_sha256', errors);
      expectString(decisionRef.record_id, 'decision_ref.record_id', errors);
    }
    expectArray(receipt.limitations, 'limitations', errors, expectStringItem);
    canonicalForwardJsonSha256(receipt);
  } catch (error) {
    malformed(errors, '', `Receipt could not be inspected safely: ${error instanceof Error ? error.message : 'unknown error'}`);
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: input as WeeklyAdmissionReceipt };
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
  /**
   * The census the consumer **expects**, independent of the document.
   *
   * Pinning the owner string and then checking that the semantics ref, source
   * path, digest and population agree with values the manifest selected proves
   * only internal consistency: a publisher holding both sides can name
   * TIBER-Data while choosing an arbitrary semantics ref, source path, digest
   * and population, echo them through the context, and pass. Equality with
   * publisher-selected values is not provenance.
   *
   * This is the trust anchor, exactly as `admission_authority` is for receipts:
   * it must come from deployed configuration or a separately governed artifact,
   * never from the publication being tested. Admission fails closed without it.
   */
  expected_census_identity?: {
    owner_repository: string;
    semantics_ref: string;
    source_uri_or_path: string;
    census_sha256: string;
  };
  /**
   * The census the consumer actually loaded and verified, including the
   * canonical identity each population row maps to.
   *
   * `population_row_ids` alone cannot show that a row's `canonical_player_id`
   * belongs to the census record it cites: swapping one row's canonical id for
   * another's while keeping its own valid record id and digest satisfies every
   * per-field check. The mapping is therefore carried here and compared.
   */
  census?: {
    census_sha256: string;
    population_row_ids: readonly string[];
    owner_repository: string;
    semantics_ref: string;
    source_uri_or_path: string;
    /** population_row_id → the canonical player id the governed census assigns. */
    canonical_player_ids_by_row_id?: Readonly<Record<string, string | null>>;
  };
  /**
   * Verification results produced from the exact source bytes. An input id by
   * itself is not evidence: every load-bearing identity, digest, timestamp and
   * count is rebound here and compared fail-closed.
   */
  record_level_input_evidence?: readonly WeeklyRecordLevelInputEvidence[];
  /**
   * Consumer-owned trust anchor. It must come from deployed configuration or a
   * separately governed binding artifact, never from the receipt being tested.
   */
  admission_authority?: WeeklyTrustedAdmissionBinding;
}

export interface WeeklyRecordLevelInputEvidence {
  input_id: string;
  input_content_sha256: string;
  owner_repository: string;
  owner_commit_sha: string;
  verified_forecast_cutoff: string;
  verified_source_as_of: string;
  max_record_effective_at: string;
  record_count_eligible: number;
  record_count_post_cutoff: number;
  record_count_unresolved: number;
  /**
   * The population rows this input actually holds an eligible record for,
   * derived by the consumer from the exact source bytes.
   *
   * Aggregate counts cannot answer a per-player question. Without this, an
   * input carrying one eligible record satisfies every count check while two
   * available rows each self-declare that they used it — and rankings are
   * produced for players the verified source says nothing about.
   */
  eligible_population_row_ids: readonly string[];
  verification_artifact_ref: WeeklyContentRef;
}

export interface WeeklyTrustedAdmissionBinding {
  receipt_sha256: string;
  authority_id: string;
  authority_repository: string;
  decision_ref_uri_or_path: string;
  decision_ref_content_sha256: string;
  decision_ref_record_id: string;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface WeeklyValidationResult {
  validator_id: 'tiber-weekly-forecast-publication-validator';
  validator_version: '3.0.0';
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
  if (typeof value !== 'string' || !WEEKLY_UTC_INSTANT_PATTERN.test(value)) return false;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return false;
  // The regex admits impossible calendar dates that `Date` silently rolls over
  // (`2026-09-31T00:00:00.000Z` becomes October 1 rather than NaN). Without a
  // round trip, every downstream cutoff comparison would use an instant other
  // than the one written in the artifact.
  return parsed.toISOString() === value;
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

  // --- document identity --------------------------------------------------
  if (
    manifest.artifact_type !== WEEKLY_PUBLICATION_ARTIFACT_TYPE ||
    (manifest.artifact_version !== WEEKLY_PUBLICATION_ARTIFACT_VERSION && !isExample) ||
    manifest.document_kind !== 'weekly_publication_manifest' ||
    manifest.output_kind !== WEEKLY_OUTPUT_KIND ||
    manifest.cutoff_rule !== WEEKLY_CUTOFF_RULE
  ) {
    fail('manifest_identity_invalid', '', 'Manifest identity, output kind, or cutoff rule is not canonical.');
  }

  // --- target -------------------------------------------------------------
  const target = manifest.target;
  if (target?.target_kind !== 'single_scoring_week') {
    fail('target_not_single_week', 'target.target_kind', 'Target must be a single scoring week.');
  }
  if (target?.is_seasonal_total !== false) {
    fail('target_is_seasonal_total', 'target.is_seasonal_total', 'A seasonal total may not be published as weekly output.');
  }
  if (
    target?.target_season !== WEEKLY_TARGET_SEASON ||
    target?.target_week !== WEEKLY_TARGET_WEEK
  ) {
    fail('target_field_invalid', 'target',
      `This contract is scoped to ${WEEKLY_TARGET_SEASON} Week ${WEEKLY_TARGET_WEEK}.`);
  }
  if (target?.rank_basis !== WEEKLY_RANK_BASIS) {
    fail('target_field_invalid', 'target.rank_basis', 'Unexpected rank_basis.');
  }
  if (target?.rank_ordering_rule !== WEEKLY_RANK_ORDERING_RULE) {
    fail('target_field_invalid', 'target.rank_ordering_rule', 'Unexpected rank_ordering_rule.');
  }
  if (
    target?.scoring_profile_id !== WEEKLY_SCORING_PROFILE_ID ||
    target?.league_specific !== false ||
    canonicalForwardJsonSha256(target?.supported_positions) !==
      canonicalForwardJsonSha256(WEEKLY_SUPPORTED_POSITIONS) ||
    canonicalForwardJsonSha256(target?.unsupported_domain) !==
      canonicalForwardJsonSha256(['IDP'])
  ) {
    fail('target_field_invalid', 'target', 'Scoring profile, position domain, or league scope is not canonical.');
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
  // Both timestamps are capped at the contract-owned pre-kickoff deadline.
  // `generated_at >= forecast_cutoff` alone lets a document slide the whole
  // window into the regular season while keeping every input-class label legal.
  const preKickoffMs = new Date(WEEKLY_WEEK1_PREKICKOFF_DEADLINE_UTC).getTime();
  if (
    isCanonicalUtc(manifest.forecast_cutoff) &&
    new Date(manifest.forecast_cutoff).getTime() > preKickoffMs
  ) {
    fail('cutoff_after_prekickoff_deadline', 'forecast_cutoff',
      `forecast_cutoff must be at or before the Week 1 pre-kickoff deadline (${WEEKLY_WEEK1_PREKICKOFF_DEADLINE_UTC}).`);
  }
  if (
    isCanonicalUtc(manifest.generated_at) &&
    new Date(manifest.generated_at).getTime() > preKickoffMs
  ) {
    fail('generated_at_after_prekickoff_deadline', 'generated_at',
      `generated_at must be at or before the Week 1 pre-kickoff deadline (${WEEKLY_WEEK1_PREKICKOFF_DEADLINE_UTC}).`);
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

  // --- scoring/model contracts -------------------------------------------
  const {
    profile_sha256: declaredProfileSha,
    source_reconciliation: sourceReconciliation,
    ...declaredProfileDefinition
  } = manifest.scoring_profile;
  if (
    canonicalForwardJsonSha256(declaredProfileDefinition) !==
      canonicalForwardJsonSha256(TIBER_GENERIC_FULL_PPR_V1) ||
    declaredProfileSha !== TIBER_GENERIC_FULL_PPR_V1_SHA256 ||
    manifest.scoring_profile.profile_id !== TIBER_GENERIC_FULL_PPR_V1_PROFILE_ID ||
    manifest.scoring_profile.profile_version !== TIBER_GENERIC_FULL_PPR_V1_PROFILE_VERSION
  ) {
    fail('scoring_profile_mismatch', 'scoring_profile',
      'Scoring profile must exactly match the canonical generic full-PPR definition and digest.');
  }

  const inputHashes = (manifest.artifact_inputs ?? [])
    .map((input) => input.content_sha256)
    .sort(compareForwardCanonicalStrings);
  const canonicalInputHashes = [...new Set(inputHashes)];
  const reconciliationHashes = [...(sourceReconciliation?.source_input_sha256s ?? [])]
    .sort(compareForwardCanonicalStrings);
  const canonicalReconciliationHashes = [...new Set(reconciliationHashes)];
  const reconciliationEvidence = sourceReconciliation?.evidence_ref;
  if (
    (!isExample && sourceReconciliation?.status !== 'passed') ||
    (isExample && !['passed', 'unavailable'].includes(sourceReconciliation?.status)) ||
    sourceReconciliation?.scoring_profile_sha256 !== TIBER_GENERIC_FULL_PPR_V1_SHA256 ||
    canonicalForwardJsonSha256(sourceReconciliation?.source_input_sha256s ?? []) !==
      canonicalForwardJsonSha256(canonicalReconciliationHashes) ||
    canonicalForwardJsonSha256(canonicalReconciliationHashes) !==
      canonicalForwardJsonSha256(canonicalInputHashes) ||
    !sourceReconciliation?.validator_id ||
    !sourceReconciliation?.validator_version ||
    !reconciliationEvidence?.repository ||
    !reconciliationEvidence?.path ||
    !reconciliationEvidence?.artifact_version ||
    !WEEKLY_SHA256_PATTERN.test(reconciliationEvidence?.content_sha256 ?? '')
  ) {
    fail('scoring_reconciliation_invalid', 'scoring_profile.source_reconciliation',
      'Scoring reconciliation must bind the canonical profile and every exact admitted input hash.');
  }

  const model = manifest.model;
  if (
    !model?.model_id ||
    !model?.model_version ||
    model?.implementation_repository !== WEEKLY_FORECAST_REPOSITORY ||
    !WEEKLY_COMMIT_SHA_PATTERN.test(model?.implementation_commit_sha ?? '') ||
    !WEEKLY_SHA256_PATTERN.test(model?.implementation_commit_evidence_sha256 ?? '') ||
    !WEEKLY_SHA256_PATTERN.test(model?.configuration_sha256 ?? '') ||
    !WEEKLY_SHA256_PATTERN.test(model?.feature_configuration_sha256 ?? '') ||
    (!isExample && model?.fitted_model_ref === null)
  ) {
    fail('model_identity_invalid', 'model',
      'Model identity must bind Forecast implementation code, configuration, features, and a real fitted model artifact.');
  }
  if (model?.fitted_model_ref && !WEEKLY_SHA256_PATTERN.test(model.fitted_model_ref.content_sha256)) {
    fail('model_identity_invalid', 'model.fitted_model_ref.content_sha256',
      'Fitted model reference must carry a lowercase SHA-256.');
  }

  // --- inputs -------------------------------------------------------------
  const inputs = manifest.artifact_inputs ?? [];
  const seenInputIds = new Set<string>();
  const seenInputClasses = new Set<string>();
  const cutoffMs = isCanonicalUtc(manifest.forecast_cutoff)
    ? new Date(manifest.forecast_cutoff).getTime()
    : null;
  const verificationByInputId = new Map(
    (context.record_level_input_evidence ?? []).map((evidence) => [evidence.input_id, evidence]),
  );
  if (verificationByInputId.size !== (context.record_level_input_evidence ?? []).length) {
    fail('input_verification_binding_mismatch', 'verification_context.record_level_input_evidence',
      'Record-level verification evidence contains duplicate input ids.');
  }

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

    const canonicalRule = WEEKLY_CANONICAL_INPUT_CLASS_RULES.find(
      (rule) => rule.input_class === input.input_class,
    );
    if (!canonicalRule) {
      fail('input_class_not_canonical', `${at}.input_class`,
        `Input class "${input.input_class}" is not part of the canonical preseason policy.`);
    } else if (
      input.owner_repository !== canonicalRule.owner_repository ||
      input.availability_rule_id !== canonicalRule.availability_rule_id ||
      input.cutoff_evidence?.source_timestamp_locator !== canonicalRule.source_timestamp_locator ||
      input.cutoff_evidence?.normalization_rule_id !== canonicalRule.normalization_rule_id
    ) {
      fail('input_rule_mismatch', at,
        `Input "${input.input_id}" does not exactly implement its canonical owner/availability/locator/normalization rule.`);
    }

    // Local cutoff check — the producer's own status is not sufficient.
    if (!isCanonicalUtc(input.source_as_of)) {
      fail('input_source_as_of_invalid', `${at}.source_as_of`, 'source_as_of must be a canonical UTC instant.');
    } else if (cutoffMs !== null && new Date(input.source_as_of).getTime() > cutoffMs) {
      fail('input_post_cutoff', `${at}.source_as_of`,
        `source_as_of ${input.source_as_of} is after forecast_cutoff ${manifest.forecast_cutoff}.`);
    }

    const evidence = input.cutoff_evidence;
    if ([
      evidence?.record_count_eligible,
      evidence?.record_count_post_cutoff,
      evidence?.record_count_unresolved,
    ].some((count) => !Number.isInteger(count) || (count as number) < 0)) {
      fail('input_cutoff_unresolved', `${at}.cutoff_evidence`,
        'Record counts must be non-negative integers.');
    }
    if (canonicalRule?.required && (evidence?.record_count_eligible ?? 0) < 1) {
      fail('input_cutoff_unresolved', `${at}.cutoff_evidence.record_count_eligible`,
        'A required input must have at least one record verified eligible at the cutoff.');
    }
    if (evidence?.record_count_post_cutoff > 0) {
      fail('input_post_cutoff', `${at}.cutoff_evidence`, 'Input admits records after the declared cutoff.');
    }
    if (evidence?.record_count_unresolved > 0 || evidence?.self_reported_status === 'unresolved') {
      fail('input_cutoff_unresolved', `${at}.cutoff_evidence`, 'Input has unresolved availability evidence.');
    }
    if (!['eligible', 'ineligible_after_cutoff', 'unresolved'].includes(
      evidence?.self_reported_status,
    )) {
      fail('input_cutoff_unresolved', `${at}.cutoff_evidence.self_reported_status`,
        'Unknown producer cutoff status.');
    }
    if (evidence?.self_reported_status === 'ineligible_after_cutoff') {
      fail('input_post_cutoff', `${at}.cutoff_evidence`, 'Producer reports the input ineligible after cutoff.');
    }
    // Unverified is never admission-capable. A `locally_verified` declaration
    // is accepted only when structured evidence rebinds every load-bearing
    // field and proves the exact source bytes stayed within the cutoff.
    const verification = verificationByInputId.get(input.input_id);
    if (isExample && evidence?.record_level_verification === 'unverified_requires_source_bytes') {
      // Schema examples are structurally reviewable but categorically
      // non-admissible by artifact version. Do not fabricate source-byte
      // verification merely to make an example validator-clean.
    } else if (evidence?.record_level_verification !== 'locally_verified' || !verification) {
      fail('input_cutoff_unverified', `${at}.cutoff_evidence.record_level_verification`,
        'Admission requires structured record-level evidence for the exact source bytes.');
    } else {
      const verificationArtifact = verification.verification_artifact_ref;
      const countsMatch =
        verification.record_count_eligible === evidence.record_count_eligible &&
        verification.record_count_post_cutoff === evidence.record_count_post_cutoff &&
        verification.record_count_unresolved === evidence.record_count_unresolved;
      const identityMatches =
        verification.input_content_sha256 === input.content_sha256 &&
        verification.owner_repository === input.owner_repository &&
        verification.owner_commit_sha === input.owner_commit_sha &&
        verification.verified_forecast_cutoff === manifest.forecast_cutoff &&
        verification.verified_source_as_of === input.source_as_of;
      if (!countsMatch || !identityMatches) {
        fail('input_verification_binding_mismatch', `${at}.cutoff_evidence`,
          'Record-level evidence does not bind the exact input bytes, owner commit, cutoff, source timestamp, and counts.');
      }
      if (
        !isCanonicalUtc(verification.max_record_effective_at) ||
        !isCanonicalUtc(verification.verified_forecast_cutoff) ||
        !isCanonicalUtc(verification.verified_source_as_of) ||
        (cutoffMs !== null &&
          new Date(verification.max_record_effective_at).getTime() > cutoffMs) ||
        (isCanonicalUtc(verification.verified_source_as_of) &&
          new Date(verification.max_record_effective_at).getTime() >
            new Date(verification.verified_source_as_of).getTime())
      ) {
        fail('input_verification_binding_mismatch', `${at}.cutoff_evidence`,
          'Record-level evidence timestamps are invalid or include a record after the forecast cutoff.');
      }
      if (
        !verificationArtifact?.artifact_type ||
        !verificationArtifact?.artifact_version ||
        !verificationArtifact?.uri_or_path ||
        !WEEKLY_SHA256_PATTERN.test(verificationArtifact?.content_sha256 ?? '') ||
        (!isExample && WEEKLY_PLACEHOLDER_HASH_PATTERN.test(
          verificationArtifact?.content_sha256 ?? '',
        )) ||
        (!isExample && WEEKLY_EXAMPLE_MARKERS.some((marker) =>
          verificationArtifact?.uri_or_path.toLowerCase().includes(marker)))
      ) {
        fail('input_verification_artifact_invalid', `${at}.cutoff_evidence`,
          'Record-level verification must be backed by a content-addressed verification artifact.');
      }
    }
  });

  for (const evidence of context.record_level_input_evidence ?? []) {
    if (!seenInputIds.has(evidence.input_id)) {
      fail('input_verification_binding_mismatch', 'verification_context.record_level_input_evidence',
        `Verification evidence references undeclared input "${evidence.input_id}".`);
    }
    // The membership list is the evidence; the count is a summary of it. If
    // they disagree, one of them is fabricated.
    const members = evidence.eligible_population_row_ids ?? [];
    if (!Array.isArray(evidence.eligible_population_row_ids)) {
      fail('input_verification_binding_mismatch', 'verification_context.record_level_input_evidence',
        `Input "${evidence.input_id}" verification carries no eligible population-row membership.`);
    } else if (new Set(members).size !== members.length) {
      fail('input_verification_binding_mismatch', 'verification_context.record_level_input_evidence',
        `Input "${evidence.input_id}" lists a population row more than once as eligible.`);
    } else if (members.length !== evidence.record_count_eligible) {
      fail('input_verification_binding_mismatch', 'verification_context.record_level_input_evidence',
        `Input "${evidence.input_id}" reports ${evidence.record_count_eligible} eligible records ` +
        `but verified membership for ${members.length}.`);
    }
  }

  // Required classes must actually be present as inputs.
  for (const required of WEEKLY_REQUIRED_INPUT_CLASSES) {
    if (!seenInputClasses.has(required)) {
      fail('required_input_class_missing', 'artifact_inputs',
        `Required input class "${required}" has no artifact input.`);
    }
  }

  // --- rows: recompute rather than trust ----------------------------------
  const censusRowCount = manifest.population_census?.row_count ?? 0;

  if (!isCanonicalUtc(manifest.population_census?.effective_at)) {
    fail('census_effective_at_invalid', 'population_census.effective_at',
      'Census effective_at must be a canonical UTC instant.');
  } else if (
    cutoffMs !== null &&
    new Date(manifest.population_census.effective_at).getTime() > cutoffMs
  ) {
    fail('census_post_cutoff', 'population_census.effective_at',
      'Census effective_at may not be after forecast_cutoff.');
  }
  if (
    manifest.population_census?.census_artifact_ref?.content_sha256 !==
      manifest.population_census?.census_sha256 ||
    !WEEKLY_SHA256_PATTERN.test(manifest.population_census?.census_sha256 ?? '')
  ) {
    fail('census_membership_mismatch', 'population_census',
      'Census reference digest must equal census_sha256 and use lowercase SHA-256 syntax.');
  }

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
    // Provenance first, against the CONSUMER'S expected identity.
    //
    // Comparing the context to the manifest only proves the two agree; a
    // publisher controlling both can make them agree on anything. The expected
    // identity is the trust anchor, so it is required, and both the manifest
    // and the loaded census must match it.
    const expected = context.expected_census_identity;
    if (!expected) {
      fail('census_provenance_ungoverned', 'population_census',
        'Admission requires a consumer-owned expected census identity (governed owner, ' +
        'semantics reference, source path and digest). Agreement between the manifest and ' +
        'a caller-supplied context is not provenance.');
    } else {
      const matchesExpected = (actual: {
        owner_repository?: string; semantics_ref?: string;
        source_uri_or_path?: string; census_sha256?: string;
      }) =>
        actual.owner_repository === expected.owner_repository &&
        actual.semantics_ref === expected.semantics_ref &&
        actual.source_uri_or_path === expected.source_uri_or_path &&
        actual.census_sha256 === expected.census_sha256;

      if (expected.owner_repository !== WEEKLY_GOVERNED_CENSUS_OWNER) {
        fail('census_provenance_ungoverned', 'population_census',
          `The expected census identity must name the governed owner (${WEEKLY_GOVERNED_CENSUS_OWNER}).`);
      }
      if (!matchesExpected({
        owner_repository: context.census.owner_repository,
        semantics_ref: context.census.semantics_ref,
        source_uri_or_path: context.census.source_uri_or_path,
        census_sha256: context.census.census_sha256,
      })) {
        fail('census_provenance_ungoverned', 'population_census',
          'The loaded census does not match the consumer-owned expected census identity.');
      }
      if (!matchesExpected({
        owner_repository: manifest.population_census.semantics_owner,
        semantics_ref: manifest.population_census.semantics_ref,
        source_uri_or_path: manifest.population_census.census_artifact_ref?.uri_or_path,
        census_sha256: manifest.population_census.census_sha256,
      })) {
        fail('census_provenance_ungoverned', 'population_census',
          'The manifest does not reference the consumer-owned expected census identity.');
      }
    }

    if (context.census.census_sha256 !== manifest.population_census.census_sha256) {
      fail('census_membership_mismatch', 'population_census.census_sha256',
        'Verification context census digest does not match the manifest.');
    }
    const censusIds = new Set(context.census.population_row_ids);
    const rowIds = new Set(rows.map((r) => r.population_row_id));
    const missing = context.census.population_row_ids.filter((id) => !rowIds.has(id));
    const extra = Array.from(rowIds).filter((id) => !censusIds.has(id));
    if (
      context.census.population_row_ids.length !== censusRowCount ||
      censusIds.size !== context.census.population_row_ids.length ||
      missing.length > 0 || extra.length > 0
    ) {
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
    if (!['resolved', 'unresolved', 'conflicting'].includes(row.identity?.identity_status)) {
      fail('available_row_identity_unresolved', `${at}.identity.identity_status`,
        'Identity status must be resolved, unresolved, or conflicting.');
    }
    if (
      (row.identity?.identity_status === 'resolved' && !row.identity.canonical_player_id) ||
      (row.identity?.identity_status !== 'resolved' && row.identity?.canonical_player_id !== null)
    ) {
      fail('available_row_identity_unresolved', `${at}.identity.canonical_player_id`,
        'Canonical id presence must agree with identity_status.');
    }
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
          u.interval_lower !== null || u.interval_upper !== null || u.method_id !== null ||
          u.method_version !== null) {
        fail('fabricated_uncertainty', `${at}.uncertainty`, 'Range fields must be null when uncertainty is not calibrated.');
      }
    } else if (row.uncertainty?.status === 'calibrated') {
      // Structural checks — a method string and finite, ordered numbers — are
      // satisfiable by fabrication: arbitrary method ids and any ordered
      // triple would pass. There is no calibration-evidence producer for this
      // publication and no verification context that could bind one, so
      // `calibrated` is categorically inadmissible here rather than admissible
      // on self-declaration. Calibration is a parked, operator-owned follow-up;
      // when it lands it must arrive with independently verified evidence and
      // its own contract revision.
      fail('calibrated_uncertainty_unsupported', `${at}.uncertainty.status`,
        'This contract is point-only: calibrated uncertainty cannot be admitted ' +
        'without independently verified calibration evidence.');
    } else {
      fail('fabricated_uncertainty', `${at}.uncertainty`, 'Unknown uncertainty status.');
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
      if (!(WEEKLY_SUPPORTED_POSITIONS as readonly string[]).includes(available.identity.position ?? '')) {
        fail('available_row_identity_unresolved', `${at}.identity.position`,
          'An available forecast requires a supported offensive position.');
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
          continue;
        }
        // `input_ids_used` is the publisher's own claim. Verify the row is a
        // member of that input according to the consumer's exact-byte
        // verification, rather than trusting the string it listed.
        // Only meaningful where the document claims local verification. An
        // example that truthfully declares `unverified_requires_source_bytes`
        // is already non-admissible on that ground; demanding membership
        // evidence it never claimed would be a category error.
        const declaredInput = inputs.find((i) => i.input_id === requiredId);
        if (declaredInput?.cutoff_evidence?.record_level_verification !== 'locally_verified') continue;
        const evidence = verificationByInputId.get(requiredId);
        if (!evidence) {
          fail('available_row_missing_required_input', `${at}.input_ids_used`,
            `Required input "${requiredId}" claims local verification but supplies no evidence.`);
        } else if (!(evidence.eligible_population_row_ids ?? []).includes(row.population_row_id)) {
          fail('available_row_missing_required_input', `${at}.input_ids_used`,
            `Required input "${requiredId}" holds no verified eligible record for ` +
            `population row "${row.population_row_id}".`);
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
      // An unavailability REASON must be consistent with the verified identity
      // state, not merely well-formed. Binding canonical_player_id closed the
      // variant that nulled the id; a publisher can otherwise keep the correct
      // non-null id and identity_status 'resolved', flip forecast_status to
      // identity_unresolved, clear the forecast and rank, renumber the
      // remaining ranks and recompute every summary, digest and receipt — and
      // selectively omit a governed player while every other check passes.
      const verifiedCanonical = context.census?.canonical_player_ids_by_row_id?.[row.population_row_id];
      const claimsIdentityProblem =
        row.forecast_status === 'identity_unresolved' ||
        row.forecast_status === 'identity_conflicting';
      if (claimsIdentityProblem && verifiedCanonical) {
        fail('identity_evidence_unbound', `${at}.forecast_status`,
          `Row "${row.population_row_id}" claims ${row.forecast_status}, but the verified ` +
          `census resolves it to "${verifiedCanonical}". An unavailability reason must be ` +
          'consistent with the verified identity state.');
      }
      if (claimsIdentityProblem && row.identity?.identity_status === 'resolved') {
        fail('identity_evidence_unbound', `${at}.forecast_status`,
          `Row "${row.population_row_id}" declares identity_status 'resolved' while claiming ` +
          `${row.forecast_status}; those cannot both be true.`);
      }
    }

    const identityRef = row.identity?.source_identity_ref;
    if (
      !identityRef?.uri_or_path ||
      !identityRef?.record_id ||
      !identityRef?.content_sha256 ||
      !WEEKLY_SHA256_PATTERN.test(identityRef.content_sha256)
    ) {
      fail('available_row_identity_unresolved', `${at}.identity.source_identity_ref`,
        'Every row requires a content-addressed source identity record.');
    } else {
      // Presence and hash *shape* are not evidence. Any nonempty URI plus any
      // syntactically valid digest would otherwise let a publication attach the
      // wrong canonical_player_id to a real population row and still be
      // admitted — producing forecasts for the wrong players.
      //
      // The identity record is therefore bound to the governed census: its
      // digest must be the census the manifest declares (which the verification
      // context has already pinned to the governed TIBER-Data owner and
      // verified against consumer-owned evidence), and its record must be *this*
      // row's census record rather than some other row's.
      if (identityRef.content_sha256 !== manifest.population_census.census_sha256) {
        fail('identity_evidence_unbound', `${at}.identity.source_identity_ref.content_sha256`,
          'Row identity evidence must be bound to the verified governed census digest.');
      }
      if (identityRef.record_id !== row.population_row_id) {
        fail('identity_evidence_unbound', `${at}.identity.source_identity_ref.record_id`,
          `Row identity evidence must reference this row's census record ` +
          `("${row.population_row_id}"), not "${identityRef.record_id}".`);
      }
      // Citing a valid record is not the same as belonging to it. Swapping one
      // row's canonical id for another's, while keeping its own record id and
      // digest, satisfies every per-field check above — and produces forecasts
      // attributed to the wrong player. Bind the id to the verified census
      // record's contents.
      const censusIdentities = context.census?.canonical_player_ids_by_row_id;
      if (!censusIdentities) {
        fail('identity_evidence_unbound', `${at}.identity.canonical_player_id`,
          'Verified census record identities are required to bind canonical player ids.');
      } else {
        const expectedCanonical = censusIdentities[row.population_row_id];
        const declared = row.identity?.canonical_player_id ?? null;
        if (expectedCanonical === undefined) {
          fail('identity_evidence_unbound', `${at}.identity.canonical_player_id`,
            `The verified census carries no record for "${row.population_row_id}".`);
        } else if (declared !== expectedCanonical) {
          // Exact equality, INCLUDING null. Exempting a null declaration let a
          // publication downgrade a governed resolved player to
          // identity_unresolved, null its canonical id, forecast and rank,
          // recompute counts and digests, and still be admitted — selective
          // suppression of a player the trusted census says is resolvable.
          fail('identity_evidence_unbound', `${at}.identity.canonical_player_id`,
            `Declared canonical id "${declared}" is not the identity the governed census ` +
            `assigns to record "${row.population_row_id}".`);
        }
      }
    }
  });

  // One-to-one identity: two population rows may not resolve to the same
  // canonical player, or a forecast for one player is published twice under
  // different census records.
  const canonicalSeen = new Map<string, string>();
  for (const row of rows) {
    const canonical = row.identity?.canonical_player_id;
    if (!canonical) continue;
    const previous = canonicalSeen.get(canonical);
    if (previous !== undefined) {
      fail('identity_evidence_unbound', 'rows',
        `Canonical player id "${canonical}" is claimed by both "${previous}" and ` +
        `"${row.population_row_id}"; census identity must be one-to-one.`);
    } else {
      canonicalSeen.set(canonical, row.population_row_id);
    }
  }

  const availableUncertaintyStatuses = new Set(
    availableRows.map((row) => row.uncertainty.status),
  );
  if (
    (manifest.uncertainty_status === 'unavailable_not_calibrated' &&
      (availableUncertaintyStatuses.size > 1 || availableUncertaintyStatuses.has('calibrated'))) ||
    (manifest.uncertainty_status === 'calibrated' &&
      (availableRows.length === 0 || availableUncertaintyStatuses.size !== 1 ||
        !availableUncertaintyStatuses.has('calibrated'))) ||
    !['unavailable_not_calibrated', 'calibrated'].includes(manifest.uncertainty_status)
  ) {
    fail('uncertainty_contract_mismatch', 'uncertainty_status',
      'Manifest uncertainty status must exactly describe every available row.');
  }
  // The manifest cannot declare calibration either — otherwise a rows-free
  // document could assert a calibrated publication the row check never sees.
  if (manifest.uncertainty_status === 'calibrated') {
    fail('calibrated_uncertainty_unsupported', 'uncertainty_status',
      'This contract is point-only: a publication may not declare calibrated uncertainty.');
  }

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
        return compareForwardCanonicalStrings(
          a.identity.canonical_player_id,
          b.identity.canonical_player_id,
        );
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
  if (manifest.lifecycle?.admission_requires_receipt !== true) {
    fail('manifest_lifecycle_claims_eligibility', 'lifecycle.admission_requires_receipt',
      'A weekly publication always requires a separately trusted receipt.');
  }
  if (
    manifest.reliability_tracking?.truth_label_owner !== 'TIBER-Data' ||
    manifest.reliability_tracking?.truth_label_artifact_kind !== 'realized_weekly_ppr_outcomes' ||
    manifest.reliability_tracking?.forge_role !== 'explanatory_context_only' ||
    manifest.reliability_tracking?.forge_is_truth_label !== false ||
    manifest.reliability_tracking?.truth_label_ref !== null ||
    manifest.reliability_tracking?.scored_at !== null
  ) {
    fail('reliability_contract_invalid', 'reliability_tracking',
      'Pre-week publication truth remains unscored, TIBER-Data-owned, and FORGE explanatory only.');
  }

  // --- digests ------------------------------------------------------------
  const recomputedRowsDigest = canonicalForwardJsonSha256(rows);
  if (manifest.digests?.player_rows_sha256 !== recomputedRowsDigest) {
    fail('player_rows_digest_mismatch', 'digests.player_rows_sha256',
      'Declared player-rows digest does not match the supplied rows.');
  }
  if (
    manifest.digests?.serialization?.serializer_id !== WEEKLY_SERIALIZER_ID ||
    manifest.digests?.serialization?.serializer_version !== WEEKLY_SERIALIZER_VERSION
  ) {
    fail('serializer_identity_invalid', 'digests.serialization',
      'Publication must use the canonical serializer identity and version.');
  }
  if (
    manifest.outputs?.length !== 1 ||
    manifest.outputs[0]?.artifact_type !== WEEKLY_PLAYER_ROWS_ARTIFACT_TYPE ||
    manifest.outputs[0]?.artifact_version !== WEEKLY_PLAYER_ROWS_ARTIFACT_VERSION ||
    !manifest.outputs[0]?.uri_or_path ||
    manifest.outputs[0]?.content_sha256 !== recomputedRowsDigest
  ) {
    fail('output_binding_invalid', 'outputs',
      'Exactly one canonical player-rows output must bind the supplied rows digest.');
  }

  const contentHashes: Array<[string, string | null | undefined]> = [
    ['population_census.census_sha256', manifest.population_census?.census_sha256],
    ['population_census.census_artifact_ref.content_sha256',
      manifest.population_census?.census_artifact_ref?.content_sha256],
    ['scoring_profile.profile_sha256', manifest.scoring_profile?.profile_sha256],
    ['scoring_profile.source_reconciliation.evidence_ref.content_sha256',
      manifest.scoring_profile?.source_reconciliation?.evidence_ref?.content_sha256],
    ['model.implementation_commit_evidence_sha256',
      manifest.model?.implementation_commit_evidence_sha256],
    ['model.configuration_sha256', manifest.model?.configuration_sha256],
    ['model.feature_configuration_sha256', manifest.model?.feature_configuration_sha256],
    ['model.fitted_model_ref.content_sha256', manifest.model?.fitted_model_ref?.content_sha256],
    ['digests.player_rows_sha256', manifest.digests?.player_rows_sha256],
    ...inputs.map((input, index) =>
      [`artifact_inputs[${index}].content_sha256`, input.content_sha256] as [string, string]),
    ...(manifest.outputs ?? []).map((output, index) =>
      [`outputs[${index}].content_sha256`, output.content_sha256] as [string, string]),
    ...rows.map((row, index) =>
      [`rows[${index}].identity.source_identity_ref.content_sha256`,
        row.identity?.source_identity_ref?.content_sha256] as [string, string | null]),
  ];
  for (const [path, value] of contentHashes) {
    if (value !== undefined && value !== null && !WEEKLY_SHA256_PATTERN.test(value)) {
      fail('invalid_sha256', path, 'Expected a lowercase 64-character SHA-256.');
    }
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
    for (const [index, input] of inputs.entries()) {
      if (!WEEKLY_COMMIT_SHA_PATTERN.test(input.owner_commit_sha) ||
          /^0{40}$/.test(input.owner_commit_sha)) {
        fail('placeholder_commit_in_real_publication', `artifact_inputs[${index}].owner_commit_sha`,
          'A real publication requires a genuine 40-character owner commit SHA.');
      }
    }
    if (
      !WEEKLY_COMMIT_SHA_PATTERN.test(manifest.model?.implementation_commit_sha ?? '') ||
      /^0{40}$/.test(manifest.model?.implementation_commit_sha ?? '')
    ) {
      fail('placeholder_commit_in_real_publication', 'model.implementation_commit_sha',
        'A real publication requires a genuine Forecast implementation commit SHA.');
    }
  }

  return {
    validator_id: 'tiber-weekly-forecast-publication-validator',
    validator_version: '3.0.0',
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

  // The receipt is not its own authority. Its exact digest and decision source
  // must be pinned outside the request documents by the consuming deployment.
  const trusted = context.admission_authority;
  if (!trusted) return refuse('trusted_admission_binding_missing');
  if (
    !WEEKLY_SHA256_PATTERN.test(trusted.receipt_sha256) ||
    !WEEKLY_SHA256_PATTERN.test(trusted.decision_ref_content_sha256) ||
    !trusted.authority_id || !trusted.authority_repository ||
    !trusted.decision_ref_uri_or_path || !trusted.decision_ref_record_id
  ) return refuse('trusted_admission_binding_malformed');
  const receiptDigest = weeklyAdmissionReceiptSha256(receipt);
  if (receiptDigest !== trusted.receipt_sha256) return refuse('receipt_not_trusted');
  if (
    receipt.authority_id !== trusted.authority_id ||
    receipt.authority_repository !== trusted.authority_repository ||
    receipt.decision_ref.uri_or_path !== trusted.decision_ref_uri_or_path ||
    receipt.decision_ref.content_sha256 !== trusted.decision_ref_content_sha256 ||
    receipt.decision_ref.record_id !== trusted.decision_ref_record_id
  ) return refuse('receipt_authority_mismatch');

  if (receipt.document_kind !== 'weekly_publication_admission_receipt') {
    return refuse('receipt_identity_invalid');
  }
  if (receipt.consumer_eligibility !== 'eligible_admitted') return refuse('receipt_not_eligible');
  if (receipt.admission_path !== 'governed_preseason_publication') return refuse('receipt_wrong_admission_path');
  if (receipt.in_season_gate_weakened !== false) return refuse('receipt_weakened_in_season_gate');
  if (receipt.publication_id !== manifest.publication_id) return refuse('receipt_publication_id_mismatch');
  if (
    !isCanonicalUtc(receipt.decided_at) ||
    new Date(receipt.decided_at).getTime() < new Date(manifest.generated_at).getTime() ||
    // The receipt is the FIRST independently trusted binding of these bytes, so
    // capping only the manifest's own timestamps caps nothing an author
    // controls. An uncapped decision lets bytes be authored after kickoff -- or
    // after Week 1 finishes, with results in hand -- carry backdated manifest
    // timestamps, and still be admitted through the preseason path.
    new Date(receipt.decided_at).getTime() >
      new Date(WEEKLY_WEEK1_PREKICKOFF_DEADLINE_UTC).getTime() ||
    !WEEKLY_SHA256_PATTERN.test(receipt.manifest_sha256) ||
    !WEEKLY_SHA256_PATTERN.test(receipt.player_rows_sha256) ||
    !WEEKLY_SHA256_PATTERN.test(receipt.decision_ref.content_sha256) ||
    WEEKLY_PLACEHOLDER_HASH_PATTERN.test(receipt.decision_ref.content_sha256) ||
    !receipt.decision_ref.record_id ||
    !receipt.decided_by
  ) return refuse('receipt_decision_evidence_invalid');

  const receiptStrings: string[] = [];
  collectStrings(receipt, receiptStrings);
  if (receiptStrings.some((value) =>
    WEEKLY_PLACEHOLDER_HASH_PATTERN.test(value) ||
    WEEKLY_EXAMPLE_MARKERS.some((marker) => value.toLowerCase().includes(marker)))) {
    return refuse('receipt_example_or_placeholder_content');
  }

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
