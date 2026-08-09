# Weekly Forecast publication contract (2026 Week 1)

**Tracker:** [TIBER-Forecast #176](https://github.com/Prometheus-Frameworks/TIBER-Forecast/issues/176)
**Contract:** `src/contracts/weeklyForecastPublication.ts`
**Fixture:** `data/fixtures/weekly-forecast-publication/2026-week-01.example.*.json`
**Build:** `npx tsx scripts/buildWeek1PublicationFixture.ts` (`--check` verifies without writing)

> **Status: contract and fixture only.** Nothing here runs a model, trains
> anything, produces a real candidate, promotes an artifact, enables TIBER-Fantasy
> consumption, or deploys. Those remain separately operator-gated.

## Why this exists

TIBER-Fantasy's forward weekly surface needs something to consume before the
2026 season starts, and nothing governed can fill that slot today.

Fantasy's in-season scoring preference requires meaningful current-season
observations for most of a cohort — `games_sampled >= 2` plus a positive
opportunity signal, across `>= max(10, 0.6n)` of the cohort. Before Week 1 there
are **zero** current-season observations, so that gate is structurally
unsatisfiable. Weakening it would not produce a legitimate preseason forecast; it
would just relabel an empty evidence base.

This contract therefore defines a **separate governed preseason admission path**
and leaves the in-season gate exactly as it is.

## Lineage

This repository is the renamed Point-prediction-Model. The legacy package name
(`point-prediction-model` in `package.json`), route names, code symbols, and the
`SCORING_SERVICE_BASE_URL` integration variable in TIBER-Fantasy remain for
backward compatibility. [Fantasy PR #123](https://github.com/Prometheus-Frameworks/TIBER-Fantasy/pull/123)
already wired this service lineage into Fantasy's weekly rankings.

**This contract extends that existing lineage. It does not create a competing
producer and does not swap repositories.**

## Ownership boundaries

| Repo | Owns |
|---|---|
| **TIBER-Data** | source truth, canonical identity, realized outcomes, census semantics, provenance |
| **TIBER-Forecast** | forecast method, inference output, model/config identity, publication manifest |
| **TIBER-Fantasy** | consumer admission and presentation |
| **TIBER-FORGE** | deterministic football interpretation — explanatory only, **never** the truth label |

Census scope is **referenced, not redefined**: the manifest points at a governed
TIBER-Data census artifact and reconciles against it
(`population_census.semantics_owner` / `semantics_ref` → TIBER-Data#227).

## Admissible preseason input classes

Each class carries its own availability rule, evaluated against the declared
`forecast_cutoff` under `fact_available_at <= forecast_cutoff`.

| Input class | Availability rule | Required | Owner |
|---|---|---|---|
| `prior_season_realized_outcomes` | `prior_season_final_and_governed` | yes | TIBER-Data |
| `prior_season_usage_and_role` | `prior_season_final_and_governed` | yes | TIBER-Data |
| `depth_chart_and_role_priors` | `state_effective_at_or_before_cutoff` | no | TIBER-Data |
| `roster_and_team_assignment_state` | `state_effective_at_or_before_cutoff` | yes | TIBER-Data |
| `schedule_and_opponent_context` | `published_at_or_before_cutoff` | no | TIBER-Data |
| `player_availability_status` | `state_effective_at_or_before_cutoff` | no | TIBER-Data |

**Prohibited before kickoff** — admitting any of these is leakage by definition:
`current_season_realized_outcomes`, `current_season_usage_and_role`,
`target_week_in_game_facts`.

The validator rejects a prohibited class, any input reporting records after the
cutoff, and any input whose availability evidence is unresolved. Unresolved is
**not** treated as eligible.

## What a publication must declare

- target season and target NFL scoring week, with `target_kind:
  'single_scoring_week'` and `is_seasonal_total: false`;
- `forecast_cutoff` and `generated_at` as **separate** fields;
- the admissible input classes and their availability rules;
- scoring profile (`tiber-generic-full-ppr-v1`) and rank basis;
- canonical player identifier plus retained source identity evidence;
- census reference, scope, coverage counts, and typed unavailable reasons;
- source artifact refs and content hashes;
- model, feature-configuration, and scoring-profile hashes;
- point and range fields with an explicit uncertainty status;
- lifecycle state, admission record, and consumer eligibility;
- deterministic artifact and manifest digests.

### Uncertainty

Range fields exist in the schema but are **null unless independently
calibrated**. No floor, ceiling, median, band, or interval may be synthesised.
`unavailable_not_calibrated` is the honest default and the only status this
contract's first publication may carry. The validator rejects a populated range
on an uncalibrated row.

### Rank basis and #265

`rank_basis` is `expected_generic_full_ppr_points_week`. It is deliberately
**not** "Expected Points" — [Fantasy #265](https://github.com/Prometheus-Frameworks/TIBER-Fantasy/issues/265)
reserves that phrase for EPA. Product-facing translation ("Point Projection",
"Modeled Range") happens at the Fantasy adapter seam; "Forecast" stays explicitly
scoped to this artifact type and lifecycle rather than used as loose product
language.

## Lifecycle — fail closed

```
draft → candidate → reviewed → admitted
                              ↘ superseded / withdrawn
```

`consumer_eligibility` defaults to `not_eligible_pending_admission`.

`isWeeklyPublicationConsumable()` is a conjunction, so a partially-filled record
can never read as eligible. **All** of the following must hold:

- `state === 'admitted'`
- `consumer_eligibility === 'eligible_admitted'`
- `admission.decided_by`, `decided_at`, `decision_ref` all present
- `admission.admission_path === 'governed_preseason_publication'`
- `admission.in_season_gate_weakened === false`

Admission via `meaningful_current_season_inputs` is **not** a valid route for a
preseason publication — that is the in-season gate, and it is untouched.

## Census reconciliation

Every census row maps to exactly one output row **or** a typed unavailable
status. Status counts sum to the census row count; duplicates, missing rows, and
extra rows are all rejected.

Rows that cannot receive a forecast stay **visible and unranked** with typed
reasons — `no_prior_season_history`, `identity_unresolved`,
`roster_state_unresolved`, and so on. Nothing is silently dropped.

Identity resolution is exact. `fuzzy_join_used` and `synthetic_namespace_used`
are literal `false` in the type and enforced by the validator.

## Reliability tracking

Scored against **realized weekly PPR outcomes owned by TIBER-Data**. FORGE may
supply explanatory context for a miss but is never the truth label —
`forge_is_truth_label: false` is a literal, not a convention.

Scoring happens only after the target week is played; `actual_outcome` must be
`null` at publication time, and the validator rejects a populated one.

## Relationship to the parked seasonal candidate

`WEEKLY_SEASONAL_CANDIDATE_BOUNDARY` states the #167/#170 relationship in
machine-readable form: **disjoint**, and may not be relabelled, promoted, or
consumed through this contract. That candidate is seasonal, point-only,
`candidate_only`, `non_promotable`, `consumer_eligibility: never` — it is not a
weekly publication and is not an input to one.

## Determinism

`canonicalForwardJson` / `canonicalForwardJsonSha256` (`tiber-canonical-json-v1`).

- `digests.player_rows_sha256` — digest of the canonical rows artifact.
- `digests.manifest_sha256` — digest of the manifest with the digest block excluded.

The fixture builder reads no clock, no randomness, and no network; every
timestamp is a declared constant. Repeated runs produce byte-identical output.

Current fixture digests:

```
manifest_sha256    = 6f988119edb85b98d95320d83709d7bd6538176fdba37433a974b9fa424302af
player_rows_sha256 = 4eff1672264a7f9ce728509e1d09c397904baceb5eb25ad4af3509c666486306
```

## Review summary — the shipped fixture

| | |
|---|---|
| document | `weekly-fantasy-point-forecast-publication-v1-**example**` |
| target | 2026 Week 1, single scoring week, generic full PPR, `league_specific: false` |
| cohort | 4 census rows |
| coverage | 2 `forecast_available`, 1 `no_prior_season_history`, 1 `identity_unresolved` |
| identity | 3 resolved / 1 unresolved (coverage 0.75); no fuzzy join, no synthetic namespace |
| point/range | point-only; every range field null (`unavailable_not_calibrated`) |
| lifecycle | `draft`, `not_eligible_pending_admission`, no admission record |
| cutoff | `2026-09-09T00:00:00Z`, distinct from `generated_at` `2026-09-09T12:00:00Z` |

**Limitations, stated on the artifact itself:** schema example only — not a real
publication, not a candidate, not consumable. Input, census, and model hashes are
placeholders. The illustrative values exercise the contract; they assert no
football claim.

`isWeeklySchemaExampleDocument()` returns `true` for it and
`isWeeklyPublicationDocument()` returns `false`, so a consumer refuses it.

## The Fantasy consumer seam

`tests/weeklyForecastPublication.test.ts` models the decision Fantasy has to
make. The load-bearing property: **refusal never falls back to FORGE.**

| input | decision |
|---|---|
| schema example | refuse — `schema_example_not_a_publication` |
| unrecognised artifact | refuse — `unrecognised_artifact` |
| contract-invalid | refuse — `contract_invalid` |
| real but unadmitted | refuse — `not_consumer_eligible` |
| real, valid, admitted | admit — `source: 'forecast_weekly_publication'` |

Every refusal yields `source: null`. A test asserts the decision object never
contains the string `forge` in any refusal path — an unavailable Forecast
publication produces an explicit unavailable state, never a silent substitution.

## What still requires an operator

1. A real governed TIBER-Data Week 1 census artifact and real input hashes.
2. A model/configuration decision for weekly inference — none is made here.
3. Execution authorization. This contract does not authorize running
   Forecast #170 or any forward run.
4. The reviewed admission decision that would move a publication to
   `admitted` / `eligible_admitted`.
5. The corresponding Fantasy-side consumer work (#307 Phase B), which is gated
   separately.
