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
- model, feature-configuration, scoring-profile, fitted-model, and exact
  Forecast implementation commit/evidence hashes;
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

## Admission is a separately pinned receipt

An earlier revision put a mutable `lifecycle.admission` block **inside** the
manifest. That was self-inconsistent: the manifest is content-hashed, so editing
the admission record to admit a publication invalidated the very digest that
identifies it — and eligibility could be flipped by hand.

Admission is therefore a **separate, content-addressed receipt**
(`WeeklyAdmissionReceipt`) that binds to an exact `manifest_sha256` **and**
`player_rows_sha256`. The receipt cannot establish its own authority. The
consumer must also load a `WeeklyTrustedAdmissionBinding` from governed
configuration or a separately governed binding artifact. That binding pins the
expected digest of the **whole receipt**, the authority identity/repository, and
the exact non-null hashed decision reference. None of those values may be
derived from request bytes.

This follows the house trust pattern established on `main` at
`src/experiments/forwardRun1/forwardRun1AdmissionBinding.ts`: an exact external
operator decision and artifact digest are load-bearing, rather than a caller's
self-description.

What a manifest may declare about itself:

- `lifecycle.state` — `draft` or `candidate` only;
- `lifecycle.consumer_eligibility` — the literal
  `not_eligible_pending_admission`, and nothing else;
- `lifecycle.admission_requires_receipt: true`.

A manifest that self-declares `eligible_admitted` is rejected
(`manifest_lifecycle_claims_eligibility`).

A receipt is honoured only when **all** of the following hold:

- `consumer_eligibility === 'eligible_admitted'`;
- `admission_path === 'governed_preseason_publication'`;
- `in_season_gate_weakened === false`;
- `publication_id` matches the manifest;
- `manifest_sha256` equals `weeklyManifestSha256(manifest)`;
- `player_rows_sha256` equals the digest of the supplied rows;
- `weeklyAdmissionReceiptSha256(receipt)` equals the consumer-owned expected
  receipt digest;
- receipt authority and decision-ref identity exactly match the external pin;
- `decision_ref.content_sha256` and `record_id` are non-null, and `decided_at`
  is a canonical instant no earlier than manifest generation **and no later
  than `WEEKLY_WEEK1_PREKICKOFF_DEADLINE_UTC`**;
- no example marker or placeholder hash appears anywhere in the real receipt.

`WEEKLY_WEEK1_PREKICKOFF_DEADLINE_UTC` is `2026-09-10T20:00:00.000Z`. It is a
policy boundary owned by this contract, not an ingested schedule; a real
publication whose governed schedule disagrees must amend the constant
deliberately rather than declare its own deadline.

The upper bound matters as much as the lower one. `forecast_cutoff` and
`generated_at` are the manifest's own self-declared timestamps, so capping only
those caps nothing an author controls. The receipt is the first independently
trusted binding of the manifest and row bytes; leaving its decision uncapped
would let a document authored after Week 1 was played carry backdated manifest
timestamps and still be admitted through the preseason path.

Consequence: mutating any manifest field, row, score, or receipt breaks an
unchanged trusted binding and the consumer refuses. Merely regenerating a
matching receipt is still refused. Re-admission requires both a new receipt and
an intentional, separately governed update of the consumer's expected receipt
digest — a fresh operator decision by design.

Admission via `meaningful_current_season_inputs` is **not** a valid route for a
preseason publication — that is the in-season gate, and it is untouched.

## The document may not weaken its own policy

`WEEKLY_CANONICAL_INPUT_CLASS_RULES`, `WEEKLY_PROHIBITED_PRESEASON_INPUT_CLASSES`
and `WEEKLY_SEASONAL_CANDIDATE_BOUNDARY` are frozen constants. A publication
*declares* them, and the validator compares the declaration against the canonical
value by digest. A document that shipped a relaxed rule set, an emptied
prohibited list, or an alternate seasonal boundary is rejected
(`policy_input_rules_altered`, `policy_prohibited_list_altered`,
`policy_seasonal_boundary_altered`).

Every class marked `required: true` must have a matching artifact input, or
`required_input_class_missing` fires. Duplicate input ids, duplicate input
classes, arbitrary extra classes, and rows referencing undeclared input ids are
all rejected. Each input instance must exactly match its canonical rule's owner
repository, availability-rule id, timestamp locator, and normalization-rule id;
declaring a sound policy while instantiating a weaker rule is rejected.

## Nothing self-reported is taken as verification

- `cutoff_evidence.self_reported_status` is named for what it is: a producer
  claim. The validator performs its **own** comparison of each input's
  `source_as_of` against `forecast_cutoff`. A post-cutoff source is rejected
  even when the producer claims `eligible`.
- `cutoff_evidence.record_level_verification` defaults to
  `unverified_requires_source_bytes`. That honest status is allowed on the
  explicitly non-admissible schema example, but it always rejects a real
  publication. `locally_verified` is accepted only with structured
  `record_level_input_evidence` that exactly rebinds input id, content SHA,
  owner repository and commit, forecast cutoff, source/effective timestamps,
  eligible/post-cutoff/unresolved counts, and a content-addressed verification
  artifact. An id-only allowlist is not evidence.
- Census membership cannot be proven by a reference plus a self-declared
  `one_to_one_complete`. Without `context.census`, validation reports
  `census_membership_unverified` and admission is refused.
- `status_counts`, `identity_coverage`, and reconciliation are **recomputed from
  the supplied rows** and compared by digest; a manifest that misreports them is
  rejected.
- An empty rows array can never satisfy a manifest claiming a non-empty census.
- The census `effective_at` is independently checked against the forecast
  cutoff; a future census is rejected.

All three untrusted-document parsers recurse through their nested arrays and
objects before returning typed values. Malformed shapes such as
`artifact_inputs: [null]` or a partial reconciliation object return
`malformed_document`; they never reach semantic code that dereferences a missing
field.

## A schema example cannot become a real publication

Relabelling `artifact_version` is not enough. A real publication must contain no
example markers (`example://`, `-example`, `placeholder`, "not a real
publication", …), no placeholder hashes (64 repeated characters), and no
placeholder commit SHAs (40 zeroes). Those checks are skipped for documents that
honestly declare themselves examples.

## Row-level rules

Available rows require a resolved canonical identity, a finite point forecast, a
finite positive integer rank, and use of every required input. Ranks must be
unique, contiguous `1..N`, and consistent with the documented ordering
(`WEEKLY_RANK_ORDERING_RULE`: point forecast descending, ties broken by canonical
player id ascending). Unavailable rows carry no rank or point forecast and at
least one typed reason.

### An unavailability reason loses to the evidence

A typed reason is not merely a well-formed string: it is a **claim about the
evidence**, and the validator checks it against the evidence rather than
accepting it.

Without this, marking a row unavailable is a way to delete a governed player.
The publisher clears the forecast and rank, attaches a plausible reason,
renumbers the survivors, and recomputes every status count, digest, receipt and
trusted binding. The document is then completely self-consistent — and one
player the governed census requires has been silently removed from the
rankings. Every structural check passes, because nothing structural is wrong.

So each reason is bound to whatever independently verifies it:

| Reason | Rejected when |
| --- | --- |
| `identity_unresolved`, `identity_conflicting` | the verified census resolves the row to a canonical id, or the row itself declares `identity_status: 'resolved'` |
| `unavailable_missing_required_inputs` | every required input carries verified membership **and** all of them hold an eligible record for the row |
| `no_prior_season_history` | a verified `prior_season_realized_outcomes` or `prior_season_usage_and_role` input holds an eligible record for the row |
| `unsupported_position_domain` | the **verified census** assigns the row a supported offensive position |

Two statuses are **categorically inadmissible**, for the same reason
`calibrated` uncertainty is: this contract carries no evidence that could
confirm or refute them in either direction, and a status whose truth cannot be
verified is not a reason — it is a free suppression channel. A publisher could
otherwise mark every row with one of them, recompute the counts, digests,
receipt and trusted binding, and admit a publication containing no rankings.

| Status | Refused because | Admitting it would require |
| --- | --- | --- |
| `population_ineligible` | census membership implies nothing about eligibility — the census is deliberately broad and *includes* ineligible records — and nothing else in the document speaks to it | a governed eligibility decision carried in the verification context |
| `roster_state_unresolved` | membership in the roster input establishes only that a *timely* record exists; the governed row shape explicitly admits `team_assignment_status: unknown \| unavailable`, so a record can be present while the state is genuinely unresolved | the verified `team_assignment_status` of that record |

Two further trust anchors are consumer-owned rather than manifest-derived.

**Each required input class is pinned independently.** Verifying the exact bytes
the publisher selected proves only that those bytes are what they claim — not
that they are the source that *should* have been used. Where several eligible
TIBER-Data artifacts, versions or subsets exist, an incomplete one could be
chosen, truthfully verified, and the omitted players marked
`unavailable_missing_required_inputs`, with every membership check passing
because the membership genuinely lacks them. `expected_input_identities` pins
owner repository, path and digest for **every** admitted input class.

An earlier revision pinned only the required classes, reasoning that optional
ones cannot justify an unavailable status. That is true and beside the point:
depth-chart, schedule and availability inputs feed the model, so a stale but
cutoff-eligible snapshot moves projections and ranks while verifying perfectly.
Inability to suppress a player is not inability to change the forecast.

**Scoring reconciliation is verified, not declared.** The manifest otherwise
sets its own `status: 'passed'`, repeats its own input hashes, and cites any
syntactically valid reference. A real publication must supply
`verified_scoring_reconciliation` carrying the verified result, the exact
evidence digest the manifest cites, the canonical profile digest, and the input
digests that artifact actually covers. That last field is what stops a genuine
`passed` reconciliation for one input set being cited for another — the
manifest's own coverage copy sits on both sides of the earlier comparison, so it
cannot detect the substitution. It remains load-bearing even now that every
input is pinned: the pins establish which artifact was used, this establishes
that the reconciliation actually covers it.

**The model execution is verified, not declared.** Model identity is otherwise
checked for shape alone — any well-formed commit and digest passes — so a
correctly pinned authority receipt could admit arbitrary projections labelled
`model-inference`. A real publication must supply `verified_model_execution`
reporting success for the exact model, configuration, features and fitted
artifact, consuming exactly the admitted inputs, and producing exactly the
published rows digest. That last binding is what stops a genuine run being cited
while the rows are substituted afterwards.

The verification context also carries the census's own `effective_at`, read from
the exact bytes. The manifest duplicates that value and the duplicate must match;
the cutoff comparison uses the **verified** instant. Without that binding a
census produced after the cutoff could be pinned while the manifest backdated
its copy — admitting post-cutoff membership, identities and positions.

`unsupported_position_domain` is judged against the census, never the row's own
declaration. Position is governed census data (`"<cutoff-bound position |
unknown>"`), and the verification context carries it as `positions_by_row_id`;
every row's declared position must equal the verified value. Without that
binding a resolved WR could be relabelled `K`, making the row internally
consistent and suppressing it — and repeating that across the population empties
the rankings on assertion alone. Where the census records the position as
unknown the status is refused as unverifiable rather than assumed true.

Two limits are deliberate. **Absence of evidence stays silent**: where an input
does not claim `locally_verified`, or claims it and supplies no membership, the
row's claim is undecidable and is not rejected on suspicion — such a document is
already inadmissible on the unverified-input ground, which is the honest reason.
And for `unavailable_missing_required_inputs` the check abstains unless *every*
required input is verified, because an unverified one could genuinely be the
missing one.

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
- `weeklyManifestSha256(manifest)` — digest of the **whole** manifest. The
  manifest deliberately carries no digest of itself; the previous
  "manifest minus its digest block" arrangement was the source of the
  self-referential inconsistency.
- `weeklyAdmissionReceiptSha256(receipt)` — digest of the **whole** receipt,
  compared with an externally supplied expected digest. The receipt contains no
  digest of itself.

The fixture builder reads no clock, no randomness, and no network; every
timestamp is a declared constant. Repeated runs produce byte-identical output.

Current fixture digests:

```
manifest_sha256    = 0cb6de658a835e0f6c39d7684ba783b17b080a888d5ff11c7e9af0700591561f
player_rows_sha256 = 198aaf3e7c0b4f31d0c92d2b76a7e18d814afab8c655181e9281b1cd578821dc
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
| lifecycle | `draft`, `not_eligible_pending_admission`, admission requires a receipt |
| source-byte verification | explicitly `unverified_requires_source_bytes`; truthful for an example and therefore non-admissible |
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

`admitWeeklyPublication()` accepts `unknown` for all three documents and never
throws.

| input | decision |
|---|---|
| malformed manifest / rows bytes | refuse — `manifest_malformed` / `rows_malformed` |
| schema example | refuse — `schema_example_not_a_publication` |
| unrecognised artifact | refuse — `unrecognised_artifact` |
| contract-invalid (incl. unverified census/input bytes) | refuse — `contract_invalid` |
| no / malformed receipt | refuse — `admission_receipt_missing_or_malformed` |
| no independently configured authority binding | refuse — `trusted_admission_binding_missing` |
| receipt digest differs from configured pin (including a freshly self-minted replacement) | refuse — `receipt_not_trusted` |
| externally pinned receipt still contains example/placeholder material | refuse — `receipt_example_or_placeholder_content` |
| receipt for another publication | refuse — `receipt_publication_id_mismatch` |
| receipt via the in-season path | refuse — `receipt_wrong_admission_path` |
| receipt admitting a weakened gate | refuse — `receipt_weakened_in_season_gate` |
| manifest or rows edited after issue | refuse — `receipt_manifest_digest_mismatch` / `receipt_rows_digest_mismatch` |
| real, valid, receipt-bound **and externally pinned** | admit — `source: 'forecast_weekly_publication'` |

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
