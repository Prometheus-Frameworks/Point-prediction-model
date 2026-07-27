import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type {
  ForwardCandidateValidationErrorCode,
  ForwardLocalCandidateValidationResult,
} from '../src/contracts/forwardSeasonalPpr.js';
import {
  canonicalForwardJsonBytes,
  canonicalForwardJsonlBytes,
  compareForwardCanonicalStrings,
} from '../src/serialization/canonicalForwardArtifacts.js';
import {
  computeForwardPinnedPackageSha256,
  runForwardCandidateService,
  type ForwardCandidateBundle,
  type RunForwardCandidateInput,
} from '../src/services/runForwardCandidateService.js';
import {
  validateForwardCandidate,
} from '../src/validation/validateForwardCandidate.js';
import {
  makeSyntheticForwardRuntimeInput,
  SYNTHETIC_FORWARD_CUTOFF,
} from './fixtures/forwardRuntimeFixtures.js';

type JsonRecord = Record<string, unknown>;

interface BuiltCandidate {
  context: RunForwardCandidateInput;
  bundle: ForwardCandidateBundle;
}

const asRecord = (value: unknown): JsonRecord => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('Expected a JSON object in test fixture.');
  }
  return value as JsonRecord;
};

const parseJsonObject = (bytes: Uint8Array): JsonRecord =>
  asRecord(JSON.parse(Buffer.from(bytes).toString('utf8')) as unknown);

const parseJsonlObjects = (bytes: Uint8Array): JsonRecord[] =>
  Buffer.from(bytes)
    .toString('utf8')
    .trimEnd()
    .split('\n')
    .map((line) => asRecord(JSON.parse(line) as unknown));

const buildCandidate = (): BuiltCandidate => {
  const context = makeSyntheticForwardRuntimeInput();
  const result = runForwardCandidateService(context);
  if (!result.ok) {
    throw new Error(`Synthetic candidate failed to build: ${JSON.stringify(result.errors)}`);
  }
  return { context, bundle: result.data };
};

const validateBuilt = (
  built: BuiltCandidate,
  overrides: Partial<{
    manifestBytes: Uint8Array;
    playerRowsBytes: Uint8Array;
    fittedModelBytes: Uint8Array;
    context: RunForwardCandidateInput;
  }> = {},
): ForwardLocalCandidateValidationResult =>
  validateForwardCandidate({
    manifestBytes: overrides.manifestBytes ?? built.bundle.bytes.manifest,
    playerRowsBytes: overrides.playerRowsBytes ?? built.bundle.bytes.player_rows,
    fittedModelBytes: overrides.fittedModelBytes ?? built.bundle.bytes.fitted_model,
    context: overrides.context ?? built.context,
  });

const errorCodes = (
  result: ForwardLocalCandidateValidationResult,
): ForwardCandidateValidationErrorCode[] =>
  result.errors.map((entry) => entry.code);

const expectInvalidWith = (
  result: ForwardLocalCandidateValidationResult,
  code: ForwardCandidateValidationErrorCode,
): void => {
  expect(result.valid).toBe(false);
  expect(errorCodes(result)).toContain(code);
  expect(result.candidate_only).toBe(true);
  expect(result.promotion_authority).toBe(false);
};

const expectContextServiceError = (
  context: RunForwardCandidateInput,
  serviceCode: string,
  validationCode?: ForwardCandidateValidationErrorCode,
): void => {
  const built = buildCandidate();
  const result = validateBuilt(built, { context });
  expect(result.valid).toBe(false);
  expect(result.errors.some((entry) =>
    entry.message.includes(`[${serviceCode}]`),
  )).toBe(true);
  if (validationCode) {
    expect(errorCodes(result)).toContain(validationCode);
  }
};

const canonicalManifestMutation = (
  bundle: ForwardCandidateBundle,
  mutate: (manifest: JsonRecord) => void,
): Buffer => {
  const manifest = parseJsonObject(bundle.bytes.manifest);
  mutate(manifest);
  return canonicalForwardJsonBytes(manifest);
};

const canonicalPlayerMutation = (
  bundle: ForwardCandidateBundle,
  mutate: (rows: JsonRecord[]) => void,
): Buffer => {
  const rows = parseJsonlObjects(bundle.bytes.player_rows);
  mutate(rows);
  return canonicalForwardJsonlBytes(rows);
};

const canonicalModelMutation = (
  bundle: ForwardCandidateBundle,
  mutate: (model: JsonRecord) => void,
): Buffer => {
  const model = parseJsonObject(bundle.bytes.fitted_model);
  mutate(model);
  return canonicalForwardJsonBytes(model);
};

const rowWithForecastStatus = (
  rows: JsonRecord[],
  forecastStatus: string,
): JsonRecord => {
  const row = rows.find((candidate) =>
    asRecord(candidate.status).forecast === forecastStatus,
  );
  if (!row) throw new Error(`Missing synthetic row with ${forecastStatus}.`);
  return row;
};

const rowWithPopulationId = (
  rows: JsonRecord[],
  populationRowId: string,
): JsonRecord => {
  const row = rows.find((candidate) =>
    candidate.population_row_id === populationRowId,
  );
  if (!row) throw new Error(`Missing synthetic row ${populationRowId}.`);
  return row;
};

const repinPackage = (
  context: RunForwardCandidateInput,
  packageKind: 'historical_training_package' | 'future_feature_package' | 'census_package',
): void => {
  const packageValue = context[packageKind];
  packageValue.content_sha256 =
    computeForwardPinnedPackageSha256<unknown>(packageValue);
  context.expected_pins = {
    ...context.expected_pins,
    input_sha256: {
      ...context.expected_pins.input_sha256,
      [packageValue.input_id]: packageValue.content_sha256,
    },
    ...(packageKind === 'census_package'
      ? { census_sha256: packageValue.content_sha256 }
      : {}),
  };
  context.scoring_reconciliation = {
    ...context.scoring_reconciliation,
    source_input_sha256s: [
      context.historical_training_package.content_sha256,
      context.future_feature_package.content_sha256,
    ].sort(compareForwardCanonicalStrings),
  };
};

describe('validateForwardCandidate', () => {
  it('accepts the exact deterministic synthetic bundle with no promotion authority', () => {
    const built = buildCandidate();
    const result = validateBuilt(built);

    expect(result).toMatchObject({
      valid: true,
      candidate_only: true,
      promotion_authority: false,
      manifest_sha256: built.bundle.hashes.manifest_sha256,
      player_rows_sha256: built.bundle.hashes.player_rows_sha256,
      fitted_model_sha256: built.bundle.hashes.fitted_model_sha256,
      errors: [],
      warnings: [],
    });
  });

  it.each([
    {
      label: 'manifest without its required trailing LF',
      bytes: (built: BuiltCandidate) => ({
        manifestBytes: built.bundle.bytes.manifest.subarray(
          0,
          built.bundle.bytes.manifest.length - 1,
        ),
      }),
    },
    {
      label: 'pretty-printed fitted-model JSON',
      bytes: (built: BuiltCandidate) => ({
        fittedModelBytes: Buffer.from(
          `${JSON.stringify(parseJsonObject(built.bundle.bytes.fitted_model), null, 2)}\n`,
          'utf8',
        ),
      }),
    },
    {
      label: 'player JSONL with an extra blank trailing row',
      bytes: (built: BuiltCandidate) => ({
        playerRowsBytes: Buffer.concat([
          built.bundle.bytes.player_rows,
          Buffer.from('\n', 'utf8'),
        ]),
      }),
    },
    {
      label: 'canonically serialized rows in noncanonical population order',
      bytes: (built: BuiltCandidate) => ({
        playerRowsBytes: canonicalForwardJsonlBytes(
          parseJsonlObjects(built.bundle.bytes.player_rows).reverse(),
        ),
      }),
    },
  ])('rejects canonical-byte violation: $label', ({ bytes }) => {
    const built = buildCandidate();
    expectInvalidWith(
      validateBuilt(built, bytes(built)),
      'canonical_bytes_invalid',
    );
  });

  it('categorically rejects the current PR #166 schema example as an execution', () => {
    const built = buildCandidate();
    const sample = JSON.parse(readFileSync(
      new URL(
        '../data/fixtures/seasonalPpr/forecast_2026_forward_manifest.sample.json',
        import.meta.url,
      ),
      'utf8',
    )) as unknown;
    const result = validateBuilt(built, {
      manifestBytes: canonicalForwardJsonBytes(sample),
    });

    expectInvalidWith(result, 'schema_example_not_execution');
  });

  it('rejects schema/execution discriminant mixing', () => {
    const built = buildCandidate();
    const manifestBytes = canonicalManifestMutation(
      built.bundle,
      (manifest) => {
        manifest.sample_only = true;
      },
    );

    expectInvalidWith(
      validateBuilt(built, { manifestBytes }),
      'document_variant_mixed',
    );
  });

  it.each([
    {
      label: 'missing census output row',
      mutate: (rows: JsonRecord[]) => {
        rows.splice(0, 1);
      },
    },
    {
      label: 'duplicate population row',
      mutate: (rows: JsonRecord[]) => {
        rows.push(structuredClone(rows[0]));
        rows.sort((left, right) =>
          compareForwardCanonicalStrings(
            String(left.population_row_id),
            String(right.population_row_id),
          ),
        );
      },
    },
    {
      label: 'extra output row',
      mutate: (rows: JsonRecord[]) => {
        const extra = structuredClone(rows[rows.length - 1]);
        extra.population_row_id = 'zzzz-fixture-pop-extra';
        rows.push(extra);
      },
    },
    {
      label: 'resolved canonical ID above the declared duplicate policy',
      mutate: (rows: JsonRecord[]) => {
        const available = rowWithForecastStatus(rows, 'forecast_available');
        const missing = rowWithForecastStatus(
          rows,
          'unavailable_missing_required_inputs',
        );
        asRecord(missing.player).canonical_player_id =
          asRecord(available.player).canonical_player_id;
      },
    },
  ])('rejects population reconciliation failure: $label', ({ mutate }) => {
    const built = buildCandidate();
    const playerRowsBytes = canonicalPlayerMutation(built.bundle, mutate);

    expectInvalidWith(
      validateBuilt(built, { playerRowsBytes }),
      'population_reconciliation_invalid',
    );
  });

  it.each([
    {
      label: 'zero declared census count',
      mutate: (manifest: JsonRecord) => {
        asRecord(manifest.population_census).row_count = 0;
      },
    },
    {
      label: 'zero declared eligible target count',
      mutate: (manifest: JsonRecord) => {
        asRecord(manifest.population_census).eligible_target_count = 0;
      },
    },
    {
      label: 'status count that disagrees with player rows',
      mutate: (manifest: JsonRecord) => {
        const population = asRecord(manifest.population_census);
        asRecord(population.status_counts).forecast_available = 99;
      },
    },
    {
      label: 'non-one-to-one declared reconciliation',
      mutate: (manifest: JsonRecord) => {
        const population = asRecord(manifest.population_census);
        asRecord(population.reconciliation).one_to_one_complete = false;
      },
    },
    {
      label: 'declared duplicate canonical IDs',
      mutate: (manifest: JsonRecord) => {
        const population = asRecord(manifest.population_census);
        asRecord(population.reconciliation).duplicate_resolved_canonical_ids =
          ['fixture-player-available'];
      },
    },
  ])('rejects manifest population lie: $label', ({ mutate }) => {
    const built = buildCandidate();
    const manifestBytes = canonicalManifestMutation(built.bundle, mutate);

    expectInvalidWith(
      validateBuilt(built, { manifestBytes }),
      'population_reconciliation_invalid',
    );
  });

  it.each([
    {
      label: 'available row without a finite point forecast',
      mutate: (rows: JsonRecord[]) => {
        const row = rowWithForecastStatus(rows, 'forecast_available');
        asRecord(row.forecast).generic_ppr_points = null;
      },
    },
    {
      label: 'unavailable row carrying a point forecast',
      mutate: (rows: JsonRecord[]) => {
        const row = rowWithForecastStatus(
          rows,
          'unavailable_missing_required_inputs',
        );
        asRecord(row.forecast).generic_ppr_points = 123;
      },
    },
    {
      label: 'available row with non-orthogonal eligibility status',
      mutate: (rows: JsonRecord[]) => {
        const row = rowWithForecastStatus(rows, 'forecast_available');
        asRecord(row.status).eligibility = 'ineligible';
      },
    },
    {
      label: 'point-only row carrying an uncertainty range',
      mutate: (rows: JsonRecord[]) => {
        const row = rowWithForecastStatus(rows, 'forecast_available');
        asRecord(row.forecast).lower_quantile = 1;
      },
    },
    {
      label: 'forward row carrying an actual outcome',
      mutate: (rows: JsonRecord[]) => {
        const row = rowWithForecastStatus(rows, 'forecast_available');
        row.actual_outcome = 456;
      },
    },
    {
      label: 'IDP row carrying an offensive forecast',
      mutate: (rows: JsonRecord[]) => {
        const row = rowWithPopulationId(rows, 'fixture-pop-idp');
        asRecord(row.forecast).generic_ppr_points = 10;
      },
    },
    {
      label: 'unavailable row without typed evidence-bearing reasons',
      mutate: (rows: JsonRecord[]) => {
        const row = rowWithForecastStatus(
          rows,
          'unavailable_missing_required_inputs',
        );
        row.status_reasons = [];
      },
    },
  ])('rejects player-row invariant failure: $label', ({ mutate }) => {
    const built = buildCandidate();
    const playerRowsBytes = canonicalPlayerMutation(built.bundle, mutate);

    expectInvalidWith(
      validateBuilt(built, { playerRowsBytes }),
      'player_rows_invalid',
    );
  });

  it.each([
    {
      label: 'manifest fitted-model content hash',
      manifest: (manifest: JsonRecord) => {
        const finalFit = asRecord(manifest.final_fit);
        asRecord(finalFit.model_artifact_ref).content_sha256 = '0'.repeat(64);
      },
    },
    {
      label: 'manifest fitted-model identity',
      manifest: (manifest: JsonRecord) => {
        const finalFit = asRecord(manifest.final_fit);
        asRecord(finalFit.model_artifact_ref).model_id = 'wrong-model-id';
      },
    },
    {
      label: 'manifest player-output content hash',
      manifest: (manifest: JsonRecord) => {
        const outputs = manifest.outputs as JsonRecord[];
        outputs[0].content_sha256 = '0'.repeat(64);
      },
    },
    {
      label: 'manifest execution Git pin',
      manifest: (manifest: JsonRecord) => {
        manifest.git_commit_sha = '0'.repeat(40);
      },
    },
  ])('rejects manifest pin mismatch: $label', ({ manifest }) => {
    const built = buildCandidate();
    const manifestBytes = canonicalManifestMutation(built.bundle, manifest);

    expectInvalidWith(
      validateBuilt(built, { manifestBytes }),
      'pin_mismatch',
    );
  });

  it('rejects fitted-model bytes that differ from their manifest and deterministic fit', () => {
    const built = buildCandidate();
    const fittedModelBytes = canonicalModelMutation(
      built.bundle,
      (model) => {
        const coefficients = model.coefficients as number[];
        coefficients[0] += 0.25;
      },
    );
    const result = validateBuilt(built, { fittedModelBytes });

    expectInvalidWith(result, 'pin_mismatch');
    expect(errorCodes(result)).toContain('fitted_model_invalid');
  });

  it.each([
    {
      label: 'target-bearing future inference row',
      serviceCode: 'FORWARD_INFERENCE_ROWS_INVALID',
      validationCode: 'fitted_model_invalid' as const,
      mutate: (context: RunForwardCandidateInput) => {
        asRecord(
          context.future_feature_package.content.payload.rows[0],
        ).actual_outcome = 999;
        repinPackage(context, 'future_feature_package');
      },
    },
    {
      label: 'null historical training target',
      serviceCode: 'FORWARD_FINAL_FIT_FAILED',
      validationCode: 'fitted_model_invalid' as const,
      mutate: (context: RunForwardCandidateInput) => {
        asRecord(
          context.historical_training_package.content.payload.rows[0],
        ).target = null;
        repinPackage(context, 'historical_training_package');
      },
    },
    {
      label: 'ungoverned admitted package',
      serviceCode: 'FORWARD_INPUT_UNGOVERNED',
      validationCode: 'pin_mismatch' as const,
      mutate: (context: RunForwardCandidateInput) => {
        context.future_feature_package.governance_status = 'fixture';
      },
    },
    {
      label: 'missing governance marker',
      serviceCode: 'FORWARD_INPUT_GOVERNANCE_MARKER_MISSING',
      validationCode: 'pin_mismatch' as const,
      mutate: (context: RunForwardCandidateInput) => {
        context.future_feature_package.governance_marker_ref = null;
      },
    },
    {
      label: 'missing pinned governance decision evidence',
      serviceCode: 'FORWARD_INPUT_GOVERNANCE_EVIDENCE_MISSING',
      validationCode: 'pin_mismatch' as const,
      mutate: (context: RunForwardCandidateInput) => {
        context.future_feature_package.governance_decision_refs = [];
      },
    },
    {
      label: 'unavailable input package',
      serviceCode: 'FORWARD_INPUT_UNAVAILABLE',
      validationCode: 'pin_mismatch' as const,
      mutate: (context: RunForwardCandidateInput) => {
        context.future_feature_package.availability_status = 'unavailable';
      },
    },
    {
      label: 'non-admitted input package',
      serviceCode: 'FORWARD_INPUT_NOT_ADMITTED',
      validationCode: 'pin_mismatch' as const,
      mutate: (context: RunForwardCandidateInput) => {
        context.future_feature_package.model_admission = 'rejected';
      },
    },
    {
      label: 'unresolved record-level availability',
      serviceCode: 'FORWARD_INPUT_CUTOFF_UNRESOLVED',
      validationCode: 'cutoff_invalid' as const,
      mutate: (context: RunForwardCandidateInput) => {
        context.future_feature_package.content.cutoff_records[0].fact_available_at =
          null;
        repinPackage(context, 'future_feature_package');
      },
    },
    {
      label: 'fact first available after the inclusive cutoff',
      serviceCode: 'FORWARD_INPUT_POST_CUTOFF',
      validationCode: 'cutoff_invalid' as const,
      mutate: (context: RunForwardCandidateInput) => {
        context.future_feature_package.content.cutoff_records[0].fact_available_at =
          '2099-07-01T12:00:00.001Z';
        repinPackage(context, 'future_feature_package');
      },
    },
    {
      label: 'decision freeze after cutoff',
      serviceCode: 'FORWARD_DECISION_FREEZE_POST_CUTOFF',
      validationCode: 'cutoff_invalid' as const,
      mutate: (context: RunForwardCandidateInput) => {
        context.decision_freezes.source_code.fact_available_at =
          '2099-07-01T12:00:00.001Z';
      },
    },
    {
      label: 'decision freeze without pinned evidence',
      serviceCode: 'FORWARD_DECISION_FREEZE_EVIDENCE_INVALID',
      validationCode: 'cutoff_invalid' as const,
      mutate: (context: RunForwardCandidateInput) => {
        asRecord(context.decision_freezes.configuration).evidence_refs = [];
      },
    },
    {
      label: 'configuration freeze pin mismatch',
      serviceCode: 'FORWARD_CONFIGURATION_FREEZE_PIN_MISMATCH',
      validationCode: 'cutoff_invalid' as const,
      mutate: (context: RunForwardCandidateInput) => {
        context.decision_freezes.configuration.configuration_sha256 =
          '0'.repeat(64);
      },
    },
    {
      label: 'source-code freeze pin mismatch',
      serviceCode: 'FORWARD_CODE_FREEZE_PIN_MISMATCH',
      validationCode: 'cutoff_invalid' as const,
      mutate: (context: RunForwardCandidateInput) => {
        context.decision_freezes.source_code.git_commit_sha = '0'.repeat(40);
      },
    },
    {
      label: 'failed scoring reconciliation',
      serviceCode: 'FORWARD_SCORING_RECONCILIATION_STATUS_INCOMPATIBLE',
      validationCode: 'scoring_reconciliation_invalid' as const,
      mutate: (context: RunForwardCandidateInput) => {
        context.scoring_reconciliation = {
          ...context.scoring_reconciliation,
          status: 'failed',
        };
      },
    },
    {
      label: 'malformed scoring evidence hash',
      serviceCode: 'FORWARD_SCORING_RECONCILIATION_EVIDENCE_REF_INVALID',
      validationCode: 'scoring_reconciliation_invalid' as const,
      mutate: (context: RunForwardCandidateInput) => {
        context.scoring_reconciliation = {
          ...context.scoring_reconciliation,
          evidence_ref: {
            ...context.scoring_reconciliation.evidence_ref,
            content_sha256: 'not-a-sha256',
          },
        };
      },
    },
    {
      label: 'scoring source binding mismatch',
      serviceCode: 'FORWARD_SCORING_RECONCILIATION_SOURCE_MISMATCH',
      validationCode: 'scoring_reconciliation_invalid' as const,
      mutate: (context: RunForwardCandidateInput) => {
        context.scoring_reconciliation = {
          ...context.scoring_reconciliation,
          source_input_sha256s: ['0'.repeat(64)],
        };
      },
    },
    {
      label: 'execution Git expected pin mismatch',
      serviceCode: 'FORWARD_CODE_PIN_MISMATCH',
      validationCode: 'pin_mismatch' as const,
      mutate: (context: RunForwardCandidateInput) => {
        context.expected_pins = {
          ...context.expected_pins,
          git_commit_sha: '0'.repeat(40),
        };
      },
    },
    {
      label: 'configuration expected pin mismatch',
      serviceCode: 'FORWARD_CONFIGURATION_PIN_MISMATCH',
      validationCode: 'pin_mismatch' as const,
      mutate: (context: RunForwardCandidateInput) => {
        context.expected_pins = {
          ...context.expected_pins,
          configuration_sha256: '0'.repeat(64),
        };
      },
    },
    {
      label: 'input expected pin mismatch',
      serviceCode: 'FORWARD_INPUT_PIN_MISMATCH',
      validationCode: 'pin_mismatch' as const,
      mutate: (context: RunForwardCandidateInput) => {
        context.expected_pins = {
          ...context.expected_pins,
          input_sha256: {
            ...context.expected_pins.input_sha256,
            [context.future_feature_package.input_id]: '0'.repeat(64),
          },
        };
      },
    },
    {
      label: 'census expected pin mismatch',
      serviceCode: 'FORWARD_CENSUS_PIN_MISMATCH',
      validationCode: 'population_reconciliation_invalid' as const,
      mutate: (context: RunForwardCandidateInput) => {
        context.expected_pins = {
          ...context.expected_pins,
          census_sha256: '0'.repeat(64),
        };
      },
    },
    {
      label: 'scoring expected pin mismatch',
      serviceCode: 'FORWARD_SCORING_PIN_MISMATCH',
      validationCode: 'scoring_reconciliation_invalid' as const,
      mutate: (context: RunForwardCandidateInput) => {
        context.expected_pins = {
          ...context.expected_pins,
          scoring_profile_sha256: '0'.repeat(64),
        };
      },
    },
  ])('fails closed on validation context gate: $label', ({
    mutate,
    serviceCode,
    validationCode,
  }) => {
    const context = makeSyntheticForwardRuntimeInput();
    mutate(context);
    expectContextServiceError(context, serviceCode, validationCode);
  });

  it('keeps the cutoff boundary explicit and uses only synthetic future seasons', () => {
    const context = makeSyntheticForwardRuntimeInput();
    expect(SYNTHETIC_FORWARD_CUTOFF).toBe('2099-07-01T12:00:00.000Z');
    expect(context.input_season).toBe(2098);
    expect(context.target_season).toBe(2099);
  });

  it('returns an invalid result instead of throwing for a malformed validation context', () => {
    const built = buildCandidate();
    const context = structuredClone(built.context) as unknown as Record<string, unknown>;
    context.decision_freezes = undefined;

    expect(() => validateBuilt(built, {
      context: context as unknown as RunForwardCandidateInput,
    })).not.toThrow();

    const result = validateBuilt(built, {
      context: context as unknown as RunForwardCandidateInput,
    });
    expectInvalidWith(result, 'manifest_invalid');
    expect(result.errors.some((entry) =>
      entry.message.includes('[FORWARD_VALIDATION_CONTEXT_INVALID]'),
    )).toBe(true);
  });
});
