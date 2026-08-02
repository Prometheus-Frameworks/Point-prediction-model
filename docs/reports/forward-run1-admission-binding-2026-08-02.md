# Forward Run 1 admission binding report — 2026-08-02

## Decision

```text
forward_run1_admission_binding_ready
```

This decision means the exact operator dispositions recorded on TIBER-Forecast #170 have been converted into a Forecast-side candidate admission binding. It does **not** execute `seasonal-ppr-2026-forward-001`, authorize promotion, or grant consumer eligibility.

## Authority

- Governing issue: `Prometheus-Frameworks/TIBER-Forecast#170`
- Operator disposition: issue comment `5157636151`
- Authorized repository writes: TIBER-Forecast only
- Base: `813eff8de0b4a8d4f29f5c37abe522fe3e792ca3`

## Bound identities

- Runtime contract: `seasonal-fantasy-point-forecast-manifest-v1`
- Model: `seasonal-forward-ridge-base@forward-base-eval-v1`
- Configuration SHA-256: `6bb7323cdc11786a13b5ca92c66f1e72b34c9387cc4760b6f293c95b3682ad1c`
- Forecast cutoff: `2026-07-28T01:00:00Z`
- Training source SHA-256: `d45f612b207085df00b4b080e4f55ce1abbd060dcbf30b0bee777ff833ddd8ac`
- Census SHA-256: `6057031bfc6dfedac1a5b2957ec194e738df5fbdb12dfec80d1e8ad773f0d1ea`
- Data scoring manifest SHA-256: `83687c3511691c6681139c253f217c3b1d11ca6e7bd87b169f79e1f89da8e52a`
- Forecast scoring profile SHA-256: `a368b75bf5503558a4f664e0486e2c3cc75c01004d4527fd29ecaa1e247a6274`

## New policy bindings

### Census eligibility

Artifact: `data/experiments/forwardRun1/forward_run1_census_eligibility_policy_v1.json`

SHA-256: `8e743e9fc1669d70c701454cfe68194148fed75e37e95309a3a2e07647fbfcca`

The policy preserves every row from the exact pinned census. A finite point forecast is allowed only when identity, position, eligibility, governance, cutoff, and required-feature checks all pass. Unresolved rows remain visible with typed unavailable states.

### Duplicate canonical identity

Artifact: `data/experiments/forwardRun1/forward_run1_duplicate_canonical_id_policy_v1.json`

SHA-256: `504206dc32c87758e0a5c6c0107e0cb886d891de0b37709c6818e639cf35df29`

The run must fail closed if more than one row resolves to the same canonical player ID. Unresolved source identities remain separate visible rows and are not guessed into a collision or join.

## Scoring reconciliation binding

The Data evidence is bound into the existing six-field Forecast `ScoringReconciliationEvidenceRef` shape as:

- `status: passed`
- `validator_id: tiber-forecast-run1-derived-component-scoring-binding`
- `validator_version: 1.0.0`
- exact Data manifest commit/path/hash
- Forecast scoring profile hash
- exact admitted source artifact hash

`passed` is scoped to the authorized target rule: every model target is derived from the eight governed components in exact cents. The 830 promoted `season_ppr` disagreements remain preserved provenance and are not used as target values.

The binding cites `docs/decisions/scoring-profile-hash-equivalence-2026-07-28.md` as the required bridge between the Forecast and Data profile-definition hashes.

## Population expectation

The census contains 658 rows: 610 historical-offense rows and 48 rookie-transition rows. The binding does not remove the rookies or invent prior-season production. Because the frozen base model requires previous-season features, rookie rows are expected to remain visible with typed unavailable and/or identity-unresolved statuses during execution.

## Files

- `data/experiments/forwardRun1/forward_run1_admission_binding_v1.json`
- `data/experiments/forwardRun1/forward_run1_census_eligibility_policy_v1.json`
- `data/experiments/forwardRun1/forward_run1_duplicate_canonical_id_policy_v1.json`
- `docs/reports/forward-run1-admission-binding-2026-08-02.md`

## Boundaries

No model math, configuration, scoring semantics, source bytes, census membership, or runtime contracts were changed. No cross-repository write occurred. No forecast was fit or emitted. No output was promoted, deployed, published, consumed, ranked, or interpreted as advice.
