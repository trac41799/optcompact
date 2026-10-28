# @optcompact/core

Dependency-free decision model for context compaction. See the [normative spec](../../docs/specs/compaction-model.md).

```ts
import { decide, defaultParams, economicInterval, anchorRetentionScore, extractAnchors } from '@optcompact/core';
```

## Exports

| Symbol | Purpose |
|---|---|
| `decide(state)` | Per-turn `Decision` with an additive gain breakdown |
| `unitValue`, `unitHazard` | Reuse-hazard value model |
| `fitReuseTau`, `ewmaGrowth` | Calibration estimators for decay and growth |
| `summaryFidelity` | Rate-distortion fidelity curve with generation penalty |
| `economicInterval` | Renewal-reward interval `sqrt(2c0/(λρg))` |
| `extractAnchors`, `anchorRetentionScore` | Retained-quality measurement |
| `defaultParams`, `DEFAULTS` | Calibratable defaults |
| `isToolBalanced` | Cut validation for assistant tool pairs |

## Invariants

- Deterministic for identical state.
- No I/O, no network, no model call.
- `breakdown.total` equals the signed sum of its terms.
- A selected candidate never falls below `qualityFloor`.
- A checkpoint below `checkpointFloor` is never folded.

## Decision fields

`action`, `urgency`, `cutIndex`, `shadowTokens`, `retentionRatio`, `summaryTokens`, `fidelity`, `expectedGainTokens`, `expectedQualityLoss`, `riskBenefit`, `cer`, `nextCheckInTurns`, `reasons`, `breakdown`, `diagnostics`.

The contract is in [`docs/architecture/api.md`](../../docs/architecture/api.md).
