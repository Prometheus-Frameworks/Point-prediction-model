import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  FORWARD_BASE_FREEZE_RECORD_PATH,
  FORWARD_BASE_GOVERNED_IMPLEMENTATION_PATHS,
  FORWARD_BASE_HISTORICAL_EVALUATION_ARTIFACT_SHA256,
  FORWARD_BASE_HISTORICAL_EVALUATION_PRODUCER_COMMIT,
  FORWARD_BASE_RUNTIME_BASE_COMMIT,
  buildForwardBaseConfigurationFreezeRecord,
  buildForwardBaseGovernedImplementationIdentity,
  validateForwardBaseConfigurationFreezeRecord,
  type ForwardBaseConfigurationFreezeRecordPackageV1,
  type ForwardBaseGovernedImplementationSource,
} from '../src/experiments/forwardBaseEval/forwardBaseFreezeRecord.js';
import { buildCandidateConfiguration } from '../src/experiments/forwardBaseEval/forwardBaseEvaluation.js';
import {
  sha256ForwardCanonicalValue,
  type FrozenForwardRidgeConfigurationPackageV1,
} from '../src/models/seasonal/forwardRidgeModel.js';
import { canonicalForwardJsonBytes } from '../src/serialization/canonicalForwardArtifacts.js';

const repoRoot = path.resolve(import.meta.dirname, '..');
const runtimeConfigurationBytes = readFileSync(
  path.join(
    repoRoot,
    'data/experiments/forwardBaseEval/forward_base_frozen_configuration_v1.json',
  ),
);
const originPackagesBytes = readFileSync(
  path.join(
    repoRoot,
    'data/experiments/forwardBaseEval/forward_base_eval_origin_pairs_v1.json',
  ),
);
const historicalEvaluationBytes = readFileSync(
  path.join(
    repoRoot,
    'data/experiments/forwardBaseEval/forward_base_model_evaluation_v1.json',
  ),
);
const runtimeConfiguration = JSON.parse(
  runtimeConfigurationBytes.toString('utf8'),
) as FrozenForwardRidgeConfigurationPackageV1;

const implementationFromWorkingTree = (
  commit = '0000000000000000000000000000000000000001',
): ForwardBaseGovernedImplementationSource => ({
  commit,
  files: FORWARD_BASE_GOVERNED_IMPLEMENTATION_PATHS.map((filePath) => ({
    path: filePath,
    bytes: readFileSync(path.join(repoRoot, filePath)),
  })),
});

const implementationFromCommit = (
  commit: string,
): ForwardBaseGovernedImplementationSource => ({
  commit,
  files: FORWARD_BASE_GOVERNED_IMPLEMENTATION_PATHS.map((filePath) => ({
    path: filePath,
    bytes: execFileSync('git', ['show', `${commit}:${filePath}`], {
      cwd: repoRoot,
      maxBuffer: 32 * 1024 * 1024,
    }),
  })),
});

const dependencies = (
  governedImplementation = implementationFromWorkingTree(),
) => ({
  runtimeConfigurationBytes,
  originPackagesBytes,
  historicalEvaluationBytes,
  governedImplementation,
});

const buildRecord = (
  governedImplementation = implementationFromWorkingTree(),
) =>
  buildForwardBaseConfigurationFreezeRecord({
    runtimeConfiguration,
    governedImplementation:
      buildForwardBaseGovernedImplementationIdentity(governedImplementation),
  });

describe('forward base configuration freeze record', () => {
  it('binds the complete #168 identity and verifies all raw dependency bytes', () => {
    const source = implementationFromWorkingTree();
    const freezeRecord = buildRecord(source);
    const validation = validateForwardBaseConfigurationFreezeRecord(
      freezeRecord,
      dependencies(source),
    );
    expect(validation.ok).toBe(true);
    if (!validation.ok) throw new Error(validation.errors.join('; '));

    expect(
      validation.data.freeze_record.runtime_configuration.configuration_sha256,
    ).toBe(runtimeConfiguration.configuration_sha256);
    expect(
      validation.data.freeze_record.approved_historical_evaluation_refs[0]
        .artifact_sha256,
    ).toBe(FORWARD_BASE_HISTORICAL_EVALUATION_ARTIFACT_SHA256);
    expect(
      validation.data.freeze_record.approved_historical_evaluation_refs[0]
        .historical_evaluation_producer_commit,
    ).toBe(FORWARD_BASE_HISTORICAL_EVALUATION_PRODUCER_COMMIT);
    expect(
      validation.data.freeze_record.software_and_schema_identity
        .runtime_base_commit,
    ).toBe(FORWARD_BASE_RUNTIME_BASE_COMMIT);
    expect(
      validation.data.freeze_record.software_and_schema_identity
        .governed_protocol_implementation.files.map((file) => file.path),
    ).toEqual(FORWARD_BASE_GOVERNED_IMPLEMENTATION_PATHS);
    expect(
      validation.data.freeze_record.activation_boundaries.does_not_authorize,
    ).toContain('seasonal-ppr-2026-forward-001_execution');
  });

  it('rejects lambda/config identities that contradict the approved evaluation', () => {
    const source = implementationFromWorkingTree();
    const lambdaOne = buildCandidateConfiguration(1);
    expect(() =>
      buildForwardBaseConfigurationFreezeRecord({
        runtimeConfiguration: lambdaOne,
        governedImplementation:
          buildForwardBaseGovernedImplementationIdentity(source),
      }),
    ).toThrow(/immutable v1 artifact hash/);

    const tampered = structuredClone(buildRecord(source));
    tampered.freeze_record.runtime_configuration.configuration_package =
      lambdaOne;
    tampered.freeze_record.runtime_configuration.configuration_sha256 =
      lambdaOne.configuration_sha256;
    (
      tampered.freeze_record.runtime_configuration as {
        artifact_sha256: string;
      }
    ).artifact_sha256 = sha256ForwardCanonicalValue(lambdaOne);
    tampered.freeze_record.lambda_selection_protocol.selected_lambda = 1;
    tampered.freeze_record_sha256 = sha256ForwardCanonicalValue(
      tampered.freeze_record,
    );
    const validation = validateForwardBaseConfigurationFreezeRecord(
      tampered,
      dependencies(source),
    );
    expect(validation.ok).toBe(false);
    if (validation.ok) throw new Error('expected lambda/config rejection');
    expect(
      validation.errors.some(
        (error) =>
          error.includes('immutable v1 artifact hash') ||
          error.includes('approved historical evaluation does not agree'),
      ),
    ).toBe(true);
  });

  it('rejects semantic report disagreement even when the JSON still parses', () => {
    const source = implementationFromWorkingTree();
    const report = JSON.parse(
      historicalEvaluationBytes.toString('utf8'),
    ) as Record<string, unknown>;
    const selection = report.selection as Record<string, unknown>;
    selection.selected_lambda = 1;
    const alteredBytes = canonicalForwardJsonBytes(report);
    const validation = validateForwardBaseConfigurationFreezeRecord(
      buildRecord(source),
      {
        ...dependencies(source),
        historicalEvaluationBytes: alteredBytes,
      },
    );
    expect(validation.ok).toBe(false);
    if (validation.ok) throw new Error('expected report disagreement rejection');
    expect(validation.errors).toContain(
      'supplied historical evaluation raw bytes do not match the frozen artifact hash.',
    );
    expect(validation.errors).toContain(
      'approved historical evaluation does not agree with the embedded selected lambda, configuration hash, origin package, and frozen protocol.',
    );
  });

  it('rejects formatting and duplicate-key drift by hashing raw artifact bytes', () => {
    const source = implementationFromWorkingTree();
    const record = buildRecord(source);
    const whitespaceValidation =
      validateForwardBaseConfigurationFreezeRecord(record, {
        ...dependencies(source),
        historicalEvaluationBytes: Buffer.concat([
          Buffer.from(' '),
          historicalEvaluationBytes,
        ]),
      });
    expect(whitespaceValidation.ok).toBe(false);
    if (whitespaceValidation.ok) throw new Error('expected raw-byte rejection');
    expect(whitespaceValidation.errors).toContain(
      'supplied historical evaluation raw bytes do not match the frozen artifact hash.',
    );

    const originalText = historicalEvaluationBytes.toString('utf8');
    const duplicateKeyBytes = Buffer.from(
      `{"artifact_id":"forward_base_model_evaluation_v1",${originalText.slice(1)}`,
    );
    expect(JSON.parse(duplicateKeyBytes.toString('utf8'))).toEqual(
      JSON.parse(originalText),
    );
    const duplicateValidation =
      validateForwardBaseConfigurationFreezeRecord(record, {
        ...dependencies(source),
        historicalEvaluationBytes: duplicateKeyBytes,
      });
    expect(duplicateValidation.ok).toBe(false);
    if (duplicateValidation.ok) throw new Error('expected duplicate-key rejection');
    expect(duplicateValidation.errors).toContain(
      'supplied historical evaluation raw bytes do not match the frozen artifact hash.',
    );
  });

  it('rejects a different commit or any changed load-bearing source byte', () => {
    const source = implementationFromWorkingTree();
    const record = buildRecord(source);
    const wrongCommit = implementationFromWorkingTree(
      '0000000000000000000000000000000000000002',
    );
    const commitValidation = validateForwardBaseConfigurationFreezeRecord(
      record,
      dependencies(wrongCommit),
    );
    expect(commitValidation.ok).toBe(false);
    if (commitValidation.ok) throw new Error('expected commit rejection');
    expect(commitValidation.errors).toContain(
      'supplied governed implementation bytes do not match the recorded commit manifest.',
    );

    const changedSource = implementationFromWorkingTree();
    changedSource.files[0] = {
      ...changedSource.files[0],
      bytes: Buffer.concat([changedSource.files[0].bytes, Buffer.from('\n')]),
    };
    const sourceValidation = validateForwardBaseConfigurationFreezeRecord(
      record,
      dependencies(changedSource),
    );
    expect(sourceValidation.ok).toBe(false);
    if (sourceValidation.ok) throw new Error('expected source rejection');
    expect(sourceValidation.errors).toContain(
      'supplied governed implementation bytes do not match the recorded commit manifest.',
    );
  });

  it('rejects a self-rehashed semantic mutation', () => {
    const source = implementationFromWorkingTree();
    const tampered = structuredClone(buildRecord(source));
    tampered.freeze_record.target_and_scoring_identity.profile_version = '9.9.9';
    tampered.freeze_record_sha256 = sha256ForwardCanonicalValue(
      tampered.freeze_record,
    );
    const validation = validateForwardBaseConfigurationFreezeRecord(
      tampered,
      dependencies(source),
    );
    expect(validation.ok).toBe(false);
    if (validation.ok) throw new Error('expected semantic rejection');
    expect(validation.errors).toContain(
      'freeze record fields do not match the complete immutable governed v1 record.',
    );
  });

  it('reproduces the committed record from raw files at its pinned code commit', () => {
    const committedBytes = readFileSync(
      path.join(repoRoot, FORWARD_BASE_FREEZE_RECORD_PATH),
    );
    const committed = JSON.parse(
      committedBytes.toString('utf8'),
    ) as ForwardBaseConfigurationFreezeRecordPackageV1;
    const commit =
      committed.freeze_record.software_and_schema_identity
        .governed_protocol_implementation.commit;
    const source = implementationFromCommit(commit);
    const rebuilt = buildRecord(source);
    const validation = validateForwardBaseConfigurationFreezeRecord(
      committed,
      dependencies(source),
    );
    expect(validation.ok).toBe(true);
    if (!validation.ok) throw new Error(validation.errors.join('; '));
    expect(canonicalForwardJsonBytes(rebuilt).equals(committedBytes)).toBe(true);
  });
});
