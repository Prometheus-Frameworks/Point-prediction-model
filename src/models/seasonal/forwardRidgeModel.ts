import {
  FORWARD_FITTED_MODEL_ARTIFACT_TYPE,
  FORWARD_FITTED_MODEL_ARTIFACT_VERSION,
} from '../../contracts/forwardSeasonalPpr.js';
import {
  canonicalForwardJson,
  canonicalForwardJsonSha256,
} from '../../serialization/canonicalForwardArtifacts.js';
import { multiply, multiplyVector, solveLinearSystem, transpose, type Matrix } from './linearAlgebra.js';

export const FORWARD_RIDGE_CONFIGURATION_SCHEMA_VERSION =
  'seasonal-forward-ridge-configuration-v1' as const;
export const HISTORICAL_FORWARD_TRAINING_ROW_SCHEMA_VERSION =
  'historical-forward-training-row-v1' as const;
export const FUTURE_FORWARD_INFERENCE_ROW_SCHEMA_VERSION =
  'future-forward-inference-row-v1' as const;
export const FITTED_FORWARD_RIDGE_ARTIFACT_VERSION =
  FORWARD_FITTED_MODEL_ARTIFACT_VERSION;
export const FORWARD_FORBIDDEN_TARGET_OR_OUTCOME_FIELDS = [
  'target',
  'training_target',
  'target_value',
  'actual',
  'actual_ppr',
  'actual_outcome',
  'ppr_2025_actual',
  'target_fantasy_points_ppr',
] as const;

export type ForwardMissingnessPolicy =
  | 'reject_row'
  | 'impute_zero_with_indicator'
  | 'impute_training_mean_with_indicator';

export interface ForwardNumericFeatureConfigurationV1 {
  name: string;
  source_input_id: string;
  source_field: string;
  transform_id: string;
  missingness_policy: ForwardMissingnessPolicy;
}

export interface FrozenForwardRidgeConfigurationV1 {
  configuration_schema_version: typeof FORWARD_RIDGE_CONFIGURATION_SCHEMA_VERSION;
  configuration_id: string;
  feature_set_id: string;
  feature_admission_decision_id: string;
  feature_admission_evidence_sha256: string;
  model_id: string;
  model_version: string;
  ordered_numeric_features: ForwardNumericFeatureConfigurationV1[];
  position_levels: string[];
  position_reference_level: string;
  lambda: number;
  clamp: {
    kind: 'minimum';
    minimum: number;
  };
  software_version: string;
}

export interface FrozenForwardRidgeConfigurationPackageV1 {
  configuration_sha256: string;
  configuration: FrozenForwardRidgeConfigurationV1;
}

export interface HistoricalForwardTrainingRowV1 {
  row_schema_version: typeof HISTORICAL_FORWARD_TRAINING_ROW_SCHEMA_VERSION;
  row_kind: 'historical_forward_training';
  historical_row_id: string;
  historical_origin_id: string;
  input_season: number;
  target_season: number;
  configuration_sha256: string;
  position: string;
  source_features: Record<string, number | null>;
  source_missingness: Record<string, boolean>;
  target: number;
}

/**
 * Target-free by construction. Runtime validation also rejects target/actual
 * fields supplied through `unknown`, so compile-time erasure cannot bypass the
 * boundary.
 */
export interface FutureForwardInferenceRowV1 {
  row_schema_version: typeof FUTURE_FORWARD_INFERENCE_ROW_SCHEMA_VERSION;
  row_kind: 'future_forward_inference';
  population_row_id: string;
  run_id: string;
  configuration_sha256: string;
  input_package_sha256: string;
  census_sha256: string;
  input_season: number;
  target_season: number;
  position: string;
  source_features: Record<string, number | null>;
  source_missingness: Record<string, boolean>;
}

export interface ForwardMissingnessTransformV1 {
  feature: string;
  source_input_id: string;
  source_field: string;
  transform_id: string;
  policy: ForwardMissingnessPolicy;
  imputation_value: number | null;
  missing_indicator_feature: string | null;
}

export interface FittedSeasonalForwardRidgeArtifactV1 {
  artifact_type: typeof FORWARD_FITTED_MODEL_ARTIFACT_TYPE;
  artifact_version: typeof FITTED_FORWARD_RIDGE_ARTIFACT_VERSION;
  model_id: string;
  model_version: string;
  configuration_sha256: string;
  configuration_id: string;
  final_fit_target_season: number;
  ordered_numeric_features: string[];
  ordered_expanded_feature_names: string[];
  coefficient_feature_names_ordered: string[];
  intercept: number;
  coefficients: number[];
  means: number[];
  standard_deviations: number[];
  standardization: {
    kind: 'population_zscore';
    zero_variance_threshold: 1e-9;
    zero_variance_replacement: 1;
  };
  categorical_levels: {
    feature: 'position';
    levels_ordered: string[];
    reference_level: string;
    coefficient_levels_ordered: string[];
  };
  lambda: number;
  clamp: {
    kind: 'minimum';
    minimum: number;
  };
  missingness_transforms: ForwardMissingnessTransformV1[];
  training_identity: {
    row_count: number;
    historical_row_ids_ordered: string[];
    historical_origin_ids_ordered: string[];
    input_seasons_ordered: number[];
    target_seasons_ordered: number[];
    training_population_sha256: string;
    training_data_sha256: string;
  };
  schema_versions: {
    configuration: typeof FORWARD_RIDGE_CONFIGURATION_SCHEMA_VERSION;
    historical_training_row: typeof HISTORICAL_FORWARD_TRAINING_ROW_SCHEMA_VERSION;
    future_inference_row: typeof FUTURE_FORWARD_INFERENCE_ROW_SCHEMA_VERSION;
    fitted_model: typeof FITTED_FORWARD_RIDGE_ARTIFACT_VERSION;
  };
  software_versions: {
    forecast_runtime: string;
    numeric_runtime: 'ecmascript-number';
    linear_algebra: 'seasonal-ridge-normal-equations-v1';
  };
}

export interface ForwardRidgeMechanicsContribution {
  feature: string;
  kind: 'numeric' | 'missing_indicator' | 'position';
  source_value: number | null;
  source_was_missing: boolean;
  transformed_value: number;
  standardized_value: number;
  coefficient: number;
  contribution: number;
}

export interface SeasonalForwardPredictionV1 {
  point_forecast: number;
  raw_prediction: number;
  clamped: boolean;
  intercept: number;
  contributions: ForwardRidgeMechanicsContribution[];
}

export interface ForwardInferencePinsV1 {
  run_id: string;
  configuration_sha256: string;
  input_package_sha256: string;
  census_sha256: string;
  target_season: number;
}

export type ForwardValidationResult<T> =
  | { ok: true; data: T; errors: [] }
  | { ok: false; errors: string[] };

const ok = <T>(data: T): ForwardValidationResult<T> => ({ ok: true, data, errors: [] });
const fail = <T = never>(errors: string[]): ForwardValidationResult<T> => ({ ok: false, errors });

const SHA256 = /^[0-9a-f]{64}$/;
const MISSINGNESS_POLICIES: readonly ForwardMissingnessPolicy[] = [
  'reject_row',
  'impute_zero_with_indicator',
  'impute_training_mean_with_indicator',
];

const isRecord = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  if (Object.getOwnPropertySymbols(value).length > 0) return false;
  return Reflect.ownKeys(value).every((key) => {
    if (typeof key !== 'string') return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor !== undefined && descriptor.enumerable && 'value' in descriptor;
  });
};
const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;
const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const isInteger = (value: unknown): value is number =>
  isFiniteNumber(value) && Number.isInteger(value);

export const sha256ForwardCanonicalValue = (value: unknown): string =>
  canonicalForwardJsonSha256(value);

export const serializeFittedForwardRidgeArtifact = (
  artifact: FittedSeasonalForwardRidgeArtifactV1,
): string => `${canonicalForwardJson(artifact)}\n`;

const exactKeys = (
  record: Record<string, unknown>,
  allowed: readonly string[],
  where: string,
  errors: string[],
): void => {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(record)) {
    if (!allowedSet.has(key)) errors.push(`${where} contains unsupported field ${JSON.stringify(key)}.`);
  }
  for (const key of allowed) {
    if (!Object.prototype.hasOwnProperty.call(record, key)) errors.push(`${where}.${key} is required.`);
  }
};

const deepFreezePlainData = <T>(value: T): T => {
  if (Array.isArray(value)) {
    for (const entry of value) deepFreezePlainData(entry);
    return Object.freeze(value);
  }
  if (isRecord(value)) {
    for (const entry of Object.values(value)) deepFreezePlainData(entry);
    return Object.freeze(value);
  }
  return value;
};

const unique = <T>(values: readonly T[]): T[] => [...new Set(values)];
const compareStrings = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;
const uniqueSortedStrings = (values: readonly string[]): string[] =>
  unique(values).sort(compareStrings);
const uniqueSortedNumbers = (values: readonly number[]): number[] =>
  unique(values).sort((left, right) => left - right);

export const validateFrozenForwardRidgeConfiguration = (
  value: unknown,
): ForwardValidationResult<FrozenForwardRidgeConfigurationPackageV1> => {
  const errors: string[] = [];
  let isolatedValue: unknown;
  try {
    isolatedValue = JSON.parse(canonicalForwardJson(value)) as unknown;
  } catch (error) {
    return fail([
      `frozen configuration package canonicalization failed: ${
        error instanceof Error ? error.message : 'unknown serialization error'
      }.`,
    ]);
  }
  if (!isRecord(isolatedValue)) {
    return fail(['frozen configuration package must be a plain-data object.']);
  }
  const packageValue = isolatedValue;
  exactKeys(packageValue, ['configuration_sha256', 'configuration'], 'configuration_package', errors);

  if (
    typeof packageValue.configuration_sha256 !== 'string' ||
    !SHA256.test(packageValue.configuration_sha256)
  ) {
    errors.push('configuration_package.configuration_sha256 must be lowercase sha256 hex.');
  }
  if (!isRecord(packageValue.configuration)) {
    errors.push('configuration_package.configuration must be an object.');
    return fail(errors);
  }

  const configuration = packageValue.configuration;
  exactKeys(
    configuration,
    [
      'configuration_schema_version',
      'configuration_id',
      'feature_set_id',
      'feature_admission_decision_id',
      'feature_admission_evidence_sha256',
      'model_id',
      'model_version',
      'ordered_numeric_features',
      'position_levels',
      'position_reference_level',
      'lambda',
      'clamp',
      'software_version',
    ],
    'configuration',
    errors,
  );

  if (configuration.configuration_schema_version !== FORWARD_RIDGE_CONFIGURATION_SCHEMA_VERSION) {
    errors.push(`configuration.configuration_schema_version must be ${FORWARD_RIDGE_CONFIGURATION_SCHEMA_VERSION}.`);
  }
  for (const field of [
    'configuration_id',
    'feature_set_id',
    'feature_admission_decision_id',
    'model_id',
    'model_version',
    'software_version',
  ]) {
    if (!isNonEmptyString(configuration[field])) errors.push(`configuration.${field} must be a non-empty string.`);
  }
  if (
    typeof configuration.feature_admission_evidence_sha256 !== 'string' ||
    !SHA256.test(configuration.feature_admission_evidence_sha256)
  ) {
    errors.push('configuration.feature_admission_evidence_sha256 must be lowercase sha256 hex.');
  }

  if (!Array.isArray(configuration.ordered_numeric_features) || configuration.ordered_numeric_features.length === 0) {
    errors.push('configuration.ordered_numeric_features must be a non-empty array.');
  } else {
    const names: string[] = [];
    configuration.ordered_numeric_features.forEach((feature, index) => {
      if (!isRecord(feature)) {
        errors.push(`configuration.ordered_numeric_features[${index}] must be an object.`);
        return;
      }
      exactKeys(
        feature,
        ['name', 'source_input_id', 'source_field', 'transform_id', 'missingness_policy'],
        `configuration.ordered_numeric_features[${index}]`,
        errors,
      );
      if (!isNonEmptyString(feature.name)) {
        errors.push(`configuration.ordered_numeric_features[${index}].name must be non-empty.`);
      } else {
        names.push(feature.name);
        if (!/^[a-z][a-z0-9_]*$/.test(feature.name)) {
          errors.push(
            `configuration.ordered_numeric_features[${index}].name must use lowercase snake_case.`,
          );
        }
        if (
          (FORWARD_FORBIDDEN_TARGET_OR_OUTCOME_FIELDS as readonly string[]).includes(
            feature.name,
          )
        ) {
          errors.push(
            `configuration.ordered_numeric_features[${index}].name may not admit a target/actual outcome field.`,
          );
        }
      }
      for (const field of ['source_input_id', 'source_field', 'transform_id']) {
        if (!isNonEmptyString(feature[field])) {
          errors.push(
            `configuration.ordered_numeric_features[${index}].${field} must be non-empty.`,
          );
        }
      }
      if (
        isNonEmptyString(feature.source_field) &&
        (FORWARD_FORBIDDEN_TARGET_OR_OUTCOME_FIELDS as readonly string[]).includes(
          feature.source_field,
        )
      ) {
        errors.push(
          `configuration.ordered_numeric_features[${index}].source_field may not bind a target/actual outcome field.`,
        );
      }
      if (!MISSINGNESS_POLICIES.includes(feature.missingness_policy as ForwardMissingnessPolicy)) {
        errors.push(`configuration.ordered_numeric_features[${index}].missingness_policy is invalid.`);
      }
    });
    if (new Set(names).size !== names.length) errors.push('configuration numeric feature names must be unique.');
    const expandedNames = configuration.ordered_numeric_features.flatMap((feature) => {
      if (!isRecord(feature) || !isNonEmptyString(feature.name)) return [];
      return feature.missingness_policy === 'reject_row'
        ? [feature.name]
        : [feature.name, `${feature.name}__missing`];
    });
    if (new Set(expandedNames).size !== expandedNames.length) {
      errors.push('configuration numeric and generated missing-indicator feature names must be unique.');
    }
  }

  if (
    !Array.isArray(configuration.position_levels) ||
    configuration.position_levels.length < 2 ||
    configuration.position_levels.some((level) => !isNonEmptyString(level))
  ) {
    errors.push('configuration.position_levels must contain at least two non-empty strings.');
  } else if (new Set(configuration.position_levels).size !== configuration.position_levels.length) {
    errors.push('configuration.position_levels must be unique.');
  }
  if (
    !isNonEmptyString(configuration.position_reference_level) ||
    !Array.isArray(configuration.position_levels) ||
    !configuration.position_levels.includes(configuration.position_reference_level)
  ) {
    errors.push('configuration.position_reference_level must be one of position_levels.');
  }

  if (!isFiniteNumber(configuration.lambda) || configuration.lambda < 0) {
    errors.push('configuration.lambda must be finite and non-negative.');
  }
  if (!isRecord(configuration.clamp)) {
    errors.push('configuration.clamp must be an object.');
  } else {
    exactKeys(configuration.clamp, ['kind', 'minimum'], 'configuration.clamp', errors);
    if (configuration.clamp.kind !== 'minimum') errors.push('configuration.clamp.kind must be minimum.');
    if (!isFiniteNumber(configuration.clamp.minimum)) errors.push('configuration.clamp.minimum must be finite.');
  }

  if (errors.length === 0) {
    try {
      const computed = sha256ForwardCanonicalValue(configuration);
      if (computed !== packageValue.configuration_sha256) {
        errors.push(
          `configuration sha256 mismatch: declared ${String(
            packageValue.configuration_sha256,
          )}, recomputed ${computed}.`,
        );
      }
    } catch (error) {
      errors.push(
        `configuration canonicalization failed: ${
          error instanceof Error ? error.message : 'unknown serialization error'
        }.`,
      );
    }
  }

  return errors.length > 0
    ? fail(errors)
    : ok(
        deepFreezePlainData(
          packageValue as unknown as FrozenForwardRidgeConfigurationPackageV1,
        ),
      );
};

const validateFeaturePayload = (
  row: Record<string, unknown>,
  featureNames: readonly string[],
  where: string,
  errors: string[],
): void => {
  if (!isRecord(row.source_features)) {
    errors.push(`${where}.source_features must be an object.`);
    return;
  }
  if (!isRecord(row.source_missingness)) {
    errors.push(`${where}.source_missingness must be an object.`);
    return;
  }

  const expected = [...featureNames].sort();
  const featureKeys = Object.keys(row.source_features).sort();
  const missingKeys = Object.keys(row.source_missingness).sort();
  if (JSON.stringify(featureKeys) !== JSON.stringify(expected)) {
    errors.push(`${where}.source_features keys must exactly match the frozen ordered numeric features.`);
  }
  if (JSON.stringify(missingKeys) !== JSON.stringify(expected)) {
    errors.push(`${where}.source_missingness keys must exactly match the frozen ordered numeric features.`);
  }

  for (const feature of featureNames) {
    const sourceValue = row.source_features[feature];
    const missing = row.source_missingness[feature];
    if (sourceValue !== null && !isFiniteNumber(sourceValue)) {
      errors.push(`${where}.source_features.${feature} must be finite or null.`);
    }
    if (typeof missing !== 'boolean') {
      errors.push(`${where}.source_missingness.${feature} must be boolean.`);
    } else if (missing !== (sourceValue === null)) {
      errors.push(`${where}.${feature} source value and source missingness disagree.`);
    }
  }
};

const HISTORICAL_KEYS = [
  'row_schema_version',
  'row_kind',
  'historical_row_id',
  'historical_origin_id',
  'input_season',
  'target_season',
  'configuration_sha256',
  'position',
  'source_features',
  'source_missingness',
  'target',
] as const;

export const validateHistoricalTrainingRows = (
  value: unknown,
  options: {
    frozenConfiguration: unknown;
    finalFitTargetSeason: number;
  },
): ForwardValidationResult<HistoricalForwardTrainingRowV1[]> => {
  const configResult = validateFrozenForwardRidgeConfiguration(options.frozenConfiguration);
  const errors = configResult.ok ? [] : [...configResult.errors];
  if (!isInteger(options.finalFitTargetSeason)) errors.push('finalFitTargetSeason must be an integer.');
  if (!Array.isArray(value) || value.length === 0) {
    errors.push('historical training rows must be a non-empty array.');
    return fail(errors);
  }
  if (!configResult.ok) return fail(errors);

  const config = configResult.data.configuration;
  const featureNames = config.ordered_numeric_features.map((feature) => feature.name);
  const seenIds = new Set<string>();

  value.forEach((candidate, index) => {
    const where = `historical_training_rows[${index}]`;
    if (!isRecord(candidate)) {
      errors.push(`${where} must be an object.`);
      return;
    }
    exactKeys(candidate, HISTORICAL_KEYS, where, errors);
    if (candidate.row_schema_version !== HISTORICAL_FORWARD_TRAINING_ROW_SCHEMA_VERSION) {
      errors.push(`${where}.row_schema_version is invalid.`);
    }
    if (candidate.row_kind !== 'historical_forward_training') errors.push(`${where}.row_kind is invalid.`);
    if (!isNonEmptyString(candidate.historical_row_id)) {
      errors.push(`${where}.historical_row_id must be non-empty.`);
    } else if (seenIds.has(candidate.historical_row_id)) {
      errors.push(`${where}.historical_row_id is duplicated.`);
    } else {
      seenIds.add(candidate.historical_row_id);
    }
    if (!isNonEmptyString(candidate.historical_origin_id)) {
      errors.push(`${where}.historical_origin_id must be non-empty.`);
    }
    if (!isInteger(candidate.input_season) || !isInteger(candidate.target_season)) {
      errors.push(`${where} input_season and target_season must be integers.`);
    } else {
      if (candidate.input_season >= candidate.target_season) {
        errors.push(`${where}.input_season must be before its historical target_season.`);
      }
      if (candidate.target_season >= options.finalFitTargetSeason) {
        errors.push(`${where}.target_season must be before the final-fit target season.`);
      }
    }
    if (candidate.configuration_sha256 !== configResult.data.configuration_sha256) {
      errors.push(`${where}.configuration_sha256 does not match the frozen configuration.`);
    }
    if (!config.position_levels.includes(candidate.position as string)) {
      errors.push(`${where}.position is not a frozen categorical level.`);
    }
    if (!isFiniteNumber(candidate.target)) {
      errors.push(`${where}.target must be a finite, non-null number.`);
    }
    validateFeaturePayload(candidate, featureNames, where, errors);
  });

  if (errors.length > 0) return fail(errors);
  return ok(
    [...(value as HistoricalForwardTrainingRowV1[])].sort((left, right) =>
      compareStrings(left.historical_row_id, right.historical_row_id),
    ),
  );
};

const FUTURE_KEYS = [
  'row_schema_version',
  'row_kind',
  'population_row_id',
  'run_id',
  'configuration_sha256',
  'input_package_sha256',
  'census_sha256',
  'input_season',
  'target_season',
  'position',
  'source_features',
  'source_missingness',
] as const;

interface InferenceValidationSpec {
  configurationSha256: string;
  featureNames: string[];
  positionLevels: string[];
  expectedPins: ForwardInferencePinsV1;
}

const validateFutureRowsAgainstSpec = (
  value: unknown,
  spec: InferenceValidationSpec,
): ForwardValidationResult<FutureForwardInferenceRowV1[]> => {
  const errors: string[] = [];
  if (!Array.isArray(value) || value.length === 0) {
    return fail(['future inference rows must be a non-empty array.']);
  }
  const seen = new Set<string>();

  value.forEach((candidate, index) => {
    const where = `future_inference_rows[${index}]`;
    if (!isRecord(candidate)) {
      errors.push(`${where} must be an object.`);
      return;
    }
    for (const field of FORWARD_FORBIDDEN_TARGET_OR_OUTCOME_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(candidate, field)) {
        errors.push(`${where} contains forbidden training target/actual field ${field}.`);
      }
    }
    exactKeys(candidate, FUTURE_KEYS, where, errors);
    if (candidate.row_schema_version !== FUTURE_FORWARD_INFERENCE_ROW_SCHEMA_VERSION) {
      errors.push(`${where}.row_schema_version is invalid.`);
    }
    if (candidate.row_kind !== 'future_forward_inference') errors.push(`${where}.row_kind is invalid.`);
    if (!isNonEmptyString(candidate.population_row_id)) {
      errors.push(`${where}.population_row_id must be non-empty.`);
    } else if (seen.has(candidate.population_row_id)) {
      errors.push(`${where}.population_row_id is duplicated.`);
    } else {
      seen.add(candidate.population_row_id);
    }
    if (!isNonEmptyString(candidate.run_id)) errors.push(`${where}.run_id must be non-empty.`);
    for (const field of ['configuration_sha256', 'input_package_sha256', 'census_sha256']) {
      if (typeof candidate[field] !== 'string' || !SHA256.test(candidate[field])) {
        errors.push(`${where}.${field} must be lowercase sha256 hex.`);
      }
    }
    if (candidate.configuration_sha256 !== spec.configurationSha256) {
      errors.push(`${where}.configuration_sha256 does not match the fitted configuration.`);
    }
    if (!isInteger(candidate.input_season) || !isInteger(candidate.target_season)) {
      errors.push(`${where} input_season and target_season must be integers.`);
    } else if (candidate.input_season >= candidate.target_season) {
      errors.push(`${where}.input_season must be before target_season.`);
    }
    if (!spec.positionLevels.includes(candidate.position as string)) {
      errors.push(`${where}.position is not a fitted categorical level.`);
    }
    validateFeaturePayload(candidate, spec.featureNames, where, errors);

    const pins = spec.expectedPins;
    for (const field of ['run_id', 'configuration_sha256', 'input_package_sha256', 'census_sha256'] as const) {
      if (candidate[field] !== pins[field]) errors.push(`${where}.${field} does not match the expected pin.`);
    }
    if (candidate.target_season !== pins.target_season) {
      errors.push(`${where}.target_season does not match the expected pin.`);
    }
  });

  return errors.length > 0 ? fail(errors) : ok(value as FutureForwardInferenceRowV1[]);
};

export const validateFutureInferenceRows = (
  value: unknown,
  options: {
    frozenConfiguration: unknown;
    expectedPins: ForwardInferencePinsV1;
  },
): ForwardValidationResult<FutureForwardInferenceRowV1[]> => {
  const optionErrors: string[] = [];
  if (!isRecord(options)) return fail(['future inference validation options must be a plain-data object.']);
  exactKeys(options, ['frozenConfiguration', 'expectedPins'], 'future_inference_options', optionErrors);
  if (!isRecord(options.expectedPins)) {
    optionErrors.push('future_inference_options.expectedPins must be a plain-data object.');
  } else {
    exactKeys(
      options.expectedPins,
      ['run_id', 'configuration_sha256', 'input_package_sha256', 'census_sha256', 'target_season'],
      'future_inference_options.expectedPins',
      optionErrors,
    );
    if (!isNonEmptyString(options.expectedPins.run_id)) {
      optionErrors.push('future_inference_options.expectedPins.run_id must be non-empty.');
    }
    for (const field of ['configuration_sha256', 'input_package_sha256', 'census_sha256'] as const) {
      if (
        typeof options.expectedPins[field] !== 'string' ||
        !SHA256.test(options.expectedPins[field])
      ) {
        optionErrors.push(
          `future_inference_options.expectedPins.${field} must be lowercase sha256 hex.`,
        );
      }
    }
    if (!isInteger(options.expectedPins.target_season)) {
      optionErrors.push('future_inference_options.expectedPins.target_season must be an integer.');
    }
  }
  if (optionErrors.length > 0) return fail(optionErrors);
  const configResult = validateFrozenForwardRidgeConfiguration(options.frozenConfiguration);
  if (!configResult.ok) return fail(configResult.errors);
  return validateFutureRowsAgainstSpec(value, {
    configurationSha256: configResult.data.configuration_sha256,
    featureNames: configResult.data.configuration.ordered_numeric_features.map((feature) => feature.name),
    positionLevels: configResult.data.configuration.position_levels,
    expectedPins: options.expectedPins,
  });
};

const buildMissingnessTransforms = (
  rows: readonly HistoricalForwardTrainingRowV1[],
  configuration: FrozenForwardRidgeConfigurationV1,
): ForwardValidationResult<ForwardMissingnessTransformV1[]> => {
  const errors: string[] = [];
  const transforms = configuration.ordered_numeric_features.map((feature) => {
    const observed = rows
      .map((row) => row.source_features[feature.name])
      .filter((value): value is number => value !== null);
    let imputationValue: number | null = null;
    if (feature.missingness_policy === 'impute_zero_with_indicator') imputationValue = 0;
    if (feature.missingness_policy === 'impute_training_mean_with_indicator') {
      if (observed.length === 0) {
        errors.push(`${feature.name} cannot fit training-mean imputation with zero observed values.`);
      } else {
        imputationValue = observed.reduce((sum, value) => sum + value, 0) / observed.length;
      }
    }
    if (
      feature.missingness_policy === 'reject_row' &&
      rows.some((row) => row.source_missingness[feature.name])
    ) {
      errors.push(`${feature.name} is missing on a row under reject_row policy.`);
    }
    return {
      feature: feature.name,
      source_input_id: feature.source_input_id,
      source_field: feature.source_field,
      transform_id: feature.transform_id,
      policy: feature.missingness_policy,
      imputation_value: imputationValue,
      missing_indicator_feature:
        feature.missingness_policy === 'reject_row' ? null : `${feature.name}__missing`,
    };
  });
  return errors.length > 0 ? fail(errors) : ok(transforms);
};

const expandedFeatureNames = (transforms: readonly ForwardMissingnessTransformV1[]): string[] =>
  transforms.flatMap((transform) =>
    transform.missing_indicator_feature
      ? [transform.feature, transform.missing_indicator_feature]
      : [transform.feature],
  );

const transformFeatureVector = (
  row: Pick<HistoricalForwardTrainingRowV1, 'source_features' | 'source_missingness'>,
  transforms: readonly ForwardMissingnessTransformV1[],
): ForwardValidationResult<number[]> => {
  const errors: string[] = [];
  const vector: number[] = [];
  for (const transform of transforms) {
    const source = row.source_features[transform.feature];
    const missing = row.source_missingness[transform.feature];
    if (missing) {
      if (transform.policy === 'reject_row' || transform.imputation_value === null) {
        errors.push(`${transform.feature} is missing and cannot be transformed.`);
        continue;
      }
      vector.push(transform.imputation_value, 1);
    } else {
      if (!isFiniteNumber(source)) {
        errors.push(`${transform.feature} is marked observed but is not finite.`);
        continue;
      }
      vector.push(source);
      if (transform.missing_indicator_feature) vector.push(0);
    }
  }
  return errors.length > 0 ? fail(errors) : ok(vector);
};

export const fitSeasonalForwardModel = (input: {
  rows: unknown;
  frozenConfiguration: unknown;
  finalFitTargetSeason: number;
}): ForwardValidationResult<FittedSeasonalForwardRidgeArtifactV1> => {
  const configResult = validateFrozenForwardRidgeConfiguration(input.frozenConfiguration);
  if (!configResult.ok) return fail(configResult.errors);
  const rowResult = validateHistoricalTrainingRows(input.rows, {
    frozenConfiguration: configResult.data,
    finalFitTargetSeason: input.finalFitTargetSeason,
  });
  if (!rowResult.ok) return fail(rowResult.errors);

  const rows = rowResult.data;
  const configuration = configResult.data.configuration;
  const transformResult = buildMissingnessTransforms(rows, configuration);
  if (!transformResult.ok) return fail(transformResult.errors);
  const transforms = transformResult.data;

  const transformedRows: number[][] = [];
  for (const row of rows) {
    const transformed = transformFeatureVector(row, transforms);
    if (!transformed.ok) return fail(transformed.errors);
    transformedRows.push(transformed.data);
  }
  const featureCount = transformedRows[0].length;

  // This is the same population-zscore + normal-equations ridge math used by
  // seasonalPprModel.ts. Row sorting happens before these loops so identical
  // packages are deterministic even if their input array order differs.
  const means = new Array<number>(featureCount).fill(0);
  for (const vector of transformedRows) {
    for (let index = 0; index < featureCount; index += 1) means[index] += vector[index];
  }
  for (let index = 0; index < featureCount; index += 1) means[index] /= transformedRows.length;

  const standardDeviations = new Array<number>(featureCount).fill(0);
  for (const vector of transformedRows) {
    for (let index = 0; index < featureCount; index += 1) {
      standardDeviations[index] += (vector[index] - means[index]) ** 2;
    }
  }
  for (let index = 0; index < featureCount; index += 1) {
    standardDeviations[index] = Math.sqrt(standardDeviations[index] / transformedRows.length);
    if (standardDeviations[index] < 1e-9) standardDeviations[index] = 1;
  }

  const standardized = transformedRows.map((vector) =>
    vector.map((value, index) => (value - means[index]) / standardDeviations[index]),
  );
  const coefficientLevels = configuration.position_levels.filter(
    (level) => level !== configuration.position_reference_level,
  );
  const designMatrix: Matrix = rows.map((row, rowIndex) => [
    1,
    ...standardized[rowIndex],
    ...coefficientLevels.map((level) => (row.position === level ? 1 : 0)),
  ]);
  const targets = rows.map((row) => row.target);
  const xt = transpose(designMatrix);
  const xtx = multiply(xt, designMatrix);
  for (let index = 1; index < xtx.length; index += 1) xtx[index][index] += configuration.lambda;
  let fitted: number[];
  try {
    fitted = solveLinearSystem(xtx, multiplyVector(xt, targets));
  } catch (error) {
    return fail([
      `ridge fit failed closed: ${error instanceof Error ? error.message : 'unknown linear-algebra error'}`,
    ]);
  }
  if (fitted.some((value) => !Number.isFinite(value))) {
    return fail(['ridge fit produced a non-finite coefficient.']);
  }

  const orderedExpanded = expandedFeatureNames(transforms);
  const coefficientNames = [
    ...orderedExpanded,
    ...coefficientLevels.map((level) => `position=${level}`),
  ];
  const populationIdentity = rows.map((row) => ({
    historical_row_id: row.historical_row_id,
    historical_origin_id: row.historical_origin_id,
    input_season: row.input_season,
    target_season: row.target_season,
  }));

  return ok({
    artifact_type: FORWARD_FITTED_MODEL_ARTIFACT_TYPE,
    artifact_version: FITTED_FORWARD_RIDGE_ARTIFACT_VERSION,
    model_id: configuration.model_id,
    model_version: configuration.model_version,
    configuration_sha256: configResult.data.configuration_sha256,
    configuration_id: configuration.configuration_id,
    final_fit_target_season: input.finalFitTargetSeason,
    ordered_numeric_features: configuration.ordered_numeric_features.map((feature) => feature.name),
    ordered_expanded_feature_names: orderedExpanded,
    coefficient_feature_names_ordered: coefficientNames,
    intercept: fitted[0],
    coefficients: fitted.slice(1),
    means,
    standard_deviations: standardDeviations,
    standardization: {
      kind: 'population_zscore',
      zero_variance_threshold: 1e-9,
      zero_variance_replacement: 1,
    },
    categorical_levels: {
      feature: 'position',
      levels_ordered: [...configuration.position_levels],
      reference_level: configuration.position_reference_level,
      coefficient_levels_ordered: coefficientLevels,
    },
    lambda: configuration.lambda,
    clamp: { ...configuration.clamp },
    missingness_transforms: transforms,
    training_identity: {
      row_count: rows.length,
      historical_row_ids_ordered: rows.map((row) => row.historical_row_id),
      historical_origin_ids_ordered: uniqueSortedStrings(rows.map((row) => row.historical_origin_id)),
      input_seasons_ordered: uniqueSortedNumbers(rows.map((row) => row.input_season)),
      target_seasons_ordered: uniqueSortedNumbers(rows.map((row) => row.target_season)),
      training_population_sha256: sha256ForwardCanonicalValue(populationIdentity),
      training_data_sha256: sha256ForwardCanonicalValue(rows),
    },
    schema_versions: {
      configuration: FORWARD_RIDGE_CONFIGURATION_SCHEMA_VERSION,
      historical_training_row: HISTORICAL_FORWARD_TRAINING_ROW_SCHEMA_VERSION,
      future_inference_row: FUTURE_FORWARD_INFERENCE_ROW_SCHEMA_VERSION,
      fitted_model: FITTED_FORWARD_RIDGE_ARTIFACT_VERSION,
    },
    software_versions: {
      forecast_runtime: configuration.software_version,
      numeric_runtime: 'ecmascript-number',
      linear_algebra: 'seasonal-ridge-normal-equations-v1',
    },
  });
};

export const validateFittedSeasonalForwardRidgeArtifact = (
  value: unknown,
): ForwardValidationResult<FittedSeasonalForwardRidgeArtifactV1> => {
  const errors: string[] = [];
  if (!isRecord(value)) return fail(['fitted model artifact must be a plain-data object.']);
  exactKeys(
    value,
    [
      'artifact_type',
      'artifact_version',
      'model_id',
      'model_version',
      'configuration_sha256',
      'configuration_id',
      'final_fit_target_season',
      'ordered_numeric_features',
      'ordered_expanded_feature_names',
      'coefficient_feature_names_ordered',
      'intercept',
      'coefficients',
      'means',
      'standard_deviations',
      'standardization',
      'categorical_levels',
      'lambda',
      'clamp',
      'missingness_transforms',
      'training_identity',
      'schema_versions',
      'software_versions',
    ],
    'fitted_artifact',
    errors,
  );
  if (value.artifact_type !== FORWARD_FITTED_MODEL_ARTIFACT_TYPE) {
    errors.push('fitted artifact_type is invalid.');
  }
  if (value.artifact_version !== FITTED_FORWARD_RIDGE_ARTIFACT_VERSION) {
    errors.push('fitted artifact_version is invalid.');
  }
  if (!isNonEmptyString(value.model_id) || !isNonEmptyString(value.model_version)) {
    errors.push('fitted model identity is incomplete.');
  }
  if (!isNonEmptyString(value.configuration_id)) {
    errors.push('fitted configuration_id must be a non-empty string.');
  }
  if (typeof value.configuration_sha256 !== 'string' || !SHA256.test(value.configuration_sha256)) {
    errors.push('fitted configuration_sha256 is invalid.');
  }
  const finalFitTargetSeason =
    isInteger(value.final_fit_target_season) && value.final_fit_target_season > 0
      ? value.final_fit_target_season
      : null;
  if (finalFitTargetSeason === null) {
    errors.push('fitted final_fit_target_season must be a positive integer.');
  }

  const readStringArray = (
    field: 'ordered_numeric_features' | 'ordered_expanded_feature_names' | 'coefficient_feature_names_ordered',
  ): string[] | null => {
    const candidate = value[field];
    if (
      !Array.isArray(candidate) ||
      candidate.length === 0 ||
      candidate.some((entry) => !isNonEmptyString(entry))
    ) {
      errors.push(`fitted ${field} must be a non-empty array of non-empty strings.`);
      return null;
    }
    const result = candidate as string[];
    if (new Set(result).size !== result.length) {
      errors.push(`fitted ${field} must contain unique strings.`);
    }
    return result;
  };
  const orderedNumericFeatures = readStringArray('ordered_numeric_features');
  const orderedExpandedFeatureNames = readStringArray('ordered_expanded_feature_names');
  const coefficientFeatureNames = readStringArray('coefficient_feature_names_ordered');
  if (orderedNumericFeatures) {
    orderedNumericFeatures.forEach((feature, index) => {
      if (!/^[a-z][a-z0-9_]*$/.test(feature)) {
        errors.push(`fitted ordered_numeric_features[${index}] must use lowercase snake_case.`);
      }
      if (
        (FORWARD_FORBIDDEN_TARGET_OR_OUTCOME_FIELDS as readonly string[]).includes(feature)
      ) {
        errors.push(
          `fitted ordered_numeric_features[${index}] may not admit a target/actual outcome field.`,
        );
      }
    });
  }

  if (!isFiniteNumber(value.intercept)) errors.push('fitted intercept must be finite.');
  const readNumberArray = (
    field: 'coefficients' | 'means' | 'standard_deviations',
  ): number[] | null => {
    const candidate = value[field];
    if (
      !Array.isArray(candidate) ||
      candidate.length === 0 ||
      candidate.some((entry) => !isFiniteNumber(entry))
    ) {
      errors.push(`fitted ${field} must be a non-empty array of finite numbers.`);
      return null;
    }
    return candidate as number[];
  };
  const coefficients = readNumberArray('coefficients');
  const means = readNumberArray('means');
  const standardDeviations = readNumberArray('standard_deviations');
  if (coefficients && coefficientFeatureNames && coefficients.length !== coefficientFeatureNames.length) {
    errors.push('fitted coefficients do not align with coefficient feature names.');
  }
  if (means && orderedExpandedFeatureNames && means.length !== orderedExpandedFeatureNames.length) {
    errors.push('fitted means do not align with expanded features.');
  }
  if (
    standardDeviations &&
    orderedExpandedFeatureNames &&
    standardDeviations.length !== orderedExpandedFeatureNames.length
  ) {
    errors.push('fitted standard deviations do not align with expanded features.');
  }
  if (standardDeviations?.some((entry) => entry <= 0)) {
    errors.push('fitted standard deviations must be positive.');
  }

  if (!isRecord(value.standardization)) {
    errors.push('fitted standardization must be a plain-data object.');
  } else {
    exactKeys(
      value.standardization,
      ['kind', 'zero_variance_threshold', 'zero_variance_replacement'],
      'fitted_artifact.standardization',
      errors,
    );
    if (value.standardization.kind !== 'population_zscore') {
      errors.push('fitted standardization.kind must be population_zscore.');
    }
    if (value.standardization.zero_variance_threshold !== 1e-9) {
      errors.push('fitted standardization.zero_variance_threshold must be exactly 1e-9.');
    }
    if (value.standardization.zero_variance_replacement !== 1) {
      errors.push('fitted standardization.zero_variance_replacement must be exactly 1.');
    }
  }

  if (!isFiniteNumber(value.lambda) || value.lambda < 0) errors.push('fitted lambda is invalid.');
  if (!isRecord(value.clamp)) {
    errors.push('fitted clamp must be a plain-data object.');
  } else {
    exactKeys(value.clamp, ['kind', 'minimum'], 'fitted_artifact.clamp', errors);
    if (value.clamp.kind !== 'minimum') errors.push('fitted clamp.kind must be minimum.');
    if (!isFiniteNumber(value.clamp.minimum)) errors.push('fitted clamp.minimum must be finite.');
  }

  let expectedCoefficientLevels: string[] | null = null;
  if (!isRecord(value.categorical_levels)) {
    errors.push('fitted categorical_levels must be a plain-data object.');
  } else {
    const categorical = value.categorical_levels;
    exactKeys(
      categorical,
      ['feature', 'levels_ordered', 'reference_level', 'coefficient_levels_ordered'],
      'fitted_artifact.categorical_levels',
      errors,
    );
    if (categorical.feature !== 'position') {
      errors.push('fitted categorical_levels.feature must be position.');
    }
    const levels =
      Array.isArray(categorical.levels_ordered) &&
      categorical.levels_ordered.length >= 2 &&
      categorical.levels_ordered.every((entry) => isNonEmptyString(entry))
        ? (categorical.levels_ordered as string[])
        : null;
    if (!levels) {
      errors.push('fitted categorical levels_ordered must contain at least two non-empty strings.');
    } else if (new Set(levels).size !== levels.length) {
      errors.push('fitted categorical levels_ordered must be unique.');
    }
    const referenceLevel = isNonEmptyString(categorical.reference_level)
      ? categorical.reference_level
      : null;
    if (!referenceLevel || !levels?.includes(referenceLevel)) {
      errors.push('fitted categorical reference_level must occur in levels_ordered.');
    }
    const coefficientLevels =
      Array.isArray(categorical.coefficient_levels_ordered) &&
      categorical.coefficient_levels_ordered.every((entry) => isNonEmptyString(entry))
        ? (categorical.coefficient_levels_ordered as string[])
        : null;
    if (!coefficientLevels) {
      errors.push('fitted categorical coefficient_levels_ordered must be an array of non-empty strings.');
    } else {
      if (new Set(coefficientLevels).size !== coefficientLevels.length) {
        errors.push('fitted categorical coefficient_levels_ordered must be unique.');
      }
      if (referenceLevel && coefficientLevels.includes(referenceLevel)) {
        errors.push('fitted categorical reference_level must not have a coefficient.');
      }
    }
    if (levels && referenceLevel && levels.includes(referenceLevel)) {
      expectedCoefficientLevels = levels.filter((level) => level !== referenceLevel);
      if (
        !coefficientLevels ||
        JSON.stringify(coefficientLevels) !== JSON.stringify(expectedCoefficientLevels)
      ) {
        errors.push(
          'fitted categorical coefficient levels must be the ordered complement of reference_level.',
        );
      }
    }
  }

  let expectedExpandedFeatureNames: string[] | null = null;
  if (!Array.isArray(value.missingness_transforms)) {
    errors.push('fitted missingness_transforms must be an array.');
  } else if (!orderedNumericFeatures) {
    errors.push('fitted missingness transforms cannot align without ordered numeric features.');
  } else {
    if (value.missingness_transforms.length !== orderedNumericFeatures.length) {
      errors.push('fitted missingness transforms must align one-for-one with ordered numeric features.');
    }
    const expanded: string[] = [];
    let transformsCanConstructFeatures =
      value.missingness_transforms.length === orderedNumericFeatures.length;
    value.missingness_transforms.forEach((candidate, index) => {
      const where = `fitted_artifact.missingness_transforms[${index}]`;
      if (!isRecord(candidate)) {
        errors.push(`${where} must be a plain-data object.`);
        transformsCanConstructFeatures = false;
        return;
      }
      exactKeys(
        candidate,
        [
          'feature',
          'source_input_id',
          'source_field',
          'transform_id',
          'policy',
          'imputation_value',
          'missing_indicator_feature',
        ],
        where,
        errors,
      );
      const expectedFeature = orderedNumericFeatures[index];
      if (candidate.feature !== expectedFeature) {
        errors.push(`${where}.feature must preserve ordered_numeric_features order.`);
      }
      for (const field of ['source_input_id', 'source_field', 'transform_id']) {
        if (!isNonEmptyString(candidate[field])) {
          errors.push(`${where}.${field} must be a non-empty string.`);
        }
      }
      if (
        isNonEmptyString(candidate.source_field) &&
        (FORWARD_FORBIDDEN_TARGET_OR_OUTCOME_FIELDS as readonly string[]).includes(
          candidate.source_field,
        )
      ) {
        errors.push(`${where}.source_field may not bind a target/actual outcome field.`);
      }
      const policy = MISSINGNESS_POLICIES.includes(candidate.policy as ForwardMissingnessPolicy)
        ? (candidate.policy as ForwardMissingnessPolicy)
        : null;
      if (!policy) {
        errors.push(`${where}.policy is invalid.`);
        transformsCanConstructFeatures = false;
        return;
      }
      if (expectedFeature) {
        expanded.push(expectedFeature);
        if (policy !== 'reject_row') expanded.push(`${expectedFeature}__missing`);
      } else {
        transformsCanConstructFeatures = false;
      }
      if (policy === 'reject_row') {
        if (candidate.imputation_value !== null) {
          errors.push(`${where}.imputation_value must be null under reject_row.`);
        }
        if (candidate.missing_indicator_feature !== null) {
          errors.push(`${where}.missing_indicator_feature must be null under reject_row.`);
        }
      } else {
        if (policy === 'impute_zero_with_indicator' && candidate.imputation_value !== 0) {
          errors.push(`${where}.imputation_value must be exactly zero under zero imputation.`);
        }
        if (
          policy === 'impute_training_mean_with_indicator' &&
          !isFiniteNumber(candidate.imputation_value)
        ) {
          errors.push(`${where}.imputation_value must be finite under training-mean imputation.`);
        }
        if (candidate.missing_indicator_feature !== `${String(expectedFeature)}__missing`) {
          errors.push(`${where}.missing_indicator_feature is invalid.`);
        }
      }
    });
    if (transformsCanConstructFeatures) expectedExpandedFeatureNames = expanded;
  }
  if (
    expectedExpandedFeatureNames &&
    orderedExpandedFeatureNames &&
    JSON.stringify(orderedExpandedFeatureNames) !== JSON.stringify(expectedExpandedFeatureNames)
  ) {
    errors.push('fitted expanded feature names do not match missingness transforms.');
  }

  if (
    expectedExpandedFeatureNames &&
    expectedCoefficientLevels &&
    coefficientFeatureNames
  ) {
    const constructedCoefficientNames = [
      ...expectedExpandedFeatureNames,
      ...expectedCoefficientLevels.map((level) => `position=${level}`),
    ];
    if (
      JSON.stringify(coefficientFeatureNames) !==
      JSON.stringify(constructedCoefficientNames)
    ) {
      errors.push(
        'fitted coefficient feature names do not match numeric transforms and categorical encoding.',
      );
    }
    if (coefficients && coefficients.length !== constructedCoefficientNames.length) {
      errors.push('fitted coefficients do not match the constructed design width.');
    }
    if (means && means.length !== expectedExpandedFeatureNames.length) {
      errors.push('fitted means do not match the constructed numeric transform width.');
    }
    if (
      standardDeviations &&
      standardDeviations.length !== expectedExpandedFeatureNames.length
    ) {
      errors.push(
        'fitted standard deviations do not match the constructed numeric transform width.',
      );
    }
  }

  if (!isRecord(value.training_identity)) {
    errors.push('fitted training_identity must be a plain-data object.');
  } else {
    const identity = value.training_identity;
    exactKeys(
      identity,
      [
        'row_count',
        'historical_row_ids_ordered',
        'historical_origin_ids_ordered',
        'input_seasons_ordered',
        'target_seasons_ordered',
        'training_population_sha256',
        'training_data_sha256',
      ],
      'fitted_artifact.training_identity',
      errors,
    );
    const rowCount =
      isInteger(identity.row_count) && identity.row_count > 0 ? identity.row_count : null;
    if (rowCount === null) {
      errors.push('fitted training row_count must be positive.');
    }
    const readIdentityStrings = (
      field: 'historical_row_ids_ordered' | 'historical_origin_ids_ordered',
    ): string[] | null => {
      const candidate = identity[field];
      if (
        !Array.isArray(candidate) ||
        candidate.length === 0 ||
        candidate.some((entry) => !isNonEmptyString(entry))
      ) {
        errors.push(`fitted training_identity.${field} must be a non-empty string array.`);
        return null;
      }
      const result = candidate as string[];
      if (new Set(result).size !== result.length) {
        errors.push(`fitted training_identity.${field} must contain unique entries.`);
      }
      if (
        JSON.stringify(result) !==
        JSON.stringify([...result].sort(compareStrings))
      ) {
        errors.push(`fitted training_identity.${field} must be canonically ordered.`);
      }
      return result;
    };
    const historicalRowIds = readIdentityStrings('historical_row_ids_ordered');
    const historicalOriginIds = readIdentityStrings('historical_origin_ids_ordered');
    if (rowCount !== null && historicalRowIds?.length !== rowCount) {
      errors.push('fitted historical row ID count must equal training row_count.');
    }
    if (rowCount !== null && historicalOriginIds && historicalOriginIds.length > rowCount) {
      errors.push('fitted historical origin ID count cannot exceed training row_count.');
    }

    const readIdentitySeasons = (
      field: 'input_seasons_ordered' | 'target_seasons_ordered',
    ): number[] | null => {
      const candidate = identity[field];
      if (
        !Array.isArray(candidate) ||
        candidate.length === 0 ||
        candidate.some((entry) => !isInteger(entry) || entry <= 0)
      ) {
        errors.push(`fitted training_identity.${field} must be a non-empty positive-integer array.`);
        return null;
      }
      const result = candidate as number[];
      if (new Set(result).size !== result.length) {
        errors.push(`fitted training_identity.${field} must contain unique entries.`);
      }
      if (
        JSON.stringify(result) !==
        JSON.stringify([...result].sort((left, right) => left - right))
      ) {
        errors.push(`fitted training_identity.${field} must be ascending.`);
      }
      return result;
    };
    const inputSeasons = readIdentitySeasons('input_seasons_ordered');
    const targetSeasons = readIdentitySeasons('target_seasons_ordered');
    if (rowCount !== null && inputSeasons && inputSeasons.length > rowCount) {
      errors.push('fitted input season count cannot exceed training row_count.');
    }
    if (rowCount !== null && targetSeasons && targetSeasons.length > rowCount) {
      errors.push('fitted target season count cannot exceed training row_count.');
    }
    if (
      finalFitTargetSeason !== null &&
      inputSeasons?.some((season) => season >= finalFitTargetSeason)
    ) {
      errors.push('fitted historical input seasons must precede final_fit_target_season.');
    }
    if (
      finalFitTargetSeason !== null &&
      targetSeasons?.some((season) => season >= finalFitTargetSeason)
    ) {
      errors.push('fitted historical target seasons must precede final_fit_target_season.');
    }
    for (const field of ['training_population_sha256', 'training_data_sha256']) {
      if (typeof identity[field] !== 'string' || !SHA256.test(identity[field])) {
        errors.push(`fitted ${field} is invalid.`);
      }
    }
  }

  if (!isRecord(value.schema_versions)) {
    errors.push('fitted schema_versions must be a plain-data object.');
  } else {
    exactKeys(
      value.schema_versions,
      ['configuration', 'historical_training_row', 'future_inference_row', 'fitted_model'],
      'fitted_artifact.schema_versions',
      errors,
    );
    if (value.schema_versions.configuration !== FORWARD_RIDGE_CONFIGURATION_SCHEMA_VERSION) {
      errors.push('fitted schema_versions.configuration is invalid.');
    }
    if (
      value.schema_versions.historical_training_row !==
      HISTORICAL_FORWARD_TRAINING_ROW_SCHEMA_VERSION
    ) {
      errors.push('fitted schema_versions.historical_training_row is invalid.');
    }
    if (
      value.schema_versions.future_inference_row !==
      FUTURE_FORWARD_INFERENCE_ROW_SCHEMA_VERSION
    ) {
      errors.push('fitted schema_versions.future_inference_row is invalid.');
    }
    if (value.schema_versions.fitted_model !== FITTED_FORWARD_RIDGE_ARTIFACT_VERSION) {
      errors.push('fitted schema_versions.fitted_model is invalid.');
    }
  }

  if (!isRecord(value.software_versions)) {
    errors.push('fitted software_versions must be a plain-data object.');
  } else {
    exactKeys(
      value.software_versions,
      ['forecast_runtime', 'numeric_runtime', 'linear_algebra'],
      'fitted_artifact.software_versions',
      errors,
    );
    if (!isNonEmptyString(value.software_versions.forecast_runtime)) {
      errors.push('fitted software_versions.forecast_runtime must be non-empty.');
    }
    if (value.software_versions.numeric_runtime !== 'ecmascript-number') {
      errors.push('fitted software_versions.numeric_runtime is invalid.');
    }
    if (
      value.software_versions.linear_algebra !==
      'seasonal-ridge-normal-equations-v1'
    ) {
      errors.push('fitted software_versions.linear_algebra is invalid.');
    }
  }

  return errors.length > 0 ? fail(errors) : ok(value as unknown as FittedSeasonalForwardRidgeArtifactV1);
};

export const predictSeasonalForward = (
  artifactValue: unknown,
  inferenceRowValue: unknown,
  expectedPins: ForwardInferencePinsV1,
): ForwardValidationResult<SeasonalForwardPredictionV1> => {
  const artifactResult = validateFittedSeasonalForwardRidgeArtifact(artifactValue);
  if (!artifactResult.ok) return fail(artifactResult.errors);
  const artifact = artifactResult.data;
  if (expectedPins.configuration_sha256 !== artifact.configuration_sha256) {
    return fail(['expected configuration pin does not match the fitted model artifact.']);
  }
  if (expectedPins.target_season !== artifact.final_fit_target_season) {
    return fail(['expected target season does not match the fitted model artifact.']);
  }

  const rowResult = validateFutureRowsAgainstSpec([inferenceRowValue], {
    configurationSha256: artifact.configuration_sha256,
    featureNames: artifact.ordered_numeric_features,
    positionLevels: artifact.categorical_levels.levels_ordered,
    expectedPins,
  });
  if (!rowResult.ok) return fail(rowResult.errors);
  const row = rowResult.data[0];

  const transformedResult = transformFeatureVector(row, artifact.missingness_transforms);
  if (!transformedResult.ok) return fail(transformedResult.errors);
  const transformed = transformedResult.data;
  if (transformed.length !== artifact.ordered_expanded_feature_names.length) {
    return fail(['inference transform width does not match the fitted artifact.']);
  }
  const standardized = transformed.map(
    (value, index) => (value - artifact.means[index]) / artifact.standard_deviations[index],
  );
  const positionDummies = artifact.categorical_levels.coefficient_levels_ordered.map(
    (level) => (row.position === level ? 1 : 0),
  );
  const design = [...standardized, ...positionDummies];
  if (design.length !== artifact.coefficients.length) {
    return fail(['inference design width does not match the fitted coefficients.']);
  }

  const sourceByExpandedFeature = new Map<
    string,
    { sourceValue: number | null; missing: boolean; kind: 'numeric' | 'missing_indicator' }
  >();
  for (const transform of artifact.missingness_transforms) {
    sourceByExpandedFeature.set(transform.feature, {
      sourceValue: row.source_features[transform.feature],
      missing: row.source_missingness[transform.feature],
      kind: 'numeric',
    });
    if (transform.missing_indicator_feature) {
      sourceByExpandedFeature.set(transform.missing_indicator_feature, {
        sourceValue: row.source_features[transform.feature],
        missing: row.source_missingness[transform.feature],
        kind: 'missing_indicator',
      });
    }
  }

  const contributions: ForwardRidgeMechanicsContribution[] =
    artifact.coefficient_feature_names_ordered.map((feature, index) => {
      const source = sourceByExpandedFeature.get(feature);
      const isPosition = feature.startsWith('position=');
      const transformedValue =
        index < transformed.length
          ? transformed[index]
          : positionDummies[index - transformed.length];
      const standardizedValue = design[index];
      return {
        feature,
        kind: isPosition ? 'position' : (source?.kind ?? 'numeric'),
        source_value: isPosition ? (transformedValue === 1 ? 1 : 0) : (source?.sourceValue ?? null),
        source_was_missing: isPosition ? false : (source?.missing ?? false),
        transformed_value: transformedValue,
        standardized_value: standardizedValue,
        coefficient: artifact.coefficients[index],
        contribution: artifact.coefficients[index] * standardizedValue,
      };
    });

  const rawPrediction =
    artifact.intercept + contributions.reduce((sum, contribution) => sum + contribution.contribution, 0);
  const pointForecast = Math.max(artifact.clamp.minimum, rawPrediction);
  if (!Number.isFinite(rawPrediction) || !Number.isFinite(pointForecast)) {
    return fail(['inference produced a non-finite forecast.']);
  }
  return ok({
    point_forecast: pointForecast,
    raw_prediction: rawPrediction,
    clamped: pointForecast !== rawPrediction,
    intercept: artifact.intercept,
    contributions,
  });
};
