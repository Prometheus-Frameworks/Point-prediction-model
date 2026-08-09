/**
 * Publication contract for a governed **2026 Week 1 weekly Forecast ranking**.
 *
 * TIBER-Forecast #176. This module contains types, constants, and
 * document-discriminant helpers **only**. It does not run a model, train
 * anything, generate a real candidate, promote an artifact, or grant consumer
 * eligibility. Those remain separately operator-gated.
 *
 * Relationship to the seasonal path (#167/#170): that is a *seasonal*,
 * point-only, `candidate_only` / `non_promotable` / `consumer_eligibility: never`
 * candidate. It is not a Week 1 weekly publication and this contract neither
 * relabels, promotes, nor consumes it. The two coexist deliberately —
 * see `WEEKLY_SEASONAL_CANDIDATE_BOUNDARY`.
 *
 * Lineage note: this repository is the renamed Point-prediction-Model. Legacy
 * package name (`point-prediction-model`), route names, symbols, and the
 * `SCORING_SERVICE_BASE_URL` integration variable in TIBER-Fantasy remain for
 * backward compatibility. This contract extends that existing service lineage
 * with a governed pre-Week-1 publication path; it does not introduce a competing
 * producer.
 *
 * Ownership boundaries (docs/ownership-boundaries.md), restated because this
 * contract sits exactly on them:
 *   - TIBER-Data     — source truth, canonical identity, realized outcomes,
 *                      census semantics, source provenance.
 *   - TIBER-Forecast — forecast method, inference output, model/configuration
 *                      identity, publication manifest. (This file.)
 *   - TIBER-Fantasy  — consumer admission and presentation.
 *   - TIBER-FORGE    — deterministic football interpretation. Explanatory only;
 *                      never the realized-outcome truth label.
 */

import type {
  GenericFullPprProfileV1,
  ScoringReconciliationEvidenceRef,
  TIBER_GENERIC_FULL_PPR_V1_SHA256,
} from './genericFullPprProfile.js';

// ---------------------------------------------------------------------------
// Artifact identity
// ---------------------------------------------------------------------------

export const WEEKLY_PUBLICATION_ARTIFACT_TYPE =
  'weekly_fantasy_point_forecast_publication' as const;
export const WEEKLY_PUBLICATION_ARTIFACT_VERSION =
  'weekly-fantasy-point-forecast-publication-v1' as const;
/** Marks a schema example / fixture that is explicitly not a real publication. */
export const WEEKLY_PUBLICATION_SCHEMA_EXAMPLE_VERSION =
  'weekly-fantasy-point-forecast-publication-v1-example' as const;
export const WEEKLY_PLAYER_ROWS_ARTIFACT_TYPE =
  'weekly_fantasy_point_forecast_player_rows' as const;
export const WEEKLY_PLAYER_ROWS_ARTIFACT_VERSION =
  'weekly-fantasy-point-forecast-player-rows-v1' as const;

export const WEEKLY_OUTPUT_KIND = 'model-inference' as const;
export const WEEKLY_SERIALIZER_ID = 'tiber-canonical-json-v1' as const;
export const WEEKLY_SERIALIZER_VERSION = '1.0.0' as const;
export const WEEKLY_SCORING_PROFILE_ID = 'tiber-generic-full-ppr-v1' as const;
export const WEEKLY_CUTOFF_RULE = 'fact_available_at <= forecast_cutoff' as const;

export const WEEKLY_SUPPORTED_POSITIONS = ['QB', 'RB', 'WR', 'TE'] as const;
export type WeeklySupportedPosition = (typeof WEEKLY_SUPPORTED_POSITIONS)[number];

/** Explicit, machine-readable statement of the #167/#170 boundary. */
export const WEEKLY_SEASONAL_CANDIDATE_BOUNDARY = {
  seasonal_candidate_run_id: 'seasonal-ppr-2026-forward-001',
  relationship: 'disjoint',
  may_relabel_seasonal_candidate: false,
  may_promote_seasonal_candidate: false,
  may_consume_seasonal_candidate: false,
  note:
    'The seasonal candidate governed by Forecast #167/#170 is point-only, ' +
    'candidate_only, non_promotable and consumer_eligibility: never. It is not a ' +
    'weekly publication and is not an input to one.',
} as const;

// ---------------------------------------------------------------------------
// Target: unambiguously a single scoring week
// ---------------------------------------------------------------------------

/**
 * `rank_basis` names what the ordering means. Deliberately **not**
 * "Expected Points": TIBER-Fantasy #265 reserves that phrase for EPA, and
 * user-facing surfaces must translate at the adapter seam.
 */
export const WEEKLY_RANK_BASIS = 'expected_generic_full_ppr_points_week' as const;

export interface WeeklyTargetDefinition {
  target_season: number;
  /** NFL scoring week. Week 1 for this contract's first publication. */
  target_week: number;
  target_kind: 'single_scoring_week';
  /** Guards against a seasonal total being presented as a weekly value. */
  is_seasonal_total: false;
  rank_basis: typeof WEEKLY_RANK_BASIS;
  scoring_profile_id: typeof WEEKLY_SCORING_PROFILE_ID;
  league_specific: false;
  supported_positions: readonly WeeklySupportedPosition[];
  unsupported_domain: readonly string[];
}

// ---------------------------------------------------------------------------
// Preseason input classes
// ---------------------------------------------------------------------------

/**
 * The admissible pre-Week-1 input classes.
 *
 * Before Week 1 of a season there are, by construction, **zero** current-season
 * observations. TIBER-Fantasy's in-season scoring preference requires meaningful
 * current-season observations for most of a cohort
 * (`games_sampled >= 2` plus a positive opportunity signal, across
 * `>= max(10, 0.6n)` of the cohort). That gate is **structurally unsatisfiable**
 * pre-kickoff and is deliberately **not weakened** — a publication under this
 * contract reaches Fantasy through a separate governed preseason admission path
 * (`WeeklyAdmissionPath`), never by relaxing the in-season gate.
 *
 * Every class below is prior-season or roster-state evidence, each with its own
 * availability rule evaluated against the declared cutoff.
 */
export const WEEKLY_PRESEASON_INPUT_CLASSES = [
  'prior_season_realized_outcomes',
  'prior_season_usage_and_role',
  'depth_chart_and_role_priors',
  'roster_and_team_assignment_state',
  'schedule_and_opponent_context',
  'player_availability_status',
] as const;
export type WeeklyPreseasonInputClass =
  (typeof WEEKLY_PRESEASON_INPUT_CLASSES)[number];

/** Input classes that must never be admitted before Week 1 kickoff. */
export const WEEKLY_PROHIBITED_PRESEASON_INPUT_CLASSES = [
  // Does not exist yet; admitting it would be leakage by definition.
  'current_season_realized_outcomes',
  'current_season_usage_and_role',
  // Post-kickoff facts about the target week itself.
  'target_week_in_game_facts',
] as const;
export type WeeklyProhibitedPreseasonInputClass =
  (typeof WEEKLY_PROHIBITED_PRESEASON_INPUT_CLASSES)[number];

export type WeeklyAvailabilityRuleId =
  /** Admissible once the prior season is final and governed. */
  | 'prior_season_final_and_governed'
  /** Admissible if the state's effective_at is at or before the cutoff. */
  | 'state_effective_at_or_before_cutoff'
  /** Admissible if published at or before the cutoff. */
  | 'published_at_or_before_cutoff';

export interface WeeklyPreseasonInputClassRule {
  input_class: WeeklyPreseasonInputClass;
  availability_rule_id: WeeklyAvailabilityRuleId;
  /** Locator for the timestamp the rule is evaluated against. */
  source_timestamp_locator: string;
  /** Owning repository, per the ownership boundaries. */
  owner_repository: string;
  required: boolean;
  notes: string;
}

// ---------------------------------------------------------------------------
// Evidence, identity, census
// ---------------------------------------------------------------------------

export interface WeeklyEvidenceRef {
  input_id: string | null;
  uri_or_path: string;
  content_sha256: string | null;
  record_id: string | null;
}

export interface WeeklyContentRef {
  artifact_type: string;
  artifact_version: string;
  uri_or_path: string;
  content_sha256: string;
}

export type WeeklyCutoffStatus =
  | 'eligible'
  | 'ineligible_after_cutoff'
  | 'unresolved';

export interface WeeklyInputCutoffEvidence {
  source_timestamp_locator: string;
  normalization_rule_id: string;
  record_count_eligible: number;
  record_count_post_cutoff: number;
  record_count_unresolved: number;
  validator_recomputed_status: WeeklyCutoffStatus;
}

export interface WeeklyArtifactInput {
  input_id: string;
  input_class: WeeklyPreseasonInputClass;
  owner_repository: string;
  owner_commit_sha: string;
  artifact_type: string;
  artifact_version: string;
  uri_or_path: string;
  content_sha256: string;
  source_as_of: string | null;
  availability_rule_id: WeeklyAvailabilityRuleId;
  cutoff_evidence: WeeklyInputCutoffEvidence;
  limitations: readonly string[];
}

export type WeeklyIdentityStatus = 'resolved' | 'unresolved' | 'conflicting';

export interface WeeklyPlayerIdentity {
  /** Canonical key. Null whenever identity is not cleanly resolved. */
  canonical_player_id: string | null;
  identity_status: WeeklyIdentityStatus;
  /** Source identity evidence is retained, never replaced. */
  source_identity_ref: WeeklyEvidenceRef;
  display_name: string;
  position: string | null;
  nfl_team_abbr: string | null;
  /**
   * Always false. No fuzzy/name-based joining is permitted anywhere in this
   * contract, and no synthetic identifier namespace may be minted.
   */
  fuzzy_join_used: false;
  synthetic_namespace_used: false;
}

export interface WeeklyIdentityCoverage {
  census_row_count: number;
  resolved_count: number;
  unresolved_count: number;
  conflicting_count: number;
  coverage_rate: number;
  unresolved_population_row_ids: readonly string[];
}

/**
 * Census scope is **referenced**, not redefined.
 *
 * TIBER-Data owns bounded-census semantics (Data#227). This contract points at a
 * governed census artifact and reconciles against it; it does not restate what a
 * census means or mint its own population.
 */
export interface WeeklyPopulationCensusRef {
  census_artifact_ref: WeeklyContentRef;
  census_sha256: string;
  /** Owning repository + issue that defines the census semantics. */
  semantics_owner: string;
  semantics_ref: string;
  scope_definition: string;
  effective_at: string;
  row_count: number;
}

export interface WeeklyPopulationReconciliation {
  output_row_count: number;
  duplicate_population_row_ids: readonly string[];
  missing_population_row_ids: readonly string[];
  extra_population_row_ids: readonly string[];
  /** Every census row maps to exactly one output row or typed unavailable. */
  one_to_one_complete: boolean;
}

// ---------------------------------------------------------------------------
// Player rows
// ---------------------------------------------------------------------------

export const WEEKLY_FORECAST_STATUSES = [
  'forecast_available',
  'unavailable_missing_required_inputs',
  'unsupported_position_domain',
  'identity_unresolved',
  'identity_conflicting',
  'population_ineligible',
  'no_prior_season_history',
  'roster_state_unresolved',
] as const;
export type WeeklyForecastStatus = (typeof WEEKLY_FORECAST_STATUSES)[number];
export type WeeklyUnavailableForecastStatus = Exclude<
  WeeklyForecastStatus,
  'forecast_available'
>;
export type WeeklyStatusCounts = Record<WeeklyForecastStatus, number>;

/**
 * Uncertainty.
 *
 * Range fields exist in the schema but are **null unless independently
 * calibrated**. Nothing in this contract may synthesise a floor, ceiling,
 * median, confidence band, or interval. `point_only` is the honest default and
 * the only status this contract's first publication may carry.
 */
export const WEEKLY_UNCERTAINTY_STATUSES = [
  'unavailable_not_calibrated',
  'calibrated',
] as const;
export type WeeklyUncertaintyStatus = (typeof WEEKLY_UNCERTAINTY_STATUSES)[number];

export interface WeeklyUnavailableUncertainty {
  status: 'unavailable_not_calibrated';
  method_id: null;
  method_version: null;
  lower_quantile: null;
  median: null;
  upper_quantile: null;
  interval_lower: null;
  interval_upper: null;
}

export interface WeeklyCalibratedUncertainty {
  status: 'calibrated';
  method_id: string;
  method_version: string;
  lower_quantile: number;
  median: number;
  upper_quantile: number;
  interval_lower: number;
  interval_upper: number;
}

export type WeeklyUncertainty =
  | WeeklyUnavailableUncertainty
  | WeeklyCalibratedUncertainty;

export interface WeeklyAvailablePlayerRow {
  population_row_id: string;
  forecast_status: 'forecast_available';
  identity: WeeklyPlayerIdentity & { canonical_player_id: string };
  /** Expected generic full-PPR points for the target week. Finite. */
  point_forecast: number;
  /** 1-based rank within the published cohort. */
  rank: number;
  uncertainty: WeeklyUncertainty;
  input_ids_used: readonly string[];
  /** 2026 outcomes do not exist at publication time. Always null. */
  actual_outcome: null;
  status_reasons?: never;
}

export interface WeeklyUnavailablePlayerRow {
  population_row_id: string;
  forecast_status: WeeklyUnavailableForecastStatus;
  identity: WeeklyPlayerIdentity;
  point_forecast: null;
  rank: null;
  uncertainty: WeeklyUnavailableUncertainty;
  input_ids_used: readonly string[];
  actual_outcome: null;
  /** Typed reason(s). An unavailable row is never silently dropped. */
  status_reasons: readonly string[];
}

export type WeeklyPlayerRow =
  | WeeklyAvailablePlayerRow
  | WeeklyUnavailablePlayerRow;

// ---------------------------------------------------------------------------
// Lifecycle, promotion, consumer eligibility — fail closed
// ---------------------------------------------------------------------------

export const WEEKLY_LIFECYCLE_STATES = [
  'draft',
  'candidate',
  'reviewed',
  'admitted',
  'superseded',
  'withdrawn',
] as const;
export type WeeklyLifecycleState = (typeof WEEKLY_LIFECYCLE_STATES)[number];

export const WEEKLY_CONSUMER_ELIGIBILITY_STATES = [
  'not_eligible_pending_admission',
  'not_eligible_rejected',
  'eligible_admitted',
] as const;
export type WeeklyConsumerEligibility =
  (typeof WEEKLY_CONSUMER_ELIGIBILITY_STATES)[number];

/** The fail-closed default. A publication is ineligible until admitted. */
export const WEEKLY_DEFAULT_CONSUMER_ELIGIBILITY: WeeklyConsumerEligibility =
  'not_eligible_pending_admission';

/**
 * The separate governed preseason admission path.
 *
 * Fantasy's in-season `meaningful_current_season_inputs` gate stays exactly as
 * it is. A preseason publication is admitted (if at all) through
 * `governed_preseason_publication`, which requires an explicit reviewed decision.
 */
export const WEEKLY_ADMISSION_PATHS = [
  'meaningful_current_season_inputs',
  'governed_preseason_publication',
] as const;
export type WeeklyAdmissionPath = (typeof WEEKLY_ADMISSION_PATHS)[number];

export interface WeeklyAdmissionRecord {
  /** Null until a human decision exists. Absence means not admitted. */
  decided_by: string | null;
  decided_at: string | null;
  decision_ref: WeeklyEvidenceRef | null;
  admission_path: WeeklyAdmissionPath | null;
  /** Restates that the in-season gate was not relaxed to achieve admission. */
  in_season_gate_weakened: false;
}

export interface WeeklyLifecycle {
  state: WeeklyLifecycleState;
  consumer_eligibility: WeeklyConsumerEligibility;
  admission: WeeklyAdmissionRecord;
  superseded_by_publication_id: string | null;
}

/**
 * A publication is consumable only when every condition holds. Structured as an
 * explicit conjunction so a partially-filled record can never read as eligible.
 */
export function isWeeklyPublicationConsumable(
  lifecycle: WeeklyLifecycle,
): boolean {
  return (
    lifecycle.state === 'admitted' &&
    lifecycle.consumer_eligibility === 'eligible_admitted' &&
    lifecycle.admission.decided_by !== null &&
    lifecycle.admission.decided_at !== null &&
    lifecycle.admission.decision_ref !== null &&
    lifecycle.admission.admission_path === 'governed_preseason_publication' &&
    lifecycle.admission.in_season_gate_weakened === false
  );
}

// ---------------------------------------------------------------------------
// Reliability tracking
// ---------------------------------------------------------------------------

/**
 * Reliability is scored against **realized weekly PPR outcomes owned by
 * TIBER-Data**. FORGE may supply explanatory context for a miss, but is never
 * the truth label — encoded as a literal so it cannot drift.
 */
export interface WeeklyReliabilityTracking {
  truth_label_owner: 'TIBER-Data';
  truth_label_artifact_kind: 'realized_weekly_ppr_outcomes';
  truth_label_ref: WeeklyEvidenceRef | null;
  forge_role: 'explanatory_context_only';
  forge_is_truth_label: false;
  /** Populated only after the target week has been played. */
  scored_at: string | null;
}

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------

export interface WeeklySerializationIdentity {
  serializer_id: typeof WEEKLY_SERIALIZER_ID;
  serializer_version: typeof WEEKLY_SERIALIZER_VERSION;
}

export interface WeeklyModelIdentity {
  model_id: string;
  model_version: string;
  configuration_sha256: string;
  feature_configuration_sha256: string;
  /** No training occurs at publication time; the fit is a pinned input. */
  fitted_model_ref: WeeklyContentRef | null;
}

export interface WeeklyScoringProfile extends GenericFullPprProfileV1 {
  profile_sha256: typeof TIBER_GENERIC_FULL_PPR_V1_SHA256;
  source_reconciliation: ScoringReconciliationEvidenceRef;
}

export interface WeeklyDigests {
  /** Digest of the canonical player-rows artifact. */
  player_rows_sha256: string;
  /** Digest of this manifest with the digest field itself excluded. */
  manifest_sha256: string;
  serialization: WeeklySerializationIdentity;
}

export interface WeeklyForecastPublicationManifest {
  artifact_type: typeof WEEKLY_PUBLICATION_ARTIFACT_TYPE;
  artifact_version:
    | typeof WEEKLY_PUBLICATION_ARTIFACT_VERSION
    | typeof WEEKLY_PUBLICATION_SCHEMA_EXAMPLE_VERSION;
  document_kind: 'weekly_publication_manifest';
  publication_id: string;
  output_kind: typeof WEEKLY_OUTPUT_KIND;

  target: WeeklyTargetDefinition;

  /** Separate fields, deliberately. */
  forecast_cutoff: string;
  generated_at: string;
  cutoff_rule: typeof WEEKLY_CUTOFF_RULE;

  preseason_input_class_rules: readonly WeeklyPreseasonInputClassRule[];
  prohibited_input_classes: readonly WeeklyProhibitedPreseasonInputClass[];
  artifact_inputs: readonly WeeklyArtifactInput[];

  scoring_profile: WeeklyScoringProfile;
  model: WeeklyModelIdentity;

  population_census: WeeklyPopulationCensusRef;
  population_reconciliation: WeeklyPopulationReconciliation;
  identity_coverage: WeeklyIdentityCoverage;
  status_counts: WeeklyStatusCounts;

  uncertainty_status: WeeklyUncertaintyStatus;
  lifecycle: WeeklyLifecycle;
  reliability_tracking: WeeklyReliabilityTracking;
  seasonal_candidate_boundary: typeof WEEKLY_SEASONAL_CANDIDATE_BOUNDARY;

  outputs: readonly WeeklyContentRef[];
  digests: WeeklyDigests;
  limitations: readonly string[];
}

// ---------------------------------------------------------------------------
// Discriminants and validation
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** True for a fixture/example document that must never be treated as real. */
export function isWeeklySchemaExampleDocument(value: unknown): boolean {
  return (
    isRecord(value) &&
    value.artifact_type === WEEKLY_PUBLICATION_ARTIFACT_TYPE &&
    value.artifact_version === WEEKLY_PUBLICATION_SCHEMA_EXAMPLE_VERSION
  );
}

/** True for a real publication document (still not necessarily admitted). */
export function isWeeklyPublicationDocument(value: unknown): boolean {
  return (
    isRecord(value) &&
    value.artifact_type === WEEKLY_PUBLICATION_ARTIFACT_TYPE &&
    value.artifact_version === WEEKLY_PUBLICATION_ARTIFACT_VERSION
  );
}

export type WeeklyValidationErrorCode =
  | 'target_not_single_week'
  | 'target_is_seasonal_total'
  | 'cutoff_missing'
  | 'generated_at_missing'
  | 'prohibited_input_class_admitted'
  | 'input_post_cutoff'
  | 'input_cutoff_unresolved'
  | 'population_reconciliation_incomplete'
  | 'identity_fuzzy_join_used'
  | 'identity_synthetic_namespace_used'
  | 'fabricated_uncertainty'
  | 'actual_outcome_present_before_target_week'
  | 'rank_on_unavailable_row'
  | 'consumer_eligible_without_admission_record';

export interface WeeklyValidationIssue {
  code: WeeklyValidationErrorCode;
  path: string;
  message: string;
}

export interface WeeklyValidationResult {
  validator_id: 'tiber-weekly-forecast-publication-validator';
  validator_version: '1.0.0';
  valid: boolean;
  /** This validator never grants promotion or eligibility. */
  promotion_authority: false;
  errors: readonly WeeklyValidationIssue[];
}

/**
 * Structural validation of a publication and its rows.
 *
 * Deliberately checks only what the contract can decide locally. It does not
 * verify that hashes match real bytes, does not fetch inputs, and does not
 * confer eligibility.
 */
export function validateWeeklyPublication(
  manifest: WeeklyForecastPublicationManifest,
  rows: readonly WeeklyPlayerRow[],
): WeeklyValidationResult {
  const errors: WeeklyValidationIssue[] = [];
  const fail = (code: WeeklyValidationErrorCode, path: string, message: string) =>
    errors.push({ code, path, message });

  // Target must be a single scoring week, never a seasonal total.
  if (manifest.target.target_kind !== 'single_scoring_week') {
    fail('target_not_single_week', 'target.target_kind', 'Target must be a single scoring week.');
  }
  if (manifest.target.is_seasonal_total !== false) {
    fail('target_is_seasonal_total', 'target.is_seasonal_total', 'A seasonal total may not be published as weekly output.');
  }
  if (!manifest.forecast_cutoff) fail('cutoff_missing', 'forecast_cutoff', 'forecast_cutoff is required.');
  if (!manifest.generated_at) fail('generated_at_missing', 'generated_at', 'generated_at is required.');

  // Cutoff / leakage.
  const prohibited = new Set<string>(manifest.prohibited_input_classes);
  manifest.artifact_inputs.forEach((input, index) => {
    if (prohibited.has(input.input_class as string)) {
      fail('prohibited_input_class_admitted', `artifact_inputs[${index}]`, `Input class ${input.input_class} is prohibited before kickoff.`);
    }
    if (input.cutoff_evidence.record_count_post_cutoff > 0) {
      fail('input_post_cutoff', `artifact_inputs[${index}].cutoff_evidence`, 'Input admits records after the declared cutoff.');
    }
    if (input.cutoff_evidence.record_count_unresolved > 0 || input.cutoff_evidence.validator_recomputed_status === 'unresolved') {
      fail('input_cutoff_unresolved', `artifact_inputs[${index}].cutoff_evidence`, 'Input has unresolved availability evidence.');
    }
  });

  // Census reconciliation must be one-to-one and complete.
  const reconciliation = manifest.population_reconciliation;
  const statusTotal = Object.values(manifest.status_counts).reduce((sum, n) => sum + n, 0);
  if (
    !reconciliation.one_to_one_complete ||
    reconciliation.duplicate_population_row_ids.length > 0 ||
    reconciliation.missing_population_row_ids.length > 0 ||
    reconciliation.extra_population_row_ids.length > 0 ||
    reconciliation.output_row_count !== manifest.population_census.row_count ||
    statusTotal !== manifest.population_census.row_count
  ) {
    fail('population_reconciliation_incomplete', 'population_reconciliation', 'Every census row must map to exactly one output row or typed unavailable status.');
  }

  rows.forEach((row, index) => {
    if (row.identity.fuzzy_join_used !== false) {
      fail('identity_fuzzy_join_used', `rows[${index}].identity`, 'Fuzzy identity joining is not permitted.');
    }
    if (row.identity.synthetic_namespace_used !== false) {
      fail('identity_synthetic_namespace_used', `rows[${index}].identity`, 'Synthetic identifier namespaces are not permitted.');
    }
    // 2026 outcomes cannot exist at publication time.
    if (row.actual_outcome !== null) {
      fail('actual_outcome_present_before_target_week', `rows[${index}].actual_outcome`, 'actual_outcome must be null before the target week is played.');
    }
    // Uncertainty may never be fabricated.
    if (row.uncertainty.status === 'unavailable_not_calibrated') {
      const u = row.uncertainty;
      if (
        u.lower_quantile !== null || u.median !== null || u.upper_quantile !== null ||
        u.interval_lower !== null || u.interval_upper !== null || u.method_id !== null
      ) {
        fail('fabricated_uncertainty', `rows[${index}].uncertainty`, 'Range fields must be null when uncertainty is not calibrated.');
      }
    }
    if (row.forecast_status !== 'forecast_available') {
      if (row.rank !== null || row.point_forecast !== null) {
        fail('rank_on_unavailable_row', `rows[${index}]`, 'An unavailable row may not carry a rank or a point forecast.');
      }
    }
  });

  // Eligibility must never outrun the admission record.
  if (
    manifest.lifecycle.consumer_eligibility === 'eligible_admitted' &&
    !isWeeklyPublicationConsumable(manifest.lifecycle)
  ) {
    fail('consumer_eligible_without_admission_record', 'lifecycle', 'Consumer eligibility requires a complete reviewed admission record.');
  }

  return {
    validator_id: 'tiber-weekly-forecast-publication-validator',
    validator_version: '1.0.0',
    valid: errors.length === 0,
    promotion_authority: false,
    errors,
  };
}
