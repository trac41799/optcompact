# Token optimization run, 2026-10-29

**Verdict:** pruning old tool results before summarizing dominates the fixed threshold. The tuned point retains 96.91% of needs at 10.32M tokens, against 96.85% at 11.93M for the baseline: 13.5% fewer tokens at equal quality. The cheapest point that matches baseline coverage costs 10.22M, 14.3% below baseline.

## Setup

- 20 seeded sessions, 100 turns, 200k window.
- Latent reuse and a pessimistic fidelity curve, hidden from every policy.
- Tokens counted per turn, including summary calls and rework.
- Prune model: a tool result older than the prune age shrinks to 20% of its size. Needs against it still succeed 80% of the time. This approximates the shipped head/tail pruner, which keeps paths and errors and drops the middle.

## Results

| Policy | Tokens | Coverage | Compactions |
|---|---|---|---|
| Never compact | 13.54M | 97.38% | 5.3 |
| Fixed 0.80 | 11.93M | 96.85% | 9.8 |
| Hazard, defaults | 4.50M | 83.16% | 30.6 |
| Planned q=0.95 | 6.81M | 86.67% | 6.0 |
| Planned q=0.99 | 11.01M | 93.69% | 4.6 |
| Prune age=8, scale=0.20, compact 0.80, target 0.6 | 11.13M | 97.20% | 3.5 |
| Prune age=6, scale=0.15, compact 0.75, target 0.6 | **10.32M** | **96.91%** | 3.5 |
| Prune age=6, scale=0.15, compact 0.75, target 0.55 | **10.22M** | 96.85% | 3.5 |
| Prune age=7, scale=0.15, compact 0.75, target 0.55 | 10.36M | 97.03% | 3.0 |

## Reading

- The tuned tiered policy is Pareto-dominant: 13.5% fewer tokens at 0.06 points more coverage than the fixed baseline.
- Pruning earlier and harder helps: age 6 and a 0.15 scale beat age 8 and 0.20. Old tool output is bulky and low value.
- Aggressive compaction by interval alone loses coverage. The planned q=0.99 policy spends about the same tokens as the baseline but retains 3.2 fewer points.
- The winning tier order is prune, re-measure, then summarize only if pressure remains.
- The shipped pruner is configured by character budget, not by age. The age and scale here are simulator proxies. The adapter maps them to `pruneAt` plus the mount-time `thresholdChars`.

## Fidelity calibration gap

The planner predicts 0.994 quality for a schedule whose measured coverage is 93.69%. The gap is about 6 points at strict targets. The fidelity curve in the planner is optimistic for tool output. Calibration must map the planner target to measured coverage before the target becomes a hard promise.

## Threats

- The prune survival rate (0.8) is an assumption, not a measurement.
- Coverage counts every latent need equally. Task-critical needs are not weighted.
- The generator is synthetic.

## Reproduce

`node packages/sim/sweep.ts` and `node packages/sim/prune-grid2.ts`.
