import { describe, expect, it } from 'vitest';
import {
  FORWARD_FORECAST_STATUSES,
  FORWARD_UNCERTAINTY_STATUS,
} from '../src/contracts/forwardSeasonalPpr.js';
import {
  computeForwardPinnedPackageSha256,
  runForwardCandidateService,
} from '../src/services/runForwardCandidateService.js';
import {
  makeSyntheticForwardRuntimeInput,
  SYNTHETIC_FORWARD_CUTOFF,
} from './fixtures/forwardRuntimeFixtures.js';

const runOk = () => {
  const result = runForwardCandidateService(
    makeSyntheticForwardRuntimeInput(),
  );
  if (!result.ok) {
    throw new Error(
      result.errors.map((error) => `${error.code}: ${error.message}`).join('\n'),
    );
  }
  return result.data;
};

const repinFutureFeaturePackage = (
  input: ReturnType<typeof makeSyntheticForwardRuntimeInput>,
): void => {
  input.future_feature_package.content_sha256 =
    computeForwardPinnedPackageSha256(input.future_feature_package);
  input.expected_pins = {
    ...input.expected_pins,
    input_sha256: {
      ...input.expected_pins.input_sha256,
      [input.future_feature_package.input_id]:
        input.future_feature_package.content_sha256,
    },
  };
  input.scoring_reconciliation = {
    ...input.scoring_reconciliation,
    source_input_sha256s: [
      input.historical_training_package.content_sha256,
      input.future_feature_package.content_sha256,
    ].sort(),
  };
};

describe('runForwardCandidateService', () => {
  it('preserves every census row and represents all seven statuses exactly once', () => {
    const result = runOk();
    const statuses = result.player_rows.map((row) => row.status.forecast);

    expect(result.player_rows).toHaveLength(7);
    expect([...statuses].sort()).toEqual([...FORWARD_FORECAST_STATUSES].sort());
    expect(result.manifest.population_census.row_count).toBe(7);
    expect(result.manifest.population_census.reconciliation).toMatchObject({
      output_row_count: 7,
      duplicate_population_row_ids: [],
      missing_population_row_ids: [],
      extra_population_row_ids: [],
      one_to_one_complete: true,
    });
    expect(
      Object.values(result.manifest.population_census.status_counts).reduce(
        (sum, count) => sum + count,
        0,
      ),
    ).toBe(7);
    expect(result.player_rows.map((row) => row.population_row_id)).toEqual(
      [...result.player_rows.map((row) => row.population_row_id)].sort(),
    );
  });

  it('emits a finite point iff available and keeps all ranges and actuals null', () => {
    const result = runOk();
    for (const row of result.player_rows) {
      expect(row.actual_outcome).toBeNull();
      expect(row.forecast.lower_quantile).toBeNull();
      expect(row.forecast.median).toBeNull();
      expect(row.forecast.upper_quantile).toBeNull();
      expect(row.forecast.interval_lower).toBeNull();
      expect(row.forecast.interval_upper).toBeNull();

      if (row.status.forecast === 'forecast_available') {
        expect(Number.isFinite(row.forecast.generic_ppr_points)).toBe(true);
        expect(row.status).toMatchObject({
          identity: 'resolved',
          eligibility: 'eligible',
          position_domain: 'supported',
        });
      } else {
        expect(row.forecast.generic_ppr_points).toBeNull();
        expect(row.status_reasons.length).toBeGreaterThan(0);
      }
    }

    expect(result.manifest.forecast_uncertainty.status).toBe(
      FORWARD_UNCERTAINTY_STATUS,
    );
    expect(result.manifest.candidate_only).toBe(true);
    expect(result.manifest.production_ready).toBe(false);
    expect(result.manifest.consumer_eligibility).toBe('never');
  });

  it('never sends IDP through the offensive inference model', () => {
    const input = makeSyntheticForwardRuntimeInput();
    expect(
      input.future_feature_package.content.payload.rows.some(
        (row) => row.population_row_id === 'fixture-pop-idp',
      ),
    ).toBe(false);

    const result = runOk();
    const idp = result.player_rows.find(
      (row) => row.population_row_id === 'fixture-pop-idp',
    );
    expect(idp?.status.forecast).toBe('unsupported_position_domain');
    expect(idp?.forecast.generic_ppr_points).toBeNull();
    expect(idp?.feature_lineage).toEqual([]);
    expect(idp?.drivers.status).toBe('unavailable');
  });

  it('preserves missing source provenance while recording the frozen imputation transform', () => {
    const result = runOk();
    const available = result.player_rows.find(
      (row) => row.population_row_id === 'fixture-pop-available',
    );
    expect(available?.status.forecast).toBe('forecast_available');
    expect(available?.feature_coverage.status).toBe('partial');
    expect(available?.feature_coverage.imputed).toEqual([
      expect.objectContaining({
        feature: 'volume',
        source_value: null,
        transform_id: 'training_mean_with_indicator_v1',
      }),
    ]);
    expect(
      available?.feature_lineage.find((entry) => entry.feature === 'volume'),
    ).toMatchObject({
      input_id: 'fixture-future-feature-package',
      source_field: 'volume',
      source_value: null,
      transform_id: 'training_mean_with_indicator_v1',
    });
  });

  it('is byte-deterministic for two identical injected fixture builds', () => {
    const first = runOk();
    const second = runOk();
    expect(second.bytes.manifest.equals(first.bytes.manifest)).toBe(true);
    expect(second.bytes.player_rows.equals(first.bytes.player_rows)).toBe(true);
    expect(second.bytes.fitted_model.equals(first.bytes.fitted_model)).toBe(true);
    expect(second.hashes).toEqual(first.hashes);
  });

  it('fails closed before fit on scoring, governance, cutoff, and decision-freeze failures', () => {
    const cases: Array<{
      mutate: (input: ReturnType<typeof makeSyntheticForwardRuntimeInput>) => void;
      code: string;
    }> = [
      {
        mutate: (input) => {
          input.scoring_reconciliation = {
            ...input.scoring_reconciliation,
            status: 'failed',
          };
        },
        code: 'FORWARD_SCORING_RECONCILIATION_STATUS_INCOMPATIBLE',
      },
      {
        mutate: (input) => {
          input.future_feature_package.governance_marker_ref = null;
        },
        code: 'FORWARD_INPUT_GOVERNANCE_MARKER_MISSING',
      },
      {
        mutate: (input) => {
          input.future_feature_package.content.cutoff_records[0].fact_available_at =
            '2099-07-01T12:00:00.001Z';
          input.future_feature_package.content_sha256 =
            computeForwardPinnedPackageSha256(input.future_feature_package);
          input.expected_pins = {
            ...input.expected_pins,
            input_sha256: {
              ...input.expected_pins.input_sha256,
              [input.future_feature_package.input_id]:
                input.future_feature_package.content_sha256,
            },
          };
          input.scoring_reconciliation = {
            ...input.scoring_reconciliation,
            source_input_sha256s: [
              input.historical_training_package.content_sha256,
              input.future_feature_package.content_sha256,
            ].sort(),
          };
        },
        code: 'FORWARD_INPUT_POST_CUTOFF',
      },
      {
        mutate: (input) => {
          input.decision_freezes.source_code.fact_available_at =
            '2099-07-01T12:00:00.001Z';
        },
        code: 'FORWARD_DECISION_FREEZE_POST_CUTOFF',
      },
    ];

    for (const testCase of cases) {
      const input = makeSyntheticForwardRuntimeInput();
      testCase.mutate(input);
      const result = runForwardCandidateService(input);
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.errors.map((entry) => entry.code)).toContain(testCase.code);
    }
    expect(SYNTHETIC_FORWARD_CUTOFF).toBe('2099-07-01T12:00:00.000Z');
  });

  it('rejects extra feature rows and target-bearing future inputs without fuzzy recovery', () => {
    const extra = makeSyntheticForwardRuntimeInput();
    extra.future_feature_package.content.payload = {
      rows: [
        ...extra.future_feature_package.content.payload.rows,
        {
          ...extra.future_feature_package.content.payload.rows[0],
          population_row_id: 'fixture-pop-not-in-census',
        },
      ],
    };
    extra.future_feature_package.content_sha256 =
      computeForwardPinnedPackageSha256(extra.future_feature_package);
    extra.expected_pins = {
      ...extra.expected_pins,
      input_sha256: {
        ...extra.expected_pins.input_sha256,
        [extra.future_feature_package.input_id]:
          extra.future_feature_package.content_sha256,
      },
    };
    extra.scoring_reconciliation = {
      ...extra.scoring_reconciliation,
      source_input_sha256s: [
        extra.historical_training_package.content_sha256,
        extra.future_feature_package.content_sha256,
      ].sort(),
    };
    const extraResult = runForwardCandidateService(extra);
    expect(extraResult.ok).toBe(false);
    if (!extraResult.ok) {
      expect(extraResult.errors.map((entry) => entry.code)).toContain(
        'FORWARD_FEATURE_ROW_EXTRA',
      );
    }

    const targetBearing = makeSyntheticForwardRuntimeInput();
    (
      targetBearing.future_feature_package.content.payload.rows[0] as unknown as
        Record<string, unknown>
    ).actual_outcome = 999;
    targetBearing.future_feature_package.content_sha256 =
      computeForwardPinnedPackageSha256(targetBearing.future_feature_package);
    targetBearing.expected_pins = {
      ...targetBearing.expected_pins,
      input_sha256: {
        ...targetBearing.expected_pins.input_sha256,
        [targetBearing.future_feature_package.input_id]:
          targetBearing.future_feature_package.content_sha256,
      },
    };
    targetBearing.scoring_reconciliation = {
      ...targetBearing.scoring_reconciliation,
      source_input_sha256s: [
        targetBearing.historical_training_package.content_sha256,
        targetBearing.future_feature_package.content_sha256,
      ].sort(),
    };
    const targetResult = runForwardCandidateService(targetBearing);
    expect(targetResult.ok).toBe(false);
    if (!targetResult.ok) {
      expect(targetResult.errors.map((entry) => entry.code)).toContain(
        'FORWARD_INFERENCE_ROWS_INVALID',
      );
    }
  });

  it.each([
    {
      label: 'top-level input season',
      mutate: (input: ReturnType<typeof makeSyntheticForwardRuntimeInput>) => {
        input.future_feature_package.content.payload.rows[0].input_season =
          input.input_season - 1;
      },
      code: 'FORWARD_INFERENCE_INPUT_SEASON_MISMATCH',
    },
    {
      label: 'pinned census position',
      mutate: (input: ReturnType<typeof makeSyntheticForwardRuntimeInput>) => {
        input.future_feature_package.content.payload.rows[0].position = 'QB';
      },
      code: 'FORWARD_INFERENCE_CENSUS_POSITION_MISMATCH',
    },
  ])('rejects a future feature row that disagrees with its $label', ({
    mutate,
    code,
  }) => {
    const input = makeSyntheticForwardRuntimeInput();
    mutate(input);
    repinFutureFeaturePackage(input);

    const result = runForwardCandidateService(input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.map((entry) => entry.code)).toContain(code);
    }
  });

  it.each([
    'historical_training_package',
    'future_feature_package',
  ] as const)('rejects feature-admission drift in %s', (packageKey) => {
    const input = makeSyntheticForwardRuntimeInput();
    input[packageKey].feature_names_admitted = [];

    const result = runForwardCandidateService(input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.map((entry) => entry.code)).toContain(
        'FORWARD_FEATURE_ADMISSION_MISMATCH',
      );
    }
  });

  it.each([
    'regular_season_only',
    'forward_outcome_must_be_null',
  ] as const)('runtime-enforces target-definition literal %s', (field) => {
    const input = makeSyntheticForwardRuntimeInput();
    (input.target_definition as unknown as Record<string, unknown>)[field] =
      false;

    const result = runForwardCandidateService(input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.map((entry) => entry.code)).toContain(
        'FORWARD_TARGET_DEFINITION_MISMATCH',
      );
    }
  });
});
