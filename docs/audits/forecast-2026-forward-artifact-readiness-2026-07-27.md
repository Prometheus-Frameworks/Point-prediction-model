# TIBER-Forecast 2026 forward-artifact readiness audit

> **Audit date:** 2026-07-27
> **Issue:** [#165](https://github.com/Prometheus-Frameworks/TIBER-Forecast/issues/165)
> **Execution authority:** [issue comment 5086080536](https://github.com/Prometheus-Frameworks/TIBER-Forecast/issues/165#issuecomment-5086080536)
> **Forecast base:** `49208472539bd11789b88ca8b3eb20c56a7d0db5` (`main`)
> **Evidence snapshot:** `2026-07-27T00:18:47Z`
> **Scope:** audit and proposal only; no 2026 forecast was run or emitted

## Executive finding

Current `main` cannot produce an honest forward-looking 2026 seasonal artifact.
The implemented seasonal entrypoint is a fixed 2024-input-to-known-2025-outcome
LOOCV backtest. It uses the target actual both to decide whether a row can be
scored and to fit every fold. A player with no target actual is emitted with a
null prediction, and a population with fewer than four actual-bearing rows fails
before artifact emission. There is no final-model fit, future-population inference
stage, forward manifest writer, or forward artifact validator.

This is a prerequisite result, not an irrecoverable block. The repository has a
clear historical baseline, an accepted but opt-in player-history capability, and
strong fail-closed patterns that can support a separately authorized forward-path
implementation. That work must first establish governed cutoff-bound inputs,
separate evaluation from final fitting and inference, preserve every target player
with explicit row status, define an exact scoring contract, and add defensible
uncertainty.

Repository evidence supports exactly two numbered seasonal runs. Later
player-history and rookie work are capability/experiment lanes, not Run 3 or Run
4. The first real future-season execution should be named
`seasonal-ppr-2026-forward-001` (display name: **2026 Forward Run 1**) and should
carry its historical ancestry in manifest fields rather than an ambiguous ordinal.

## 1. Audit boundary and pinned evidence

This audit inspected Forecast code, tests, committed artifacts, Git history,
issues, and pull requests. It also performed read-only inspection of the relevant
TIBER repositories at these `main` commits:

| Repository | Pinned `main` commit | Audit use |
| --- | --- | --- |
| TIBER-Forecast | `49208472539bd11789b88ca8b3eb20c56a7d0db5` | Executable path, artifacts, experiments, contracts |
| TIBER-Data | `31c0c8e751816d262cf79ffef1a4ae9b6c9b70d5` | Identity, roster, outcomes, usage/history ownership |
| TIBER-Teamstate | `61485d1309484bad300378ef5d9aaa67365d3d62` | Team environment/tendency ownership |
| Role-and-Opportunity-Model | `6435d8d3c2c4e53dc45ab57a05a2716e2b47598d` | Role/opportunity ownership |
| TIBER-Rookies | `a825431402f89f7ec4fe69e72de073ca4b301ea3` | Rookie transition ownership |
| TIBER-Fantasy | `85c5a7061e552b84a0eb86d4fca6ff7aa7e4730d` | Proposed consumer boundary only |
| TIBER-Strategy | `ffa7fba7b78c51931735a9d09a251aa00b499049` | Interpretation boundary only |
| Age-curve-intelligence-model | `998b28644be7d36efb235ce1df62113dd8f0350c` | Age-context availability/admission boundary |
| Fpts-SOT | `e7facfd7556b9b276b6af067b230b069af1efaa0` | Negative check for a canonical scoring-profile contract |

The snapshot timestamp is an audit observation time, not a claim that every
artifact was current at that time. A file existing at a pinned commit is
**availability evidence only**. It is not automatically governed, cutoff-admissible,
or admitted to a model.

## 2. Canonical seasonal run ledger

### 2.1 Numbered runs

| Canonical run | Objective / cutoff | Inputs and configuration | Output and terminal finding | Current state |
| --- | --- | --- | --- | --- |
| **Run 1** | Retrospective 2024 inputs to known 2025 full-season PPR. No exact forecast-cutoff timestamp was recorded. | Ridge, `lambda=1`; 2024 PPR, PPR/game, games, targets, rush attempts, and position; train-fold standardization; player-level LOOCV; nonnegative clamp. | Committed scaffold: 39 observations, 38 scored; MAE `35.1477`, RMSE `43.6404`, Pearson `0.7286`, Spearman `0.7057`; beat the best fixture baseline by `6.59` PPR. | **Accepted historical baseline/harness.** The committed output is fixture evidence, not a production-quality population or future forecast. |
| **Run 2 — initial Teamstate comparison** | Same 2024-to-2025 target; recorded Teamstate as-of cutoff `2025-03-01T00:00:00Z`. | Three arms: Run 1 baseline, real Teamstate, and deterministic derangement of Teamstate value groups across matched teams while player identity/position stayed fixed; same ridge/LOOCV; added EPA/play, success rate, red-zone TD rate; train-fold mean imputation. | Only 8/39 players matched; about 82% of Teamstate feature cells were imputed. Baseline MAE `35.1477`; real `38.5329`; shuffled `38.5035`. | **Failed sanity control; parked pending coverage.** |
| **Run 2 — full-coverage rerun** | Same experiment and target; the source binding changed to the governed 32-team artifact. | Population, folds, lambda, feature set, null handling, and arms unchanged; 39/39 matched and no imputation. | Baseline MAE `35.1477`; real `36.4087`; shuffled `34.3619`. Real still lost to baseline and to shuffled. | **Failed sanity control again. Teamstate features are not admitted.** This is a Run 2 rerun, not Run 3. |

Primary Run 1 evidence:

- [`docs/run1-path-audit-for-run2.md`](../run1-path-audit-for-run2.md)
- [`docs/seasonal-ppr-backtest.md`](../seasonal-ppr-backtest.md)
- [`data/backtests/seasonal-ppr/seasonal_ppr_backtest_report.json`](../../data/backtests/seasonal-ppr/seasonal_ppr_backtest_report.json)
- [PR #50](https://github.com/Prometheus-Frameworks/TIBER-Forecast/pull/50), merge
  `78f5703c4d111e790c88a43e2bd29487ef833f88`
- [PR #56](https://github.com/Prometheus-Frameworks/TIBER-Forecast/pull/56), which
  added explicit fixture/mounted-source fail-closed behavior

Primary Run 2 evidence:

- [`docs/run2-tts-feature-contract.md`](../run2-tts-feature-contract.md)
- [`docs/reports/run2-teamstate-comparison-outcome-2026-06-29.md`](../reports/run2-teamstate-comparison-outcome-2026-06-29.md)
- [`docs/audits/run2-failed-sanity-control-audit-2026-06-29.md`](run2-failed-sanity-control-audit-2026-06-29.md)
- [`docs/reports/run2-teamstate-comparison-rerun-full-coverage-2026-06-29.md`](../reports/run2-teamstate-comparison-rerun-full-coverage-2026-06-29.md)
- [PR #87](https://github.com/Prometheus-Frameworks/TIBER-Forecast/pull/87),
  [PR #89](https://github.com/Prometheus-Frameworks/TIBER-Forecast/pull/89),
  and [PR #97](https://github.com/Prometheus-Frameworks/TIBER-Forecast/pull/97)

### 2.2 Later experiments and capability work

| Lane | Historical design and result | What it established | What it did not establish | State |
| --- | --- | --- | --- | --- |
| First player-history candidate | 2022–2024 inputs to 2025 target; 610 folds, 485 joined players. No uniform exact forecast cutoff was recorded. Joined MAE: baseline `68.9264`, real 26-column/five-family history `40.0342`, shuffled `72.0308`. | Strong candidate signal on the 2025 target. | Production binding, forward inference, or a new numbered run. | `candidate_player_history_signal_observed_requires_followup` |
| Player-history robustness | Same 2025 origin/cutoff uncertainty; family ablations, lambda sweep, five shuffles, outlier trimming. Production-only MAE `40.173`; full set `40.034`; shuffled range `69.12–72.30`. | Production-only family retained most measured signal and survived initial controls. | Independent-season validation of the final production-only composition. | `candidate_signal_survives_initial_robustness_checks` |
| Promoted-source rerun | Same 2022–2024-to-2025 design/population and cutoff uncertainty against promoted source identity; metrics reproduced. | Governance/source replication. | A statistically independent result; it reuses the same empirical season. | `promoted_player_history_signal_replicated_requires_followup` |
| Disjoint-season validation | 2021–2023 inputs to 2024 target; 588 folds, 470 joined; no uniform exact cutoff was recorded. Joined MAE: baseline `71.9083`, real full set `44.8178`, shuffled `73.4570`. | A second temporal origin supported the broader history signal. | A re-ablation of the final production-only subset on that origin. | `may_open_player_history_2024_from_2021_2023_threshold_review_issue` |
| Threshold review | Compared both temporal origins against the proposed quantitative threshold; carried forward the 0.35% production-only/full-set gap rather than independently re-evaluating it on the second origin. | Five of six components passed both origins; full-set added-value bar did not clear, retaining production-only as v0. | Binding, leakage audit, or product readiness. | `may_open_player_history_production_binding_review_issue`; [PR #140](https://github.com/Prometheus-Frameworks/TIBER-Forecast/pull/140) |
| `player_history_production_only_v0` binding and activation checks | Seven trailing production columns added behind an explicit enabled gate and exact source SHA match; default behavior remained inert. | An accepted, fail-closed implementation capability. | Dynamic 2026 season binding, a forward final fit, or a governed 2026 artifact. | Implementation: `player_history_production_binding_implemented_pending_human_signoff`; later verification: `player_history_production_binding_activation_verified`. These are capability transitions, not runs. |
| Rookie transition lane | 2026 mirror, rehearsal, identity crosswalk, availability-evidence audit, and schema-v2 proposal. | Defined strict identity/cutoff/provenance prerequisites. | A fully eligible/admitted rookie input or rookie forecast model. | **Parked / prerequisite work.** |

The controlled, promoted-source, and disjoint player-history runs used the same
three-arm frame: train-fold position-mean baseline; ridge with `lambda=1`,
unpenalized intercept, position dummies, `has_history`, and the five history
families; train-fold-only imputation and z-scoring; and pre-outcome within-position
donor derangement. The 2025-origin candidate/promoted rerun used seed `20260702`;
the 2024-origin validation used `20260707`. The robustness suite tested lambda
`0.1`, `1`, `10`, and `100`, plus shuffle seeds `20260702` through `20260706`.

Player-history evidence:

- [`docs/reports/player-history-controlled-run-2026-07-02.md`](../reports/player-history-controlled-run-2026-07-02.md)
- [`docs/reports/player-history-robustness-checks-2026-07-03.md`](../reports/player-history-robustness-checks-2026-07-03.md)
- [`docs/reports/player-history-promoted-controlled-rerun-2026-07-04.md`](../reports/player-history-promoted-controlled-rerun-2026-07-04.md)
- [`docs/reports/player-history-2024-from-2021-2023-additional-validation-2026-07-07.md`](../reports/player-history-2024-from-2021-2023-additional-validation-2026-07-07.md)
- [`docs/capabilities/player-history-production-only-v0.md`](../capabilities/player-history-production-only-v0.md)
- [PR #112](https://github.com/Prometheus-Frameworks/TIBER-Forecast/pull/112),
  [PR #116](https://github.com/Prometheus-Frameworks/TIBER-Forecast/pull/116),
  [PR #122](https://github.com/Prometheus-Frameworks/TIBER-Forecast/pull/122),
  [PR #138](https://github.com/Prometheus-Frameworks/TIBER-Forecast/pull/138),
  [PR #144](https://github.com/Prometheus-Frameworks/TIBER-Forecast/pull/144),
  and [PR #146](https://github.com/Prometheus-Frameworks/TIBER-Forecast/pull/146)

The player-history design and issue [#101](https://github.com/Prometheus-Frameworks/TIBER-Forecast/issues/101)
explicitly guard against creating Run 3. Repository-wide history contains no
affirmative Run 3 or Run 4. Numbering future work as Run 3 would falsely imply an
unbroken ordinal sequence from a retrospective Teamstate experiment to a
future-season production path.

### 2.3 Historical uncertainties

1. Run 1 records seasons and generation time but not an exact forecast cutoff.
   Run 2's cutoff cannot be assigned retroactively.
2. Run 2's Teamstate source was generated after the target season while carrying
   a recorded 2025-03-01 as-of date. It is retrospective experimental evidence,
   not proof of a contemporaneous forward artifact.
3. The promoted-source player-history rerun changes provenance, not the empirical
   sample, so it is not independent validation.
4. The disjoint 2024 validation used the full five-family set; the final
   production-only choice was not independently re-ablated there.
5. Historical reports lack one uniform manifest with run ID, cutoff, code SHA,
   source hashes, configuration identity, and lineage. This contributes to naming
   ambiguity.

## 3. Current capability and admission inventory

| Capability | Implemented? | Evidence / guard | Model-admission state | 2026-forward implication |
| --- | --- | --- | --- | --- |
| `seasonal-ppr-ridge-v1` historical model | Yes | [`src/models/seasonal/seasonalPprModel.ts`](../../src/models/seasonal/seasonalPprModel.ts) | Accepted historical baseline | Model math is deterministic, but its contracts and target fields are fixed to 2024→2025. |
| Five base production features + position | Yes | Same model; [`src/contracts/seasonalPprBacktest.ts`](../../src/contracts/seasonalPprBacktest.ts) | Accepted historical baseline | A future version needs dynamic, cutoff-bound season fields. |
| Player-history production-only block | Yes | Exact opt-in/source-SHA gate in the seasonal contract and model | Accepted capability, default inert | Must be rebound to an approved 2026 input window and source; availability alone does not activate it. |
| Full five-family / 26-column history set | Experimental scripts/reports | Controlled and robustness reports | Not admitted | Must not enter a forward run. |
| Teamstate Run 2 features | Comparison infrastructure exists | Two real-vs-shuffled comparisons | Parked/not admitted after repeated sanity-control failure | Must not enter a forward run merely because an upstream artifact exists. |
| Rookie transition context | Mirrors and audit scaffolds exist | Rookie design, crosswalk, availability artifacts | Parked / unresolved | No current rookie inference path; rows must remain visible and unavailable. |
| Seasonal final-model fitting | No | No production service stage after LOOCV | Missing | Required before future inference. |
| Seasonal future-population inference | No | Current service conditions scoring on actual target presence | Missing | Direct blocker to a bounded run. |
| Seasonal uncertainty | No | Current seasonal row is a point or null | Missing | No floor/median/ceiling/confidence may be fabricated. |
| Seasonal run manifest writer/validator | No | [`docs/run-manifest-spec.md`](../run-manifest-spec.md) is a reporting spec; writer emits report and two JSONL files only | Proposed, not implemented | Required for a governable artifact. |
| Weekly/ROS range and VORP contracts | Yes, separate lane | [`src/contracts/projectionArtifacts.ts`](../../src/contracts/projectionArtifacts.ts) | In-season projection/scoring lane | Must not be copied into seasonal output as if calibrated there. |
| IDP seasonal model | No | Seasonal positions are only QB/RB/WR/TE | Unsupported | Must fail closed with `unsupported_position_domain`. |

## 4. Historical evaluation versus forward inference

### 4.1 Current executable path

| Required stage | Current implementation | Finding |
| --- | --- | --- |
| Historical input loading | Weekly rows aggregate to one observation for each player with an input-season row. Input season defaults to 2024; target defaults to 2025. | The loader can accept option seasons while shaping data, but the observation/output fields and default dataset ID remain hardcoded for 2024/2025; it does not enforce input season before target season. Players without input-season history are skipped. |
| Historical target construction | The final cumulative `season_ppr`, or otherwise the sum of weekly PPR, supplies `ppr_2025_actual`. | Suitable only when the historical target is known and provenance is governed. |
| Historical evaluation | The service retains actual-bearing rows and fits one ridge model per held-out player (LOOCV). | Evaluation avoids putting the held-out player's target in its own training fold, but is only a single-season-pair cross-section in Run 1. |
| Model/hyperparameter selection | Ridge defaults to `lambda=1`; historical experiment scripts test alternatives. | Current production service accepts an arbitrary lambda override but does not bind a reviewed selection protocol/model-config hash. |
| Final-model fitting | None. | No model is fit once on the accepted historical training population for later use. |
| Future-season inference | None. | No service accepts a separate future population whose actuals are null. |
| Artifact emission | Backtest writer emits report, predictions JSONL, and explanations JSONL. | No forward manifest envelope, content hashes, row-status contract, or freshness state. |
| Later grading | Historical metrics exist for the backtest. | No contract freezes a 2026 forecast and later joins completed 2026 actuals without mutating the original artifact. |

### 4.2 Proof that a missing 2026 actual blocks the current path

The block is structural:

1. `SeasonalPlayerObservation` has a fixed `ppr_2025_actual` target and the
   constants declare input season 2024 and target season 2025.
2. `hasUsableActual` selects only rows with a finite target actual.
3. The service fails with `SEASONAL_PPR_INSUFFICIENT_ROWS` when fewer than four
   rows have usable actuals.
4. Every LOOCV training set uses actual-bearing rows; the ridge target vector is
   `ppr_2025_actual`.
5. A row without an actual receives `predicted_ppr: null`,
   `governance_status: "unavailable"`, and no explanation.
6. The writer is invoked only after this backtest service succeeds.

Therefore an honest 2026 population—where every 2026 actual is necessarily
null—produces no current forward inference. This is the correct behavior for the
existing backtest contract, but it proves that the npm alias
`forecast:seasonal-ppr` is only an alias to the backtest script; its name is not
evidence of a forward runner.

A direct model caller is not a safe workaround. `trainSeasonalRidgeModel` casts
every row's `ppr_2025_actual` into the target vector without a runtime
finite/non-null assertion. In JavaScript arithmetic, a null target can therefore
behave as zero if a future caller bypasses the service filter. The future training
type and runtime validator must reject missing/non-finite targets, while the
separate inference type must not expose an actual target at all.

An audit-only temporary probe (deleted after execution) confirmed all three
behaviors on current code:

- eight 2025-input/2026-target observations with absent target rows all carried
  null actuals, and the service failed with zero usable / eight unavailable;
- adding one unlabeled future row to an otherwise labeled historical population
  let the backtest succeed, but that future row still received a null prediction;
- a directly fitted model's `predict` result did not depend on the inference
  row's actual field, demonstrating that the estimator can support inference once
  it is exposed through a safe, separate service.

Direct evidence:

- [`src/contracts/seasonalPprBacktest.ts`](../../src/contracts/seasonalPprBacktest.ts)
- [`src/datasets/seasonal/loadSeasonalPprDataset.ts`](../../src/datasets/seasonal/loadSeasonalPprDataset.ts)
- [`src/services/runSeasonalPprBacktestService.ts`](../../src/services/runSeasonalPprBacktestService.ts)
- [`src/models/seasonal/seasonalPprModel.ts`](../../src/models/seasonal/seasonalPprModel.ts)
- [`src/artifacts/writeSeasonalPprBacktestArtifacts.ts`](../../src/artifacts/writeSeasonalPprBacktestArtifacts.ts)
- [`tests/seasonalPprBacktest.test.ts`](../../tests/seasonalPprBacktest.test.ts)

### 4.3 Required future separation

A future implementation should use independent, typed inputs:

```text
historical origins valid at their origin cutoffs
  -> frozen model-selection protocol
  -> out-of-time evaluation and sanity controls
  -> approved model/configuration identity
  -> final fit on only approved historical rows

cutoff-bound 2026 population/features (no 2026 actual field)
  -> future inference
  -> row-complete status assignment
  -> manifest + player rows with embedded drivers
  -> immutable review/promotion candidate

completed 2026 outcomes, later
  -> separate grading artifact that references the immutable forecast
```

The final-fit API must not accept a target-season future row as a training row.
The inference row type should not contain `actual_ppr`. The emitted player row may
carry `actual_outcome: null` only as an explicit reporting field. Feature
standardization, imputation, coefficient fitting, hyperparameter selection, and
any uncertainty calibration must be learned only from historical training folds
or from the approved final-fit historical set.

### 4.4 Proposed leakage proof obligations

The proposed path prevents 2026 outcome leakage only when all of these executable
gates pass:

- the model/configuration is frozen from historical selection/evaluation before
  the 2026 census is loaded;
- training types and runtime checks reject null/non-finite targets, while
  inference types contain no training target;
- source-specific evidence is normalized to `fact_available_at` and independently
  validated against the exact inclusive cutoff;
- final-fit rows and transforms are historical and content-hashed;
- every emitted 2026 `actual_outcome` is null;
- later 2026 grading is a separate artifact referencing frozen forecast hashes.

No existing current service satisfies that whole chain, which is why it is a
prerequisite rather than an assertion about current readiness.

## 5. Present-tense input, governance, coverage, and freshness matrix

This matrix records what was proven at the audit snapshot. “Not admitted” is not a
criticism of an upstream owner; it means Forecast lacks the exact governed,
cutoff-bound binding required for this model.

No candidate `forecast_cutoff` was selected by this audit. Consequently every
input's run-specific `cutoff_status` is **unresolved**; none may be admitted until
a later validator proves record-level availability at an exact cutoff. The final
column below is an audit-time availability/freshness finding, not a signed
freshness attestation.

| Input family | Owner | Artifact/path observed or expected | Source-as-of / provenance | Governance and coverage finding | Current model admission | Freshness at snapshot |
| --- | --- | --- | --- | --- | --- | --- |
| Canonical player identity | TIBER-Data | `exports/promoted/identity_crosswalk/tiber_identity_crosswalk_v1.json`; `artifact_id: TIBER_IDENTITY_CROSSWALK_V1`, schema `v1`; SHA-256 `5ce5cd3f5dc8fd27c28c5a5fb283431ac648f764c3f8f2b645f6ad924338f263`; row `source_updated_at` 2026-06-09. | Pinned Data commit above; promoted-artifacts index describes the boundary. | Only 25 operator-verified Sleeper mappings, explicitly not the full player universe. Forecast's rookie crosswalk resolves 0/48. Name/fuzzy fallback is not safe. | Identity is required, not a numeric model feature. | **Available but insufficient for a bounded full-pop run.** |
| Active 2026 player population | TIBER-Data / roster source | Only pre-contract spec `docs/specs/active-player-detection-v0-source-boundary.md`; no promoted implementation/artifact. | Existing evidence describes 14,348 2025 roster-membership rows / 971 players, with active state unknown. | Missing row cannot mean inactive, and old roster membership cannot mean current. Free agents, inactive players, duplicates, and IDP visibility remain unresolved. | Not present. | **Unavailable.** |
| Current NFL team assignment | TIBER-Data | `exports/promoted/player_ownership/player_ownership_latest.json`, contract `player_ownership_v0`, SHA-256 `179a20410dac7d4b148966b2e577971ca4cad2da859cdaa397fde76461d5ccb7`, generated 2026-05-24; only 27 mixed/provisional rows: 19 roster-backed, seven draft, one fixture. | No artifact-level `source_as_of`; row verification ranges 2026-01-05 through 2026-05-23. Roster rows derive from 2025 weeks 18/19/20/22; rookie source has 48 post-draft teams but unresolved Forecast identity. | Producer index says “not current or full-universe truth.” Historical team in season coverage is context, not present-tense truth. | Not admitted as a current feature. | **Unavailable for full-pop 2026.** |
| Complete 2025 PPR outcomes | TIBER-Data | Governed `exports/promoted/nfl/player_season_coverage_v0.json`; version `player_season_coverage_v0_promoted_v1`, status `promoted_governed_artifact`; SHA-256 `d45f612b207085df00b4b080e4f55ce1abbd060dcbf30b0bee777ff833ddd8ac`; Data issue #202 / promotion merge `711d6ee158d4e3bd116d1df4d76dea282200454d`. | Observed 2026-06-30; spans 2021–2025 regular seasons. The 2025 slice has 610 offensive rows: 81 QB, 151 RB, 240 WR, 138 TE. | Governed season-level evidence exists, but coverage is 176 full-season, 394 partial, and 40 single-week rows. It covers players with stats, not a complete active-2026 census. The promoted weekly PPR artifact is only a six-row offline fixture and cannot substitute. | Historical target/input candidate only; not bound to a forward service. | **Available historical evidence; forward binding prerequisite.** |
| 2025 usage and player history | TIBER-Data | The same governed player-season artifact carries production plus partial usage/age/career fields. Forecast's accepted source module remains fixed to the 2021–2023 history mirror before 2024 base inputs. | Exact source SHA and promotion are required by `player_history_production_only_v0`; archived 2022–2025 mirrors remain experiment evidence. | A semantics-preserving season shift would use 2022–2024 trailing history plus 2025 base features for 2026 inference. Using 2025 inside the trailing-history block would be a model redesign, not a simple rebind. Full usage/age/team feature families remain unbound. | Production-only is accepted only behind an explicit gate and is default inert. | **Available upstream; not season-shifted or admitted for 2026.** |
| 2026 role/opportunity | Role-and-Opportunity-Model | Four fictional demo rows at `data/role-opportunity/role_opportunity_profiles_v0.json` (artifact `role_opportunity_profiles_v0`, row contract `role_opportunity_profile_v0`, SHA-256 `9ac592982db6d4e85e60961bd8bfb5b2fc647617574c96a7837577d24c246992`); 16 operator-seeded team rows at `data/processed/2026_team_role_opportunity_profiles.json` (`9b4b151bfd554e6a631000f9297f058d9057a3a0a660599bc8c42231c93855dd`); seeded baselines at `data/processed/2026_role_to_fantasy_baselines.json` (`837562060789db357878b4772cb306be3ed167e8166b2ed19e9846bcaf18ab06`). | Demo generated 2025-01-01. The 2026 seed files declare no schema version, generated time, or source-as-of. The repo readiness audit says real player role truth/promoted artifact is missing. Current contract is WR/TE only; QB excluded and RB deferred. | No real full-pop, governed, cutoff-bound player role artifact. | Not admitted. | **Unavailable.** |
| Current team environment/tendency | TIBER-Data source; TIBER-Teamstate read-only adapter/emitter | Governed historical 2024 source `exports/candidates/team_week_raw/team_week_raw_v0_2024_real_source_candidate.json`, mirrored by Teamstate at `data/governed/team_week_raw_v0_2024_real_source_candidate.json`, Forecast-facing emission `data/fixtures/team_week_raw_forecast_run2/team_week_raw_v0_2024_forecast_run2.full.json`; SHA-256 `2aed00e68c1620af10d2ea4350104f7e183ff6ee050f5d385a503ef027281de9`. Current: `data/processed/2026_teamstate_context_v0.json` SHA `f9a979e81cae35207afa643902cf605fee95feda69cc959ccf1eb4ea3d2702b7`; `data/processed/2026_team_offensive_environment_v0.json` SHA `0cb695a553c9628bedadaa947a5938987b5a9706d991abbc93ff95496066307c`; `data/processed/2026_team_landing_context_tags.json` SHA `104348e13f58240ac759859d1397574a5e083791e7888a5919d81fa2f243157b`. | Historical artifact has 32 teams/544 played rows. Current files declare no schema version or generated/source-as-of time; their rows are seeded/pending as described below. | Historical availability is real, but the tested feature set failed real-vs-shuffled sanity twice. Current context has 23 `operator_seeded_unknown` rows; environment has 31 `public_data_pending` and one seeded; landing tags have 23 seeded-unknown rows. They are inspect-only, not governed model input. | Parked/not admitted after repeated sanity-control failure. | **Historical available; current unavailable and not admitted.** |
| Age and experience | TIBER-Data / Age-curve-intelligence-model | Raw birth date, season age, draft, and career fields exist in the governed Data season artifact. The Age repo documents `tiber_age_context_v1`, but no pinned promoted run artifact was found at its audited head. | Age modifiers are `uncalibrated-rule-v1`, provisional, and guarded for `none`, `display_only`, or `dynasty_only`. | Available fields/module do not establish a governed 2026 Forecast source or admitted seasonal feature family. | Not admitted. | **Available in part; forward admission unavailable.** |
| 2026 rookie transition | TIBER-Rookies; Forecast-owned mirror boundary | `exports/promoted/rookie-transition-profile/2026_rookie_transition_profile_v0.json` SHA `c95b941c7855612daccfc2226fc51e0e34dbb2ebe8a2487596675d2522a22f37`; `exports/promoted/rookie-transition-profile/2026_manifest.json` SHA `0acf361c6d2d8cc6f684026481a5aa279e9f7fa718256fad78da0366d5804413`; schema `rookie-transition-profile-v0.2.0`, 48 rows. Rookies #269 decision `rookie_transition_profile_v0_2_promoted`, review lock `0bf363aab85b5e7489e6c55a0e87e680f7060750`; Forecast mirror lock `2ef92faf9a9c91a393f53e9140428451529a1c48`, wrapper SHA `2639d5acb11e8d77400700e814ad9c50dba9bf0a46f3f80413e4f0d51860aaa6`. | Operational generation was 2026-07-10. Per-family verification is 2026-07-10 for draft/age/athletic/college and 2026-05-17 for 47/48 post-draft rows; one UDFA timestamp is null with a required note. Source promotion explicitly excludes downstream predictive/binding authorization. | Forecast crosswalk SHA `30b5120e4809616be3e06ccee7e6252b0186c56b4fa6ef7a2616cdbf1cf4ee73` resolves 0/48. Availability SHA `19a58d4a495d4c484bbfefbc1ba8502983b970b4172bcab1a73f7bd8084a5f33` has `cutoff_at: null`, 223 unresolved-no-proof, 17 unavailable, zero eligible; its generated time is operational, not fact availability. | Parked/experimental. | **Available source mirror; unavailable for inference.** |
| Injury/availability | Upstream source owner not bound | No governed seasonal input artifact identified. | None in forward manifest. | Source rights, definitions, cutoff, and coverage are not established. | Not admitted. | **Unavailable.** |
| Position/provider eligibility | TIBER-Data + TIBER-Fantasy league context | Historical loader accepts only QB/RB/WR/TE and drops other positions before population shaping. Fantasy carries provider roster/fantasy positions and owns a separate IDP/FORGE lane. | Historical input-season position; no pinned forward provider-eligibility record. | Fantasy's IDP support is evidence that the domain exists, not that Forecast supports it. | Position one-hot only for QB/RB/WR/TE. | **Partial; insufficient for row-complete population.** |
| Scoring configuration | TIBER-Fantasy supplies league context; Forecast owns scoring math/output | Seasonal helper documents intended full PPR: 1/reception, 0.1/yard, 6 rush/rec TD, 0.04/pass yard, 4/pass TD, -2/INT, but the loader trusts upstream totals without invoking it. Separate Forecast core uses -1/INT. Fantasy normalizes PPR/half/standard/custom plus several bonuses, but its external mapper does not pass the full normalized settings/lineup. | Fixed code definitions, not one immutable, reconciled end-to-end profile. | Cannot claim even source-total conformity until reconciled, nor exact half/standard/TE-premium/6-point-pass-TD/bonus/custom/lineup/IDP fidelity. The internal interception discrepancy must be resolved by pinning and validating the seasonal profile. | Intended generic seasonal PPR only. | **Defined narrowly but unenforced; incompatible with league-specific claims.** |

No row above authorizes use merely because an artifact can be found. Each future
input needs a manifest entry with owner, repository, commit, path or immutable URI,
artifact/schema version, content hash, `source_as_of`, governed marker, cutoff
eligibility, population coverage, and explicit admission state.

Pinned cross-repository references:

- [TIBER-Data promoted-artifacts index](https://github.com/Prometheus-Frameworks/TIBER-Data/blob/31c0c8e751816d262cf79ffef1a4ae9b6c9b70d5/docs/contracts/promoted-artifacts-index.md)
- [TIBER-Data active-player source-boundary spec](https://github.com/Prometheus-Frameworks/TIBER-Data/blob/31c0c8e751816d262cf79ffef1a4ae9b6c9b70d5/docs/specs/active-player-detection-v0-source-boundary.md)
- [Role-and-Opportunity readiness audit](https://github.com/Prometheus-Frameworks/Role-and-Opportunity-Model/blob/6435d8d3c2c4e53dc45ab57a05a2716e2b47598d/docs/audits/role-opportunity-readiness-audit-2026-05-26.md)
- [Age context consumer contract](https://github.com/Prometheus-Frameworks/Age-curve-intelligence-model/blob/998b28644be7d36efb235ce1df62113dd8f0350c/docs/tiber-age-context-v1-consumer.md)
- [Forecast rookie availability audit](../experiments/rookie-transition-profile-forecast-availability-evidence-audit-2026-07-13.md)
- [Forecast player-history accepted-capability boundary](../capabilities/player-history-production-only-v0.md)
- [Fantasy external-model boundary](https://github.com/Prometheus-Frameworks/TIBER-Fantasy/blob/85c5a7061e552b84a0eb86d4fca6ff7aa7e4730d/server/modules/externalModels/MODULE.md),
  file SHA-256 `784527105ec4d9fbe9a0eac470692871117bb27f97397774a3aeb4a551197bca`
- [Fantasy current freshness helper](https://github.com/Prometheus-Frameworks/TIBER-Fantasy/blob/85c5a7061e552b84a0eb86d4fca6ff7aa7e4730d/server/modules/externalModels/artifactFreshness.ts),
  file SHA-256 `f221c76d0daf5dff3e04b9fa645f1b7b71377ee92e302fcc1c78aef47c94d8e2`
- [Fantasy league scoring normalization](https://github.com/Prometheus-Frameworks/TIBER-Fantasy/blob/85c5a7061e552b84a0eb86d4fca6ff7aa7e4730d/server/services/normalizeScoringSettings.ts),
  file SHA-256 `9982fb96350f72ae74a804185e7ed55abe56fb20bec2d85db2b44648927341cd`
- [Fantasy scoring request mapper](https://github.com/Prometheus-Frameworks/TIBER-Fantasy/blob/85c5a7061e552b84a0eb86d4fca6ff7aa7e4730d/server/modules/externalModels/scoring/scoringRequestMappers.ts),
  file SHA-256 `155523c7ef453bd547632395c4364ec9b55b36235ddd3fa60bb4784a7422ee8e`;
  related scoring types SHA `5d3c85231d23a853feb9320be136223418bcb68735c0a873bd8275a7029c7ee4`
  and service client SHA `5c4c944e85f53e3530e9088443549608a934c51cb14029ae49df2facf2bf4d92`
- [Fantasy exact identity adapter](https://github.com/Prometheus-Frameworks/TIBER-Fantasy/blob/85c5a7061e552b84a0eb86d4fca6ff7aa7e4730d/server/modules/externalModels/identity/tiberIdentityCrosswalkAdapter.ts),
  file SHA-256 `95bebeb57dab857fabb958e5dd37d9bfc5976522933d24a219ad25447e501fe3`;
  identity types SHA `9ebb1f970745e826329b4d54260a059fe8fab7d25cf013743dcefda12dd04dd3`
- [Fantasy IDP schema](https://github.com/Prometheus-Frameworks/TIBER-Fantasy/blob/85c5a7061e552b84a0eb86d4fca6ff7aa7e4730d/shared/idpSchema.ts),
  file SHA-256 `6c435c686583f757c86ef276a6d0bb56ca7b4214165e7ba6fb887f9407c0e142`

The read-only inspection of
[Fpts-SOT](https://github.com/Prometheus-Frameworks/Fpts-SOT/tree/e7facfd7556b9b276b6af067b230b069af1efaa0)
found only a one-line README and two 2025 leader files, with no scoring schema,
profile, provenance, or governance contract. It cannot currently serve as
canonical scoring truth. This leaves Fantasy as league-context owner and Forecast
as output-math owner, with the exact shared scoring profile still a prerequisite.

## 6. 2026 target-population behavior

The current loader starts from players with an input-season weekly row. That
silently removes rookies and other no-history players before the prediction
artifact exists, while non-skill positions are dropped as validation warnings.
That behavior is unsuitable for a forward population contract.

| Population case | Current behavior | Required forward behavior |
| --- | --- | --- |
| Established player with complete 2025 history | Can form a historical-style observation if contracts are rewritten. | Emit forecast only when identity, eligibility, required features, and governance pass. |
| Rookie with no NFL history | Skipped because there is no input-season row. | Keep the canonical population row; use `unavailable_missing_required_inputs` until a separately admitted rookie path exists. |
| Returning player with missing 2025 season | Missing from input-derived population or represented with zeros in some numeric shaping. | Keep row; distinguish a real zero from missing history and emit an explicit missing-input status unless an approved missing-season treatment exists. |
| Changed team | Historical loader retains input-season team. | Bind team as of cutoff, preserve prior team separately if useful, and invalidate/supersede after a material assignment change. |
| Changed position/provider eligibility | Historical input-season position is used to avoid target leakage. | Bind canonical position and provider eligibility as of cutoff; record change; reject unsupported or ambiguous domains. |
| Unsigned/free agent | No explicit contract. | Keep row with team status `FA`/unassigned and explicit eligibility/coverage; do not invent a team environment. |
| Not expected active in 2026 | No explicit contract. | Keep row with `population_ineligible` and the governed reason/source. |
| Duplicate, missing, or unresolved identity | Conflicting weekly keys may fail, but complete population identity is not audited. | Preserve or quarantine row with `identity_unresolved`; fail the run if population-level identity thresholds/invariants are not met. |
| IDP or other unsupported position | Dropped as non-skill input. | Keep row with `unsupported_position_domain`; emit no offensive forecast, replacement baseline, or Strategy label. |

Population-census rows and forecast-ledger rows should have a one-to-one
completeness invariant keyed by a stable source `population_row_id`. A canonical
ID may be null for an unresolved identity, but the source row still appears
exactly once with a null forecast. Counts must be nonzero for a succeeded run,
status counts must sum to census count, output count must equal census count, and
duplicate/missing/extra key lists must be empty.

## 7. Scoring fidelity

### 7.1 What the seasonal lane supports

The repository documents an intended standard full-PPR helper:

- 1 point per reception;
- 0.1 per rushing or receiving yard;
- 6 per rushing or receiving touchdown;
- 0.04 per passing yard;
- 4 per passing touchdown;
- -2 per interception.

The current seasonal loader does **not** call that helper. It trusts upstream
weekly `ppr_points` or the final cumulative `season_ppr` without component
recomputation, tolerance reconciliation, regular-season/week validation, or
season-completeness checks. The weights above are therefore intended semantics,
not an enforced property of every training target. A separate generic scoring
subsystem uses -1 per interception, further proving that repository-wide
equivalence cannot be assumed.

Neither definition encodes six-point passing touchdowns, yardage bonuses,
provider-specific eligibility, league size, starting-lineup shape, replacement
baselines, or IDP.

### 7.2 Contract options

| Option | Architectural fit now | Strength | Limitation | Recommendation |
| --- | --- | --- | --- | --- |
| Generic PPR artifact | Closest to the current total-PPR target. | Smallest path; can preserve historical model meaning. | Explicitly not league-specific; no provider/replacement context. | **Smallest honest first artifact**, after prerequisites. |
| Scoring-profile-specific run | Requires a versioned scoring input and a target/model whose learned total corresponds to that profile. | Direct league display if trained/evaluated consistently. | Re-scoring a total-PPR prediction is invalid; one run per profile increases governance and evaluation burden. | Defer until component or profile-specific target evidence exists. |
| Component-stat forecast | Not implemented in the seasonal lane. | Scoring kernel could apply diverse league rules; clean separation of football outcomes and fantasy scoring. | Requires new targets, models, covariance/uncertainty treatment, evaluation, and contract work. | Preferred longer-term architecture, not the smallest current prerequisite. |

The first bounded artifact, if later authorized, should declare an exact immutable
generic-PPR profile and carry `league_specific: false`. Fantasy must reject it for
any surface that claims exact nonstandard league totals.

## 8. Uncertainty, stability, and coverage

| Candidate output | Supportable now? | Finding |
| --- | --- | --- |
| Point forecast | Only in historical LOOCV rows with known actuals | The current service has no forward use of the point estimator. |
| Floor / median / ceiling | No | No seasonal predictive distribution or calibrated quantile model exists. |
| Confidence band | No | Historical residuals are not transformed into a validated conditional interval. |
| Volatility tag | No | Weekly/ROS volatility contracts belong to another lane and cannot be reused as seasonal calibration. |
| Fragility tag | No | No reviewed seasonal definition or validation exists. |
| Replacement baseline / VORP | No for this seasonal artifact | These depend on league size, lineup, eligible population, and scoring profile. |
| Coverage status | Yes, after contract work | Presence, missingness, unsupported domain, and governance can be reported deterministically. |
| Missing inputs | Yes | Must be explicit, typed, and distinguish absent from genuine zero. |
| Primary drivers | Partially | Ridge contribution explanations describe model mechanics, not causality; future explanations must use the exact final model. |
| Limitations | Yes | Manifest- and row-level limitations are supportable without statistical invention. |

The first forward contract may use
`forecast_uncertainty.status: "unavailable_not_calibrated"` and null range fields.
It must not create arbitrary percentages around the point estimate. A bounded run
should not be considered promotable until the separate review decides whether an
uncalibrated point-only artifact satisfies the governing run-manifest doctrine;
the current doctrine requires uncertainty, so this audit lists it as a
prerequisite.

## 9. Proposed artifact and consumer contracts

The complete proposal is
[`forecast-2026-forward-artifact-contract-proposal-2026-07-27.md`](forecast-2026-forward-artifact-contract-proposal-2026-07-27.md).
The non-production, unexecuted example is
[`forecast_2026_forward_manifest.sample.json`](../../data/fixtures/seasonalPpr/forecast_2026_forward_manifest.sample.json).
It contains zero player rows and no forecast value.

The proposal is deliberately not executable, approved, or promoted. Its core
requirements are:

- separate `forecast_cutoff` from operational `generated_at`;
- immutable code, model/configuration, scoring, and input identities;
- exact per-input governance, source-as-of, cutoff, coverage, and admission state;
- a complete target-population reconciliation;
- output kind `model-inference` and future `actual_outcome: null`;
- explicit forecast availability and unsupported-domain statuses;
- defensible uncertainty or an explicit unavailable state;
- previous-run lineage and a typed diff;
- content hashes plus detached validation/promotion attestations;
- detached freshness, revocation, and supersession state;
- no advice, Strategy interpretation, or operator overlay in Forecast output.

### Fantasy read-only boundary

A future TIBER-Fantasy adapter should:

1. validate artifact type/schema and content hashes;
2. pin run ID, code/model/configuration versions, scoring profile, cutoff, and
   target season;
3. reject any artifact without a valid detached promotion attestation carrying
   `production_ready: true`, and reject fixtures, samples, stale, superseded,
   malformed, hash-mismatched, or ungoverned artifacts;
4. require exact scoring compatibility and never imply league-specific fidelity
   from generic PPR;
5. display a persistent model-inference label;
6. expose unavailable, excluded, missing, unresolved, and unsupported rows;
7. compare candidates without modifying the Forecast artifact;
8. keep Strategy interpretations and human/operator overlays in separately owned
   records;
9. fail closed for IDP and every other unsupported domain.

The adapter should return explicit failure codes rather than a silent fallback:
`artifact_unavailable`, `malformed`, `schema_unsupported`, `ungoverned`,
`pin_mismatch`, `cutoff_violation`, `clock_invalid`, `validation_failed`,
`not_executed`, `revoked`, `stale`, `superseded`, `identity_unresolved`,
`scoring_mismatch`, `unsupported_position`, and `required_input_missing`.

This audit does not implement that adapter.

## 10. Freshness and supersession

The proposed states are:

| State | Meaning | Consumer behavior |
| --- | --- | --- |
| `current` | Inputs remain valid under the run's explicit freshness policy and no promoted successor exists. | May be considered only if all other promotion/consumer gates pass. |
| `aging` | A declared review threshold has passed, but no material invalidation is known. | Display warning; policy decides whether consumption remains permitted. |
| `stale` | A material source change or freshness limit invalidated the run's present-tense claim. | Reject for current-facing use. |
| `superseded` | A newer promoted artifact for the same target/scoring scope replaced it. | Historical comparison only. |
| `unavailable` | A referenced package/source or required freshness assessment cannot be obtained. | Reject. |

`generated_at` alone must not silently determine freshness. The immutable
manifest pins the applicable policy IDs; detached freshness/lifecycle
attestations carry `evaluated_at`, state, reasons, and successor. Malformed,
failed-validation, ungoverned, unexecuted, and revoked are separate
admission/lifecycle failures, not freshness aliases. The following material
changes should stale or supersede a run for later present-tense use:

- canonical identity resolution or target-population membership;
- roster/team assignment;
- role or opportunity;
- injury/availability;
- team environment;
- any admitted feature value, schema, or governance state;
- model/configuration identity;
- scoring profile or provider eligibility;
- upstream artifact revocation/replacement;
- a newly promoted run for the same scope.

These changes do not retroactively invalidate the immutable artifact's claim about
what was known at its original cutoff. They change whether it can still serve a
later “current” claim and whether a promoted successor is required.

The first milestone may be one pinned preseason artifact. Recurring cadence is a
separate policy decision; refreshes should be triggered by governed material
changes or an explicit reviewed threshold, not a hidden clock.

Freshness limits must be family-specific. Immutable historical outcomes and draft
facts are governed primarily by version and supersession; roster, team, role,
injury, and provider-eligibility inputs require owner-defined maximum lags.
`post_cutoff` and `clock_invalid` should be terminal validation failures, not
variants of “current.” Fantasy's existing generic helper is warn-only, defaults
to 45 days, and clamps future timestamps to age zero; it is therefore not an
adequate admission gate for this artifact.

## 11. Prerequisite and gap register

| ID | Required before a bounded forward run | Why it is required | Acceptance evidence |
| --- | --- | --- | --- |
| P0 | Define and validate a nonempty canonical 2026 population census at an exact cutoff. | Current input-derived population silently drops rookies/no-history/IDP. | Immutable identity/roster refs; stable source row key; status sums equal census count; output count equals census count; duplicate/missing/extra lists empty; explicit eligibility and unresolved ledger. |
| P0 | Supply complete, governed 2025 outcomes and 2025 production/usage inputs with hashes and source-as-of. | Current committed Run 1 data is a scaffold and the 2026 feature window is not bound. | Producer governance markers, coverage report, cutoff validation, Forecast-side adapter tests. |
| P0 | Split historical evaluation, approved final fitting, and future inference into separate typed and runtime-validated services. | Current backtest cannot score a row without an actual and has no final fit; a direct trainer call can coerce null target to zero. | Runtime tests reject null/non-finite training targets; future inference type exposes no training target; final-fit inputs are historical only; inference emits row-complete outputs. |
| P0 | Freeze model/configuration selection and leakage protocol. | Lambda override and experimental lanes are not a complete selection record. | Model/config hash, approved feature list, temporal-origin evaluation, shuffled controls where applicable, leakage tests. |
| P0 | Implement the forward manifest/row contract and fail-closed validator. | Current writer has no governable forward envelope. | Schema, deterministic writer, validator negative tests, hashes, population reconciliation, no-advice fields. |
| P0 | Adopt an exact generic-PPR scoring profile, source reconciliation, and compatibility rules. | The loader trusts upstream totals and does not enforce the documented helper; the separate core also disagrees on interception weight. | Immutable profile ID/weights/hash; producer scoring identity; component/total tolerance checks; regular-season/week/completeness validation; `league_specific: false`; Fantasy compatibility contract. |
| P0 | Establish a statistically defensible seasonal uncertainty method or obtain explicit governing disposition of the point-only gap. | Run-manifest doctrine requires uncertainty; fabricated ranges are prohibited. | Backtested coverage/calibration by temporal origin and position, or an explicit reviewed contract decision. |
| P1 | Rebind and revalidate `player_history_production_only_v0` for a governed dynamic 2026 input window. | Accepted capability is fixed to earlier seasons/default inert, and current runtime zero-imputation differs from the indicator/train-fold-imputation preprocessing used in historical experiment evidence. | Exact source SHA, window/cutoff checks, coverage, one frozen missingness/imputation policy, rerun through the exact forward implementation, activation review, final manifest admission entry. |
| P1 | Resolve or explicitly exclude current role/opportunity, age/experience, injury, and team-context inputs. | Present-tense sightline is not established. | Per-input decision: admitted with governed evidence, or explicitly unavailable/not admitted with no silent default. |
| P1 | Preserve rookie rows while the rookie lane remains unadmitted. | Rookies currently disappear at input loading. | Complete population reconciliation and explicit unavailable reason; later rookie admission requires separate evidence/model review. |
| P1 | Define immutable later-grading linkage. | The 2026 forecast must not be rewritten when actuals arrive. | Separate grading schema referencing forecast artifact hash/run ID and governed completed outcomes. |
| P1 | Define detached lifecycle authority and discovery. | Content hashes alone cannot prove that an older current attestation was not later revoked/superseded. | Authoritative append-only registry/release index, authorized issuers, monotonic ordering or equivalent, fork resolution, revocation, and anti-replay lookup. |
| P2 | Implement the separate Fantasy adapter only after independent artifact/leakage review and promotion. | Consumer code is out of scope and must not precede governance. | Separate authorization, exact compatibility validation, read-only/no-mutation tests, IDP fail-closed tests. |

No gap authorizes a follow-up issue automatically. The operator retains scope and
priority authority.

## 12. Evidence and verification ledger

Material conclusions were checked against:

- the pinned code paths and tests named in sections 2–4;
- the committed Run 1 artifact;
- Run 2 initial, audit, coverage, and rerun reports;
- player-history controlled, robustness, source, additional-validation,
  threshold, implementation, and activation reports;
- rookie mirror, crosswalk, availability, and schema-design records;
- Forecast's lane, ownership, backtest, verification, and run-manifest docs;
- read-only pinned upstream and consumer repository snapshots.

Commands run from the pinned Forecast checkout:

| Command | Result |
| --- | --- |
| `git status --short --branch` | Clean audit base on dedicated branch before changes. |
| `npm ci --cache /tmp/tiber-forecast-npm-cache` | Passed. No dependency was added or changed. |
| `npm run build` | Passed (`tsc --noEmit`). |
| `npm test` | 83 test files passed; 3 CLI-subprocess files failed because the sandbox denied `tsx` IPC pipe binding (`listen EPERM` under `/tmp/tsx-0`). 1,252/1,260 tests passed; all 8 failures were IPC-start failures, not assertion failures. |
| `TSX_DISABLE_CACHE=1` targeted retry of the three files | Same 8 sandbox IPC failures. |
| `tsc --noEmit` plus 10 focused test files covering seasonal load/backtest, player-history binding, baselines/uncertainty, coverage gates, Run 2 rerun, and rookie availability | Passed: 10 files, 191 tests. |

The final branch verification should repeat build, JSON parsing, diff checks, and
the available test suite. The IPC limitation is an execution-environment
deviation; it was not “fixed” by weakening code or tests.

## 13. Unresolved uncertainties and deviations

- A complete governed 2025 full-population artifact and a canonical 2026 active
  population were not proven through an executable Forecast binding.
- No exact candidate 2026 forecast cutoff is selected here. Selecting one belongs
  to the prerequisite/bounded-run authorization, and every input must prove
  eligibility at that exact instant.
- Upstream repository presence does not prove model admission, freshness, or
  cutoff eligibility.
- “Production-only player history accepted” means the guarded capability was
  accepted; it does not mean the model as a whole is forward-ready.
- The seasonal point model's predictive adequacy for a full production population
  remains unresolved. The small committed scaffold metric is not readiness
  evidence.
- GitHub CLI was unavailable in the managed environment. Repository inspection,
  native Git operations, and the authenticated GitHub connector provide the audit
  and draft-PR path instead.
- The baseline full test command is partially constrained by sandbox-denied `tsx`
  IPC sockets as recorded above.

## 14. Terminal decision

`forecast_2026_forward_artifact_requires_prerequisites`

This decision permits prerequisite work to be proposed for operator disposition.
It does not authorize a 2026 run.

No 2026 forecast run, player forecast, artifact promotion, capability activation,
Fantasy or Strategy integration, advice surface, deployment, merge, issue close,
or write to another repository occurred during this audit.
