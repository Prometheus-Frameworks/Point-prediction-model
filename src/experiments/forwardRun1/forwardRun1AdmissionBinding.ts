/**
 * Forecast #170/#175: deterministic materialization of the
 * exact packages selected for Forward Run 1 admission.
 *
 * This module does not fit a model, emit a forecast, write artifacts, or grant
 * promotion/consumer authority. It converts already-pinned Data and Forecast
 * evidence into the three package shapes consumed by the existing candidate
 * runtime and constructs the input used by a test-only fit-boundary probe.
 */
import {
  FORWARD_CUTOFF_RULE,
  FORWARD_SCORING_PROFILE_ID,
  FORWARD_SUPPORTED_POSITIONS,
  type ForwardEvaluationDesign,
  type ForwardEvidenceRef,
  type ForwardHistoricalValidationSummary,
  type ForwardTargetDefinition,
} from '../../contracts/forwardSeasonalPpr.js';
import {
  TIBER_GENERIC_FULL_PPR_V1_PROFILE_REF,
  TIBER_GENERIC_FULL_PPR_V1_SHA256,
  type ScoringReconciliationEvidenceRef,
} from '../../contracts/genericFullPprProfile.js';
import {
  FORWARD_BASE_EVAL_SOURCE_ARTIFACT_PATH,
  FORWARD_BASE_EVAL_SOURCE_COMMIT,
  FORWARD_BASE_EVAL_SOURCE_REPOSITORY,
  FORWARD_BASE_EVAL_SOURCE_SHA256,
  FORWARD_BASE_FEATURE_SOURCE_INPUT_ID,
  deriveGenericPprCents,
  centsToPoints,
  type ForwardBaseEvalOriginPackages,
} from '../forwardBaseEval/forwardBaseEvaluation.js';
import {
  HISTORICAL_FORWARD_TRAINING_ROW_SCHEMA_VERSION,
  type FrozenForwardRidgeConfigurationPackageV1,
  type HistoricalForwardTrainingRowV1,
} from '../../models/seasonal/forwardRidgeModel.js';
import {
  canonicalForwardJsonSha256,
  compareForwardCanonicalStrings,
} from '../../serialization/canonicalForwardArtifacts.js';
import {
  computeForwardPinnedPackageSha256,
  type ForwardCensusPayload,
  type ForwardCensusRow,
  type ForwardFutureFeatureRow,
  type ForwardInferencePayload,
  type ForwardPinnedPackageContent,
  type ForwardPinnedInputPackage,
  type ForwardTrainingPayload,
  type RunForwardCandidateInput,
} from '../../services/runForwardCandidateService.js';

export const FORWARD_RUN1_RUN_ID = 'seasonal-ppr-2026-forward-001' as const;
export const FORWARD_RUN1_INPUT_SEASON = 2025 as const;
export const FORWARD_RUN1_TARGET_SEASON = 2026 as const;

/**
 * Earliest inclusive cutoff at or after every selected dependency became
 * authoritative: Data 3393a8f at 2026-07-28T00:47:06.000Z and Forecast
 * 813eff8 at 2026-07-29T22:16:02.000Z. The later Forecast commit controls.
 */
export const FORWARD_RUN1_FORECAST_CUTOFF =
  '2026-07-29T22:16:02.000Z' as const;
export const FORWARD_RUN1_DATA_COMMIT_AVAILABLE_AT =
  '2026-07-28T00:47:06.000Z' as const;
export const FORWARD_RUN1_FORECAST_COMMIT_AVAILABLE_AT =
  FORWARD_RUN1_FORECAST_CUTOFF;
export const FORWARD_RUN1_FORECAST_COMMIT =
  '813eff8de0b4a8d4f29f5c37abe522fe3e792ca3' as const;

export const FORWARD_RUN1_HISTORICAL_TRAINING_INPUT_ID =
  'tiber-data-player-season-coverage-v0-historical-training' as const;
export const FORWARD_RUN1_FUTURE_FEATURE_INPUT_ID =
  FORWARD_BASE_FEATURE_SOURCE_INPUT_ID;
export const FORWARD_RUN1_CENSUS_INPUT_ID =
  'tiber-data-bounded-2026-population-census-v0' as const;

export const FORWARD_RUN1_CENSUS_SOURCE_PATH =
  'exports/candidates/population_census/bounded_2026_population_census_v0.json' as const;
export const FORWARD_RUN1_CENSUS_SOURCE_SHA256 =
  '6057031bfc6dfedac1a5b2957ec194e738df5fbdb12dfec80d1e8ad773f0d1ea' as const;
export const FORWARD_RUN1_CENSUS_VALIDATION_PATH =
  'exports/candidates/population_census/bounded_2026_population_census_v0.validation.json' as const;
export const FORWARD_RUN1_CENSUS_VALIDATION_SHA256 =
  '02e6f79494193d81cac15df715145a44f54135497231d908953af8b93edfc71e' as const;
export const FORWARD_RUN1_SCORING_RECONCILIATION_PATH =
  'data/manifests/player_season_coverage_v0_generic_ppr_reconciliation_v1.manifest.json' as const;
export const FORWARD_RUN1_SCORING_RECONCILIATION_SHA256 =
  '83687c3511691c6681139c253f217c3b1d11ca6e7bd87b169f79e1f89da8e52a' as const;
export const FORWARD_RUN1_PROMOTION_MARKER_PATH =
  'exports/promoted/nfl/PLAYER_SEASON_COVERAGE_V0_PROMOTION_MANIFEST.json' as const;
export const FORWARD_RUN1_PROMOTION_MARKER_SHA256 =
  '5e9a382db0681e7a808a1d5fdf4334653cf2f0b26314c45425b333aa2024d154' as const;

export const FORWARD_RUN1_FROZEN_CONFIGURATION_PATH =
  'data/experiments/forwardBaseEval/forward_base_frozen_configuration_v1.json' as const;
export const FORWARD_RUN1_ORIGIN_PACKAGES_PATH =
  'data/experiments/forwardBaseEval/forward_base_eval_origin_pairs_v1.json' as const;
export const FORWARD_RUN1_ORIGIN_PACKAGES_SHA256 =
  'ac0f9c7a8f541f1f8a64eb18ebebaaaa52704636ad5e7afdfe2b45366eb4e796' as const;
export const FORWARD_RUN1_FROZEN_CONFIGURATION_FILE_SHA256 =
  '5d6a963bf15975a65cfdd6e3d6f440f56ea6213ec04bf31b4a985b4d0fc6427a' as const;
export const FORWARD_RUN1_CONFIGURATION_FREEZE_PATH =
  'data/experiments/forwardBaseEval/forward_base_configuration_freeze_record_v1.json' as const;
export const FORWARD_RUN1_CONFIGURATION_FREEZE_FILE_SHA256 =
  'd90f6c79398facd5a65758d1b01de6b83e9459a8572bd17b0c0f7f1fd66dbda0' as const;
export const FORWARD_RUN1_HISTORICAL_EVALUATION_PATH =
  'data/experiments/forwardBaseEval/forward_base_model_evaluation_v1.json' as const;
export const FORWARD_RUN1_HISTORICAL_EVALUATION_SHA256 =
  '04fae89ae324b0341c60870ce1f9e0fb3812eab045585862a946a80824610971' as const;
/** SHA-256 of `git cat-file commit 813eff8...`, not a Git object id. */
export const FORWARD_RUN1_FORECAST_COMMIT_EVIDENCE_SHA256 =
  'cbe36c261d13271674d7fd95fc72596d25b419a0103026bf5040d857dac6f0bc' as const;

export const FORWARD_RUN1_EXPECTED_TRAINING_ROWS = 1802 as const;
export const FORWARD_RUN1_EXPECTED_CENSUS_ROWS = 658 as const;
export const FORWARD_RUN1_EXPECTED_FUTURE_FEATURE_ROWS = 610 as const;
export const FORWARD_RUN1_EXPECTED_ROOKIE_ROWS_WITHOUT_HISTORY = 48 as const;

export const FORWARD_RUN1_HISTORICAL_TRAINING_PACKAGE_PATH =
  'data/experiments/forwardRun1/forward_run1_historical_training_package_v1.json' as const;
export const FORWARD_RUN1_FUTURE_FEATURE_PACKAGE_PATH =
  'data/experiments/forwardRun1/forward_run1_future_feature_package_v1.json' as const;
export const FORWARD_RUN1_CENSUS_PACKAGE_PATH =
  'data/experiments/forwardRun1/forward_run1_population_census_package_v1.json' as const;
export const FORWARD_RUN1_PACKAGE_ADMISSION_EVIDENCE_PATH =
  'data/experiments/forwardRun1/forward_run1_package_admission_evidence_v1.json' as const;
export const FORWARD_RUN1_MATERIALIZATION_LOCK_PATH =
  'data/experiments/forwardRun1/forward_run1_materialization_lock_v1.json' as const;
export const FORWARD_RUN1_PACKAGE_ADMISSION_EVIDENCE_ARTIFACT_TYPE =
  'forward_run1_package_admission_evidence' as const;
export const FORWARD_RUN1_PACKAGE_ADMISSION_EVIDENCE_VERSION =
  'forward-run1-package-admission-evidence-v1' as const;
export const FORWARD_RUN1_ELIGIBILITY_POLICY_PATH =
  'data/experiments/forwardRun1/forward_run1_census_eligibility_policy_v1.json' as const;
export const FORWARD_RUN1_DUPLICATE_POLICY_PATH =
  'data/experiments/forwardRun1/forward_run1_duplicate_canonical_id_policy_v1.json' as const;
export const FORWARD_RUN1_SCORING_PROFILE_EQUIVALENCE_PATH =
  'docs/decisions/scoring-profile-hash-equivalence-2026-07-28.md' as const;
export const FORWARD_RUN1_SCORING_PROFILE_EQUIVALENCE_SHA256 =
  '3cd99f960b106325a8fd79d51cf4d2b34bfa447a97cdacba0a2c4b0d6a870475' as const;
export const FORWARD_RUN1_INPUT_ADMISSION_DECISION_URL =
  'https://github.com/Prometheus-Frameworks/TIBER-Forecast/issues/170#issuecomment-5157636151' as const;
export const FORWARD_RUN1_CUTOFF_AND_PACKAGE_DECISION_URL =
  'https://github.com/Prometheus-Frameworks/TIBER-Forecast/pull/175#issuecomment-5172232689' as const;
export const FORWARD_RUN1_INPUT_ADMISSION_DECISION_BODY_SHA256 =
  '702498e14bb79264e6ea7c769d99a4375b15478b5f8c38834283c8b9c9946175' as const;
export const FORWARD_RUN1_CUTOFF_AND_PACKAGE_DECISION_BODY_SHA256 =
  'be966905531de71d85f21dbef9ee3df53ef9a14b50c5612dbf7caed45f50d97b' as const;

export const FORWARD_RUN1_FORECAST_REPOSITORY =
  'Prometheus-Frameworks/TIBER-Forecast' as const;

const DATA_REPOSITORY_AT_COMMIT =
  `${FORWARD_BASE_EVAL_SOURCE_REPOSITORY}@${FORWARD_BASE_EVAL_SOURCE_COMMIT}`;
const FORECAST_REPOSITORY_AT_COMMIT =
  `${FORWARD_RUN1_FORECAST_REPOSITORY}@${FORWARD_RUN1_FORECAST_COMMIT}`;

const GIT_SHA = /^[0-9a-f]{40}$/;

export interface ForwardRun1MaterializationLockV1 {
  lock_version: 'forward-run1-materialization-lock-v1';
  owner_repository: typeof FORWARD_RUN1_FORECAST_REPOSITORY;
  materializer_implementation_commit_sha: string;
  artifact_generated_at: string;
}

export interface ForwardRun1PackageDraft<T> {
  input_id: string;
  artifact_type: string;
  artifact_version: string;
  uri_or_path: string;
  content_sha256: string;
  content: ForwardPinnedPackageContent<T>;
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

export interface ForwardRun1PackageAdmissionEvidenceV1 {
  artifact_type: typeof FORWARD_RUN1_PACKAGE_ADMISSION_EVIDENCE_ARTIFACT_TYPE;
  artifact_version: typeof FORWARD_RUN1_PACKAGE_ADMISSION_EVIDENCE_VERSION;
  generated_at: string;
  owner_repository: typeof FORWARD_RUN1_FORECAST_REPOSITORY;
  materializer_implementation_commit_sha: string;
  runtime_source_code_freeze: {
    repository: typeof FORWARD_RUN1_FORECAST_REPOSITORY;
    commit_sha: typeof FORWARD_RUN1_FORECAST_COMMIT;
    fact_available_at: typeof FORWARD_RUN1_FORECAST_COMMIT_AVAILABLE_AT;
  };
  run_id: typeof FORWARD_RUN1_RUN_ID;
  forecast_cutoff: typeof FORWARD_RUN1_FORECAST_CUTOFF;
  package_admission: {
    status: 'admitted';
    operator_decision_refs: readonly [{
      comment_id: 5157636151;
      url: typeof FORWARD_RUN1_INPUT_ADMISSION_DECISION_URL;
      observed_body_sha256:
        typeof FORWARD_RUN1_INPUT_ADMISSION_DECISION_BODY_SHA256;
      authority_scope: string;
    }, {
      comment_id: 5172232689;
      url: typeof FORWARD_RUN1_CUTOFF_AND_PACKAGE_DECISION_URL;
      observed_body_sha256:
        typeof FORWARD_RUN1_CUTOFF_AND_PACKAGE_DECISION_BODY_SHA256;
      authority_scope: string;
    }];
    packages: readonly {
      input_id: string;
      artifact_type: string;
      artifact_version: string;
      uri_or_path: string;
      runtime_content_sha256: string;
    }[];
    raw_data_refs: readonly {
      repository: string;
      path: string;
      content_sha256: string;
      purpose: string;
    }[];
  };
  scoring_reconciliation: {
    status: 'passed';
    validator_id: 'tiber-forecast-run1-derived-component-scoring-binding';
    validator_version: '1.0.0';
    scoring_profile_sha256: typeof TIBER_GENERIC_FULL_PPR_V1_SHA256;
    source_input_ids: readonly string[];
    source_input_runtime_content_sha256s: readonly string[];
    source_inputs: readonly {
      input_id: string;
      runtime_content_sha256: string;
    }[];
    raw_data_reconciliation_ref: {
      repository: string;
      path: typeof FORWARD_RUN1_SCORING_RECONCILIATION_PATH;
      content_sha256: typeof FORWARD_RUN1_SCORING_RECONCILIATION_SHA256;
    };
    profile_equivalence_ref: {
      repository: typeof FORWARD_RUN1_FORECAST_REPOSITORY;
      path: typeof FORWARD_RUN1_SCORING_PROFILE_EQUIVALENCE_PATH;
      content_sha256: typeof FORWARD_RUN1_SCORING_PROFILE_EQUIVALENCE_SHA256;
    };
  };
  limitations: readonly string[];
}

export interface ForwardRun1MaterializedPackages {
  historicalTrainingPackage: ForwardPinnedInputPackage<ForwardTrainingPayload>;
  futureFeaturePackage: ForwardPinnedInputPackage<ForwardInferencePayload>;
  censusPackage: ForwardPinnedInputPackage<ForwardCensusPayload>;
  packageAdmissionEvidence: ForwardRun1PackageAdmissionEvidenceV1;
  packageAdmissionEvidenceSha256: string;
}

const CUTOFF_NORMALIZATION_RULE = {
  rule_id: 'governed-repository-commit-availability-v1',
  inclusive_rule: FORWARD_CUTOFF_RULE,
  controlling_data_commit: FORWARD_BASE_EVAL_SOURCE_COMMIT,
  controlling_data_commit_available_at: FORWARD_RUN1_DATA_COMMIT_AVAILABLE_AT,
  controlling_forecast_commit: FORWARD_RUN1_FORECAST_COMMIT,
  controlling_forecast_commit_available_at:
    FORWARD_RUN1_FORECAST_COMMIT_AVAILABLE_AT,
} as const;

export const FORWARD_RUN1_CUTOFF_NORMALIZATION_RULE_SHA256 =
  canonicalForwardJsonSha256(CUTOFF_NORMALIZATION_RULE);

export class ForwardRun1AdmissionBuildError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ForwardRun1AdmissionBuildError';
  }
}

const asRecord = (value: unknown, where: string): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ForwardRun1AdmissionBuildError(`${where} must be an object.`);
  }
  return value as Record<string, unknown>;
};

const readNonEmptyString = (
  record: Record<string, unknown>,
  field: string,
  where: string,
): string => {
  const value = record[field];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ForwardRun1AdmissionBuildError(`${where}.${field} must be non-empty.`);
  }
  return value;
};

const readFinitePath = (
  record: Record<string, unknown>,
  path: readonly string[],
  where: string,
): number => {
  let value: unknown = record;
  for (const [index, field] of path.entries()) {
    const parentPath = path.slice(0, index).join('.');
    value = asRecord(value, parentPath ? `${where}.${parentPath}` : where)[field];
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ForwardRun1AdmissionBuildError(
      `${where}.${path.join('.')} must be a finite number.`,
    );
  }
  return value;
};

const sourceRef = (
  inputId: string,
  path: string,
  contentSha256: string,
  recordId: string,
): ForwardEvidenceRef => ({
  input_id: inputId,
  uri_or_path: `${DATA_REPOSITORY_AT_COMMIT}:${path}`,
  content_sha256: contentSha256,
  record_id: recordId,
});

const forecastRef = (
  path: string,
  contentSha256: string,
  recordId: string,
): ForwardEvidenceRef => ({
  input_id: null,
  uri_or_path: `${FORECAST_REPOSITORY_AT_COMMIT}:${path}`,
  content_sha256: contentSha256,
  record_id: recordId,
});

const dataCommitCutoffRecord = (
  inputId: string,
  path: string,
  sourceSha256: string,
) => ({
  record_id: `governed-data-commit-${FORWARD_BASE_EVAL_SOURCE_COMMIT}`,
  fact_available_at: FORWARD_RUN1_DATA_COMMIT_AVAILABLE_AT,
  evidence_ref: sourceRef(
    inputId,
    path,
    sourceSha256,
    `repository-commit-${FORWARD_BASE_EVAL_SOURCE_COMMIT}`,
  ),
});

const pinPackageDraft = <T>(
  value: Omit<ForwardRun1PackageDraft<T>, 'content_sha256'>,
): ForwardRun1PackageDraft<T> => {
  const packageValue: ForwardRun1PackageDraft<T> = {
    ...value,
    content_sha256: '',
  };
  packageValue.content_sha256 = computeForwardPinnedPackageSha256(packageValue);
  return packageValue;
};

const featureNames = (
  configuration: FrozenForwardRidgeConfigurationPackageV1,
): string[] =>
  configuration.configuration.ordered_numeric_features.map((feature) => feature.name);

const dataPromotionEvidence = (inputId: string): ForwardEvidenceRef =>
  sourceRef(
    inputId,
    FORWARD_RUN1_PROMOTION_MARKER_PATH,
    FORWARD_RUN1_PROMOTION_MARKER_SHA256,
    'player-season-coverage-v0-promotion-marker',
  );

const forecastConfigurationEvidence = (): ForwardEvidenceRef =>
  forecastRef(
    FORWARD_RUN1_CONFIGURATION_FREEZE_PATH,
    FORWARD_RUN1_CONFIGURATION_FREEZE_FILE_SHA256,
    'forecast-168-forward-base-configuration-freeze-v1',
  );

const censusValidationEvidence = (): ForwardEvidenceRef =>
  sourceRef(
    FORWARD_RUN1_CENSUS_INPUT_ID,
    FORWARD_RUN1_CENSUS_VALIDATION_PATH,
    FORWARD_RUN1_CENSUS_VALIDATION_SHA256,
    'bounded-2026-population-census-v0-validation',
  );

const packageAdmissionEvidenceRef = (
  contentSha256: string,
): ForwardEvidenceRef => ({
  input_id: null,
  uri_or_path: FORWARD_RUN1_PACKAGE_ADMISSION_EVIDENCE_PATH,
  content_sha256: contentSha256,
  record_id: 'forward-run1-package-admission-evidence-v1',
});

export const buildForwardRun1HistoricalTrainingPackage = (
  originPackages: ForwardBaseEvalOriginPackages,
  frozenConfiguration: FrozenForwardRidgeConfigurationPackageV1,
): ForwardRun1PackageDraft<ForwardTrainingPayload> => {
  if (
    originPackages.source.repository !== FORWARD_BASE_EVAL_SOURCE_REPOSITORY ||
    originPackages.source.commit !== FORWARD_BASE_EVAL_SOURCE_COMMIT ||
    originPackages.source.path !== FORWARD_BASE_EVAL_SOURCE_ARTIFACT_PATH ||
    originPackages.source.sha256 !== FORWARD_BASE_EVAL_SOURCE_SHA256
  ) {
    throw new ForwardRun1AdmissionBuildError(
      'origin packages do not match the exact admitted TIBER-Data source pin.',
    );
  }

  const rows: HistoricalForwardTrainingRowV1[] = originPackages.pairs
    .flatMap((pair) => pair.rows)
    .map((row) => ({
      row_schema_version: HISTORICAL_FORWARD_TRAINING_ROW_SCHEMA_VERSION,
      row_kind: 'historical_forward_training' as const,
      historical_row_id: `${row.input_season}-${row.target_season}|${row.player_id}`,
      historical_origin_id: `origin-${row.input_season}-${row.target_season}`,
      input_season: row.input_season,
      target_season: row.target_season,
      configuration_sha256: frozenConfiguration.configuration_sha256,
      position: row.position,
      source_features: { ...row.features },
      source_missingness: Object.fromEntries(
        featureNames(frozenConfiguration).map((feature) => [feature, false]),
      ),
      target: row.target_derived_ppr,
    }))
    .sort((left, right) =>
      compareForwardCanonicalStrings(left.historical_row_id, right.historical_row_id),
    );
  if (rows.length !== FORWARD_RUN1_EXPECTED_TRAINING_ROWS) {
    throw new ForwardRun1AdmissionBuildError(
      `historical package expected ${FORWARD_RUN1_EXPECTED_TRAINING_ROWS} rows; got ${rows.length}.`,
    );
  }

  const inputId = FORWARD_RUN1_HISTORICAL_TRAINING_INPUT_ID;
  return pinPackageDraft({
    input_id: inputId,
    artifact_type: 'forward_historical_training_package',
    artifact_version: 'forward-run1-v1',
    uri_or_path: FORWARD_RUN1_HISTORICAL_TRAINING_PACKAGE_PATH,
    content: {
      payload: { rows },
      cutoff_records: [dataCommitCutoffRecord(
        inputId,
        FORWARD_BASE_EVAL_SOURCE_ARTIFACT_PATH,
        FORWARD_BASE_EVAL_SOURCE_SHA256,
      )],
    },
    feature_names_admitted: featureNames(frozenConfiguration),
    source_timestamp_locator: 'content.cutoff_records[].fact_available_at',
    normalization_rule_id: CUTOFF_NORMALIZATION_RULE.rule_id,
    normalization_rule_sha256: FORWARD_RUN1_CUTOFF_NORMALIZATION_RULE_SHA256,
    population: {
      row_count: rows.length,
      matched_count: rows.length,
      missing_count: 0,
    },
    limitations: [
      'Runtime package content is a deterministic target-bearing transformation of the exact pinned promoted Data artifact; the raw Data artifact SHA is provenance, not this package content SHA.',
      'Targets use exact eight-component generic full-PPR derivation; promoted season_ppr remains provenance-only.',
    ],
  });
};

const parseCoverageRecords = (artifact: unknown): Record<string, unknown>[] => {
  const record = asRecord(artifact, 'coverage artifact');
  if (
    record.artifact_id !== 'player_season_coverage_v0' ||
    record.spec_version !== 'player_season_coverage_v0_promoted_v1' ||
    record.status !== 'promoted_governed_artifact' ||
    !Array.isArray(record.records) ||
    record.records.length !== 3016
  ) {
    throw new ForwardRun1AdmissionBuildError(
      'coverage artifact identity/status/row count does not match the admitted source.',
    );
  }
  return record.records.map((row, index) => asRecord(row, `coverage records[${index}]`));
};

interface ParsedCensusArtifact {
  rows: Record<string, unknown>[];
  scope_id: string;
  generated_at: string;
}

const parseCensusArtifact = (artifact: unknown): ParsedCensusArtifact => {
  const record = asRecord(artifact, 'census artifact');
  if (
    record.artifact_id !== 'bounded_2026_population_census_v0' ||
    record.schema_version !== 'bounded_2026_population_census_v0.1.0' ||
    record.status !== 'candidate_governed_artifact_not_promoted' ||
    record.population_row_count !== FORWARD_RUN1_EXPECTED_CENSUS_ROWS ||
    !Array.isArray(record.population_rows) ||
    record.population_rows.length !== FORWARD_RUN1_EXPECTED_CENSUS_ROWS
  ) {
    throw new ForwardRun1AdmissionBuildError(
      'census artifact identity/status/row count does not match the admitted source.',
    );
  }
  return {
    rows: record.population_rows.map((row, index) =>
      asRecord(row, `census population_rows[${index}]`),
    ),
    scope_id: readNonEmptyString(record, 'scope_id', 'census artifact'),
    generated_at: readNonEmptyString(record, 'generated_at', 'census artifact'),
  };
};

const sourceFeatures = (
  coverageRow: Record<string, unknown>,
  where: string,
): Record<string, number> => {
  const games = readFinitePath(coverageRow, ['games_played'], where);
  const derivedPpr = centsToPoints(deriveGenericPprCents(coverageRow, where));
  return {
    previous_season_derived_ppr: derivedPpr,
    previous_season_ppr_per_game: games > 0 ? derivedPpr / games : 0,
    previous_season_games_played: games,
    previous_season_targets: readFinitePath(
      coverageRow,
      ['usage_summary', 'targets'],
      where,
    ),
    previous_season_rush_attempts: readFinitePath(
      coverageRow,
      ['production_summary', 'rushing', 'rushing_attempts'],
      where,
    ),
  };
};

export const buildForwardRun1FutureFeaturePackage = (
  coverageArtifact: unknown,
  censusArtifact: unknown,
  frozenConfiguration: FrozenForwardRidgeConfigurationPackageV1,
): ForwardRun1PackageDraft<ForwardInferencePayload> => {
  const coverageRows = parseCoverageRecords(coverageArtifact);
  const census = parseCensusArtifact(censusArtifact);
  const season2025 = new Map<string, Record<string, unknown>>();
  for (const [index, row] of coverageRows.entries()) {
    if (row.season !== FORWARD_RUN1_INPUT_SEASON) continue;
    const playerId = readNonEmptyString(row, 'player_id', `coverage records[${index}]`);
    if (season2025.has(playerId)) {
      throw new ForwardRun1AdmissionBuildError(`duplicate 2025 coverage row for ${playerId}.`);
    }
    season2025.set(playerId, row);
  }

  const rows: ForwardFutureFeatureRow[] = [];
  for (const [index, censusRow] of census.rows.entries()) {
    if (censusRow.population_kind !== 'historical_offense_2025') continue;
    const populationRowId = readNonEmptyString(
      censusRow,
      'population_row_id',
      `census row ${index}`,
    );
    const canonicalPlayerId = readNonEmptyString(
      censusRow,
      'canonical_player_id',
      `census row ${populationRowId}`,
    );
    const position = readNonEmptyString(
      censusRow,
      'position',
      `census row ${populationRowId}`,
    );
    const coverageRow = season2025.get(canonicalPlayerId);
    if (!coverageRow) {
      throw new ForwardRun1AdmissionBuildError(
        `census row ${populationRowId} has no exact 2025 coverage row for ${canonicalPlayerId}.`,
      );
    }
    const features = sourceFeatures(
      coverageRow,
      `future feature row ${populationRowId}`,
    );
    rows.push({
      population_row_id: populationRowId,
      input_season: FORWARD_RUN1_INPUT_SEASON,
      target_season: FORWARD_RUN1_TARGET_SEASON,
      position,
      source_features: features,
      source_missingness: Object.fromEntries(
        Object.keys(features).map((feature) => [feature, false]),
      ),
    });
  }
  rows.sort((left, right) =>
    compareForwardCanonicalStrings(left.population_row_id, right.population_row_id),
  );
  if (rows.length !== FORWARD_RUN1_EXPECTED_FUTURE_FEATURE_ROWS) {
    throw new ForwardRun1AdmissionBuildError(
      `future package expected ${FORWARD_RUN1_EXPECTED_FUTURE_FEATURE_ROWS} rows; got ${rows.length}.`,
    );
  }

  const inputId = FORWARD_RUN1_FUTURE_FEATURE_INPUT_ID;
  return pinPackageDraft({
    input_id: inputId,
    artifact_type: 'forward_future_feature_package',
    artifact_version: 'forward-run1-v1',
    uri_or_path: FORWARD_RUN1_FUTURE_FEATURE_PACKAGE_PATH,
    content: {
      payload: { rows },
      cutoff_records: [dataCommitCutoffRecord(
        inputId,
        FORWARD_BASE_EVAL_SOURCE_ARTIFACT_PATH,
        FORWARD_BASE_EVAL_SOURCE_SHA256,
      )],
    },
    feature_names_admitted: featureNames(frozenConfiguration),
    source_timestamp_locator: 'content.cutoff_records[].fact_available_at',
    normalization_rule_id: CUTOFF_NORMALIZATION_RULE.rule_id,
    normalization_rule_sha256: FORWARD_RUN1_CUTOFF_NORMALIZATION_RULE_SHA256,
    population: {
      row_count: FORWARD_RUN1_EXPECTED_CENSUS_ROWS,
      matched_count: rows.length,
      missing_count: FORWARD_RUN1_EXPECTED_ROOKIE_ROWS_WITHOUT_HISTORY,
    },
    limitations: [
      'Runtime package content is the exact target-free 2025 feature selection for the pinned census, not the raw Data artifact bytes.',
      'The 48 rookie census rows remain absent because no admitted 2025 historical feature row exists; no values are invented or zero-filled.',
    ],
  });
};

const censusEvidenceRef = (
  populationRowId: string,
): ForwardEvidenceRef =>
  sourceRef(
    FORWARD_RUN1_CENSUS_INPUT_ID,
    FORWARD_RUN1_CENSUS_SOURCE_PATH,
    FORWARD_RUN1_CENSUS_SOURCE_SHA256,
    populationRowId,
  );

const toForwardCensusRow = (
  row: Record<string, unknown>,
  index: number,
): ForwardCensusRow => {
  const where = `census row ${index}`;
  const populationRowId = readNonEmptyString(row, 'population_row_id', where);
  const displayName = readNonEmptyString(row, 'player_name', where);
  const positionValue = row.position;
  const position = typeof positionValue === 'string' && positionValue.length > 0
    ? positionValue
    : null;
  const resolved = row.identity_status === 'canonical_id_source_verified';
  const canonicalPlayerId = resolved
    ? readNonEmptyString(row, 'canonical_player_id', where)
    : null;
  const team = asRecord(row.team_assignment, `${where}.team_assignment`);
  const teamAbbr = typeof team.primary_team === 'string' && team.primary_team.length > 0
    ? team.primary_team
    : null;
  const evidence = censusEvidenceRef(populationRowId);
  const positionStatus = position === null
    ? 'unresolved'
    : (FORWARD_SUPPORTED_POSITIONS as readonly string[]).includes(position)
      ? 'supported'
      : 'unsupported';

  return {
    population_row_id: populationRowId,
    player: {
      source_identity_ref: evidence,
      canonical_player_id: canonicalPlayerId,
      display_name: displayName,
      position,
      nfl_team_id: null,
      nfl_team_abbr: teamAbbr,
      team_assignment_status: 'unknown',
      ownership_status: null,
      team_assignment_evidence_ref: evidence,
      provider_eligibility: [],
    },
    identity_status: resolved ? 'resolved' : 'unresolved',
    eligibility_status: 'eligible',
    position_domain_status: positionStatus,
    status_evidence_refs: [evidence],
  };
};

export const buildForwardRun1CensusPackage = (
  censusArtifact: unknown,
  eligibilityPolicySha256: string,
  duplicatePolicySha256: string,
): ForwardRun1PackageDraft<ForwardCensusPayload> => {
  const census = parseCensusArtifact(censusArtifact);
  const rows = census.rows
    .map(toForwardCensusRow)
    .sort((left, right) =>
      compareForwardCanonicalStrings(left.population_row_id, right.population_row_id),
    );
  const inputId = FORWARD_RUN1_CENSUS_INPUT_ID;
  return pinPackageDraft({
    input_id: inputId,
    artifact_type: 'forward_population_census_package',
    artifact_version: 'forward-run1-v1',
    uri_or_path: FORWARD_RUN1_CENSUS_PACKAGE_PATH,
    content: {
      payload: {
        rows,
        scope_definition: census.scope_id,
        effective_at: FORWARD_RUN1_FORECAST_CUTOFF,
        eligibility_policy_id: 'forward-run1-census-eligibility-v1',
        eligibility_policy_sha256: eligibilityPolicySha256,
        duplicate_canonical_id_policy: {
          policy_id: 'forward-run1-duplicate-canonical-id-v1',
          policy_sha256: duplicatePolicySha256,
          max_rows_per_resolved_canonical_id: 1,
        },
      },
      cutoff_records: [dataCommitCutoffRecord(
        inputId,
        FORWARD_RUN1_CENSUS_SOURCE_PATH,
        FORWARD_RUN1_CENSUS_SOURCE_SHA256,
      )],
    },
    feature_names_admitted: [],
    source_timestamp_locator: 'content.cutoff_records[].fact_available_at',
    normalization_rule_id: CUTOFF_NORMALIZATION_RULE.rule_id,
    normalization_rule_sha256: FORWARD_RUN1_CUTOFF_NORMALIZATION_RULE_SHA256,
    population: {
      row_count: rows.length,
      matched_count: rows.length,
      missing_count: 0,
    },
    limitations: [
      'This is the exact bounded two-cohort census, not a complete current-active NFL universe.',
      'Historical team fields are preserved as source context but team_assignment_status remains unknown for 2026.',
      'The 48 rookie identities remain unresolved; no fuzzy or display-name join is performed.',
    ],
  });
};

const assertMaterializationLock = (
  lock: ForwardRun1MaterializationLockV1,
): void => {
  if (lock.lock_version !== 'forward-run1-materialization-lock-v1') {
    throw new ForwardRun1AdmissionBuildError(
      'materialization lock version is not forward-run1-materialization-lock-v1.',
    );
  }
  if (lock.owner_repository !== FORWARD_RUN1_FORECAST_REPOSITORY) {
    throw new ForwardRun1AdmissionBuildError(
      'materialization lock owner must be TIBER-Forecast.',
    );
  }
  if (!GIT_SHA.test(lock.materializer_implementation_commit_sha)) {
    throw new ForwardRun1AdmissionBuildError(
      'materializer implementation commit must be a 40-character Git SHA.',
    );
  }
  const generatedAt = new Date(lock.artifact_generated_at);
  if (
    Number.isNaN(generatedAt.getTime()) ||
    generatedAt.toISOString() !== lock.artifact_generated_at
  ) {
    throw new ForwardRun1AdmissionBuildError(
      'artifact_generated_at must be an exact canonical UTC instant.',
    );
  }
}

const finalizePackage = <T>(input: {
  draft: ForwardRun1PackageDraft<T>;
  lock: ForwardRun1MaterializationLockV1;
  packageAdmissionEvidenceSha256: string;
  sourceGovernanceRefs: readonly ForwardEvidenceRef[];
}): ForwardPinnedInputPackage<T> => {
  const admissionRef = packageAdmissionEvidenceRef(
    input.packageAdmissionEvidenceSha256,
  );
  const packageValue: ForwardPinnedInputPackage<T> = {
    input_id: input.draft.input_id,
    owner_repository: input.lock.owner_repository,
    owner_commit_sha: input.lock.materializer_implementation_commit_sha,
    artifact_type: input.draft.artifact_type,
    artifact_version: input.draft.artifact_version,
    uri_or_path: input.draft.uri_or_path,
    content_sha256: input.draft.content_sha256,
    content: input.draft.content,
    source_as_of: null,
    artifact_generated_at: input.lock.artifact_generated_at,
    governance_status: 'governed',
    governance_decision_refs: [
      ...input.sourceGovernanceRefs,
      forecastConfigurationEvidence(),
      admissionRef,
    ],
    governance_marker_ref: admissionRef,
    availability_status: 'available',
    model_admission: 'admitted',
    feature_names_admitted: input.draft.feature_names_admitted,
    source_timestamp_locator: input.draft.source_timestamp_locator,
    normalization_rule_id: input.draft.normalization_rule_id,
    normalization_rule_sha256: input.draft.normalization_rule_sha256,
    population: input.draft.population,
    limitations: [
      ...input.draft.limitations,
      'TIBER-Forecast owns this deterministic wrapper package; raw TIBER-Data ownership remains preserved in cutoff and source evidence refs.',
      'source_as_of is null because the upstream artifacts expose no package-level domain-time value; commit availability remains cutoff evidence, not domain time.',
      'The later operational materialization timestamp does not expand the frozen model-knowledge cutoff.',
    ],
  };
  const recomputed = computeForwardPinnedPackageSha256(packageValue);
  if (recomputed !== packageValue.content_sha256) {
    throw new ForwardRun1AdmissionBuildError(
      `${packageValue.input_id} runtime content changed while finalizing provenance metadata.`,
    );
  }
  return packageValue;
};

export const materializeForwardRun1Packages = (input: {
  lock: ForwardRun1MaterializationLockV1;
  historicalTrainingDraft: ForwardRun1PackageDraft<ForwardTrainingPayload>;
  futureFeatureDraft: ForwardRun1PackageDraft<ForwardInferencePayload>;
  censusDraft: ForwardRun1PackageDraft<ForwardCensusPayload>;
}): ForwardRun1MaterializedPackages => {
  assertMaterializationLock(input.lock);

  const drafts = [
    input.historicalTrainingDraft,
    input.futureFeatureDraft,
    input.censusDraft,
  ] as const;
  const scoringDrafts = [
    input.historicalTrainingDraft,
    input.futureFeatureDraft,
  ] as const;
  const scoringInputHashes = scoringDrafts
    .map((draft) => draft.content_sha256)
    .sort(compareForwardCanonicalStrings);
  const packageAdmissionEvidence: ForwardRun1PackageAdmissionEvidenceV1 = {
    artifact_type: FORWARD_RUN1_PACKAGE_ADMISSION_EVIDENCE_ARTIFACT_TYPE,
    artifact_version: FORWARD_RUN1_PACKAGE_ADMISSION_EVIDENCE_VERSION,
    generated_at: input.lock.artifact_generated_at,
    owner_repository: input.lock.owner_repository,
    materializer_implementation_commit_sha:
      input.lock.materializer_implementation_commit_sha,
    runtime_source_code_freeze: {
      repository: FORWARD_RUN1_FORECAST_REPOSITORY,
      commit_sha: FORWARD_RUN1_FORECAST_COMMIT,
      fact_available_at: FORWARD_RUN1_FORECAST_COMMIT_AVAILABLE_AT,
    },
    run_id: FORWARD_RUN1_RUN_ID,
    forecast_cutoff: FORWARD_RUN1_FORECAST_CUTOFF,
    package_admission: {
      status: 'admitted',
      operator_decision_refs: [
        {
          comment_id: 5157636151,
          url: FORWARD_RUN1_INPUT_ADMISSION_DECISION_URL,
          observed_body_sha256:
            FORWARD_RUN1_INPUT_ADMISSION_DECISION_BODY_SHA256,
          authority_scope:
            'candidate-only historical input admission and bounded Forecast-side compatibility prerequisite',
        },
        {
          comment_id: 5172232689,
          url: FORWARD_RUN1_CUTOFF_AND_PACKAGE_DECISION_URL,
          observed_body_sha256:
            FORWARD_RUN1_CUTOFF_AND_PACKAGE_DECISION_BODY_SHA256,
          authority_scope:
            'retain frozen pins, correct cutoff, materialize exact scoring packages, and prove runtime gates without execution',
        },
      ],
      packages: drafts.map((draft) => ({
        input_id: draft.input_id,
        artifact_type: draft.artifact_type,
        artifact_version: draft.artifact_version,
        uri_or_path: draft.uri_or_path,
        runtime_content_sha256: draft.content_sha256,
      })),
      raw_data_refs: [
        {
          repository: DATA_REPOSITORY_AT_COMMIT,
          path: FORWARD_BASE_EVAL_SOURCE_ARTIFACT_PATH,
          content_sha256: FORWARD_BASE_EVAL_SOURCE_SHA256,
          purpose: 'historical training targets and future features',
        },
        {
          repository: DATA_REPOSITORY_AT_COMMIT,
          path: FORWARD_RUN1_CENSUS_SOURCE_PATH,
          content_sha256: FORWARD_RUN1_CENSUS_SOURCE_SHA256,
          purpose: 'bounded population census',
        },
      ],
    },
    scoring_reconciliation: {
      status: 'passed',
      validator_id: 'tiber-forecast-run1-derived-component-scoring-binding',
      validator_version: '1.0.0',
      scoring_profile_sha256: TIBER_GENERIC_FULL_PPR_V1_SHA256,
      source_input_ids: scoringDrafts.map((draft) => draft.input_id),
      source_input_runtime_content_sha256s: scoringInputHashes,
      source_inputs: scoringDrafts.map((draft) => ({
        input_id: draft.input_id,
        runtime_content_sha256: draft.content_sha256,
      })),
      raw_data_reconciliation_ref: {
        repository: DATA_REPOSITORY_AT_COMMIT,
        path: FORWARD_RUN1_SCORING_RECONCILIATION_PATH,
        content_sha256: FORWARD_RUN1_SCORING_RECONCILIATION_SHA256,
      },
      profile_equivalence_ref: {
        repository: FORWARD_RUN1_FORECAST_REPOSITORY,
        path: FORWARD_RUN1_SCORING_PROFILE_EQUIVALENCE_PATH,
        content_sha256: FORWARD_RUN1_SCORING_PROFILE_EQUIVALENCE_SHA256,
      },
    },
    limitations: [
      'This evidence admits only the exact deterministic wrapper packages for the candidate-only Run 1 prerequisite; it does not authorize fitting, execution, promotion, deployment, or consumption.',
      'The upstream Data scoring and census artifacts do not themselves authorize Forecast execution; the cited operator dispositions supply only this bounded Forecast-side package admission.',
      'Runtime package hashes cover canonical {payload, cutoff_records}; final full-file hashes are recorded outside this artifact to avoid a self-hash cycle.',
      'Operational package generation occurred after the knowledge cutoff, as explicitly permitted when every used fact has immutable cutoff-eligible evidence.',
    ],
  };
  const packageAdmissionEvidenceSha256 = canonicalForwardJsonSha256(
    packageAdmissionEvidence,
  );

  return {
    historicalTrainingPackage: finalizePackage({
      draft: input.historicalTrainingDraft,
      lock: input.lock,
      packageAdmissionEvidenceSha256,
      sourceGovernanceRefs: [
        dataPromotionEvidence(input.historicalTrainingDraft.input_id),
      ],
    }),
    futureFeaturePackage: finalizePackage({
      draft: input.futureFeatureDraft,
      lock: input.lock,
      packageAdmissionEvidenceSha256,
      sourceGovernanceRefs: [
        dataPromotionEvidence(input.futureFeatureDraft.input_id),
      ],
    }),
    censusPackage: finalizePackage({
      draft: input.censusDraft,
      lock: input.lock,
      packageAdmissionEvidenceSha256,
      sourceGovernanceRefs: [censusValidationEvidence()],
    }),
    packageAdmissionEvidence,
    packageAdmissionEvidenceSha256,
  };
};

const buildEvaluationDesign = (): ForwardEvaluationDesign => {
  const design = {
    design_id: 'forward-base-expanding-window-rolling-origin-v1',
    historical_origins: [
      ['origin-2021-2022', 2021, 2022],
      ['origin-2022-2023', 2022, 2023],
      ['origin-2023-2024', 2023, 2024],
      ['origin-2024-2025', 2024, 2025],
    ].map(([originId, inputSeason, targetSeason]) => ({
      origin_id: String(originId),
      input_seasons: [Number(inputSeason)],
      target_season: Number(targetSeason),
      origin_cutoff: FORWARD_RUN1_DATA_COMMIT_AVAILABLE_AT,
      input_artifact_sha256: FORWARD_BASE_EVAL_SOURCE_SHA256,
      target_artifact_sha256: FORWARD_BASE_EVAL_SOURCE_SHA256,
    })),
    model_selection_partition: '2021->2022 through 2023->2024 expanding-window selection origins',
    final_evaluation_partition: '2024 inputs -> 2025 targets held out until lambda freeze',
    split_method: 'expanding-window rolling-origin',
    fold_grouping: 'player-season rows grouped by historical origin',
    hyperparameter_selection: 'minimum mean selection MAE; ties to smaller lambda',
    final_origin_not_used_for_tuning: true as const,
    baseline_definitions: ['position mean', 'previous-season derived generic PPR'],
  };
  return {
    ...design,
    design_sha256: canonicalForwardJsonSha256(design),
  };
};

const targetDefinition = (): ForwardTargetDefinition => ({
  target_id: 'generic-full-ppr-regular-season-total-2026',
  description: '2026 regular-season generic full-PPR total.',
  target_season: FORWARD_RUN1_TARGET_SEASON,
  regular_season_only: true,
  week_inclusion_rule: 'NFL regular-season weeks only',
  season_completeness_rule: 'bounded census rows remain visible even when a forecast is unavailable',
  aggregation_rule: 'exact eight-component generic full-PPR scoring in integer cents',
  scoring_profile_id: FORWARD_SCORING_PROFILE_ID,
  outcome_field: 'actual_outcome',
  forward_outcome_must_be_null: true,
});

const historicalValidationSummary = (): ForwardHistoricalValidationSummary => ({
  evaluation_artifact_refs: [{
    artifact_type: 'forward_base_model_evaluation',
    artifact_version: 'forward-base-eval-v1',
    uri_or_path: `${FORECAST_REPOSITORY_AT_COMMIT}:${FORWARD_RUN1_HISTORICAL_EVALUATION_PATH}`,
    content_sha256: FORWARD_RUN1_HISTORICAL_EVALUATION_SHA256,
  }],
  overall_metrics: {},
  position_metrics: {},
  calibration_metrics: {},
  sanity_controls: [
    'Configuration was selected before the final 2024->2025 held-out evaluation.',
  ],
  limitations: [
    'Point-only base model; uncertainty is unavailable_not_calibrated.',
  ],
});

export const buildForwardRun1AdmissionPreflightInput = (input: {
  frozenConfiguration: FrozenForwardRidgeConfigurationPackageV1;
  historicalTrainingPackage: ForwardPinnedInputPackage<ForwardTrainingPayload>;
  futureFeaturePackage: ForwardPinnedInputPackage<ForwardInferencePayload>;
  censusPackage: ForwardPinnedInputPackage<ForwardCensusPayload>;
  packageAdmissionEvidenceSha256: string;
  preflightGeneratedAt: string;
}): RunForwardCandidateInput => {
  const packages = [
    input.historicalTrainingPackage,
    input.futureFeaturePackage,
    input.censusPackage,
  ] as const;
  const packagePins = Object.fromEntries(
    packages.map((packageValue) => [packageValue.input_id, packageValue.content_sha256]),
  );
  const scoringInputHashes = [
    input.historicalTrainingPackage.content_sha256,
    input.futureFeaturePackage.content_sha256,
  ].sort(compareForwardCanonicalStrings);
  const scoringReconciliation: ScoringReconciliationEvidenceRef = {
    status: 'passed',
    validator_id: 'tiber-forecast-run1-derived-component-scoring-binding',
    validator_version: '1.0.0',
    evidence_ref: {
      repository: FORWARD_RUN1_FORECAST_REPOSITORY,
      path: FORWARD_RUN1_PACKAGE_ADMISSION_EVIDENCE_PATH,
      artifact_version: FORWARD_RUN1_PACKAGE_ADMISSION_EVIDENCE_VERSION,
      content_sha256: input.packageAdmissionEvidenceSha256,
    },
    scoring_profile_sha256: TIBER_GENERIC_FULL_PPR_V1_SHA256,
    source_input_sha256s: scoringInputHashes,
  };

  return {
    run_id: FORWARD_RUN1_RUN_ID,
    target_season: FORWARD_RUN1_TARGET_SEASON,
    input_season: FORWARD_RUN1_INPUT_SEASON,
    forecast_cutoff: FORWARD_RUN1_FORECAST_CUTOFF,
    generated_at: input.preflightGeneratedAt,
    git_commit_sha: FORWARD_RUN1_FORECAST_COMMIT,
    lane_version: 'forward-base-eval-v1',
    frozen_configuration: input.frozenConfiguration,
    decision_freezes: {
      configuration: {
        decision_id: 'forecast-168-forward-base-configuration-freeze-v1',
        frozen_at: '2026-07-28T12:00:00.000Z',
        fact_available_at: FORWARD_RUN1_FORECAST_COMMIT_AVAILABLE_AT,
        evidence_refs: [forecastConfigurationEvidence()],
        configuration_sha256: input.frozenConfiguration.configuration_sha256,
      },
      source_code: {
        decision_id: 'forecast-170-forward-run1-source-code-freeze-v1',
        frozen_at: FORWARD_RUN1_FORECAST_COMMIT_AVAILABLE_AT,
        fact_available_at: FORWARD_RUN1_FORECAST_COMMIT_AVAILABLE_AT,
        evidence_refs: [forecastRef(
          `git-commit/${FORWARD_RUN1_FORECAST_COMMIT}`,
          FORWARD_RUN1_FORECAST_COMMIT_EVIDENCE_SHA256,
          FORWARD_RUN1_FORECAST_COMMIT,
        )],
        git_commit_sha: FORWARD_RUN1_FORECAST_COMMIT,
      },
    },
    historical_training_package: input.historicalTrainingPackage,
    future_feature_package: input.futureFeaturePackage,
    census_package: input.censusPackage,
    scoring_profile_ref: TIBER_GENERIC_FULL_PPR_V1_PROFILE_REF,
    scoring_reconciliation: scoringReconciliation,
    scoring_input_ids: [
      FORWARD_RUN1_HISTORICAL_TRAINING_INPUT_ID,
      FORWARD_RUN1_FUTURE_FEATURE_INPUT_ID,
    ],
    expected_pins: {
      git_commit_sha: FORWARD_RUN1_FORECAST_COMMIT,
      configuration_sha256: input.frozenConfiguration.configuration_sha256,
      scoring_profile_sha256: TIBER_GENERIC_FULL_PPR_V1_SHA256,
      input_sha256: packagePins,
      census_sha256: input.censusPackage.content_sha256,
    },
    target_definition: targetDefinition(),
    evaluation_design: buildEvaluationDesign(),
    historical_validation_summary: historicalValidationSummary(),
    admitted_capabilities: ['forward-base-production-features-v1'],
    limitations: [
      'Preflight assembly only; test coverage probes the unchanged 813eff runtime to the fit boundary and stops before model fitting or artifact emission.',
      'Candidate only; production_ready=false and consumer_eligibility=never remain runtime literals.',
      'No Teamstate, role-and-opportunity, age, injury, rookie, or league-specific feature family is admitted.',
    ],
  };
};
