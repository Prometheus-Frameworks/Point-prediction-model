import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fitBoundaryProbe = vi.hoisted(() => {
  const sentinel = new Error('FORWARD_RUN1_FIT_BOUNDARY_REACHED');
  return {
    sentinel,
    fit: vi.fn((): never => {
      throw sentinel;
    }),
  };
});

vi.mock('../src/models/seasonal/forwardRidgeModel.js', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('../src/models/seasonal/forwardRidgeModel.js')
  >();
  return {
    ...actual,
    fitSeasonalForwardModel: fitBoundaryProbe.fit,
  };
});
import {
  FORWARD_BASE_EVAL_SOURCE_ARTIFACT_PATH,
  FORWARD_BASE_EVAL_SOURCE_COMMIT,
  FORWARD_BASE_EVAL_SOURCE_SHA256,
} from '../src/experiments/forwardBaseEval/forwardBaseEvaluation.js';
import {
  FORWARD_RUN1_CENSUS_PACKAGE_PATH,
  FORWARD_RUN1_CENSUS_SOURCE_PATH,
  FORWARD_RUN1_CENSUS_SOURCE_SHA256,
  FORWARD_RUN1_CUTOFF_NORMALIZATION_RULE_SHA256,
  FORWARD_RUN1_DATA_COMMIT_AVAILABLE_AT,
  FORWARD_RUN1_FORECAST_CUTOFF,
  FORWARD_RUN1_FUTURE_FEATURE_PACKAGE_PATH,
  FORWARD_RUN1_HISTORICAL_TRAINING_PACKAGE_PATH,
  FORWARD_RUN1_MATERIALIZATION_LOCK_PATH,
  FORWARD_RUN1_ORIGIN_PACKAGES_PATH,
  FORWARD_RUN1_ORIGIN_PACKAGES_SHA256,
  FORWARD_RUN1_PACKAGE_ADMISSION_EVIDENCE_PATH,
  buildForwardRun1AdmissionPreflightInput,
  type ForwardRun1MaterializationLockV1,
  type ForwardRun1PackageAdmissionEvidenceV1,
} from '../src/experiments/forwardRun1/forwardRun1AdmissionBinding.js';
import type { FrozenForwardRidgeConfigurationPackageV1 } from '../src/models/seasonal/forwardRidgeModel.js';
import {
  canonicalForwardJsonBytes,
  forwardArtifactSha256,
} from '../src/serialization/canonicalForwardArtifacts.js';
import {
  computeForwardPinnedPackageSha256,
  runForwardCandidateService,
  type ForwardCensusPayload,
  type ForwardInferencePayload,
  type ForwardPinnedInputPackage,
  type ForwardTrainingPayload,
  type RunForwardCandidateInput,
} from '../src/services/runForwardCandidateService.js';

const repoRoot = path.resolve(import.meta.dirname, '..');

const sha256 = (bytes: Uint8Array): string =>
  createHash('sha256').update(bytes).digest('hex');

const readCanonical = <T>(filePath: string): { bytes: Buffer; value: T } => {
  const bytes = readFileSync(path.join(repoRoot, filePath));
  const value = JSON.parse(bytes.toString('utf8')) as T;
  expect(canonicalForwardJsonBytes(value).equals(bytes)).toBe(true);
  return { bytes, value };
};

const frozenConfiguration = readCanonical<FrozenForwardRidgeConfigurationPackageV1>(
  'data/experiments/forwardBaseEval/forward_base_frozen_configuration_v1.json',
).value;
const historical = readCanonical<ForwardPinnedInputPackage<ForwardTrainingPayload>>(
  FORWARD_RUN1_HISTORICAL_TRAINING_PACKAGE_PATH,
);
const future = readCanonical<ForwardPinnedInputPackage<ForwardInferencePayload>>(
  FORWARD_RUN1_FUTURE_FEATURE_PACKAGE_PATH,
);
const census = readCanonical<ForwardPinnedInputPackage<ForwardCensusPayload>>(
  FORWARD_RUN1_CENSUS_PACKAGE_PATH,
);
const packageAdmissionEvidence =
  readCanonical<ForwardRun1PackageAdmissionEvidenceV1>(
    FORWARD_RUN1_PACKAGE_ADMISSION_EVIDENCE_PATH,
  );
const packageAdmissionEvidenceSha256 = forwardArtifactSha256(
  packageAdmissionEvidence.bytes,
);
const materializationLock = readCanonical<ForwardRun1MaterializationLockV1>(
  FORWARD_RUN1_MATERIALIZATION_LOCK_PATH,
).value;
const binding = JSON.parse(readFileSync(
  path.join(
    repoRoot,
    'data/experiments/forwardRun1/forward_run1_admission_binding_v1.json',
  ),
  'utf8',
)) as {
  activation_block: {
    forecast_cutoff: string;
    fitted_training_input_refs: Array<{ content_sha256: string }>;
    future_feature_input_refs: Array<{ content_sha256: string }>;
    population_census_sha256: string;
  };
  census_binding: {
    census_sha256: string;
    effective_at: string;
    eligibility_policy_sha256: string;
  };
  cutoff_dependency_evidence: {
    data_commit_available_at: string;
    forecast_commit_available_at: string;
  };
  scoring_reconciliation_binding: {
    evidence_ref: { content_sha256: string; path: string; repository: string };
    source_input_sha256s: string[];
  };
  package_admission_evidence: {
    artifact_file_sha256: string;
    uri_or_path: string;
  };
};

const makeInput = (): RunForwardCandidateInput =>
  buildForwardRun1AdmissionPreflightInput({
    frozenConfiguration: structuredClone(frozenConfiguration),
    historicalTrainingPackage: structuredClone(historical.value),
    futureFeaturePackage: structuredClone(future.value),
    censusPackage: structuredClone(census.value),
    packageAdmissionEvidenceSha256,
    preflightGeneratedAt: materializationLock.artifact_generated_at,
  });

const codes = (input: RunForwardCandidateInput): string[] => {
  const result = runForwardCandidateService(input);
  return result.ok ? [] : result.errors.map((entry) => entry.code);
};

beforeEach(() => {
  fitBoundaryProbe.fit.mockClear();
});

describe('Forward Run 1 exact admission binding', () => {
  it('binds the exact canonical runtime package contents, not the raw Data artifact hash', () => {
    expect(forwardArtifactSha256(
      readFileSync(path.join(repoRoot, FORWARD_RUN1_ORIGIN_PACKAGES_PATH)),
    )).toBe(FORWARD_RUN1_ORIGIN_PACKAGES_SHA256);
    expect(historical.value.content_sha256).toBe(
      '6e131681ceac3a1a61daccab07109dd5281d5260d885a6427dde45e6caf571ba',
    );
    expect(future.value.content_sha256).toBe(
      '7c23a1b562a0bc7909cb560e13ce88faf8943c747b71216e92cf228bb7b1cb52',
    );
    expect(census.value.content_sha256).toBe(
      'ed93d3519c7b9dbccd6fec35ce53bb6c46f7675c698870fc721b4992f32765b4',
    );
    for (const packageValue of [historical.value, future.value, census.value]) {
      expect(computeForwardPinnedPackageSha256<unknown>(packageValue)).toBe(
        packageValue.content_sha256,
      );
      expect(packageValue.content_sha256).not.toBe(FORWARD_BASE_EVAL_SOURCE_SHA256);
      expect(packageValue.normalization_rule_sha256).toBe(
        FORWARD_RUN1_CUTOFF_NORMALIZATION_RULE_SHA256,
      );
      expect(packageValue.owner_repository).toBe(
        'Prometheus-Frameworks/TIBER-Forecast',
      );
      expect(packageValue.owner_commit_sha).toBe(
        materializationLock.materializer_implementation_commit_sha,
      );
      expect(packageValue.source_as_of).toBeNull();
      expect(packageValue.artifact_generated_at).toBe(
        materializationLock.artifact_generated_at,
      );
      expect(packageValue.governance_marker_ref).toMatchObject({
        uri_or_path: FORWARD_RUN1_PACKAGE_ADMISSION_EVIDENCE_PATH,
        content_sha256: packageAdmissionEvidenceSha256,
      });
    }
    expect(forwardArtifactSha256(historical.bytes)).toBe(
      '53ce8aca8e40f14f2f4515b1434b3a2ee49ef2c8cc120272e1acb948d608c17d',
    );
    expect(forwardArtifactSha256(future.bytes)).toBe(
      '50d43925c62676cf4cfbf3060f6f256a5a9c38e19d9afbf907a5540942639671',
    );
    expect(forwardArtifactSha256(census.bytes)).toBe(
      'b628138ff2c9c5cbfb3de44c9e40b3e357e5876ea5c0a5520b542f55247cbd4c',
    );
    expect(historical.value.content.payload.rows).toHaveLength(1802);
    expect(future.value.content.payload.rows).toHaveLength(610);
    expect(census.value.content.payload.rows).toHaveLength(658);
    expect(future.value.population).toEqual({
      row_count: 658,
      matched_count: 610,
      missing_count: 48,
    });
  });

  it('reaches the unchanged runtime fit boundary without fitting or emitting Forward Run 1', () => {
    const input = makeInput();
    expect(() => runForwardCandidateService(input)).toThrow(
      fitBoundaryProbe.sentinel,
    );
    expect(fitBoundaryProbe.fit).toHaveBeenCalledTimes(1);
    expect(input.forecast_cutoff).toBe(FORWARD_RUN1_FORECAST_CUTOFF);
    expect(input.census_package.content.payload.effective_at).toBe(
      FORWARD_RUN1_FORECAST_CUTOFF,
    );
  });

  it('pins package-level admission and scoring evidence to the same local artifact', () => {
    expect(packageAdmissionEvidence.value.package_admission.packages).toEqual(
      [historical.value, future.value, census.value].map((packageValue) => ({
        input_id: packageValue.input_id,
        artifact_type: packageValue.artifact_type,
        artifact_version: packageValue.artifact_version,
        uri_or_path: packageValue.uri_or_path,
        runtime_content_sha256: packageValue.content_sha256,
      })),
    );
    expect(
      packageAdmissionEvidence.value.scoring_reconciliation
        .source_input_runtime_content_sha256s,
    ).toEqual([
      historical.value.content_sha256,
      future.value.content_sha256,
    ]);
    const input = makeInput();
    expect(input.scoring_reconciliation.evidence_ref).toMatchObject({
      repository: 'Prometheus-Frameworks/TIBER-Forecast',
      path: FORWARD_RUN1_PACKAGE_ADMISSION_EVIDENCE_PATH,
      content_sha256: packageAdmissionEvidenceSha256,
    });
  });

  it('keeps the runtime admission implementation byte-identical to the 813eff freeze', () => {
    const expected = {
      'src/services/runForwardCandidateService.ts':
        'aa25942d32be6e68f2715dec6c4ab975c5f1ad19f26e338367b86a9d80ded120',
      'src/contracts/forwardSeasonalPpr.ts':
        'e8ff1517245637cbee7dbac15083ea9bd309fc067104c2db0597d330fb548028',
      'src/contracts/genericFullPprProfile.ts':
        '1ae11ec59cd4dd13820215e4d46a9e72504c971bf5c9edfcfe793f8edaa45361',
      'src/models/seasonal/forwardRidgeModel.ts':
        '466e5af268bd0abdb167a5f3d0128bb52d09ab274c8c410e8fd95aba6566bdef',
      'src/serialization/canonicalForwardArtifacts.ts':
        '52b2ff19bd11f69558b20cb69e508603bf7cc292688a20eebb19447cddf5619f',
      'src/services/result.ts':
        '94ac69e6a0c7096fcb986def83a74ec05ca9ba92e27eed47a2366deb5a6d4e23',
    } as const;
    for (const [filePath, expectedSha256] of Object.entries(expected)) {
      expect(sha256(readFileSync(path.join(repoRoot, filePath)))).toBe(
        expectedSha256,
      );
    }
  });

  it('echoes the exact cutoff and runtime package hashes in the binding artifact', () => {
    expect(binding.activation_block.forecast_cutoff).toBe(
      FORWARD_RUN1_FORECAST_CUTOFF,
    );
    expect(binding.activation_block.fitted_training_input_refs[0].content_sha256)
      .toBe(historical.value.content_sha256);
    expect(binding.activation_block.future_feature_input_refs[0].content_sha256)
      .toBe(future.value.content_sha256);
    expect(binding.activation_block.population_census_sha256)
      .toBe(census.value.content_sha256);
    expect(binding.census_binding).toMatchObject({
      census_sha256: census.value.content_sha256,
      effective_at: FORWARD_RUN1_FORECAST_CUTOFF,
      eligibility_policy_sha256:
        'dad50a5445cda84ac5c100ef27dcb50c0137ba0b74b0c8e1a007e2c914106766',
    });
    expect(binding.cutoff_dependency_evidence).toMatchObject({
      data_commit_available_at: '2026-07-28T00:47:06.000Z',
      forecast_commit_available_at: FORWARD_RUN1_FORECAST_CUTOFF,
    });
    expect(binding.scoring_reconciliation_binding.source_input_sha256s).toEqual([
      historical.value.content_sha256,
      future.value.content_sha256,
    ]);
    expect(binding.scoring_reconciliation_binding.evidence_ref).toMatchObject({
      repository: 'Prometheus-Frameworks/TIBER-Forecast',
      path: FORWARD_RUN1_PACKAGE_ADMISSION_EVIDENCE_PATH,
      content_sha256: packageAdmissionEvidenceSha256,
    });
    expect(binding.package_admission_evidence).toMatchObject({
      artifact_file_sha256: packageAdmissionEvidenceSha256,
      uri_or_path: FORWARD_RUN1_PACKAGE_ADMISSION_EVIDENCE_PATH,
    });
  });

  it('pins a cutoff record for every knowledge-bearing source of the future-feature package', () => {
    // The future package derives feature values from the coverage artifact
    // and row scoping (population_row_id, canonical_player_id, position)
    // from the census artifact. Both must carry package-level cutoff
    // evidence at the governed Data commit.
    const knowledgeBearingSources = [
      { path: FORWARD_BASE_EVAL_SOURCE_ARTIFACT_PATH, sha256: FORWARD_BASE_EVAL_SOURCE_SHA256 },
      { path: FORWARD_RUN1_CENSUS_SOURCE_PATH, sha256: FORWARD_RUN1_CENSUS_SOURCE_SHA256 },
    ] as const;
    const records = future.value.content.cutoff_records;
    expect(records).toHaveLength(knowledgeBearingSources.length);
    for (const source of knowledgeBearingSources) {
      const record = records.find((candidate) =>
        candidate.evidence_ref.uri_or_path ===
          `Prometheus-Frameworks/TIBER-Data@${FORWARD_BASE_EVAL_SOURCE_COMMIT}:${source.path}`);
      expect(record).toBeDefined();
      expect(record?.evidence_ref.content_sha256).toBe(source.sha256);
      expect(record?.fact_available_at).toBe(FORWARD_RUN1_DATA_COMMIT_AVAILABLE_AT);
      expect(Date.parse(record?.fact_available_at ?? '')).toBeLessThanOrEqual(
        Date.parse(FORWARD_RUN1_FORECAST_CUTOFF),
      );
    }
    // The completed provenance still admits through the unchanged runtime
    // path to the test-only fit boundary without executing Forward Run 1.
    expect(() => runForwardCandidateService(makeInput())).toThrow(
      fitBoundaryProbe.sentinel,
    );
    expect(fitBoundaryProbe.fit).toHaveBeenCalledTimes(1);
  });

  it('fails closed one millisecond before the controlling Forecast dependency', () => {
    const input = makeInput();
    input.forecast_cutoff = '2026-07-29T22:16:01.999Z';
    expect(codes(input)).toContain('FORWARD_DECISION_FREEZE_POST_CUTOFF');
    expect(fitBoundaryProbe.fit).not.toHaveBeenCalled();
  });

  it('rejects a millisecond-free timestamp instead of normalizing it silently', () => {
    const input = makeInput();
    input.forecast_cutoff = '2026-07-29T22:16:02Z';
    expect(codes(input)).toContain('FORWARD_TIMESTAMP_INVALID');
    expect(fitBoundaryProbe.fit).not.toHaveBeenCalled();
  });

  it('rejects scoring-package selection or reconciliation drift', () => {
    const missingFuture = makeInput();
    missingFuture.scoring_input_ids = [
      missingFuture.historical_training_package.input_id,
    ];
    expect(codes(missingFuture)).toContain(
      'FORWARD_SCORING_RECONCILIATION_SOURCE_MISMATCH',
    );

    const rawDataHash = makeInput();
    rawDataHash.scoring_reconciliation = {
      ...rawDataHash.scoring_reconciliation,
      source_input_sha256s: [FORWARD_BASE_EVAL_SOURCE_SHA256],
    };
    expect(codes(rawDataHash)).toContain(
      'FORWARD_SCORING_RECONCILIATION_SOURCE_MISMATCH',
    );
    expect(fitBoundaryProbe.fit).not.toHaveBeenCalled();
  });

  it('keeps the package builder outside every execution surface', () => {
    const source = readFileSync(
      path.join(repoRoot, 'scripts/buildForwardRun1AdmissionPackages.ts'),
      'utf8',
    );
    expect(source).not.toMatch(/\brunForwardCandidateService\s*\(/);
    expect(source).not.toMatch(/\bfitSeasonalForwardModel\s*\(/);
  });
});
