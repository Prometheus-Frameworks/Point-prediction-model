/**
 * Naive, transparent baselines for the seasonal PPR backtest (Issue #49).
 *
 * These set the "dumb baseline" floor the ridge model must beat to justify its
 * existence. They are intentionally trivial and auditable.
 */
import type { ScoringPosition } from '../../contracts/scoring.js';
import type { SeasonalPlayerObservation } from '../../contracts/seasonalPprBacktest.js';

export interface SeasonalBaselineModel {
  name: string;
  description: string;
  predict: (observation: SeasonalPlayerObservation) => number;
}

const average = (values: number[]): number =>
  values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;

/**
 * Naive baseline #1: last year's PPR predicts next year's PPR. No fitting
 * required — it simply echoes the 2024 total.
 */
export const baselinePrevYearPpr = (): SeasonalBaselineModel => ({
  name: 'baseline-prev-year-ppr',
  description: 'Predicts 2025 PPR equal to the player\'s 2024 PPR total (persistence baseline).',
  predict: (observation) => Math.max(0, observation.ppr_2024),
});

/**
 * Naive baseline #2: average 2025 outcome by position, learned from the supplied
 * training rows. Falls back to the overall training mean for unseen positions.
 *
 * Pass the training rows (excluding the row being predicted) to keep the
 * comparison honest under leave-one-out evaluation.
 */
export const baselinePositionMean = (trainRows: SeasonalPlayerObservation[]): SeasonalBaselineModel => {
  const finiteTargets = trainRows.map((row, index) => {
    if (
      typeof row.ppr_2025_actual !== 'number' ||
      !Number.isFinite(row.ppr_2025_actual)
    ) {
      throw new Error(
        `baselinePositionMean requires a finite, non-null target for every training row; row ${index} is invalid.`,
      );
    }
    return row.ppr_2025_actual;
  });

  const overallMean = average(finiteTargets);
  const byPosition = trainRows.reduce<Partial<Record<ScoringPosition, number[]>>>((acc, row, index) => {
    acc[row.position] ??= [];
    acc[row.position]?.push(finiteTargets[index]);
    return acc;
  }, {});

  return {
    name: 'baseline-position-mean',
    description: 'Predicts 2025 PPR as the mean 2025 PPR of all players at the same position (overall mean fallback).',
    predict: (observation) => {
      const positionValues = byPosition[observation.position];
      return positionValues && positionValues.length > 0 ? average(positionValues) : overallMean;
    },
  };
};
