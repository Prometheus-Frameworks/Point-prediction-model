import type { WrTeLabeledRow } from '../types/labeledRow.js';

export interface BenchmarkModel {
  name: string;
  predict: (row: WrTeLabeledRow) => number;
}

const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

export const baselineMeanModel = (trainRows: WrTeLabeledRow[]): BenchmarkModel => {
  if (trainRows.length === 0) {
    throw new Error('baselineMeanModel requires at least one training row.');
  }
  for (const [index, row] of trainRows.entries()) {
    if (
      typeof row.target_fantasy_points_ppr !== 'number' ||
      !Number.isFinite(row.target_fantasy_points_ppr)
    ) {
      throw new Error(
        `baselineMeanModel requires a finite, non-null target for every training row; row ${index} is invalid.`,
      );
    }
  }

  const overallMean = average(trainRows.map((row) => row.target_fantasy_points_ppr));
  const positionMeans = trainRows.reduce<Partial<Record<WrTeLabeledRow['player_position'], number[]>>>(
    (acc, row) => {
      acc[row.player_position] ??= [];
      acc[row.player_position]?.push(row.target_fantasy_points_ppr);
      return acc;
    },
    {},
  );

  return {
    name: 'baseline-mean',
    predict: (row) => {
      const positionValues = positionMeans[row.player_position];
      return positionValues && positionValues.length > 0 ? average(positionValues) : overallMean;
    },
  };
};
