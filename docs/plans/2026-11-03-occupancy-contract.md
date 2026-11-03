# Occupancy Contract Implementation Plan

**Goal:** Lock the occupancy-source decision in ADR-0005. Ship the provider-anchored sample with a route guard and a conservative hard cap.
**Architecture:** `@optcompact/core` selects between two adapter-supplied numbers; adapters own measurement and provenance.
**Tech Stack:** Node 24, TypeScript 5.9 native type stripping, `node:test`, pnpm workspaces.
**Spec:** [`docs/specs/compaction-model.md`](../specs/compaction-model.md) §17 AC-14/15, §21 · [`ADR-0005`](../decisions/ADR-0005-occupancy-source.md)

## Global Constraints

- Core has zero runtime dependencies and no harness imports.
- Every exported symbol carries a one-line doc comment.
- Never weaken a failing test; each behavior starts red.
- Uppercase RFC 2119 keywords appear only under `docs/specs`, `docs/decisions`, `docs/standards`.

**Baseline:** v0.4.2, 86 passed / 0 failed. Post-change: 92 passed / 0 failed.

## Task 1: Occupancy selection in core

**Files:** `packages/core/src/occupancy.ts`, `packages/core/src/index.ts`, `packages/core/test/occupancy.test.ts`
**Interfaces:** `selectOccupancy({providerTokens?, surfaceTokens, capacityTokens, routeChanged?}) -> {usedTokens, capacityTokens, source}`

- [x] Write failing tests: provider current, provider absent, route changed, invalid capacity
- [x] Run them — RED: `does not provide an export named 'selectOccupancy'`
- [x] Implement the minimal selector and export it
- [x] Run them — GREEN: 5 passed

## Task 2: Conservative hard cap

**Files:** `packages/core/src/checkpoint.ts`, `packages/core/test/occupancy.test.ts`
**Interfaces:** `CheckpointInput.safetyOccupancy?: number`

- [x] Write a failing test: `occupancy 0.55`, `safetyOccupancy 0.95` returns `reason: 'hard'`
- [x] Run it — RED: `hard` expected, `below-threshold` returned
- [x] Use `max(occupancy, safetyOccupancy)` for the hard branch
- [x] Run it — GREEN: 5 passed

## Task 3: DSH route guard and evidence

**Files:** `packages/dsh/src/index.ts`, `packages/dsh/test/policy.test.ts`
**Interfaces:** `maybeCheckpoint` reads `selectOccupancy`; evidence adds `source`, `route`, `routeChanged`, `safetyOccupancy`

- [x] Write a failing BDD test: turn 30 route `deepseek-chat` projection 45k → provider; turn 31 route `deepseek-reasoner` same projection → surface 30k, `routeChanged: true`
- [x] Run it — RED: `source` undefined
- [x] Track the last route per session, ignore the projection on change, resolve the new window, pass `safetyOccupancy`
- [x] Run it — GREEN: 16 passed

## Task 4: Documentation and release

**Files:** `docs/decisions/ADR-0005-occupancy-source.md`, `docs/specs/compaction-model.md`, `docs/qa/runs/2026-11-03-occupancy-contract.md`, `docs/changes/CHANGELOG.md`
**Interfaces:** none

- [x] Record the decision and rejected alternatives
- [x] Add the measurement contract and AC-14/15
- [x] Record the BDD scenarios and gate evidence
- [x] Bump to 0.5.0 and update the changelog
- [x] Build and deploy the DSH bundle
- [x] Run the docs, test, and typecheck gates
- [ ] Commit, push, tag, and release

## BDD Scenarios

1. **Provider current.** Given a live projection on the current route. When a checkpoint is evaluated, occupancy uses the projection and evidence says `source: provider`.
2. **Provider absent.** Given no projection, when a checkpoint is evaluated, then occupancy uses the surface estimate.
3. **Route changed.** Given a projection recorded on another route. When a checkpoint is evaluated, occupancy uses the surface estimate and the freshly resolved window.
4. **Conservative hard cap.** Given the larger estimate at 0.95 and the primary at 0.55, when the decision runs, then it checkpoints with `reason: hard`.
