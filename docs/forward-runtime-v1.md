# Forward seasonal runtime v1

This module set implements candidate-stage runtime and contract machinery for a
future seasonal fantasy-point forecast. It has not executed a 2026 forecast.
There is no default configuration, live-data loader, command, server route,
promotion path, or downstream consumer.

## Boundary

The runtime keeps three concerns separate:

1. `HistoricalForwardTrainingRowV1` is a labeled, historical row. Runtime
   validation requires a finite target, a historical origin, a target season
   before the final-fit season, exact frozen feature keys, and preserved source
   missingness.
2. `FutureForwardInferenceRowV1` is target-free. Runtime validation rejects
   target/actual fields, binds the row to exact run/configuration/input/census
   pins, and permits missing input only through the configuration's explicit
   frozen preprocessing policy.
3. `FittedSeasonalForwardRidgeArtifactV1` records the complete deterministic
   ridge replay state: ordered columns, coefficients, standardization values,
   category encoding, lambda, clamp, missingness transforms, training identity,
   and software/schema versions.

The fit uses the existing population-z-score and ridge normal-equations math.
This work does not select or approve a production feature family or model
configuration. A later authorized run must inject an independently frozen
configuration and its cutoff-eligible decision evidence.

The legacy historical trainer now fails before matrix math when any target is
null/non-finite or lambda is invalid. Valid historical behavior and artifacts
are unchanged.

## Scoring contract

`tiber-generic-full-ppr-v1` is immutable and generic, not league-specific:

- 1 point per reception;
- 0.1 per receiving or rushing yard;
- 6 per receiving or rushing touchdown;
- 0.04 per passing yard;
- 4 per passing touchdown;
- -2 per interception;
- no bonuses;
- regular season only;
- QB, RB, WR, and TE supported; IDP unsupported.

The canonical profile SHA-256 is
`a368b75bf5503558a4f664e0486e2c3cc75c01004d4527fd29ecaa1e247a6274`.
This profile is separate from the repository's other scoring helpers. It does
not claim that existing source totals conform. A succeeded execution requires
an exact, passed reconciliation reference binding this profile hash to the
admitted source-input hashes. League-specific or non-exact profile requests
fail closed.

## Candidate orchestration

`runForwardCandidateService` accepts only injected packages:

- historical training rows and frozen configuration;
- a declared bounded population census;
- future feature rows;
- exact input, scoring, and reconciliation evidence;
- cutoff context and code/configuration decision-freeze evidence;
- target and historical-evaluation metadata.

Every census `population_row_id` produces exactly one ledger row. The seven
possible primary outcomes are:

- `forecast_available`;
- `unavailable_missing_required_inputs`;
- `unsupported_position_domain`;
- `identity_unresolved`;
- `eligibility_unresolved`;
- `position_domain_unresolved`;
- `population_ineligible`.

Only a resolved, eligible, supported row with all required gates may reach
inference and receive a finite point. Every other row keeps null point/range
fields and at least one typed reason with evidence. IDP never reaches the
offensive model. `actual_outcome` is always null. The uncertainty state is
always `unavailable_not_calibrated`; no interval is synthesized.

Every succeeded manifest remains:

```text
candidate_only: true
production_ready: false
consumer_eligibility: never
output_kind: model-inference
```

These are contract literals, not caller options.

## Canonical bytes and validation

Forward JSON is UTF-8 with lexicographically ordered object keys, finite JSON
numbers, explicit nulls, and exactly one trailing LF. JSONL preserves its
caller-supplied array order and has one LF per non-empty row; the candidate
builder sorts player rows by ascending `population_row_id` before
serialization. Unsupported JavaScript values, sparse arrays, accessors,
non-plain objects, symbols, cycles, and non-finite numbers are rejected.

`validateForwardCandidate` starts from the exact three byte buffers rather than
trusting pre-parsed objects. It checks canonical reserialization, schemas,
safety literals, cutoff evidence, decision freezes, hashes and cross-artifact
pins, scoring reconciliation, fitted replay state, population census and
status counts, row uniqueness/completeness, forecast nullability, and the
always-null outcome boundary.

`writeForwardCandidateArtifacts` validates the complete bundle before writing.
Repeated writes of identical bytes are idempotent; an existing mismatched path
is refused. Local validation has no promotion authority.

## Activation boundary

Fixture-only tests exercise this machinery and determinism. They are not a run
authorization. A real candidate still requires the separately pinned live gate,
producer artifacts, model/configuration freeze, exact inclusive cutoff, and
operator authorization. Promotion, deployment, lifecycle state, Fantasy or
Strategy integration, and advice remain outside this runtime.
