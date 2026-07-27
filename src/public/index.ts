export type {
  ConfidenceBand as ScoringConfidenceBand,
  FragilityTag,
  LeagueContextInput,
  PlayerOpportunityInput,
  ReplacementBaseline,
  ReplacementPointsOverride,
  RosScoringRequest,
  RosScoringResponse,
  ScoredPlayerOutput,
  ScoringPosition,
  VolatilityTag,
  WeeklyScoringRequest,
  WeeklyScoringResponse,
} from '../contracts/scoring.js';
export type {
  BuildWeeklyCompareViewOutput,
  BuildWeeklyCompareViewRequest,
  BuildRosPlayerCardOutput,
  BuildWeeklyPlayerCardOutput,
  BuildWeeklyRankingsViewOutput,
  TiberWeeklyCompareDelta,
  TiberWeeklyCompareVerdict,
  TiberWeeklyCompareView,
  TiberWeeklyCompareRequest,
  TiberWeeklyPlayerCardRequest,
  TiberWeeklyRankingsRequest,
  TiberRosPlayerCardRequest,
  TiberRosPlayerCard,
  TiberScoringComponents,
  TiberScoringMetadata,
  TiberWeeklyPlayerCard,
  TiberWeeklyRankingsRow,
  TiberWeeklyRankingsView,
} from '../contracts/tiberScoring.js';

export type {
  TiberDataIdentityRef,
  TiberDataPlayerOpportunityProjection,
  TiberDataProjectionCoverageReport,
  TiberDataProjectionFieldCoverage,
  TiberDataProjectionFieldSeverity,
  TiberDataProjectionInputBundle,
  TiberDataProjectionMissingField,
  TiberDataSourceDatasetRef,
  TiberDataWeeklyScoringAdapterOutput,
} from '../contracts/tiberDataProjectionInput.js';
export {
  TIBER_DATA_PROJECTION_INPUT_CONTRACT_VERSION,
  tiberDataOptionalPlayerOpportunityFields,
  tiberDataRequiredPlayerOpportunityFields,
  tiberDataScoringPositions,
} from '../contracts/tiberDataProjectionInput.js';
export { toWeeklyScoringRequest } from '../adapters/tiberData/toWeeklyScoringRequest.js';
export type {
  FromProjectionInputFixtureIdentityConfig,
  FromProjectionInputFixtureInput,
  FromProjectionInputFixtureOutput,
} from '../adapters/tiberData/fromProjectionInputFixture.js';
export { fromProjectionInputFixture } from '../adapters/tiberData/fromProjectionInputFixture.js';
export type {
  ProjectionInputFixtureBundle,
  ProjectionInputFixtureIdentityRef,
  ProjectionInputFixtureLeagueContext,
  ProjectionInputFixtureMissingField,
  ProjectionInputFixtureScope,
  ProjectionInputFixtureSourceDatasetRef,
} from '../contracts/tiberDataProjectionInputFixture.js';
export { TIBER_DATA_PROJECTION_INPUT_FIXTURE_CONTRACT_VERSION } from '../contracts/tiberDataProjectionInputFixture.js';

export type {
  ProjectionArtifactRef,
  ProjectionArtifactType,
  ProjectionInputCoverageArtifact,
  ProjectionModelRef,
  ProjectionRowInputRefs,
  ProjectionRunManifestArtifact,
  ProjectionRunOutputRef,
  ReplacementBaselineArtifactBaselines,
  ReplacementBaselineArtifactPositionBaseline,
  ReplacementBaselinesArtifact,
  RosPlayerProjectionArtifactRow,
  WeeklyPlayerProjectionArtifactRow,
} from '../contracts/projectionArtifacts.js';
export type {
  ForecastTeamstateInputMetadata,
  RunComparisonMetadataScaffold,
  TeamstatePressureReadinessMetadata,
  TeamstateRedZoneReadinessMetadata,
} from '../contracts/teamstateInput.js';
export {
  TEAMSTATE_FORECAST_INPUT_BOUNDARY_VERSION,
  buildRunComparisonMetadataScaffold,
  readGovernedTeamstateInput,
} from '../contracts/teamstateInput.js';
export type {
  WriteProjectionArtifactsInput,
  WriteProjectionArtifactsOutput,
  WrittenProjectionArtifact,
} from '../artifacts/writeProjectionArtifacts.js';
export { writeProjectionArtifacts } from '../artifacts/writeProjectionArtifacts.js';

export type { ProjectionRehearsalResult, RunProjectionRehearsalInput } from '../rehearsal/runProjectionRehearsal.js';
export { runProjectionRehearsal } from '../rehearsal/runProjectionRehearsal.js';
export { fixtureLeagueContext, fixtureTiberDataProjectionBundle } from '../rehearsal/fixtures/projectionRehearsalFixtures.js';

export type {
  BuildRun2ManifestRehearsalInput,
  Run2FieldDisposition,
  Run2ManifestRehearsalResult,
  Run2RehearsalStatus,
} from '../rehearsal/runRun2ManifestRehearsal.js';
export {
  RUN2_DRY_RUN_MANIFEST_WARNING_CODE,
  RUN2_MANIFEST_REHEARSAL_VERSION,
  buildRun2ManifestRehearsal,
} from '../rehearsal/runRun2ManifestRehearsal.js';
export type {
  Run2FeatureExclusion,
  Run2FeatureExclusionDisposition,
  Run2FeatureInclusionPreflightReport,
  Run2FeatureLeakagePosture,
} from '../rehearsal/runRun2FeatureInclusionPreflight.js';
export {
  RUN2_FEATURE_INCLUSION_PREFLIGHT_VERSION,
  buildRun2FeatureInclusionPreflight,
} from '../rehearsal/runRun2FeatureInclusionPreflight.js';
export type {
  BuildRun2FeatureTableRehearsalInput,
  Run2FeatureTableRehearsalReport,
  Run2FeatureTableRehearsalRow,
  Run2FeatureTableRehearsalStatus,
  Run2FeatureTableTargetColumn,
} from '../rehearsal/runRun2FeatureTableRehearsal.js';
export {
  RUN2_FEATURE_TABLE_REHEARSAL_VERSION,
  RUN2_FEATURE_TABLE_ROW_GRAIN,
  buildRun2FeatureTableRehearsal,
} from '../rehearsal/runRun2FeatureTableRehearsal.js';
export type {
  BuildRun2FeatureMatrixCandidateInput,
  Run2FeatureMatrixCandidateReport,
  Run2FeatureMatrixCandidateRow,
  Run2FeatureMatrixJoinPosture,
  Run2FeatureMatrixJoinStatus,
  Run2FeatureMatrixTargetColumn,
} from '../rehearsal/runRun2FeatureMatrixCandidate.js';
export {
  RUN2_FEATURE_MATRIX_CANDIDATE_VERSION,
  RUN2_FEATURE_MATRIX_ROW_GRAIN,
  buildRun2FeatureMatrixCandidate,
} from '../rehearsal/runRun2FeatureMatrixCandidate.js';
export type {
  AssessRun2TeamstateValueBindingReadinessInput,
  Run2ExpectedTeamstateArtifact,
  Run2RequiredCutoff,
  Run2RequiredGovernance,
  Run2RowGrainAlignment,
  Run2TeamstateValueBindingReadinessReport,
  Run2ValueBindingGate,
  Run2ValueBindingReadinessStatus,
} from '../rehearsal/runRun2TeamstateValueBindingReadiness.js';
export {
  RUN2_TEAMSTATE_VALUE_BINDING_READINESS_VERSION,
  assessRun2TeamstateValueBindingReadiness,
} from '../rehearsal/runRun2TeamstateValueBindingReadiness.js';
export type {
  BindRun2GovernedTeamstateValuesInput,
  Run2BindingCoverage,
  Run2BoundCandidateRow,
  Run2BoundFeatureMatrixReport,
  Run2BoundTeamstateAggregate,
  Run2RecordedCutoff,
  Run2ValueBindingStatus,
  TeamstateTeamWeekValueRow,
} from '../rehearsal/runRun2GovernedTeamstateValueBinding.js';
export {
  RUN2_BINDING_JOIN_KEYS,
  RUN2_GOVERNED_VALUE_BINDING_VERSION,
  RUN2_TEAMSTATE_AGGREGATION_METHOD,
  bindRun2GovernedTeamstateValues,
} from '../rehearsal/runRun2GovernedTeamstateValueBinding.js';
export { fixtureGovernedTeamstateReadinessReport } from '../rehearsal/fixtures/governedTeamstateReadinessFixture.js';
export {
  fixtureGovernedTeamstateBindingArtifact,
  fixtureGovernedTeamstateBindingTeamWeekValues,
} from '../rehearsal/fixtures/governedTeamstateBindingFixture.js';
export type {
  BuildRun2ShuffledTeamstateSanityArmInput,
  Run2SanityArmStatus,
  Run2ShuffleCoverage,
  Run2ShuffleMapEntry,
  Run2ShuffledCandidateRow,
  Run2ShuffledTeamstateSanityReport,
} from '../rehearsal/runRun2ShuffledTeamstateSanityArm.js';
export {
  RUN2_SHUFFLED_SANITY_ARM_VERSION,
  RUN2_SHUFFLE_DEFAULT_SEED,
  RUN2_SHUFFLE_METHOD,
  buildRun2ShuffledTeamstateSanityArm,
} from '../rehearsal/runRun2ShuffledTeamstateSanityArm.js';
export { isDerangement, mulberry32, seededDerangement, seededPermutation } from '../rehearsal/util/seededShuffle.js';
export type {
  RunRun2TeamstateComparisonInput,
  Run2ArmMetrics,
  Run2ArmName,
  Run2ArmParity,
  Run2ComparisonInterpretation,
  Run2ComparisonStatus,
  Run2CoverageSummary,
  Run2MetricDelta,
  Run2NullHandlingSummary,
  Run2SignalInterpretation,
  Run2TeamstateComparisonReport,
} from '../rehearsal/runRun2TeamstateComparison.js';
export {
  RUN2_COMPARISON_NULL_HANDLING,
  RUN2_COMPARISON_RIDGE_LAMBDA,
  RUN2_TEAMSTATE_COMPARISON_VERSION,
  interpretRun2Comparison,
  runRun2TeamstateComparison,
} from '../rehearsal/runRun2TeamstateComparison.js';
export {
  FULL_MODE_GOVERNED_SOURCE_SHA256,
  FULL_MODE_TEAMSTATE_FIELD_READINESS,
  RUN2_RERUN_NEXT_STEP_BY_SIGNAL,
  buildFullModeTeamstateBindingArtifact,
  nextStepForRerun,
  runRun2ComparisonRerunFromValues,
} from '../rehearsal/runRun2ComparisonRerun.js';
export type {
  Run2MaeDirection,
  Run2OperatorDecision,
  Run2OperatorDecisionStatus,
  Run2OutcomeDelta,
  Run2OutcomeExperimentIdentity,
  Run2OutcomeRecord,
  Run2OutcomeTtsImpact,
} from '../reports/run2TeamstateComparisonOutcome.js';
export {
  RUN2_OPERATOR_DECISION_STATUSES,
  RUN2_OUTCOME_RECORD_VERSION,
  RUN2_OUTCOME_REPO,
  buildRun2TeamstateComparisonOutcome,
  operatorDecisionForComparison,
  renderRun2TeamstateComparisonOutcomeMarkdown,
} from '../reports/run2TeamstateComparisonOutcome.js';
export type {
  Run2CoverageCutoffEvidence,
  Run2CoverageGateCheck,
  Run2CoverageGateDecision,
  Run2CoverageGateResult,
  Run2CoverageGateStatus,
  Run2CoverageGovernanceEvidence,
  Run2CoverageJoinRow,
  Run2CoveragePositionEvidence,
  Run2TeamstateCoverageEvidence,
} from '../reports/run2TeamstateCoverageGate.js';
export {
  NFL_TEAM_CODES_32,
  RUN2_COVERAGE_GATE_VERSION,
  RUN2_GATE_MIN_NONNULL_CELL_COVERAGE,
  RUN2_GATE_MIN_SCORED_ROW_COVERAGE,
  RUN2_GATE_MIN_TEAM_COVERAGE,
  RUN2_GATE_PREFERRED_TEAM_COVERAGE,
  RUN2_PREVIOUS_RECORDED_COVERAGE_EVIDENCE,
  evaluateRun2TeamstateCoverageGate,
} from '../reports/run2TeamstateCoverageGate.js';
export type {
  MirroredTeamstateCoverageEvidence,
  MirroredTeamstateFullArtifact,
  Run2CoverageGateEvaluation,
  Run2CoverageGateEvaluationInputs,
  TeamSeasonFeatureAvailability,
} from '../rehearsal/runRun2CoverageGateEvaluation.js';
export {
  RUN2_TEAMSTATE_FEATURE_COLUMNS,
  buildRun2CoverageGateEvidenceFromTeamstate,
  evaluateRun2CoverageGateFromTeamstate,
  scoredForecastPopulation,
} from '../rehearsal/runRun2CoverageGateEvaluation.js';

export type {
  PlayerSeasonCoverageEvidence,
  PlayerSeasonCoverageGateCheck,
  PlayerSeasonCoverageGateDecision,
  PlayerSeasonCoverageGateResult,
  PlayerSeasonCoverageGateStatus,
  PlayerSeasonCoverageGrainEvidence,
  PlayerSeasonCoverageIdentityEvidence,
  PlayerSeasonCoverageProposedCutoffDesign,
  PlayerSeasonCoverageProvenanceEvidence,
  PlayerSeasonCoverageRowSample,
  PlayerSeasonCoverageScopeEvidence,
} from '../reports/playerSeasonCoverageGate.js';
export {
  APPROVED_SOURCE_NAME_SUBSTRINGS,
  EXPECTED_ARTIFACT_STATUS,
  EXPECTED_POSITIONS,
  EXPECTED_ROW_GRAIN,
  EXPECTED_SEASONS,
  EXPECTED_SEASON_TYPE_SCOPE,
  PLAYER_SEASON_COVERAGE_GATE_VERSION,
  evaluatePlayerSeasonCoverageGate,
} from '../reports/playerSeasonCoverageGate.js';
export type {
  MirroredPlayerSeasonCoverageEvidence,
  PlayerSeasonCoverageGateEvaluation,
} from '../rehearsal/runPlayerSeasonCoverageGateEvaluation.js';
export {
  buildPlayerSeasonCoverageEvidenceFromMirror,
  evaluatePlayerSeasonCoverageGateFromMirror,
} from '../rehearsal/runPlayerSeasonCoverageGateEvaluation.js';

export type {
  PlayerHistoryAgeCareerFeatures,
  PlayerHistoryCoverageFeatures,
  PlayerHistoryCoverageSummary,
  PlayerHistoryFeatureFamily,
  PlayerHistoryFeatureOptions,
  PlayerHistoryFeatureRow,
  PlayerHistoryImputationRow,
  PlayerHistoryInputRow,
  PlayerHistoryProductionFeatures,
  PlayerHistoryProductionSummary,
  PlayerHistorySourceRef,
  PlayerHistoryTeamContextFeatures,
  PlayerHistoryUsageFeatures,
  PlayerHistoryUsageSummary,
} from '../rehearsal/playerHistoryFeatureScaffold.js';
export {
  ALL_PLAYER_HISTORY_FEATURE_FAMILIES,
  EXCLUDED_UNAVAILABLE_USAGE_FIELDS,
  PLAYER_HISTORY_APPROVED_POSITIONS,
  PLAYER_HISTORY_APPROVED_SEASON_TYPE,
  PLAYER_HISTORY_FEATURE_SCAFFOLD_VERSION,
  assertNoForbiddenAvailabilityFields,
  assertPlayerHistoryInputSeasonsInBounds,
  assertPlayerHistoryScopeInBounds,
  buildPlayerHistoryFeatures,
  computePlayerHistoryTrainFoldMeans,
  filterPlayerHistoryInputRows,
  imputePlayerHistoryValue,
  summarizePlayerHistoryCoverage,
} from '../rehearsal/playerHistoryFeatureScaffold.js';
export type {
  BuildPlayerHistoryDryRunMatrixInput,
  PlayerHistoryDryRunExclusion,
  PlayerHistoryDryRunExclusionReason,
  PlayerHistoryDryRunFamilyCoverage,
  PlayerHistoryDryRunJoinSummary,
  PlayerHistoryDryRunMatrixReport,
  PlayerHistoryDryRunMatrixRow,
  PlayerHistoryDryRunMissingnessSummary,
  PlayerHistoryDryRunShuffleGroupReport,
  PlayerHistoryDryRunShuffledControl,
  PlayerHistoryExperimentArm,
} from '../rehearsal/playerHistoryExperimentDryRunMatrix.js';
export {
  PLAYER_HISTORY_DRY_RUN_MATRIX_VERSION,
  PLAYER_HISTORY_DRY_RUN_NULL_POSTURE,
  PLAYER_HISTORY_DRY_RUN_ROW_KIND,
  PLAYER_HISTORY_DRY_RUN_SHUFFLE_METHOD,
  PLAYER_HISTORY_DRY_RUN_SHUFFLE_SEED,
  PLAYER_HISTORY_EXPERIMENT_ARMS,
  buildPlayerHistoryExperimentDryRunMatrix,
} from '../rehearsal/playerHistoryExperimentDryRunMatrix.js';
export type { PlayerHistoryDryRunTargetRow } from '../rehearsal/playerHistoryExperimentDryRunMatrix.js';
export type {
  PlayerHistoryNoHistoryPlayer,
  PlayerHistoryOutcomeMirror,
  PlayerHistoryOutcomeMirrorRow,
  PlayerHistoryRunPopulationInputMirror,
  SourceCoverageArtifact,
  SourceCoverageRecord,
} from '../rehearsal/playerHistoryRunPopulationMirrors.js';
export {
  EXPECTED_SOURCE_ARTIFACT_STATUS,
  PINNED_SOURCE_ARTIFACT_PATH,
  PINNED_SOURCE_ARTIFACT_REPO,
  PINNED_SOURCE_ARTIFACT_SHA256,
  PLAYER_HISTORY_RUN_POPULATION_MIRRORS_VERSION,
  RUN_POPULATION_INPUT_SEASONS,
  RUN_POPULATION_TARGET_SEASON,
  assertPinnedSourceArtifactSha256,
  buildPlayerHistoryOutcomeMirror,
  buildPlayerHistoryRunPopulationInputMirror,
} from '../rehearsal/playerHistoryRunPopulationMirrors.js';
export type {
  PlayerHistoryTargetPopulationGateCheck,
  PlayerHistoryTargetPopulationGateDecision,
  PlayerHistoryTargetPopulationGateResult,
  PlayerHistoryTargetPopulationGateStatus,
} from '../rehearsal/playerHistoryTargetPopulationGate.js';
export {
  ACCEPTED_IDENTITY_CONFIDENCES,
  FORBIDDEN_SOURCE_MARKERS,
  PLAYER_HISTORY_TARGET_POPULATION_GATE_VERSION,
  evaluatePlayerHistoryTargetPopulationGate,
} from '../rehearsal/playerHistoryTargetPopulationGate.js';
export type {
  PlayerHistoryMirrorOverlapEvidence,
  PlayerHistoryMirrorOverlapGateCheck,
  PlayerHistoryMirrorOverlapGateDecision,
  PlayerHistoryMirrorOverlapGateResult,
  PlayerHistoryMirrorOverlapGateStatus,
  PlayerHistoryShuffleGroupEvidence,
} from '../rehearsal/playerHistoryMirrorOverlapGate.js';
export {
  OVERLAP_MIN_JOINED_ROWS_OVERALL,
  OVERLAP_MIN_JOINED_ROWS_PER_POSITION,
  OVERLAP_MIN_JOINED_SHARE,
  OVERLAP_REQUIRED_POSITIONS,
  PLAYER_HISTORY_MIRROR_OVERLAP_GATE_VERSION,
  evaluatePlayerHistoryMirrorOverlapGate,
} from '../rehearsal/playerHistoryMirrorOverlapGate.js';
export type {
  ControlledRunArm,
  ControlledRunArmComparison,
  ControlledRunDecision,
  ControlledRunDecisionRationale,
  ControlledRunFeatureColumn,
  ControlledRunMetrics,
  ControlledRunPrediction,
  ControlledRunPriorGateEvidence,
  ControlledRunReport,
  ControlledRunRow,
} from '../rehearsal/playerHistoryControlledRun.js';
export {
  CONTROLLED_RUN_ARMS,
  CONTROLLED_RUN_DECISIONS,
  CONTROLLED_RUN_HISTORY_COLUMNS,
  CONTROLLED_RUN_RESULT_MARKING,
  CONTROLLED_RUN_RIDGE_LAMBDA,
  CONTROLLED_RUN_SHUFFLE_SEED,
  PLAYER_HISTORY_CONTROLLED_RUN_VERSION,
  assertControlledRunPreconditions,
  buildControlledRunRows,
  computeControlledRunMetrics,
  decideControlledRun,
  executeControlledRun,
  historyValuesFromFeatureRow,
  runControlledLoocv,
} from '../rehearsal/playerHistoryControlledRun.js';
export type { RobustnessChecksReport, RobustnessDecision, RobustnessArmView } from '../rehearsal/playerHistoryRobustnessChecks.js';
export {
  ABLATION_VARIANTS,
  PLAYER_HISTORY_ROBUSTNESS_CHECKS_VERSION,
  ROBUSTNESS_DECISIONS,
  ROBUSTNESS_LAMBDAS,
  ROBUSTNESS_SHUFFLE_SEEDS,
  ROBUSTNESS_TOP_K_EXCLUDED,
  ROBUSTNESS_WEAKENED_RELATIVE_MARGIN,
  ablationColumnsFor,
  runPlayerHistoryRobustnessChecks,
  runPriorYearPositionBaselineLoocv,
} from '../rehearsal/playerHistoryRobustnessChecks.js';
export type {
  PromotedArtifact,
  PromotedCoverageRecord,
  PromotedManifest,
  PromotedSourceGateCheck,
  PromotedSourceGateDecision,
  PromotedSourceGateExpectations,
  PromotedSourceGateInput,
  PromotedSourceGateResult,
  PromotedSourceRef,
} from '../rehearsal/playerHistoryPromotedSourceGate.js';
export {
  CANDIDATE_LINEAGE_DIMENSIONS,
  EXPECTED_APPROVED_SOURCE_PREFIXES,
  EXPECTED_PROMOTED_STATUS,
  EXPECTED_PROMOTION_DECISION,
  EXPECTED_PROMOTION_REVIEW,
  PINNED_PROMOTED_ARTIFACT_SHA256,
  PROMOTED_ARTIFACT_PATH,
  PROMOTED_MANIFEST_PATH,
  PROMOTED_SOURCE_GATE_DECISIONS,
  PROMOTED_SOURCE_GATE_EXPECTATIONS,
  PROMOTED_SOURCE_LEAKAGE_DISCIPLINE,
  PROMOTION_MERGE_COMMIT,
  REQUIRED_COMPATIBILITY_NOTE_PHRASES,
  REQUIRED_NOT_ALLOWED_ENTRIES,
  checkConsumerSafetyBoundary,
  checkLeakageDataBoundaries,
  checkManifestIdentity,
  checkPromotedArtifactIdentity,
  checkPromotedProvenance,
  evaluatePlayerHistoryPromotedSourceGate,
} from '../rehearsal/playerHistoryPromotedSourceGate.js';

export {
  PROJECTION_INPUT_COVERAGE_ARTIFACT_VERSION,
  PROJECTION_RUN_MANIFEST_ARTIFACT_VERSION,
  REPLACEMENT_BASELINES_ARTIFACT_VERSION,
  ROS_PLAYER_PROJECTION_ARTIFACT_VERSION,
  WEEKLY_PLAYER_PROJECTION_ARTIFACT_VERSION,
  validateProjectionInputCoverageArtifact,
  validateProjectionRunManifest,
  validateReplacementBaselinesArtifact,
  validateRosPlayerProjectionArtifactRow,
  validateWeeklyPlayerProjectionArtifactRow,
} from '../contracts/projectionArtifacts.js';

export { calculateExpectedPoints } from '../calculators/xfpg/calculateExpectedPoints.js';
export { calculateQbXfpg } from '../calculators/xfpg/calculateQbXfpg.js';
export { calculateRbXfpg } from '../calculators/xfpg/calculateRbXfpg.js';
export { calculatePassCatcherXfpg } from '../calculators/xfpg/calculatePassCatcherXfpg.js';
export { calculateReplacementBaselines } from '../calculators/replacement/calculateReplacementBaselines.js';
export { buildDefaultReplacementPoints } from '../calculators/replacement/buildDefaultReplacementPoints.js';
export { calculateVorp } from '../calculators/vorp/calculateVorp.js';
export { calculateRangeProfile } from '../calculators/range/calculateRangeProfile.js';
export { calculateStabilityScore } from '../calculators/range/calculateStabilityScore.js';

export { scoreWeeklyPlayerService } from '../services/scoring/scoreWeeklyPlayerService.js';
export { scoreWeeklyBatchService } from '../services/scoring/scoreWeeklyBatchService.js';
export { scoreWeeklyBatchWithOverlayService } from '../services/scoring/scoreWeeklyBatchWithOverlayService.js';
export { generateReplacementBaselinesService } from '../services/scoring/generateReplacementBaselinesService.js';
export { rankWeeklyScoringService } from '../services/scoring/rankWeeklyScoringService.js';
export { scoreRosService } from '../services/scoring/scoreRosService.js';
export {
  buildWeeklyPlayerCardService,
  buildWeeklyRankingsViewService,
  buildRosPlayerCardService,
  buildWeeklyCompareViewService,
} from '../services/scoring/buildTiberViewsService.js';

export { buildScenarios } from '../services/buildScenariosService.js';
export { buildHistoricalDatasetService } from '../services/buildHistoricalDatasetService.js';
export { buildFeatureBatchService } from '../services/buildFeatureBatchService.js';
export { buildFeatureRowService } from '../services/buildFeatureRowService.js';
export { ingestRawEvents } from '../services/ingestRawEventsService.js';
export { projectBatch } from '../services/projectBatchService.js';
export { projectFromRawEvents } from '../services/projectFromRawEventsService.js';
export { projectScenario } from '../services/projectScenarioService.js';
export { runBacktestService } from '../services/runBacktestService.js';
export { trainBaselineModelService } from '../services/trainBaselineModelService.js';
export { predictBaselineModelService } from '../services/predictBaselineModelService.js';
export { predictWithIntervalsService } from '../services/predictWithIntervalsService.js';
export { runFusedProjectionService } from '../services/runFusedProjectionService.js';
export { runFusedBatchService } from '../services/runFusedBatchService.js';
export { evaluateCalibrationService } from '../services/evaluateCalibrationService.js';
export { evaluateSubgroupStabilityService } from '../services/evaluateSubgroupStabilityService.js';
export { runProjectionDiagnosticsService } from '../services/runProjectionDiagnosticsService.js';
export { compareProjectionToConsensusService } from '../services/compareProjectionToConsensusService.js';
export { scoreMarketEdgesService } from '../services/scoreMarketEdgesService.js';
export { scoreRegressionCandidatesService, scoreRegressionCandidates, buildProjectionDiagnostic } from '../services/scoreRegressionCandidatesService.js';
export { runModelBacktestService } from '../services/runModelBacktestService.js';

// Seasonal PPR backtest (Issue #49): 2024 inputs -> 2025 PPR, actuals from TIBER-Data.
export {
  SEASONAL_PPR_BACKTEST_MODEL_VERSION,
  SEASONAL_PPR_BACKTEST_REPORT_VERSION,
  SEASONAL_PPR_PREDICTION_ARTIFACT_VERSION,
  SEASONAL_PPR_EXPLANATION_ARTIFACT_VERSION,
  SEASONAL_PPR_EXPLANATION_WARNING,
  SEASONAL_PPR_INPUT_SEASON,
  SEASONAL_PPR_TARGET_SEASON,
  SEASONAL_PPR_TARGET_DEFINITION,
  SEASONAL_PPR_OUTPUT_KIND,
} from '../contracts/seasonalPprBacktest.js';
export type {
  SeasonalPlayerObservation,
  SeasonalPprDatasetDescriptor,
  SeasonalPprDatasetGovernanceStatus,
  SeasonalPprRowGovernanceStatus,
  SeasonalPprFeatureCoverageStatus,
  SeasonalPprFeatureSpec,
  SeasonalPprPredictionRow,
  SeasonalPprExplanationStatus,
  SeasonalPprFeatureContribution,
  SeasonalPprPredictionExplanation,
  SeasonalPprErrorSummary,
  SeasonalPprModelEvaluation,
  SeasonalPprMiss,
  SeasonalPprBacktestReport,
} from '../contracts/seasonalPprBacktest.js';
export { tiberDataSeasonalPprDataset } from '../datasets/seasonal/tiberDataSeasonalPprDataset.js';
export {
  TIBER_DATA_WEEKLY_PPR_ARTIFACT_VERSION,
  TIBER_DATA_WEEKLY_USAGE_ARTIFACT_VERSION,
  TIBER_DATA_ARTIFACT_PATHS,
  tiberDataWeeklyScoringPositions,
  computePprPoints,
  nullableToZero,
} from '../contracts/tiberDataWeeklyOutcomes.js';
export type {
  TiberDataWeeklyPprRow,
  TiberDataWeeklyUsageRow,
} from '../contracts/tiberDataWeeklyOutcomes.js';
export { loadSeasonalPprDatasetFromWeeklyOutcomes } from '../datasets/seasonal/loadSeasonalPprDataset.js';
export type {
  LoadSeasonalPprDatasetOptions,
  SeasonalDatasetGovernanceMarker,
} from '../datasets/seasonal/loadSeasonalPprDataset.js';
export { parseTiberDataWeeklyPprArtifact } from '../datasets/seasonal/parseTiberDataWeeklyArtifact.js';
export { buildScaffoldWeeklyPprRows, tiberDataWeeklyPprScaffoldRows } from '../datasets/seasonal/fixtures/tiberDataWeeklyPprScaffold.js';
export { seasonalPprSeedSnapshot } from '../datasets/seasonal/fixtures/seasonalPprSeedSnapshot.js';
export { trainSeasonalRidgeModel, seasonalPprFeatureList } from '../models/seasonal/seasonalPprModel.js';
export type {
  SeasonalRidgeModel,
  SeasonalRidgeContribution,
  SeasonalRidgeExplanation,
} from '../models/seasonal/seasonalPprModel.js';
export { baselinePrevYearPpr, baselinePositionMean } from '../models/seasonal/seasonalPprBaselines.js';
export {
  summarizeSeasonalErrors,
  summarizeSeasonalErrorsByPosition,
} from '../datasets/seasonal/evaluateSeasonalPpr.js';
export { runSeasonalPprBacktestService } from '../services/runSeasonalPprBacktestService.js';
export type {
  RunSeasonalPprBacktestOptions,
  RunSeasonalPprBacktestOutput,
  RunSeasonalPprBacktestResult,
} from '../services/runSeasonalPprBacktestService.js';
export {
  writeSeasonalPprBacktestArtifacts,
  SEASONAL_PPR_REPORT_FILENAME,
  SEASONAL_PPR_PREDICTIONS_FILENAME,
  SEASONAL_PPR_EXPLANATIONS_FILENAME,
} from '../artifacts/writeSeasonalPprBacktestArtifacts.js';
export type {
  WriteSeasonalPprBacktestArtifactsInput,
  WriteSeasonalPprBacktestArtifactsOutput,
  WrittenSeasonalPprArtifact,
} from '../artifacts/writeSeasonalPprBacktestArtifacts.js';
export type {
  BuildFeatureBatchOutput,
  BuildHistoricalDatasetOutput,
  BuildHistoricalDatasetResult,
  BuildFeatureBatchResult,
  BuildFeatureRowOutput,
  BuildFeatureRowResult,
  BuildScenariosOutput,
  BuildScenariosResult,
  IngestRawEventsOutput,
  IngestRawEventsResult,
  ProjectBatchOutput,
  ProjectBatchResult,
  ProjectFromRawEventsOutput,
  ProjectFromRawEventsResult,
  ProjectScenarioOutput,
  ProjectScenarioResult,
  RunBacktestOutput,
  RunBacktestResult,
  TrainBaselineModelOutput,
  TrainBaselineModelResult,
  PredictBaselineModelOutput,
  PredictBaselineModelResult,
  RunModelBacktestOutput,
  RunModelBacktestResult,
  EvaluateCalibrationOutput,
  EvaluateCalibrationResult,
  EvaluateSubgroupStabilityOutput,
  EvaluateSubgroupStabilityResult,
  RunProjectionDiagnosticsEnvelope,
  RunProjectionDiagnosticsResult,
  ScoreRegressionCandidatesEnvelope,
  ScoreRegressionCandidatesResult,
  RunFusedProjectionOutput,
  RunFusedProjectionResult,
  RunFusedBatchOutput,
  RunFusedBatchResult,
  CompareProjectionToConsensusEnvelope,
  CompareProjectionToConsensusResult,
  ScoreMarketEdgesEnvelope,
  ScoreMarketEdgesResult,
  BuildDecisionBoardOutput,
  BuildDecisionBoardResult,
  RankDecisionBoardOutput,
  RankDecisionBoardResult,
  ServiceError,
  ServiceResult,
  ServiceWarning,
} from '../services/types.js';
export type { RawEvent } from '../ingestion/types/rawEvent.js';
export type { NormalizedEvent } from '../ingestion/types/normalizedEvent.js';
export { runScenario } from '../models/scenarios/runScenario.js';
export type { ScenarioRunResult } from '../models/scenarios/runScenario.js';
export type { ProjectionScenario } from '../types/scenario.js';

export { buildFeatureRow } from '../features/builders/buildFeatureRow.js';
export { validateFeatureRow, FeatureRowValidationError } from '../features/validation/validateFeatureRow.js';
export { wrTeFeatureSchema } from '../features/schema/wrTeFeatureSchema.js';
export { sampleFeatureInputs } from '../features/examples/sampleFeatureInputs.js';
export { sampleFeatureRows } from '../features/examples/sampleFeatureRows.js';
export type { WrTeFeatureRow } from '../features/types/featureRow.js';
export type { WrTeFeatureSourceInput, FeatureWindowSummary } from '../features/types/sourceTypes.js';

export { buildLabeledRow } from '../datasets/builders/buildLabeledRow.js';
export { buildHistoricalDataset } from '../datasets/builders/buildHistoricalDataset.js';
export { timeSeriesSplit } from '../datasets/splits/timeSeriesSplit.js';
export { rollingBacktestWindows } from '../datasets/splits/rollingBacktestWindows.js';
export { baselineMeanModel } from '../datasets/benchmarks/baselineMeanModel.js';
export { baselineRecentTrendModel } from '../datasets/benchmarks/baselineRecentTrendModel.js';
export { baselineUsageModel } from '../datasets/benchmarks/baselineUsageModel.js';
export { evaluatePredictions } from '../datasets/evaluation/evaluatePredictions.js';
export { aggregateMetrics } from '../datasets/evaluation/aggregateMetrics.js';
export { generateBacktestReport } from '../datasets/evaluation/generateBacktestReport.js';
export { historicalSampleInputs } from '../datasets/examples/historicalSampleInputs.js';
export { historicalSampleDataset } from '../datasets/examples/historicalSampleDataset.js';
export type { HistoricalLabeledRowInput, HistoricalRowMetadata, WeeklyPprTarget, WrTeLabeledRow } from '../datasets/types/labeledRow.js';
export type { BacktestReport, BacktestModelReport, EvaluationMetrics, GroupedMetrics, PredictionRecord, WindowEvaluation } from '../datasets/types/metrics.js';
export type { RollingBacktestConfig, RollingBacktestWindow, SeasonWeek, SplitTimeWindow, TimeSeriesSplitConfig, TimeSeriesSplitResult } from '../datasets/types/split.js';

export { prepareTrainingMatrix, vectorizeWrTeFeatureRow } from '../models_ml/training/prepareTrainingMatrix.js';
export { trainWrTeBaselineModel } from '../models_ml/training/trainWrTeBaselineModel.js';
export { loadModelArtifact } from '../models_ml/inference/loadModelArtifact.js';
export { predictWrTeBaselineModel, predictWrTeBaselineModelValue } from '../models_ml/inference/predictWrTeBaselineModel.js';
export { bucketPredictionContext } from '../models_ml/uncertainty/bucketPredictionContext.js';
export { estimateResidualBands } from '../models_ml/uncertainty/estimateResidualBands.js';
export { assignPredictionInterval } from '../models_ml/uncertainty/assignPredictionInterval.js';
export { buildCalibrationTable } from '../models_ml/calibration/buildCalibrationTable.js';
export { buildReliabilityReport } from '../models_ml/calibration/buildReliabilityReport.js';
export { evaluateCalibration } from '../models_ml/calibration/evaluateCalibration.js';
export { subgroupDefinitions } from '../models_ml/subgroup/subgroupDefinitions.js';
export { evaluateSubgroupStability } from '../models_ml/subgroup/evaluateSubgroupStability.js';
export { evaluateModelAgainstBenchmarks } from '../models_ml/evaluation/evaluateModelAgainstBenchmarks.js';
export { buildPredictionComparison } from '../models_ml/evaluation/buildPredictionComparison.js';
export type { WrTeBaselineModelConfig } from '../models_ml/types/modelConfig.js';
export { defaultWrTeBaselineModelConfig } from '../models_ml/types/modelConfig.js';
export type { WrTeBaselineModelArtifact, ModelSchema, ModelFeatureSpec, FeatureImportanceEntry } from '../models_ml/types/modelArtifact.js';
export type { WrTeBaselinePrediction, ModelPredictionSet, PredictionComparisonRow } from '../models_ml/types/prediction.js';
export type {
  PredictionContextBucket,
  ResidualBucketDefinition,
  WrTeBaselineUncertaintyArtifact,
  IntervalPrediction,
  CalibrationBucketRow,
  CalibrationReport,
  SubgroupFamilyDefinition,
  SubgroupStabilityRow,
  SubgroupStabilityReport,
} from '../models_ml/types/uncertainty.js';

export { compareToConsensus, deriveEdgeDirection } from '../market/scoring/compareToConsensus.js';
export { scoreRawEdge, scoreRawEdgeFromComparison } from '../market/scoring/scoreRawEdge.js';
export { scoreTrustAdjustedEdge } from '../market/scoring/scoreTrustAdjustedEdge.js';
export { buildEdgeFlags } from '../market/flags/buildEdgeFlags.js';
export { buildEdgeExplanation } from '../market/flags/buildEdgeExplanation.js';
export { sampleConsensusComparison } from '../market/examples/sampleConsensusComparison.js';
export type { ConsensusInput } from '../market/types/consensusInput.js';
export type {
  EdgeDirection,
  MarketEdgeFlag,
  MarketProjectionInput,
  MarketEdgeScoringContext,
  MarketComparisonOutput,
  TrustAdjustmentBreakdown,
  MarketEdgeOutput,
  CompareProjectionToConsensusOutput,
  ScoreMarketEdgesOutput,
} from '../market/types/edgeOutput.js';

export { scoreUsageProductionGap } from '../diagnostics/scoring/scoreUsageProductionGap.js';
export { scoreEfficiencyFragility } from '../diagnostics/scoring/scoreEfficiencyFragility.js';
export { scoreTdRegressionRisk } from '../diagnostics/scoring/scoreTdRegressionRisk.js';
export { scoreVolumeStability } from '../diagnostics/scoring/scoreVolumeStability.js';
export { scoreProjectionStickiness } from '../diagnostics/scoring/scoreProjectionStickiness.js';
export { combineRegressionScores } from '../diagnostics/scoring/combineRegressionScores.js';
export { buildDiagnosticFlags } from '../diagnostics/explain/buildDiagnosticFlags.js';
export { buildRegressionExplanation } from '../diagnostics/explain/buildRegressionExplanation.js';
export type {
  ProjectionDiagnosticInput,
  RegressionDiagnosticFlag,
  UsageProductionGapScore,
  EfficiencyFragilityScore,
  TdRegressionRiskScore,
  VolumeStabilityScore,
  ProjectionStickinessScore,
  RegressionComponentScores,
  CombinedRegressionScores,
} from '../diagnostics/types/regressionSignal.js';
export type {
  ProjectionDiagnosticOutput,
  ProjectionDiagnosticsSummary,
  RunProjectionDiagnosticsOutput,
  ScoreRegressionCandidatesOutput,
} from '../diagnostics/types/diagnosticOutput.js';

export { fuseScenarioWithModel } from '../fusion/core/fuseScenarioWithModel.js';
export { recomputeIntervalsAfterFusion } from '../fusion/core/recomputeIntervalsAfterFusion.js';
export { recomputeDiagnosticsAfterFusion } from '../fusion/core/recomputeDiagnosticsAfterFusion.js';
export { applyAdditiveDelta } from '../fusion/policies/applyAdditiveDelta.js';
export { applyWeightedFusion } from '../fusion/policies/applyWeightedFusion.js';
export { applyBoundedFusion } from '../fusion/policies/applyBoundedFusion.js';
export { sampleFusionRun } from '../fusion/examples/sampleFusionRun.js';
export { scoreCompositeSignal } from '../board/scoring/scoreCompositeSignal.js';
export { scoreTrustworthiness } from '../board/scoring/scoreTrustworthiness.js';
export { scoreActionability, assignActionTier } from '../board/scoring/scoreActionability.js';
export { buildDecisionTags } from '../board/flags/buildDecisionTags.js';
export { buildDecisionReasons } from '../board/flags/buildDecisionReasons.js';
export { sortDecisionBoard } from '../board/ranking/sortDecisionBoard.js';
export { filterDecisionBoard } from '../board/ranking/filterDecisionBoard.js';
export { rankDecisionBoard } from '../board/ranking/rankDecisionBoard.js';
export { sampleDecisionBoardRun } from '../board/examples/sampleDecisionBoardRun.js';
export { buildDecisionBoardService } from '../services/buildDecisionBoardService.js';
export { rankDecisionBoardService } from '../services/rankDecisionBoardService.js';
export type { FusionPolicyName, FusionConfig, FusionPolicyInput, FusionPolicyResult } from '../fusion/types/fusionConfig.js';
export { defaultFusionConfig } from '../fusion/types/fusionConfig.js';
export type { FusedProjection, FusionConfidence, FusedProjectionDiagnostics } from '../fusion/types/fusedProjection.js';

export type { ActionTier } from '../board/types/actionTier.js';
export type { DecisionBoardRow, DecisionBoardInputs, DecisionDirection, DecisionTag } from '../board/types/decisionBoardRow.js';
export type { RankedDecisionBoardRow, RankDecisionBoardOptions } from '../board/ranking/rankDecisionBoard.js';
export type { FilterDecisionBoardOptions } from '../board/ranking/filterDecisionBoard.js';

// Candidate-stage seasonal forward runtime. These exports provide library
// capabilities only; no command, route, configuration, or live-data loader is
// registered by this module.
export * from '../serialization/canonicalForwardArtifacts.js';
export * from '../contracts/genericFullPprProfile.js';
export * from '../contracts/forwardSeasonalPpr.js';
export * from '../models/seasonal/forwardRidgeModel.js';
export * from '../services/runForwardCandidateService.js';
export * from '../validation/validateForwardCandidate.js';
export * from '../artifacts/writeForwardCandidateArtifacts.js';
