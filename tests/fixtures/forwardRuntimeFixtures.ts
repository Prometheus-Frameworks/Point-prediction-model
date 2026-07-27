import {
  FORWARD_CUTOFF_RULE,
  FORWARD_SCORING_PROFILE_ID,
  type ForwardDecisionFreezes,
  type ForwardEvidenceRef,
  type ForwardHistoricalValidationSummary,
  type ForwardTargetDefinition,
  type ForwardEvaluationDesign,
  type ForwardPlayerIdentity,
} from '../../src/contracts/forwardSeasonalPpr.js';
import {
  TIBER_GENERIC_FULL_PPR_V1_PROFILE_REF,
  TIBER_GENERIC_FULL_PPR_V1_SHA256,
  type ScoringReconciliationEvidenceRef,
} from '../../src/contracts/genericFullPprProfile.js';
import {
  FORWARD_RIDGE_CONFIGURATION_SCHEMA_VERSION,
  HISTORICAL_FORWARD_TRAINING_ROW_SCHEMA_VERSION,
  sha256ForwardCanonicalValue,
  type FrozenForwardRidgeConfigurationPackageV1,
  type FrozenForwardRidgeConfigurationV1,
  type HistoricalForwardTrainingRowV1,
} from '../../src/models/seasonal/forwardRidgeModel.js';
import {
  canonicalForwardJsonSha256,
  compareForwardCanonicalStrings,
} from '../../src/serialization/canonicalForwardArtifacts.js';
import {
  computeForwardPinnedPackageSha256,
  type ForwardCensusPayload,
  type ForwardCensusRow,
  type ForwardFutureFeatureRow,
  type ForwardInferencePayload,
  type ForwardPinnedInputPackage,
  type ForwardTrainingPayload,
  type RunForwardCandidateInput,
} from '../../src/services/runForwardCandidateService.js';

export const SYNTHETIC_FORWARD_RUN_ID = 'fixture-forward-runtime-2099-001';
export const SYNTHETIC_FORWARD_INPUT_SEASON = 2098;
export const SYNTHETIC_FORWARD_TARGET_SEASON = 2099;
export const SYNTHETIC_FORWARD_CUTOFF = '2099-07-01T12:00:00.000Z';
export const SYNTHETIC_FORWARD_GENERATED_AT = '2099-07-01T13:00:00.000Z';
export const SYNTHETIC_FORWARD_GIT_SHA = '1'.repeat(40);

const FUTURE_INPUT_ID = 'fixture-future-feature-package';
const TRAINING_INPUT_ID = 'fixture-historical-training-package';
const CENSUS_INPUT_ID = 'fixture-population-census';
const OWNER_COMMIT = '2'.repeat(40);
const EVIDENCE_SHA = '3'.repeat(64);
const MARKER_SHA = '4'.repeat(64);
const NORMALIZATION_SHA = '5'.repeat(64);
const SCORING_EVIDENCE_SHA = '6'.repeat(64);

const evidenceRef = (
  inputId: string | null,
  recordId: string,
  contentSha256 = EVIDENCE_SHA,
): ForwardEvidenceRef => ({
  input_id: inputId,
  uri_or_path: `tests/fixtures/evidence/${recordId}.json`,
  content_sha256: contentSha256,
  record_id: recordId,
});

const configuration = (): FrozenForwardRidgeConfigurationV1 => ({
  configuration_schema_version: FORWARD_RIDGE_CONFIGURATION_SCHEMA_VERSION,
  configuration_id: 'fixture-forward-ridge-configuration-v1',
  feature_set_id: 'fixture-base-features-only-v1',
  feature_admission_decision_id: 'fixture-feature-admission-decision',
  feature_admission_evidence_sha256: '7'.repeat(64),
  model_id: 'fixture-seasonal-forward-ridge',
  model_version: 'fixture-v1',
  ordered_numeric_features: [
    {
      name: 'previous_ppr',
      source_input_id: FUTURE_INPUT_ID,
      source_field: 'previous_ppr',
      transform_id: 'identity_numeric_v1',
      missingness_policy: 'reject_row',
    },
    {
      name: 'volume',
      source_input_id: FUTURE_INPUT_ID,
      source_field: 'volume',
      transform_id: 'training_mean_with_indicator_v1',
      missingness_policy: 'impute_training_mean_with_indicator',
    },
    {
      name: 'rush_volume',
      source_input_id: FUTURE_INPUT_ID,
      source_field: 'rush_volume',
      transform_id: 'zero_with_indicator_v1',
      missingness_policy: 'impute_zero_with_indicator',
    },
  ],
  position_levels: ['QB', 'RB', 'WR', 'TE'],
  position_reference_level: 'TE',
  lambda: 1,
  clamp: { kind: 'minimum', minimum: 0 },
  software_version: 'fixture-forward-runtime-v1',
});

const configurationPackage = (): FrozenForwardRidgeConfigurationPackageV1 => {
  const value = configuration();
  return {
    configuration_sha256: sha256ForwardCanonicalValue(value),
    configuration: value,
  };
};

const historicalRows = (
  configurationSha256: string,
): HistoricalForwardTrainingRowV1[] =>
  Array.from({ length: 12 }, (_, index) => ({
    row_schema_version: HISTORICAL_FORWARD_TRAINING_ROW_SCHEMA_VERSION,
    row_kind: 'historical_forward_training',
    historical_row_id: `fixture-history-${String(index).padStart(2, '0')}`,
    historical_origin_id: index < 6
      ? 'fixture-origin-2096'
      : 'fixture-origin-2097',
    input_season: index < 6 ? 2095 : 2096,
    target_season: index < 6 ? 2096 : 2097,
    configuration_sha256: configurationSha256,
    position: ['QB', 'RB', 'WR', 'TE'][index % 4],
    source_features: {
      previous_ppr: 75 + index * 17,
      volume: index === 1 ? null : 35 + index * 4,
      rush_volume: index === 2 ? null : index * 2,
    },
    source_missingness: {
      previous_ppr: false,
      volume: index === 1,
      rush_volume: index === 2,
    },
    target: 84 + index * 18,
  }));

const playerIdentity = (
  populationRowId: string,
  canonicalPlayerId: string | null,
  position: string | null,
): ForwardPlayerIdentity => ({
  source_identity_ref: evidenceRef(CENSUS_INPUT_ID, `${populationRowId}-identity`),
  canonical_player_id: canonicalPlayerId,
  display_name: `Synthetic ${populationRowId}`,
  position,
  nfl_team_id: null,
  nfl_team_abbr: null,
  team_assignment_status: 'unknown',
  ownership_status: null,
  team_assignment_evidence_ref: null,
  provider_eligibility: [],
});

const censusRow = (
  populationRowId: string,
  options: Pick<
    ForwardCensusRow,
    'identity_status' | 'eligibility_status' | 'position_domain_status'
  > & {
    canonicalPlayerId: string | null;
    position: string | null;
  },
): ForwardCensusRow => ({
  population_row_id: populationRowId,
  player: playerIdentity(
    populationRowId,
    options.canonicalPlayerId,
    options.position,
  ),
  identity_status: options.identity_status,
  eligibility_status: options.eligibility_status,
  position_domain_status: options.position_domain_status,
  status_evidence_refs: [
    evidenceRef(CENSUS_INPUT_ID, `${populationRowId}-status`),
  ],
});

const censusPayload = (): ForwardCensusPayload => {
  const eligibilityPolicy = {
    policy_id: 'fixture-eligibility-policy-v1',
    description: 'Synthetic contract-test policy only.',
  };
  const duplicatePolicy = {
    policy_id: 'fixture-canonical-id-policy-v1',
    max_rows_per_resolved_canonical_id: 1,
  };
  return {
    // Deliberately non-canonical input order; the service must sort outputs.
    rows: [
      censusRow('fixture-pop-ineligible', {
        identity_status: 'resolved',
        eligibility_status: 'ineligible',
        position_domain_status: 'supported',
        canonicalPlayerId: 'fixture-player-ineligible',
        position: 'RB',
      }),
      censusRow('fixture-pop-idp', {
        identity_status: 'resolved',
        eligibility_status: 'eligible',
        position_domain_status: 'unsupported',
        canonicalPlayerId: 'fixture-player-idp',
        position: 'IDP',
      }),
      censusRow('fixture-pop-available', {
        identity_status: 'resolved',
        eligibility_status: 'eligible',
        position_domain_status: 'supported',
        canonicalPlayerId: 'fixture-player-available',
        position: 'WR',
      }),
      censusRow('fixture-pop-domain-unresolved', {
        identity_status: 'resolved',
        eligibility_status: 'eligible',
        position_domain_status: 'unresolved',
        canonicalPlayerId: 'fixture-player-domain',
        position: null,
      }),
      censusRow('fixture-pop-identity-unresolved', {
        identity_status: 'unresolved',
        eligibility_status: 'eligible',
        position_domain_status: 'supported',
        canonicalPlayerId: null,
        position: 'WR',
      }),
      censusRow('fixture-pop-missing-input', {
        identity_status: 'resolved',
        eligibility_status: 'eligible',
        position_domain_status: 'supported',
        canonicalPlayerId: 'fixture-player-missing',
        position: 'WR',
      }),
      censusRow('fixture-pop-eligibility-unresolved', {
        identity_status: 'resolved',
        eligibility_status: 'unresolved',
        position_domain_status: 'supported',
        canonicalPlayerId: 'fixture-player-eligibility',
        position: 'TE',
      }),
    ],
    scope_definition: 'Seven unmistakably synthetic rows covering every v1 output status.',
    effective_at: SYNTHETIC_FORWARD_CUTOFF,
    eligibility_policy_id: eligibilityPolicy.policy_id,
    eligibility_policy_sha256: canonicalForwardJsonSha256(eligibilityPolicy),
    duplicate_canonical_id_policy: {
      ...duplicatePolicy,
      policy_sha256: canonicalForwardJsonSha256(duplicatePolicy),
    },
  };
};

const futureRows = (): ForwardFutureFeatureRow[] => [
  {
    population_row_id: 'fixture-pop-missing-input',
    input_season: SYNTHETIC_FORWARD_INPUT_SEASON,
    target_season: SYNTHETIC_FORWARD_TARGET_SEASON,
    position: 'WR',
    source_features: {
      previous_ppr: null,
      volume: 80,
      rush_volume: 2,
    },
    source_missingness: {
      previous_ppr: true,
      volume: false,
      rush_volume: false,
    },
  },
  {
    population_row_id: 'fixture-pop-available',
    input_season: SYNTHETIC_FORWARD_INPUT_SEASON,
    target_season: SYNTHETIC_FORWARD_TARGET_SEASON,
    position: 'WR',
    source_features: {
      previous_ppr: 205,
      volume: null,
      rush_volume: 3,
    },
    source_missingness: {
      previous_ppr: false,
      volume: true,
      rush_volume: false,
    },
  },
];

const pinnedPackage = <T>(
  values: Omit<
    ForwardPinnedInputPackage<T>,
    | 'content_sha256'
    | 'governance_decision_refs'
    | 'governance_marker_ref'
    | 'normalization_rule_sha256'
  >,
): ForwardPinnedInputPackage<T> => {
  const value: ForwardPinnedInputPackage<T> = {
    ...values,
    content_sha256: '',
    governance_decision_refs: [
      evidenceRef(values.input_id, `${values.input_id}-governance`),
    ],
    governance_marker_ref: evidenceRef(
      values.input_id,
      `${values.input_id}-governance-marker`,
      MARKER_SHA,
    ),
    normalization_rule_sha256: NORMALIZATION_SHA,
  };
  value.content_sha256 = computeForwardPinnedPackageSha256(value);
  return value;
};

const packageBase = <T>(
  inputId: string,
  artifactType: string,
  payload: T,
  rowCount: number,
): ForwardPinnedInputPackage<T> =>
  pinnedPackage({
    input_id: inputId,
    owner_repository: 'Prometheus-Frameworks/TIBER-Synthetic-Fixtures',
    owner_commit_sha: OWNER_COMMIT,
    artifact_type: artifactType,
    artifact_version: 'synthetic-fixture-v1',
    uri_or_path: `tests/fixtures/${inputId}.json`,
    content: {
      payload,
      cutoff_records: [{
        record_id: `${inputId}-cutoff-record`,
        fact_available_at: '2099-06-30T10:00:00.000Z',
        evidence_ref: evidenceRef(inputId, `${inputId}-cutoff-evidence`),
      }],
    },
    source_as_of: '2099-06-30',
    artifact_generated_at: '2099-07-02T00:00:00.000Z',
    governance_status: 'governed',
    availability_status: 'available',
    model_admission: 'admitted',
    feature_names_admitted: [],
    source_timestamp_locator: 'content.cutoff_records[].fact_available_at',
    normalization_rule_id: 'fixture-direct-utc-availability-v1',
    population: {
      row_count: rowCount,
      matched_count: rowCount,
      missing_count: 0,
    },
    limitations: ['Synthetic package for unit tests only; never a real forecast input.'],
  });

const decisionFreezes = (
  configurationSha256: string,
): ForwardDecisionFreezes => ({
  configuration: {
    decision_id: 'fixture-configuration-freeze-decision',
    frozen_at: '2099-06-29T12:00:00.000Z',
    fact_available_at: '2099-06-29T12:01:00.000Z',
    evidence_refs: [
      evidenceRef(null, 'fixture-configuration-freeze'),
    ],
    configuration_sha256: configurationSha256,
  },
  source_code: {
    decision_id: 'fixture-source-code-freeze-decision',
    frozen_at: '2099-06-29T13:00:00.000Z',
    fact_available_at: '2099-06-29T13:01:00.000Z',
    evidence_refs: [
      evidenceRef(null, 'fixture-source-code-freeze'),
    ],
    git_commit_sha: SYNTHETIC_FORWARD_GIT_SHA,
  },
});

const targetDefinition = (): ForwardTargetDefinition => ({
  target_id: 'fixture-generic-full-ppr-season-total',
  description: 'Synthetic full regular-season generic-PPR total.',
  target_season: SYNTHETIC_FORWARD_TARGET_SEASON,
  regular_season_only: true,
  week_inclusion_rule: 'fixture weeks 1 through 18, regular season only',
  season_completeness_rule: 'fixture completeness rule',
  aggregation_rule: 'fixture sum of reconciled weekly components',
  scoring_profile_id: FORWARD_SCORING_PROFILE_ID,
  outcome_field: 'actual_outcome',
  forward_outcome_must_be_null: true,
});

const evaluationDesign = (): ForwardEvaluationDesign => {
  const design = {
    design_id: 'fixture-forward-evaluation-design-v1',
    historical_origins: [
      {
        origin_id: 'fixture-origin-2096',
        input_seasons: [2095],
        target_season: 2096,
        origin_cutoff: '2096-07-01T12:00:00.000Z',
        input_artifact_sha256: '8'.repeat(64),
        target_artifact_sha256: '9'.repeat(64),
      },
      {
        origin_id: 'fixture-origin-2097',
        input_seasons: [2096],
        target_season: 2097,
        origin_cutoff: '2097-07-01T12:00:00.000Z',
        input_artifact_sha256: 'a'.repeat(64),
        target_artifact_sha256: 'b'.repeat(64),
      },
    ],
    model_selection_partition: 'fixture first historical origin',
    final_evaluation_partition: 'fixture second disjoint historical origin',
    split_method: 'fixture rolling-origin',
    fold_grouping: 'fixture player and time grouping',
    hyperparameter_selection: 'fixture frozen before future census',
    final_origin_not_used_for_tuning: true as const,
    baseline_definitions: ['fixture previous-season baseline'],
  };
  return {
    ...design,
    design_sha256: canonicalForwardJsonSha256(design),
  };
};

const validationSummary = (): ForwardHistoricalValidationSummary => ({
  evaluation_artifact_refs: [{
    artifact_type: 'synthetic_historical_evaluation',
    artifact_version: 'synthetic-v1',
    uri_or_path: 'tests/fixtures/synthetic-historical-evaluation.json',
    content_sha256: 'c'.repeat(64),
  }],
  overall_metrics: { mae: 1 },
  position_metrics: {},
  calibration_metrics: {},
  sanity_controls: ['synthetic-only sanity control'],
  limitations: ['Synthetic validation summary; not production evidence.'],
});

export const makeSyntheticForwardRuntimeInput =
  (): RunForwardCandidateInput => {
    const frozenConfiguration = configurationPackage();
    const trainingPayload: ForwardTrainingPayload = {
      rows: historicalRows(frozenConfiguration.configuration_sha256),
    };
    const census = censusPayload();
    const futurePayload: ForwardInferencePayload = {
      rows: futureRows(),
    };
    const historicalPackage = packageBase(
      TRAINING_INPUT_ID,
      'synthetic_historical_training_rows',
      trainingPayload,
      trainingPayload.rows.length,
    );
    historicalPackage.feature_names_admitted =
      frozenConfiguration.configuration.ordered_numeric_features.map((feature) => feature.name);
    const futurePackage = packageBase(
      FUTURE_INPUT_ID,
      'synthetic_future_feature_rows',
      futurePayload,
      futurePayload.rows.length,
    );
    futurePackage.feature_names_admitted =
      frozenConfiguration.configuration.ordered_numeric_features.map((feature) => feature.name);
    const censusPackage = packageBase(
      CENSUS_INPUT_ID,
      'synthetic_population_census',
      census,
      census.rows.length,
    );
    const packages = [historicalPackage, futurePackage, censusPackage];
    const inputPins = Object.fromEntries(
      packages.map((packageValue) => [
        packageValue.input_id,
        packageValue.content_sha256,
      ]),
    );
    const scoringInputHashes = [
      historicalPackage.content_sha256,
      futurePackage.content_sha256,
    ].sort(compareForwardCanonicalStrings);
    const reconciliation: ScoringReconciliationEvidenceRef = {
      status: 'passed',
      validator_id: 'fixture-scoring-reference-validator',
      validator_version: '1.0.0',
      evidence_ref: {
        repository: 'Prometheus-Frameworks/TIBER-Synthetic-Fixtures',
        path: 'tests/fixtures/scoring-reconciliation-reference.json',
        artifact_version: 'synthetic-v1',
        content_sha256: SCORING_EVIDENCE_SHA,
      },
      scoring_profile_sha256: TIBER_GENERIC_FULL_PPR_V1_SHA256,
      source_input_sha256s: scoringInputHashes,
    };

    return {
      run_id: SYNTHETIC_FORWARD_RUN_ID,
      target_season: SYNTHETIC_FORWARD_TARGET_SEASON,
      input_season: SYNTHETIC_FORWARD_INPUT_SEASON,
      forecast_cutoff: SYNTHETIC_FORWARD_CUTOFF,
      generated_at: SYNTHETIC_FORWARD_GENERATED_AT,
      git_commit_sha: SYNTHETIC_FORWARD_GIT_SHA,
      lane_version: 'fixture-forward-runtime-v1',
      frozen_configuration: frozenConfiguration,
      decision_freezes: decisionFreezes(frozenConfiguration.configuration_sha256),
      historical_training_package: historicalPackage,
      future_feature_package: futurePackage,
      census_package: censusPackage,
      scoring_profile_ref: TIBER_GENERIC_FULL_PPR_V1_PROFILE_REF,
      scoring_reconciliation: reconciliation,
      scoring_input_ids: [TRAINING_INPUT_ID, FUTURE_INPUT_ID],
      expected_pins: {
        git_commit_sha: SYNTHETIC_FORWARD_GIT_SHA,
        configuration_sha256: frozenConfiguration.configuration_sha256,
        scoring_profile_sha256: TIBER_GENERIC_FULL_PPR_V1_SHA256,
        input_sha256: inputPins,
        census_sha256: censusPackage.content_sha256,
      },
      target_definition: targetDefinition(),
      evaluation_design: evaluationDesign(),
      historical_validation_summary: validationSummary(),
      admitted_capabilities: [],
      limitations: [
        'Synthetic fixture execution only.',
        `Cutoff semantics: ${FORWARD_CUTOFF_RULE}.`,
        'Scoring reconciliation is a pinned reference/binding check only.',
      ],
    };
  };
