# Forward Run 1 admission binding report — 2026-08-02

## Decision

```text
forward_run1_admission_binding_ready
```

This decision means the exact operator dispositions recorded on TIBER-Forecast #170 have been converted into a Forecast-side candidate admission binding. It does **not** execute `seasonal-ppr-2026-forward-001`, authorize promotion, or grant consumer eligibility.

## Authority

- Governing issue: `Prometheus-Frameworks/TIBER-Forecast#170`
- Operator disposition: issue comment `5157636151`
- Cutoff/package correction authority: PR comment `5172232689`
- Authorized repository writes: TIBER-Forecast only
- Base: `813eff8de0b4a8d4f29f5c37abe522fe3e792ca3`

## Bound identities

- Runtime contract: `seasonal-fantasy-point-forecast-manifest-v1`
- Model: `seasonal-forward-ridge-base@forward-base-eval-v1`
- Configuration SHA-256: `6bb7323cdc11786a13b5ca92c66f1e72b34c9387cc4760b6f293c95b3682ad1c`
- Forecast cutoff: `2026-07-29T22:16:02.000Z`
- Historical-training runtime content SHA-256: `6e131681ceac3a1a61daccab07109dd5281d5260d885a6427dde45e6caf571ba`
- Future-feature runtime content SHA-256: `d91996ed97c98fc0613c717a11657610a4a4ac15b2383d8b34f86c3ee72fdf0d`
- Census runtime content SHA-256: `ed93d3519c7b9dbccd6fec35ce53bb6c46f7675c698870fc721b4992f32765b4`
- Raw Data training/feature source SHA-256 (provenance only): `d45f612b207085df00b4b080e4f55ce1abbd060dcbf30b0bee777ff833ddd8ac`
- Raw Data census source SHA-256 (provenance only): `6057031bfc6dfedac1a5b2957ec194e738df5fbdb12dfec80d1e8ad773f0d1ea`
- Data scoring manifest SHA-256: `83687c3511691c6681139c253f217c3b1d11ca6e7bd87b169f79e1f89da8e52a`
- Forecast scoring profile SHA-256: `a368b75bf5503558a4f664e0486e2c3cc75c01004d4527fd29ecaa1e247a6274`
- Package materializer implementation commit: `f9b10354a45152685016a05bba930eade416a8f5`
- Package artifact generation time: `2026-08-04T22:11:03.000Z`
- Package-admission evidence file SHA-256: `49ec15bad0127718222937955beccfbef5a01132998b8bf98134206aaaf6568d`

## Cutoff correction

The original `2026-07-28T01:00:00.000Z` cutoff preceded the authoritative Forecast configuration/code pin and therefore could not pass the runtime decision-freeze gate. Exact repository evidence is:

- TIBER-Data `3393a8f0b7f4ffa640f63d712768beb1c52b917a` commit availability: `2026-07-28T00:47:06.000Z`;
- frozen evaluation artifact generation: `2026-07-28T12:00:00.000Z`;
- TIBER-Forecast `813eff8de0b4a8d4f29f5c37abe522fe3e792ca3` commit availability: `2026-07-29T22:16:02.000Z`.

The controlling knowledge-bearing maximum is the frozen Forecast commit. Therefore `2026-07-29T22:16:02.000Z` is the earliest canonical UTC cutoff not earlier than every selected Data, configuration, and execution-source dependency. All governed cutoff/effective-time echoes use that exact millisecond-bearing form.

The wrapper packages were operationally materialized later, at `2026-08-04T22:11:03.000Z`, by the separate implementation commit `f9b1035…`. That later generation does not add a model fact or expand the knowledge cutoff: each package hashes canonical `{payload, cutoff_records}`, and every cutoff record still points to the exact Data bytes available by `2026-07-28T00:47:06.000Z`. This is the contract’s explicit post-cutoff-package rule, not a substitution of generation time for source availability.

## Exact runtime packages

`computeForwardPinnedPackageSha256` hashes canonical `{payload, cutoff_records}` package content. It does not hash the raw upstream Data file. The binding now materializes and pins the exact model-facing packages:

| Package | Rows | Runtime content SHA-256 | Canonical artifact file SHA-256 |
|---|---:|---|---|
| Historical training | 1,802 | `6e131681ceac3a1a61daccab07109dd5281d5260d885a6427dde45e6caf571ba` | `2d17752fedccbdf544ac07e57b9530840f3d230f3e5a4886fdd816b5052db990` |
| Future features | 610 of 658 census rows | `d91996ed97c98fc0613c717a11657610a4a4ac15b2383d8b34f86c3ee72fdf0d` | `580adef9f96aa88b95c7cf742bcbeb289fc9c244a2db9efdd0a836b31036f3b8` |
| Population census | 658 | `ed93d3519c7b9dbccd6fec35ce53bb6c46f7675c698870fc721b4992f32765b4` | `1f18456cb449a5a55c3016c7c80f14b580e7e25a0819b7f8afe97904b7f91bad` |

The future package includes the exact 610 historical-offense rows with admitted 2025 features. The 48 rookie rows have no admitted 2025 history and remain absent from that package; the census preserves them so the runtime can emit typed unavailable/identity-unresolved ledger rows if a separately authorized run ever occurs.

These are Forecast-produced wrapper packages. Their `owner_repository` is TIBER-Forecast, `owner_commit_sha` is the immutable materializer implementation commit, and `uri_or_path` names the local generated package. Raw TIBER-Data repo/commit/path/hash identity remains in cutoff and source evidence. `source_as_of` is `null`; neither a commit clock nor an upstream package generation clock is relabeled as football domain time.

The package-level admission receipt at `data/experiments/forwardRun1/forward_run1_package_admission_evidence_v1.json` binds all three runtime hashes, the two exact scoring-input IDs/hashes, the raw Data reconciliation artifact, the profile-equivalence decision, and content hashes of the two operator comments. Package full-file hashes remain in the top-level binding/report to avoid a self-hash cycle.

## New policy bindings

### Census eligibility

Artifact: `data/experiments/forwardRun1/forward_run1_census_eligibility_policy_v1.json`

SHA-256: `dad50a5445cda84ac5c100ef27dcb50c0137ba0b74b0c8e1a007e2c914106766`

The policy preserves every row from the exact pinned census. A finite point forecast is allowed only when identity, position, eligibility, governance, cutoff, and required-feature checks all pass. Unresolved rows remain visible with typed unavailable states.

### Duplicate canonical identity

Artifact: `data/experiments/forwardRun1/forward_run1_duplicate_canonical_id_policy_v1.json`

SHA-256: `504206dc32c87758e0a5c6c0107e0cb886d891de0b37709c6818e639cf35df29`

The run must fail closed if more than one row resolves to the same canonical player ID. Unresolved source identities remain separate visible rows and are not guessed into a collision or join.

## Scoring reconciliation binding

The Forecast package-admission evidence is bound into the existing six-field Forecast `ScoringReconciliationEvidenceRef` shape as:

- `status: passed`
- `validator_id: tiber-forecast-run1-derived-component-scoring-binding`
- `validator_version: 1.0.0`
- exact local package-admission evidence path/hash
- Forecast scoring profile hash
- exact admitted historical-training and future-feature runtime package hashes

`source_input_sha256s` is the sorted pair `6e131681…`, `d91996ed…`. The raw Data artifact hash `d45f612b…` is deliberately not used as a substitute for either package hash. `passed` is scoped to the authorized target rule: every model target is derived from the eight governed components in exact cents. The 830 promoted `season_ppr` disagreements remain preserved provenance and are not used as target values.

The package-admission evidence separately pins the raw Data scoring manifest and cites `docs/decisions/scoring-profile-hash-equivalence-2026-07-28.md` as the required bridge between the Forecast and Data profile-definition hashes. The raw Data manifest remains provenance; it cannot by itself attest to wrapper-package hashes or Forecast run authority.

## Population expectation

The census contains 658 rows: 610 historical-offense rows and 48 rookie-transition rows. The binding does not remove the rookies or invent prior-season production. Because the frozen base model requires previous-season features, rookie rows are expected to remain visible with typed unavailable and/or identity-unresolved statuses during execution.

## Test-only fit-boundary probe

The production `runForwardCandidateService` and its direct pre-fit dependencies remain byte-identical to the frozen `813eff8…` code. The regression imports that unchanged service, replaces only `fitSeasonalForwardModel` with a unique throwing sentinel, and supplies the exact committed Run 1 input. Reaching the sentinel proves the timestamp, decision-freeze, package-pin, target-free inference, census, and scoring-reconciliation gates all passed through the existing runtime path.

The sentinel stops before model math begins. No fitted model, manifest, player row, or forecast artifact is constructed. Negative cases for a cutoff one millisecond too early, a millisecond-free timestamp, a missing selected scoring package, and substitution of the raw Data hash all return typed failures and prove the fit mock was never called. This is a test-only fit-boundary probe, not a successful Run 1 execution and not a new production validation API.

## Files

- `data/experiments/forwardRun1/forward_run1_admission_binding_v1.json`
- `data/experiments/forwardRun1/forward_run1_census_eligibility_policy_v1.json`
- `data/experiments/forwardRun1/forward_run1_duplicate_canonical_id_policy_v1.json`
- `data/experiments/forwardRun1/forward_run1_materialization_lock_v1.json`
- `data/experiments/forwardRun1/forward_run1_package_admission_evidence_v1.json`
- `data/experiments/forwardRun1/forward_run1_historical_training_package_v1.json`
- `data/experiments/forwardRun1/forward_run1_future_feature_package_v1.json`
- `data/experiments/forwardRun1/forward_run1_population_census_package_v1.json`
- `docs/reports/forward-run1-admission-binding-2026-08-02.md`
- `scripts/buildForwardRun1AdmissionPackages.ts`
- `src/experiments/forwardRun1/forwardRun1AdmissionBinding.ts`
- `tests/forwardRun1AdmissionBinding.test.ts`

## Boundaries

No model math, production runtime code, configuration, scoring semantics, source bytes, census membership, emitted-manifest schema, or candidate safety literal was changed. No cross-repository write occurred. No forecast was fit or emitted. No output was promoted, deployed, published, consumed, ranked, or interpreted as advice.
