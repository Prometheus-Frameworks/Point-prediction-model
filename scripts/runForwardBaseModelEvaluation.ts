/**
 * Forecast #168 stage 2: selection sweep -> configuration freeze -> held-out
 * final evaluation, in that recorded order.
 *
 * The lambda sweep sees ONLY the two selection evaluations (2023 and 2024
 * targets). The frozen configuration package — including the selected lambda —
 * is constructed and hashed before the final held-out definition (2024 inputs
 * -> 2025 targets) is evaluated. The report artifact records this ordering and
 * every hash so an independent reviewer can verify the freeze preceded the
 * final result.
 *
 * Usage:
 *   npx tsx scripts/runForwardBaseModelEvaluation.ts            # write artifacts
 *   npx tsx scripts/runForwardBaseModelEvaluation.ts --check    # verify determinism
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import {
  FORWARD_BASE_EVAL_FINAL_DEFINITION,
  FORWARD_BASE_EVAL_LAMBDA_CANDIDATES,
  buildCandidateConfiguration,
  buildForwardBaseSelectionOriginPackages,
  runForwardBaseEvaluation,
  runForwardBaseSelectionSweep,
  type ForwardBaseEvalOriginPackages,
  type ForwardBaseModelEvaluationResult,
} from '../src/experiments/forwardBaseEval/forwardBaseEvaluation.js';
import {
  FORWARD_BASE_EVALUATION_ARTIFACT_PATH,
  FORWARD_BASE_FREEZE_RECORD_PATH,
  FORWARD_BASE_GOVERNED_IMPLEMENTATION_PATHS,
  FORWARD_BASE_ORIGIN_PACKAGES_PATH,
  FORWARD_BASE_RUNTIME_CONFIGURATION_PATH,
  buildForwardBaseConfigurationFreezeRecord,
  buildForwardBaseGovernedImplementationIdentity,
  validateForwardBaseConfigurationFreezeRecord,
  type ForwardBaseConfigurationFreezeRecordPackageV1,
  type ForwardBaseGovernedImplementationPath,
} from '../src/experiments/forwardBaseEval/forwardBaseFreezeRecord.js';
import { canonicalForwardJsonBytes } from '../src/serialization/canonicalForwardArtifacts.js';

const GENERATED_AT = '2026-07-28T12:00:00.000Z';
const PACKAGES_PATH = FORWARD_BASE_ORIGIN_PACKAGES_PATH;
const REPORT_PATH = FORWARD_BASE_EVALUATION_ARTIFACT_PATH;
const FROZEN_CONFIG_PATH = FORWARD_BASE_RUNTIME_CONFIGURATION_PATH;
const FREEZE_RECORD_PATH = FORWARD_BASE_FREEZE_RECORD_PATH;

const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

const argValue = (flag: string): string | null => {
  const index = process.argv.indexOf(flag);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : null;
};

const readRecordedImplementationCommit = (): string | null => {
  if (!existsSync(FREEZE_RECORD_PATH)) return null;
  try {
    const existing = JSON.parse(
      readFileSync(FREEZE_RECORD_PATH, 'utf8'),
    ) as ForwardBaseConfigurationFreezeRecordPackageV1;
    return existing.freeze_record.software_and_schema_identity
      .governed_protocol_implementation.commit;
  } catch {
    return null;
  }
};

const governedImplementationCommit =
  argValue('--governed-implementation-commit') ??
  readRecordedImplementationCommit();
if (
  !governedImplementationCommit ||
  !/^[0-9a-f]{40}$/.test(governedImplementationCommit)
) {
  throw new Error(
    'a valid --governed-implementation-commit is required until the freeze record carries its non-self-referential code pin.',
  );
}
const governedImplementationSource = {
  commit: governedImplementationCommit,
  files: FORWARD_BASE_GOVERNED_IMPLEMENTATION_PATHS.map((filePath) => ({
    path: filePath as ForwardBaseGovernedImplementationPath,
    bytes: execFileSync('git', ['show', `${governedImplementationCommit}:${filePath}`], {
      maxBuffer: 32 * 1024 * 1024,
    }),
  })),
};
const governedImplementation =
  buildForwardBaseGovernedImplementationIdentity(
    governedImplementationSource,
  );

const packagesBytes = readFileSync(path.resolve(PACKAGES_PATH));
const packages = JSON.parse(packagesBytes.toString('utf8')) as ForwardBaseEvalOriginPackages;

const compactResult = (result: ForwardBaseModelEvaluationResult) => ({
  eval_id: result.eval_id,
  lambda: result.lambda,
  configuration_sha256: result.configuration_sha256,
  training_row_count: result.training_row_count,
  scored_row_count: result.scored_row_count,
  fitted_model_sha256: sha256(canonicalForwardJsonBytes(result.fitted_model)),
  model: result.model,
  baselines: {
    position_mean: result.baselines.position_mean,
    previous_season_ppr: result.baselines.previous_season_ppr,
  },
  model_minus_best_baseline_mae: result.model_minus_best_baseline_mae,
});

// Stage 1: lambda selection receives a validated package containing only the
// three permitted pre-final pairs. The held-out pair is not reachable through
// the selection API.
const selectionPackages = buildForwardBaseSelectionOriginPackages(packages);
const selection = runForwardBaseSelectionSweep(
  selectionPackages,
  FORWARD_BASE_EVAL_LAMBDA_CANDIDATES,
);

// Stage 2: freeze the configuration from selection alone.
const frozenConfiguration = buildCandidateConfiguration(selection.selected_lambda);
const frozenConfigurationBytes = canonicalForwardJsonBytes(frozenConfiguration);

// Stage 3: final held-out evaluation with the frozen configuration.
const finalResult = runForwardBaseEvaluation(
  packages,
  FORWARD_BASE_EVAL_FINAL_DEFINITION,
  frozenConfiguration,
);

const continuationRule =
  'freeze only if the frozen-lambda model beats both baselines on the final held-out evaluation and did not lose to a baseline on any selection evaluation';
const selectionBeatBaselines = selection.selection_results.every(
  (result) => result.model_minus_best_baseline_mae < 0,
);
const finalBeatsBaselines = finalResult.model_minus_best_baseline_mae < 0;
const decision = selectionBeatBaselines && finalBeatsBaselines
  ? 'forward_base_model_configuration_frozen'
  : 'forward_base_model_selection_requires_review';

const report = {
  artifact_id: 'forward_base_model_evaluation_v1',
  generated_at: GENERATED_AT,
  origin_packages_sha256: sha256(packagesBytes),
  protocol: {
    kind: 'expanding-window rolling-origin through exact forward runtime path',
    stage_order: [
      'selection sweep (2023 and 2024 target evaluations only)',
      'configuration freeze from selection outcome',
      'final held-out evaluation (2024 inputs -> 2025 targets)',
    ],
    lambda_candidates: [...FORWARD_BASE_EVAL_LAMBDA_CANDIDATES],
    selection_rule: selection.selection_rule,
    continuation_rule: continuationRule,
    final_definition: FORWARD_BASE_EVAL_FINAL_DEFINITION,
  },
  selection: {
    sweep: selection.sweep,
    selected_lambda: selection.selected_lambda,
    results: selection.selection_results.map(compactResult),
  },
  frozen_configuration_sha256: frozenConfiguration.configuration_sha256,
  final: compactResult(finalResult),
  decision_inputs: {
    selection_beat_baselines: selectionBeatBaselines,
    final_beats_baselines: finalBeatsBaselines,
  },
  terminal_decision: decision,
  limitations: [
    'Evaluation population is players with governed rows in both seasons of each pair; players without an input-season row (rookies/no-history) and without a target-season row are itemized in the origin packages, never silently dropped.',
    'Targets are derived-component generic full-PPR per the operator scoring-target disposition; promoted season_ppr source totals are retained as provenance only.',
    'This report freezes evaluation evidence and configuration identity only; it admits no inputs, selects no cutoff, and authorizes no 2026 run.',
  ],
};

const reportBytes = canonicalForwardJsonBytes(report);
const freezeRecord = buildForwardBaseConfigurationFreezeRecord({
  runtimeConfiguration: frozenConfiguration,
  governedImplementation,
});
const freezeValidation = validateForwardBaseConfigurationFreezeRecord(
  freezeRecord,
  {
    runtimeConfigurationBytes: frozenConfigurationBytes,
    originPackagesBytes: packagesBytes,
    historicalEvaluationBytes: reportBytes,
    governedImplementation: governedImplementationSource,
  },
);
if (!freezeValidation.ok) {
  throw new Error(
    `generated freeze record failed validation: ${freezeValidation.errors.join('; ')}`,
  );
}
const freezeRecordBytes = canonicalForwardJsonBytes(freezeValidation.data);

if (process.argv.includes('--check')) {
  let clean = true;
  for (const [filePath, expected] of [
    [REPORT_PATH, reportBytes],
    [FROZEN_CONFIG_PATH, frozenConfigurationBytes],
    [FREEZE_RECORD_PATH, freezeRecordBytes],
  ] as const) {
    if (!existsSync(filePath) || !readFileSync(filePath).equals(expected)) {
      console.error(`STALE: ${filePath} does not match a deterministic rebuild.`);
      clean = false;
    }
  }
  if (!clean) process.exit(1);
  console.log(
    'Deterministic outputs current: report, frozen configuration, and complete freeze record match exact rebuilds.',
  );
  process.exit(0);
}

mkdirSync(path.dirname(path.resolve(REPORT_PATH)), { recursive: true });
writeFileSync(path.resolve(REPORT_PATH), reportBytes);
writeFileSync(path.resolve(FROZEN_CONFIG_PATH), frozenConfigurationBytes);
writeFileSync(path.resolve(FREEZE_RECORD_PATH), freezeRecordBytes);

console.log(`selected lambda: ${selection.selected_lambda}`);
console.log(`frozen configuration_sha256: ${frozenConfiguration.configuration_sha256}`);
for (const entry of selection.sweep) {
  console.log(
    `lambda ${entry.lambda}: mean selection MAE ${entry.mean_selection_mae.toFixed(4)} (${entry.selection_evaluations.map((e) => `${e.eval_id}=${e.model_mae.toFixed(4)}`).join(', ')})`,
  );
}
console.log(
  `final held-out: model MAE ${finalResult.model.overall.mae.toFixed(4)} vs position-mean ${finalResult.baselines.position_mean.overall.mae.toFixed(4)} vs prev-season ${finalResult.baselines.previous_season_ppr.overall.mae.toFixed(4)} (delta vs best baseline ${finalResult.model_minus_best_baseline_mae.toFixed(4)})`,
);
console.log(`terminal decision: ${report.terminal_decision}`);
console.log(`report sha256=${sha256(reportBytes)}`);
console.log(`frozen config sha256(file)=${sha256(frozenConfigurationBytes)}`);
console.log(`freeze record sha256(file)=${sha256(freezeRecordBytes)}`);
