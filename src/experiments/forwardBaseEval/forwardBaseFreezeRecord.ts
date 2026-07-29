import { createHash } from 'node:crypto';
import {
  FITTED_FORWARD_RIDGE_ARTIFACT_VERSION,
  FORWARD_RIDGE_CONFIGURATION_SCHEMA_VERSION,
  FUTURE_FORWARD_INFERENCE_ROW_SCHEMA_VERSION,
  HISTORICAL_FORWARD_TRAINING_ROW_SCHEMA_VERSION,
  sha256ForwardCanonicalValue,
  validateFrozenForwardRidgeConfiguration,
  type FrozenForwardRidgeConfigurationPackageV1,
} from '../../models/seasonal/forwardRidgeModel.js';
import { canonicalForwardJson } from '../../serialization/canonicalForwardArtifacts.js';
import {
  FORWARD_BASE_EVAL_DATA_CONTRACT_SHA256,
  FORWARD_BASE_EVAL_FINAL_DEFINITION,
  FORWARD_BASE_EVAL_LAMBDA_CANDIDATES,
  FORWARD_BASE_EVAL_POSITIONS,
  FORWARD_BASE_EVAL_SCORING_PROFILE_SHA256,
  FORWARD_BASE_EVAL_SELECTION_DEFINITIONS,
  FORWARD_BASE_EVAL_SOURCE_ARTIFACT_PATH,
  FORWARD_BASE_EVAL_SOURCE_COMMIT,
  FORWARD_BASE_EVAL_SOURCE_REPOSITORY,
  FORWARD_BASE_EVAL_SOURCE_SHA256,
} from './forwardBaseEvaluation.js';

export const FORWARD_BASE_FREEZE_RECORD_SCHEMA_VERSION =
  'forward-base-configuration-freeze-record-v1' as const;
export const FORWARD_BASE_FREEZE_RECORD_ARTIFACT_ID =
  'forward_base_configuration_freeze_record_v1' as const;
export const FORWARD_BASE_FREEZE_RECORD_PATH =
  'data/experiments/forwardBaseEval/forward_base_configuration_freeze_record_v1.json' as const;
export const FORWARD_BASE_RUNTIME_CONFIGURATION_PATH =
  'data/experiments/forwardBaseEval/forward_base_frozen_configuration_v1.json' as const;
export const FORWARD_BASE_ORIGIN_PACKAGES_PATH =
  'data/experiments/forwardBaseEval/forward_base_eval_origin_pairs_v1.json' as const;
export const FORWARD_BASE_EVALUATION_ARTIFACT_ID =
  'forward_base_model_evaluation_v1' as const;
export const FORWARD_BASE_EVALUATION_ARTIFACT_PATH =
  'data/experiments/forwardBaseEval/forward_base_model_evaluation_v1.json' as const;

/** Exact commit that produced the approved, byte-pinned evaluation report. */
export const FORWARD_BASE_HISTORICAL_EVALUATION_PRODUCER_COMMIT =
  'dc1816d01e9163ec3acaa86105203e4b48c640d3' as const;
export const FORWARD_BASE_RUNTIME_BASE_COMMIT =
  '640c0419170a96775362617cabcf8048c020c901' as const;
export const FORWARD_BASE_RUNTIME_CONFIGURATION_ARTIFACT_SHA256 =
  '5d6a963bf15975a65cfdd6e3d6f440f56ea6213ec04bf31b4a985b4d0fc6427a' as const;
export const FORWARD_BASE_FROZEN_CONFIGURATION_SHA256 =
  '6bb7323cdc11786a13b5ca92c66f1e72b34c9387cc4760b6f293c95b3682ad1c' as const;
export const FORWARD_BASE_ORIGIN_PACKAGES_ARTIFACT_SHA256 =
  'ac0f9c7a8f541f1f8a64eb18ebebaaaa52704636ad5e7afdfe2b45366eb4e796' as const;
export const FORWARD_BASE_HISTORICAL_EVALUATION_ARTIFACT_SHA256 =
  '04fae89ae324b0341c60870ce1f9e0fb3812eab045585862a946a80824610971' as const;

/**
 * Exact load-bearing source/configuration files whose raw bytes must match the
 * governed implementation commit. The final freeze record is added only in a
 * child commit, avoiding a self-referential commit identity.
 */
export const FORWARD_BASE_GOVERNED_IMPLEMENTATION_PATHS = [
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'scripts/runForwardBaseEvalBuild.ts',
  'scripts/runForwardBaseModelEvaluation.ts',
  'src/contracts/forwardSeasonalPpr.ts',
  'src/contracts/scoring.ts',
  'src/contracts/seasonalPprBacktest.ts',
  'src/datasets/seasonal/evaluateSeasonalPpr.ts',
  'src/experiments/forwardBaseEval/forwardBaseEvaluation.ts',
  'src/experiments/forwardBaseEval/forwardBaseFreezeRecord.ts',
  'src/models/seasonal/forwardRidgeModel.ts',
  'src/models/seasonal/linearAlgebra.ts',
  'src/serialization/canonicalForwardArtifacts.ts',
] as const;

export type ForwardBaseGovernedImplementationPath =
  (typeof FORWARD_BASE_GOVERNED_IMPLEMENTATION_PATHS)[number];

export interface ForwardBaseGovernedImplementationSource {
  commit: string;
  files: Array<{
    path: ForwardBaseGovernedImplementationPath;
    bytes: Uint8Array;
  }>;
}

export interface ForwardBaseGovernedImplementationIdentity {
  repository: 'Prometheus-Frameworks/TIBER-Forecast';
  commit: string;
  files: Array<{
    path: ForwardBaseGovernedImplementationPath;
    sha256: string;
  }>;
}

const DATA_PROFILE_DEFINITION_SHA256 =
  'b1404afb1c7c6c9760b36090e5a84ef3fd2a29dfe8ba2e2fe0efb98d0ac6622e' as const;
const CONTINUATION_RULE =
  'freeze only if the frozen-lambda model beats both baselines on the final held-out evaluation and did not lose to a baseline on any selection evaluation' as const;
const SELECTION_RULE =
  'minimize mean MAE across selection evaluations A and B; ties break to the smaller lambda' as const;

const PRODUCTION_ONLY_FAMILY = ['player', 'history', 'production', 'only', 'v0'].join('_');
const FULL_FIVE_FAMILY = ['full', 'five', 'family', 'player', 'history'].join('_');

const EXCLUDED_FEATURE_FAMILIES = [
  PRODUCTION_ONLY_FAMILY,
  FULL_FIVE_FAMILY,
  'teamstate',
  'role_and_opportunity',
  'age_and_experience_modifiers',
  'injury_context',
  'rookie_transition_features',
  'league_specific_scoring',
] as const;

const sha256Bytes = (bytes: Uint8Array): string =>
  createHash('sha256').update(bytes).digest('hex');

const isLowercaseSha256 = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);

export const buildForwardBaseGovernedImplementationIdentity = (
  source: ForwardBaseGovernedImplementationSource,
): ForwardBaseGovernedImplementationIdentity => {
  if (!/^[0-9a-f]{40}$/.test(source.commit)) {
    throw new ForwardBaseFreezeRecordError(
      'governed implementation commit must be lowercase 40-character git SHA-1 hex.',
    );
  }
  const byPath = new Map<string, Uint8Array>();
  for (const file of source.files) {
    if (byPath.has(file.path)) {
      throw new ForwardBaseFreezeRecordError(
        `duplicate governed implementation path: ${file.path}.`,
      );
    }
    if (!(file.bytes instanceof Uint8Array)) {
      throw new ForwardBaseFreezeRecordError(
        `governed implementation bytes are missing for ${file.path}.`,
      );
    }
    byPath.set(file.path, file.bytes);
  }
  const actualPaths = [...byPath.keys()].sort();
  const expectedPaths = [...FORWARD_BASE_GOVERNED_IMPLEMENTATION_PATHS].sort();
  if (JSON.stringify(actualPaths) !== JSON.stringify(expectedPaths)) {
    throw new ForwardBaseFreezeRecordError(
      'governed implementation files must match the complete load-bearing path set.',
    );
  }
  return {
    repository: 'Prometheus-Frameworks/TIBER-Forecast',
    commit: source.commit,
    files: FORWARD_BASE_GOVERNED_IMPLEMENTATION_PATHS.map((filePath) => ({
      path: filePath,
      sha256: sha256Bytes(byPath.get(filePath)!),
    })),
  };
};

const buildRecordValue = (input: {
  runtimeConfiguration: FrozenForwardRidgeConfigurationPackageV1;
  governedImplementation: ForwardBaseGovernedImplementationIdentity;
}) => ({
  freeze_record_schema_version: FORWARD_BASE_FREEZE_RECORD_SCHEMA_VERSION,
  freeze_record_id: 'forecast-168-forward-base-configuration-freeze-v1',
  terminal_decision: 'forward_base_model_configuration_frozen',
  authorizing_issue_ref: 'Prometheus-Frameworks/TIBER-Forecast#168',
  runtime_configuration: {
    artifact_path: FORWARD_BASE_RUNTIME_CONFIGURATION_PATH,
    artifact_sha256: FORWARD_BASE_RUNTIME_CONFIGURATION_ARTIFACT_SHA256,
    configuration_sha256: input.runtimeConfiguration.configuration_sha256,
    configuration_package: input.runtimeConfiguration,
  },
  target_and_scoring_identity: {
    profile_id: 'tiber-generic-full-ppr-v1',
    profile_version: '1.0.0',
    league_specific: false,
    regular_season_only: true,
    forecast_profile_sha256: FORWARD_BASE_EVAL_SCORING_PROFILE_SHA256,
    data_contract_profile_definition_sha256: DATA_PROFILE_DEFINITION_SHA256,
    profile_hash_equivalence_decision_ref:
      'docs/decisions/scoring-profile-hash-equivalence-2026-07-28.md',
    target_definition:
      'derived_component_generic_ppr_exact_integer_cents',
    target_definition_decision_ref:
      'docs/decisions/forward-scoring-target-disposition-2026-07-28.md',
    component_binding_contract_sha256: FORWARD_BASE_EVAL_DATA_CONTRACT_SHA256,
    promoted_season_ppr_role: 'provenance_only_never_target_or_graded_actual',
  },
  governed_population_identity: {
    repository: FORWARD_BASE_EVAL_SOURCE_REPOSITORY,
    commit: FORWARD_BASE_EVAL_SOURCE_COMMIT,
    path: FORWARD_BASE_EVAL_SOURCE_ARTIFACT_PATH,
    sha256: FORWARD_BASE_EVAL_SOURCE_SHA256,
    seasons: [2021, 2022, 2023, 2024, 2025],
    season_type: 'REG',
    supported_positions: [...FORWARD_BASE_EVAL_POSITIONS],
    origin_packages_artifact_id: 'forward_base_eval_origin_pairs_v1',
    origin_packages_path: FORWARD_BASE_ORIGIN_PACKAGES_PATH,
    origin_packages_sha256: FORWARD_BASE_ORIGIN_PACKAGES_ARTIFACT_SHA256,
  },
  preprocessing_and_standardization: {
    ordered_numeric_features:
      input.runtimeConfiguration.configuration.ordered_numeric_features,
    missingness_rule: 'each feature uses reject_row; unavailable is never observed_zero',
    per_game_rule: 'derived_ppr_divided_by_games; genuine_zero_when_games_played_is_zero',
    target_validation: 'finite_non_null_derived_target_required',
    standardization: {
      kind: 'population_zscore',
      learned_from: 'applicable_training_fold_only',
      zero_variance_threshold: 1e-9,
      zero_variance_replacement: 1,
    },
    categorical_encoding: {
      feature: 'position',
      levels_ordered: input.runtimeConfiguration.configuration.position_levels,
      reference_level:
        input.runtimeConfiguration.configuration.position_reference_level,
      kind: 'reference_level_one_hot',
    },
    clamp: input.runtimeConfiguration.configuration.clamp,
  },
  lambda_selection_protocol: {
    candidates: [...FORWARD_BASE_EVAL_LAMBDA_CANDIDATES],
    selection_rule: SELECTION_RULE,
    selection_evaluations: FORWARD_BASE_EVAL_SELECTION_DEFINITIONS.map(
      (definition) => ({
        eval_id: definition.eval_id,
        training_pair_ids: [...definition.training_pair_ids],
        evaluation_pair_id: definition.evaluation_pair_id,
      }),
    ),
    selected_lambda: input.runtimeConfiguration.configuration.lambda,
    final_evaluation: {
      eval_id: FORWARD_BASE_EVAL_FINAL_DEFINITION.eval_id,
      training_pair_ids: [
        ...FORWARD_BASE_EVAL_FINAL_DEFINITION.training_pair_ids,
      ],
      evaluation_pair_id:
        FORWARD_BASE_EVAL_FINAL_DEFINITION.evaluation_pair_id,
    },
    continuation_rule: CONTINUATION_RULE,
    stage_order: [
      'selection_only_packages',
      'configuration_freeze',
      'final_held_out_evaluation',
    ],
  },
  approved_historical_evaluation_refs: [
    {
      artifact_id: FORWARD_BASE_EVALUATION_ARTIFACT_ID,
      artifact_path: FORWARD_BASE_EVALUATION_ARTIFACT_PATH,
      artifact_sha256: FORWARD_BASE_HISTORICAL_EVALUATION_ARTIFACT_SHA256,
      authorizing_issue_ref: 'Prometheus-Frameworks/TIBER-Forecast#168',
      historical_evaluation_producer_commit:
        FORWARD_BASE_HISTORICAL_EVALUATION_PRODUCER_COMMIT,
      approval_scope:
        'operator_authorized_historical_configuration_freeze_evidence',
    },
  ],
  excluded_feature_families: [...EXCLUDED_FEATURE_FAMILIES],
  software_and_schema_identity: {
    repository: 'Prometheus-Frameworks/TIBER-Forecast',
    governed_protocol_implementation: input.governedImplementation,
    historical_evaluation_producer_commit:
      FORWARD_BASE_HISTORICAL_EVALUATION_PRODUCER_COMMIT,
    runtime_base_commit: FORWARD_BASE_RUNTIME_BASE_COMMIT,
    configuration_schema_version: FORWARD_RIDGE_CONFIGURATION_SCHEMA_VERSION,
    historical_training_row_schema_version:
      HISTORICAL_FORWARD_TRAINING_ROW_SCHEMA_VERSION,
    future_inference_row_schema_version:
      FUTURE_FORWARD_INFERENCE_ROW_SCHEMA_VERSION,
    fitted_model_artifact_version: FITTED_FORWARD_RIDGE_ARTIFACT_VERSION,
    forecast_runtime_version:
      input.runtimeConfiguration.configuration.software_version,
    numeric_runtime: 'ecmascript-number',
    linear_algebra: 'seasonal-ridge-normal-equations-v1',
    canonical_serialization:
      'sorted_utf16_keys_compact_json_exactly_one_trailing_lf',
  },
  activation_boundaries: {
    eligible_for:
      'later final_fit_and_inference_implementation_under_separate_authority',
    does_not_authorize: [
      '2026_input_admission',
      'forecast_cutoff_selection',
      'seasonal-ppr-2026-forward-001_execution',
      'promotion',
      'deployment',
      'downstream_consumption',
    ],
  },
});

export type ForwardBaseConfigurationFreezeRecordV1 = ReturnType<
  typeof buildRecordValue
>;

export interface ForwardBaseConfigurationFreezeRecordPackageV1 {
  freeze_record_sha256: string;
  freeze_record: ForwardBaseConfigurationFreezeRecordV1;
}

export interface ForwardBaseFreezeRecordDependencies {
  runtimeConfigurationBytes: Uint8Array;
  originPackagesBytes: Uint8Array;
  historicalEvaluationBytes: Uint8Array;
  governedImplementation: ForwardBaseGovernedImplementationSource;
}

export type ForwardBaseFreezeRecordValidationResult =
  | {
      ok: true;
      data: ForwardBaseConfigurationFreezeRecordPackageV1;
      errors: [];
    }
  | { ok: false; errors: string[] };

export class ForwardBaseFreezeRecordError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ForwardBaseFreezeRecordError';
  }
}

export const buildForwardBaseConfigurationFreezeRecord = (input: {
  runtimeConfiguration: FrozenForwardRidgeConfigurationPackageV1;
  governedImplementation: ForwardBaseGovernedImplementationIdentity;
}): ForwardBaseConfigurationFreezeRecordPackageV1 => {
  const runtimeValidation = validateFrozenForwardRidgeConfiguration(
    input.runtimeConfiguration,
  );
  if (!runtimeValidation.ok) {
    throw new ForwardBaseFreezeRecordError(
      `runtime configuration is invalid: ${runtimeValidation.errors.join('; ')}`,
    );
  }
  if (
    sha256ForwardCanonicalValue(runtimeValidation.data) !==
    FORWARD_BASE_RUNTIME_CONFIGURATION_ARTIFACT_SHA256
  ) {
    throw new ForwardBaseFreezeRecordError(
      'runtime configuration bytes do not match the immutable v1 artifact hash.',
    );
  }
  if (
    runtimeValidation.data.configuration_sha256 !==
    FORWARD_BASE_FROZEN_CONFIGURATION_SHA256
  ) {
    throw new ForwardBaseFreezeRecordError(
      'runtime configuration identity does not match the approved v1 selection.',
    );
  }
  if (
    input.governedImplementation.repository !==
      'Prometheus-Frameworks/TIBER-Forecast' ||
    !/^[0-9a-f]{40}$/.test(input.governedImplementation.commit) ||
    input.governedImplementation.files.length !==
      FORWARD_BASE_GOVERNED_IMPLEMENTATION_PATHS.length ||
    input.governedImplementation.files.some(
      (file, index) =>
        file.path !== FORWARD_BASE_GOVERNED_IMPLEMENTATION_PATHS[index] ||
        !isLowercaseSha256(file.sha256),
    )
  ) {
    throw new ForwardBaseFreezeRecordError(
      'governed implementation identity is malformed or incomplete.',
    );
  }
  const freezeRecord = buildRecordValue({
    runtimeConfiguration: runtimeValidation.data,
    governedImplementation: input.governedImplementation,
  });
  return {
    freeze_record_sha256: sha256ForwardCanonicalValue(freezeRecord),
    freeze_record: freezeRecord,
  };
};

const deepFreeze = <T>(value: T): T => {
  if (Array.isArray(value)) {
    value.forEach(deepFreeze);
    return Object.freeze(value);
  }
  if (typeof value === 'object' && value !== null) {
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  }
  return value;
};

const parseJsonBytes = (
  bytes: Uint8Array,
  label: string,
  errors: string[],
): unknown => {
  if (!(bytes instanceof Uint8Array)) {
    errors.push(`${label} dependency must be supplied as raw bytes.`);
    return null;
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
  } catch (error) {
    errors.push(
      `${label} dependency is not valid UTF-8 JSON: ${
        error instanceof Error ? error.message : 'unknown error'
      }.`,
    );
    return null;
  }
};

const asObject = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const verifyOriginPackageSemantics = (
  value: unknown,
  errors: string[],
): void => {
  const origin = asObject(value);
  const source = asObject(origin?.source);
  if (
    origin?.artifact_id !== 'forward_base_eval_origin_pairs_v1' ||
    !Array.isArray(origin.pairs) ||
    origin.pairs.length !== 4 ||
    source?.repository !== FORWARD_BASE_EVAL_SOURCE_REPOSITORY ||
    source?.commit !== FORWARD_BASE_EVAL_SOURCE_COMMIT ||
    source?.path !== FORWARD_BASE_EVAL_SOURCE_ARTIFACT_PATH ||
    source?.sha256 !== FORWARD_BASE_EVAL_SOURCE_SHA256
  ) {
    errors.push(
      'supplied origin-package bytes do not match the governed v1 source identity and four-pair protocol.',
    );
  }
};

const verifyHistoricalEvaluationSemantics = (
  value: unknown,
  runtimeConfiguration: FrozenForwardRidgeConfigurationPackageV1 | null,
  errors: string[],
): void => {
  const report = asObject(value);
  const selection = asObject(report?.selection);
  const final = asObject(report?.final);
  const protocol = asObject(report?.protocol);
  if (
    report?.artifact_id !== FORWARD_BASE_EVALUATION_ARTIFACT_ID ||
    report?.terminal_decision !== 'forward_base_model_configuration_frozen' ||
    report?.origin_packages_sha256 !==
      FORWARD_BASE_ORIGIN_PACKAGES_ARTIFACT_SHA256 ||
    !runtimeConfiguration ||
    report?.frozen_configuration_sha256 !==
      runtimeConfiguration.configuration_sha256 ||
    selection?.selected_lambda !== runtimeConfiguration.configuration.lambda ||
    final?.configuration_sha256 !== runtimeConfiguration.configuration_sha256 ||
    final?.lambda !== runtimeConfiguration.configuration.lambda ||
    final?.eval_id !== FORWARD_BASE_EVAL_FINAL_DEFINITION.eval_id ||
    !Array.isArray(protocol?.lambda_candidates) ||
    canonicalForwardJson(protocol?.lambda_candidates) !==
      canonicalForwardJson(FORWARD_BASE_EVAL_LAMBDA_CANDIDATES) ||
    protocol?.selection_rule !== SELECTION_RULE ||
    protocol?.continuation_rule !== CONTINUATION_RULE
  ) {
    errors.push(
      'approved historical evaluation does not agree with the embedded selected lambda, configuration hash, origin package, and frozen protocol.',
    );
  }
};

/**
 * Verify the self-hash, fixed v1 record shape, immutable artifact hashes,
 * semantic agreement between the approved evaluation and embedded runtime
 * configuration, and exact raw dependency bytes. The implementation dependency
 * must be loaded from the recorded commit (the runner and tests use `git show`)
 * so the commit pin and every load-bearing source hash are both checked.
 */
export const validateForwardBaseConfigurationFreezeRecord = (
  value: unknown,
  dependencies: ForwardBaseFreezeRecordDependencies,
): ForwardBaseFreezeRecordValidationResult => {
  const errors: string[] = [];
  let isolated: unknown;
  try {
    isolated = JSON.parse(canonicalForwardJson(value)) as unknown;
  } catch (error) {
    return {
      ok: false,
      errors: [
        `freeze record canonicalization failed: ${
          error instanceof Error ? error.message : 'unknown error'
        }.`,
      ],
    };
  }
  if (typeof isolated !== 'object' || isolated === null || Array.isArray(isolated)) {
    return { ok: false, errors: ['freeze record package must be an object.'] };
  }
  const packageValue = isolated as Record<string, unknown>;
  const topKeys = Object.keys(packageValue).sort();
  if (
    JSON.stringify(topKeys) !==
    JSON.stringify(['freeze_record', 'freeze_record_sha256'])
  ) {
    errors.push(
      'freeze record package keys must be exactly freeze_record and freeze_record_sha256.',
    );
  }
  if (!isLowercaseSha256(packageValue.freeze_record_sha256)) {
    errors.push('freeze_record_sha256 must be lowercase sha256 hex.');
  }
  const record = asObject(packageValue.freeze_record);
  if (!record) {
    errors.push('freeze_record must be an object.');
    return { ok: false, errors };
  }
  if (
    typeof packageValue.freeze_record_sha256 === 'string' &&
    sha256ForwardCanonicalValue(record) !== packageValue.freeze_record_sha256
  ) {
    errors.push('freeze record self-hash does not match its canonical bytes.');
  }

  const runtimeContainer = asObject(record.runtime_configuration);
  const population = asObject(record.governed_population_identity);
  const evaluationRefs = record.approved_historical_evaluation_refs;
  const softwareIdentity = asObject(record.software_and_schema_identity);
  const governedImplementation = asObject(
    softwareIdentity?.governed_protocol_implementation,
  );
  if (!runtimeContainer) {
    errors.push('freeze record runtime_configuration is malformed.');
  }
  if (!population) {
    errors.push('freeze record governed_population_identity is malformed.');
  }
  if (!Array.isArray(evaluationRefs) || evaluationRefs.length !== 1) {
    errors.push('freeze record must contain exactly one approved historical evaluation ref.');
  }

  const runtimeValidation = validateFrozenForwardRidgeConfiguration(
    runtimeContainer?.configuration_package,
  );
  if (!runtimeValidation.ok) {
    errors.push(
      `embedded runtime configuration is invalid: ${runtimeValidation.errors.join('; ')}`,
    );
  }

  if (runtimeValidation.ok && governedImplementation) {
    try {
      const expected = buildForwardBaseConfigurationFreezeRecord({
        runtimeConfiguration: runtimeValidation.data,
        governedImplementation:
          governedImplementation as unknown as ForwardBaseGovernedImplementationIdentity,
      });
      if (canonicalForwardJson(expected) !== canonicalForwardJson(packageValue)) {
        errors.push(
          'freeze record fields do not match the complete immutable governed v1 record.',
        );
      }
    } catch (error) {
      errors.push(
        `freeze record fixed-identity validation failed: ${
          error instanceof Error ? error.message : 'unknown error'
        }.`,
      );
    }
  } else {
    errors.push('freeze record governed implementation identity is malformed.');
  }

  const runtimeBytes = dependencies.runtimeConfigurationBytes;
  const originBytes = dependencies.originPackagesBytes;
  const reportBytes = dependencies.historicalEvaluationBytes;
  if (
    !(runtimeBytes instanceof Uint8Array) ||
    sha256Bytes(runtimeBytes) !==
      FORWARD_BASE_RUNTIME_CONFIGURATION_ARTIFACT_SHA256
  ) {
    errors.push(
      'supplied runtime configuration raw bytes do not match the frozen artifact hash.',
    );
  }
  if (
    !(originBytes instanceof Uint8Array) ||
    sha256Bytes(originBytes) !== FORWARD_BASE_ORIGIN_PACKAGES_ARTIFACT_SHA256
  ) {
    errors.push(
      'supplied origin-package raw bytes do not match the frozen artifact hash.',
    );
  }
  if (
    !(reportBytes instanceof Uint8Array) ||
    sha256Bytes(reportBytes) !==
      FORWARD_BASE_HISTORICAL_EVALUATION_ARTIFACT_SHA256
  ) {
    errors.push(
      'supplied historical evaluation raw bytes do not match the frozen artifact hash.',
    );
  }

  const dependencyRuntimeValue = parseJsonBytes(
    runtimeBytes,
    'runtime configuration',
    errors,
  );
  const dependencyOriginValue = parseJsonBytes(
    originBytes,
    'origin packages',
    errors,
  );
  const dependencyReportValue = parseJsonBytes(
    reportBytes,
    'historical evaluation',
    errors,
  );
  const dependencyRuntime = validateFrozenForwardRidgeConfiguration(
    dependencyRuntimeValue,
  );
  if (!dependencyRuntime.ok) {
    errors.push('supplied runtime configuration dependency is semantically invalid.');
  } else if (
    !runtimeValidation.ok ||
    canonicalForwardJson(dependencyRuntime.data) !==
      canonicalForwardJson(runtimeValidation.data)
  ) {
    errors.push(
      'supplied runtime configuration bytes do not match the embedded package.',
    );
  }
  verifyOriginPackageSemantics(dependencyOriginValue, errors);
  verifyHistoricalEvaluationSemantics(
    dependencyReportValue,
    dependencyRuntime.ok ? dependencyRuntime.data : null,
    errors,
  );

  try {
    const dependencyImplementation =
      buildForwardBaseGovernedImplementationIdentity(
        dependencies.governedImplementation,
      );
    if (
      !governedImplementation ||
      canonicalForwardJson(dependencyImplementation) !==
        canonicalForwardJson(governedImplementation)
    ) {
      errors.push(
        'supplied governed implementation bytes do not match the recorded commit manifest.',
      );
    }
  } catch (error) {
    errors.push(
      `supplied governed implementation dependency is invalid: ${
        error instanceof Error ? error.message : 'unknown error'
      }.`,
    );
  }

  return errors.length > 0
    ? { ok: false, errors }
    : {
        ok: true,
        data: deepFreeze(
          packageValue as unknown as ForwardBaseConfigurationFreezeRecordPackageV1,
        ),
        errors: [],
      };
};
