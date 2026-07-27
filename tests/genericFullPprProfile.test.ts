import { describe, expect, it } from 'vitest';
import {
  TIBER_GENERIC_FULL_PPR_V1,
  TIBER_GENERIC_FULL_PPR_V1_CANONICAL_JSON,
  TIBER_GENERIC_FULL_PPR_V1_PROFILE_REF,
  TIBER_GENERIC_FULL_PPR_V1_SHA256,
  getTiberGenericFullPprV1CanonicalBytes,
  resolveGenericFullPprCompatibility,
  validateScoringReconciliationEvidence,
  type ScoringReconciliationEvidenceRef,
} from '../src/contracts/genericFullPprProfile.js';
import { computePprPoints } from '../src/contracts/tiberDataWeeklyOutcomes.js';
import { scoringSystem } from '../src/core/scoringSystem.js';
import { forwardArtifactSha256 } from '../src/serialization/canonicalForwardArtifacts.js';

const PROFILE_CANONICAL_JSON =
  '{"bonuses":[],"league_specific":false,"profile_id":"tiber-generic-full-ppr-v1","profile_version":"1.0.0","regular_season_only":true,"supported_positions":["QB","RB","WR","TE"],"unsupported_domains":["IDP"],"weights":{"interception":-2,"passing_touchdown":4,"passing_yard":0.04,"receiving_touchdown":6,"receiving_yard":0.1,"reception":1,"rushing_touchdown":6,"rushing_yard":0.1}}';
const SOURCE_A = 'a'.repeat(64);
const SOURCE_B = 'b'.repeat(64);
const EVIDENCE_SHA = 'c'.repeat(64);

const evidence = (
  overrides: Partial<ScoringReconciliationEvidenceRef> = {},
): ScoringReconciliationEvidenceRef => ({
  status: 'passed',
  validator_id: 'fixture-scoring-reconciliation-validator',
  validator_version: '1.0.0',
  evidence_ref: {
    repository: 'Prometheus-Frameworks/TIBER-Data',
    path: 'data/fixtures/scoring-reconciliation.json',
    artifact_version: 'fixture-scoring-reconciliation-v1',
    content_sha256: EVIDENCE_SHA,
  },
  scoring_profile_sha256: TIBER_GENERIC_FULL_PPR_V1_SHA256,
  source_input_sha256s: [SOURCE_A, SOURCE_B],
  ...overrides,
});

const context = {
  run_status: 'succeeded' as const,
  expected_scoring_profile_sha256: TIBER_GENERIC_FULL_PPR_V1_SHA256,
  expected_source_input_sha256s: [SOURCE_A, SOURCE_B],
};

describe('tiber-generic-full-ppr-v1', () => {
  it('pins the exact generic regular-season-only scoring semantics', () => {
    expect(TIBER_GENERIC_FULL_PPR_V1).toEqual({
      profile_id: 'tiber-generic-full-ppr-v1',
      profile_version: '1.0.0',
      league_specific: false,
      regular_season_only: true,
      weights: {
        reception: 1,
        receiving_yard: 0.1,
        receiving_touchdown: 6,
        rushing_yard: 0.1,
        rushing_touchdown: 6,
        passing_yard: 0.04,
        passing_touchdown: 4,
        interception: -2,
      },
      bonuses: [],
      supported_positions: ['QB', 'RB', 'WR', 'TE'],
      unsupported_domains: ['IDP'],
    });
  });

  it('is recursively frozen at runtime, not merely readonly in TypeScript', () => {
    expect(Object.isFrozen(TIBER_GENERIC_FULL_PPR_V1)).toBe(true);
    expect(Object.isFrozen(TIBER_GENERIC_FULL_PPR_V1.weights)).toBe(true);
    expect(Object.isFrozen(TIBER_GENERIC_FULL_PPR_V1.bonuses)).toBe(true);
    expect(Object.isFrozen(TIBER_GENERIC_FULL_PPR_V1.supported_positions)).toBe(true);
    expect(Object.isFrozen(TIBER_GENERIC_FULL_PPR_V1.unsupported_domains)).toBe(true);

    const mutableView = TIBER_GENERIC_FULL_PPR_V1 as unknown as {
      weights: { interception: number };
    };
    expect(() => {
      mutableView.weights.interception = -1;
    }).toThrow(TypeError);
  });

  it('pins exact canonical bytes and SHA-256 without a self-referential hash field', () => {
    expect(TIBER_GENERIC_FULL_PPR_V1_CANONICAL_JSON).toBe(
      PROFILE_CANONICAL_JSON,
    );
    expect(getTiberGenericFullPprV1CanonicalBytes().toString('utf8')).toBe(
      `${PROFILE_CANONICAL_JSON}\n`,
    );
    expect(
      forwardArtifactSha256(getTiberGenericFullPprV1CanonicalBytes()),
    ).toBe(TIBER_GENERIC_FULL_PPR_V1_SHA256);
    expect(TIBER_GENERIC_FULL_PPR_V1_SHA256).toBe(
      'a368b75bf5503558a4f664e0486e2c3cc75c01004d4527fd29ecaa1e247a6274',
    );
    expect(TIBER_GENERIC_FULL_PPR_V1_CANONICAL_JSON).not.toContain(
      'profile_sha256',
    );
  });

  it('keeps seasonal generic PPR distinct from the existing weekly/ROS interception rule', () => {
    expect(TIBER_GENERIC_FULL_PPR_V1.weights.interception).toBe(-2);
    expect(scoringSystem.interceptionPoint).toBe(-1);
    expect(
      computePprPoints({
        receptions: 0,
        receiving_yards: 0,
        receiving_tds: 0,
        rushing_yards: 0,
        rushing_tds: 0,
        passing_yards: 0,
        passing_tds: 0,
        interceptions: 1,
      }),
    ).toBe(-2);
  });

  it('accepts only the exact generic profile reference', () => {
    const result = resolveGenericFullPprCompatibility(
      TIBER_GENERIC_FULL_PPR_V1_PROFILE_REF,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toBe(TIBER_GENERIC_FULL_PPR_V1_PROFILE_REF);
  });

  it('returns the exact compatibility failure for league-specific semantics', () => {
    const result = resolveGenericFullPprCompatibility({
      ...TIBER_GENERIC_FULL_PPR_V1_PROFILE_REF,
      league_specific: true,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual([
      {
        code: 'FORWARD_SCORING_LEAGUE_SPECIFIC_UNSUPPORTED',
        message:
          'tiber-generic-full-ppr-v1 is generic only; league-specific scoring semantics are unsupported.',
        details: {
          requested_league_specific: true,
          supported_league_specific: false,
          profile_id: 'tiber-generic-full-ppr-v1',
        },
      },
    ]);
  });

  it.each([
    { ...TIBER_GENERIC_FULL_PPR_V1_PROFILE_REF, profile_id: 'custom-ppr' },
    { ...TIBER_GENERIC_FULL_PPR_V1_PROFILE_REF, profile_version: '2.0.0' },
    { ...TIBER_GENERIC_FULL_PPR_V1_PROFILE_REF, profile_sha256: 'd'.repeat(64) },
    { ...TIBER_GENERIC_FULL_PPR_V1_PROFILE_REF, te_premium: 0.5 },
    { profile_id: 'tiber-generic-full-ppr-v1' },
  ])('rejects profile identity/version/hash approximation', (request) => {
    const result = resolveGenericFullPprCompatibility(request);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0].code).toBe(
      'FORWARD_SCORING_PROFILE_INCOMPATIBLE',
    );
  });
});

describe('scoring reconciliation evidence reference', () => {
  it('accepts, copies, and freezes exact passed evidence for a succeeded execution', () => {
    const input = evidence();
    const result = validateScoringReconciliationEvidence(input, context);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toEqual(input);
    expect(result.data).not.toBe(input);
    expect(Object.isFrozen(result.data)).toBe(true);
    expect(Object.isFrozen(result.data.evidence_ref)).toBe(true);
    expect(Object.isFrozen(result.data.source_input_sha256s)).toBe(true);
  });

  it('requires evidence whenever reconciliation validation is reached', () => {
    const result = validateScoringReconciliationEvidence(undefined, context);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0].code).toBe(
      'FORWARD_SCORING_RECONCILIATION_REQUIRED',
    );
  });

  it.each(['failed', 'unavailable'] as const)(
    'rejects %s reconciliation for a succeeded execution',
    (status) => {
      const result = validateScoringReconciliationEvidence(
        evidence({ status }),
        context,
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.errors.map((error) => error.code)).toContain(
        'FORWARD_SCORING_RECONCILIATION_STATUS_INCOMPATIBLE',
      );
    },
  );

  it.each(['failed', 'unavailable'] as const)(
    'permits %s reconciliation evidence to explain a failed execution',
    (status) => {
      const result = validateScoringReconciliationEvidence(evidence({ status }), {
        ...context,
        run_status: 'failed',
      });
      expect(result.ok).toBe(true);
    },
  );

  it('rejects profile and admitted-source pin mismatches', () => {
    const wrongProfile = validateScoringReconciliationEvidence(
      evidence({ scoring_profile_sha256: 'd'.repeat(64) }),
      context,
    );
    expect(wrongProfile.ok).toBe(false);
    if (!wrongProfile.ok) {
      expect(wrongProfile.errors.map((error) => error.code)).toContain(
        'FORWARD_SCORING_RECONCILIATION_PROFILE_MISMATCH',
      );
    }

    const wrongSources = validateScoringReconciliationEvidence(
      evidence({ source_input_sha256s: [SOURCE_A] }),
      context,
    );
    expect(wrongSources.ok).toBe(false);
    if (!wrongSources.ok) {
      expect(wrongSources.errors.map((error) => error.code)).toContain(
        'FORWARD_SCORING_RECONCILIATION_SOURCE_MISMATCH',
      );
    }
  });

  it('rejects unsorted, duplicate, malformed, or extra-field evidence', () => {
    const cases: unknown[] = [
      evidence({ source_input_sha256s: [SOURCE_B, SOURCE_A] }),
      evidence({ source_input_sha256s: [SOURCE_A, SOURCE_A, SOURCE_B] }),
      evidence({
        evidence_ref: {
          ...evidence().evidence_ref,
          content_sha256: 'not-a-sha',
        },
      }),
      { ...evidence(), current_source_totals_conform: true },
    ];

    for (const candidate of cases) {
      const result = validateScoringReconciliationEvidence(candidate, context);
      expect(result.ok).toBe(false);
    }
  });
});
