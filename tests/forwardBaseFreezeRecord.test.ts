import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  FORWARD_BASE_EVALUATION_IMPLEMENTATION_COMMIT,
  FORWARD_BASE_FREEZE_RECORD_PATH,
  FORWARD_BASE_RUNTIME_BASE_COMMIT,
  buildForwardBaseConfigurationFreezeRecord,
  validateForwardBaseConfigurationFreezeRecord,
} from '../src/experiments/forwardBaseEval/forwardBaseFreezeRecord.js';
import type { ForwardBaseEvalOriginPackages } from '../src/experiments/forwardBaseEval/forwardBaseEvaluation.js';
import {
  sha256ForwardCanonicalValue,
  type FrozenForwardRidgeConfigurationPackageV1,
} from '../src/models/seasonal/forwardRidgeModel.js';
import { canonicalForwardJsonBytes } from '../src/serialization/canonicalForwardArtifacts.js';

const repoRoot = path.resolve(import.meta.dirname, '..');
const readJson = <T>(relativePath: string): T =>
  JSON.parse(readFileSync(path.join(repoRoot, relativePath), 'utf8')) as T;

const runtimeConfiguration = readJson<FrozenForwardRidgeConfigurationPackageV1>(
  'data/experiments/forwardBaseEval/forward_base_frozen_configuration_v1.json',
);
const originPackages = readJson<ForwardBaseEvalOriginPackages>(
  'data/experiments/forwardBaseEval/forward_base_eval_origin_pairs_v1.json',
);
const historicalEvaluation = readJson<Record<string, unknown>>(
  'data/experiments/forwardBaseEval/forward_base_model_evaluation_v1.json',
);

const buildRecord = () =>
  buildForwardBaseConfigurationFreezeRecord({
    runtimeConfiguration,
    originPackagesSha256: sha256ForwardCanonicalValue(originPackages),
    historicalEvaluationSha256:
      sha256ForwardCanonicalValue(historicalEvaluation),
  });

describe('forward base configuration freeze record', () => {
  it('binds and verifies the full #168 identity and all referenced artifact bytes', () => {
    const freezeRecord = buildRecord();
    const validation = validateForwardBaseConfigurationFreezeRecord(
      freezeRecord,
      {
        runtimeConfiguration,
        originPackages,
        historicalEvaluation,
      },
    );
    expect(validation.ok).toBe(true);
    if (!validation.ok) throw new Error(validation.errors.join('; '));

    expect(
      validation.data.freeze_record.runtime_configuration.configuration_sha256,
    ).toBe(runtimeConfiguration.configuration_sha256);
    expect(
      validation.data.freeze_record.target_and_scoring_identity
        .forecast_profile_sha256,
    ).toBe(
      'a368b75bf5503558a4f664e0486e2c3cc75c01004d4527fd29ecaa1e247a6274',
    );
    expect(
      validation.data.freeze_record.preprocessing_and_standardization
        .standardization.learned_from,
    ).toBe('applicable_training_fold_only');
    expect(
      validation.data.freeze_record.approved_historical_evaluation_refs[0]
        .evaluation_implementation_commit,
    ).toBe(FORWARD_BASE_EVALUATION_IMPLEMENTATION_COMMIT);
    expect(
      validation.data.freeze_record.software_and_schema_identity
        .runtime_base_commit,
    ).toBe(FORWARD_BASE_RUNTIME_BASE_COMMIT);
    expect(validation.data.freeze_record.excluded_feature_families).toContain(
      'teamstate',
    );
    expect(
      validation.data.freeze_record.activation_boundaries.does_not_authorize,
    ).toContain('seasonal-ppr-2026-forward-001_execution');
  });

  it('rejects a self-rehashed semantic mutation and mismatched referenced bytes', () => {
    const freezeRecord = buildRecord();
    const tampered = structuredClone(freezeRecord);
    tampered.freeze_record.target_and_scoring_identity.profile_version = '9.9.9';
    tampered.freeze_record_sha256 = sha256ForwardCanonicalValue(
      tampered.freeze_record,
    );
    const semanticValidation =
      validateForwardBaseConfigurationFreezeRecord(tampered, {
        runtimeConfiguration,
        originPackages,
        historicalEvaluation,
      });
    expect(semanticValidation.ok).toBe(false);
    if (semanticValidation.ok) throw new Error('expected semantic rejection');
    expect(semanticValidation.errors).toContain(
      'freeze record fields do not match the complete governed v1 record.',
    );

    const dependencyValidation =
      validateForwardBaseConfigurationFreezeRecord(freezeRecord, {
        runtimeConfiguration,
        originPackages,
        historicalEvaluation: {
          ...historicalEvaluation,
          generated_at: 'tampered',
        },
      });
    expect(dependencyValidation.ok).toBe(false);
    if (dependencyValidation.ok) throw new Error('expected dependency rejection');
    expect(dependencyValidation.errors).toContain(
      'supplied historical evaluation does not match the frozen artifact hash.',
    );
  });

  it('reproduces the committed freeze-record artifact byte-for-byte', () => {
    const committed = readFileSync(
      path.join(repoRoot, FORWARD_BASE_FREEZE_RECORD_PATH),
    );
    expect(canonicalForwardJsonBytes(buildRecord()).equals(committed)).toBe(true);
  });
});
