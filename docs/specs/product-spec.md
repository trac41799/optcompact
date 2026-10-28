# spec(product): OptCompact v0.1

TL;DR: Ship a deterministic compaction-decision engine with DeepSeek Harness and Codex adapters, so a session compacts when the value of carrying context falls below its cost. The model is in [`compaction-model.md`](compaction-model.md).

## Overview

Fixed pressure thresholds ignore information value, summarizer fidelity, and call cost. OptCompact computes a per-turn decision from observable session signals and returns an auditable gain breakdown. It runs inside the harness, needs no training, and makes no network calls on the decision path.

Scope: one core engine, two adapters, one simulator, one CLI. Out of scope: hosted service, training a learned policy, model-specific summarizer prompts.

## Design

The engine is a pure function over `PolicyState`. Adapters map harness events to units and execute the decision through the harness transaction. Package boundaries and failure behavior are in [`architecture.md`](../architecture/architecture.md). Model derivation is in [`compaction-model.md`](compaction-model.md).

## Requirements

### Decision engine

- **R1.** The engine MUST return a `Decision` for every observed turn, including empty, single-unit, and over-limit states.
- **R2.** The decision MUST expose every additive term: tokens saved, summary cost, lost value, risk benefit, fixed cost, total.
- **R3.** The engine MUST force a hard compaction when `contextTokens + growthPerTurn` exceeds `window − reserve − headroom`.
- **R4.** The engine MUST NOT choose a cut that splits an assistant tool call from its result.
- **R5.** The engine MUST be deterministic for identical state.
- **R6.** The engine MUST NOT perform I/O, network access, or model calls.

### Adapters

- **R7.** The DeepSeek Harness adapter MUST reuse the shipped compaction transaction and summarizer.
- **R8.** The DeepSeek Harness adapter MUST leave context-overflow recovery enabled.
- **R9.** An adapter MUST return `keep` when a required signal is missing, and MUST log the reason.
- **R10.** An adapter MUST NOT block or fail a turn because of a decision error.

### Evidence

- **R11.** Every compaction decision MUST be recordable as one JSON object with the fields in [`architecture.md`](../architecture/architecture.md#6-evidence-and-observability).
- **R12.** The simulator MUST compare the model against never-compact, fixed-threshold, and periodic baselines on seeded sessions.
- **R13.** The reported comparison MUST include tokens spent, rework triggered, needs lost, and compaction count.

### Distribution

- **R14.** `@optcompact/core` MUST declare zero runtime dependencies.
- **R15.** The repository MUST pass tests, typecheck, and the docs gate in CI.
- **R16.** The README MUST state supported harness versions and known limitations.

## Delivered vs Deferred

| Item | Status | Evidence |
|---|---|---|
| Core hazard, fidelity, prefix-gain rule | Delivered | `packages/core/test/*.test.ts` |
| Economic interval estimator | Delivered | `packages/core/test/interval.test.ts` |
| Anchor retention metric | Delivered | `packages/core/test/metrics.test.ts` |
| Simulator and baselines | Delivered | `packages/sim`, `docs/qa/runs/2026-10-29-simulation.md` |
| DeepSeek Harness adapter | Delivered and live-verified in a headless profile | `packages/dsh/test/policy.test.ts`, [live run](../qa/runs/2026-10-29-live-dsh.md) |
| Codex adapter | Delivered; protocol verified, full compaction pending quota | `packages/codex/test/*.test.ts`, [protocol check](../qa/runs/2026-10-29-codex-protocol.md) |
| CLI | Deferred | not needed for v0.1 |
| CI and public release | In progress | Task 6 |

## Test

- [ ] Unit tests per formula and per branch (Delivered for core).
- [ ] Property tests for cut validity and breakdown additivity.
- [ ] Contract tests for each adapter with a fake harness.
- [ ] Simulator gate: hazard policy retains at least as many needs as fixed-threshold at equal or lower token spend.
- [ ] Docs gate: `check_docs.py --strict` reports zero errors.

## Acceptance criteria

- **AC-1** All core tests pass.
- **AC-2** The DSH plugin loads in a real DeepSeek Harness composition. Met: [live run](../qa/runs/2026-10-29-live-dsh.md).
- **AC-3** A DSH session compacts through the stock backend and continues. Met twice in the live run; the long-session overflow case remains open.
- **AC-4** The Codex adapter works on the documented surface, and its limits are stated.
- **AC-5** CI is green on the public repository.

## Alignment

### Human decides

- [ ] Publish to npm (out of scope for v0.1; GitHub release only).
- [ ] Change the default fidelity curve after calibration.

### AI implements

- [x] Everything else, with the call stated in the ADR and the changelog.

### Open questions

> Blocking items only; resolve in comments.
