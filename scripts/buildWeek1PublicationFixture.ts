/**
 * Deterministic builder for the 2026 Week 1 weekly publication **review fixture**
 * (TIBER-Forecast #176).
 *
 * This does NOT run a model, train anything, read a real census, or produce a
 * real candidate. It constructs a **schema example** — every artifact carries
 * `weekly-fantasy-point-forecast-publication-v1-example`, which
 * `isWeeklySchemaExampleDocument()` detects and which a consumer must refuse to
 * treat as a real publication.
 *
 * Its purpose is to make the contract reviewable: a human can read one concrete
 * document and see exactly what a real publication would have to declare.
 *
 *   npx tsx scripts/buildWeek1PublicationFixture.ts
 *   npx tsx scripts/buildWeek1PublicationFixture.ts --check   # verify, write nothing
 *
 * Determinism: no clock, no randomness, no network. Every timestamp is a fixed
 * declared constant, so repeated runs produce byte-identical output and digests.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  canonicalForwardJson,
  canonicalForwardJsonSha256,
} from '../src/serialization/canonicalForwardArtifacts.js';
import {
  TIBER_GENERIC_FULL_PPR_V1,
  TIBER_GENERIC_FULL_PPR_V1_SHA256,
} from '../src/contracts/genericFullPprProfile.js';
import {
  WEEKLY_CANONICAL_INPUT_CLASS_RULES,
  WEEKLY_CUTOFF_RULE,
  WEEKLY_DEFAULT_CONSUMER_ELIGIBILITY,
  WEEKLY_GOVERNED_CENSUS_OWNER,
  WEEKLY_OUTPUT_KIND,
  WEEKLY_PLAYER_ROWS_ARTIFACT_TYPE,
  WEEKLY_PLAYER_ROWS_ARTIFACT_VERSION,
  WEEKLY_PROHIBITED_PRESEASON_INPUT_CLASSES,
  WEEKLY_PUBLICATION_ARTIFACT_TYPE,
  WEEKLY_PUBLICATION_SCHEMA_EXAMPLE_VERSION,
  WEEKLY_RANK_BASIS,
  WEEKLY_RANK_ORDERING_RULE,
  WEEKLY_SCORING_PROFILE_ID,
  WEEKLY_SEASONAL_CANDIDATE_BOUNDARY,
  WEEKLY_SERIALIZER_ID,
  WEEKLY_SERIALIZER_VERSION,
  WEEKLY_SUPPORTED_POSITIONS,
  WEEKLY_FORECAST_REPOSITORY,
  validateWeeklyPublication,
  weeklyManifestSha256,
  type WeeklyForecastPublicationManifest,
  type WeeklyPlayerRow,
  type WeeklyVerificationContext,
} from '../src/contracts/weeklyForecastPublication.js';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const OUT_DIR = path.join(REPO_ROOT, 'data/fixtures/weekly-forecast-publication');
const MANIFEST_PATH = path.join(OUT_DIR, '2026-week-01.example.manifest.json');
const ROWS_PATH = path.join(OUT_DIR, '2026-week-01.example.rows.json');

/** Fixed declared constants — no clock is read, so output is reproducible. */
const FORECAST_CUTOFF = '2026-09-09T00:00:00.000Z'; // day before the Week 1 opener
const GENERATED_AT = '2026-09-09T12:00:00.000Z';
const CENSUS_EFFECTIVE_AT = '2026-09-08T00:00:00.000Z';
const PLACEHOLDER_SHA = 'e'.repeat(64);

/**
 * Illustrative rows.
 *
 * Values are shaped to exercise the contract, not to assert football claims.
 * Two rows are deliberately unavailable so reviewers can see that a census row
 * with no forecast still appears with a typed reason rather than vanishing.
 */
const EXAMPLE_ROWS: readonly WeeklyPlayerRow[] = [
  {
    population_row_id: 'census-2026-w1-000001',
    forecast_status: 'forecast_available',
    identity: {
      canonical_player_id: 'example-canonical-0001',
      identity_status: 'resolved',
      source_identity_ref: {
        input_id: null,
        uri_or_path: 'example://tiber-data/census/2026/week-01',
        content_sha256: PLACEHOLDER_SHA,
        record_id: 'census-2026-w1-000001',
      },
      display_name: 'Example Player A',
      position: 'WR',
      nfl_team_abbr: 'AAA',
      fuzzy_join_used: false,
      synthetic_namespace_used: false,
    },
    point_forecast: 14.2,
    rank: 1,
    uncertainty: {
      status: 'unavailable_not_calibrated',
      method_id: null,
      method_version: null,
      lower_quantile: null,
      median: null,
      upper_quantile: null,
      interval_lower: null,
      interval_upper: null,
    },
    input_ids_used: [
      'tiber-data-prior-season-outcomes-2025',
      'tiber-data-prior-season-usage-2025',
      'tiber-data-roster-state-2026-w1',
    ],
    actual_outcome: null,
  },
  {
    population_row_id: 'census-2026-w1-000002',
    forecast_status: 'forecast_available',
    identity: {
      canonical_player_id: 'example-canonical-0002',
      identity_status: 'resolved',
      source_identity_ref: {
        input_id: null,
        uri_or_path: 'example://tiber-data/census/2026/week-01',
        content_sha256: PLACEHOLDER_SHA,
        record_id: 'census-2026-w1-000002',
      },
      display_name: 'Example Player B',
      position: 'RB',
      nfl_team_abbr: 'BBB',
      fuzzy_join_used: false,
      synthetic_namespace_used: false,
    },
    point_forecast: 11.8,
    rank: 2,
    uncertainty: {
      status: 'unavailable_not_calibrated',
      method_id: null,
      method_version: null,
      lower_quantile: null,
      median: null,
      upper_quantile: null,
      interval_lower: null,
      interval_upper: null,
    },
    input_ids_used: [
      'tiber-data-prior-season-outcomes-2025',
      'tiber-data-prior-season-usage-2025',
      'tiber-data-roster-state-2026-w1',
    ],
    actual_outcome: null,
  },
  {
    // A rookie: no prior-season history, so no admissible input class applies.
    population_row_id: 'census-2026-w1-000003',
    forecast_status: 'no_prior_season_history',
    identity: {
      canonical_player_id: 'example-canonical-0003',
      identity_status: 'resolved',
      source_identity_ref: {
        input_id: null,
        uri_or_path: 'example://tiber-data/census/2026/week-01',
        content_sha256: PLACEHOLDER_SHA,
        record_id: 'census-2026-w1-000003',
      },
      display_name: 'Example Rookie C',
      position: 'WR',
      nfl_team_abbr: 'CCC',
      fuzzy_join_used: false,
      synthetic_namespace_used: false,
    },
    point_forecast: null,
    rank: null,
    uncertainty: {
      status: 'unavailable_not_calibrated',
      method_id: null,
      method_version: null,
      lower_quantile: null,
      median: null,
      upper_quantile: null,
      interval_lower: null,
      interval_upper: null,
    },
    input_ids_used: [],
    actual_outcome: null,
    status_reasons: ['no_prior_season_realized_outcomes_for_population_row'],
  },
  {
    // Identity that does not cleanly resolve stays visible and unranked.
    population_row_id: 'census-2026-w1-000004',
    forecast_status: 'identity_unresolved',
    identity: {
      canonical_player_id: null,
      identity_status: 'unresolved',
      source_identity_ref: {
        input_id: null,
        uri_or_path: 'example://tiber-data/census/2026/week-01',
        content_sha256: PLACEHOLDER_SHA,
        record_id: 'census-2026-w1-000004',
      },
      display_name: 'Example Unresolved D',
      position: null,
      nfl_team_abbr: null,
      fuzzy_join_used: false,
      synthetic_namespace_used: false,
    },
    point_forecast: null,
    rank: null,
    uncertainty: {
      status: 'unavailable_not_calibrated',
      method_id: null,
      method_version: null,
      lower_quantile: null,
      median: null,
      upper_quantile: null,
      interval_lower: null,
      interval_upper: null,
    },
    input_ids_used: [],
    actual_outcome: null,
    status_reasons: ['canonical_identity_missing_in_governed_crosswalk'],
  },
];

function buildManifest(rowsSha256: string): WeeklyForecastPublicationManifest {
  const censusRowCount = EXAMPLE_ROWS.length;

  const base = {
    artifact_type: WEEKLY_PUBLICATION_ARTIFACT_TYPE,
    // Example version: this document is not a real publication.
    artifact_version: WEEKLY_PUBLICATION_SCHEMA_EXAMPLE_VERSION,
    document_kind: 'weekly_publication_manifest' as const,
    publication_id: 'weekly-ppr-2026-w01-example-001',
    output_kind: WEEKLY_OUTPUT_KIND,

    target: {
      target_season: 2026,
      target_week: 1,
      target_kind: 'single_scoring_week' as const,
      is_seasonal_total: false as const,
      rank_basis: WEEKLY_RANK_BASIS,
      rank_ordering_rule: WEEKLY_RANK_ORDERING_RULE,
      scoring_profile_id: WEEKLY_SCORING_PROFILE_ID,
      league_specific: false as const,
      supported_positions: WEEKLY_SUPPORTED_POSITIONS,
      unsupported_domain: ['IDP'],
    },

    forecast_cutoff: FORECAST_CUTOFF,
    generated_at: GENERATED_AT,
    cutoff_rule: WEEKLY_CUTOFF_RULE,

    preseason_input_class_rules: WEEKLY_CANONICAL_INPUT_CLASS_RULES,
    prohibited_input_classes: WEEKLY_PROHIBITED_PRESEASON_INPUT_CLASSES,
    artifact_inputs: [
      {
        input_id: 'tiber-data-prior-season-outcomes-2025',
        input_class: 'prior_season_realized_outcomes' as const,
        owner_repository: 'Prometheus-Frameworks/TIBER-Data',
        owner_commit_sha: '0'.repeat(40),
        artifact_type: 'realized_weekly_ppr_outcomes',
        artifact_version: 'v1',
        uri_or_path: 'example://tiber-data/player_weekly_ppr_outcomes_2025',
        content_sha256: PLACEHOLDER_SHA,
        source_as_of: '2026-02-15T00:00:00.000Z',
        availability_rule_id: 'prior_season_final_and_governed' as const,
        cutoff_evidence: {
          source_timestamp_locator: 'artifact.source_as_of',
          normalization_rule_id: 'utc-instant-v1',
          // Producer claim, named as such. The validator performs its own local
          // comparison against forecast_cutoff and does not trust this field.
          self_reported_status: 'eligible' as const,
          // Honest example state: source bytes are absent. A real publication
          // must change this to locally_verified and supply structured evidence.
          record_level_verification: 'unverified_requires_source_bytes' as const,
          record_count_eligible: censusRowCount,
          record_count_post_cutoff: 0,
          record_count_unresolved: 0,
        },
        limitations: ['Example fixture reference; not a real artifact.'],
      },
      {
        // Required by the canonical policy; its absence was a real gap that the
        // earlier validator did not catch.
        input_id: 'tiber-data-prior-season-usage-2025',
        input_class: 'prior_season_usage_and_role' as const,
        owner_repository: 'Prometheus-Frameworks/TIBER-Data',
        owner_commit_sha: '0'.repeat(40),
        artifact_type: 'prior_season_usage_role_aggregates',
        artifact_version: 'v1',
        uri_or_path: 'example://tiber-data/player_usage_role_2025',
        content_sha256: PLACEHOLDER_SHA,
        source_as_of: '2026-02-15T00:00:00.000Z',
        availability_rule_id: 'prior_season_final_and_governed' as const,
        cutoff_evidence: {
          source_timestamp_locator: 'artifact.source_as_of',
          normalization_rule_id: 'utc-instant-v1',
          self_reported_status: 'eligible' as const,
          record_level_verification: 'unverified_requires_source_bytes' as const,
          record_count_eligible: censusRowCount,
          record_count_post_cutoff: 0,
          record_count_unresolved: 0,
        },
        limitations: ['Example fixture reference; not a real artifact.'],
      },
      {
        input_id: 'tiber-data-roster-state-2026-w1',
        input_class: 'roster_and_team_assignment_state' as const,
        owner_repository: 'Prometheus-Frameworks/TIBER-Data',
        owner_commit_sha: '0'.repeat(40),
        artifact_type: 'roster_team_assignment_state',
        artifact_version: 'v1',
        uri_or_path: 'example://tiber-data/roster_state_2026_w1',
        content_sha256: PLACEHOLDER_SHA,
        source_as_of: CENSUS_EFFECTIVE_AT,
        availability_rule_id: 'state_effective_at_or_before_cutoff' as const,
        cutoff_evidence: {
          source_timestamp_locator: 'record.effective_at',
          normalization_rule_id: 'utc-instant-v1',
          // Producer claim, named as such. The validator performs its own local
          // comparison against forecast_cutoff and does not trust this field.
          self_reported_status: 'eligible' as const,
          // Honest example state: source bytes are absent; non-admissible.
          record_level_verification: 'unverified_requires_source_bytes' as const,
          record_count_eligible: censusRowCount,
          record_count_post_cutoff: 0,
          record_count_unresolved: 0,
        },
        limitations: ['Example fixture reference; not a real artifact.'],
      },
    ],

    scoring_profile: {
      ...TIBER_GENERIC_FULL_PPR_V1,
      profile_sha256: TIBER_GENERIC_FULL_PPR_V1_SHA256,
      source_reconciliation: {
        status: 'unavailable',
        validator_id: 'example-weekly-scoring-reconciliation',
        validator_version: '0.0.0-example',
        evidence_ref: {
          repository: WEEKLY_FORECAST_REPOSITORY,
          path: 'example://weekly/scoring-reconciliation.json',
          artifact_version: 'weekly-scoring-reconciliation-v1-example',
          content_sha256: PLACEHOLDER_SHA,
        },
        scoring_profile_sha256: TIBER_GENERIC_FULL_PPR_V1_SHA256,
        source_input_sha256s: [PLACEHOLDER_SHA],
      },
    },

    model: {
      model_id: 'example-weekly-base',
      model_version: '0.0.0-example',
      implementation_repository: WEEKLY_FORECAST_REPOSITORY,
      implementation_commit_sha: '0'.repeat(40),
      implementation_commit_evidence_sha256: PLACEHOLDER_SHA,
      configuration_sha256: PLACEHOLDER_SHA,
      feature_configuration_sha256: PLACEHOLDER_SHA,
      fitted_model_ref: null,
    },

    population_census: {
      census_artifact_ref: {
        artifact_type: 'bounded_population_census',
        artifact_version: 'v0',
        uri_or_path: 'example://tiber-data/census/2026/week-01',
        content_sha256: PLACEHOLDER_SHA,
      },
      census_sha256: PLACEHOLDER_SHA,
      // Census semantics are owned upstream and referenced, not redefined here.
      semantics_owner: 'Prometheus-Frameworks/TIBER-Data',
      semantics_ref: 'Prometheus-Frameworks/TIBER-Data#227',
      scope_definition:
        'Example bounded census. A real publication references a governed TIBER-Data census artifact.',
      effective_at: CENSUS_EFFECTIVE_AT,
      row_count: censusRowCount,
    },
    population_reconciliation: {
      output_row_count: censusRowCount,
      duplicate_population_row_ids: [],
      missing_population_row_ids: [],
      extra_population_row_ids: [],
      one_to_one_complete: true,
    },
    identity_coverage: {
      census_row_count: censusRowCount,
      resolved_count: EXAMPLE_ROWS.filter((r) => r.identity.identity_status === 'resolved').length,
      unresolved_count: EXAMPLE_ROWS.filter((r) => r.identity.identity_status === 'unresolved').length,
      conflicting_count: 0,
      coverage_rate:
        EXAMPLE_ROWS.filter((r) => r.identity.identity_status === 'resolved').length / censusRowCount,
      unresolved_population_row_ids: EXAMPLE_ROWS.filter(
        (r) => r.identity.identity_status === 'unresolved',
      ).map((r) => r.population_row_id),
      conflicting_population_row_ids: [],
    },
    status_counts: {
      forecast_available: EXAMPLE_ROWS.filter((r) => r.forecast_status === 'forecast_available').length,
      unavailable_missing_required_inputs: 0,
      unsupported_position_domain: 0,
      identity_unresolved: EXAMPLE_ROWS.filter((r) => r.forecast_status === 'identity_unresolved').length,
      identity_conflicting: 0,
      population_ineligible: 0,
      no_prior_season_history: EXAMPLE_ROWS.filter((r) => r.forecast_status === 'no_prior_season_history').length,
      roster_state_unresolved: 0,
    },

    // Point-only. Range fields exist but stay null; nothing is fabricated.
    uncertainty_status: 'unavailable_not_calibrated' as const,

    lifecycle: {
      state: 'draft' as const,
      consumer_eligibility: WEEKLY_DEFAULT_CONSUMER_ELIGIBILITY,
      // Admission requires both a separate receipt and an independently
      // configured expected receipt digest; a manifest can never admit itself.
      admission_requires_receipt: true as const,
    },

    reliability_tracking: {
      truth_label_owner: 'TIBER-Data' as const,
      truth_label_artifact_kind: 'realized_weekly_ppr_outcomes' as const,
      truth_label_ref: null,
      forge_role: 'explanatory_context_only' as const,
      forge_is_truth_label: false as const,
      scored_at: null,
    },

    seasonal_candidate_boundary: WEEKLY_SEASONAL_CANDIDATE_BOUNDARY,

    outputs: [
      {
        artifact_type: WEEKLY_PLAYER_ROWS_ARTIFACT_TYPE,
        artifact_version: WEEKLY_PLAYER_ROWS_ARTIFACT_VERSION,
        uri_or_path: 'data/fixtures/weekly-forecast-publication/2026-week-01.example.rows.json',
        content_sha256: rowsSha256,
      },
    ],
    limitations: [
      'Schema example only. Not a real publication, not a candidate, not consumable.',
      'Input, census, and model hashes are placeholders.',
      'Uncertainty is point-only: no interval is calibrated, so all range fields are null.',
      'Does not authorize running Forecast #170, training, promotion, Fantasy consumption, or deployment.',
    ],
  };

  // The manifest carries no digest *of itself* — that was self-referential, and
  // it meant an admission edit invalidated the digest that identifies the
  // publication. `weeklyManifestSha256()` hashes the finished manifest, and the
  // admission receipt binds to that value and must itself be externally pinned.
  return {
    ...base,
    digests: {
      player_rows_sha256: rowsSha256,
      serialization: {
        serializer_id: WEEKLY_SERIALIZER_ID,
        serializer_version: WEEKLY_SERIALIZER_VERSION,
      },
    },
  };
}

/**
 * Census verification context for the example.
 *
 * A real admission needs the census artifact itself; a reference plus a
 * self-declared `one_to_one_complete` proves nothing. Derived from the same rows
 * so the fixture can demonstrate a *verified* validation rather than an asserted
 * one.
 */
function exampleCensusContext(
  forManifest: WeeklyForecastPublicationManifest,
): WeeklyVerificationContext {
  return {
    expected_census_identity: {
      owner_repository: WEEKLY_GOVERNED_CENSUS_OWNER,
      semantics_ref: forManifest.population_census.semantics_ref,
      source_uri_or_path: forManifest.population_census.census_artifact_ref.uri_or_path,
      census_sha256: PLACEHOLDER_SHA,
      census_artifact_ref: {
        artifact_type: forManifest.population_census.census_artifact_ref.artifact_type,
        artifact_version: forManifest.population_census.census_artifact_ref.artifact_version,
      },
    },
    census: {
      census_sha256: PLACEHOLDER_SHA,
      population_row_ids: EXAMPLE_ROWS.map((row) => row.population_row_id),
      owner_repository: WEEKLY_GOVERNED_CENSUS_OWNER,
      semantics_ref: forManifest.population_census.semantics_ref,
      source_uri_or_path: forManifest.population_census.census_artifact_ref.uri_or_path,
      canonical_player_ids_by_row_id: Object.fromEntries(
        EXAMPLE_ROWS.map((row) => [row.population_row_id, row.identity?.canonical_player_id ?? null]),
      ),
      positions_by_row_id: Object.fromEntries(
        EXAMPLE_ROWS.map((row) => [row.population_row_id, row.identity?.position ?? null]),
      ),
      identity_states_by_row_id: Object.fromEntries(
        EXAMPLE_ROWS.map((row) => [row.population_row_id, row.identity!.identity_status]),
      ),
      eligibility_states_by_row_id: Object.fromEntries(
        EXAMPLE_ROWS.map((row) => [row.population_row_id, 'eligible' as const]),
      ),
      effective_at: forManifest.population_census.effective_at,
    },
  };
}

function main() {
  const check = process.argv.includes('--check');

  const rowsJson = canonicalForwardJson(EXAMPLE_ROWS);
  const rowsSha256 = canonicalForwardJsonSha256(EXAMPLE_ROWS);
  const manifest = buildManifest(rowsSha256);
  const manifestJson = canonicalForwardJson(manifest);

  const validation = validateWeeklyPublication(manifest, EXAMPLE_ROWS, exampleCensusContext(manifest));
  if (!validation.valid) {
    console.error('Fixture failed contract validation:');
    for (const issue of validation.errors) console.error(`  ${issue.code} @ ${issue.path}: ${issue.message}`);
    process.exit(1);
  }

  if (check) {
    const onDiskManifest = readFileSync(MANIFEST_PATH, 'utf8');
    const onDiskRows = readFileSync(ROWS_PATH, 'utf8');
    const identical = onDiskManifest === `${manifestJson}\n` && onDiskRows === `${rowsJson}\n`;
    console.log(identical ? 'byte-identical: yes' : 'byte-identical: NO');
    console.log(`manifest_sha256=${weeklyManifestSha256(manifest)}`);
    console.log(`player_rows_sha256=${rowsSha256}`);
    process.exit(identical ? 0 : 1);
  }

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(MANIFEST_PATH, `${manifestJson}\n`);
  writeFileSync(ROWS_PATH, `${rowsJson}\n`);
  console.log(`Wrote ${path.relative(REPO_ROOT, MANIFEST_PATH)}`);
  console.log(`Wrote ${path.relative(REPO_ROOT, ROWS_PATH)}`);
  console.log(`manifest_sha256=${weeklyManifestSha256(manifest)}`);
  console.log(`player_rows_sha256=${rowsSha256}`);
}

main();
