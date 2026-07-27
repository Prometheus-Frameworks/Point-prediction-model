import {
  canonicalForwardJson,
  canonicalForwardJsonBytes,
  compareForwardCanonicalStrings,
  forwardArtifactSha256,
} from '../serialization/canonicalForwardArtifacts.js';
import {
  serviceFailure,
  serviceSuccess,
  type ServiceError,
  type ServiceResult,
} from '../services/result.js';

export const TIBER_GENERIC_FULL_PPR_V1_PROFILE_ID = 'tiber-generic-full-ppr-v1' as const;
export const TIBER_GENERIC_FULL_PPR_V1_PROFILE_VERSION = '1.0.0' as const;
export const TIBER_GENERIC_FULL_PPR_V1_SHA256 =
  'a368b75bf5503558a4f664e0486e2c3cc75c01004d4527fd29ecaa1e247a6274' as const;

export interface GenericFullPprProfileV1 {
  readonly profile_id: typeof TIBER_GENERIC_FULL_PPR_V1_PROFILE_ID;
  readonly profile_version: typeof TIBER_GENERIC_FULL_PPR_V1_PROFILE_VERSION;
  readonly league_specific: false;
  readonly regular_season_only: true;
  readonly weights: {
    readonly reception: 1;
    readonly receiving_yard: 0.1;
    readonly receiving_touchdown: 6;
    readonly rushing_yard: 0.1;
    readonly rushing_touchdown: 6;
    readonly passing_yard: 0.04;
    readonly passing_touchdown: 4;
    readonly interception: -2;
  };
  /** The empty tuple is the accepted PR #166 representation of no bonuses. */
  readonly bonuses: readonly [];
  readonly supported_positions: readonly ['QB', 'RB', 'WR', 'TE'];
  readonly unsupported_domains: readonly ['IDP'];
}

const GENERIC_FULL_PPR_WEIGHTS = Object.freeze({
  reception: 1,
  receiving_yard: 0.1,
  receiving_touchdown: 6,
  rushing_yard: 0.1,
  rushing_touchdown: 6,
  passing_yard: 0.04,
  passing_touchdown: 4,
  interception: -2,
} as const);

const GENERIC_FULL_PPR_BONUSES = Object.freeze([]) as readonly [];
const GENERIC_FULL_PPR_SUPPORTED_POSITIONS = Object.freeze(['QB', 'RB', 'WR', 'TE']) as readonly [
  'QB',
  'RB',
  'WR',
  'TE',
];
const GENERIC_FULL_PPR_UNSUPPORTED_DOMAINS = Object.freeze(['IDP']) as readonly ['IDP'];

/** Immutable forward-only generic full-PPR scoring semantics. */
export const TIBER_GENERIC_FULL_PPR_V1: GenericFullPprProfileV1 = Object.freeze({
  profile_id: TIBER_GENERIC_FULL_PPR_V1_PROFILE_ID,
  profile_version: TIBER_GENERIC_FULL_PPR_V1_PROFILE_VERSION,
  league_specific: false,
  regular_season_only: true,
  weights: GENERIC_FULL_PPR_WEIGHTS,
  bonuses: GENERIC_FULL_PPR_BONUSES,
  supported_positions: GENERIC_FULL_PPR_SUPPORTED_POSITIONS,
  unsupported_domains: GENERIC_FULL_PPR_UNSUPPORTED_DOMAINS,
});

export const TIBER_GENERIC_FULL_PPR_V1_CANONICAL_JSON =
  canonicalForwardJson(TIBER_GENERIC_FULL_PPR_V1);

export const getTiberGenericFullPprV1CanonicalBytes = (): Buffer =>
  canonicalForwardJsonBytes(TIBER_GENERIC_FULL_PPR_V1);

const computedProfileSha256 = forwardArtifactSha256(getTiberGenericFullPprV1CanonicalBytes());
if (computedProfileSha256 !== TIBER_GENERIC_FULL_PPR_V1_SHA256) {
  throw new Error(
    `Pinned ${TIBER_GENERIC_FULL_PPR_V1_PROFILE_ID} hash mismatch: expected ${TIBER_GENERIC_FULL_PPR_V1_SHA256}, computed ${computedProfileSha256}.`,
  );
}

export interface GenericFullPprProfileRef {
  readonly profile_id: typeof TIBER_GENERIC_FULL_PPR_V1_PROFILE_ID;
  readonly profile_version: typeof TIBER_GENERIC_FULL_PPR_V1_PROFILE_VERSION;
  readonly profile_sha256: typeof TIBER_GENERIC_FULL_PPR_V1_SHA256;
  readonly league_specific: false;
}

export const TIBER_GENERIC_FULL_PPR_V1_PROFILE_REF: GenericFullPprProfileRef = Object.freeze({
  profile_id: TIBER_GENERIC_FULL_PPR_V1_PROFILE_ID,
  profile_version: TIBER_GENERIC_FULL_PPR_V1_PROFILE_VERSION,
  profile_sha256: TIBER_GENERIC_FULL_PPR_V1_SHA256,
  league_specific: false,
});

export interface GenericFullPprCompatibilityRequest {
  readonly profile_id: string;
  readonly profile_version: string;
  readonly profile_sha256: string;
  readonly league_specific: boolean;
}

const GENERIC_FULL_PPR_COMPATIBILITY_FIELDS = [
  'profile_id',
  'profile_version',
  'profile_sha256',
  'league_specific',
] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Exact compatibility only. This profile cannot be translated into custom,
 * half-PPR, TE-premium, bonus, or other league-specific semantics.
 */
export const resolveGenericFullPprCompatibility = (
  request: GenericFullPprCompatibilityRequest | unknown,
): ServiceResult<GenericFullPprProfileRef> => {
  const record = isRecord(request) ? request : {};

  if (record.league_specific === true) {
    return serviceFailure({
      code: 'FORWARD_SCORING_LEAGUE_SPECIFIC_UNSUPPORTED',
      message: 'tiber-generic-full-ppr-v1 is generic only; league-specific scoring semantics are unsupported.',
      details: {
        requested_league_specific: true,
        supported_league_specific: false,
        profile_id: TIBER_GENERIC_FULL_PPR_V1_PROFILE_ID,
      },
    });
  }

  if (
    !hasExactFields(record, GENERIC_FULL_PPR_COMPATIBILITY_FIELDS) ||
    record.league_specific !== false ||
    record.profile_id !== TIBER_GENERIC_FULL_PPR_V1_PROFILE_ID ||
    record.profile_version !== TIBER_GENERIC_FULL_PPR_V1_PROFILE_VERSION ||
    record.profile_sha256 !== TIBER_GENERIC_FULL_PPR_V1_SHA256
  ) {
    return serviceFailure({
      code: 'FORWARD_SCORING_PROFILE_INCOMPATIBLE',
      message: 'Requested scoring semantics do not exactly match tiber-generic-full-ppr-v1.',
      details: {
        requested: request,
        expected: TIBER_GENERIC_FULL_PPR_V1_PROFILE_REF,
      },
    });
  }

  return serviceSuccess(TIBER_GENERIC_FULL_PPR_V1_PROFILE_REF);
};

export type ScoringReconciliationStatus = 'passed' | 'failed' | 'unavailable';

export interface ScoringReconciliationEvidenceArtifactRef {
  readonly repository: string;
  readonly path: string;
  readonly artifact_version: string;
  readonly content_sha256: string;
}

export interface ScoringReconciliationEvidenceRef {
  readonly status: ScoringReconciliationStatus;
  readonly validator_id: string;
  readonly validator_version: string;
  readonly evidence_ref: ScoringReconciliationEvidenceArtifactRef;
  readonly scoring_profile_sha256: string;
  /** Sorted, unique hashes of the exact admitted inputs reconciled by the evidence. */
  readonly source_input_sha256s: readonly string[];
}

export interface ScoringReconciliationValidationContext {
  readonly run_status: 'succeeded' | 'failed';
  readonly expected_scoring_profile_sha256: string;
  readonly expected_source_input_sha256s: readonly string[];
}

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const RECONCILIATION_STATUSES: readonly ScoringReconciliationStatus[] = [
  'passed',
  'failed',
  'unavailable',
];
const RECONCILIATION_FIELDS = [
  'status',
  'validator_id',
  'validator_version',
  'evidence_ref',
  'scoring_profile_sha256',
  'source_input_sha256s',
] as const;
const EVIDENCE_REF_FIELDS = [
  'repository',
  'path',
  'artifact_version',
  'content_sha256',
] as const;

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const hasExactFields = (record: Record<string, unknown>, expected: readonly string[]): boolean => {
  const actual = Object.keys(record).sort(compareForwardCanonicalStrings);
  const canonicalExpected = [...expected].sort(compareForwardCanonicalStrings);
  return actual.length === canonicalExpected.length &&
    actual.every((field, index) => field === canonicalExpected[index]);
};

const canonicalUniqueHashes = (values: readonly string[]): string[] =>
  [...new Set(values)].sort(compareForwardCanonicalStrings);

const arraysEqual = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length && left.every((value, index) => value === right[index]);

const freezeReconciliationEvidence = (
  record: Record<string, unknown>,
  evidenceRef: Record<string, unknown>,
  sourceHashes: string[],
): ScoringReconciliationEvidenceRef =>
  Object.freeze({
    status: record.status as ScoringReconciliationStatus,
    validator_id: record.validator_id as string,
    validator_version: record.validator_version as string,
    evidence_ref: Object.freeze({
      repository: evidenceRef.repository as string,
      path: evidenceRef.path as string,
      artifact_version: evidenceRef.artifact_version as string,
      content_sha256: evidenceRef.content_sha256 as string,
    }),
    scoring_profile_sha256: record.scoring_profile_sha256 as string,
    source_input_sha256s: Object.freeze([...sourceHashes]),
  });

/**
 * Runtime validation for a run-specific scoring-reconciliation reference. A
 * succeeded execution must carry a passed reference; a failed execution may
 * terminate before this stage and records attempted scoring pins instead. This
 * validates only the binding/ref contract and does not dereference or claim
 * that any existing TIBER-Data totals conform.
 */
export const validateScoringReconciliationEvidence = (
  value: unknown,
  context: ScoringReconciliationValidationContext,
): ServiceResult<ScoringReconciliationEvidenceRef> => {
  if (!isRecord(value)) {
    return serviceFailure({
      code: 'FORWARD_SCORING_RECONCILIATION_REQUIRED',
      message: 'A scoring-reconciliation evidence reference is required at this validation stage.',
    });
  }

  const errors: ServiceError[] = [];
  if (!hasExactFields(value, RECONCILIATION_FIELDS)) {
    errors.push({
      code: 'FORWARD_SCORING_RECONCILIATION_FIELDS_INVALID',
      message: `Scoring reconciliation fields must be exactly [${RECONCILIATION_FIELDS.join(', ')}].`,
    });
  }

  if (
    typeof value.status !== 'string' ||
    !(RECONCILIATION_STATUSES as readonly string[]).includes(value.status)
  ) {
    errors.push({
      code: 'FORWARD_SCORING_RECONCILIATION_STATUS_INVALID',
      message: 'Scoring reconciliation status must be passed, failed, or unavailable.',
    });
  } else if (context.run_status === 'succeeded' && value.status !== 'passed') {
    errors.push({
      code: 'FORWARD_SCORING_RECONCILIATION_STATUS_INCOMPATIBLE',
      message: 'A succeeded execution requires passed scoring reconciliation.',
    });
  }

  if (!isNonEmptyString(value.validator_id) || !isNonEmptyString(value.validator_version)) {
    errors.push({
      code: 'FORWARD_SCORING_RECONCILIATION_VALIDATOR_INVALID',
      message: 'Scoring reconciliation validator_id and validator_version must be non-empty strings.',
    });
  }

  const evidenceRef = isRecord(value.evidence_ref) ? value.evidence_ref : {};
  if (!isRecord(value.evidence_ref) || !hasExactFields(evidenceRef, EVIDENCE_REF_FIELDS)) {
    errors.push({
      code: 'FORWARD_SCORING_RECONCILIATION_EVIDENCE_REF_INVALID',
      message: `Scoring reconciliation evidence_ref fields must be exactly [${EVIDENCE_REF_FIELDS.join(', ')}].`,
    });
  }
  if (
    !isNonEmptyString(evidenceRef.repository) ||
    !isNonEmptyString(evidenceRef.path) ||
    !isNonEmptyString(evidenceRef.artifact_version) ||
    typeof evidenceRef.content_sha256 !== 'string' ||
    !SHA256_PATTERN.test(evidenceRef.content_sha256)
  ) {
    errors.push({
      code: 'FORWARD_SCORING_RECONCILIATION_EVIDENCE_REF_INVALID',
      message: 'Scoring reconciliation evidence_ref requires repository, path, artifact_version, and lowercase SHA-256.',
    });
  }

  if (
    typeof value.scoring_profile_sha256 !== 'string' ||
    !SHA256_PATTERN.test(value.scoring_profile_sha256) ||
    value.scoring_profile_sha256 !== context.expected_scoring_profile_sha256
  ) {
    errors.push({
      code: 'FORWARD_SCORING_RECONCILIATION_PROFILE_MISMATCH',
      message: 'Scoring reconciliation does not bind the expected scoring profile hash.',
    });
  }

  const declaredHashes = Array.isArray(value.source_input_sha256s)
    ? value.source_input_sha256s
    : [];
  const declaredHashesAreValid = declaredHashes.length > 0 &&
    declaredHashes.every((hash) => typeof hash === 'string' && SHA256_PATTERN.test(hash));
  const canonicalDeclaredHashes = declaredHashesAreValid
    ? canonicalUniqueHashes(declaredHashes as string[])
    : [];
  if (
    !declaredHashesAreValid ||
    !arraysEqual(declaredHashes as string[], canonicalDeclaredHashes)
  ) {
    errors.push({
      code: 'FORWARD_SCORING_RECONCILIATION_SOURCE_HASHES_INVALID',
      message: 'source_input_sha256s must be a non-empty, sorted, unique list of lowercase SHA-256 hashes.',
    });
  }

  const expectedHashesValid = context.expected_source_input_sha256s.length > 0 &&
    context.expected_source_input_sha256s.every((hash) => SHA256_PATTERN.test(hash));
  const canonicalExpectedHashes = expectedHashesValid
    ? canonicalUniqueHashes(context.expected_source_input_sha256s)
    : [];
  if (!expectedHashesValid || !arraysEqual(canonicalDeclaredHashes, canonicalExpectedHashes)) {
    errors.push({
      code: 'FORWARD_SCORING_RECONCILIATION_SOURCE_MISMATCH',
      message: 'Scoring reconciliation source hashes do not exactly match the admitted scoring inputs.',
    });
  }

  if (errors.length > 0) return serviceFailure(errors);
  return serviceSuccess(
    freezeReconciliationEvidence(value, evidenceRef, canonicalDeclaredHashes),
  );
};
