/**
 * Candidate-stage contract for a future seasonal PPR run.
 *
 * This module intentionally contains types, constants, and document-discriminant
 * helpers only. It does not select a model configuration, execute a forecast,
 * validate complete artifact bytes, promote an artifact, or grant consumer
 * eligibility.
 */

import type {
  GenericFullPprProfileV1,
  ScoringReconciliationEvidenceRef,
  TIBER_GENERIC_FULL_PPR_V1_SHA256,
} from './genericFullPprProfile.js';

export const FORWARD_MANIFEST_ARTIFACT_TYPE =
  'seasonal_fantasy_point_forecast_manifest' as const;
export const FORWARD_MANIFEST_ARTIFACT_VERSION =
  'seasonal-fantasy-point-forecast-manifest-v1' as const;
export const FORWARD_SCHEMA_EXAMPLE_MANIFEST_VERSION =
  'seasonal-fantasy-point-forecast-manifest-v1-proposal' as const;
export const FORWARD_FITTED_MODEL_ARTIFACT_TYPE =
  'seasonal_fantasy_point_forecast_fitted_model' as const;
export const FORWARD_FITTED_MODEL_ARTIFACT_VERSION =
  'seasonal-fantasy-point-forecast-fitted-model-v1' as const;
export const FORWARD_PLAYER_ARTIFACT_TYPE =
  'seasonal_fantasy_point_forecast_player' as const;
export const FORWARD_PLAYER_ARTIFACT_VERSION =
  'seasonal-fantasy-point-forecast-player-v1' as const;
export const FORWARD_OUTPUT_KIND = 'model-inference' as const;
export const FORWARD_CONSUMER_ELIGIBILITY = 'never' as const;
export const FORWARD_UNCERTAINTY_STATUS =
  'unavailable_not_calibrated' as const;
export const FORWARD_CUTOFF_RULE =
  'fact_available_at <= forecast_cutoff' as const;
export const FORWARD_SCORING_PROFILE_ID =
  'tiber-generic-full-ppr-v1' as const;
export const FORWARD_SCORING_PROFILE_VERSION = '1.0.0' as const;
export const FORWARD_SERIALIZER_ID = 'tiber-canonical-json-v1' as const;
export const FORWARD_SERIALIZER_VERSION = '1.0.0' as const;

export const FORWARD_SUPPORTED_POSITIONS = ['QB', 'RB', 'WR', 'TE'] as const;
export type ForwardSupportedPosition =
  (typeof FORWARD_SUPPORTED_POSITIONS)[number];

export const FORWARD_FORECAST_STATUSES = [
  'forecast_available',
  'unavailable_missing_required_inputs',
  'unsupported_position_domain',
  'identity_unresolved',
  'eligibility_unresolved',
  'position_domain_unresolved',
  'population_ineligible',
] as const;
export type ForwardForecastStatus =
  (typeof FORWARD_FORECAST_STATUSES)[number];
export type ForwardUnavailableForecastStatus = Exclude<
  ForwardForecastStatus,
  'forecast_available'
>;

export interface ForwardSerializationIdentity {
  serializer_id: typeof FORWARD_SERIALIZER_ID;
  serializer_version: typeof FORWARD_SERIALIZER_VERSION;
}

export interface ForwardEvidenceRef {
  input_id: string | null;
  uri_or_path: string;
  content_sha256: string | null;
  record_id: string | null;
}

export type ForwardNonEmptyEvidenceRefs = readonly [
  ForwardEvidenceRef,
  ...ForwardEvidenceRef[],
];

export interface ForwardContentRef {
  artifact_type: string;
  artifact_version: string;
  uri_or_path: string;
  content_sha256: string;
}

export interface ForwardFittedModelRef extends ForwardContentRef {
  artifact_type: typeof FORWARD_FITTED_MODEL_ARTIFACT_TYPE;
  artifact_version: typeof FORWARD_FITTED_MODEL_ARTIFACT_VERSION;
  serialization: ForwardSerializationIdentity;
  model_id: string;
  model_version: string;
  configuration_sha256: string;
  feature_names_ordered: readonly string[];
  contains: readonly [
    'intercept',
    'coefficients',
    'means',
    'standard_deviations',
    'lambda',
    'categorical_levels',
    'clamp_rule',
    'missingness_transforms',
    'training_identity',
    ...string[],
  ];
}

export type ForwardInputGovernanceStatus =
  | 'governed'
  | 'fixture'
  | 'ungoverned';

export interface ForwardInputGovernance {
  status: ForwardInputGovernanceStatus;
  decision_refs: readonly ForwardEvidenceRef[];
  marker_ref: ForwardEvidenceRef | null;
}

export type ForwardCutoffStatus =
  | 'eligible'
  | 'ineligible_after_cutoff'
  | 'unresolved';

export interface ForwardInputCutoffEvidence {
  source_timestamp_locator: string;
  normalization_rule_id: string;
  normalization_rule_sha256: string;
  record_evidence_refs: readonly ForwardEvidenceRef[];
  record_count_eligible: number;
  record_count_post_cutoff: number;
  record_count_unresolved: number;
  validator_recomputed_status: ForwardCutoffStatus;
}

export interface ForwardInputPopulationCoverage {
  row_count: number;
  matched_count: number;
  missing_count: number;
  coverage_rate: number | null;
}

export type ForwardInputAvailabilityStatus =
  | 'available'
  | 'missing'
  | 'unfetchable'
  | 'unavailable';

export type ForwardModelAdmissionStatus =
  | 'admitted'
  | 'available_not_admitted'
  | 'parked'
  | 'rejected'
  | 'unavailable';

export interface ForwardArtifactInput {
  input_id: string;
  owner_repository: string;
  owner_commit_sha: string;
  artifact_type: string;
  artifact_version: string;
  uri_or_path: string;
  content_sha256: string;
  source_as_of: string | null;
  artifact_generated_at: string | null;
  governance: ForwardInputGovernance;
  cutoff_evidence: ForwardInputCutoffEvidence;
  population: ForwardInputPopulationCoverage;
  availability_status: ForwardInputAvailabilityStatus;
  model_admission: ForwardModelAdmissionStatus;
  feature_names_admitted: readonly string[];
  limitations: readonly string[];
}

export interface ForwardScoringWeights {
  reception: 1;
  receiving_yard: 0.1;
  receiving_touchdown: 6;
  rushing_yard: 0.1;
  rushing_touchdown: 6;
  passing_yard: 0.04;
  passing_touchdown: 4;
  interception: -2;
}

export type ForwardScoringReconciliationStatus =
  ScoringReconciliationEvidenceRef['status'];
export type ForwardScoringReconciliationRef =
  ScoringReconciliationEvidenceRef;
export type ForwardPassedScoringReconciliationRef =
  ScoringReconciliationEvidenceRef & {
    readonly status: 'passed';
  };

export interface ForwardGenericFullPprProfile
  extends GenericFullPprProfileV1 {
  profile_sha256: typeof TIBER_GENERIC_FULL_PPR_V1_SHA256;
  replacement_context: null;
  source_reconciliation: ForwardPassedScoringReconciliationRef & {
    readonly scoring_profile_sha256: typeof TIBER_GENERIC_FULL_PPR_V1_SHA256;
  };
}

export type ForwardIdentityStatus =
  | 'resolved'
  | 'unresolved'
  | 'conflicting';
export type ForwardEligibilityStatus =
  | 'eligible'
  | 'ineligible'
  | 'unresolved';
export type ForwardPositionDomainStatus =
  | 'supported'
  | 'unsupported'
  | 'unresolved';

export interface ForwardProviderEligibility {
  provider: string;
  status: 'known' | 'unknown' | 'unavailable';
  positions: readonly string[];
  lineup_slots: readonly string[];
  effective_at: string | null;
  source_as_of: string | null;
  evidence_ref: ForwardEvidenceRef | null;
}

export interface ForwardPlayerIdentity {
  source_identity_ref: ForwardEvidenceRef;
  canonical_player_id: string | null;
  display_name: string;
  position: string | null;
  nfl_team_id: string | null;
  nfl_team_abbr: string | null;
  team_assignment_status:
    | 'assigned'
    | 'free_agent'
    | 'unsigned'
    | 'unknown'
    | 'unavailable';
  ownership_status: string | null;
  team_assignment_evidence_ref: ForwardEvidenceRef | null;
  provider_eligibility: readonly ForwardProviderEligibility[];
}

export type ForwardStatusReasonDimension =
  | 'identity'
  | 'population_eligibility'
  | 'position_domain'
  | 'required_input';

export type ForwardStatusReasonCode =
  | 'canonical_identity_missing'
  | 'canonical_identity_conflicting'
  | 'eligibility_evidence_missing'
  | 'population_policy_ineligible'
  | 'position_missing'
  | 'position_not_supported'
  | 'required_feature_missing'
  | 'required_feature_non_finite'
  | 'input_unavailable'
  | 'input_not_admitted'
  | 'input_cutoff_unresolved'
  | 'input_post_cutoff';

export interface ForwardStatusReason {
  dimension: ForwardStatusReasonDimension;
  code: ForwardStatusReasonCode;
  input_id: string | null;
  evidence_refs: ForwardNonEmptyEvidenceRefs;
}

export interface ForwardMissingFeature {
  feature: string;
  reason_code:
    | 'required_feature_missing'
    | 'required_feature_non_finite'
    | 'input_unavailable'
    | 'input_not_admitted'
    | 'input_cutoff_unresolved'
    | 'input_post_cutoff';
  input_id: string;
  evidence_refs: ForwardNonEmptyEvidenceRefs;
}

export interface ForwardImputedFeature {
  feature: string;
  input_id: string;
  source_value: null;
  transform_id: string;
  transformed_value: number;
  evidence_refs: ForwardNonEmptyEvidenceRefs;
}

export interface ForwardFeatureCoverage {
  status: 'complete' | 'partial' | 'unavailable';
  present: readonly string[];
  missing_required: readonly ForwardMissingFeature[];
  missing_optional: readonly ForwardMissingFeature[];
  imputed: readonly ForwardImputedFeature[];
}

export interface ForwardFeatureLineage {
  feature: string;
  input_id: string;
  source_field: string;
  source_value: string | number | boolean | null;
  transform_id: string;
  transformed_value: number;
  evidence_refs: ForwardNonEmptyEvidenceRefs;
}

export interface ForwardDriverContribution {
  feature: string;
  contribution: number;
  coefficient: number;
  transformed_value: number;
}

export type ForwardDrivers =
  | {
      status: 'explained';
      model_mechanics_only: true;
      top_positive: readonly ForwardDriverContribution[];
      top_negative: readonly ForwardDriverContribution[];
    }
  | {
      status: 'unavailable';
      model_mechanics_only: true;
      top_positive: readonly [];
      top_negative: readonly [];
    };

interface ForwardUnavailableRangeFields {
  lower_quantile: null;
  median: null;
  upper_quantile: null;
  interval_lower: null;
  interval_upper: null;
}

export interface ForwardUnavailablePointForecast
  extends ForwardUnavailableRangeFields {
  generic_ppr_points: null;
}

export interface ForwardAvailablePointForecast
  extends ForwardUnavailableRangeFields {
  generic_ppr_points: number;
}

export interface ForwardPlayerRowBase {
  artifact_type: typeof FORWARD_PLAYER_ARTIFACT_TYPE;
  artifact_version: typeof FORWARD_PLAYER_ARTIFACT_VERSION;
  run_id: string;
  output_kind: typeof FORWARD_OUTPUT_KIND;
  target_season: number;
  forecast_cutoff: string;
  configuration_sha256: string;
  scoring_profile_sha256: string;
  census_sha256: string;
  population_row_id: string;
  player: ForwardPlayerIdentity;
  replacement_context: null;
  feature_coverage: ForwardFeatureCoverage;
  feature_lineage: readonly ForwardFeatureLineage[];
  drivers: ForwardDrivers;
  limitations: readonly string[];
  actual_outcome: null;
}

export interface ForwardAvailablePlayerRow extends ForwardPlayerRowBase {
  status: {
    identity: 'resolved';
    eligibility: 'eligible';
    position_domain: 'supported';
    forecast: 'forecast_available';
  };
  status_reasons: readonly ForwardStatusReason[];
  forecast: ForwardAvailablePointForecast;
}

export interface ForwardUnavailablePlayerRow extends ForwardPlayerRowBase {
  status: {
    identity: ForwardIdentityStatus;
    eligibility: ForwardEligibilityStatus;
    position_domain: ForwardPositionDomainStatus;
    forecast: ForwardUnavailableForecastStatus;
  };
  status_reasons: readonly [
    ForwardStatusReason,
    ...ForwardStatusReason[],
  ];
  forecast: ForwardUnavailablePointForecast;
}

export type ForwardPlayerRow =
  | ForwardAvailablePlayerRow
  | ForwardUnavailablePlayerRow;

export type ForwardStatusCounts = Record<ForwardForecastStatus, number>;

export interface ForwardPopulationReconciliation {
  output_row_count: number;
  duplicate_population_row_ids: readonly string[];
  duplicate_resolved_canonical_ids: readonly string[];
  missing_population_row_ids: readonly string[];
  extra_population_row_ids: readonly string[];
  one_to_one_complete: boolean;
}

export interface ForwardDuplicateCanonicalIdPolicy {
  policy_id: string;
  policy_sha256: string;
  max_rows_per_resolved_canonical_id: number;
}

export interface ForwardPopulationCensus {
  census_artifact_ref: ForwardContentRef;
  census_sha256: string;
  scope_definition: string;
  effective_at: string;
  eligibility_policy_id: string;
  eligibility_policy_sha256: string;
  duplicate_canonical_id_policy: ForwardDuplicateCanonicalIdPolicy;
  row_count: number;
  eligible_target_count: number;
  status_counts: ForwardStatusCounts;
  reconciliation: ForwardPopulationReconciliation;
}

export interface ForwardUnavailableUncertainty {
  status: typeof FORWARD_UNCERTAINTY_STATUS;
  method_id: null;
  method_version: null;
  lower_quantile_level: null;
  median_quantile_level: null;
  upper_quantile_level: null;
  nominal_interval_coverage: null;
  calibration_population: null;
  calibration_artifact_ref: null;
  empirical_coverage_by_origin: readonly [];
  empirical_coverage_by_position: readonly [];
  limitations: readonly string[];
}

export interface ForwardTargetDefinition {
  target_id: string;
  description: string;
  target_season: number;
  regular_season_only: true;
  week_inclusion_rule: string;
  season_completeness_rule: string;
  aggregation_rule: string;
  scoring_profile_id: typeof FORWARD_SCORING_PROFILE_ID;
  outcome_field: 'actual_outcome';
  forward_outcome_must_be_null: true;
}

export interface ForwardHistoricalOrigin {
  origin_id: string;
  input_seasons: readonly number[];
  target_season: number;
  origin_cutoff: string;
  input_artifact_sha256: string;
  target_artifact_sha256: string;
}

export interface ForwardEvaluationDesign {
  design_id: string;
  design_sha256: string;
  historical_origins: readonly ForwardHistoricalOrigin[];
  model_selection_partition: string;
  final_evaluation_partition: string;
  split_method: string;
  fold_grouping: string;
  hyperparameter_selection: string;
  final_origin_not_used_for_tuning: true;
  baseline_definitions: readonly string[];
}

export interface ForwardHistoricalValidationSummary {
  evaluation_artifact_refs: readonly ForwardContentRef[];
  overall_metrics: Readonly<Record<string, number>>;
  position_metrics: Readonly<
    Partial<Record<ForwardSupportedPosition, Readonly<Record<string, number>>>>
  >;
  calibration_metrics: Readonly<Record<string, number>>;
  sanity_controls: readonly string[];
  limitations: readonly string[];
}

export interface ForwardModelDescriptor {
  model_id: string;
  model_version: string;
  configuration_sha256: string;
  model_type: 'ridge';
  hyperparameters: {
    lambda: number;
  };
  feature_set_id: string;
  feature_names_ordered: readonly string[];
  admitted_capabilities: readonly string[];
}

export interface ForwardConfigurationDecisionFreeze {
  decision_id: string;
  frozen_at: string;
  fact_available_at: string;
  evidence_refs: ForwardNonEmptyEvidenceRefs;
  configuration_sha256: string;
}

export interface ForwardSourceCodeDecisionFreeze {
  decision_id: string;
  frozen_at: string;
  fact_available_at: string;
  evidence_refs: ForwardNonEmptyEvidenceRefs;
  git_commit_sha: string;
}

export interface ForwardDecisionFreezes {
  configuration: ForwardConfigurationDecisionFreeze;
  source_code: ForwardSourceCodeDecisionFreeze;
}

export interface ForwardFinalFit {
  historical_row_count: number;
  historical_target_seasons: readonly number[];
  training_population_sha256: string;
  training_data_sha256: string;
  model_artifact_ref: ForwardFittedModelRef;
}

export interface ForwardOutputRef extends ForwardContentRef {
  artifact_type: typeof FORWARD_PLAYER_ARTIFACT_TYPE;
  artifact_version: typeof FORWARD_PLAYER_ARTIFACT_VERSION;
  row_count: number;
}

interface ForwardManifestIdentity {
  artifact_type: typeof FORWARD_MANIFEST_ARTIFACT_TYPE;
  artifact_version: typeof FORWARD_MANIFEST_ARTIFACT_VERSION;
  document_kind: 'execution_manifest';
  output_kind: typeof FORWARD_OUTPUT_KIND;
  run_id: string;
  target_season: number;
  forecast_cutoff: string;
  cutoff_rule: typeof FORWARD_CUTOFF_RULE;
  generated_at: string;
  repository: 'Prometheus-Frameworks/TIBER-Forecast';
  git_commit_sha: string;
  lane_name: 'seasonal-fantasy-point-forecast';
  lane_version: string;
  serialization: ForwardSerializationIdentity;
}

interface ForwardCandidateSafetyLiterals {
  candidate_only: true;
  production_ready: false;
  consumer_eligibility: typeof FORWARD_CONSUMER_ELIGIBILITY;
  forecast_uncertainty: ForwardUnavailableUncertainty;
  sample_only?: never;
}

export interface ForwardSucceededExecutionManifest
  extends ForwardManifestIdentity,
    ForwardCandidateSafetyLiterals {
  run_status: 'succeeded';
  target_definition: ForwardTargetDefinition;
  evaluation_design: ForwardEvaluationDesign;
  historical_validation_summary: ForwardHistoricalValidationSummary;
  model: ForwardModelDescriptor;
  decision_freezes: ForwardDecisionFreezes;
  final_fit: ForwardFinalFit;
  scoring_profile: ForwardGenericFullPprProfile;
  artifact_inputs: readonly ForwardArtifactInput[];
  population_census: ForwardPopulationCensus;
  outputs: readonly [ForwardOutputRef, ...ForwardOutputRef[]];
  previous_run_id: string | null;
  limitations: readonly string[];
  failure?: never;
}

export interface ForwardRunFailure {
  code: string;
  message: string;
  stage:
    | 'input_validation'
    | 'final_fit'
    | 'inference'
    | 'candidate_validation'
    | 'artifact_write';
  details: Readonly<Record<string, unknown>>;
}

export interface ForwardAttemptedPins {
  git_commit_sha: string;
  configuration_sha256: string;
  scoring_profile_sha256: string;
  input_sha256: Readonly<Record<string, string>>;
  census_sha256: string;
}

export interface ForwardFailedExecutionManifest
  extends ForwardManifestIdentity,
    ForwardCandidateSafetyLiterals {
  run_status: 'failed';
  failure: ForwardRunFailure;
  attempted_pins: ForwardAttemptedPins;
  outputs: readonly [];
  target_definition?: never;
  evaluation_design?: never;
  historical_validation_summary?: never;
  model?: never;
  final_fit?: never;
  scoring_profile?: never;
  artifact_inputs?: never;
  population_census?: never;
  previous_run_id?: never;
  limitations: readonly string[];
}

export interface ForwardSchemaExampleManifest {
  artifact_type: typeof FORWARD_MANIFEST_ARTIFACT_TYPE;
  artifact_version: typeof FORWARD_SCHEMA_EXAMPLE_MANIFEST_VERSION;
  document_kind: 'schema_example';
  sample_only: true;
  run_status: 'not_executed';
  consumer_eligibility: typeof FORWARD_CONSUMER_ELIGIBILITY;
  production_ready: false;
  output_kind: typeof FORWARD_OUTPUT_KIND;
  forecast_cutoff: null;
  population_census: {
    row_count: 0;
    eligible_target_count: 0;
    reconciliation: {
      output_row_count: 0;
      one_to_one_complete: false;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  outputs: readonly [];
  candidate_only?: never;
  failure?: never;
  [key: string]: unknown;
}

export type ForwardExecutionManifest =
  | ForwardSucceededExecutionManifest
  | ForwardFailedExecutionManifest;

export type ForwardManifestDocument =
  | ForwardSchemaExampleManifest
  | ForwardExecutionManifest;

export type ForwardCandidateValidationErrorCode =
  | 'document_variant_mixed'
  | 'schema_example_not_execution'
  | 'candidate_safety_literal_invalid'
  | 'manifest_invalid'
  | 'player_rows_invalid'
  | 'fitted_model_invalid'
  | 'pin_mismatch'
  | 'cutoff_invalid'
  | 'population_reconciliation_invalid'
  | 'scoring_reconciliation_invalid'
  | 'canonical_bytes_invalid';

export interface ForwardCandidateValidationIssue {
  code: ForwardCandidateValidationErrorCode;
  path: string;
  message: string;
}

export interface ForwardLocalCandidateValidationResult {
  validator_id: string;
  validator_version: string;
  valid: boolean;
  candidate_only: true;
  promotion_authority: false;
  manifest_sha256: string | null;
  player_rows_sha256: string | null;
  fitted_model_sha256: string | null;
  errors: readonly ForwardCandidateValidationIssue[];
  warnings: readonly ForwardCandidateValidationIssue[];
}

type ForwardExecutionDocumentDiscriminant = {
  artifact_type: typeof FORWARD_MANIFEST_ARTIFACT_TYPE;
  artifact_version: typeof FORWARD_MANIFEST_ARTIFACT_VERSION;
  document_kind: 'execution_manifest';
  run_status: 'succeeded' | 'failed';
  output_kind: typeof FORWARD_OUTPUT_KIND;
  candidate_only: true;
  production_ready: false;
  consumer_eligibility: typeof FORWARD_CONSUMER_ELIGIBILITY;
  forecast_cutoff: string;
  forecast_uncertainty: {
    status: typeof FORWARD_UNCERTAINTY_STATUS;
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const owns = (value: Record<string, unknown>, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

const hasCandidateSafetyLiterals = (
  value: Record<string, unknown>,
): boolean => {
  if (value.candidate_only !== true) return false;
  if (value.production_ready !== false) return false;
  if (value.consumer_eligibility !== FORWARD_CONSUMER_ELIGIBILITY) {
    return false;
  }
  if (value.output_kind !== FORWARD_OUTPUT_KIND) return false;
  if (owns(value, 'sample_only')) return false;
  if (!isRecord(value.forecast_uncertainty)) return false;
  return value.forecast_uncertainty.status === FORWARD_UNCERTAINTY_STATUS;
};

/**
 * Recognizes the proposal sample variant without treating it as an execution.
 * This is intentionally a discriminant/safety check, not a complete artifact
 * validator.
 */
export const isForwardSchemaExampleDocument = (
  value: unknown,
): value is ForwardSchemaExampleManifest => {
  if (!isRecord(value)) return false;
  if (value.artifact_type !== FORWARD_MANIFEST_ARTIFACT_TYPE) return false;
  if (value.artifact_version !== FORWARD_SCHEMA_EXAMPLE_MANIFEST_VERSION) {
    return false;
  }
  if (value.document_kind !== 'schema_example') return false;
  if (value.sample_only !== true || value.run_status !== 'not_executed') {
    return false;
  }
  if (value.consumer_eligibility !== FORWARD_CONSUMER_ELIGIBILITY) {
    return false;
  }
  if (value.production_ready !== false || value.output_kind !== FORWARD_OUTPUT_KIND) {
    return false;
  }
  if (value.forecast_cutoff !== null || owns(value, 'candidate_only')) {
    return false;
  }
  if (!Array.isArray(value.outputs) || value.outputs.length !== 0) return false;
  if (!isRecord(value.population_census)) return false;
  if (
    value.population_census.row_count !== 0 ||
    value.population_census.eligible_target_count !== 0
  ) {
    return false;
  }
  if (!isRecord(value.population_census.reconciliation)) return false;
  return (
    value.population_census.reconciliation.output_row_count === 0 &&
    value.population_census.reconciliation.one_to_one_complete === false
  );
};

/**
 * Checks only the strict execution discriminant and non-promotable candidate
 * literals. Full schema, pin, population, and byte validation belongs to the
 * candidate validator.
 */
export const isForwardExecutionDocument = (
  value: unknown,
): value is ForwardExecutionDocumentDiscriminant => {
  if (!isRecord(value)) return false;
  if (value.artifact_type !== FORWARD_MANIFEST_ARTIFACT_TYPE) return false;
  if (value.artifact_version !== FORWARD_MANIFEST_ARTIFACT_VERSION) return false;
  if (value.document_kind !== 'execution_manifest') return false;
  if (value.run_status !== 'succeeded' && value.run_status !== 'failed') {
    return false;
  }
  if (typeof value.forecast_cutoff !== 'string' || value.forecast_cutoff.length === 0) {
    return false;
  }
  if (!hasCandidateSafetyLiterals(value)) return false;

  if (value.run_status === 'succeeded') {
    return !owns(value, 'failure');
  }

  if (!isRecord(value.failure)) return false;
  if (typeof value.failure.code !== 'string' || value.failure.code.length === 0) {
    return false;
  }
  if (
    typeof value.failure.message !== 'string' ||
    value.failure.message.length === 0
  ) {
    return false;
  }
  return Array.isArray(value.outputs) && value.outputs.length === 0;
};

export type ForwardManifestDocumentKind =
  | 'schema_example'
  | 'execution_manifest'
  | 'invalid';

export const classifyForwardManifestDocument = (
  value: unknown,
): ForwardManifestDocumentKind => {
  if (isForwardSchemaExampleDocument(value)) return 'schema_example';
  if (isForwardExecutionDocument(value)) return 'execution_manifest';
  return 'invalid';
};
