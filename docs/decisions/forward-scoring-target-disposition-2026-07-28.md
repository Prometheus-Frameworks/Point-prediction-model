# Decision record: forward scoring-target definition (derived-component totals)

> **Decision date:** 2026-07-28
> **Decision authority:** Joseph (operator), accepted as recommended by the independent
> PR review of Prometheus-Frameworks/TIBER-Data#229
> **Status:** approved operator disposition
> **Applies to:** every Forecast training/evaluation target and forward target
> definition that claims scoring profile `tiber-generic-full-ppr-v1` — including the
> #168 multi-origin evaluation and the future `seasonal-ppr-2026-forward-001`
> candidate's `target_definition`

## Background

TIBER-Data#229 reconciled the promoted `player_season_coverage_v0` artifact
(3,016 governed 2021–2025 REG QB/RB/WR/TE rows, SHA-256
`d45f612b207085df00b4b080e4f55ce1abbd060dcbf30b0bee777ff833ddd8ac`) against the
generic full-PPR profile:

- **2,186 rows (72.48%)**: promoted `production_summary.season_ppr` equals the
  profile-derived total at cent scale (`ROUND_HALF_UP`, tolerance 0.00).
- **830 rows (27.52%)**: promoted totals differ by −12.00 to +14.00, every delta a
  multiple of two, consistent with source-total scoring families outside the
  profile's eight components (the evidence correctly does not attribute deltas
  per row).

The promoted source totals are therefore **not profile-equivalent across the
population**. A target built from source totals and a target built from
profile-derived components are materially different definitions, and a run
claiming the generic profile while training on source totals would be dishonest
for ~27.5% of rows.

## Decision

For any Forecast target that claims `tiber-generic-full-ppr-v1`:

1. **Training and evaluation targets are computed from the eight governed
   components** using the profile weights and the TIBER-Data#229 contract's
   component bindings, cent-scale `ROUND_HALF_UP` — not read from
   `production_summary.season_ppr`.
2. The promoted `season_ppr` source totals remain untouched provenance. They may
   be reported alongside derived targets (e.g. in evaluation reports) but are
   never the regression target, never the graded actual for a profile-claiming
   run, and are never overwritten.
3. The manifest's `target_definition.aggregation_rule` for a forward candidate
   must state the derived-component rule explicitly and cite the TIBER-Data#229
   contract (SHA-256
   `6542e32ffba6446d982c8459e7a81187e7970cb6ef1a74e76be5d35edd26dd98`) as the
   component-binding authority.
4. Later grading of a 2026 forecast against completed 2026 actuals must apply the
   same derived-component rule to the outcome source before comparison, under the
   same profile version or a reviewed successor.

## Scope notes

- The 830-row discrepancy ledger stays authoritative and visible; this decision
  selects a target definition, it does not reinterpret or repair source totals.
- Rows whose components are missing (zero such rows in the pinned 2021–2025
  bytes, per the #229 missingness ledger) would fail closed as untargetable, not
  default to the source total.
- If a future program lane wants a *source-total* target instead, that is a
  different scoring claim and needs its own profile identity and disposition —
  it must not reuse `tiber-generic-full-ppr-v1`.

## Non-decisions

This record does not freeze a model or feature configuration (#168), select a
forecast cutoff, authorize the #170 candidate run, calibrate uncertainty, promote
any artifact, or authorize downstream consumption.
