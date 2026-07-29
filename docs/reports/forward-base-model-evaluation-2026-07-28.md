# Forward base-model multi-origin evaluation and configuration freeze (#168)

> **Date:** 2026-07-28
> **Issue:** [#168](https://github.com/Prometheus-Frameworks/TIBER-Forecast/issues/168)
> **Terminal decision:** `forward_base_model_configuration_frozen`
> **Frozen configuration SHA-256:** `6bb7323cdc11786a13b5ca92c66f1e72b34c9387cc4760b6f293c95b3682ad1c`
> **Freeze-record SHA-256:** `5f80f735a4aa8e9948fc241aee5178f319e60144cd23ec647884edb694d91ff0`
> **Report artifact:** [`forward_base_model_evaluation_v1.json`](../../data/experiments/forwardBaseEval/forward_base_model_evaluation_v1.json)
> **Frozen package:** [`forward_base_frozen_configuration_v1.json`](../../data/experiments/forwardBaseEval/forward_base_frozen_configuration_v1.json)
> **Complete freeze record:** [`forward_base_configuration_freeze_record_v1.json`](../../data/experiments/forwardBaseEval/forward_base_configuration_freeze_record_v1.json)

## What ran

Expanding-window rolling-origin evaluation through the **exact deployed forward
runtime path** (`fitSeasonalForwardModel` → `predictSeasonalForward`; no
evaluation-only reimplementation of preprocessing or prediction), over governed
TIBER-Data `player_season_coverage_v0` rows (SHA-256 `d45f612b…`, read-only at
pinned Data commit `3393a8f0…`).

Targets are **derived-component generic full-PPR** per the operator
scoring-target disposition
([decision record](../decisions/forward-scoring-target-disposition-2026-07-28.md)),
computed with exact integer cent arithmetic (all eight components are integral in
the governed source, so no rounding occurs anywhere). Promoted `season_ppr`
source totals were carried as provenance only.

Features (base family only, all `reject_row` missingness, no imputation):
previous-season derived PPR, derived PPR per game, games played, targets, rush
attempts, plus position one-hot (TE reference). Excluded families (trailing
player history, Teamstate, role, age, injury, rookie) were excluded entirely —
not zero-filled.

| Stage | Trains on | Predicts from | Scored against | Rows (train → scored) |
| --- | --- | --- | --- | --- |
| Selection A | 2021→2022 pair | 2022 inputs | 2023 derived targets | 472 → 440 |
| Selection B | 2021→2022, 2022→2023 | 2023 inputs | 2024 derived targets | 912 → 438 |
| **Final (held out)** | all three earlier pairs | 2024 inputs | 2025 derived targets | 1,350 → 452 |

Lambda candidates `0.1, 1, 10, 100` and the selection rule (minimize mean MAE
over A+B, ties to smaller lambda) were pinned on issue #168 **before any
evaluation ran**. The configuration — including the selected lambda — was frozen
and hashed before the final pair was evaluated. Selection receives a validated
three-pair view that rejects complete packages before inspecting a fourth pair;
the final definition and final-pair bytes are therefore structurally unreachable
through the selection API. A poison-pair regression fails on any pre-freeze
property read and proves the final pair is first observed only by the post-freeze
final evaluation.

## Results

Lambda selection (A/B only): `0.1` → mean MAE 45.1442; `1` → 45.1488; `10` →
45.1819; `100` → 45.6697. **Selected: λ = 0.1** (surface is nearly flat, as
expected for a low-dimensional ridge; the pinned rule decides).

| Evaluation | Model MAE | RMSE | Pearson | Spearman | Position-mean MAE | Prev-season MAE | Δ vs best baseline |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Selection A (2023) | 44.1063 | 62.0469 | 0.7342 | 0.7155 | 72.4605 | 46.1622 | **−2.0559** |
| Selection B (2024) | 46.1821 | 64.4224 | 0.7199 | 0.7104 | 72.5300 | 48.5647 | **−2.3826** |
| **Final (2025)** | **41.3197** | **59.0836** | **0.7639** | **0.7625** | 71.3418 | 43.8062 | **−2.4864** |

Final-origin MAE by position: QB 66.85 (n=63), RB 45.29 (n=106), WR 38.10
(n=176), TE 27.66 (n=107).

The model beats the best baseline on **all three** origins with the margin
growing as the training window expands, and correlations are stable (0.72–0.76)
with no direction change across origins. The continuation rule (beat both
baselines on the final origin; lose to none during selection) is satisfied, so
the configuration freezes.

## Complete configuration identity

The runtime ridge package remains independently reusable at configuration SHA
`6bb7323c…`. The separate immutable freeze record binds that package to the
additional identities required by #168:

- generic full-PPR target/profile identity, both approved profile hashes, the
  component-binding contract, and both operator decision records;
- governed source commit/path/SHA, origin-package SHA, seasons, scope, and
  supported positions;
- ordered feature lineage, reject-row missingness, per-game transform,
  train-fold-only population-z-score rules, categorical encoding, and clamp;
- lambda candidates, selection rule and definitions, selected lambda, final
  definition, continuation rule, and enforced stage order;
- historical evaluation artifact SHA `04fae89a…`, evaluation implementation
  commit `dc1816d…`, runtime base `640c041…`, all runtime/schema/software
  identities, and the explicit excluded-family ledger;
- the non-activation boundary: no 2026 admission, cutoff, candidate execution,
  promotion, deployment, or consumption.

The wrapper self-hashes to `5f80f735…` (artifact-file SHA-256 `343e7dc0…`).
`validateForwardBaseConfigurationFreezeRecord` recomputes the self-hash, rebuilds
the complete fixed v1 shape, validates the embedded runtime package, and can
verify the exact runtime, origin, and evaluation artifact bytes supplied by a
later consumer.

## Population coverage and exclusions

Every pair's package itemizes exclusions rather than dropping them: players with
an input-season row but no target-season row (136 in the final pair —
deployment-analog "predicted but no outcome"), players with a target-season row
but no input-season row (rookies/no-history analogs), and non-QB/RB/WR/TE input
rows. Full ledgers and completeness-class distributions are in
[`forward_base_eval_origin_pairs_v1.json`](../../data/experiments/forwardBaseEval/forward_base_eval_origin_pairs_v1.json).

## What this does and does not establish

Established: a population-scale, multi-origin, leakage-guarded evidence base for
the base-feature configuration now frozen as
`6bb7323c…`, replacing the 39-row Run 1 scaffold as the model-evidence basis;
determinism (two-build byte-identical artifacts; `--check` verification mode);
and a self-verifying, hash-bound complete freeze identity for future gate use.

Not established or authorized: input admission for any run, a forecast cutoff,
execution of `seasonal-ppr-2026-forward-001`, uncertainty calibration, promotion,
or consumption. The frozen configuration is eligible only for later final-fit /
inference implementation under the #170 gate.

## Reproduction

```bash
npx tsx scripts/runForwardBaseEvalBuild.ts --data-repo-root ../TIBER-Data
npx tsx scripts/runForwardBaseModelEvaluation.ts --check
npx vitest run tests/forwardBaseEvaluation.test.ts
```
