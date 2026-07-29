/**
 * Forecast #168: multi-origin historical evaluation and base configuration
 * freeze for 2026 Forward Run 1.
 *
 * This module implements the operator-approved expanding-window rolling-origin
 * protocol over governed TIBER-Data `player_season_coverage_v0` rows, using the
 * EXACT forward runtime path (`fitSeasonalForwardModel` ->
 * `predictSeasonalForward`) for every fit and prediction, so the evaluated
 * pipeline is byte-for-byte the deployed one.
 *
 * Targets follow the operator scoring-target disposition
 * (docs/decisions/forward-scoring-target-disposition-2026-07-28.md): generic
 * full-PPR totals are DERIVED from the eight governed components with exact
 * integer cent arithmetic (every component is an integral JSON number, verified
 * by TIBER-Data#229), never read from `production_summary.season_ppr`.
 *
 * Scope guards (#168): base production features only; every excluded feature
 * family (trailing player history, Teamstate, role, age, injury, rookie)
 * stays excluded rather than zero-filled; no 2026 population; no
 * forward forecast emission. The final held-out evaluation pair (2024 inputs ->
 * 2025 targets) is structurally unreachable during lambda selection: the
 * selection API only accepts a validated three-pair package that excludes the
 * final pair while supplying the two pinned selection evaluations.
 */
import {
  fitSeasonalForwardModel,
  predictSeasonalForward,
  sha256ForwardCanonicalValue,
  validateFrozenForwardRidgeConfiguration,
  FORWARD_RIDGE_CONFIGURATION_SCHEMA_VERSION,
  HISTORICAL_FORWARD_TRAINING_ROW_SCHEMA_VERSION,
  FUTURE_FORWARD_INFERENCE_ROW_SCHEMA_VERSION,
  type FittedSeasonalForwardRidgeArtifactV1,
  type FrozenForwardRidgeConfigurationPackageV1,
  type FrozenForwardRidgeConfigurationV1,
  type HistoricalForwardTrainingRowV1,
  type FutureForwardInferenceRowV1,
} from '../../models/seasonal/forwardRidgeModel.js';
import {
  summarizeSeasonalErrors,
  summarizeSeasonalErrorsByPosition,
  type ScoredPair,
} from '../../datasets/seasonal/evaluateSeasonalPpr.js';
import type { SeasonalPprErrorSummary } from '../../contracts/seasonalPprBacktest.js';
import type { ScoringPosition } from '../../contracts/scoring.js';

export const FORWARD_BASE_EVAL_SOURCE_ARTIFACT_PATH =
  'exports/promoted/nfl/player_season_coverage_v0.json' as const;
export const FORWARD_BASE_EVAL_SOURCE_SHA256 =
  'd45f612b207085df00b4b080e4f55ce1abbd060dcbf30b0bee777ff833ddd8ac' as const;
export const FORWARD_BASE_EVAL_SOURCE_REPOSITORY =
  'Prometheus-Frameworks/TIBER-Data' as const;
export const FORWARD_BASE_EVAL_SOURCE_COMMIT =
  '3393a8f0b7f4ffa640f63d712768beb1c52b917a' as const;
export const FORWARD_BASE_EVAL_SCORING_PROFILE_SHA256 =
  'a368b75bf5503558a4f664e0486e2c3cc75c01004d4527fd29ecaa1e247a6274' as const;
export const FORWARD_BASE_EVAL_DATA_CONTRACT_SHA256 =
  '6542e32ffba6446d982c8459e7a81187e7970cb6ef1a74e76be5d35edd26dd98' as const;

/** Pinned before any evaluation ran (recorded on issue #168). */
export const FORWARD_BASE_EVAL_LAMBDA_CANDIDATES = [0.1, 1, 10, 100] as const;

/** Logical input id the future #170 feature package must carry. */
export const FORWARD_BASE_FEATURE_SOURCE_INPUT_ID =
  'tiber-data-player-season-coverage-v0-features' as const;

export const FORWARD_BASE_EVAL_POSITIONS = ['QB', 'RB', 'WR', 'TE'] as const;

const SUPPORTED_POSITIONS: readonly string[] = FORWARD_BASE_EVAL_POSITIONS;

/**
 * Scoring components in cent-weight space. Every component is an integral JSON
 * number in the governed source, so `sum(component * centWeight)` is EXACT
 * integer arithmetic — no floating-point rounding can occur and the cent-scale
 * ROUND_HALF_UP quantization required by the scoring-target disposition is a
 * structural no-op.
 */
const COMPONENT_CENT_WEIGHTS = [
  { component: 'receptions', path: ['usage_summary', 'receptions'], centWeight: 100 },
  { component: 'receiving_yards', path: ['production_summary', 'receiving', 'receiving_yards'], centWeight: 10 },
  { component: 'receiving_tds', path: ['production_summary', 'receiving', 'receiving_tds'], centWeight: 600 },
  { component: 'rushing_yards', path: ['production_summary', 'rushing', 'rushing_yards'], centWeight: 10 },
  { component: 'rushing_tds', path: ['production_summary', 'rushing', 'rushing_tds'], centWeight: 600 },
  { component: 'passing_yards', path: ['production_summary', 'passing', 'passing_yards'], centWeight: 4 },
  { component: 'passing_tds', path: ['production_summary', 'passing', 'passing_tds'], centWeight: 400 },
  { component: 'interceptions', path: ['production_summary', 'passing', 'interceptions'], centWeight: -200 },
] as const;

export class ForwardBaseEvalBuildError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ForwardBaseEvalBuildError';
  }
}

const readPath = (row: Record<string, unknown>, path: readonly string[]): unknown => {
  let value: unknown = row;
  for (const key of path) {
    if (typeof value !== 'object' || value === null) return undefined;
    value = (value as Record<string, unknown>)[key];
  }
  return value;
};

const readIntegralComponent = (
  row: Record<string, unknown>,
  path: readonly string[],
  where: string,
): number => {
  const value = readPath(row, path);
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) {
    throw new ForwardBaseEvalBuildError(
      `${where}: ${path.join('.')} must be an integral finite JSON number; malformed governed numerics stop the build.`,
    );
  }
  return value;
};

/** Exact derived generic full-PPR total in integer cents. */
export const deriveGenericPprCents = (
  row: Record<string, unknown>,
  where: string,
): number =>
  COMPONENT_CENT_WEIGHTS.reduce(
    (cents, spec) => cents + spec.centWeight * readIntegralComponent(row, spec.path, where),
    0,
  );

export const centsToPoints = (cents: number): number => cents / 100;

export interface ForwardBaseEvalSourceRow {
  player_id: string;
  player_name: string;
  input_season: number;
  target_season: number;
  position: ScoringPosition;
  input_season_completeness: string;
  target_season_completeness: string;
  features: {
    previous_season_derived_ppr: number;
    previous_season_ppr_per_game: number;
    previous_season_games_played: number;
    previous_season_targets: number;
    previous_season_rush_attempts: number;
  };
  /** Derived-component generic PPR of the target season, exact cents / 100. */
  target_derived_ppr: number;
  /** Promoted source total retained as provenance only; never a target. */
  target_source_season_ppr: number;
}

export interface ForwardBaseEvalPairExclusions {
  input_rows_without_target_row: number;
  target_rows_without_input_row: number;
  input_rows_unsupported_position: number;
  excluded_player_ids_input_without_target: string[];
  excluded_player_ids_target_without_input: string[];
}

export interface ForwardBaseEvalPairPackage {
  pair_id: string;
  input_season: number;
  target_season: number;
  row_count: number;
  rows: ForwardBaseEvalSourceRow[];
  exclusions: ForwardBaseEvalPairExclusions;
  input_completeness_counts: Record<string, number>;
  target_completeness_counts: Record<string, number>;
}

export interface ForwardBaseEvalOriginPackages {
  artifact_id: 'forward_base_eval_origin_pairs_v1';
  generated_at: string;
  source: {
    repository: typeof FORWARD_BASE_EVAL_SOURCE_REPOSITORY;
    commit: typeof FORWARD_BASE_EVAL_SOURCE_COMMIT;
    path: typeof FORWARD_BASE_EVAL_SOURCE_ARTIFACT_PATH;
    sha256: typeof FORWARD_BASE_EVAL_SOURCE_SHA256;
    scoring_target_rule: 'derived_component_generic_ppr_exact_integer_cents';
    scoring_profile_sha256: typeof FORWARD_BASE_EVAL_SCORING_PROFILE_SHA256;
    component_binding_contract_sha256: typeof FORWARD_BASE_EVAL_DATA_CONTRACT_SHA256;
  };
  pairs: ForwardBaseEvalPairPackage[];
}

/**
 * The only season-pair packages selection is permitted to observe. The final
 * 2024->2025 held-out pair is deliberately absent from this type and is
 * rejected by the runtime validator before any selection evaluation starts.
 */
export const FORWARD_BASE_EVAL_SELECTION_PAIR_IDS = [
  'pair-2021-2022',
  'pair-2022-2023',
  'pair-2023-2024',
] as const;

export interface ForwardBaseSelectionOriginPackages
  extends Omit<ForwardBaseEvalOriginPackages, 'pairs'> {
  pairs: [
    ForwardBaseEvalPairPackage,
    ForwardBaseEvalPairPackage,
    ForwardBaseEvalPairPackage,
  ];
}

type ForwardBaseEvaluationOriginPackages = Pick<ForwardBaseEvalOriginPackages, 'pairs'>;

/**
 * Validate an already-isolated selection package. A complete origin package is
 * rejected by length before any pair object is inspected, so callers cannot
 * accidentally expose held-out pair bytes by casting around the TypeScript
 * boundary.
 */
export const validateForwardBaseSelectionOriginPackages = (
  value: unknown,
): ForwardBaseSelectionOriginPackages => {
  if (typeof value !== 'object' || value === null) {
    throw new ForwardBaseEvalBuildError('selection origin packages must be an object.');
  }
  const candidate = value as Record<string, unknown>;
  if (!Array.isArray(candidate.pairs)) {
    throw new ForwardBaseEvalBuildError('selection origin packages must contain a pairs array.');
  }
  if (candidate.pairs.length !== FORWARD_BASE_EVAL_SELECTION_PAIR_IDS.length) {
    throw new ForwardBaseEvalBuildError(
      `selection origin packages must contain exactly ${FORWARD_BASE_EVAL_SELECTION_PAIR_IDS.length} pairs and may not expose the final held-out pair.`,
    );
  }
  const actualIds = candidate.pairs.map((pair, index) => {
    if (typeof pair !== 'object' || pair === null || typeof pair.pair_id !== 'string') {
      throw new ForwardBaseEvalBuildError(`selection origin packages pair ${index} is malformed.`);
    }
    return pair.pair_id;
  });
  if (
    actualIds.some(
      (pairId, index) => pairId !== FORWARD_BASE_EVAL_SELECTION_PAIR_IDS[index],
    )
  ) {
    throw new ForwardBaseEvalBuildError(
      `selection origin package ids must be exactly ${FORWARD_BASE_EVAL_SELECTION_PAIR_IDS.join(', ')}; got ${actualIds.join(', ')}.`,
    );
  }
  if (
    candidate.artifact_id !== 'forward_base_eval_origin_pairs_v1' ||
    typeof candidate.generated_at !== 'string' ||
    typeof candidate.source !== 'object' ||
    candidate.source === null
  ) {
    throw new ForwardBaseEvalBuildError(
      'selection origin packages must preserve the governed origin-package identity.',
    );
  }
  return candidate as unknown as ForwardBaseSelectionOriginPackages;
};

/**
 * Create the sealed selection view without reading the held-out pair object.
 * `slice(0, 3)` copies only the three permitted array elements; the resulting
 * package then passes the exact runtime validator above.
 */
export const buildForwardBaseSelectionOriginPackages = (
  packages: ForwardBaseEvalOriginPackages,
): ForwardBaseSelectionOriginPackages =>
  validateForwardBaseSelectionOriginPackages({
    artifact_id: packages.artifact_id,
    generated_at: packages.generated_at,
    source: packages.source,
    pairs: packages.pairs.slice(0, FORWARD_BASE_EVAL_SELECTION_PAIR_IDS.length),
  });

interface MinimalCoverageRow extends Record<string, unknown> {
  player_id: string;
  player_name: string;
  season: number;
  position: string;
  games_played: number;
  coverage_status: string;
}

const asCoverageRow = (value: unknown, index: number): MinimalCoverageRow => {
  if (typeof value !== 'object' || value === null) {
    throw new ForwardBaseEvalBuildError(`source row ${index} is not an object.`);
  }
  const row = value as Record<string, unknown>;
  if (
    typeof row.player_id !== 'string' ||
    typeof row.player_name !== 'string' ||
    typeof row.season !== 'number' ||
    typeof row.position !== 'string' ||
    typeof row.coverage_status !== 'string' ||
    typeof row.games_played !== 'number' ||
    !Number.isInteger(row.games_played)
  ) {
    throw new ForwardBaseEvalBuildError(`source row ${index} is missing required identity/coverage fields.`);
  }
  return row as MinimalCoverageRow;
};

const readFiniteNumber = (
  row: Record<string, unknown>,
  path: readonly string[],
  where: string,
): number => {
  const value = readPath(row, path);
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ForwardBaseEvalBuildError(`${where}: ${path.join('.')} must be a finite JSON number.`);
  }
  return value;
};

export const FORWARD_BASE_EVAL_PAIR_SEASONS: ReadonlyArray<{
  input_season: number;
  target_season: number;
}> = [
  { input_season: 2021, target_season: 2022 },
  { input_season: 2022, target_season: 2023 },
  { input_season: 2023, target_season: 2024 },
  { input_season: 2024, target_season: 2025 },
];

/**
 * Build all season-pair packages from parsed governed coverage rows. Rows are
 * config-agnostic source evidence; runtime training/inference rows are stamped
 * later against an exact frozen configuration.
 */
export const buildOriginPairPackages = (
  coverageRows: readonly unknown[],
  generatedAt: string,
): ForwardBaseEvalOriginPackages => {
  const rows = coverageRows.map(asCoverageRow);
  const bySeason = new Map<number, Map<string, MinimalCoverageRow>>();
  for (const row of rows) {
    const season = bySeason.get(row.season) ?? new Map<string, MinimalCoverageRow>();
    if (season.has(row.player_id)) {
      throw new ForwardBaseEvalBuildError(
        `duplicate governed row for player ${row.player_id} season ${row.season}.`,
      );
    }
    season.set(row.player_id, row);
    bySeason.set(row.season, season);
  }

  const pairs = FORWARD_BASE_EVAL_PAIR_SEASONS.map(({ input_season, target_season }) => {
    const inputRows = bySeason.get(input_season) ?? new Map<string, MinimalCoverageRow>();
    const targetRows = bySeason.get(target_season) ?? new Map<string, MinimalCoverageRow>();
    if (inputRows.size === 0 || targetRows.size === 0) {
      throw new ForwardBaseEvalBuildError(
        `pair ${input_season}->${target_season} cannot be built: a governed season slice is empty.`,
      );
    }

    const pairRows: ForwardBaseEvalSourceRow[] = [];
    const inputWithoutTarget: string[] = [];
    const unsupportedPosition: string[] = [];
    for (const [playerId, inputRow] of inputRows) {
      if (!SUPPORTED_POSITIONS.includes(inputRow.position)) {
        unsupportedPosition.push(playerId);
        continue;
      }
      const targetRow = targetRows.get(playerId);
      if (!targetRow) {
        inputWithoutTarget.push(playerId);
        continue;
      }
      const where = `pair ${input_season}->${target_season} player ${playerId}`;
      const inputPprCents = deriveGenericPprCents(inputRow, `${where} input`);
      const targetPprCents = deriveGenericPprCents(targetRow, `${where} target`);
      const games = inputRow.games_played;
      pairRows.push({
        player_id: playerId,
        player_name: inputRow.player_name,
        input_season,
        target_season,
        position: inputRow.position as ScoringPosition,
        input_season_completeness: inputRow.coverage_status,
        target_season_completeness: targetRow.coverage_status,
        features: {
          previous_season_derived_ppr: centsToPoints(inputPprCents),
          previous_season_ppr_per_game:
            games > 0 ? centsToPoints(inputPprCents) / games : 0,
          previous_season_games_played: games,
          previous_season_targets: readFiniteNumber(inputRow, ['usage_summary', 'targets'], where),
          previous_season_rush_attempts: readFiniteNumber(
            inputRow,
            ['production_summary', 'rushing', 'rushing_attempts'],
            where,
          ),
        },
        target_derived_ppr: centsToPoints(targetPprCents),
        target_source_season_ppr: readFiniteNumber(
          targetRow,
          ['production_summary', 'season_ppr'],
          where,
        ),
      });
    }
    const targetWithoutInput = [...targetRows.keys()]
      .filter((playerId) => !inputRows.has(playerId))
      .sort();
    pairRows.sort((left, right) => (left.player_id < right.player_id ? -1 : 1));

    const completenessCounts = (
      selector: (row: ForwardBaseEvalSourceRow) => string,
    ): Record<string, number> => {
      const counts: Record<string, number> = {};
      for (const row of pairRows) counts[selector(row)] = (counts[selector(row)] ?? 0) + 1;
      return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => (a < b ? -1 : 1)));
    };

    return {
      pair_id: `pair-${input_season}-${target_season}`,
      input_season,
      target_season,
      row_count: pairRows.length,
      rows: pairRows,
      exclusions: {
        input_rows_without_target_row: inputWithoutTarget.length,
        target_rows_without_input_row: targetWithoutInput.length,
        input_rows_unsupported_position: unsupportedPosition.length,
        excluded_player_ids_input_without_target: inputWithoutTarget.sort(),
        excluded_player_ids_target_without_input: targetWithoutInput,
      },
      input_completeness_counts: completenessCounts((row) => row.input_season_completeness),
      target_completeness_counts: completenessCounts((row) => row.target_season_completeness),
    };
  });

  return {
    artifact_id: 'forward_base_eval_origin_pairs_v1',
    generated_at: generatedAt,
    source: {
      repository: FORWARD_BASE_EVAL_SOURCE_REPOSITORY,
      commit: FORWARD_BASE_EVAL_SOURCE_COMMIT,
      path: FORWARD_BASE_EVAL_SOURCE_ARTIFACT_PATH,
      sha256: FORWARD_BASE_EVAL_SOURCE_SHA256,
      scoring_target_rule: 'derived_component_generic_ppr_exact_integer_cents',
      scoring_profile_sha256: FORWARD_BASE_EVAL_SCORING_PROFILE_SHA256,
      component_binding_contract_sha256: FORWARD_BASE_EVAL_DATA_CONTRACT_SHA256,
    },
    pairs,
  };
};

const FEATURE_DEFINITIONS = [
  {
    name: 'previous_season_derived_ppr',
    source_field: 'derived_component_generic_ppr(previous_season)',
    transform_id: 'derived_component_generic_ppr_exact_cents_v1',
  },
  {
    name: 'previous_season_ppr_per_game',
    source_field: 'derived_component_generic_ppr(previous_season)/games_played',
    transform_id: 'derived_ppr_per_game_zero_when_no_games_v1',
  },
  {
    name: 'previous_season_games_played',
    source_field: 'games_played',
    transform_id: 'identity_numeric_v1',
  },
  {
    name: 'previous_season_targets',
    source_field: 'usage_summary.targets',
    transform_id: 'identity_numeric_v1',
  },
  {
    name: 'previous_season_rush_attempts',
    source_field: 'production_summary.rushing.rushing_attempts',
    transform_id: 'identity_numeric_v1',
  },
] as const;

export const buildCandidateConfiguration = (
  lambda: number,
): FrozenForwardRidgeConfigurationPackageV1 => {
  const configuration: FrozenForwardRidgeConfigurationV1 = {
    configuration_schema_version: FORWARD_RIDGE_CONFIGURATION_SCHEMA_VERSION,
    configuration_id: `forward-base-configuration-v1-lambda-${String(lambda).replace('.', 'p')}`,
    feature_set_id: 'forward-base-production-features-v1',
    feature_admission_decision_id: 'forecast-168-operator-base-feature-scope',
    feature_admission_evidence_sha256: sha256ForwardCanonicalValue(FEATURE_DEFINITIONS),
    model_id: 'seasonal-forward-ridge-base',
    model_version: 'forward-base-eval-v1',
    ordered_numeric_features: FEATURE_DEFINITIONS.map((feature) => ({
      name: feature.name,
      source_input_id: FORWARD_BASE_FEATURE_SOURCE_INPUT_ID,
      source_field: feature.source_field,
      transform_id: feature.transform_id,
      missingness_policy: 'reject_row',
    })),
    position_levels: [...FORWARD_BASE_EVAL_POSITIONS],
    position_reference_level: 'TE',
    lambda,
    clamp: { kind: 'minimum', minimum: 0 },
    software_version: 'forward-base-eval-v1',
  };
  const packageValue: FrozenForwardRidgeConfigurationPackageV1 = {
    configuration_sha256: sha256ForwardCanonicalValue(configuration),
    configuration,
  };
  const validation = validateFrozenForwardRidgeConfiguration(packageValue);
  if (!validation.ok) {
    throw new ForwardBaseEvalBuildError(
      `candidate configuration failed runtime validation: ${validation.errors.join('; ')}`,
    );
  }
  return packageValue;
};

const toTrainingRow = (
  row: ForwardBaseEvalSourceRow,
  configurationSha256: string,
): HistoricalForwardTrainingRowV1 => ({
  row_schema_version: HISTORICAL_FORWARD_TRAINING_ROW_SCHEMA_VERSION,
  row_kind: 'historical_forward_training',
  historical_row_id: `${row.input_season}-${row.target_season}|${row.player_id}`,
  historical_origin_id: `origin-${row.input_season}-${row.target_season}`,
  input_season: row.input_season,
  target_season: row.target_season,
  configuration_sha256: configurationSha256,
  position: row.position,
  source_features: { ...row.features },
  source_missingness: {
    previous_season_derived_ppr: false,
    previous_season_ppr_per_game: false,
    previous_season_games_played: false,
    previous_season_targets: false,
    previous_season_rush_attempts: false,
  },
  target: row.target_derived_ppr,
});

export interface ForwardBaseEvaluationDefinition {
  eval_id: string;
  /** Season pairs whose labeled rows train the fit; all target seasons precede the eval target. */
  training_pair_ids: readonly string[];
  /** The pair providing inputs (features) and held-aside actuals (scoring). */
  evaluation_pair_id: string;
}

export interface ForwardBaseModelEvaluationResult {
  eval_id: string;
  lambda: number;
  configuration_sha256: string;
  training_row_count: number;
  scored_row_count: number;
  fitted_model: FittedSeasonalForwardRidgeArtifactV1;
  model: {
    overall: SeasonalPprErrorSummary;
    by_position: Partial<Record<ScoringPosition, SeasonalPprErrorSummary>>;
  };
  baselines: {
    position_mean: { overall: SeasonalPprErrorSummary; by_position: Partial<Record<ScoringPosition, SeasonalPprErrorSummary>> };
    previous_season_ppr: { overall: SeasonalPprErrorSummary; by_position: Partial<Record<ScoringPosition, SeasonalPprErrorSummary>> };
  };
  model_minus_best_baseline_mae: number;
}

const summarize = (pairs: ScoredPair[]) => ({
  overall: summarizeSeasonalErrors(pairs),
  by_position: summarizeSeasonalErrorsByPosition(pairs),
});

/**
 * One expanding-window evaluation through the exact forward runtime path. The
 * fitted target season equals the evaluation pair's target season, so training
 * rows (all earlier targets) and inference rows (evaluation-pair inputs) pass
 * the runtime's own season-ordering validators with true, unshifted semantics.
 */
export const runForwardBaseEvaluation = (
  packages: ForwardBaseEvaluationOriginPackages,
  definition: ForwardBaseEvaluationDefinition,
  configurationPackage: FrozenForwardRidgeConfigurationPackageV1,
): ForwardBaseModelEvaluationResult => {
  const pairById = new Map(packages.pairs.map((pair) => [pair.pair_id, pair]));
  const evaluationPair = pairById.get(definition.evaluation_pair_id);
  if (!evaluationPair) {
    throw new ForwardBaseEvalBuildError(`unknown evaluation pair ${definition.evaluation_pair_id}.`);
  }
  const trainingPairs = definition.training_pair_ids.map((pairId) => {
    const pair = pairById.get(pairId);
    if (!pair) throw new ForwardBaseEvalBuildError(`unknown training pair ${pairId}.`);
    if (pair.target_season >= evaluationPair.target_season) {
      throw new ForwardBaseEvalBuildError(
        `training pair ${pairId} target season ${pair.target_season} would leak into evaluation target ${evaluationPair.target_season}.`,
      );
    }
    return pair;
  });
  if (trainingPairs.length === 0) {
    throw new ForwardBaseEvalBuildError(`evaluation ${definition.eval_id} has no training pairs.`);
  }

  const configurationSha256 = configurationPackage.configuration_sha256;
  const trainingRows = trainingPairs
    .flatMap((pair) => pair.rows)
    .map((row) => toTrainingRow(row, configurationSha256));

  const fit = fitSeasonalForwardModel({
    rows: trainingRows,
    frozenConfiguration: configurationPackage,
    finalFitTargetSeason: evaluationPair.target_season,
  });
  if (!fit.ok) {
    throw new ForwardBaseEvalBuildError(
      `evaluation ${definition.eval_id} fit failed closed: ${fit.errors.join('; ')}`,
    );
  }

  const inputPackageSha256 = sha256ForwardCanonicalValue({
    eval_id: definition.eval_id,
    evaluation_pair_id: evaluationPair.pair_id,
    rows: evaluationPair.rows.map((row) => ({ player_id: row.player_id, features: row.features })),
  });
  const censusSha256 = sha256ForwardCanonicalValue(
    evaluationPair.rows.map((row) => row.player_id),
  );
  const pins = {
    run_id: definition.eval_id,
    configuration_sha256: configurationSha256,
    input_package_sha256: inputPackageSha256,
    census_sha256: censusSha256,
    target_season: evaluationPair.target_season,
  };

  const modelPairs: ScoredPair[] = [];
  const positionMeanPairs: ScoredPair[] = [];
  const previousSeasonPairs: ScoredPair[] = [];

  // Train-fold-only baseline statistics (never from evaluation actuals).
  const targetsByPosition = new Map<string, number[]>();
  for (const row of trainingRows) {
    const bucket = targetsByPosition.get(row.position) ?? [];
    bucket.push(row.target);
    targetsByPosition.set(row.position, bucket);
  }
  const overallTrainingMean =
    trainingRows.reduce((sum, row) => sum + row.target, 0) / trainingRows.length;
  const positionMean = (position: string): number => {
    const bucket = targetsByPosition.get(position);
    if (!bucket || bucket.length === 0) return overallTrainingMean;
    return bucket.reduce((sum, value) => sum + value, 0) / bucket.length;
  };

  for (const row of evaluationPair.rows) {
    const inferenceRow: FutureForwardInferenceRowV1 = {
      row_schema_version: FUTURE_FORWARD_INFERENCE_ROW_SCHEMA_VERSION,
      row_kind: 'future_forward_inference',
      population_row_id: row.player_id,
      run_id: definition.eval_id,
      configuration_sha256: configurationSha256,
      input_package_sha256: inputPackageSha256,
      census_sha256: censusSha256,
      input_season: row.input_season,
      target_season: row.target_season,
      position: row.position,
      source_features: { ...row.features },
      source_missingness: {
        previous_season_derived_ppr: false,
        previous_season_ppr_per_game: false,
        previous_season_games_played: false,
        previous_season_targets: false,
        previous_season_rush_attempts: false,
      },
    };
    const prediction = predictSeasonalForward(fit.data, inferenceRow, pins);
    if (!prediction.ok) {
      throw new ForwardBaseEvalBuildError(
        `evaluation ${definition.eval_id} prediction failed for ${row.player_id}: ${prediction.errors.join('; ')}`,
      );
    }
    const actual = row.target_derived_ppr;
    modelPairs.push({ position: row.position, predicted: prediction.data.point_forecast, actual });
    positionMeanPairs.push({ position: row.position, predicted: positionMean(row.position), actual });
    previousSeasonPairs.push({
      position: row.position,
      predicted: row.features.previous_season_derived_ppr,
      actual,
    });
  }

  const model = summarize(modelPairs);
  const positionMeanSummary = summarize(positionMeanPairs);
  const previousSeasonSummary = summarize(previousSeasonPairs);
  const bestBaselineMae = Math.min(
    positionMeanSummary.overall.mae,
    previousSeasonSummary.overall.mae,
  );

  return {
    eval_id: definition.eval_id,
    lambda: configurationPackage.configuration.lambda,
    configuration_sha256: configurationSha256,
    training_row_count: trainingRows.length,
    scored_row_count: modelPairs.length,
    fitted_model: fit.data,
    model,
    baselines: {
      position_mean: positionMeanSummary,
      previous_season_ppr: previousSeasonSummary,
    },
    model_minus_best_baseline_mae: model.overall.mae - bestBaselineMae,
  };
};

export const FORWARD_BASE_EVAL_SELECTION_DEFINITIONS: readonly ForwardBaseEvaluationDefinition[] = [
  {
    eval_id: 'forward-base-eval-selection-a-2023',
    training_pair_ids: ['pair-2021-2022'],
    evaluation_pair_id: 'pair-2022-2023',
  },
  {
    eval_id: 'forward-base-eval-selection-b-2024',
    training_pair_ids: ['pair-2021-2022', 'pair-2022-2023'],
    evaluation_pair_id: 'pair-2023-2024',
  },
];

export const FORWARD_BASE_EVAL_FINAL_DEFINITION: ForwardBaseEvaluationDefinition = {
  eval_id: 'forward-base-eval-final-2025',
  training_pair_ids: ['pair-2021-2022', 'pair-2022-2023', 'pair-2023-2024'],
  evaluation_pair_id: 'pair-2024-2025',
};

export interface ForwardBaseSelectionSweepEntry {
  lambda: number;
  configuration_sha256: string;
  selection_evaluations: Array<{
    eval_id: string;
    model_mae: number;
    position_mean_mae: number;
    previous_season_mae: number;
  }>;
  mean_selection_mae: number;
}

export interface ForwardBaseSelectionOutcome {
  lambda_candidates: readonly number[];
  sweep: ForwardBaseSelectionSweepEntry[];
  selected_lambda: number;
  selection_rule: 'minimize mean MAE across selection evaluations A and B; ties break to the smaller lambda';
  selection_results: ForwardBaseModelEvaluationResult[];
}

/**
 * Lambda selection over the two selection evaluations ONLY. This function
 * validates a three-pair selection-only package before doing any work, so it has
 * no access to the final held-out pair or definition; the runner freezes the
 * configuration from this outcome before the final evaluation is constructed.
 */
export const runForwardBaseSelectionSweep = (
  packages: ForwardBaseSelectionOriginPackages,
  lambdaCandidates: readonly number[] = FORWARD_BASE_EVAL_LAMBDA_CANDIDATES,
): ForwardBaseSelectionOutcome => {
  const sealedPackages = validateForwardBaseSelectionOriginPackages(packages);
  const sweep: ForwardBaseSelectionSweepEntry[] = [];
  const resultsByLambda = new Map<number, ForwardBaseModelEvaluationResult[]>();
  for (const lambda of lambdaCandidates) {
    const configurationPackage = buildCandidateConfiguration(lambda);
    const results = FORWARD_BASE_EVAL_SELECTION_DEFINITIONS.map((definition) =>
      runForwardBaseEvaluation(sealedPackages, definition, configurationPackage),
    );
    resultsByLambda.set(lambda, results);
    sweep.push({
      lambda,
      configuration_sha256: configurationPackage.configuration_sha256,
      selection_evaluations: results.map((result) => ({
        eval_id: result.eval_id,
        model_mae: result.model.overall.mae,
        position_mean_mae: result.baselines.position_mean.overall.mae,
        previous_season_mae: result.baselines.previous_season_ppr.overall.mae,
      })),
      mean_selection_mae:
        results.reduce((sum, result) => sum + result.model.overall.mae, 0) / results.length,
    });
  }
  let selected = sweep[0];
  for (const entry of sweep.slice(1)) {
    if (
      entry.mean_selection_mae < selected.mean_selection_mae ||
      (entry.mean_selection_mae === selected.mean_selection_mae && entry.lambda < selected.lambda)
    ) {
      selected = entry;
    }
  }
  return {
    lambda_candidates: [...lambdaCandidates],
    sweep,
    selected_lambda: selected.lambda,
    selection_rule:
      'minimize mean MAE across selection evaluations A and B; ties break to the smaller lambda',
    selection_results: resultsByLambda.get(selected.lambda) as ForwardBaseModelEvaluationResult[],
  };
};
