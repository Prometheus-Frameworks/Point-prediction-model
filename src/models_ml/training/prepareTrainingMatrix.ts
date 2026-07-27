import { wrTeFeatureSchema } from '../../features/schema/wrTeFeatureSchema.js';
import type { WrTeLabeledRow } from '../../datasets/types/labeledRow.js';
import type { WrTeFeatureRow, WrTeFeatureNumericKey } from '../../features/types/featureRow.js';
import type { ModelFeatureSpec, ModelSchema } from '../types/modelArtifact.js';

export interface TrainingMatrix {
  schema: ModelSchema;
  rowIds: string[];
  featureMatrix: number[][];
  targets: number[];
}

const orderedNumericColumns = (): WrTeFeatureNumericKey[] => {
  const grouped = wrTeFeatureSchema.groupedFields;
  const candidates: (keyof WrTeFeatureRow)[] = [
    'season',
    'week',
    ...grouped.usage,
    ...grouped.efficiency,
    ...grouped.teamContext,
    ...grouped.playerArc,
    ...grouped.matchup,
    ...grouped.eventContext,
  ];

  return candidates.filter((column): column is WrTeFeatureNumericKey => typeof ({} as WrTeFeatureRow)[column] !== 'string');
};

const categoricalColumns: Array<keyof WrTeFeatureRow> = ['player_position', 'event_type'];

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

const collectNumericImputationValues = (
  rows: WrTeFeatureRow[],
  numericColumns: WrTeFeatureNumericKey[],
): Record<WrTeFeatureNumericKey, number> => {
  const imputationValues = {} as Record<WrTeFeatureNumericKey, number>;

  for (const column of numericColumns) {
    const values = rows.map((row) => row[column]).filter(isFiniteNumber);
    imputationValues[column] = values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  return imputationValues;
};

const buildSchema = (rows: WrTeFeatureRow[]): ModelSchema => {
  const numericColumns = orderedNumericColumns();
  const imputationValues = collectNumericImputationValues(rows, numericColumns);
  const oneHotFeatures: ModelFeatureSpec[] = categoricalColumns.flatMap((column) => {
    const categories = [...new Set(rows.map((row) => String(row[column])))]
      .filter((value) => value.length > 0)
      .sort();

    return categories.map((category) => ({
      column: String(column),
      kind: 'one-hot' as const,
      category,
    }));
  });

  return {
    featureSchemaVersion: 'wrte-weekly-v1',
    orderedFeatures: [
      ...numericColumns.map((column) => ({
        column,
        kind: 'numeric' as const,
        imputationValue: imputationValues[column],
      })),
      ...oneHotFeatures,
    ],
    categoricalColumns: categoricalColumns.map(String),
    supportedPositions: ['TE', 'WR'],
  };
};

export const vectorizeWrTeFeatureRow = (row: WrTeFeatureRow, schema: ModelSchema): number[] =>
  schema.orderedFeatures.map((feature) => {
    if (feature.kind === 'numeric') {
      const rawValue = row[feature.column as WrTeFeatureNumericKey];
      return isFiniteNumber(rawValue) ? rawValue : feature.imputationValue;
    }

    return String(row[feature.column as keyof WrTeFeatureRow]) === feature.category ? 1 : 0;
  });

export const prepareTrainingMatrix = (rows: WrTeLabeledRow[], schema?: ModelSchema): TrainingMatrix => {
  for (const [index, row] of rows.entries()) {
    if (
      typeof row.target_fantasy_points_ppr !== 'number' ||
      !Number.isFinite(row.target_fantasy_points_ppr)
    ) {
      throw new Error(
        `prepareTrainingMatrix requires a finite, non-null target for every training row; row ${index} is invalid.`,
      );
    }
  }

  const lockedSchema = schema ?? buildSchema(rows);

  return {
    schema: lockedSchema,
    rowIds: rows.map((row) => row.row_id),
    featureMatrix: rows.map((row) => vectorizeWrTeFeatureRow(row, lockedSchema)),
    targets: rows.map((row) => row.target_fantasy_points_ppr),
  };
};
