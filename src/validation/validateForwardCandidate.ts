import {
  FORWARD_FORECAST_STATUSES,
  FORWARD_UNCERTAINTY_STATUS,
  classifyForwardManifestDocument,
  isForwardExecutionDocument,
  isForwardSchemaExampleDocument,
  type ForwardCandidateValidationErrorCode,
  type ForwardCandidateValidationIssue,
  type ForwardLocalCandidateValidationResult,
} from '../contracts/forwardSeasonalPpr.js';
import {
  validateFittedSeasonalForwardRidgeArtifact,
} from '../models/seasonal/forwardRidgeModel.js';
import {
  canonicalForwardJsonBytes,
  canonicalForwardJsonlBytes,
  compareForwardCanonicalStrings,
  forwardArtifactSha256,
} from '../serialization/canonicalForwardArtifacts.js';
import {
  runForwardCandidateService,
  type RunForwardCandidateInput,
} from '../services/runForwardCandidateService.js';

export const FORWARD_CANDIDATE_VALIDATOR_ID =
  'forward-candidate-local-validator-v1' as const;
export const FORWARD_CANDIDATE_VALIDATOR_VERSION = '1.0.0' as const;

export interface ValidateForwardCandidateInput {
  manifestBytes: Uint8Array;
  playerRowsBytes: Uint8Array;
  fittedModelBytes: Uint8Array;
  context: RunForwardCandidateInput;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const issue = (
  code: ForwardCandidateValidationErrorCode,
  path: string,
  message: string,
): ForwardCandidateValidationIssue => ({ code, path, message });

const parseCanonicalJson = (
  bytesValue: Uint8Array,
  path: string,
  errors: ForwardCandidateValidationIssue[],
): unknown => {
  const bytes = Buffer.from(bytesValue);
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString('utf8')) as unknown;
  } catch (parseError) {
    errors.push(issue(
      'canonical_bytes_invalid',
      path,
      `Invalid UTF-8 JSON: ${parseError instanceof Error ? parseError.message : 'parse failure'}.`,
    ));
    return null;
  }
  try {
    if (!canonicalForwardJsonBytes(parsed).equals(bytes)) {
      errors.push(issue(
        'canonical_bytes_invalid',
        path,
        'JSON bytes are not the canonical compact UTF-8 representation with exactly one trailing LF.',
      ));
    }
  } catch (serializationError) {
    errors.push(issue(
      'canonical_bytes_invalid',
      path,
      serializationError instanceof Error ? serializationError.message : 'Canonical reserialization failed.',
    ));
  }
  return parsed;
};

const parseCanonicalJsonl = (
  bytesValue: Uint8Array,
  path: string,
  errors: ForwardCandidateValidationIssue[],
): unknown[] => {
  const bytes = Buffer.from(bytesValue);
  if (bytes.length === 0) {
    errors.push(issue('player_rows_invalid', path, 'Succeeded candidate player JSONL cannot be empty.'));
    return [];
  }
  const text = bytes.toString('utf8');
  if (!text.endsWith('\n') || text.endsWith('\n\n')) {
    errors.push(issue('canonical_bytes_invalid', path, 'JSONL requires exactly one LF after every row and no blank trailing row.'));
  }
  const lines = text.endsWith('\n') ? text.slice(0, -1).split('\n') : text.split('\n');
  const rows: unknown[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].length === 0) {
      errors.push(issue('canonical_bytes_invalid', `${path}[${index}]`, 'Blank JSONL rows are forbidden.'));
      continue;
    }
    try {
      rows.push(JSON.parse(lines[index]) as unknown);
    } catch (parseError) {
      errors.push(issue(
        'canonical_bytes_invalid',
        `${path}[${index}]`,
        `Invalid JSONL row: ${parseError instanceof Error ? parseError.message : 'parse failure'}.`,
      ));
    }
  }
  try {
    if (!canonicalForwardJsonlBytes(rows).equals(bytes)) {
      errors.push(issue(
        'canonical_bytes_invalid',
        path,
        'Player JSONL bytes or row order are not canonical.',
      ));
    }
  } catch (serializationError) {
    errors.push(issue(
      'canonical_bytes_invalid',
      path,
      serializationError instanceof Error ? serializationError.message : 'Canonical JSONL reserialization failed.',
    ));
  }
  return rows;
};

const addContextFailureIssues = (
  context: RunForwardCandidateInput,
  errors: ForwardCandidateValidationIssue[],
) => {
  const rebuilt = runForwardCandidateService(context);
  if (!rebuilt.ok) {
    for (const serviceError of rebuilt.errors) {
      const lowerCode = serviceError.code.toLowerCase();
      const category: ForwardCandidateValidationErrorCode =
        lowerCode.includes('cutoff') || lowerCode.includes('freeze')
          ? 'cutoff_invalid'
          : lowerCode.includes('scoring')
            ? 'scoring_reconciliation_invalid'
            : lowerCode.includes('population') || lowerCode.includes('census') || lowerCode.includes('feature_row')
              ? 'population_reconciliation_invalid'
              : lowerCode.includes('pin') || lowerCode.includes('configuration') || lowerCode.includes('input')
                ? 'pin_mismatch'
                : lowerCode.includes('fit') || lowerCode.includes('training') || lowerCode.includes('inference')
                  ? 'fitted_model_invalid'
                  : 'manifest_invalid';
      errors.push(issue(
        category,
        '$.validation_context',
        `[${serviceError.code}] ${serviceError.message}`,
      ));
    }
  }
  return rebuilt;
};

const stringArray = (value: unknown): string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === 'string')
    ? value as string[]
    : [];

const validatePlayerRows = (
  rows: unknown[],
  manifest: Record<string, unknown>,
  context: RunForwardCandidateInput,
  errors: ForwardCandidateValidationIssue[],
): void => {
  const rowIds: string[] = [];
  const seen = new Set<string>();
  const statusCounts = Object.fromEntries(
    FORWARD_FORECAST_STATUSES.map((status) => [status, 0]),
  ) as Record<string, number>;
  const canonicalCounts = new Map<string, number>();

  rows.forEach((rowValue, index) => {
    const path = `$.player_rows[${index}]`;
    if (!isRecord(rowValue)) {
      errors.push(issue('player_rows_invalid', path, 'Player row must be an object.'));
      return;
    }
    const rowId = rowValue.population_row_id;
    if (typeof rowId !== 'string' || rowId.length === 0) {
      errors.push(issue('player_rows_invalid', `${path}.population_row_id`, 'population_row_id must be non-empty.'));
    } else {
      rowIds.push(rowId);
      if (seen.has(rowId)) {
        errors.push(issue('population_reconciliation_invalid', `${path}.population_row_id`, `Duplicate population row ${rowId}.`));
      }
      seen.add(rowId);
    }

    if (rowValue.actual_outcome !== null) {
      errors.push(issue('player_rows_invalid', `${path}.actual_outcome`, 'Forward actual_outcome must always be null.'));
    }
    const status = isRecord(rowValue.status) ? rowValue.status : {};
    const forecastStatus = status.forecast;
    if (
      typeof forecastStatus !== 'string' ||
      !FORWARD_FORECAST_STATUSES.includes(forecastStatus as typeof FORWARD_FORECAST_STATUSES[number])
    ) {
      errors.push(issue('player_rows_invalid', `${path}.status.forecast`, 'Unknown forecast status.'));
      return;
    }
    statusCounts[forecastStatus] += 1;
    const forecast = isRecord(rowValue.forecast) ? rowValue.forecast : {};
    const point = forecast.generic_ppr_points;
    const ranges = [
      forecast.lower_quantile,
      forecast.median,
      forecast.upper_quantile,
      forecast.interval_lower,
      forecast.interval_upper,
    ];
    if (forecastStatus === 'forecast_available') {
      if (typeof point !== 'number' || !Number.isFinite(point)) {
        errors.push(issue('player_rows_invalid', `${path}.forecast.generic_ppr_points`, 'Available row requires one finite point forecast.'));
      }
      if (
        status.identity !== 'resolved' ||
        status.eligibility !== 'eligible' ||
        status.position_domain !== 'supported'
      ) {
        errors.push(issue('player_rows_invalid', `${path}.status`, 'Available row requires resolved, eligible, supported status.'));
      }
    } else {
      if (point !== null) {
        errors.push(issue('player_rows_invalid', `${path}.forecast.generic_ppr_points`, 'Unavailable/unsupported row cannot carry a point forecast.'));
      }
      if (!Array.isArray(rowValue.status_reasons) || rowValue.status_reasons.length === 0) {
        errors.push(issue('player_rows_invalid', `${path}.status_reasons`, 'Every non-available row requires a typed reason and evidence.'));
      } else {
        for (const [reasonIndex, reasonValue] of rowValue.status_reasons.entries()) {
          if (
            !isRecord(reasonValue) ||
            !Array.isArray(reasonValue.evidence_refs) ||
            reasonValue.evidence_refs.length === 0
          ) {
            errors.push(issue('player_rows_invalid', `${path}.status_reasons[${reasonIndex}]`, 'Status reason requires source/evidence refs.'));
          }
        }
      }
    }
    if (ranges.some((value) => value !== null)) {
      errors.push(issue('player_rows_invalid', `${path}.forecast`, 'Point-only v1 requires every range field to remain null.'));
    }
    const player = isRecord(rowValue.player) ? rowValue.player : {};
    if (
      (status.position_domain === 'unsupported' || player.position === 'IDP') &&
      point !== null
    ) {
      errors.push(issue('player_rows_invalid', `${path}.forecast`, 'IDP/unsupported domains cannot receive offensive forecast values.'));
    }
    if (status.identity === 'resolved' && typeof player.canonical_player_id === 'string') {
      canonicalCounts.set(
        player.canonical_player_id,
        (canonicalCounts.get(player.canonical_player_id) ?? 0) + 1,
      );
    }
  });

  const sortedIds = [...rowIds].sort(compareForwardCanonicalStrings);
  if (JSON.stringify(rowIds) !== JSON.stringify(sortedIds)) {
    errors.push(issue('canonical_bytes_invalid', '$.player_rows', 'Player rows must be ascending by population_row_id.'));
  }
  const censusIds = context.census_package.content.payload.rows
    .map((row) => row.population_row_id)
    .sort(compareForwardCanonicalStrings);
  const missing = censusIds.filter((id) => !seen.has(id));
  const extra = rowIds.filter((id) => !censusIds.includes(id));
  if (missing.length > 0) {
    errors.push(issue('population_reconciliation_invalid', '$.player_rows', `Missing census rows: ${missing.join(', ')}.`));
  }
  if (extra.length > 0) {
    errors.push(issue('population_reconciliation_invalid', '$.player_rows', `Extra output rows: ${extra.join(', ')}.`));
  }

  const population = isRecord(manifest.population_census) ? manifest.population_census : {};
  if (population.row_count !== censusIds.length || population.row_count === 0) {
    errors.push(issue('population_reconciliation_invalid', '$.population_census.row_count', 'Succeeded census row_count must be nonzero and exact.'));
  }
  if (
    typeof population.eligible_target_count !== 'number' ||
    population.eligible_target_count <= 0
  ) {
    errors.push(issue('population_reconciliation_invalid', '$.population_census.eligible_target_count', 'Succeeded eligible_target_count must be nonzero.'));
  }
  if (!isRecord(population.status_counts)) {
    errors.push(issue('population_reconciliation_invalid', '$.population_census.status_counts', 'Status counts are required.'));
  } else {
    for (const status of FORWARD_FORECAST_STATUSES) {
      if (population.status_counts[status] !== statusCounts[status]) {
        errors.push(issue('population_reconciliation_invalid', `$.population_census.status_counts.${status}`, 'Declared status count does not match rows.'));
      }
    }
    const declaredValues = Object.values(population.status_counts);
    const declaredSum = declaredValues.every((value) => typeof value === 'number')
      ? (declaredValues as number[]).reduce((sum, value) => sum + value, 0)
      : Number.NaN;
    if (declaredSum !== rows.length) {
      errors.push(issue('population_reconciliation_invalid', '$.population_census.status_counts', 'Status counts do not sum to census count.'));
    }
  }
  const reconciliation = isRecord(population.reconciliation) ? population.reconciliation : {};
  if (
    reconciliation.output_row_count !== rows.length ||
    reconciliation.one_to_one_complete !== true ||
    stringArray(reconciliation.duplicate_population_row_ids).length !== 0 ||
    stringArray(reconciliation.duplicate_resolved_canonical_ids).length !== 0 ||
    stringArray(reconciliation.missing_population_row_ids).length !== 0 ||
    stringArray(reconciliation.extra_population_row_ids).length !== 0
  ) {
    errors.push(issue('population_reconciliation_invalid', '$.population_census.reconciliation', 'Population reconciliation is not exact one-to-one.'));
  }
  const duplicatePolicy = isRecord(population.duplicate_canonical_id_policy)
    ? population.duplicate_canonical_id_policy
    : {};
  const maximum = duplicatePolicy.max_rows_per_resolved_canonical_id;
  if (typeof maximum !== 'number' || !Number.isInteger(maximum) || maximum < 1) {
    errors.push(issue('population_reconciliation_invalid', '$.population_census.duplicate_canonical_id_policy', 'Duplicate canonical-ID policy is invalid.'));
  } else {
    for (const [canonicalId, count] of canonicalCounts) {
      if (count > maximum) {
        errors.push(issue('population_reconciliation_invalid', '$.player_rows', `${canonicalId} exceeds the declared duplicate canonical-ID policy.`));
      }
    }
  }
};

export const validateForwardCandidate = (
  input: ValidateForwardCandidateInput,
): ForwardLocalCandidateValidationResult => {
  const errors: ForwardCandidateValidationIssue[] = [];
  const manifest = parseCanonicalJson(input.manifestBytes, '$.manifest_bytes', errors);
  const rows = parseCanonicalJsonl(input.playerRowsBytes, '$.player_rows_bytes', errors);
  const fittedModel = parseCanonicalJson(input.fittedModelBytes, '$.fitted_model_bytes', errors);
  const manifestHash = forwardArtifactSha256(input.manifestBytes);
  const playerRowsHash = forwardArtifactSha256(input.playerRowsBytes);
  const fittedModelHash = forwardArtifactSha256(input.fittedModelBytes);

  if (isForwardSchemaExampleDocument(manifest)) {
    errors.push(issue('schema_example_not_execution', '$.manifest.document_kind', 'The PR #166 schema example is categorically not an execution.'));
  } else if (!isForwardExecutionDocument(manifest)) {
    errors.push(issue(
      classifyForwardManifestDocument(manifest) === 'invalid'
        ? 'document_variant_mixed'
        : 'manifest_invalid',
      '$.manifest',
      'Manifest does not have the strict candidate execution discriminant and safety literals.',
    ));
  }

  const manifestRecord = isRecord(manifest) ? manifest : {};
  if (manifestRecord.run_status !== 'succeeded') {
    errors.push(issue('manifest_invalid', '$.manifest.run_status', 'Candidate bundle validator requires a succeeded execution manifest.'));
  }
  const uncertainty = isRecord(manifestRecord.forecast_uncertainty)
    ? manifestRecord.forecast_uncertainty
    : {};
  if (uncertainty.status !== FORWARD_UNCERTAINTY_STATUS) {
    errors.push(issue('candidate_safety_literal_invalid', '$.manifest.forecast_uncertainty.status', 'Candidate uncertainty must be unavailable_not_calibrated.'));
  }

  const fittedValidation = validateFittedSeasonalForwardRidgeArtifact(fittedModel);
  if (!fittedValidation.ok) {
    errors.push(issue('fitted_model_invalid', '$.fitted_model', fittedValidation.errors.join('; ')));
  }
  const finalFit = isRecord(manifestRecord.final_fit) ? manifestRecord.final_fit : {};
  const modelRef = isRecord(finalFit.model_artifact_ref) ? finalFit.model_artifact_ref : {};
  if (modelRef.content_sha256 !== fittedModelHash) {
    errors.push(issue('pin_mismatch', '$.manifest.final_fit.model_artifact_ref.content_sha256', 'Fitted-model ref does not match actual fitted-model bytes.'));
  }
  if (
    fittedValidation.ok &&
    (
      modelRef.configuration_sha256 !== fittedValidation.data.configuration_sha256 ||
      modelRef.model_id !== fittedValidation.data.model_id ||
      modelRef.model_version !== fittedValidation.data.model_version
    )
  ) {
    errors.push(issue('pin_mismatch', '$.manifest.final_fit.model_artifact_ref', 'Fitted-model identity/configuration pins disagree with actual model bytes.'));
  }
  const outputs = Array.isArray(manifestRecord.outputs) ? manifestRecord.outputs : [];
  if (outputs.length !== 1 || !isRecord(outputs[0])) {
    errors.push(issue('manifest_invalid', '$.manifest.outputs', 'Succeeded v1 requires exactly one player-row output ref.'));
  } else {
    if (outputs[0].content_sha256 !== playerRowsHash) {
      errors.push(issue('pin_mismatch', '$.manifest.outputs[0].content_sha256', 'Player output ref does not match actual JSONL bytes.'));
    }
    if (outputs[0].row_count !== rows.length) {
      errors.push(issue('population_reconciliation_invalid', '$.manifest.outputs[0].row_count', 'Player output row_count does not match JSONL.'));
    }
  }

  let rebuilt: ReturnType<typeof runForwardCandidateService> | null = null;
  try {
    validatePlayerRows(rows, manifestRecord, input.context, errors);
    rebuilt = addContextFailureIssues(input.context, errors);
  } catch (contextError) {
    errors.push(issue(
      'manifest_invalid',
      '$.validation_context',
      `[FORWARD_VALIDATION_CONTEXT_INVALID] Validation context was malformed: ${
        contextError instanceof Error ? contextError.message : 'unknown runtime validation failure'
      }.`,
    ));
  }
  if (rebuilt?.ok) {
    if (!Buffer.from(input.fittedModelBytes).equals(rebuilt.data.bytes.fitted_model)) {
      errors.push(issue('fitted_model_invalid', '$.fitted_model_bytes', 'Fitted-model bytes do not match a deterministic rebuild from exact context.'));
    }
    if (!Buffer.from(input.playerRowsBytes).equals(rebuilt.data.bytes.player_rows)) {
      errors.push(issue('player_rows_invalid', '$.player_rows_bytes', 'Player-row bytes do not match a deterministic rebuild from exact context.'));
    }
    if (!Buffer.from(input.manifestBytes).equals(rebuilt.data.bytes.manifest)) {
      errors.push(issue('pin_mismatch', '$.manifest_bytes', 'Manifest bytes do not match a deterministic rebuild from exact context and pins.'));
    }
  }

  return {
    validator_id: FORWARD_CANDIDATE_VALIDATOR_ID,
    validator_version: FORWARD_CANDIDATE_VALIDATOR_VERSION,
    valid: errors.length === 0,
    candidate_only: true,
    promotion_authority: false,
    manifest_sha256: manifestHash,
    player_rows_sha256: playerRowsHash,
    fitted_model_sha256: fittedModelHash,
    errors,
    warnings: [],
  };
};
