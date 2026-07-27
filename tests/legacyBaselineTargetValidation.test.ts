import { describe, expect, it } from 'vitest';
import type { SeasonalPlayerObservation } from '../src/contracts/seasonalPprBacktest.js';
import { baselineMeanModel } from '../src/datasets/benchmarks/baselineMeanModel.js';
import { baselineRecentTrendModel } from '../src/datasets/benchmarks/baselineRecentTrendModel.js';
import { baselineUsageModel } from '../src/datasets/benchmarks/baselineUsageModel.js';
import { historicalSampleDataset } from '../src/datasets/examples/historicalSampleDataset.js';
import { baselinePositionMean } from '../src/models/seasonal/seasonalPprBaselines.js';
import { prepareTrainingMatrix } from '../src/models_ml/training/prepareTrainingMatrix.js';
import { trainWrTeBaselineModel } from '../src/models_ml/training/trainWrTeBaselineModel.js';

const seasonalRow = (
  playerId: string,
  position: SeasonalPlayerObservation['position'],
  target: number | null,
): SeasonalPlayerObservation => ({
  player_id: playerId,
  player_name: playerId,
  position,
  team_2024: 'FIX',
  games_2024: 17,
  ppr_2024: 100,
  receptions_2024: 40,
  targets_2024: 70,
  rush_attempts_2024: 0,
  ppr_2025_actual: target,
});

const weeklyRowsWithTarget = (target: unknown) => {
  const rows = structuredClone(historicalSampleDataset.slice(0, 4));
  (
    rows[1] as unknown as {
      target_fantasy_points_ppr: unknown;
    }
  ).target_fantasy_points_ppr = target;
  return rows;
};

describe('legacy baseline training target boundaries', () => {
  it('preserves valid position means and the unseen-position fallback', () => {
    const model = baselinePositionMean([
      seasonalRow('wr-1', 'WR', 100),
      seasonalRow('wr-2', 'WR', 200),
      seasonalRow('rb-1', 'RB', 60),
    ]);

    expect(model.predict(seasonalRow('wr-target', 'WR', null))).toBe(150);
    expect(model.predict(seasonalRow('qb-target', 'QB', null))).toBe(120);
    expect(baselinePositionMean([]).predict(
      seasonalRow('empty-target', 'TE', null),
    )).toBe(0);
  });

  it.each([
    ['null', null],
    ['NaN', Number.NaN],
    ['positive infinity', Number.POSITIVE_INFINITY],
    ['negative infinity', Number.NEGATIVE_INFINITY],
  ])('baselinePositionMean rejects a %s training target', (_label, target) => {
    expect(() => baselinePositionMean([
      seasonalRow('valid', 'WR', 100),
      seasonalRow('invalid', 'WR', target),
    ])).toThrow(
      'baselinePositionMean requires a finite, non-null target for every training row; row 1 is invalid.',
    );
  });

  it.each([
    ['null', null],
    ['NaN', Number.NaN],
    ['positive infinity', Number.POSITIVE_INFINITY],
    ['negative infinity', Number.NEGATIVE_INFINITY],
  ])('all exported benchmark baseline trainers reject a %s target', (_label, target) => {
    const rows = weeklyRowsWithTarget(target);
    for (const trainer of [
      baselineMeanModel,
      baselineRecentTrendModel,
      baselineUsageModel,
    ]) {
      expect(() => trainer(rows)).toThrow(
        'baselineMeanModel requires a finite, non-null target for every training row; row 1 is invalid.',
      );
    }
  });

  it.each([
    ['null', null],
    ['NaN', Number.NaN],
    ['positive infinity', Number.POSITIVE_INFINITY],
    ['negative infinity', Number.NEGATIVE_INFINITY],
  ])('the learned WR/TE baseline path rejects a %s target before fitting', async (
    _label,
    target,
  ) => {
    const rows = weeklyRowsWithTarget(target);
    expect(() => prepareTrainingMatrix(rows)).toThrow(
      'prepareTrainingMatrix requires a finite, non-null target for every training row; row 1 is invalid.',
    );
    await expect(trainWrTeBaselineModel(rows)).rejects.toThrow(
      'prepareTrainingMatrix requires a finite, non-null target for every training row; row 1 is invalid.',
    );
  });
});
