import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  FORWARD_BASE_EVAL_FINAL_DEFINITION,
  FORWARD_BASE_EVAL_LAMBDA_CANDIDATES,
  FORWARD_BASE_EVAL_SELECTION_DEFINITIONS,
  ForwardBaseEvalBuildError,
  buildCandidateConfiguration,
  buildOriginPairPackages,
  centsToPoints,
  deriveGenericPprCents,
  runForwardBaseEvaluation,
  runForwardBaseSelectionSweep,
  type ForwardBaseEvalOriginPackages,
} from '../src/experiments/forwardBaseEval/forwardBaseEvaluation.js';
import { validateFrozenForwardRidgeConfiguration } from '../src/models/seasonal/forwardRidgeModel.js';
import { canonicalForwardJsonBytes } from '../src/serialization/canonicalForwardArtifacts.js';

const repoRoot = path.resolve(import.meta.dirname, '..');
const GENERATED_AT = '2026-07-28T12:00:00.000Z';

const coverageRow = (
  playerId: string,
  season: number,
  position: string,
  overrides: Partial<{
    receptions: number;
    receiving_yards: number;
    receiving_tds: number;
    rushing_attempts: number;
    rushing_yards: number;
    rushing_tds: number;
    passing_yards: number;
    passing_tds: number;
    interceptions: number;
    targets: number;
    games_played: number;
    season_ppr: number;
    coverage_status: string;
  }> = {},
) => ({
  player_id: playerId,
  player_name: `Synthetic ${playerId}`,
  season,
  position,
  games_played: overrides.games_played ?? 16,
  coverage_status: overrides.coverage_status ?? 'full_season',
  usage_summary: {
    receptions: overrides.receptions ?? 50,
    targets: overrides.targets ?? 70,
  },
  production_summary: {
    season_ppr: overrides.season_ppr ?? 180.5,
    receiving: {
      receiving_yards: overrides.receiving_yards ?? 600,
      receiving_tds: overrides.receiving_tds ?? 4,
    },
    rushing: {
      rushing_attempts: overrides.rushing_attempts ?? 20,
      rushing_yards: overrides.rushing_yards ?? 90,
      rushing_tds: overrides.rushing_tds ?? 1,
    },
    passing: {
      passing_yards: overrides.passing_yards ?? 0,
      passing_tds: overrides.passing_tds ?? 0,
      interceptions: overrides.interceptions ?? 0,
    },
  },
});

/** Full synthetic 2021-2025 population large enough for every pair fit. */
const syntheticCoverage = (): unknown[] => {
  const rows: unknown[] = [];
  const positions = ['QB', 'RB', 'WR', 'TE'] as const;
  for (let season = 2021; season <= 2025; season += 1) {
    for (let index = 0; index < 12; index += 1) {
      rows.push(
        coverageRow(`syn-${String(index).padStart(2, '0')}`, season, positions[index % 4], {
          receptions: 30 + index * 5 + (season % 7),
          receiving_yards: 400 + index * 60 + season,
          receiving_tds: index % 5,
          rushing_attempts: index * 9,
          rushing_yards: index * 30,
          rushing_tds: index % 3,
          passing_yards: index % 4 === 0 ? 3200 + index * 100 : 0,
          passing_tds: index % 4 === 0 ? 20 + index : 0,
          interceptions: index % 4 === 0 ? 8 : 0,
          targets: 40 + index * 7,
          games_played: 12 + (index % 6),
        }),
      );
    }
  }
  return rows;
};

describe('derived-component generic PPR (exact integer cents)', () => {
  it('matches the profile weights exactly, including negative interception weight', () => {
    const row = coverageRow('p', 2024, 'QB', {
      receptions: 3,
      receiving_yards: 17,
      receiving_tds: 1,
      rushing_attempts: 5,
      rushing_yards: 33,
      rushing_tds: 2,
      passing_yards: 4123,
      passing_tds: 31,
      interceptions: 9,
    });
    // 3*100 + 17*10 + 1*600 + 33*10 + 2*600 + 4123*4 + 31*400 - 9*200 = 29_692 cents
    expect(deriveGenericPprCents(row, 'test')).toBe(29_692);
    expect(centsToPoints(29_692)).toBe(296.92);
  });

  it('is exact where naive float weights would round-drift', () => {
    // 0.1 * 3 = 0.30000000000000004 in floats; cent arithmetic must be exact.
    const row = coverageRow('p', 2024, 'WR', {
      receptions: 0, receiving_yards: 3, receiving_tds: 0, rushing_attempts: 0,
      rushing_yards: 0, rushing_tds: 0, passing_yards: 0, passing_tds: 0, interceptions: 0,
    });
    expect(deriveGenericPprCents(row, 'test')).toBe(30);
    expect(centsToPoints(30)).toBe(0.3);
  });

  it('stops the build on non-integral or missing governed components', () => {
    const fractional = coverageRow('p', 2024, 'WR', { receiving_yards: 3.5 as unknown as number });
    expect(() => deriveGenericPprCents(fractional, 'test')).toThrow(ForwardBaseEvalBuildError);
    const missing = coverageRow('p', 2024, 'WR');
    delete (missing.production_summary.passing as Record<string, unknown>).interceptions;
    expect(() => deriveGenericPprCents(missing, 'test')).toThrow(ForwardBaseEvalBuildError);
  });
});

describe('origin pair packages', () => {
  it('builds all four pairs with row-preserving exclusion ledgers', () => {
    const rows = syntheticCoverage();
    // One player with a 2021 row but no 2022 row (input-without-target),
    // one with a 2022 row but no 2021 row (target-without-input),
    // one unsupported-position input row.
    rows.push(coverageRow('syn-only-2021', 2021, 'RB'));
    rows.push(coverageRow('syn-only-2022', 2022, 'WR'));
    rows.push(coverageRow('syn-kicker', 2021, 'K'));
    const packages = buildOriginPairPackages(rows, GENERATED_AT);
    expect(packages.pairs.map((pair) => pair.pair_id)).toEqual([
      'pair-2021-2022', 'pair-2022-2023', 'pair-2023-2024', 'pair-2024-2025',
    ]);
    const first = packages.pairs[0];
    expect(first.row_count).toBe(12);
    expect(first.exclusions.input_rows_without_target_row).toBe(1);
    expect(first.exclusions.excluded_player_ids_input_without_target).toEqual(['syn-only-2021']);
    expect(first.exclusions.target_rows_without_input_row).toBe(1);
    expect(first.exclusions.excluded_player_ids_target_without_input).toEqual(['syn-only-2022']);
    expect(first.exclusions.input_rows_unsupported_position).toBe(1);
    // Targets are derived, never the promoted source total.
    for (const row of first.rows) {
      expect(row.target_derived_ppr).not.toBe(row.target_source_season_ppr);
    }
  });

  it('fails closed on duplicate governed rows', () => {
    const rows = syntheticCoverage();
    rows.push(coverageRow('syn-00', 2021, 'QB'));
    expect(() => buildOriginPairPackages(rows, GENERATED_AT)).toThrow(/duplicate governed row/);
  });
});

describe('candidate configuration', () => {
  it('validates under the forward runtime and pins lambda into the hash', () => {
    const config01 = buildCandidateConfiguration(0.1);
    const config1 = buildCandidateConfiguration(1);
    expect(validateFrozenForwardRidgeConfiguration(config01).ok).toBe(true);
    expect(config01.configuration_sha256).not.toBe(config1.configuration_sha256);
    expect(config01.configuration.ordered_numeric_features.map((f) => f.missingness_policy))
      .toEqual(['reject_row', 'reject_row', 'reject_row', 'reject_row', 'reject_row']);
  });
});

describe('evaluation protocol boundaries', () => {
  const packages = buildOriginPairPackages(syntheticCoverage(), GENERATED_AT);

  it('rejects a training pair whose target season reaches the evaluation target', () => {
    const config = buildCandidateConfiguration(1);
    expect(() =>
      runForwardBaseEvaluation(
        packages,
        {
          eval_id: 'leaky',
          training_pair_ids: ['pair-2023-2024'],
          evaluation_pair_id: 'pair-2023-2024',
        },
        config,
      ),
    ).toThrow(/leak/);
    expect(() =>
      runForwardBaseEvaluation(
        packages,
        {
          eval_id: 'leaky-2',
          training_pair_ids: ['pair-2024-2025'],
          evaluation_pair_id: 'pair-2023-2024',
        },
        config,
      ),
    ).toThrow(/leak/);
  });

  it('selection never touches the final held-out pair', () => {
    // Structural assertion on the pinned definitions...
    const finalPair = FORWARD_BASE_EVAL_FINAL_DEFINITION.evaluation_pair_id;
    for (const definition of FORWARD_BASE_EVAL_SELECTION_DEFINITIONS) {
      expect(definition.evaluation_pair_id).not.toBe(finalPair);
      expect(definition.training_pair_ids).not.toContain(finalPair);
    }
    // ...and an executable one: the sweep succeeds on packages where the final
    // pair does not exist at all, proving it cannot be read during selection.
    const withoutFinal: ForwardBaseEvalOriginPackages = {
      ...packages,
      pairs: packages.pairs.filter((pair) => pair.pair_id !== finalPair),
    };
    const outcome = runForwardBaseSelectionSweep(withoutFinal, [1, 10]);
    expect(outcome.sweep).toHaveLength(2);
    expect(() =>
      runForwardBaseEvaluation(withoutFinal, FORWARD_BASE_EVAL_FINAL_DEFINITION, buildCandidateConfiguration(1)),
    ).toThrow(/unknown evaluation pair/);
  });

  it('baselines are train-fold-only', () => {
    const config = buildCandidateConfiguration(1);
    const result = runForwardBaseEvaluation(
      packages,
      FORWARD_BASE_EVAL_SELECTION_DEFINITIONS[0],
      config,
    );
    // Position-mean baseline prediction must be a mean of TRAINING targets:
    // recompute independently from the training pair and compare via MAE identity.
    const trainingPair = packages.pairs.find((pair) => pair.pair_id === 'pair-2021-2022');
    const evalPair = packages.pairs.find((pair) => pair.pair_id === 'pair-2022-2023');
    if (!trainingPair || !evalPair) throw new Error('fixture pairs missing');
    const byPosition = new Map<string, number[]>();
    for (const row of trainingPair.rows) {
      const bucket = byPosition.get(row.position) ?? [];
      bucket.push(row.target_derived_ppr);
      byPosition.set(row.position, bucket);
    }
    const expectedMae =
      evalPair.rows.reduce((sum, row) => {
        const bucket = byPosition.get(row.position) as number[];
        const mean = bucket.reduce((s, v) => s + v, 0) / bucket.length;
        return sum + Math.abs(mean - row.target_derived_ppr);
      }, 0) / evalPair.rows.length;
    expect(result.baselines.position_mean.overall.mae).toBeCloseTo(expectedMae, 10);
  });

  it('is deterministic: two runs produce byte-identical results', () => {
    const config = buildCandidateConfiguration(1);
    const first = runForwardBaseEvaluation(packages, FORWARD_BASE_EVAL_SELECTION_DEFINITIONS[0], config);
    const second = runForwardBaseEvaluation(packages, FORWARD_BASE_EVAL_SELECTION_DEFINITIONS[0], config);
    expect(canonicalForwardJsonBytes(first).equals(canonicalForwardJsonBytes(second))).toBe(true);
  });
});

describe('committed artifacts', () => {
  const packagesPath = path.join(
    repoRoot,
    'data/experiments/forwardBaseEval/forward_base_eval_origin_pairs_v1.json',
  );
  const committedPackages = JSON.parse(readFileSync(packagesPath, 'utf8')) as ForwardBaseEvalOriginPackages;

  it('committed origin packages carry the pinned governed source and population-scale pairs', () => {
    expect(committedPackages.source.sha256).toBe(
      'd45f612b207085df00b4b080e4f55ce1abbd060dcbf30b0bee777ff833ddd8ac',
    );
    expect(committedPackages.pairs.map((pair) => pair.row_count)).toEqual([472, 440, 438, 452]);
    for (const pair of committedPackages.pairs) {
      expect(pair.row_count).toBe(pair.rows.length);
      const ids = new Set(pair.rows.map((row) => row.player_id));
      expect(ids.size).toBe(pair.row_count);
    }
  });

  it('committed frozen configuration and evaluation report reproduce exactly from committed packages', () => {
    const selection = runForwardBaseSelectionSweep(committedPackages, FORWARD_BASE_EVAL_LAMBDA_CANDIDATES);
    const frozen = buildCandidateConfiguration(selection.selected_lambda);
    const committedFrozen = readFileSync(
      path.join(repoRoot, 'data/experiments/forwardBaseEval/forward_base_frozen_configuration_v1.json'),
    );
    expect(canonicalForwardJsonBytes(frozen).equals(committedFrozen)).toBe(true);

    const finalResult = runForwardBaseEvaluation(committedPackages, FORWARD_BASE_EVAL_FINAL_DEFINITION, frozen);
    const committedReport = JSON.parse(
      readFileSync(
        path.join(repoRoot, 'data/experiments/forwardBaseEval/forward_base_model_evaluation_v1.json'),
        'utf8',
      ),
    ) as {
      selection: { selected_lambda: number };
      frozen_configuration_sha256: string;
      final: { model: { overall: { mae: number } } };
      terminal_decision: string;
    };
    expect(committedReport.selection.selected_lambda).toBe(selection.selected_lambda);
    expect(committedReport.frozen_configuration_sha256).toBe(frozen.configuration_sha256);
    expect(committedReport.final.model.overall.mae).toBe(finalResult.model.overall.mae);
    expect(['forward_base_model_configuration_frozen', 'forward_base_model_selection_requires_review'])
      .toContain(committedReport.terminal_decision);
  });
});
