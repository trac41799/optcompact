# Token optimization run, 2026-10-29

**Verdict:** pruning old tool results before summarizing dominates the fixed threshold. The best tested point retains 97.20% of needs at 11.13M tokens, against 96.85% at 11.93M for the baseline. The cheapest point that keeps 96.67% costs 10.68M.

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
| Prune age=8, compact 0.80, target 0.6 | **11.13M** | **97.20%** | 3.5 |
| Prune age=8, compact 0.80, target 0.5 | **10.68M** | 96.67% | 2.8 |
| Prune age=10, compact 0.80, target 0.6 | 11.15M | 97.32% | 3.6 |

## Reading

- The tiered policy is Pareto-dominant at the recommended point: 6.7% fewer tokens and 0.35 points more coverage than the fixed baseline.
- Aggressive compaction by interval alone loses coverage. The planned q=0.99 policy spends about the same tokens as the baseline but retains 3.2 fewer points.
- Pruning beats summarizing because tool output is bulky and low value. Dropping its middle costs little and needs no model call.
- The winning tier order is prune, re-measure, then summarize only if pressure remains.

## Fidelity calibration gap

The planner predicts 0.994 quality for a schedule whose measured coverage is 93.69%. The gap is about 6 points at strict targets. The fidelity curve in the planner is optimistic for tool output. Calibration must map the planner target to measured coverage before the target becomes a hard promise.

## Threats

- The prune survival rate (0.8) is an assumption, not a measurement.
- Coverage counts every latent need equally. Task-critical needs are not weighted.
- The generator is synthetic.

## Reproduce

`node packages/sim/sweep.ts` and `node packages/sim/prune-grid2.ts`.
