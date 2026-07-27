import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  FORWARD_CONSUMER_ELIGIBILITY,
  FORWARD_MANIFEST_ARTIFACT_TYPE,
  FORWARD_MANIFEST_ARTIFACT_VERSION,
  FORWARD_OUTPUT_KIND,
  FORWARD_SCHEMA_EXAMPLE_MANIFEST_VERSION,
  FORWARD_UNCERTAINTY_STATUS,
  classifyForwardManifestDocument,
  isForwardExecutionDocument,
  isForwardSchemaExampleDocument,
  type ForwardLocalCandidateValidationResult,
} from '../src/contracts/forwardSeasonalPpr.js';

const repoRoot = path.resolve(import.meta.dirname, '..');
const proposalSample = JSON.parse(
  readFileSync(
    path.join(
      repoRoot,
      'data/fixtures/seasonalPpr/forecast_2026_forward_manifest.sample.json',
    ),
    'utf8',
  ),
) as unknown;

const candidateHeader = (): Record<string, unknown> => ({
  artifact_type: FORWARD_MANIFEST_ARTIFACT_TYPE,
  artifact_version: FORWARD_MANIFEST_ARTIFACT_VERSION,
  document_kind: 'execution_manifest',
  run_status: 'succeeded',
  output_kind: FORWARD_OUTPUT_KIND,
  candidate_only: true,
  production_ready: false,
  consumer_eligibility: FORWARD_CONSUMER_ELIGIBILITY,
  forecast_cutoff: '2099-08-01T16:00:00.000Z',
  forecast_uncertainty: {
    status: FORWARD_UNCERTAINTY_STATUS,
  },
  outputs: [
    {
      artifact_type: 'seasonal_fantasy_point_forecast_player',
      artifact_version: 'seasonal-fantasy-point-forecast-player-v1',
      uri_or_path: 'fixture-forward-candidate-players.jsonl',
      content_sha256: 'a'.repeat(64),
      row_count: 1,
    },
  ],
});

describe('forward candidate manifest discriminants', () => {
  it('recognizes the merged PR #166 sample as a schema example, never an execution', () => {
    expect(isForwardSchemaExampleDocument(proposalSample)).toBe(true);
    expect(isForwardExecutionDocument(proposalSample)).toBe(false);
    expect(classifyForwardManifestDocument(proposalSample)).toBe('schema_example');

    if (isForwardSchemaExampleDocument(proposalSample)) {
      expect(proposalSample.artifact_version).toBe(
        FORWARD_SCHEMA_EXAMPLE_MANIFEST_VERSION,
      );
      expect(proposalSample.run_status).toBe('not_executed');
      expect(proposalSample.sample_only).toBe(true);
      expect(proposalSample.forecast_cutoff).toBeNull();
      expect(proposalSample.outputs).toEqual([]);
    }
  });

  it('recognizes a succeeded execution only with every candidate safety literal', () => {
    const candidate = candidateHeader();
    expect(isForwardExecutionDocument(candidate)).toBe(true);
    expect(classifyForwardManifestDocument(candidate)).toBe('execution_manifest');

    for (const mutation of [
      { candidate_only: false },
      { production_ready: true },
      { consumer_eligibility: 'eligible' },
      { output_kind: 'observed-reality' },
      { sample_only: true },
      {
        forecast_uncertainty: {
          status: 'calibrated',
        },
      },
    ]) {
      expect(isForwardExecutionDocument({ ...candidate, ...mutation })).toBe(
        false,
      );
    }
  });

  it('keeps schema-example and execution fields strictly separated', () => {
    const mixedSample = {
      ...(proposalSample as Record<string, unknown>),
      candidate_only: true,
    };
    expect(isForwardSchemaExampleDocument(mixedSample)).toBe(false);
    expect(classifyForwardManifestDocument(mixedSample)).toBe('invalid');

    const mixedExecution = {
      ...candidateHeader(),
      sample_only: true,
    };
    expect(isForwardExecutionDocument(mixedExecution)).toBe(false);
    expect(classifyForwardManifestDocument(mixedExecution)).toBe('invalid');
  });

  it('requires a failed execution to carry a failure and no player output', () => {
    const failed = {
      ...candidateHeader(),
      run_status: 'failed',
      failure: {
        code: 'fixture_failure',
        message: 'Synthetic contract-test failure.',
      },
      outputs: [],
    };
    expect(isForwardExecutionDocument(failed)).toBe(true);

    expect(
      isForwardExecutionDocument({
        ...failed,
        failure: undefined,
      }),
    ).toBe(false);
    expect(
      isForwardExecutionDocument({
        ...failed,
        outputs: candidateHeader().outputs,
      }),
    ).toBe(false);
  });

  it('defines local validation as candidate-only with no promotion authority', () => {
    const result = {
      validator_id: 'forward-candidate-validator-v1',
      validator_version: '1.0.0',
      valid: false,
      candidate_only: true,
      promotion_authority: false,
      manifest_sha256: null,
      player_rows_sha256: null,
      fitted_model_sha256: null,
      errors: [
        {
          code: 'schema_example_not_execution',
          path: '$.document_kind',
          message: 'A schema example is not an execution.',
        },
      ],
      warnings: [],
    } satisfies ForwardLocalCandidateValidationResult;

    expect(result.candidate_only).toBe(true);
    expect(result.promotion_authority).toBe(false);
    expect(result.valid).toBe(false);
  });
});
