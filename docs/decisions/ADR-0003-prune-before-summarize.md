# ADR-0003: Prune tool results before summarizing

**Status:** Proposed · **Date:** 2026-10-29

## Context

The model optimized one decision: summarize a prefix or keep it. A simulator comparison showed that summary calls are not the cheapest way to remove tokens. Tool results hold most of the bulk and least of the value. A model-free head/tail prune saves tokens without a summary call, and the DeepSeek Harness already ships such a pruner.

Measured on 20 synthetic sessions:

- fixed 0.80 threshold: 12.75M tokens, 96.85% need coverage;
- prune old tool results, then compact at 0.75 to target 0.6: 10.96M tokens, 96.91% coverage;
- prune, then compact to target 0.55: 10.89M tokens, 96.85% coverage.

Pruning is Pareto-dominant: 14.0% fewer tokens at equal or better coverage.

## Decision

Make pruning the first tier of every compaction decision:

1. When load crosses `pruneAt` (default 0.45), call the mounted `toolResultPruner.pruneSession`.
2. Re-measure the surface with `ctx.tokenMeter.measure`.
3. Run `decide` on the post-prune state.
4. Summarize only when the core gain remains positive.

The policy plugin never requires the pruner. It looks the service up through `ctx.get('toolResultPruner')`, so compositions without the pruner keep working.

Add `planSchedule` to the core. It chooses the compaction interval and retention ratio that minimize cumulative carrying, summary, and rework tokens over a horizon, subject to a quality target and, when no ratio is given, over a retention grid.

## Consequences

Positive:

- Lower cumulative tokens at equal or better coverage.
- Pruning is model-free, deterministic, and already replay-safe in the harness.
- The planner turns a quality target into an interval and a retention ratio.

Negative:

- The prune survival rate is an assumption. The shipped pruner keeps only head and tail.
- A prune invalidates the KV cache from the first changed token.
- The quality target is a model estimate. It overstates measured coverage by about six points at strict targets.

## Alternatives rejected

- **Compact more often.** More summary calls and more fidelity loss. Measured worse at equal tokens.
- **Raise the pressure threshold only.** Leaves tool bulk in place until the window is nearly full.
- **Model-based pruning.** Adds a call and makes the decision nondeterministic.
