# Decision record: scoring-profile hash equivalence (`tiber-generic-full-ppr-v1`)

> **Decision date:** 2026-07-28
> **Decision authority:** Joseph (operator), accepted as recommended by the independent
> PR review of Prometheus-Frameworks/TIBER-Data#229
> **Status:** approved operator disposition
> **Applies to:** assembly and validation of scoring-reconciliation evidence for the
> forward candidate runtime (Forecast #167 program; consumed at the future #170 gate)

## Decision

The following two SHA-256 identities refer to the **same scoring profile**,
`tiber-generic-full-ppr-v1` version `1.0.0`, and are approved as equivalent for the
purpose of binding TIBER-Data scoring-reconciliation evidence to TIBER-Forecast's
pinned profile constant:

| Identity | Value | Hashed bytes |
| --- | --- | --- |
| Forecast canonical profile hash | `a368b75bf5503558a4f664e0486e2c3cc75c01004d4527fd29ecaa1e247a6274` | Canonical UTF-8 JSON bytes (sorted keys, compact separators, one trailing LF) of `TIBER_GENERIC_FULL_PPR_V1` in [`src/contracts/genericFullPprProfile.ts`](../../src/contracts/genericFullPprProfile.ts) (merged in PR #172) |
| TIBER-Data contract profile hash | `b1404afb1c7c6c9760b36090e5a84ef3fd2a29dfe8ba2e2fe0efb98d0ac6622e` | Canonical UTF-8 JSON bytes (sorted keys, compact separators, no trailing LF) of the `profile.definition` block in TIBER-Data `docs/contracts/player-season-coverage-v0-generic-ppr-reconciliation-v1.json` (TIBER-Data#229, contract SHA-256 `6542e32ffba6446d982c8459e7a81187e7970cb6ef1a74e76be5d35edd26dd98`) |

The hashes differ because the two repositories serialize the same semantics in
different byte representations. They can never be made equal by recomputation, and
neither is in error.

## Term-by-term equivalence

Independently verified during the TIBER-Data#229 review (each Data decimal string
parses to exactly the Forecast JSON number):

| Term | Forecast (`a368b75b…`) | TIBER-Data (`b1404afb…`) | Equivalent |
| --- | --- | --- | --- |
| `profile_id` | `tiber-generic-full-ppr-v1` | `tiber-generic-full-ppr-v1` | yes |
| `profile_version` | `1.0.0` | `1.0.0` | yes |
| `league_specific` | `false` | `false` | yes |
| `regular_season_only` | `true` | `true` | yes |
| reception | `1` (number) | `"1"` (string) | yes |
| receiving yard | `0.1` | `"0.1"` | yes |
| receiving touchdown | `6` | `"6"` | yes |
| rushing yard | `0.1` | `"0.1"` | yes |
| rushing touchdown | `6` | `"6"` | yes |
| passing yard | `0.04` | `"0.04"` | yes |
| passing touchdown | `4` | `"4"` | yes |
| interception | `-2` | `"-2"` | yes |
| bonuses | `[]` (empty tuple) | `"none"` | yes (both declare no bonuses) |
| supported positions | `["QB","RB","WR","TE"]` | `["QB","RB","WR","TE"]` | yes |
| unsupported domains | `["IDP"]` | not declared | consistent (the Data contract's population contains no IDP rows; the Forecast declaration is a strict superset statement) |

## Consequences

1. A `ScoringReconciliationEvidenceRef` assembled for a forward candidate run may
   carry `scoring_profile_sha256: a368b75b…` (as Forecast's runtime validator
   requires) while referencing TIBER-Data#229 evidence whose own contract declares
   `b1404afb…`, **provided the run cites this decision record in a schema-valid
   location**. The reference itself cannot carry the citation:
   `ScoringReconciliationEvidenceRef` is field-exact (six fields;
   `validateScoringReconciliationEvidence` rejects any additional field), and its
   sole `evidence_ref` must identify the TIBER-Data evidence artifact. The
   citation therefore belongs in the succeeded manifest's `limitations` array
   (free-text, already part of the manifest contract) and in the authorizing run
   issue/completion packet — one of the two is required, both are recommended.
2. An independent reviewer recomputing the Data contract's declared profile hash
   and obtaining `b1404afb…` instead of `a368b75b…` must treat this record — not
   producer assertion — as the bridge, and may re-verify the term table above
   directly against both pinned documents.
3. This equivalence is **version-pinned**: it covers exactly profile version
   `1.0.0` and the two byte representations identified above. Any change to either
   representation, any weight, or the profile version voids this record and
   requires a new disposition.

## Verification (reproducible)

Both derivations were re-executed on 2026-07-28 against the merged Forecast `main`
(`4dffc68`) and TIBER-Data#229 head (`0c4f162d4e25fb3ea9a67d942af72fe90a1b05c7`).
Complete commands, each printing the full digest:

Forecast hash — run from a TIBER-Forecast checkout at or after merge commit
`4dffc68` (the module additionally self-checks this pin at load and throws on
mismatch):

```bash
npx tsx -e "
import('./src/contracts/genericFullPprProfile.ts').then(async (m) => {
  const { createHash } = await import('node:crypto');
  console.log(createHash('sha256').update(m.getTiberGenericFullPprV1CanonicalBytes()).digest('hex'));
});"
# expected: a368b75bf5503558a4f664e0486e2c3cc75c01004d4527fd29ecaa1e247a6274
```

TIBER-Data hash — run from a TIBER-Data checkout whose history contains the
TIBER-Data#229 commit (post-merge `main` qualifies):

```bash
python3 - <<'EOF'
import hashlib, json, subprocess
raw = subprocess.run(
    ["git", "show",
     "0c4f162d4e25fb3ea9a67d942af72fe90a1b05c7:docs/contracts/player-season-coverage-v0-generic-ppr-reconciliation-v1.json"],
    capture_output=True, check=True).stdout
definition = json.loads(raw)["profile"]["definition"]
payload = json.dumps(definition, ensure_ascii=False, sort_keys=True,
                     separators=(",", ":")).encode("utf-8")
print(hashlib.sha256(payload).hexdigest())
EOF
# expected: b1404afb1c7c6c9760b36090e5a84ef3fd2a29dfe8ba2e2fe0efb98d0ac6622e
```

## Non-decisions

This record does not admit any input to a model, select a forecast cutoff,
authorize a candidate run, promote any artifact, or assert that promoted
`season_ppr` source totals conform to the profile (see the companion scoring-target
disposition and TIBER-Data#229's discrepancy ledger for that question).
