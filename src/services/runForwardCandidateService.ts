import {
  FORWARD_CONSUMER_ELIGIBILITY,
  FORWARD_CUTOFF_RULE,
  FORWARD_FITTED_MODEL_ARTIFACT_TYPE,
  FORWARD_FITTED_MODEL_ARTIFACT_VERSION,
  FORWARD_FORECAST_STATUSES,
  FORWARD_MANIFEST_ARTIFACT_TYPE,
  FORWARD_MANIFEST_ARTIFACT_VERSION,
  FORWARD_OUTPUT_KIND,
  FORWARD_PLAYER_ARTIFACT_TYPE,
  FORWARD_PLAYER_ARTIFACT_VERSION,
  FORWARD_SCORING_PROFILE_ID,
  FORWARD_SERIALIZER_ID,
  FORWARD_SERIALIZER_VERSION,
  FORWARD_SUPPORTED_POSITIONS,
  FORWARD_UNCERTAINTY_STATUS,
  type ForwardArtifactInput,
  type ForwardDecisionFreezes,
  type ForwardEvidenceRef,
  type ForwardFeatureCoverage,
  type ForwardFeatureLineage,
  type ForwardHistoricalValidationSummary,
  type ForwardInputAvailabilityStatus,
  type ForwardInputGovernanceStatus,
  type ForwardModelAdmissionStatus,
  type ForwardNonEmptyEvidenceRefs,
  type ForwardPlayerIdentity,
  type ForwardPlayerRow,
  type ForwardPopulationCensus,
  type ForwardStatusCounts,
  type ForwardStatusReason,
  type ForwardSucceededExecutionManifest,
  type ForwardTargetDefinition,
  type ForwardEvaluationDesign,
} from '../contracts/forwardSeasonalPpr.js';
import {
  TIBER_GENERIC_FULL_PPR_V1,
  TIBER_GENERIC_FULL_PPR_V1_PROFILE_REF,
  TIBER_GENERIC_FULL_PPR_V1_SHA256,
  resolveGenericFullPprCompatibility,
  validateScoringReconciliationEvidence,
  type GenericFullPprProfileRef,
  type ScoringReconciliationEvidenceRef,
} from '../contracts/genericFullPprProfile.js';
import {
  fitSeasonalForwardModel,
  FUTURE_FORWARD_INFERENCE_ROW_SCHEMA_VERSION,
  predictSeasonalForward,
  validateFrozenForwardRidgeConfiguration,
  validateFutureInferenceRows,
  type FittedSeasonalForwardRidgeArtifactV1,
  type FrozenForwardRidgeConfigurationPackageV1,
  type FutureForwardInferenceRowV1,
  type HistoricalForwardTrainingRowV1,
} from '../models/seasonal/forwardRidgeModel.js';
import {
  canonicalForwardJsonBytes,
  canonicalForwardJsonlBytes,
  compareForwardCanonicalStrings,
  forwardArtifactSha256,
} from '../serialization/canonicalForwardArtifacts.js';
import {
  serviceFailure,
  serviceSuccess,
  type ServiceError,
  type ServiceResult,
} from './result.js';

export const FORWARD_CANDIDATE_MANIFEST_FILENAME =
  'forward_candidate_manifest.json' as const;
export const FORWARD_CANDIDATE_PLAYER_ROWS_FILENAME =
  'forward_candidate_players.jsonl' as const;
export const FORWARD_CANDIDATE_FITTED_MODEL_FILENAME =
  'forward_candidate_fitted_model.json' as const;

const SHA256 = /^[0-9a-f]{64}$/;
const GIT_SHA = /^[0-9a-f]{40}$/;

export interface ForwardCutoffRecordEvidence {
  record_id: string;
  fact_available_at: string | null;
  evidence_ref: ForwardEvidenceRef;
}

export interface ForwardPinnedPackageContent<T> {
  payload: T;
  cutoff_records: readonly ForwardCutoffRecordEvidence[];
}

export interface ForwardPinnedInputPackage<T> {
  input_id: string;
  owner_repository: string;
  owner_commit_sha: string;
  artifact_type: string;
  artifact_version: string;
  uri_or_path: string;
  content_sha256: string;
  content: ForwardPinnedPackageContent<T>;
  source_as_of: string | null;
  artifact_generated_at: string | null;
  governance_status: ForwardInputGovernanceStatus;
  governance_decision_refs: readonly ForwardEvidenceRef[];
  governance_marker_ref: ForwardEvidenceRef | null;
  availability_status: ForwardInputAvailabilityStatus;
  model_admission: ForwardModelAdmissionStatus;
  feature_names_admitted: readonly string[];
  source_timestamp_locator: string;
  normalization_rule_id: string;
  normalization_rule_sha256: string;
  population: {
    row_count: number;
    matched_count: number;
    missing_count: number;
  };
  limitations: readonly string[];
}

export interface ForwardCensusRow {
  population_row_id: string;
  player: ForwardPlayerIdentity;
  identity_status: 'resolved' | 'unresolved' | 'conflicting';
  eligibility_status: 'eligible' | 'ineligible' | 'unresolved';
  position_domain_status: 'supported' | 'unsupported' | 'unresolved';
  status_evidence_refs: ForwardNonEmptyEvidenceRefs;
}

export interface ForwardCensusPayload {
  rows: readonly ForwardCensusRow[];
  scope_definition: string;
  effective_at: string;
  eligibility_policy_id: string;
  eligibility_policy_sha256: string;
  duplicate_canonical_id_policy: {
    policy_id: string;
    policy_sha256: string;
    max_rows_per_resolved_canonical_id: number;
  };
}

export interface ForwardTrainingPayload {
  rows: readonly HistoricalForwardTrainingRowV1[];
}

export interface ForwardInferencePayload {
  rows: readonly ForwardFutureFeatureRow[];
}

/**
 * Pinned target-free source row. Model-facing run/config/package/census pins are
 * attached only after these package bytes are hashed, avoiding a self-hash.
 */
export interface ForwardFutureFeatureRow {
  population_row_id: string;
  input_season: number;
  target_season: number;
  position: string;
  source_features: Record<string, number | null>;
  source_missingness: Record<string, boolean>;
}

export interface ForwardExpectedPins {
  git_commit_sha: string;
  configuration_sha256: string;
  scoring_profile_sha256: string;
  input_sha256: Readonly<Record<string, string>>;
  census_sha256: string;
}

export interface RunForwardCandidateInput {
  run_id: string;
  target_season: number;
  input_season: number;
  forecast_cutoff: string;
  generated_at: string;
  git_commit_sha: string;
  lane_version: string;
  frozen_configuration: FrozenForwardRidgeConfigurationPackageV1;
  decision_freezes: ForwardDecisionFreezes;
  historical_training_package: ForwardPinnedInputPackage<ForwardTrainingPayload>;
  future_feature_package: ForwardPinnedInputPackage<ForwardInferencePayload>;
  census_package: ForwardPinnedInputPackage<ForwardCensusPayload>;
  scoring_profile_ref: GenericFullPprProfileRef;
  scoring_reconciliation: ScoringReconciliationEvidenceRef;
  scoring_input_ids: readonly string[];
  expected_pins: ForwardExpectedPins;
  target_definition: ForwardTargetDefinition;
  evaluation_design: ForwardEvaluationDesign;
  historical_validation_summary: ForwardHistoricalValidationSummary;
  admitted_capabilities: readonly string[];
  limitations: readonly string[];
}

export interface ForwardCandidateArtifactBytes {
  manifest: Buffer;
  player_rows: Buffer;
  fitted_model: Buffer;
}

export interface ForwardCandidateArtifactHashes {
  manifest_sha256: string;
  player_rows_sha256: string;
  fitted_model_sha256: string;
}

export interface ForwardCandidateBundle {
  manifest: ForwardSucceededExecutionManifest;
  player_rows: ForwardPlayerRow[];
  fitted_model: FittedSeasonalForwardRidgeArtifactV1;
  bytes: ForwardCandidateArtifactBytes;
  hashes: ForwardCandidateArtifactHashes;
}

const error = (code: string, message: string, details?: unknown): ServiceError => ({
  code,
  message,
  ...(details === undefined ? {} : { details }),
});

const isExactUtcInstant = (value: unknown): value is string => {
  if (typeof value !== 'string') return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
};

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const evidenceRefIsUsable = (value: ForwardEvidenceRef): boolean =>
  isNonEmptyString(value.uri_or_path) &&
  (value.content_sha256 === null || SHA256.test(value.content_sha256));

const evidenceRefIsPinned = (value: ForwardEvidenceRef): boolean =>
  evidenceRefIsUsable(value) &&
  typeof value.content_sha256 === 'string' &&
  SHA256.test(value.content_sha256);

export const computeForwardPinnedPackageSha256 = <T>(
  packageValue: Pick<ForwardPinnedInputPackage<T>, 'content'>,
): string => forwardArtifactSha256(canonicalForwardJsonBytes(packageValue.content));

const cutoffCounts = (
  records: readonly ForwardCutoffRecordEvidence[],
  forecastCutoff: string,
): {
  eligible: number;
  post_cutoff: number;
  unresolved: number;
  status: 'eligible' | 'ineligible_after_cutoff' | 'unresolved';
} => {
  const cutoff = Date.parse(forecastCutoff);
  let eligible = 0;
  let postCutoff = 0;
  let unresolved = 0;
  for (const record of records) {
    if (
      !isNonEmptyString(record.record_id) ||
      !evidenceRefIsPinned(record.evidence_ref) ||
      !isExactUtcInstant(record.fact_available_at)
    ) {
      unresolved += 1;
    } else if (Date.parse(record.fact_available_at) > cutoff) {
      postCutoff += 1;
    } else {
      eligible += 1;
    }
  }
  return {
    eligible,
    post_cutoff: postCutoff,
    unresolved,
    status:
      unresolved > 0
        ? 'unresolved'
        : postCutoff > 0
          ? 'ineligible_after_cutoff'
          : 'eligible',
  };
};

const validatePackage = (
  packageValue: ForwardPinnedInputPackage<unknown>,
  forecastCutoff: string,
): ServiceError[] => {
  const errors: ServiceError[] = [];
  if (!isNonEmptyString(packageValue.input_id)) {
    errors.push(error('FORWARD_INPUT_ID_INVALID', 'Every pinned package requires a non-empty input_id.'));
  }
  if (!GIT_SHA.test(packageValue.owner_commit_sha)) {
    errors.push(error('FORWARD_INPUT_OWNER_COMMIT_INVALID', `${packageValue.input_id} owner commit is not a 40-character Git SHA.`));
  }
  if (!SHA256.test(packageValue.content_sha256)) {
    errors.push(error('FORWARD_INPUT_HASH_INVALID', `${packageValue.input_id} content_sha256 is invalid.`));
  } else {
    const computed = computeForwardPinnedPackageSha256(packageValue);
    if (computed !== packageValue.content_sha256) {
      errors.push(error('FORWARD_INPUT_PIN_MISMATCH', `${packageValue.input_id} bytes do not match its declared content hash.`, {
        declared: packageValue.content_sha256,
        computed,
      }));
    }
  }
  if (packageValue.governance_status !== 'governed') {
    errors.push(error('FORWARD_INPUT_UNGOVERNED', `${packageValue.input_id} is not governed.`));
  }
  if (packageValue.governance_decision_refs.length === 0 || !packageValue.governance_decision_refs.every(evidenceRefIsPinned)) {
    errors.push(error('FORWARD_INPUT_GOVERNANCE_EVIDENCE_MISSING', `${packageValue.input_id} lacks usable governance evidence.`));
  }
  if (!packageValue.governance_marker_ref || !evidenceRefIsPinned(packageValue.governance_marker_ref)) {
    errors.push(error('FORWARD_INPUT_GOVERNANCE_MARKER_MISSING', `${packageValue.input_id} claims governed status without a pinned governance marker.`));
  }
  if (packageValue.availability_status !== 'available') {
    errors.push(error('FORWARD_INPUT_UNAVAILABLE', `${packageValue.input_id} is not available.`));
  }
  if (packageValue.model_admission !== 'admitted') {
    errors.push(error('FORWARD_INPUT_NOT_ADMITTED', `${packageValue.input_id} is not admitted.`));
  }
  if (
    !SHA256.test(packageValue.normalization_rule_sha256) ||
    !isNonEmptyString(packageValue.normalization_rule_id) ||
    !isNonEmptyString(packageValue.source_timestamp_locator)
  ) {
    errors.push(error('FORWARD_INPUT_CUTOFF_RULE_INVALID', `${packageValue.input_id} has an invalid cutoff-normalization identity.`));
  }
  if (packageValue.content.cutoff_records.length === 0) {
    errors.push(error('FORWARD_INPUT_CUTOFF_UNRESOLVED', `${packageValue.input_id} has no record-level cutoff evidence.`));
  } else {
    const counts = cutoffCounts(packageValue.content.cutoff_records, forecastCutoff);
    if (counts.status === 'unresolved') {
      errors.push(error('FORWARD_INPUT_CUTOFF_UNRESOLVED', `${packageValue.input_id} contains unresolved availability evidence.`, counts));
    }
    if (counts.status === 'ineligible_after_cutoff') {
      errors.push(error('FORWARD_INPUT_POST_CUTOFF', `${packageValue.input_id} contains facts first available after the inclusive cutoff.`, counts));
    }
  }
  return errors;
};

const packageToManifestInput = (
  packageValue: ForwardPinnedInputPackage<unknown>,
  forecastCutoff: string,
): ForwardArtifactInput => {
  const counts = cutoffCounts(packageValue.content.cutoff_records, forecastCutoff);
  const rowCount = packageValue.population.row_count;
  return {
    input_id: packageValue.input_id,
    owner_repository: packageValue.owner_repository,
    owner_commit_sha: packageValue.owner_commit_sha,
    artifact_type: packageValue.artifact_type,
    artifact_version: packageValue.artifact_version,
    uri_or_path: packageValue.uri_or_path,
    content_sha256: packageValue.content_sha256,
    source_as_of: packageValue.source_as_of,
    artifact_generated_at: packageValue.artifact_generated_at,
    governance: {
      status: packageValue.governance_status,
      decision_refs: [...packageValue.governance_decision_refs],
      marker_ref: packageValue.governance_marker_ref,
    },
    cutoff_evidence: {
      source_timestamp_locator: packageValue.source_timestamp_locator,
      normalization_rule_id: packageValue.normalization_rule_id,
      normalization_rule_sha256: packageValue.normalization_rule_sha256,
      record_evidence_refs: packageValue.content.cutoff_records.map((record) => record.evidence_ref),
      record_count_eligible: counts.eligible,
      record_count_post_cutoff: counts.post_cutoff,
      record_count_unresolved: counts.unresolved,
      validator_recomputed_status: counts.status,
    },
    population: {
      row_count: rowCount,
      matched_count: packageValue.population.matched_count,
      missing_count: packageValue.population.missing_count,
      coverage_rate: rowCount === 0 ? null : packageValue.population.matched_count / rowCount,
    },
    availability_status: packageValue.availability_status,
    model_admission: packageValue.model_admission,
    feature_names_admitted: [...packageValue.feature_names_admitted],
    limitations: [...packageValue.limitations],
  };
};

const validateDecisionFreezes = (
  freezes: ForwardDecisionFreezes,
  forecastCutoff: string,
  configurationSha256: string,
  gitCommitSha: string,
): ServiceError[] => {
  const errors: ServiceError[] = [];
  const cutoff = Date.parse(forecastCutoff);
  for (const [kind, freeze] of Object.entries(freezes) as Array<
    ['configuration' | 'source_code', ForwardDecisionFreezes['configuration'] | ForwardDecisionFreezes['source_code']]
  >) {
    if (
      !isNonEmptyString(freeze.decision_id) ||
      !isExactUtcInstant(freeze.frozen_at) ||
      !isExactUtcInstant(freeze.fact_available_at) ||
      freeze.evidence_refs.length === 0 ||
      !freeze.evidence_refs.every(evidenceRefIsPinned)
    ) {
      errors.push(error('FORWARD_DECISION_FREEZE_EVIDENCE_INVALID', `${kind} decision freeze evidence is incomplete.`));
      continue;
    }
    if (Date.parse(freeze.frozen_at) > cutoff || Date.parse(freeze.fact_available_at) > cutoff) {
      errors.push(error('FORWARD_DECISION_FREEZE_POST_CUTOFF', `${kind} was not frozen and available by the inclusive forecast cutoff.`));
    }
  }
  if (freezes.configuration.configuration_sha256 !== configurationSha256) {
    errors.push(error('FORWARD_CONFIGURATION_FREEZE_PIN_MISMATCH', 'Configuration freeze does not bind the frozen configuration hash.'));
  }
  if (freezes.source_code.git_commit_sha !== gitCommitSha) {
    errors.push(error('FORWARD_CODE_FREEZE_PIN_MISMATCH', 'Source-code freeze does not bind the execution Git SHA.'));
  }
  return errors;
};

const unavailableForecast = () => ({
  generic_ppr_points: null,
  lower_quantile: null,
  median: null,
  upper_quantile: null,
  interval_lower: null,
  interval_upper: null,
} as const);

const unavailableCoverage = (): ForwardFeatureCoverage => ({
  status: 'unavailable',
  present: [],
  missing_required: [],
  missing_optional: [],
  imputed: [],
});

const unavailableDrivers = () => ({
  status: 'unavailable' as const,
  model_mechanics_only: true as const,
  top_positive: [] as const,
  top_negative: [] as const,
});

const statusReason = (
  code: ForwardStatusReason['code'],
  dimension: ForwardStatusReason['dimension'],
  evidenceRefs: ForwardNonEmptyEvidenceRefs,
  inputId: string | null = null,
): ForwardStatusReason => ({
  code,
  dimension,
  input_id: inputId,
  evidence_refs: evidenceRefs,
});

const basePlayerRow = (
  input: RunForwardCandidateInput,
  censusRow: ForwardCensusRow,
): Omit<ForwardPlayerRow, 'status' | 'status_reasons' | 'forecast'> => ({
  artifact_type: FORWARD_PLAYER_ARTIFACT_TYPE,
  artifact_version: FORWARD_PLAYER_ARTIFACT_VERSION,
  run_id: input.run_id,
  output_kind: FORWARD_OUTPUT_KIND,
  target_season: input.target_season,
  forecast_cutoff: input.forecast_cutoff,
  configuration_sha256: input.frozen_configuration.configuration_sha256,
  scoring_profile_sha256: TIBER_GENERIC_FULL_PPR_V1_SHA256,
  census_sha256: input.census_package.content_sha256,
  population_row_id: censusRow.population_row_id,
  player: structuredClone(censusRow.player),
  replacement_context: null,
  feature_coverage: unavailableCoverage(),
  feature_lineage: [],
  drivers: unavailableDrivers(),
  limitations: [],
  actual_outcome: null,
});

const unavailableRow = (
  input: RunForwardCandidateInput,
  censusRow: ForwardCensusRow,
  forecastStatus: Exclude<ForwardPlayerRow['status']['forecast'], 'forecast_available'>,
  reason: ForwardStatusReason,
  featureCoverage: ForwardFeatureCoverage = unavailableCoverage(),
): ForwardPlayerRow => ({
  ...basePlayerRow(input, censusRow),
  status: {
    identity: censusRow.identity_status,
    eligibility: censusRow.eligibility_status,
    position_domain: censusRow.position_domain_status,
    forecast: forecastStatus,
  },
  status_reasons: [reason],
  forecast: unavailableForecast(),
  feature_coverage: featureCoverage,
  drivers: unavailableDrivers(),
});

const primaryUnavailableRow = (
  input: RunForwardCandidateInput,
  censusRow: ForwardCensusRow,
): ForwardPlayerRow | null => {
  const evidence = censusRow.status_evidence_refs;
  if (censusRow.identity_status !== 'resolved') {
    return unavailableRow(input, censusRow, 'identity_unresolved', statusReason(
      censusRow.identity_status === 'conflicting' ? 'canonical_identity_conflicting' : 'canonical_identity_missing',
      'identity',
      evidence,
    ));
  }
  if (censusRow.eligibility_status === 'unresolved') {
    return unavailableRow(input, censusRow, 'eligibility_unresolved', statusReason(
      'eligibility_evidence_missing',
      'population_eligibility',
      evidence,
    ));
  }
  if (censusRow.eligibility_status === 'ineligible') {
    return unavailableRow(input, censusRow, 'population_ineligible', statusReason(
      'population_policy_ineligible',
      'population_eligibility',
      evidence,
    ));
  }
  if (censusRow.position_domain_status === 'unresolved') {
    return unavailableRow(input, censusRow, 'position_domain_unresolved', statusReason(
      'position_missing',
      'position_domain',
      evidence,
    ));
  }
  if (censusRow.position_domain_status === 'unsupported') {
    return unavailableRow(input, censusRow, 'unsupported_position_domain', statusReason(
      'position_not_supported',
      'position_domain',
      evidence,
    ));
  }
  return null;
};

const featureEvidence = (
  packageValue: ForwardPinnedInputPackage<ForwardInferencePayload>,
  populationRowId: string,
): ForwardNonEmptyEvidenceRefs => [{
  input_id: packageValue.input_id,
  uri_or_path: packageValue.uri_or_path,
  content_sha256: packageValue.content_sha256,
  record_id: populationRowId,
}];

const buildAvailableRow = (
  input: RunForwardCandidateInput,
  censusRow: ForwardCensusRow,
  inferenceRow: FutureForwardInferenceRowV1,
  fittedModel: FittedSeasonalForwardRidgeArtifactV1,
): ServiceResult<ForwardPlayerRow> => {
  const prediction = predictSeasonalForward(fittedModel, inferenceRow, {
    run_id: input.run_id,
    configuration_sha256: input.frozen_configuration.configuration_sha256,
    input_package_sha256: input.future_feature_package.content_sha256,
    census_sha256: input.census_package.content_sha256,
    target_season: input.target_season,
  });
  const evidence = featureEvidence(input.future_feature_package, censusRow.population_row_id);
  if (!prediction.ok) {
    const missingRequired = fittedModel.missingness_transforms
      .filter((transform) =>
        transform.policy === 'reject_row' &&
        inferenceRow.source_missingness[transform.feature],
      )
      .map((transform) => ({
        feature: transform.feature,
        reason_code: 'required_feature_missing' as const,
        input_id: input.future_feature_package.input_id,
        evidence_refs: evidence,
      }));
    return serviceSuccess(unavailableRow(
      input,
      censusRow,
      'unavailable_missing_required_inputs',
      statusReason(
        'required_feature_missing',
        'required_input',
        evidence,
        input.future_feature_package.input_id,
      ),
      {
        status: 'unavailable',
        present: Object.keys(inferenceRow.source_features)
          .filter((feature) => inferenceRow.source_features[feature] !== null)
          .sort(compareForwardCanonicalStrings),
        missing_required: missingRequired,
        missing_optional: [],
        imputed: [],
      },
    ));
  }

  const point = prediction.data.point_forecast;
  if (!Number.isFinite(point)) {
    return serviceFailure(error('FORWARD_FORECAST_NON_FINITE', `Inference for ${censusRow.population_row_id} was non-finite.`));
  }

  const transformsByFeature = new Map(
    fittedModel.missingness_transforms.map((transform) => [transform.feature, transform]),
  );
  const configurationFeaturesByName = new Map(
    input.frozen_configuration.configuration.ordered_numeric_features.map((feature) => [feature.name, feature]),
  );
  const imputed = fittedModel.missingness_transforms
    .filter((transform) => inferenceRow.source_missingness[transform.feature])
    .map((transform) => ({
      feature: transform.feature,
      input_id: configurationFeaturesByName.get(transform.feature)?.source_input_id ??
        input.future_feature_package.input_id,
      source_value: null,
      transform_id: configurationFeaturesByName.get(transform.feature)?.transform_id ??
        transform.policy,
      transformed_value: transform.imputation_value as number,
      evidence_refs: evidence,
    }));
  const featureCoverage: ForwardFeatureCoverage = {
    status: imputed.length === 0 ? 'complete' : 'partial',
    present: [
      ...Object.keys(inferenceRow.source_features)
        .filter((feature) => inferenceRow.source_features[feature] !== null),
      'position',
    ].sort(compareForwardCanonicalStrings),
    missing_required: [],
    missing_optional: [],
    imputed,
  };
  const featureLineage: ForwardFeatureLineage[] = prediction.data.contributions.map((contribution) => {
    const sourceField = contribution.kind === 'position'
      ? 'position'
      : contribution.feature.replace(/__missing$/, '');
    const configuredFeature = configurationFeaturesByName.get(sourceField);
    return {
      feature: contribution.feature,
      input_id: configuredFeature?.source_input_id ?? input.future_feature_package.input_id,
      source_field: contribution.kind === 'position'
        ? 'position'
        : (configuredFeature?.source_field ?? sourceField),
      source_value: contribution.kind === 'position'
        ? inferenceRow.position
        : inferenceRow.source_features[sourceField] ?? null,
      transform_id: contribution.kind === 'position'
        ? 'categorical_one_hot'
        : (configuredFeature?.transform_id ??
          transformsByFeature.get(sourceField)?.policy ??
          'population_zscore'),
      transformed_value: contribution.transformed_value,
      evidence_refs: evidence,
    };
  });
  const contributions = prediction.data.contributions.map((contribution) => ({
    feature: contribution.feature,
    contribution: contribution.contribution,
    coefficient: contribution.coefficient,
    transformed_value: contribution.transformed_value,
  }));
  const positive = contributions
    .filter((contribution) => contribution.contribution > 0)
    .sort((left, right) =>
      right.contribution - left.contribution ||
      compareForwardCanonicalStrings(left.feature, right.feature),
    )
    .slice(0, 3);
  const negative = contributions
    .filter((contribution) => contribution.contribution < 0)
    .sort((left, right) =>
      left.contribution - right.contribution ||
      compareForwardCanonicalStrings(left.feature, right.feature),
    )
    .slice(0, 3);

  return serviceSuccess({
    ...basePlayerRow(input, censusRow),
    status: {
      identity: 'resolved',
      eligibility: 'eligible',
      position_domain: 'supported',
      forecast: 'forecast_available',
    },
    status_reasons: [],
    forecast: {
      generic_ppr_points: point,
      lower_quantile: null,
      median: null,
      upper_quantile: null,
      interval_lower: null,
      interval_upper: null,
    },
    feature_coverage: featureCoverage,
    feature_lineage: featureLineage,
    drivers: {
      status: 'explained',
      model_mechanics_only: true,
      top_positive: positive,
      top_negative: negative,
    },
    limitations: [],
    actual_outcome: null,
  });
};

const validateCensusRows = (
  payload: ForwardCensusPayload,
): ServiceError[] => {
  const errors: ServiceError[] = [];
  if (payload.rows.length === 0) {
    errors.push(error('FORWARD_CENSUS_EMPTY', 'A succeeded candidate requires a non-empty census.'));
    return errors;
  }
  const rowIds = new Set<string>();
  const canonicalCounts = new Map<string, number>();
  for (const row of payload.rows) {
    if (!isNonEmptyString(row.population_row_id)) {
      errors.push(error('FORWARD_CENSUS_ROW_ID_INVALID', 'Every census row requires a stable population_row_id.'));
    } else if (rowIds.has(row.population_row_id)) {
      errors.push(error('FORWARD_CENSUS_ROW_DUPLICATE', `Duplicate population_row_id ${row.population_row_id}.`));
    } else {
      rowIds.add(row.population_row_id);
    }
    if (row.status_evidence_refs.length === 0 || !row.status_evidence_refs.every(evidenceRefIsUsable)) {
      errors.push(error('FORWARD_CENSUS_STATUS_EVIDENCE_MISSING', `${row.population_row_id} lacks status evidence.`));
    }
    if (row.identity_status === 'resolved') {
      if (!isNonEmptyString(row.player.canonical_player_id)) {
        errors.push(error('FORWARD_CENSUS_IDENTITY_INVALID', `${row.population_row_id} is resolved without a canonical ID.`));
      } else {
        canonicalCounts.set(
          row.player.canonical_player_id,
          (canonicalCounts.get(row.player.canonical_player_id) ?? 0) + 1,
        );
      }
    } else if (row.player.canonical_player_id !== null) {
      errors.push(error('FORWARD_CENSUS_IDENTITY_INVALID', `${row.population_row_id} carries a canonical ID while unresolved/conflicting.`));
    }
    if (
      row.position_domain_status === 'supported' &&
      !FORWARD_SUPPORTED_POSITIONS.includes(row.player.position as typeof FORWARD_SUPPORTED_POSITIONS[number])
    ) {
      errors.push(error('FORWARD_CENSUS_POSITION_INVALID', `${row.population_row_id} declares an unsupported position as supported.`));
    }
  }
  const maximum = payload.duplicate_canonical_id_policy.max_rows_per_resolved_canonical_id;
  if (!Number.isInteger(maximum) || maximum < 1) {
    errors.push(error('FORWARD_CENSUS_DUPLICATE_POLICY_INVALID', 'Resolved canonical-ID maximum must be a positive integer.'));
  } else {
    for (const [canonicalId, count] of canonicalCounts) {
      if (count > maximum) {
        errors.push(error('FORWARD_CENSUS_CANONICAL_ID_DUPLICATE', `${canonicalId} appears ${count} times, above the declared maximum ${maximum}.`));
      }
    }
  }
  return errors;
};

export const runForwardCandidateService = (
  input: RunForwardCandidateInput,
): ServiceResult<ForwardCandidateBundle> => {
  const errors: ServiceError[] = [];
  if (!isNonEmptyString(input.run_id)) errors.push(error('FORWARD_RUN_ID_INVALID', 'run_id must be non-empty.'));
  if (!Number.isInteger(input.target_season) || !Number.isInteger(input.input_season) || input.input_season >= input.target_season) {
    errors.push(error('FORWARD_SEASON_INVALID', 'input_season must be an integer before target_season.'));
  }
  if (!isExactUtcInstant(input.forecast_cutoff) || !isExactUtcInstant(input.generated_at)) {
    errors.push(error('FORWARD_TIMESTAMP_INVALID', 'forecast_cutoff and generated_at must be exact UTC ISO instants.'));
  } else if (Date.parse(input.generated_at) < Date.parse(input.forecast_cutoff)) {
    errors.push(error('FORWARD_GENERATED_BEFORE_CUTOFF', 'generated_at cannot precede forecast_cutoff.'));
  }
  if (!GIT_SHA.test(input.git_commit_sha)) errors.push(error('FORWARD_CODE_PIN_INVALID', 'git_commit_sha must be 40 lowercase hex characters.'));
  if (input.git_commit_sha !== input.expected_pins.git_commit_sha) {
    errors.push(error('FORWARD_CODE_PIN_MISMATCH', 'Execution Git SHA does not match the expected code pin.'));
  }

  const configResult = validateFrozenForwardRidgeConfiguration(input.frozen_configuration);
  if (!configResult.ok) {
    errors.push(error('FORWARD_CONFIGURATION_INVALID', 'Frozen configuration failed runtime validation.', configResult.errors));
  } else {
    if (
      configResult.data.configuration_sha256 !== input.expected_pins.configuration_sha256
    ) {
      errors.push(error('FORWARD_CONFIGURATION_PIN_MISMATCH', 'Frozen configuration does not match the expected pin.'));
    }
    if (
      configResult.data.configuration.ordered_numeric_features.some(
        (feature) => feature.source_input_id !== input.future_feature_package.input_id,
      )
    ) {
      errors.push(error(
        'FORWARD_CONFIGURATION_SOURCE_INPUT_MISMATCH',
        'Every v1 forward feature must bind the exact injected future-feature package input_id.',
      ));
    }
    const configuredFeatureNames =
      configResult.data.configuration.ordered_numeric_features.map(
        (feature) => feature.name,
      );
    for (const packageValue of [
      input.historical_training_package,
      input.future_feature_package,
    ]) {
      if (
        packageValue.feature_names_admitted.length !== configuredFeatureNames.length ||
        packageValue.feature_names_admitted.some(
          (feature, index) => feature !== configuredFeatureNames[index],
        )
      ) {
        errors.push(error(
          'FORWARD_FEATURE_ADMISSION_MISMATCH',
          `${packageValue.input_id} does not admit exactly the frozen ordered feature set.`,
          {
            input_id: packageValue.input_id,
            expected: configuredFeatureNames,
            declared: packageValue.feature_names_admitted,
          },
        ));
      }
    }
  }

  if (isExactUtcInstant(input.forecast_cutoff)) {
    errors.push(...validateDecisionFreezes(
      input.decision_freezes,
      input.forecast_cutoff,
      input.frozen_configuration.configuration_sha256,
      input.git_commit_sha,
    ));
  }

  const packages = [
    input.historical_training_package,
    input.future_feature_package,
    input.census_package,
  ] as const;
  const ids = packages.map((packageValue) => packageValue.input_id);
  if (new Set(ids).size !== ids.length) {
    errors.push(error('FORWARD_INPUT_ID_DUPLICATE', 'Pinned package input IDs must be unique.'));
  }
  if (isExactUtcInstant(input.forecast_cutoff)) {
    for (const packageValue of packages) {
      errors.push(...validatePackage(packageValue, input.forecast_cutoff));
      if (input.expected_pins.input_sha256[packageValue.input_id] !== packageValue.content_sha256) {
        errors.push(error('FORWARD_INPUT_PIN_MISMATCH', `${packageValue.input_id} does not match the expected input pin.`));
      }
    }
  }
  const expectedInputIds = Object.keys(input.expected_pins.input_sha256).sort(compareForwardCanonicalStrings);
  if (JSON.stringify(expectedInputIds) !== JSON.stringify([...ids].sort(compareForwardCanonicalStrings))) {
    errors.push(error('FORWARD_INPUT_PIN_SET_MISMATCH', 'Expected input pin keys do not exactly match injected package IDs.'));
  }
  if (
    input.census_package.content_sha256 !== input.expected_pins.census_sha256 ||
    input.census_package.content_sha256 !== input.expected_pins.input_sha256[input.census_package.input_id]
  ) {
    errors.push(error('FORWARD_CENSUS_PIN_MISMATCH', 'Census package does not match its expected pins.'));
  }
  errors.push(...validateCensusRows(input.census_package.content.payload));

  if (
    input.target_definition.target_season !== input.target_season ||
    input.target_definition.scoring_profile_id !== FORWARD_SCORING_PROFILE_ID ||
    input.target_definition.outcome_field !== 'actual_outcome' ||
    input.target_definition.regular_season_only !== true ||
    input.target_definition.forward_outcome_must_be_null !== true
  ) {
    errors.push(error('FORWARD_TARGET_DEFINITION_MISMATCH', 'Target definition does not match the candidate run.'));
  }

  const scoringCompatibility = resolveGenericFullPprCompatibility(input.scoring_profile_ref);
  if (!scoringCompatibility.ok) errors.push(...scoringCompatibility.errors);
  if (
    input.expected_pins.scoring_profile_sha256 !== TIBER_GENERIC_FULL_PPR_V1_SHA256
  ) {
    errors.push(error('FORWARD_SCORING_PIN_MISMATCH', 'Expected scoring profile is not tiber-generic-full-ppr-v1.'));
  }
  const scoringInputHashes = input.scoring_input_ids
    .map((inputId) => packages.find((packageValue) => packageValue.input_id === inputId)?.content_sha256)
    .filter((value): value is string => typeof value === 'string')
    .sort(compareForwardCanonicalStrings);
  if (
    scoringInputHashes.length !== input.scoring_input_ids.length ||
    new Set(input.scoring_input_ids).size !== input.scoring_input_ids.length
  ) {
    errors.push(error('FORWARD_SCORING_INPUT_SET_INVALID', 'Scoring input IDs must be unique and identify injected packages.'));
  }
  const scoringReconciliation = validateScoringReconciliationEvidence(
    input.scoring_reconciliation,
    {
      run_status: 'succeeded',
      expected_scoring_profile_sha256: TIBER_GENERIC_FULL_PPR_V1_SHA256,
      expected_source_input_sha256s: scoringInputHashes,
    },
  );
  if (!scoringReconciliation.ok) errors.push(...scoringReconciliation.errors);

  const censusByPopulationId = new Map(
    input.census_package.content.payload.rows.map((row) => [
      row.population_row_id,
      row,
    ]),
  );
  for (const row of input.future_feature_package.content.payload.rows) {
    const censusRow = censusByPopulationId.get(row.population_row_id);
    if (!censusRow) {
      errors.push(error('FORWARD_FEATURE_ROW_EXTRA', `Future feature row ${row.population_row_id} is outside the declared census.`));
      continue;
    }
    if (row.input_season !== input.input_season) {
      errors.push(error(
        'FORWARD_INFERENCE_INPUT_SEASON_MISMATCH',
        `Future feature row ${row.population_row_id} does not match the run input season.`,
        {
          expected: input.input_season,
          declared: row.input_season,
        },
      ));
    }
    if (row.position !== censusRow.player.position) {
      errors.push(error(
        'FORWARD_INFERENCE_CENSUS_POSITION_MISMATCH',
        `Future feature row ${row.population_row_id} does not match its pinned census position.`,
        {
          expected: censusRow.player.position,
          declared: row.position,
        },
      ));
    }
  }
  const futureInferenceRows: unknown[] =
    input.future_feature_package.content.payload.rows.map((row) => ({
      ...row,
      row_schema_version: FUTURE_FORWARD_INFERENCE_ROW_SCHEMA_VERSION,
      row_kind: 'future_forward_inference',
      run_id: input.run_id,
      configuration_sha256: input.frozen_configuration.configuration_sha256,
      input_package_sha256: input.future_feature_package.content_sha256,
      census_sha256: input.census_package.content_sha256,
    }));
  const inferenceValidation = validateFutureInferenceRows(
    futureInferenceRows,
    {
      frozenConfiguration: input.frozen_configuration,
      expectedPins: {
        run_id: input.run_id,
        configuration_sha256: input.frozen_configuration.configuration_sha256,
        input_package_sha256: input.future_feature_package.content_sha256,
        census_sha256: input.census_package.content_sha256,
        target_season: input.target_season,
      },
    },
  );
  if (!inferenceValidation.ok) {
    errors.push(error('FORWARD_INFERENCE_ROWS_INVALID', 'Future inference rows failed the target-free runtime boundary.', inferenceValidation.errors));
  }

  if (errors.length > 0 || !configResult.ok || !scoringReconciliation.ok || !inferenceValidation.ok) {
    return serviceFailure(errors);
  }

  // Scoring compatibility/reconciliation, code/config freezes, input cutoff,
  // and inference-package validation all pass before fitting begins.
  const fit = fitSeasonalForwardModel({
    rows: input.historical_training_package.content.payload.rows,
    frozenConfiguration: input.frozen_configuration,
    finalFitTargetSeason: input.target_season,
  });
  if (!fit.ok) {
    return serviceFailure(error('FORWARD_FINAL_FIT_FAILED', 'Final fit failed closed.', fit.errors));
  }
  const fittedModel = fit.data;
  const inferenceByPopulationId = new Map(
    inferenceValidation.data.map((row) => [row.population_row_id, row]),
  );
  const playerRows: ForwardPlayerRow[] = [];
  for (const censusRow of [...input.census_package.content.payload.rows].sort((left, right) =>
    compareForwardCanonicalStrings(left.population_row_id, right.population_row_id),
  )) {
    const primaryUnavailable = primaryUnavailableRow(input, censusRow);
    if (primaryUnavailable) {
      playerRows.push(primaryUnavailable);
      continue;
    }
    const inferenceRow = inferenceByPopulationId.get(censusRow.population_row_id);
    if (!inferenceRow) {
      const evidence = featureEvidence(input.future_feature_package, censusRow.population_row_id);
      playerRows.push(unavailableRow(
        input,
        censusRow,
        'unavailable_missing_required_inputs',
        statusReason(
          'required_feature_missing',
          'required_input',
          evidence,
          input.future_feature_package.input_id,
        ),
        {
          status: 'unavailable',
          present: [],
          missing_required: [{
            feature: 'future_feature_row',
            reason_code: 'required_feature_missing',
            input_id: input.future_feature_package.input_id,
            evidence_refs: evidence,
          }],
          missing_optional: [],
          imputed: [],
        },
      ));
      continue;
    }
    const built = buildAvailableRow(input, censusRow, inferenceRow, fittedModel);
    if (!built.ok) return built;
    playerRows.push(built.data);
  }

  const statusCounts = Object.fromEntries(
    FORWARD_FORECAST_STATUSES.map((status) => [
      status,
      playerRows.filter((row) => row.status.forecast === status).length,
    ]),
  ) as ForwardStatusCounts;
  const eligibleTargetCount = input.census_package.content.payload.rows.filter((row) =>
    row.identity_status === 'resolved' &&
    row.eligibility_status === 'eligible' &&
    row.position_domain_status === 'supported',
  ).length;
  if (eligibleTargetCount === 0) {
    return serviceFailure(error('FORWARD_ELIGIBLE_TARGET_EMPTY', 'A succeeded candidate requires at least one eligible target row.'));
  }

  const fittedModelBytes = canonicalForwardJsonBytes(fittedModel);
  const fittedModelSha256 = forwardArtifactSha256(fittedModelBytes);
  const playerRowsBytes = canonicalForwardJsonlBytes(playerRows);
  const playerRowsSha256 = forwardArtifactSha256(playerRowsBytes);
  const censusPayload = input.census_package.content.payload;
  const populationCensus: ForwardPopulationCensus = {
    census_artifact_ref: {
      artifact_type: input.census_package.artifact_type,
      artifact_version: input.census_package.artifact_version,
      uri_or_path: input.census_package.uri_or_path,
      content_sha256: input.census_package.content_sha256,
    },
    census_sha256: input.census_package.content_sha256,
    scope_definition: censusPayload.scope_definition,
    effective_at: censusPayload.effective_at,
    eligibility_policy_id: censusPayload.eligibility_policy_id,
    eligibility_policy_sha256: censusPayload.eligibility_policy_sha256,
    duplicate_canonical_id_policy: { ...censusPayload.duplicate_canonical_id_policy },
    row_count: censusPayload.rows.length,
    eligible_target_count: eligibleTargetCount,
    status_counts: statusCounts,
    reconciliation: {
      output_row_count: playerRows.length,
      duplicate_population_row_ids: [],
      duplicate_resolved_canonical_ids: [],
      missing_population_row_ids: [],
      extra_population_row_ids: [],
      one_to_one_complete: true,
    },
  };
  const manifestInputs = packages
    .map((packageValue) => packageToManifestInput(packageValue, input.forecast_cutoff))
    .sort((left, right) => compareForwardCanonicalStrings(left.input_id, right.input_id));
  const manifest: ForwardSucceededExecutionManifest = {
    artifact_type: FORWARD_MANIFEST_ARTIFACT_TYPE,
    artifact_version: FORWARD_MANIFEST_ARTIFACT_VERSION,
    document_kind: 'execution_manifest',
    run_status: 'succeeded',
    output_kind: FORWARD_OUTPUT_KIND,
    candidate_only: true,
    production_ready: false,
    consumer_eligibility: FORWARD_CONSUMER_ELIGIBILITY,
    run_id: input.run_id,
    target_season: input.target_season,
    forecast_cutoff: input.forecast_cutoff,
    cutoff_rule: FORWARD_CUTOFF_RULE,
    generated_at: input.generated_at,
    repository: 'Prometheus-Frameworks/TIBER-Forecast',
    git_commit_sha: input.git_commit_sha,
    lane_name: 'seasonal-fantasy-point-forecast',
    lane_version: input.lane_version,
    serialization: {
      serializer_id: FORWARD_SERIALIZER_ID,
      serializer_version: FORWARD_SERIALIZER_VERSION,
    },
    target_definition: structuredClone(input.target_definition),
    evaluation_design: structuredClone(input.evaluation_design),
    historical_validation_summary: structuredClone(input.historical_validation_summary),
    model: {
      model_id: fittedModel.model_id,
      model_version: fittedModel.model_version,
      configuration_sha256: fittedModel.configuration_sha256,
      model_type: 'ridge',
      hyperparameters: { lambda: fittedModel.lambda },
      feature_set_id: input.frozen_configuration.configuration.feature_set_id,
      feature_names_ordered: [...fittedModel.coefficient_feature_names_ordered],
      admitted_capabilities: [...input.admitted_capabilities].sort(compareForwardCanonicalStrings),
    },
    decision_freezes: structuredClone(input.decision_freezes),
    final_fit: {
      historical_row_count: fittedModel.training_identity.row_count,
      historical_target_seasons: [...fittedModel.training_identity.target_seasons_ordered],
      training_population_sha256: fittedModel.training_identity.training_population_sha256,
      training_data_sha256: fittedModel.training_identity.training_data_sha256,
      model_artifact_ref: {
        artifact_type: FORWARD_FITTED_MODEL_ARTIFACT_TYPE,
        artifact_version: FORWARD_FITTED_MODEL_ARTIFACT_VERSION,
        uri_or_path: FORWARD_CANDIDATE_FITTED_MODEL_FILENAME,
        content_sha256: fittedModelSha256,
        serialization: {
          serializer_id: FORWARD_SERIALIZER_ID,
          serializer_version: FORWARD_SERIALIZER_VERSION,
        },
        model_id: fittedModel.model_id,
        model_version: fittedModel.model_version,
        configuration_sha256: fittedModel.configuration_sha256,
        feature_names_ordered: [...fittedModel.coefficient_feature_names_ordered],
        contains: [
          'intercept',
          'coefficients',
          'means',
          'standard_deviations',
          'lambda',
          'categorical_levels',
          'clamp_rule',
          'missingness_transforms',
          'training_identity',
        ],
      },
    },
    scoring_profile: {
      ...structuredClone(TIBER_GENERIC_FULL_PPR_V1),
      profile_sha256: TIBER_GENERIC_FULL_PPR_V1_SHA256,
      replacement_context: null,
      source_reconciliation: {
        ...scoringReconciliation.data,
        status: 'passed',
        scoring_profile_sha256: TIBER_GENERIC_FULL_PPR_V1_SHA256,
      },
    },
    artifact_inputs: manifestInputs,
    population_census: populationCensus,
    forecast_uncertainty: {
      status: FORWARD_UNCERTAINTY_STATUS,
      method_id: null,
      method_version: null,
      lower_quantile_level: null,
      median_quantile_level: null,
      upper_quantile_level: null,
      nominal_interval_coverage: null,
      calibration_population: null,
      calibration_artifact_ref: null,
      empirical_coverage_by_origin: [],
      empirical_coverage_by_position: [],
      limitations: ['Point-only candidate output; seasonal uncertainty is unavailable and not calibrated.'],
    },
    outputs: [{
      artifact_type: FORWARD_PLAYER_ARTIFACT_TYPE,
      artifact_version: FORWARD_PLAYER_ARTIFACT_VERSION,
      uri_or_path: FORWARD_CANDIDATE_PLAYER_ROWS_FILENAME,
      content_sha256: playerRowsSha256,
      row_count: playerRows.length,
    }],
    previous_run_id: null,
    limitations: [...input.limitations],
  };
  const manifestBytes = canonicalForwardJsonBytes(manifest);
  return serviceSuccess({
    manifest,
    player_rows: playerRows,
    fitted_model: fittedModel,
    bytes: {
      manifest: manifestBytes,
      player_rows: playerRowsBytes,
      fitted_model: fittedModelBytes,
    },
    hashes: {
      manifest_sha256: forwardArtifactSha256(manifestBytes),
      player_rows_sha256: playerRowsSha256,
      fitted_model_sha256: fittedModelSha256,
    },
  });
};
