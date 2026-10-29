# Token optimization run, 2026-10-29

**Verdict:** pruning old tool results before summarizing dominates the fixed threshold. The tuned point consumes 10.96M tokens at 96.91% need coverage, against 12.75M at 96.85% for the baseline. That is 14.0% fewer consumed tokens at equal quality.

## What the numbers mean

"Tokens" below are consumed token-equivalents, not saved tokens. Each total sums four parts:

- **Carried**: context tokens sent on every turn, the area under the context-size curve.
- **Summary**: input plus output tokens of each summarization call.
- **Rework**: tokens spent re-deriving lost context.
- **Total**: carried + summary + rework.

Savings are the difference between a baseline total and a policy total. The fixed call cost `c_0` is a utility price, not a token count, so it is excluded. Provider pricing and prompt caching are not simulated.

## Setup

- 20 seeded sessions, 100 turns, 200k window.
- Latent reuse and a pessimistic fidelity curve, hidden from every policy.
- Prune model: a tool result older than the prune age shrinks to a fraction of its size. Needs against it still succeed 80% of the time. This approximates the shipped head/tail pruner.

## Results

| Policy | Carried | Summary | Rework | **Total** | Coverage | Compactions |
|---|---|---|---|---|---|---|
| Never compact | 13.54M | 0.79M | 0.01M | 14.33M | 97.38% | 5.3 |
| Fixed 0.80 | 11.93M | 0.81M | 0.01M | 12.75M | 96.85% | 9.8 |
| Hazard, defaults | 4.50M | 0.70M | 0.05M | 5.25M | 83.16% | 30.6 |
| Planned q=0.95 | 6.81M | 0.88M | 0.04M | 7.74M | 86.67% | 6.0 |
| Planned q=0.99 | 11.01M | 0.81M | 0.02M | 11.84M | 93.69% | 4.6 |
| Prune age=12, scale=0.20, compact 0.80, target 0.6 | 11.34M | 0.76M | 0.01M | 12.11M | 97.56% | 3.8 |
| **Prune age=6, scale=0.15, compact 0.75, target 0.6** | **10.32M** | **0.63M** | **0.02M** | **10.96M** | **96.91%** | 3.5 |
| **Prune age=6, scale=0.15, compact 0.75, target 0.55** | **10.22M** | **0.65M** | **0.02M** | **10.89M** | **96.85%** | 2.9 |

## Reading

- Against the fixed baseline, the tuned policy consumes 1.79M fewer tokens at 0.06 points more coverage.
- At exactly baseline coverage it consumes 1.86M fewer tokens.
- Summary overhead falls from 0.81M to 0.63M because compactions drop from 9.8 to 3.5.
- Interval-only planning does not win: planned q=0.99 consumes 11.84M at 93.69% coverage. The crossing point is pruning, not scheduling.
- The shipped pruner is configured by character budget, not by age. Age and scale are simulator proxies. The adapter maps them to `pruneAt` plus the mount-time `thresholdChars`.

## Fidelity calibration gap

The planner predicts 0.994 quality for a schedule whose measured coverage is 93.69%. The gap is about 6 points at strict targets. The fidelity curve in the planner is optimistic for tool output. Calibration must map the planner target to measured coverage before the target becomes a hard promise.

## Threats

- The prune survival rate (0.8) is an assumption, not a measurement.
- Coverage counts every latent need equally. Task-critical needs are not weighted.
- The generator is synthetic, and provider cache discounts are not modeled.

## Reproduce

`node packages/sim/accounting.ts` and `node packages/sim/prune-grid3.ts`.
