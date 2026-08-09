/**
 * TIBER-Forecast #176 — weekly Week 1 publication contract.
 *
 * Covers the governance properties the contract exists to guarantee, plus the
 * consumer seam that lets TIBER-Fantasy admit a publication *without*
 * substituting FORGE.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  canonicalForwardJson,
  canonicalForwardJsonSha256,
} from '../src/serialization/canonicalForwardArtifacts.js';
import {
  WEEKLY_ADMISSION_PATHS,
  WEEKLY_DEFAULT_CONSUMER_ELIGIBILITY,
  WEEKLY_PRESEASON_INPUT_CLASSES,
  WEEKLY_PROHIBITED_PRESEASON_INPUT_CLASSES,
  WEEKLY_PUBLICATION_ARTIFACT_VERSION,
  WEEKLY_PUBLICATION_SCHEMA_EXAMPLE_VERSION,
  WEEKLY_SEASONAL_CANDIDATE_BOUNDARY,
  isWeeklyPublicationConsumable,
  isWeeklyPublicationDocument,
  isWeeklySchemaExampleDocument,
  validateWeeklyPublication,
  type WeeklyForecastPublicationManifest,
  type WeeklyLifecycle,
  type WeeklyPlayerRow,
} from '../src/contracts/weeklyForecastPublication.js';

const repoRoot = path.resolve(import.meta.dirname, '..');
const fixtureDir = path.join(repoRoot, 'data/fixtures/weekly-forecast-publication');

const manifest = JSON.parse(
  readFileSync(path.join(fixtureDir, '2026-week-01.example.manifest.json'), 'utf8'),
) as WeeklyForecastPublicationManifest;
const rows = JSON.parse(
  readFileSync(path.join(fixtureDir, '2026-week-01.example.rows.json'), 'utf8'),
) as WeeklyPlayerRow[];

function admittedLifecycle(): WeeklyLifecycle {
  return {
    state: 'admitted',
    consumer_eligibility: 'eligible_admitted',
    admission: {
      decided_by: 'operator',
      decided_at: '2026-09-09T18:00:00.000Z',
      decision_ref: { input_id: null, uri_or_path: 'example://decision/1', content_sha256: null, record_id: null },
      admission_path: 'governed_preseason_publication',
      in_season_gate_weakened: false,
    },
    superseded_by_publication_id: null,
  };
}

describe('target is unambiguously 2026 Week 1', () => {
  it('declares a single scoring week, not a seasonal total', () => {
    expect(manifest.target.target_season).toBe(2026);
    expect(manifest.target.target_week).toBe(1);
    expect(manifest.target.target_kind).toBe('single_scoring_week');
    expect(manifest.target.is_seasonal_total).toBe(false);
  });

  it('rejects a seasonal total presented as weekly output', () => {
    const bad = { ...manifest, target: { ...manifest.target, is_seasonal_total: true } };
    const result = validateWeeklyPublication(bad as never, rows);
    expect(result.valid).toBe(false);
    expect(result.errors.map((e) => e.code)).toContain('target_is_seasonal_total');
  });

  it('keeps rank basis off "Expected Points", which Fantasy #265 reserves for EPA', () => {
    expect(manifest.target.rank_basis).toBe('expected_generic_full_ppr_points_week');
    expect(manifest.target.rank_basis).not.toMatch(/^expected_points$/i);
  });

  it('is generic full PPR, not league-specific', () => {
    expect(manifest.target.league_specific).toBe(false);
    expect(manifest.target.unsupported_domain).toContain('IDP');
  });
});

describe('preseason input classes and cutoff', () => {
  it('names an availability rule for every admissible class', () => {
    const named = manifest.preseason_input_class_rules.map((r) => r.input_class);
    for (const cls of WEEKLY_PRESEASON_INPUT_CLASSES) expect(named).toContain(cls);
    for (const rule of manifest.preseason_input_class_rules) {
      expect(rule.availability_rule_id).toBeTruthy();
      expect(rule.source_timestamp_locator).toBeTruthy();
    }
  });

  it('builds the fixture only from declared admissible classes', () => {
    const declared = new Set<string>(manifest.preseason_input_class_rules.map((r) => r.input_class));
    for (const input of manifest.artifact_inputs) expect(declared.has(input.input_class)).toBe(true);
  });

  it('prohibits current-season and target-week facts', () => {
    expect(WEEKLY_PROHIBITED_PRESEASON_INPUT_CLASSES).toContain('current_season_realized_outcomes');
    expect(WEEKLY_PROHIBITED_PRESEASON_INPUT_CLASSES).toContain('target_week_in_game_facts');
  });

  it('rejects an admitted prohibited class', () => {
    const bad = {
      ...manifest,
      artifact_inputs: [{ ...manifest.artifact_inputs[0], input_class: 'current_season_realized_outcomes' }],
    };
    const result = validateWeeklyPublication(bad as never, rows);
    expect(result.errors.map((e) => e.code)).toContain('prohibited_input_class_admitted');
  });

  it('rejects any record available after the declared cutoff', () => {
    const bad = {
      ...manifest,
      artifact_inputs: [
        {
          ...manifest.artifact_inputs[0],
          cutoff_evidence: { ...manifest.artifact_inputs[0].cutoff_evidence, record_count_post_cutoff: 1 },
        },
        ...manifest.artifact_inputs.slice(1),
      ],
    };
    const result = validateWeeklyPublication(bad as never, rows);
    expect(result.errors.map((e) => e.code)).toContain('input_post_cutoff');
  });

  it('rejects unresolved availability evidence rather than assuming eligibility', () => {
    const bad = {
      ...manifest,
      artifact_inputs: [
        {
          ...manifest.artifact_inputs[0],
          cutoff_evidence: { ...manifest.artifact_inputs[0].cutoff_evidence, validator_recomputed_status: 'unresolved' },
        },
        ...manifest.artifact_inputs.slice(1),
      ],
    };
    const result = validateWeeklyPublication(bad as never, rows);
    expect(result.errors.map((e) => e.code)).toContain('input_cutoff_unresolved');
  });

  it('keeps cutoff and generated-at as separate fields', () => {
    expect(manifest.forecast_cutoff).not.toBe(manifest.generated_at);
    expect(new Date(manifest.forecast_cutoff).getTime()).toBeLessThan(new Date(manifest.generated_at).getTime());
  });
});

describe('census reconciliation and identity', () => {
  it('references TIBER-Data census semantics instead of redefining them', () => {
    expect(manifest.population_census.semantics_owner).toBe('Prometheus-Frameworks/TIBER-Data');
    expect(manifest.population_census.semantics_ref).toMatch(/TIBER-Data#\d+/);
  });

  it('reconciles every census row one-to-one', () => {
    expect(manifest.population_reconciliation.one_to_one_complete).toBe(true);
    expect(manifest.population_reconciliation.output_row_count).toBe(manifest.population_census.row_count);
    expect(rows).toHaveLength(manifest.population_census.row_count);
    const statusTotal = Object.values(manifest.status_counts).reduce((a, b) => a + b, 0);
    expect(statusTotal).toBe(manifest.population_census.row_count);
  });

  it('rejects a lost census row', () => {
    const bad = {
      ...manifest,
      population_reconciliation: { ...manifest.population_reconciliation, missing_population_row_ids: ['x'], one_to_one_complete: false },
    };
    expect(validateWeeklyPublication(bad as never, rows).errors.map((e) => e.code)).toContain(
      'population_reconciliation_incomplete',
    );
  });

  it('reports identity coverage explicitly, including unresolved rows', () => {
    expect(manifest.identity_coverage.census_row_count).toBe(rows.length);
    expect(manifest.identity_coverage.unresolved_count).toBeGreaterThan(0);
    expect(manifest.identity_coverage.unresolved_population_row_ids.length).toBe(
      manifest.identity_coverage.unresolved_count,
    );
  });

  it('never uses a fuzzy join or a synthetic namespace', () => {
    for (const row of rows) {
      expect(row.identity.fuzzy_join_used).toBe(false);
      expect(row.identity.synthetic_namespace_used).toBe(false);
    }
    const bad = [{ ...rows[0], identity: { ...rows[0].identity, fuzzy_join_used: true } }];
    expect(validateWeeklyPublication(manifest, bad as never).errors.map((e) => e.code)).toContain(
      'identity_fuzzy_join_used',
    );
  });

  it('keeps unresolved rows visible and unranked rather than dropping them', () => {
    const unresolved = rows.filter((r) => r.forecast_status !== 'forecast_available');
    expect(unresolved.length).toBeGreaterThan(0);
    for (const row of unresolved) {
      expect(row.rank).toBeNull();
      expect(row.point_forecast).toBeNull();
      expect(row.status_reasons?.length ?? 0).toBeGreaterThan(0);
    }
  });
});

describe('uncertainty is never fabricated', () => {
  it('is point-only with all range fields null', () => {
    expect(manifest.uncertainty_status).toBe('unavailable_not_calibrated');
    for (const row of rows) {
      expect(row.uncertainty.status).toBe('unavailable_not_calibrated');
      expect(row.uncertainty.lower_quantile).toBeNull();
      expect(row.uncertainty.median).toBeNull();
      expect(row.uncertainty.upper_quantile).toBeNull();
      expect(row.uncertainty.interval_lower).toBeNull();
      expect(row.uncertainty.interval_upper).toBeNull();
    }
  });

  it('rejects a synthesised interval on an uncalibrated row', () => {
    const bad = [{ ...rows[0], uncertainty: { ...rows[0].uncertainty, interval_lower: 8, interval_upper: 20 } }];
    expect(validateWeeklyPublication(manifest, bad as never).errors.map((e) => e.code)).toContain(
      'fabricated_uncertainty',
    );
  });

  it('rejects a 2026 actual outcome before the week is played', () => {
    const bad = [{ ...rows[0], actual_outcome: 17.4 }];
    expect(validateWeeklyPublication(manifest, bad as never).errors.map((e) => e.code)).toContain(
      'actual_outcome_present_before_target_week',
    );
  });
});

describe('lifecycle and consumer eligibility fail closed', () => {
  it('defaults to not eligible', () => {
    expect(WEEKLY_DEFAULT_CONSUMER_ELIGIBILITY).toBe('not_eligible_pending_admission');
    expect(manifest.lifecycle.consumer_eligibility).toBe('not_eligible_pending_admission');
    expect(isWeeklyPublicationConsumable(manifest.lifecycle)).toBe(false);
  });

  it('requires a complete reviewed admission record', () => {
    expect(isWeeklyPublicationConsumable(admittedLifecycle())).toBe(true);

    for (const mutate of [
      (l: WeeklyLifecycle) => ({ ...l, admission: { ...l.admission, decided_by: null } }),
      (l: WeeklyLifecycle) => ({ ...l, admission: { ...l.admission, decided_at: null } }),
      (l: WeeklyLifecycle) => ({ ...l, admission: { ...l.admission, decision_ref: null } }),
      (l: WeeklyLifecycle) => ({ ...l, admission: { ...l.admission, admission_path: null } }),
      (l: WeeklyLifecycle) => ({ ...l, state: 'candidate' as const }),
    ]) {
      expect(isWeeklyPublicationConsumable(mutate(admittedLifecycle()))).toBe(false);
    }
  });

  it('rejects eligibility claimed without an admission record', () => {
    const bad = {
      ...manifest,
      lifecycle: { ...manifest.lifecycle, consumer_eligibility: 'eligible_admitted' as const },
    };
    expect(validateWeeklyPublication(bad as never, rows).errors.map((e) => e.code)).toContain(
      'consumer_eligible_without_admission_record',
    );
  });

  it('does not weaken Fantasy\'s in-season gate — preseason uses a separate path', () => {
    expect(WEEKLY_ADMISSION_PATHS).toContain('meaningful_current_season_inputs');
    expect(WEEKLY_ADMISSION_PATHS).toContain('governed_preseason_publication');
    expect(manifest.lifecycle.admission.in_season_gate_weakened).toBe(false);
    // Admission via the in-season path is not a valid route for a preseason publication.
    const viaInSeason = { ...admittedLifecycle() };
    viaInSeason.admission = { ...viaInSeason.admission, admission_path: 'meaningful_current_season_inputs' };
    expect(isWeeklyPublicationConsumable(viaInSeason)).toBe(false);
  });
});

describe('boundaries with the parked seasonal candidate and FORGE', () => {
  it('keeps the #167/#170 seasonal candidate disjoint and untouched', () => {
    expect(manifest.seasonal_candidate_boundary).toEqual(WEEKLY_SEASONAL_CANDIDATE_BOUNDARY);
    expect(WEEKLY_SEASONAL_CANDIDATE_BOUNDARY.may_relabel_seasonal_candidate).toBe(false);
    expect(WEEKLY_SEASONAL_CANDIDATE_BOUNDARY.may_promote_seasonal_candidate).toBe(false);
    expect(WEEKLY_SEASONAL_CANDIDATE_BOUNDARY.may_consume_seasonal_candidate).toBe(false);
  });

  it('defines reliability against TIBER-Data outcomes, with FORGE explanatory only', () => {
    expect(manifest.reliability_tracking.truth_label_owner).toBe('TIBER-Data');
    expect(manifest.reliability_tracking.truth_label_artifact_kind).toBe('realized_weekly_ppr_outcomes');
    expect(manifest.reliability_tracking.forge_is_truth_label).toBe(false);
    expect(manifest.reliability_tracking.forge_role).toBe('explanatory_context_only');
  });
});

describe('determinism', () => {
  it('recomputes the published player-rows digest from the bytes', () => {
    expect(canonicalForwardJsonSha256(rows)).toBe(manifest.digests.player_rows_sha256);
    expect(manifest.outputs[0].content_sha256).toBe(manifest.digests.player_rows_sha256);
  });

  it('recomputes the manifest digest over the manifest minus its digest block', () => {
    const { digests, ...withoutDigests } = manifest;
    expect(canonicalForwardJsonSha256(withoutDigests)).toBe(digests.manifest_sha256);
  });

  it('serialises byte-identically on repeat', () => {
    expect(canonicalForwardJson(manifest)).toBe(canonicalForwardJson(manifest));
    expect(canonicalForwardJson(rows)).toBe(canonicalForwardJson(rows));
  });
});

describe('the fixture cannot be mistaken for a real publication', () => {
  it('is marked as a schema example', () => {
    expect(isWeeklySchemaExampleDocument(manifest)).toBe(true);
    expect(isWeeklyPublicationDocument(manifest)).toBe(false);
    expect(manifest.artifact_version).toBe(WEEKLY_PUBLICATION_SCHEMA_EXAMPLE_VERSION);
    expect(manifest.artifact_version).not.toBe(WEEKLY_PUBLICATION_ARTIFACT_VERSION);
  });

  it('states its limitations', () => {
    expect(manifest.limitations.join(' ')).toMatch(/not a real publication/i);
  });

  it('passes structural validation as written', () => {
    expect(validateWeeklyPublication(manifest, rows).valid).toBe(true);
  });
});

/**
 * The consumer seam.
 *
 * A miniature of the decision TIBER-Fantasy has to make. The point is that
 * "not admitted" resolves to an explicit unavailable state — **not** to a FORGE
 * substitution. FORGE never appears as a fallback in this function.
 */
type ConsumerDecision =
  | { admit: true; source: 'forecast_weekly_publication'; items: number }
  | { admit: false; reason: string; source: null };

function fantasyConsumerSeam(
  candidate: WeeklyForecastPublicationManifest,
  candidateRows: readonly WeeklyPlayerRow[],
): ConsumerDecision {
  if (isWeeklySchemaExampleDocument(candidate)) {
    return { admit: false, reason: 'schema_example_not_a_publication', source: null };
  }
  if (!isWeeklyPublicationDocument(candidate)) {
    return { admit: false, reason: 'unrecognised_artifact', source: null };
  }
  if (!validateWeeklyPublication(candidate, candidateRows).valid) {
    return { admit: false, reason: 'contract_invalid', source: null };
  }
  if (!isWeeklyPublicationConsumable(candidate.lifecycle)) {
    return { admit: false, reason: 'not_consumer_eligible', source: null };
  }
  return {
    admit: true,
    source: 'forecast_weekly_publication',
    items: candidateRows.filter((r) => r.forecast_status === 'forecast_available').length,
  };
}

describe('TIBER-Fantasy consumer seam', () => {
  it('refuses the schema example', () => {
    expect(fantasyConsumerSeam(manifest, rows)).toEqual({
      admit: false,
      reason: 'schema_example_not_a_publication',
      source: null,
    });
  });

  it('refuses a real but unadmitted publication', () => {
    const real = { ...manifest, artifact_version: WEEKLY_PUBLICATION_ARTIFACT_VERSION };
    const decision = fantasyConsumerSeam(real as never, rows);
    expect(decision.admit).toBe(false);
    // Narrow before reading `reason`; the admitted branch has no such field.
    if (decision.admit) throw new Error('expected refusal');
    expect(decision.reason).toBe('not_consumer_eligible');
  });

  it('admits only a real, valid, explicitly admitted publication', () => {
    const admitted = {
      ...manifest,
      artifact_version: WEEKLY_PUBLICATION_ARTIFACT_VERSION,
      lifecycle: admittedLifecycle(),
    };
    const decision = fantasyConsumerSeam(admitted as never, rows);
    expect(decision).toEqual({
      admit: true,
      source: 'forecast_weekly_publication',
      items: rows.filter((r) => r.forecast_status === 'forecast_available').length,
    });
  });

  it('never substitutes FORGE — refusal yields a null source, not a fallback', () => {
    const refusals = [
      fantasyConsumerSeam(manifest, rows),
      fantasyConsumerSeam({ ...manifest, artifact_version: WEEKLY_PUBLICATION_ARTIFACT_VERSION } as never, rows),
      fantasyConsumerSeam({ ...manifest, artifact_version: 'something-else' } as never, rows),
    ];
    for (const decision of refusals) {
      expect(decision.admit).toBe(false);
      expect(decision.source).toBeNull();
      expect(JSON.stringify(decision).toLowerCase()).not.toContain('forge');
    }
  });
});
