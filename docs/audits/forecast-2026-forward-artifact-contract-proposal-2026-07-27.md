# Proposed 2026 forward seasonal artifact and consumer contract

> **Status:** proposal only; not implemented, approved, promoted, or consumable
> **Parent audit:** [`forecast-2026-forward-artifact-readiness-2026-07-27.md`](forecast-2026-forward-artifact-readiness-2026-07-27.md)
> **Sample:** [`forecast_2026_forward_manifest.sample.json`](../../data/fixtures/seasonalPpr/forecast_2026_forward_manifest.sample.json)

## 1. Purpose and non-goals

This proposal defines the smallest fail-closed envelope for a future generic-PPR
seasonal Forecast artifact. It separates:

- historical evidence and model selection;
- final fitting on approved historical rows;
- inference over an independent cutoff-bound population census;
- immutable candidate artifacts;
- detached validation, promotion, freshness, revocation, and supersession;
- later outcome grading;
- read-only downstream consumption.

It does not select model math, admit an input, authorize a run, produce player
forecasts, implement a Fantasy adapter, apply Strategy interpretation, calculate
advice, or approve promotion.

## 2. Artifact family and immutability

The proposed identities follow the repository's lowercase `artifact_type` plus
independent `artifact_version` convention:

| Artifact | `artifact_type` | Purpose |
| --- | --- | --- |
| Execution manifest | `seasonal_fantasy_point_forecast_manifest` | Immutable run identity, cutoff, inputs, configuration, census reconciliation, output refs |
| Player rows | `seasonal_fantasy_point_forecast_player` | One row for every source-census row, including unavailable and unsupported cases |
| Later grading | `seasonal_fantasy_point_forecast_grading` | Join completed actuals to a frozen forecast without modifying it |
| Validation attestation | `seasonal_fantasy_point_forecast_validation` | Detached validator result over exact candidate hashes |
| Promotion attestation | `seasonal_fantasy_point_forecast_promotion` | Detached operator/governance decision; may declare `production_ready` |
| Freshness attestation | `seasonal_fantasy_point_forecast_freshness` | Detached point-in-time `current`/`aging`/`stale`/`superseded`/`unavailable` evaluation |
| Revocation/supersession attestation | `seasonal_fantasy_point_forecast_lifecycle` | Append-only invalidation or successor relationship |

The manifest and player rows are content-addressed and never rewritten. A
candidate becomes reviewed or promoted only through a detached attestation that
references its exact manifest and output hashes. Later freshness checks append new
attestations; they do not edit old bytes. A release index or promoted wrapper may
point to the immutable candidate and its attestations.

`production_ready` is not a self-certified execution-manifest field. It may be
true only in a valid detached promotion attestation. The provided sample carries
`production_ready: false` solely as a schema-example rejection guard and is not an
execution manifest.

Schema examples and executions form a strict discriminated union:

| `document_kind` | Allowed `run_status` | Required behavior |
| --- | --- | --- |
| `schema_example` | `not_executed` | `sample_only: true`, null cutoff/model/source hashes, zero census/output rows, `consumer_eligibility: "never"` |
| `execution_manifest` | `succeeded` | Non-null cutoff/code/config/model/scoring/input/output refs; deterministic reconciliation; eligible for detached validation only |
| `execution_manifest` | `failed` | Non-null attempted run identity/cutoff plus failure record; no forecast output; never promotable |

The execution validator rejects any cross-variant field combination.

## 3. Proposed execution manifest

### 3.1 Identity and time

```jsonc
{
  "artifact_type": "seasonal_fantasy_point_forecast_manifest",
  "artifact_version": "seasonal-fantasy-point-forecast-manifest-v1",
  "document_kind": "execution_manifest",
  "run_status": "succeeded",
  "output_kind": "model-inference",
  "run_id": "seasonal-ppr-2026-forward-001",
  "target_season": 2026,
  "forecast_cutoff": "2026-08-01T16:00:00.000Z",
  "cutoff_rule": "fact_available_at <= forecast_cutoff",
  "generated_at": "2026-08-01T16:30:00.000Z",
  "repository": "Prometheus-Frameworks/TIBER-Forecast",
  "git_commit_sha": "<40-char commit>",
  "lane_name": "seasonal-fantasy-point-forecast",
  "lane_version": "<version>",
  "serialization": {
    "serializer_id": "<canonical serializer>",
    "serializer_version": "<version>"
  },
  "freshness_policy_refs": []
}
```

Rules:

- Every timestamp is a valid ISO-8601 UTC instant. The cutoff is inclusive as
  declared above.
- `forecast_cutoff` is when model knowledge stops; `generated_at` is operational.
  A later generation time never expands the cutoff.
- `source_as_of` describes the fact's domain time. It is not proof that the fact
  was knowable then. A source-specific rule normalizes record-level evidence to
  `fact_available_at`; the normalized instant plus reproducible evidence supplies
  that proof.
- A post-cutoff-created package may be used only when immutable archived evidence
  proves each used fact was available by the cutoff. A producer's asserted
  `cutoff_status` is never trusted without recomputation.
- Coarse season labels without reproducible availability timing remain unresolved
  and cannot enter an exact-cutoff run.

### 3.2 Target and evaluation design

```jsonc
{
  "target_definition": {
    "target_id": "<reviewed target identity>",
    "description": "full regular-season generic-PPR total",
    "target_season": 2026,
    "regular_season_only": true,
    "week_inclusion_rule": "<explicit rule>",
    "season_completeness_rule": "<explicit rule>",
    "aggregation_rule": "<explicit cumulative-vs-weekly reconciliation>",
    "scoring_profile_id": "<exact profile>",
    "outcome_field": "actual_outcome",
    "forward_outcome_must_be_null": true
  },
  "evaluation_design": {
    "design_id": "<frozen design>",
    "design_sha256": "<hash>",
    "historical_origins": [
      {
        "input_seasons": [],
        "target_season": 0,
        "origin_cutoff": "<UTC instant>",
        "input_artifact_sha256": "<hash>",
        "target_artifact_sha256": "<hash>"
      }
    ],
    "model_selection_partition": "<typed rule>",
    "final_evaluation_partition": "<typed disjoint rule>",
    "split_method": "<rolling-origin / player-level fold rule>",
    "fold_grouping": "<player/team/time grouping>",
    "hyperparameter_selection": "<train-only rule>",
    "final_origin_not_used_for_tuning": true,
    "baseline_definitions": []
  },
  "historical_validation_summary": {
    "evaluation_artifact_refs": [],
    "overall_metrics": {},
    "position_metrics": {},
    "calibration_metrics": {},
    "sanity_controls": [],
    "limitations": []
  }
}
```

All metrics in the immutable forward manifest are frozen historical-validation
summaries tied to exact evidence hashes. Completed 2026 metrics belong only in the
later grading artifact.

### 3.3 Model configuration and final fitted model

```jsonc
{
  "model": {
    "model_id": "<approved identity>",
    "model_version": "<version>",
    "configuration_sha256": "<canonical configuration hash>",
    "model_type": "ridge",
    "hyperparameters": { "lambda": 1 },
    "feature_set_id": "<approved feature set>",
    "feature_names_ordered": [],
    "admitted_capabilities": []
  },
  "final_fit": {
    "historical_row_count": 0,
    "historical_target_seasons": [],
    "training_population_sha256": "<hash>",
    "training_data_sha256": "<hash>",
    "model_artifact_ref": {
      "artifact_type": "seasonal_fantasy_point_forecast_fitted_model",
      "artifact_version": "<version>",
      "uri_or_path": "<immutable ref>",
      "content_sha256": "<hash>",
      "serialization_version": "<version>",
      "feature_names_ordered": [],
      "contains": [
        "intercept",
        "coefficients",
        "means",
        "standard_deviations",
        "lambda",
        "categorical_levels",
        "clamp_rule",
        "missingness_transforms",
        "training_identity"
      ]
    }
  }
}
```

The configuration hash covers ordered feature names, transformations, one-or-more
input lineage refs per derived feature, missingness and imputation behavior,
categorical levels, hyperparameters, clamp behavior, and software/schema versions.

Historical training rows and future inference rows are different runtime-validated
types. Training rejects null/non-finite targets. Inference rows do not expose a
training-target field. Model selection, transforms, and calibration use historical
folds only; the 2026 census cannot influence them.

### 3.4 Scoring profile

```jsonc
{
  "scoring_profile": {
    "profile_id": "tiber-generic-full-ppr-v1",
    "profile_version": "1.0.0",
    "profile_sha256": "<canonical profile hash>",
    "league_specific": false,
    "weights": {
      "reception": 1,
      "receiving_yard": 0.1,
      "receiving_touchdown": 6,
      "rushing_yard": 0.1,
      "rushing_touchdown": 6,
      "passing_yard": 0.04,
      "passing_touchdown": 4,
      "interception": -2
    },
    "bonuses": [],
    "supported_positions": ["QB", "RB", "WR", "TE"],
    "unsupported_domains": ["IDP"],
    "replacement_context": null,
    "source_reconciliation": {
      "status": "passed",
      "validator_id": "<validator>",
      "evidence_ref": "<component-vs-total reconciliation>"
    }
  }
}
```

The displayed weights are only a proposed generic profile. Current seasonal
loading trusts upstream `ppr_points`/`season_ppr`; the helper formula is not
enforced. A future run must pin the producer's scoring identity and reconcile
source totals against the declared components/rules, regular-season boundary, and
completeness policy.

This total-PPR result cannot be algebraically re-scored into a nonstandard league
total. Replacement and VORP remain null without exact league size, lineup,
eligibility, scoring, and reviewed seasonal methodology.

### 3.5 Inputs, governance, admission, and cutoff proof

Every entry in `artifact_inputs` contains governance; there is no parallel
`artifact_governance` array that could disagree:

```jsonc
{
  "input_id": "<stable logical identity>",
  "owner_repository": "Prometheus-Frameworks/<repo>",
  "owner_commit_sha": "<40-char commit>",
  "artifact_type": "<producer type>",
  "artifact_version": "<producer version>",
  "uri_or_path": "<immutable ref>",
  "content_sha256": "<hash>",
  "source_as_of": "<domain time>",
  "artifact_generated_at": "<UTC instant>",
  "governance": {
    "status": "governed | fixture | ungoverned",
    "decision_refs": [],
    "marker_ref": null
  },
  "cutoff_evidence": {
    "source_timestamp_locator": "<producer-specific field/path or evidence lookup>",
    "normalization_rule_id": "<reviewed source-specific derivation>",
    "normalization_rule_sha256": "<hash>",
    "record_evidence_refs": [],
    "record_count_eligible": 0,
    "record_count_post_cutoff": 0,
    "record_count_unresolved": 0,
    "validator_recomputed_status": "eligible | ineligible_after_cutoff | unresolved"
  },
  "population": {
    "row_count": 0,
    "matched_count": 0,
    "missing_count": 0,
    "coverage_rate": null
  },
  "availability_status": "available | missing | unfetchable",
  "freshness_policy_ref": {
    "policy_id": "<owner-defined policy>",
    "policy_sha256": "<hash>",
    "input_family": "<family>"
  },
  "model_admission": "admitted | available_not_admitted | parked | rejected | unavailable",
  "feature_names_admitted": [],
  "limitations": []
}
```

Run-level invariants:

- every admitted feature has one or more input lineage refs and an exact
  transform/configuration identity;
- every input that can affect output is admitted and hash-pinned;
- fixture, ungoverned, post-cutoff, or unresolved records cannot affect output;
- `validator_recomputed_status` is derived from dereferenced evidence, never
  accepted as producer self-certification;
- absent source facts remain absent in reporting. A model imputation (including
  zero) is permitted only if explicitly configured, preserves a missingness flag
  and source value, and has been validated through the exact production
  preprocessing path;
- upstream ownership is preserved—Forecast records what it saw but does not
  synthesize upstream provenance or governance.

`fact_available_at` is the validator's normalized concept, not a required literal
producer field. Each source-specific rule identifies the real evidence locator
(for example `observed_at`, per-family `last_verified_at`, or an archived
publication record), defines how it normalizes to an instant, and fails unresolved
on null/ambiguous evidence. A semantic `source_as_of` or generated timestamp is
never silently renamed into availability proof.

The existing reporting spec describes parallel `artifact_inputs[]` and
`artifact_governance[]` views. An implementation may emit a derived compatibility
view keyed uniquely by `input_id`, but v1's nested record is the only canonical
source. Validation must recompute the derived view and reject missing, duplicate,
or disagreeing joins.

This explicitly leaves the current history preprocessing unresolved: the bound
runtime uses zero for absent history values, while historical experiment evidence
used a history indicator and train-fold imputation. A future configuration must
choose one policy and revalidate that exact implementation.

### 3.6 Population census and reconciliation

The source artifact is a broad population census, not an already-filtered target
list. It must include supported, unsupported, eligible, ineligible, and unresolved
records so that whole domains cannot disappear before reconciliation.

```jsonc
{
  "population_census": {
    "census_artifact_ref": {},
    "census_sha256": "<hash>",
    "scope_definition": "<who is enumerated>",
    "effective_at": "<UTC instant>",
    "eligibility_policy_id": "<policy>",
    "eligibility_policy_sha256": "<hash>",
    "row_count": 0,
    "eligible_target_count": 0,
    "status_counts": {
      "forecast_available": 0,
      "unavailable_missing_required_inputs": 0,
      "unsupported_position_domain": 0,
      "identity_unresolved": 0,
      "eligibility_unresolved": 0,
      "position_domain_unresolved": 0,
      "population_ineligible": 0
    },
    "reconciliation": {
      "output_row_count": 0,
      "duplicate_population_row_ids": [],
      "duplicate_resolved_canonical_ids": [],
      "missing_population_row_ids": [],
      "extra_population_row_ids": [],
      "one_to_one_complete": false
    }
  }
}
```

Every census row has a stable `population_row_id` independent of canonical
identity resolution. Every census row maps to exactly one output row by that key.
Resolved eligible identities form the actual target population; unresolved and
ineligible rows remain visible in the output ledger with null forecasts.

A succeeded execution requires a nonzero census and eligible target count, status
counts summing exactly to census count, output count equal to census count, and
empty duplicate/missing/extra lists. Minimum identity and forecast-coverage
thresholds must be pinned in the eligibility/validation policy; one-to-one
reconciliation alone does not establish adequate coverage.

### 3.7 Uncertainty, outputs, serialization, and run diff

```jsonc
{
  "forecast_uncertainty": {
    "status": "calibrated | unavailable_not_calibrated",
    "method_id": null,
    "method_version": null,
    "lower_quantile_level": null,
    "median_quantile_level": null,
    "upper_quantile_level": null,
    "nominal_interval_coverage": null,
    "calibration_population": null,
    "calibration_artifact_ref": null,
    "empirical_coverage_by_origin": [],
    "empirical_coverage_by_position": [],
    "limitations": []
  },
  "outputs": [
    {
      "artifact_type": "seasonal_fantasy_point_forecast_player",
      "artifact_version": "seasonal-fantasy-point-forecast-player-v1",
      "uri_or_path": "<immutable ref>",
      "content_sha256": "<hash>",
      "row_count": 0
    }
  ],
  "previous_run_id": null,
  "diff_vs_previous": {
    "status": "no_previous_run | computed | not_comparable | unavailable",
    "compatibility": {
      "same_lane": false,
      "same_target_definition": false,
      "same_scoring_profile": false,
      "same_cutoff_semantics": false,
      "same_population_scope": false
    },
    "inputs": { "added": [], "removed": [], "changed": [] },
    "features": { "added": [], "removed": [], "changed": [] },
    "governance": { "changed": [] },
    "population": { "added": [], "removed": [], "status_changed": [] },
    "historical_metrics": { "overall": [], "by_position": [] },
    "forecast_movement": {
      "summary": { "moved_up": 0, "moved_down": 0, "unchanged": 0, "unavailable": 0 },
      "largest_moves": []
    }
  },
  "limitations": []
}
```

Quantile/range fields in player rows remain null unless the method, levels,
calibration population, nominal coverage, and empirical temporal/position
coverage are all declared. A categorical confidence label is not a substitute for
a numeric calibrated interval.

Metric or forecast movement is shown only when the compatibility block proves a
meaningful comparison. Otherwise `status` is `not_comparable`.

Canonical bytes must be defined before implementation. At minimum, the serializer
version fixes UTF-8 encoding, object-key order, number encoding, array order,
newline behavior, null handling, and JSONL row order (ascending
`population_row_id`). Golden fixtures must prove byte determinism. An artifact
does not embed its own hash; detached refs/attestations hash the completed bytes.

## 4. Proposed player-row contract

One row is emitted for every census `population_row_id`, even if canonical
identity is unresolved:

```jsonc
{
  "artifact_type": "seasonal_fantasy_point_forecast_player",
  "artifact_version": "seasonal-fantasy-point-forecast-player-v1",
  "run_id": "seasonal-ppr-2026-forward-001",
  "output_kind": "model-inference",
  "target_season": 2026,
  "forecast_cutoff": "<same as manifest>",
  "population_row_id": "<stable source-census key>",
  "player": {
    "source_identity_ref": {},
    "canonical_player_id": null,
    "display_name": "<display only>",
    "position": "<cutoff-bound position | unknown>",
    "nfl_team_id": null,
    "nfl_team_abbr": null,
    "team_assignment_status": "assigned | free_agent | unsigned | unknown | unavailable",
    "ownership_status": "<producer-native status | null>",
    "team_assignment_evidence_ref": null,
    "provider_eligibility": [
      {
        "provider": "<provider>",
        "status": "known | unknown | unavailable",
        "positions": [],
        "lineup_slots": [],
        "effective_at": null,
        "source_as_of": null,
        "evidence_ref": null
      }
    ]
  },
  "status": {
    "identity": "resolved | unresolved | conflicting",
    "eligibility": "eligible | ineligible | unresolved",
    "position_domain": "supported | unsupported | unresolved",
    "forecast": "forecast_available | unavailable_missing_required_inputs | unsupported_position_domain | identity_unresolved | eligibility_unresolved | position_domain_unresolved | population_ineligible"
  },
  "status_reasons": [
    {
      "dimension": "identity | population_eligibility | position_domain | required_input",
      "code": "<typed reason code>",
      "input_id": null,
      "evidence_refs": []
    }
  ],
  "forecast": {
    "generic_ppr_points": null,
    "lower_quantile": null,
    "median": null,
    "upper_quantile": null,
    "interval_lower": null,
    "interval_upper": null
  },
  "replacement_context": null,
  "feature_coverage": {
    "status": "complete | partial | unavailable",
    "present": [],
    "missing_required": [
      {
        "feature": "<feature>",
        "reason_code": "<typed code>",
        "input_id": "<input>",
        "evidence_refs": []
      }
    ],
    "missing_optional": [],
    "imputed": []
  },
  "feature_lineage": [],
  "drivers": {
    "status": "explained | unavailable",
    "model_mechanics_only": true,
    "top_positive": [],
    "top_negative": []
  },
  "limitations": [],
  "actual_outcome": null
}
```

Validation rules:

- canonical ID is required only when `status.identity` is `resolved`; otherwise
  it is null and no name/fuzzy join is attempted;
- null team identity is preserved as null; assignment/ownership state and its
  evidence are separate and no `FA`/`UNK` sentinel is invented as a team code;
- provider eligibility is independently scoped by provider/effective time and
  explicit status. An empty list means no provider was requested, never “known
  ineligible” or “unknown”;
- orthogonal statuses preserve overlaps; the primary forecast status follows
  fail-closed precedence: unresolved/conflicting identity, then unresolved
  eligibility, then ineligible, then unresolved position domain, then unsupported
  position, then missing required inputs, then available;
- every forecast/range field is finite only for `forecast_available`; otherwise
  all are null;
- `actual_outcome` is always null in the immutable forward artifact;
- IDP and every unmodeled position use `unsupported_position_domain`; no
  offensive fallback, replacement value, or Strategy archetype is allowed;
- a missing source value remains listed as missing even if a declared model
  transform imputes it; imputation never rewrites provenance into an observed
  zero;
- every non-available primary status has at least one structured reason/evidence
  entry, and every missing required feature has its own typed source-linked reason;
- drivers explain model mechanics only and cannot claim causality or advice.

Drivers are embedded in v1 player rows. A separate explanation artifact is not
part of v1; adding one later requires its own versioned contract and output ref.

## 5. Detached lifecycle attestations

Every attestation contains its own type/version, issuer, issued timestamp,
decision/policy identity, exact `manifest_sha256`, all output hashes, and an
integrity/signature mechanism selected by governance.

### Validation

Records validator version, pass/fail, errors/warnings, census reconciliation,
cutoff recomputation, schema/hash/model/scoring checks, and uncertainty checks. A
validation pass does not promote.

### Promotion

References a passing validation attestation and records the authorized decision.
Only this detached record may declare `production_ready: true`. Promotion never
changes the candidate bytes and never implies advice or deployment.

### Freshness

Records `evaluated_at`, owner-policy IDs, source-family results, aggregate state,
reasons, and any successor. States:

- `current`: within every owner-defined policy and no successor/revocation;
- `aging`: warning threshold passed but still within hard validity;
- `stale`: a hard limit or material source change invalidated current-facing use;
- `superseded`: a newer promoted artifact replaced this scope;
- `unavailable`: a referenced package/source or required freshness assessment
  cannot be obtained.

`post_cutoff` and `clock_invalid` are terminal validation failures, not freshness
states. Historical immutable facts use version/supersession policy; roster, team,
role, injury, and eligibility use family-specific maximum lags. No universal
threshold is implied.

A post-cutoff material change can stale the candidate for a later
present-tense/current-use claim or require a promoted successor; it does not alter
the immutable candidate's historical statement about what was known at its
original cutoff.

### Revocation and supersession

Append-only lifecycle records identify the revoked/superseded hashes, reason,
effective time, and successor where applicable. Before consumption is implemented,
governance must define an authoritative append-only registry/release index,
monotonic sequence or equivalent ordering, authorized issuers, fork resolution,
and anti-replay lookup. Content addressing proves bytes but cannot by itself prove
that an older `current` attestation has not since been revoked. Consumers resolve
the authoritative latest valid chain, never a mutable manifest flag or whichever
attestation they happened to fetch first.

## 6. Later grading contract

When governed 2026 outcomes exist, grading creates a new artifact containing:

- frozen forecast run ID, manifest hash, and player-row hash;
- governed outcome artifact identity/hash and scoring reconciliation;
- deterministic identity join results and exclusions;
- overall/by-position metrics, calibration, baselines, and coverage;
- actual outcomes and errors in grading rows only.

The original manifest and player rows remain byte-identical. Consensus or market
projections, if later added, remain comparison baselines and never become actuals.

## 7. Proposed TIBER-Fantasy read-only consumer contract

### 7.1 Admission sequence

Before displaying any row, the adapter must:

1. fetch exact content-addressed manifest/output/attestation refs;
2. validate hashes, supported types/versions, and the execution discriminant;
3. require a passing detached validation attestation;
4. require a detached authorized promotion with `production_ready: true`;
5. recompute/verify cutoff evidence and input governance/admission;
6. verify target, run, model/configuration, scoring, and population scope;
7. require a latest acceptable detached freshness/lifecycle chain;
8. exact-join canonical identity; never fuzzy-match names;
9. terminally reject IDP/unsupported positions for offensive Forecast;
10. expose inference plus missing/excluded/unsupported state without mutation.

Recommended machine-readable rejection codes:
`artifact_unavailable`, `malformed`, `schema_unsupported`, `ungoverned`,
`pin_mismatch`, `cutoff_violation`, `clock_invalid`, `validation_failed`,
`not_executed`, `revoked`, `stale`, `superseded`, `identity_unresolved`,
`scoring_mismatch`, `unsupported_position`, and `required_input_missing`.

Samples, fixtures, failed/unexecuted runs, unknown versions, hash mismatches,
ungoverned/post-cutoff inputs, incomplete reconciliation, invalid attestation
chains, stale/superseded current-use artifacts, and scoring mismatches fail closed.
No FORGE or other local ranking may silently replace missing Forecast output.

### 7.2 Display and ownership

- Persistently label values as **model inference**, not observed reality.
- Label the scoring result **generic full PPR, not league-specific**.
- Expose missing inputs, limitations, unavailable rows, unresolved identities,
  imputation, and unsupported domains.
- Preserve Forecast bytes; comparisons and UI sorting are derived views.
- Store Strategy interpretations in Strategy-owned artifacts and operator notes
  in operator-owned overlays. Neither mutates Forecast.
- Do not turn null/unavailable into zero or a low ranking.
- Do not transform Forecast into start/sit/trade/waiver/draft advice under this
  contract.

### 7.3 Scoring compatibility

The adapter may display the declared generic total only in a compatible generic
context. It must not claim exact league totals when passing TDs, bonuses,
turnovers, reception rules, provider eligibility, lineup, or defensive scoring
differ. League context cannot invent replacement/VORP fields absent from the
artifact.

### 7.4 IDP fail-closed rule

An IDP census row remains visible as `unsupported_position_domain`. The adapter
must not reuse offensive math, assign an offensive replacement baseline or
Strategy archetype, compare it as an offensive rank, or infer a value from name,
team, or roster status.

The adapter may map Forecast's row state to consumer rejection code
`unsupported_position`, but it must preserve the original row/reason. IDP
requires independently governed evidence, model, scoring, evaluation,
uncertainty, and consumer contracts.

## 8. Proposal review checklist

Before implementation is authorized, reviewers must resolve:

- exact candidate cutoff and record-level availability evidence contract;
- canonical census owner, scope, source-row key, and eligibility policy;
- complete governed 2025 outcomes/history binding and scoring reconciliation;
- accepted model/feature/configuration and exact missingness preprocessing;
- typed rolling-origin selection/evaluation protocol;
- final-model serialization and registry;
- seasonal uncertainty method/levels/calibration or explicit disposition;
- canonical byte serialization and detached attestation authority;
- authoritative lifecycle registry, ordering, fork resolution, and anti-replay;
- freshness policy owner and per-family limits;
- generic-PPR ownership and Fantasy compatibility behavior;
- minimum coverage/identity thresholds;
- whether a point-only local candidate may be emitted for review while remaining
  categorically non-promotable.

The sample intentionally leaves these unresolved and contains no player forecasts.
