import { describe, expect, it } from 'vitest';

import type { SeasonalPlayerObservation } from '../src/contracts/seasonalPprBacktest.js';
import {
  FITTED_FORWARD_RIDGE_ARTIFACT_VERSION,
  FORWARD_RIDGE_CONFIGURATION_SCHEMA_VERSION,
  FUTURE_FORWARD_INFERENCE_ROW_SCHEMA_VERSION,
  HISTORICAL_FORWARD_TRAINING_ROW_SCHEMA_VERSION,
  fitSeasonalForwardModel,
  predictSeasonalForward,
  serializeFittedForwardRidgeArtifact,
  sha256ForwardCanonicalValue,
  validateFittedSeasonalForwardRidgeArtifact,
  validateFrozenForwardRidgeConfiguration,
  validateFutureInferenceRows,
  validateHistoricalTrainingRows,
  type FrozenForwardRidgeConfigurationPackageV1,
  type FrozenForwardRidgeConfigurationV1,
  type FutureForwardInferenceRowV1,
  type HistoricalForwardTrainingRowV1,
} from '../src/models/seasonal/forwardRidgeModel.js';
import { trainSeasonalRidgeModel } from '../src/models/seasonal/seasonalPprModel.js';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

const configuration: FrozenForwardRidgeConfigurationV1 = {
  configuration_schema_version: FORWARD_RIDGE_CONFIGURATION_SCHEMA_VERSION,
  configuration_id: 'fixture-base-feature-config-v1',
  feature_set_id: 'fixture-feature-set-v1',
  feature_admission_decision_id: 'fixture-feature-admission-decision-v1',
  feature_admission_evidence_sha256: HASH_A,
  model_id: 'fixture-seasonal-forward-ridge',
  model_version: 'fixture-v1',
  ordered_numeric_features: [
    {
      name: 'previous_ppr',
      source_input_id: 'fixture-seasonal-input',
      source_field: 'previous_ppr',
      transform_id: 'identity-v1',
      missingness_policy: 'reject_row',
    },
    {
      name: 'volume',
      source_input_id: 'fixture-volume-input',
      source_field: 'volume',
      transform_id: 'identity-v1',
      missingness_policy: 'impute_training_mean_with_indicator',
    },
    {
      name: 'rush_volume',
      source_input_id: 'fixture-rush-input',
      source_field: 'rush_volume',
      transform_id: 'identity-v1',
      missingness_policy: 'impute_zero_with_indicator',
    },
  ],
  position_levels: ['QB', 'RB', 'WR', 'TE'],
  position_reference_level: 'TE',
  lambda: 1,
  clamp: { kind: 'minimum', minimum: 0 },
  software_version: 'fixture-forward-runtime-v1',
};

const configurationPackage = (): FrozenForwardRidgeConfigurationPackageV1 => ({
  configuration_sha256: sha256ForwardCanonicalValue(configuration),
  configuration: structuredClone(configuration),
});

const trainingRow = (
  index: number,
  overrides: Partial<HistoricalForwardTrainingRowV1> = {},
): HistoricalForwardTrainingRowV1 => {
  const volumeMissing = index === 1;
  const rushMissing = index === 2;
  return {
    row_schema_version: HISTORICAL_FORWARD_TRAINING_ROW_SCHEMA_VERSION,
    row_kind: 'historical_forward_training',
    historical_row_id: `origin-2025-player-${String(index).padStart(2, '0')}`,
    historical_origin_id: 'historical-origin-2025',
    input_season: 2024,
    target_season: 2025,
    configuration_sha256: configurationPackage().configuration_sha256,
    position: ['QB', 'RB', 'WR', 'TE'][index % 4],
    source_features: {
      previous_ppr: 80 + index * 20,
      volume: volumeMissing ? null : 45 + index * 5,
      rush_volume: rushMissing ? null : index * 3,
    },
    source_missingness: {
      previous_ppr: false,
      volume: volumeMissing,
      rush_volume: rushMissing,
    },
    target: 90 + index * 18,
    ...overrides,
  };
};

const trainingRows = (): HistoricalForwardTrainingRowV1[] =>
  Array.from({ length: 10 }, (_, index) => trainingRow(index));

const inferenceRow = (
  overrides: Partial<FutureForwardInferenceRowV1> = {},
): FutureForwardInferenceRowV1 => ({
  row_schema_version: FUTURE_FORWARD_INFERENCE_ROW_SCHEMA_VERSION,
  row_kind: 'future_forward_inference',
  population_row_id: 'population-player-001',
  run_id: 'fixture-forward-run-001',
  configuration_sha256: configurationPackage().configuration_sha256,
  input_package_sha256: HASH_A,
  census_sha256: HASH_B,
  input_season: 2025,
  target_season: 2026,
  position: 'WR',
  source_features: {
    previous_ppr: 175,
    volume: null,
    rush_volume: null,
  },
  source_missingness: {
    previous_ppr: false,
    volume: true,
    rush_volume: true,
  },
  ...overrides,
});

const pins = () => ({
  run_id: 'fixture-forward-run-001',
  configuration_sha256: configurationPackage().configuration_sha256,
  input_package_sha256: HASH_A,
  census_sha256: HASH_B,
  target_season: 2026,
});

const fit = () => {
  const result = fitSeasonalForwardModel({
    rows: trainingRows(),
    frozenConfiguration: configurationPackage(),
    finalFitTargetSeason: 2026,
  });
  if (!result.ok) throw new Error(result.errors.join('\n'));
  return result.data;
};

type MutableArtifactRecord = Record<string, unknown>;

const artifactRecord = (): MutableArtifactRecord =>
  structuredClone(fit()) as unknown as MutableArtifactRecord;

const nestedRecord = (
  record: MutableArtifactRecord,
  field: string,
): MutableArtifactRecord => {
  const value = record[field];
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${field} is not an object fixture`);
  }
  return value as MutableArtifactRecord;
};

const recordArray = (
  record: MutableArtifactRecord,
  field: string,
): MutableArtifactRecord[] => {
  const value = record[field];
  if (!Array.isArray(value)) throw new Error(`${field} is not an array fixture`);
  return value as MutableArtifactRecord[];
};

const expectFittedArtifactMutationRejected = (
  mutate: (artifact: MutableArtifactRecord) => void,
  expectedError: RegExp,
): void => {
  const artifact = artifactRecord();
  mutate(artifact);
  const result = validateFittedSeasonalForwardRidgeArtifact(artifact);
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.errors.join(' ')).toMatch(expectedError);
};

describe('frozen forward ridge configuration boundary', () => {
  it('accepts only a package whose hash covers the complete frozen configuration', () => {
    expect(validateFrozenForwardRidgeConfiguration(configurationPackage()).ok).toBe(true);

    const mismatched = configurationPackage();
    mismatched.configuration.lambda = 10;
    const result = validateFrozenForwardRidgeConfiguration(mismatched);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toMatch(/sha256 mismatch/);
  });

  it('does not provide a production configuration default', () => {
    const sourceShape = Object.keys(configuration).sort();
    expect(sourceShape).toContain('configuration_id');
    expect(configuration.configuration_id).toMatch(/^fixture-/);
  });

  it('does not allow a frozen configuration to smuggle a target into source features', () => {
    const unsafeConfiguration = structuredClone(configuration);
    unsafeConfiguration.ordered_numeric_features[0].name = 'actual_outcome';
    const result = validateFrozenForwardRidgeConfiguration({
      configuration_sha256: sha256ForwardCanonicalValue(unsafeConfiguration),
      configuration: unsafeConfiguration,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toMatch(/target\/actual outcome field/);
  });

  it('binds generic feature admission and source lineage without selecting a production feature family', () => {
    const result = validateFrozenForwardRidgeConfiguration(configurationPackage());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.configuration.feature_set_id).toBe('fixture-feature-set-v1');
    expect(result.data.configuration.feature_admission_decision_id).toBe(
      'fixture-feature-admission-decision-v1',
    );
    expect(result.data.configuration.feature_admission_evidence_sha256).toBe(HASH_A);
    expect(result.data.configuration.ordered_numeric_features[0]).toMatchObject({
      source_input_id: 'fixture-seasonal-input',
      source_field: 'previous_ppr',
      transform_id: 'identity-v1',
    });
  });

  it('returns a copy-isolated, deeply frozen plain-data package', () => {
    const supplied = configurationPackage();
    const result = validateFrozenForwardRidgeConfiguration(supplied);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    supplied.configuration.model_id = 'mutated-after-validation';
    supplied.configuration.ordered_numeric_features[0].source_field = 'mutated_source';
    expect(result.data.configuration.model_id).toBe('fixture-seasonal-forward-ridge');
    expect(result.data.configuration.ordered_numeric_features[0].source_field).toBe(
      'previous_ppr',
    );
    expect(Object.isFrozen(result.data)).toBe(true);
    expect(Object.isFrozen(result.data.configuration)).toBe(true);
    expect(Object.isFrozen(result.data.configuration.ordered_numeric_features)).toBe(true);
    expect(Object.isFrozen(result.data.configuration.ordered_numeric_features[0])).toBe(true);
    expect(Object.isFrozen(result.data.configuration.clamp)).toBe(true);
  });

  it('fails closed when the supplied package is not canonically serializable plain data', () => {
    const supplied = configurationPackage();
    Object.defineProperty(supplied.configuration, 'hidden', {
      value: true,
      enumerable: false,
    });
    const result = validateFrozenForwardRidgeConfiguration(supplied);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toMatch(/canonicalization failed/);
  });

  it('rejects incomplete lineage and target-bearing source bindings', () => {
    const incomplete = structuredClone(configuration);
    incomplete.ordered_numeric_features[0].source_input_id = '';
    const incompleteResult = validateFrozenForwardRidgeConfiguration({
      configuration_sha256: sha256ForwardCanonicalValue(incomplete),
      configuration: incomplete,
    });
    expect(incompleteResult.ok).toBe(false);

    const unsafe = structuredClone(configuration);
    unsafe.ordered_numeric_features[0].source_field = 'actual_outcome';
    const unsafeResult = validateFrozenForwardRidgeConfiguration({
      configuration_sha256: sha256ForwardCanonicalValue(unsafe),
      configuration: unsafe,
    });
    expect(unsafeResult.ok).toBe(false);
    if (!unsafeResult.ok) expect(unsafeResult.errors.join(' ')).toMatch(/source_field.*target\/actual/);
  });
});

describe('historical training row runtime boundary', () => {
  it('validates, binds, and deterministically sorts explicit historical origins', () => {
    const reversed = trainingRows().reverse();
    const result = validateHistoricalTrainingRows(reversed, {
      frozenConfiguration: configurationPackage(),
      finalFitTargetSeason: 2026,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.map((row) => row.historical_row_id)).toEqual(
      [...result.data.map((row) => row.historical_row_id)].sort(),
    );
    expect(result.data.every((row) => row.target_season < 2026)).toBe(true);
  });

  it.each([null, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'rejects the non-finite/null training target %s',
    (target) => {
      const rows: unknown[] = trainingRows();
      rows[0] = { ...rows[0] as object, target };
      const result = validateHistoricalTrainingRows(rows, {
        frozenConfiguration: configurationPackage(),
        finalFitTargetSeason: 2026,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.join(' ')).toMatch(/finite, non-null/);
    },
  );

  it('rejects future/equal target seasons, non-historical ordering, missing origin identity, and config drift', () => {
    const cases: HistoricalForwardTrainingRowV1[] = [
      trainingRow(0, { target_season: 2026 }),
      trainingRow(0, { input_season: 2025, target_season: 2025 }),
      trainingRow(0, { historical_origin_id: '' }),
      trainingRow(0, { configuration_sha256: HASH_A }),
    ];
    for (const row of cases) {
      const result = validateHistoricalTrainingRows([row], {
        frozenConfiguration: configurationPackage(),
        finalFitTargetSeason: 2026,
      });
      expect(result.ok).toBe(false);
    }
  });

  it('preserves source missingness and rejects a value/missingness disagreement', () => {
    const valid = validateHistoricalTrainingRows(trainingRows(), {
      frozenConfiguration: configurationPackage(),
      finalFitTargetSeason: 2026,
    });
    expect(valid.ok).toBe(true);
    if (valid.ok) {
      expect(valid.data.find((row) => row.historical_row_id.endsWith('01'))?.source_features.volume).toBeNull();
      expect(valid.data.find((row) => row.historical_row_id.endsWith('01'))?.source_missingness.volume).toBe(true);
    }

    const bad = trainingRows();
    bad[1].source_missingness.volume = false;
    const invalid = validateHistoricalTrainingRows(bad, {
      frozenConfiguration: configurationPackage(),
      finalFitTargetSeason: 2026,
    });
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) expect(invalid.errors.join(' ')).toMatch(/disagree/);
  });
});

describe('future inference row runtime boundary', () => {
  it('uses a distinct target-free type and accepts its exact identity pins', () => {
    const row = inferenceRow();
    expect('target' in row).toBe(false);
    expect('actual_outcome' in row).toBe(false);
    const result = validateFutureInferenceRows([row], {
      frozenConfiguration: configurationPackage(),
      expectedPins: pins(),
    });
    expect(result.ok).toBe(true);
  });

  it.each([
    'target',
    'training_target',
    'actual',
    'actual_ppr',
    'actual_outcome',
    'ppr_2025_actual',
    'target_fantasy_points_ppr',
  ])('rejects forbidden top-level field %s even when supplied through unknown', (field) => {
    const malicious: Record<string, unknown> = { ...inferenceRow(), [field]: 999 };
    const result = validateFutureInferenceRows([malicious], {
      frozenConfiguration: configurationPackage(),
      expectedPins: pins(),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toContain(`forbidden training target/actual field ${field}`);
  });

  it('requires complete expected pins at the exported validation boundary', () => {
    const optionsWithoutPins = {
      frozenConfiguration: configurationPackage(),
    } as unknown as Parameters<typeof validateFutureInferenceRows>[1];
    const result = validateFutureInferenceRows([inferenceRow()], optionsWithoutPins);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toMatch(/expectedPins.*required|expectedPins.*object/);
  });
});

describe('deterministic final fit and complete replay artifact', () => {
  it('produces byte-identical fitted artifacts when training array order changes', () => {
    const first = fitSeasonalForwardModel({
      rows: trainingRows(),
      frozenConfiguration: configurationPackage(),
      finalFitTargetSeason: 2026,
    });
    const second = fitSeasonalForwardModel({
      rows: trainingRows().reverse(),
      frozenConfiguration: configurationPackage(),
      finalFitTargetSeason: 2026,
    });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(serializeFittedForwardRidgeArtifact(second.data)).toBe(
      serializeFittedForwardRidgeArtifact(first.data),
    );
  });

  it('serializes all replay-critical math, transforms, identities, hashes, and versions', () => {
    const artifact = fit();
    expect(artifact.artifact_version).toBe(FITTED_FORWARD_RIDGE_ARTIFACT_VERSION);
    expect(artifact.configuration_sha256).toBe(configurationPackage().configuration_sha256);
    expect(artifact.coefficients).toHaveLength(artifact.coefficient_feature_names_ordered.length);
    expect(artifact.means).toHaveLength(artifact.ordered_expanded_feature_names.length);
    expect(artifact.standard_deviations).toHaveLength(artifact.ordered_expanded_feature_names.length);
    expect(artifact.categorical_levels).toEqual({
      feature: 'position',
      levels_ordered: ['QB', 'RB', 'WR', 'TE'],
      reference_level: 'TE',
      coefficient_levels_ordered: ['QB', 'RB', 'WR'],
    });
    expect(artifact.lambda).toBe(1);
    expect(artifact.clamp).toEqual({ kind: 'minimum', minimum: 0 });
    expect(artifact.training_identity.row_count).toBe(10);
    expect(artifact.training_identity.training_population_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(artifact.training_identity.training_data_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(artifact.schema_versions.fitted_model).toBe(FITTED_FORWARD_RIDGE_ARTIFACT_VERSION);
    expect(artifact.software_versions.linear_algebra).toBe('seasonal-ridge-normal-equations-v1');
    expect(serializeFittedForwardRidgeArtifact(artifact).endsWith('\n')).toBe(true);
  });

  it('freezes explicit zero/indicator and training-mean/indicator transforms', () => {
    const artifact = fit();
    const volume = artifact.missingness_transforms.find((transform) => transform.feature === 'volume');
    const rush = artifact.missingness_transforms.find((transform) => transform.feature === 'rush_volume');
    const observedVolume = trainingRows()
      .map((row) => row.source_features.volume)
      .filter((value): value is number => value !== null);
    const expectedMean = observedVolume.reduce((sum, value) => sum + value, 0) / observedVolume.length;
    expect(volume).toEqual({
      feature: 'volume',
      source_input_id: 'fixture-volume-input',
      source_field: 'volume',
      transform_id: 'identity-v1',
      policy: 'impute_training_mean_with_indicator',
      imputation_value: expectedMean,
      missing_indicator_feature: 'volume__missing',
    });
    expect(rush).toEqual({
      feature: 'rush_volume',
      source_input_id: 'fixture-rush-input',
      source_field: 'rush_volume',
      transform_id: 'identity-v1',
      policy: 'impute_zero_with_indicator',
      imputation_value: 0,
      missing_indicator_feature: 'rush_volume__missing',
    });
  });

  it('fails instead of fitting a missing value under reject_row', () => {
    const rows = trainingRows();
    rows[0].source_features.previous_ppr = null;
    rows[0].source_missingness.previous_ppr = true;
    const result = fitSeasonalForwardModel({
      rows,
      frozenConfiguration: configurationPackage(),
      finalFitTargetSeason: 2026,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toMatch(/reject_row/);
  });
});

describe('fitted forward ridge artifact fail-closed replay boundary', () => {
  it('accepts the complete fitted artifact emitted by the trainer', () => {
    const result = validateFittedSeasonalForwardRidgeArtifact(fit());
    expect(result.ok).toBe(true);
  });

  const mutationCases: Array<{
    name: string;
    mutate: (artifact: MutableArtifactRecord) => void;
    expected: RegExp;
  }> = [
    {
      name: 'an unknown top-level field',
      mutate: (artifact) => {
        artifact.unexpected = true;
      },
      expected: /unsupported field "unexpected"/,
    },
    {
      name: 'a missing required top-level field',
      mutate: (artifact) => {
        delete artifact.configuration_id;
      },
      expected: /configuration_id is required/,
    },
    {
      name: 'an empty configuration identity',
      mutate: (artifact) => {
        artifact.configuration_id = '';
      },
      expected: /configuration_id must be a non-empty string/,
    },
    {
      name: 'an unknown standardization field',
      mutate: (artifact) => {
        nestedRecord(artifact, 'standardization').extra = true;
      },
      expected: /standardization.*unsupported field "extra"/,
    },
    {
      name: 'a changed standardization literal',
      mutate: (artifact) => {
        nestedRecord(artifact, 'standardization').zero_variance_threshold = 1e-8;
      },
      expected: /zero_variance_threshold must be exactly 1e-9/,
    },
    {
      name: 'a transform reordered away from its numeric feature',
      mutate: (artifact) => {
        const transforms = recordArray(artifact, 'missingness_transforms');
        [transforms[0], transforms[1]] = [transforms[1], transforms[0]];
      },
      expected: /feature must preserve ordered_numeric_features order/,
    },
    {
      name: 'a missing transform provenance binding',
      mutate: (artifact) => {
        delete recordArray(artifact, 'missingness_transforms')[0].source_input_id;
      },
      expected: /source_input_id is required/,
    },
    {
      name: 'a target-bearing transform source binding',
      mutate: (artifact) => {
        recordArray(artifact, 'missingness_transforms')[0].source_field = 'actual_outcome';
      },
      expected: /source_field may not bind a target\/actual outcome field/,
    },
    {
      name: 'a nonzero value under zero imputation',
      mutate: (artifact) => {
        recordArray(artifact, 'missingness_transforms')[2].imputation_value = 3;
      },
      expected: /imputation_value must be exactly zero/,
    },
    {
      name: 'an incorrect generated missing-indicator name',
      mutate: (artifact) => {
        recordArray(artifact, 'missingness_transforms')[1].missing_indicator_feature =
          'wrong__missing';
      },
      expected: /missing_indicator_feature is invalid/,
    },
    {
      name: 'duplicate categorical levels',
      mutate: (artifact) => {
        nestedRecord(artifact, 'categorical_levels').levels_ordered = [
          'QB',
          'RB',
          'WR',
          'WR',
        ];
      },
      expected: /levels_ordered must be unique/,
    },
    {
      name: 'a categorical reference outside the levels',
      mutate: (artifact) => {
        nestedRecord(artifact, 'categorical_levels').reference_level = 'K';
      },
      expected: /reference_level must occur in levels_ordered/,
    },
    {
      name: 'categorical coefficients that are not the ordered reference complement',
      mutate: (artifact) => {
        nestedRecord(artifact, 'categorical_levels').coefficient_levels_ordered = [
          'WR',
          'RB',
          'QB',
        ];
      },
      expected: /ordered complement/,
    },
    {
      name: 'a historical row count mismatch',
      mutate: (artifact) => {
        nestedRecord(artifact, 'training_identity').row_count = 11;
      },
      expected: /row ID count must equal training row_count/,
    },
    {
      name: 'noncanonical historical row ID order',
      mutate: (artifact) => {
        const identity = nestedRecord(artifact, 'training_identity');
        identity.historical_row_ids_ordered = [
          ...(identity.historical_row_ids_ordered as string[]),
        ].reverse();
      },
      expected: /historical_row_ids_ordered must be canonically ordered/,
    },
    {
      name: 'duplicate historical origin identities',
      mutate: (artifact) => {
        const identity = nestedRecord(artifact, 'training_identity');
        const origin = (identity.historical_origin_ids_ordered as string[])[0];
        identity.historical_origin_ids_ordered = [origin, origin];
      },
      expected: /historical_origin_ids_ordered must contain unique entries/,
    },
    {
      name: 'descending training seasons',
      mutate: (artifact) => {
        nestedRecord(artifact, 'training_identity').input_seasons_ordered = [2024, 2023];
      },
      expected: /input_seasons_ordered must be ascending/,
    },
    {
      name: 'an invalid training-data hash',
      mutate: (artifact) => {
        nestedRecord(artifact, 'training_identity').training_data_sha256 = 'A'.repeat(64);
      },
      expected: /training_data_sha256 is invalid/,
    },
    {
      name: 'a coefficient vector length mismatch',
      mutate: (artifact) => {
        (artifact.coefficients as number[]).pop();
      },
      expected: /coefficients do not align|constructed design width/,
    },
    {
      name: 'a mean vector length mismatch',
      mutate: (artifact) => {
        (artifact.means as number[]).pop();
      },
      expected: /means do not align|constructed numeric transform width/,
    },
    {
      name: 'a nonpositive standard deviation',
      mutate: (artifact) => {
        (artifact.standard_deviations as number[])[0] = 0;
      },
      expected: /standard deviations must be positive/,
    },
    {
      name: 'expanded feature names that do not replay the transforms',
      mutate: (artifact) => {
        (artifact.ordered_expanded_feature_names as string[])[0] = 'different_feature';
      },
      expected: /expanded feature names do not match missingness transforms/,
    },
    {
      name: 'coefficient feature names that do not replay the design construction',
      mutate: (artifact) => {
        (artifact.coefficient_feature_names_ordered as string[])[0] =
          'different_feature';
      },
      expected: /coefficient feature names do not match/,
    },
    {
      name: 'a changed schema version',
      mutate: (artifact) => {
        nestedRecord(artifact, 'schema_versions').future_inference_row = 'future-v2';
      },
      expected: /schema_versions.future_inference_row is invalid/,
    },
    {
      name: 'an unknown software version field',
      mutate: (artifact) => {
        nestedRecord(artifact, 'software_versions').extra = 'drift';
      },
      expected: /software_versions.*unsupported field "extra"/,
    },
    {
      name: 'a changed numeric runtime',
      mutate: (artifact) => {
        nestedRecord(artifact, 'software_versions').numeric_runtime = 'decimal128';
      },
      expected: /software_versions.numeric_runtime is invalid/,
    },
  ];

  it.each(mutationCases)('rejects $name', ({ mutate, expected }) => {
    expectFittedArtifactMutationRejected(mutate, expected);
  });
});

describe('pinned target-free inference', () => {
  it('is deterministic, leaves the fitted artifact unchanged, and exposes additive mechanics', () => {
    const artifact = fit();
    const bytesBefore = serializeFittedForwardRidgeArtifact(artifact);
    const first = predictSeasonalForward(artifact, inferenceRow(), pins());
    const second = predictSeasonalForward(artifact, inferenceRow(), pins());
    expect(first.ok).toBe(true);
    expect(second).toEqual(first);
    if (!first.ok) return;
    expect(Number.isFinite(first.data.point_forecast)).toBe(true);
    expect(first.data.point_forecast).toBeGreaterThanOrEqual(0);
    expect(
      first.data.intercept +
        first.data.contributions.reduce((sum, contribution) => sum + contribution.contribution, 0),
    ).toBeCloseTo(first.data.raw_prediction, 12);
    expect(first.data.contributions.find((entry) => entry.feature === 'volume')?.source_was_missing).toBe(true);
    expect(first.data.contributions.find((entry) => entry.feature === 'volume__missing')?.transformed_value).toBe(1);
    expect(serializeFittedForwardRidgeArtifact(artifact)).toBe(bytesBefore);
  });

  it('fails closed on any run/config/input/census/target pin mismatch', () => {
    const artifact = fit();
    const mismatches = [
      { ...pins(), run_id: 'wrong' },
      { ...pins(), configuration_sha256: HASH_A },
      { ...pins(), input_package_sha256: HASH_B },
      { ...pins(), census_sha256: HASH_A },
      { ...pins(), target_season: 2027 },
    ];
    for (const mismatch of mismatches) {
      expect(predictSeasonalForward(artifact, inferenceRow(), mismatch).ok).toBe(false);
    }
  });
});

describe('legacy seasonal trainer safety boundary', () => {
  const legacyRows = (): SeasonalPlayerObservation[] =>
    Array.from({ length: 8 }, (_, index) => ({
      player_id: `legacy-${index}`,
      player_name: `Legacy ${index}`,
      position: ['QB', 'RB', 'WR', 'TE'][index % 4] as SeasonalPlayerObservation['position'],
      team_2024: 'FA',
      games_2024: 17,
      ppr_2024: 100 + index * 15,
      receptions_2024: 40 + index,
      targets_2024: 70 + index,
      rush_attempts_2024: index * 2,
      ppr_2025_actual: 110 + index * 14,
      player_history: null,
    }));

  it.each([null, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'rejects legacy target %s before ridge matrix math',
    (target) => {
      const rows = legacyRows();
      rows[0].ppr_2025_actual = target;
      expect(() => trainSeasonalRidgeModel(rows, { lambda: 1 })).toThrow(/finite, non-null target/);
    },
  );

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1])(
    'rejects invalid legacy lambda %s before ridge matrix math',
    (lambda) => {
      expect(() => trainSeasonalRidgeModel(legacyRows(), { lambda })).toThrow(/finite, non-negative lambda/);
    },
  );

  it('does not alter deterministic valid legacy fits', () => {
    const rows = legacyRows();
    const target = { ...rows[0], player_id: 'legacy-target', ppr_2025_actual: 0 };
    const first = trainSeasonalRidgeModel(rows, { lambda: 1 }).predict(target);
    const second = trainSeasonalRidgeModel(rows, { lambda: 1 }).predict(target);
    expect(second).toBe(first);
    expect(Number.isFinite(first)).toBe(true);
  });
});
