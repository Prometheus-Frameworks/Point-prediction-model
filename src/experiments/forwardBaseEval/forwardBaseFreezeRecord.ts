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
  type ForwardBaseEvalOriginPackages,
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

/**
 * Exact Forecast commit that produced the historical evaluation evidence and
 * runtime configuration frozen by this record. The record itself is assembled
 * as a follow-up commit, so pinning this parent avoids an impossible
 * self-referential commit hash while preserving the executed code identity.
 */
export const FORWARD_BASE_EVALUATION_IMPLEMENTATION_COMMIT =
  'dc1816d01e9163ec3acaa86105203e4b48c640d3' as const;
export const FORWARD_BASE_RUNTIME_BASE_COMMIT =
  '640c0419170a96775362617cabcf8048c020c901' as const;

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

const buildRecordValue = (input: {
  runtimeConfiguration: FrozenForwardRidgeConfigurationPackageV1;
  originPackagesSha256: string;
  historicalEvaluationSha256: string;
}) => ({
  freeze_record_schema_version: FORWARD_BASE_FREEZE_RECORD_SCHEMA_VERSION,
  freeze_record_id: 'forecast-168-forward-base-configuration-freeze-v1',
  terminal_decision: 'forward_base_model_configuration_frozen',
  authorizing_issue_ref: 'Prometheus-Frameworks/TIBER-Forecast#168',
  runtime_configuration: {
    artifact_path: FORWARD_BASE_RUNTIME_CONFIGURATION_PATH,
    artifact_sha256: sha256ForwardCanonicalValue(input.runtimeConfiguration),
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
    origin_packages_sha256: input.originPackagesSha256,
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
      artifact_sha256: input.historicalEvaluationSha256,
      authorizing_issue_ref: 'Prometheus-Frameworks/TIBER-Forecast#168',
      evaluation_implementation_commit:
        FORWARD_BASE_EVALUATION_IMPLEMENTATION_COMMIT,
      approval_scope:
        'operator_authorized_historical_configuration_freeze_evidence',
    },
  ],
  excluded_feature_families: [...EXCLUDED_FEATURE_FAMILIES],
  software_and_schema_identity: {
    repository: 'Prometheus-Frameworks/TIBER-Forecast',
    evaluation_implementation_commit:
      FORWARD_BASE_EVALUATION_IMPLEMENTATION_COMMIT,
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
  runtimeConfiguration: FrozenForwardRidgeConfigurationPackageV1;
  originPackages: ForwardBaseEvalOriginPackages;
  historicalEvaluation: unknown;
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
  originPackagesSha256: string;
  historicalEvaluationSha256: string;
}): ForwardBaseConfigurationFreezeRecordPackageV1 => {
  const runtimeValidation = validateFrozenForwardRidgeConfiguration(
    input.runtimeConfiguration,
  );
  if (!runtimeValidation.ok) {
    throw new ForwardBaseFreezeRecordError(
      `runtime configuration is invalid: ${runtimeValidation.errors.join('; ')}`,
    );
  }
  for (const [field, value] of [
    ['originPackagesSha256', input.originPackagesSha256],
    ['historicalEvaluationSha256', input.historicalEvaluationSha256],
  ] as const) {
    if (!/^[0-9a-f]{64}$/.test(value)) {
      throw new ForwardBaseFreezeRecordError(`${field} must be lowercase sha256 hex.`);
    }
  }
  const freezeRecord = buildRecordValue({
    runtimeConfiguration: runtimeValidation.data,
    originPackagesSha256: input.originPackagesSha256,
    historicalEvaluationSha256: input.historicalEvaluationSha256,
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

/**
 * Verify the self-hash, the complete fixed record shape, the embedded runtime
 * configuration, and—when dependencies are supplied—the exact external origin
 * and evaluation artifacts. Later consumers can therefore verify the whole
 * freeze identity rather than trusting the runtime configuration hash alone.
 */
export const validateForwardBaseConfigurationFreezeRecord = (
  value: unknown,
  dependencies?: ForwardBaseFreezeRecordDependencies,
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
  if (
    typeof packageValue.freeze_record_sha256 !== 'string' ||
    !/^[0-9a-f]{64}$/.test(packageValue.freeze_record_sha256)
  ) {
    errors.push('freeze_record_sha256 must be lowercase sha256 hex.');
  }
  if (
    typeof packageValue.freeze_record !== 'object' ||
    packageValue.freeze_record === null ||
    Array.isArray(packageValue.freeze_record)
  ) {
    errors.push('freeze_record must be an object.');
    return { ok: false, errors };
  }
  const record = packageValue.freeze_record as Record<string, unknown>;
  if (
    typeof packageValue.freeze_record_sha256 === 'string' &&
    sha256ForwardCanonicalValue(record) !== packageValue.freeze_record_sha256
  ) {
    errors.push('freeze record self-hash does not match its canonical bytes.');
  }

  const runtimeContainer = record.runtime_configuration;
  const population = record.governed_population_identity;
  const evaluationRefs = record.approved_historical_evaluation_refs;
  if (
    typeof runtimeContainer !== 'object' ||
    runtimeContainer === null ||
    Array.isArray(runtimeContainer)
  ) {
    errors.push('freeze record runtime_configuration is malformed.');
  }
  if (
    typeof population !== 'object' ||
    population === null ||
    Array.isArray(population)
  ) {
    errors.push('freeze record governed_population_identity is malformed.');
  }
  if (!Array.isArray(evaluationRefs) || evaluationRefs.length !== 1) {
    errors.push('freeze record must contain exactly one approved historical evaluation ref.');
  }

  const runtimePackage =
    typeof runtimeContainer === 'object' &&
    runtimeContainer !== null &&
    !Array.isArray(runtimeContainer)
      ? (runtimeContainer as Record<string, unknown>).configuration_package
      : null;
  const runtimeValidation = validateFrozenForwardRidgeConfiguration(runtimePackage);
  if (!runtimeValidation.ok) {
    errors.push(
      `embedded runtime configuration is invalid: ${runtimeValidation.errors.join('; ')}`,
    );
  }

  const originPackagesSha256 =
    typeof population === 'object' &&
    population !== null &&
    !Array.isArray(population)
      ? (population as Record<string, unknown>).origin_packages_sha256
      : null;
  const historicalEvaluationSha256 =
    Array.isArray(evaluationRefs) &&
    evaluationRefs.length === 1 &&
    typeof evaluationRefs[0] === 'object' &&
    evaluationRefs[0] !== null
      ? (evaluationRefs[0] as Record<string, unknown>).artifact_sha256
      : null;

  if (
    runtimeValidation.ok &&
    typeof originPackagesSha256 === 'string' &&
    /^[0-9a-f]{64}$/.test(originPackagesSha256) &&
    typeof historicalEvaluationSha256 === 'string' &&
    /^[0-9a-f]{64}$/.test(historicalEvaluationSha256)
  ) {
    const expected = buildForwardBaseConfigurationFreezeRecord({
      runtimeConfiguration: runtimeValidation.data,
      originPackagesSha256,
      historicalEvaluationSha256,
    });
    if (canonicalForwardJson(expected) !== canonicalForwardJson(packageValue)) {
      errors.push(
        'freeze record fields do not match the complete governed v1 record.',
      );
    }
  } else {
    errors.push('freeze record dependency hashes are malformed.');
  }

  if (dependencies) {
    const dependencyRuntime = validateFrozenForwardRidgeConfiguration(
      dependencies.runtimeConfiguration,
    );
    if (!dependencyRuntime.ok) {
      errors.push('supplied runtime configuration dependency is invalid.');
    } else if (
      !runtimeValidation.ok ||
      canonicalForwardJson(dependencyRuntime.data) !==
        canonicalForwardJson(runtimeValidation.data)
    ) {
      errors.push('supplied runtime configuration does not match the embedded package.');
    }
    if (
      typeof originPackagesSha256 === 'string' &&
      sha256ForwardCanonicalValue(dependencies.originPackages) !==
        originPackagesSha256
    ) {
      errors.push('supplied origin packages do not match the frozen artifact hash.');
    }
    if (
      typeof historicalEvaluationSha256 === 'string' &&
      sha256ForwardCanonicalValue(dependencies.historicalEvaluation) !==
        historicalEvaluationSha256
    ) {
      errors.push(
        'supplied historical evaluation does not match the frozen artifact hash.',
      );
    }
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
