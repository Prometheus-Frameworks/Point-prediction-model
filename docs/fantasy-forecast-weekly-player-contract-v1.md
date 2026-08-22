# Fantasy ↔ Forecast weekly-player contract v1 (FFI-1)

Status: **contract + golden fixtures only** — no runtime, auth, model, or
deployment behavior changed. Defined under TIBER-Forecast #182 as the first
slice of the interface-hardening program in TIBER-Ops #71 (FFI-0 census,
2026-08-22).

The seam this contract proves offline:

```text
canonical weekly-player request fixture
  → Forecast validation semantics = PASS
  → canonical Forecast weekly-player-card response fixture
  → Fantasy can later consume without changing horizon or meaning
```

## Physical custody decision

**Form: TypeScript contract module in Forecast + frozen, digest-pinned JSON
Schema and JSON fixtures.**

- Single semantic source: `src/contracts/fantasyForecastWeeklyPlayerV1.ts`.
  The frozen JSON under `data/contracts/fantasyForecastWeeklyPlayerV1/` is
  generated from it by `scripts/generateFantasyForecastWeeklyPlayerContractV1.ts`
  (`npm run generate:fantasy-forecast-weekly-player-contract-v1`; `--check`
  verifies without writing). Tests fail if the frozen bytes drift from the
  source.
- Bytes are canonical and hashable: serialized with the repository's existing
  `canonicalForwardJsonBytes` (UTF-8, sorted keys, compact, single trailing
  LF) and recorded with sha256 digests in `manifest.v1.json`.
- Forecast remains the semantic owner. TIBER-Fantasy later vendors the frozen
  schema/fixture bytes at an exact version/digest and verifies its adapter
  against them — no runtime dependency on a Forecast checkout, and no second
  handwritten semantic schema.
- The valid response card is **not handwritten**: it is produced by the actual
  scoring services (`scoreWeeklyPlayerService`, `toTiberWeeklyPlayerCard`)
  with a pinned fixture clock, so the fixture can never disagree with what the
  engine actually computes at this version. The same applies to the ROS card
  inside the semantic-regression fixture (`scoreRosService`).

Rejected alternatives: hand-maintained duplicate types in both repositories
(the current failure mode FFI-0 identified), and an external JSON Schema
validator dependency (new dependencies are out of FFI-1 scope; instead the
schemas are constrained to a small keyword subset enforced by
`src/validation/validateJsonSchemaSubset.ts`, which **fails closed** on any
keyword it cannot enforce — the whole schema tree is asserted up front, so an
unsupported keyword cannot hide in a subschema the current instance happens
not to reach).

## Contract objects

### `FantasyForecastWeeklyPlayerRequestV1`

Frozen schema: `fantasy_forecast_weekly_player_request.v1.schema.json`
(`contract: fantasy_forecast.weekly_player_request`, `contract_version: 1.0.0`).

- **Identity**: `contract`, `contract_version`, and `horizon: "weekly"` are
  required constants — a request cannot exist without declaring its horizon.
- **Clock/context**: top-level `season` (2000–2100) and `week` (1–18) are
  required and are the **only** horizon source: per-player `week`/`season` are
  rejected outright (schema `false`) on `players` and `comparison_pool` alike.
  This makes a horizon-divergent comparison pool — which feeds the replacement
  baseline once the combined pool reaches eight players — impossible from the
  frozen schema bytes alone, with no reliance on a TypeScript helper.
- **Scoring identity**: `scoring_profile` is the constant
  `tiber-generic-full-ppr-v1` — the repository's pinned scoring profile
  (`src/contracts/genericFullPprProfile.ts`); its sha256 is recorded in the
  manifest. The current kernel implements exactly one profile, so the contract
  declares that instead of pretending configurability.
- **Player**: `players` is a one-element array (the player-card operation is
  mechanically single-player, replacing today's route-level length check).
  Required identity: non-empty `player_id` (canonical TIBER id; GSIS-style in
  production), `player_name`, `team`, supported `position` (QB/RB/WR/TE), and
  integer `games_sampled` 0–30. Required strings must contain at least one
  non-whitespace character (`pattern: \S`), mirroring the runtime validator's
  trim-then-check rule. Optional opportunity fields carry exactly the runtime
  validator's bounds: rates/shares 0–1, per-game volumes 0–100, signed
  per-attempt yardage −20–60.
- **League replacement context**: `league_context.teams` (2–32) and
  `starters.QB/RB/WR/TE` (0–10, `FLEX` optional) are required — this is the
  context Fantasy omits today and Forecast needs for replacement/VORP.
  Optional `flex_allocation` (RB/WR/TE shares 0–1) and `replacement_buffer`
  only because Forecast actually supports them. `comparison_pool` and
  `replacement_points_override` are optional as in the runtime.
- **Extensibility rule: unknown request fields are REJECTED** (fail closed,
  `additionalProperties: false` at every level). `remaining_weeks` and
  `scoring_mode` are additionally rejected by name: ROS vocabulary cannot
  ride on the weekly seam.
- **Zero vs null vs omitted**: `0` is an observed zero; omission means
  "not sampled/unknown"; `null` is never valid anywhere in the request.

### `FantasyForecastWeeklyPlayerCardV1` and its response envelope

Frozen schema: `fantasy_forecast_weekly_player_card_response.v1.schema.json`
(`contract: fantasy_forecast.weekly_player_card_response`, card
`contract: fantasy_forecast.weekly_player_card`, both `1.0.0`).

The envelope is a strict two-branch `oneOf`:

1. **Success**: `ok: true`, empty `errors`, `data.card` present.
2. **Unavailable/stale/rejected**: `ok: false`, at least one machine-readable
   `{code, message}` error, and `data` forbidden. Unavailability is always
   this explicit failure state — never a card with zeroed or nulled values —
   so zero, null, omitted, unavailable, stale, and malformed stay mechanically
   distinguishable. Reserved codes: `WEEKLY_PLAYER_CARD_UNAVAILABLE` (error),
   `STALE_SOURCE_WINDOW` (warning). Staleness beyond that is consumer policy
   over `generated_at`.

The card requires: contract identity; player identity (`player_id`,
`player_name`, `team`, `position`); `season` + `week`; `scoring_profile`;
**weekly** `expected_points`, `replacement_points`, `vorp`,
`floor`/`median`/`ceiling`; `confidence_band` (LOW/MEDIUM/HIGH);
`volatility_tag` (STABLE/MODERATE/VOLATILE); `fragility_tag`
(LOW/MEDIUM/HIGH); `weekly_outlook`, `role_summary`, `value_summary`,
`role_notes`; `scoring_components` (mirror of the six numbers, enforced by
`checkFantasyForecastWeeklyPlayerCardV1Invariants` along with the range rule
and the VORP identity); `generated_at` (canonical ISO-8601 UTC — the frozen
schema pattern is calendar-shaped, and the reference validator additionally
round-trips the value through Date parsing so impossible instants like
Feb 30 are rejected); `scoring_mode: "weekly"`; `view_type: "player_card"`.

Range rule, mirroring the current engine exactly: `median` must equal
`expected_points` under the engine's 2-decimal rounding (that is how
`calculateRangeProfile` computes it, so a drifted central projection is
corruption even when it stays inside the bracket); for non-negative
projections `floor ≤ median ≤ ceiling`; for a negative projection the engine's
multiplicative downside/upside factors invert the bracket ends, so the
invariant is that the median lies within the floor/ceiling bracket. FFI-1
records that corner rather than changing scoring math; renaming/reordering the
negative bracket is an FFI-2+ question.

The exported reference validators
`validateFantasyForecastWeeklyPlayerRequestV1` /
`validateFantasyForecastWeeklyPlayerCardResponseV1` are the documented
validation path for TypeScript consumers: frozen schema check plus the
cross-field card invariants the schema subset cannot express. Frozen-bytes
consumers get every request-side rule from the schema alone.

Card point/VORP/range fields are typed as finite numbers with **no magnitude
bounds**: the scoring kernel does not clamp its outputs, so any request the
contract admits must yield a card the contract admits — inventing tighter
response bounds would let a contract-valid request produce a contract-invalid
card. (The 0–100 bound on the request's `replacement_points_override` stays,
because the runtime request validator enforces exactly that.)

**Weekly can never be consumed as ROS**, mechanically:

- `scoring_mode` is the constant `"weekly"` — a ROS card fails on it;
- the reserved ROS names `ros_expected_points`, `ros_vorp`, `ros_summary`,
  and `remaining_weeks` are rejected outright on the weekly card
  (schema `false`), so stripping the tag is not enough either;
- a bare numeric `expected_points` therefore can never satisfy the contract
  on its own — horizon is proven by required constants, not inferred from
  the presence of a number.

**Response extensibility**: unknown *non-reserved* card fields are tolerated
and must be ignored by consumers (additive minor-version evolution); the
envelope itself is strict. Breaking changes require a new
`contract_version` and new digests.

## Golden fixtures

All under `data/contracts/fantasyForecastWeeklyPlayerV1/fixtures/`, expected
outcomes recorded in `manifest.v1.json`:

| # | Fixture | Validates against | Expected |
| --- | --- | --- | --- |
| 1 | `valid_weekly_player_request` | request schema | accept |
| 2 | `invalid_missing_required_league_context` | request schema | reject |
| 3 | `invalid_null_or_unsupported_player_identity` | request schema | reject |
| 4 | `valid_weekly_player_card_response` | response schema | accept |
| 5 | `weekly_player_card_unavailable_or_stale_state` | response schema | accept (well-formed failure state) |
| 6 | `invalid_malformed_weekly_player_card_response` | response schema | reject |
| 7 | `semantic_regression_weekly_must_not_be_ros` | response schema | reject |

Fixture 2 is byte-frozen evidence of the actual defect: it is the
league context TIBER-Fantasy's `toUpstreamLeagueContext()` emits today
(Fantasy `9e5f2b41`). Fixture 7 is a real, engine-produced ROS card wrapped
in a weekly-response envelope. All fixture clocks are pinned to
`2026-08-22T00:00:00.000Z` for byte determinism.

## Validation coverage

`tests/fantasyForecastWeeklyPlayerContractV1.test.ts` proves, deterministically
and offline:

- frozen bytes are reproducible from the source module and match the manifest
  digests;
- each of the seven fixtures produces its expected outcome against the frozen
  schema bytes, with specific rejection reasons asserted;
- the valid request passes the **current runtime validator**
  (`validateWeeklyScoringRequest`) and the live in-process route
  `POST /api/tiber/weekly/player-card`; both invalid request fixtures are
  rejected by both;
- the live route's card equals the frozen card minus the declared FFI-2 debt
  fields (clock aside) — the debt delta is exact and nothing else;
- the weekly/ROS invariant survives adversarial edits (tag forged, ROS names
  stripped);
- zero, null, omitted, unavailable, and malformed remain distinguishable;
- the schema-subset validator fails closed on unsupported keywords.

## Known FFI-2 conformance debt (deliberate, not implemented here)

The current runtime differs from this contract in exactly these ways; making
runtime conform is FFI-2 scope and needs its own authorization:

1. The runtime card and envelope do not yet emit `contract`,
   `contract_version`, card `season`/`week`, or `scoring_profile`.
2. The runtime request validator ignores unknown fields instead of rejecting
   them, does not require top-level `contract`/`horizon`/`season`/`week`/
   `scoring_profile`, and enforces single-player at the route rather than in
   the request shape.
3. The runtime unavailable path returns `ok: false` envelopes without envelope
   contract identity.

Deferred to later phases: weekly rankings adoption (FFI-2+), Fantasy adapter
conformance and readiness repair (FFI-3), cross-repo fixture gates (FFI-4),
the ROS contract including `remaining_weeks`/Week-18 semantics (FFI-5), and
any auth/deployment activation (FFI-7, Forecast #179).
