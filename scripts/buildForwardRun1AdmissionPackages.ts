/**
 * Deterministically materialize the exact Forward Run 1 runtime input packages
 * from read-only, SHA-pinned sources and a committed materialization lock.
 *
 * This script never calls `runForwardCandidateService`, fits a model, emits a
 * forecast, or writes outside TIBER-Forecast.
 *
 * Usage:
 *   npx tsx scripts/buildForwardRun1AdmissionPackages.ts --data-repo-root ../TIBER-Data
 *   npx tsx scripts/buildForwardRun1AdmissionPackages.ts --data-repo-root ../TIBER-Data --check
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  FORWARD_BASE_EVAL_SOURCE_ARTIFACT_PATH,
  FORWARD_BASE_EVAL_SOURCE_COMMIT,
  FORWARD_BASE_EVAL_SOURCE_SHA256,
  type ForwardBaseEvalOriginPackages,
} from '../src/experiments/forwardBaseEval/forwardBaseEvaluation.js';
import {
  FORWARD_RUN1_CENSUS_PACKAGE_PATH,
  FORWARD_RUN1_CENSUS_SOURCE_PATH,
  FORWARD_RUN1_CENSUS_SOURCE_SHA256,
  FORWARD_RUN1_CENSUS_VALIDATION_PATH,
  FORWARD_RUN1_CENSUS_VALIDATION_SHA256,
  FORWARD_RUN1_CONFIGURATION_FREEZE_FILE_SHA256,
  FORWARD_RUN1_CONFIGURATION_FREEZE_PATH,
  FORWARD_RUN1_DATA_COMMIT_AVAILABLE_AT,
  FORWARD_RUN1_DUPLICATE_POLICY_PATH,
  FORWARD_RUN1_FORECAST_COMMIT,
  FORWARD_RUN1_FORECAST_COMMIT_AVAILABLE_AT,
  FORWARD_RUN1_FROZEN_CONFIGURATION_FILE_SHA256,
  FORWARD_RUN1_FROZEN_CONFIGURATION_PATH,
  FORWARD_RUN1_FUTURE_FEATURE_PACKAGE_PATH,
  FORWARD_RUN1_HISTORICAL_TRAINING_PACKAGE_PATH,
  FORWARD_RUN1_MATERIALIZATION_LOCK_PATH,
  FORWARD_RUN1_ORIGIN_PACKAGES_PATH,
  FORWARD_RUN1_ORIGIN_PACKAGES_SHA256,
  FORWARD_RUN1_PACKAGE_ADMISSION_EVIDENCE_PATH,
  FORWARD_RUN1_PROMOTION_MARKER_PATH,
  FORWARD_RUN1_PROMOTION_MARKER_SHA256,
  FORWARD_RUN1_SCORING_RECONCILIATION_PATH,
  FORWARD_RUN1_SCORING_RECONCILIATION_SHA256,
  FORWARD_RUN1_ELIGIBILITY_POLICY_PATH,
  buildForwardRun1CensusPackage,
  buildForwardRun1FutureFeaturePackage,
  buildForwardRun1HistoricalTrainingPackage,
  materializeForwardRun1Packages,
  type ForwardRun1MaterializationLockV1,
} from '../src/experiments/forwardRun1/forwardRun1AdmissionBinding.js';
import type { FrozenForwardRidgeConfigurationPackageV1 } from '../src/models/seasonal/forwardRidgeModel.js';
import {
  canonicalForwardJsonBytes,
  forwardArtifactSha256,
} from '../src/serialization/canonicalForwardArtifacts.js';

const argValue = (flag: string, fallback: string): string => {
  const index = process.argv.indexOf(flag);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
};

const dataRepoRoot = path.resolve(argValue('--data-repo-root', '../TIBER-Data'));
const checkOnly = process.argv.includes('--check');

const sha256 = (bytes: Uint8Array): string =>
  createHash('sha256').update(bytes).digest('hex');

const verifySha = (label: string, bytes: Uint8Array, expected: string): void => {
  const actual = sha256(bytes);
  if (actual !== expected) {
    throw new Error(`${label} SHA-256 mismatch: expected ${expected}, got ${actual}.`);
  }
};

const gitShow = (repositoryRoot: string, commit: string, filePath: string): Buffer =>
  execFileSync('git', ['-C', repositoryRoot, 'show', `${commit}:${filePath}`], {
    maxBuffer: 256 * 1024 * 1024,
  });

const commitAvailableAt = (repositoryRoot: string, commit: string): string => {
  const value = execFileSync(
    'git',
    ['-C', repositoryRoot, 'show', '-s', '--format=%cI', commit],
    { encoding: 'utf8' },
  ).trim();
  return new Date(value).toISOString();
};

const dataCommitAvailableAt = commitAvailableAt(
  dataRepoRoot,
  FORWARD_BASE_EVAL_SOURCE_COMMIT,
);
if (dataCommitAvailableAt !== FORWARD_RUN1_DATA_COMMIT_AVAILABLE_AT) {
  throw new Error(
    `Data commit availability mismatch: expected ${FORWARD_RUN1_DATA_COMMIT_AVAILABLE_AT}, got ${dataCommitAvailableAt}.`,
  );
}
const forecastCommitAvailableAt = commitAvailableAt(
  process.cwd(),
  FORWARD_RUN1_FORECAST_COMMIT,
);
if (forecastCommitAvailableAt !== FORWARD_RUN1_FORECAST_COMMIT_AVAILABLE_AT) {
  throw new Error(
    `Forecast commit availability mismatch: expected ${FORWARD_RUN1_FORECAST_COMMIT_AVAILABLE_AT}, got ${forecastCommitAvailableAt}.`,
  );
}

const materializationLockBytes = readFileSync(FORWARD_RUN1_MATERIALIZATION_LOCK_PATH);
const materializationLock = JSON.parse(
  materializationLockBytes.toString('utf8'),
) as ForwardRun1MaterializationLockV1;
if (!canonicalForwardJsonBytes(materializationLock).equals(materializationLockBytes)) {
  throw new Error('materialization lock is not canonical Forward JSON bytes.');
}
const materializerCommitAvailableAt = commitAvailableAt(
  process.cwd(),
  materializationLock.materializer_implementation_commit_sha,
);
if (
  Date.parse(materializationLock.artifact_generated_at) <
  Date.parse(materializerCommitAvailableAt)
) {
  throw new Error(
    `package generation ${materializationLock.artifact_generated_at} predates materializer commit availability ${materializerCommitAvailableAt}.`,
  );
}
for (const materializerPath of [
  'scripts/buildForwardRun1AdmissionPackages.ts',
  'src/experiments/forwardRun1/forwardRun1AdmissionBinding.ts',
] as const) {
  const pinnedMaterializerBytes = gitShow(
    process.cwd(),
    materializationLock.materializer_implementation_commit_sha,
    materializerPath,
  );
  if (!readFileSync(materializerPath).equals(pinnedMaterializerBytes)) {
    throw new Error(
      `${materializerPath} differs from materializer commit ${materializationLock.materializer_implementation_commit_sha}.`,
    );
  }
}

const coverageBytes = gitShow(
  dataRepoRoot,
  FORWARD_BASE_EVAL_SOURCE_COMMIT,
  FORWARD_BASE_EVAL_SOURCE_ARTIFACT_PATH,
);
verifySha('promoted coverage source', coverageBytes, FORWARD_BASE_EVAL_SOURCE_SHA256);
const censusBytes = gitShow(
  dataRepoRoot,
  FORWARD_BASE_EVAL_SOURCE_COMMIT,
  FORWARD_RUN1_CENSUS_SOURCE_PATH,
);
verifySha('bounded census source', censusBytes, FORWARD_RUN1_CENSUS_SOURCE_SHA256);
for (const [label, filePath, expected] of [
  ['census validation', FORWARD_RUN1_CENSUS_VALIDATION_PATH, FORWARD_RUN1_CENSUS_VALIDATION_SHA256],
  ['coverage promotion marker', FORWARD_RUN1_PROMOTION_MARKER_PATH, FORWARD_RUN1_PROMOTION_MARKER_SHA256],
  ['scoring reconciliation', FORWARD_RUN1_SCORING_RECONCILIATION_PATH, FORWARD_RUN1_SCORING_RECONCILIATION_SHA256],
] as const) {
  verifySha(
    label,
    gitShow(dataRepoRoot, FORWARD_BASE_EVAL_SOURCE_COMMIT, filePath),
    expected,
  );
}

const originPackagesBytes = readFileSync(FORWARD_RUN1_ORIGIN_PACKAGES_PATH);
verifySha(
  'frozen origin packages',
  originPackagesBytes,
  FORWARD_RUN1_ORIGIN_PACKAGES_SHA256,
);
const originPackages = JSON.parse(
  originPackagesBytes.toString('utf8'),
) as ForwardBaseEvalOriginPackages;
const frozenConfigurationBytes = readFileSync(FORWARD_RUN1_FROZEN_CONFIGURATION_PATH);
verifySha(
  'frozen configuration package',
  frozenConfigurationBytes,
  FORWARD_RUN1_FROZEN_CONFIGURATION_FILE_SHA256,
);
const frozenConfiguration = JSON.parse(
  frozenConfigurationBytes.toString('utf8'),
) as FrozenForwardRidgeConfigurationPackageV1;
verifySha(
  'configuration freeze record',
  readFileSync(FORWARD_RUN1_CONFIGURATION_FREEZE_PATH),
  FORWARD_RUN1_CONFIGURATION_FREEZE_FILE_SHA256,
);

const eligibilityPolicyBytes = readFileSync(FORWARD_RUN1_ELIGIBILITY_POLICY_PATH);
const duplicatePolicyBytes = readFileSync(FORWARD_RUN1_DUPLICATE_POLICY_PATH);
const eligibilityPolicySha256 = sha256(eligibilityPolicyBytes);
const duplicatePolicySha256 = sha256(duplicatePolicyBytes);

const coverageArtifact = JSON.parse(coverageBytes.toString('utf8')) as unknown;
const censusArtifact = JSON.parse(censusBytes.toString('utf8')) as unknown;
const historicalTrainingDraft = buildForwardRun1HistoricalTrainingPackage(
  originPackages,
  frozenConfiguration,
);
const futureFeatureDraft = buildForwardRun1FutureFeaturePackage(
  coverageArtifact,
  censusArtifact,
  frozenConfiguration,
);
const censusDraft = buildForwardRun1CensusPackage(
  censusArtifact,
  eligibilityPolicySha256,
  duplicatePolicySha256,
);

const materialized = materializeForwardRun1Packages({
  lock: materializationLock,
  historicalTrainingDraft,
  futureFeatureDraft,
  censusDraft,
});

const outputs = [
  [
    FORWARD_RUN1_PACKAGE_ADMISSION_EVIDENCE_PATH,
    materialized.packageAdmissionEvidence,
    null,
  ],
  [
    FORWARD_RUN1_HISTORICAL_TRAINING_PACKAGE_PATH,
    materialized.historicalTrainingPackage,
    materialized.historicalTrainingPackage.content_sha256,
  ],
  [
    FORWARD_RUN1_FUTURE_FEATURE_PACKAGE_PATH,
    materialized.futureFeaturePackage,
    materialized.futureFeaturePackage.content_sha256,
  ],
  [
    FORWARD_RUN1_CENSUS_PACKAGE_PATH,
    materialized.censusPackage,
    materialized.censusPackage.content_sha256,
  ],
] as const;

let clean = true;
for (const [filePath, artifactValue, runtimeContentSha256] of outputs) {
  const bytes = canonicalForwardJsonBytes(artifactValue);
  if (checkOnly) {
    if (!existsSync(filePath) || !readFileSync(filePath).equals(bytes)) {
      console.error(`STALE: ${filePath} does not match its deterministic rebuild.`);
      clean = false;
    }
  } else {
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, bytes);
  }
  const fileSha256 = forwardArtifactSha256(bytes);
  console.log(runtimeContentSha256 === null
    ? `${filePath}: artifact_file_sha256=${fileSha256}`
    : `${filePath}: runtime_content_sha256=${runtimeContentSha256} artifact_file_sha256=${fileSha256}`);
}

if (checkOnly && !clean) process.exit(1);
console.log(
  `deterministic package materialization completed for cutoff ${FORWARD_RUN1_FORECAST_COMMIT_AVAILABLE_AT}; no runtime service, fit, or forecast emission was invoked.`,
);
