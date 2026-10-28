# API contract: `@optcompact/core`

**Status:** Proposed · **Version:** 0.1.0

This page is the living contract for the core package. Harness adapters MAY depend on these symbols. The package MUST keep them stable within a minor version.

## Entry points

| Export | Kind | Contract |
|---|---|---|
| `decide(state)` | function | Returns a `Decision`; never throws for valid state |
| `unitValue(unit, turn, params)` | function | Discounted token-equivalent value of one unit |
| `unitHazard(unit, turn, params)` | function | Per-turn need probability in `[0, 1]` |
| `fitReuseTau(gaps)` | function | Sample-mean decay constant, at least 1; throws on an empty sample |
| `ewmaGrowth(deltas, alpha)` | function | Exponentially weighted growth estimate; zero for an empty sample |
| `summaryFidelity(input)` | function | Value fraction in `[0, 1]`; equals 1 at full retention |
| `economicInterval(input)` | function | Positive turns; throws on non-positive growth, price, or retention |
| `planSchedule(input)` | function | Token-minimal interval and retention for a quality target; throws on an invalid horizon or target |
| `extractAnchors(text)` | function | Deduplicated weighted anchors, deterministic order |
| `anchorRetentionScore(anchors, text)` | function | Weighted fraction in `[0, 1]`; returns 1 for no anchors |
| `defaultParams(overrides)` | function | Complete parameter object; never shares mutable nested state |
| `DEFAULTS` | constant | Frozen starting parameters |

## `PolicyState`

The adapter supplies every field. Optional fields fall back to documented defaults.

| Field | Type | Required | Meaning |
|---|---|---|---|
| `turn` | number | yes | Current turn index |
| `windowTokens` | number | yes | Model context window |
| `outputReserveTokens` | number | yes | Provider output reservation |
| `headroomTokens` | number | yes | Extra safety margin |
| `contextTokens` | number | yes | Current derived context size |
| `growthPerTurn` | number | yes | Recent growth estimate |
| `units` | `ContextUnit[]` | yes | Compactable units, causal order |
| `prices` | `PriceTable` | yes | Input, output, fixed call cost |
| `params` | `PolicyParams` | no | Model parameters |
| `lastCompactionTurn` | number | no | Cooldown input |
| `degradation` | `DegradationParams` | no | Overrides the parameter default |

## `Decision`

Every field is JSON-serializable. `Number.POSITIVE_INFINITY` MAY appear in `cer`; adapters MUST convert it to `null` before persisting.

| Field | Type | Meaning |
|---|---|---|
| `action` | `keep` \| `compact` | Requested action |
| `urgency` | `none` \| `soft` \| `hard` | Reason class |
| `cutIndex` | number | Leading units to shadow |
| `shadowTokens` | number | Tokens in the shadowed span |
| `retentionRatio` | number | Summary size divided by span size |
| `summaryTokens` | number | Estimated summary size |
| `fidelity` | number | Value-weighted fidelity of the span |
| `expectedGainTokens` | number | Signed decision value |
| `expectedQualityLoss` | number | Token-equivalent value lost |
| `riskBenefit` | number | Load-reduction benefit |
| `cer` | number | Tokens saved per unit of cost |
| `nextCheckInTurns` | number | Suggested re-evaluation delay |
| `reasons` | string[] | Stable reason codes |
| `breakdown` | `GainBreakdown` | Additive terms |
| `diagnostics` | `PolicyDiagnostics` | Evidence and candidate totals |

## Stability rules

- Adapters MUST treat unknown fields as ignorable.
- Core MUST NOT rename a field within 0.x without a changelog note.
- A new required state field is a breaking change.
- Reason codes are additive; removing one is a breaking change.

## Invariants

- `breakdown.total` equals the signed sum of its terms within `1e-9` relative error.
- `action = keep` implies `cutIndex = 0` and `shadowTokens = 0`.
- `action = compact` implies `cutIndex ≥ 1` and a balanced cut.
- `0 ≤ retentionRatio ≤ 1` and `0 ≤ fidelity ≤ 1`.
