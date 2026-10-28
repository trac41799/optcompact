# OptCompact v0.1 Implementation Plan

**Goal:** Ship a deterministic decision engine, a DeepSeek Harness plugin, a Codex adapter, and evidence against fixed thresholds.
**Architecture:** One dependency-free core; adapters build state and execute actions; a simulator provides ground-truth policy comparison.
**Tech Stack:** Node 24, TypeScript 5.9 with native type stripping, `node:test`, pnpm workspaces.
**Spec:** [`docs/specs/compaction-model.md`](../specs/compaction-model.md) · [`docs/specs/product-spec.md`](../specs/product-spec.md)

## Global Constraints

- Core has zero runtime dependencies and no network access.
- Every exported symbol carries a one-line doc comment.
- Tests run with `node --test` and no transpile step.
- New behavior ships with a spec update, an ADR when it changes a decision, and a changelog entry.
- Model defaults change only with calibration evidence.
- Uppercase RFC 2119 keywords appear only under `docs/specs`, `docs/decisions`, `docs/standards`.

## Task 1: Core decision model

**Files:** `packages/core/src/*.ts`, `packages/core/test/*.test.ts`
**Interfaces:** `decide(state) -> Decision`, `summaryFidelity(input) -> number`, `economicInterval(input) -> number`, `extractAnchors(text) -> Anchor[]`, `anchorRetentionScore(anchors, text) -> number`

- [x] Write failing tests for hazard decay, fidelity, interval, policy, and metrics
- [x] Run them — verify 25 failures (module missing)
- [x] Implement the minimal model
- [x] Run them — verify 25 passes
- [ ] Add property tests for decision invariants
- [ ] Commit `feat(core): hazard and rate-distortion decision model`

## Task 2: Ground-truth simulator

**Files:** `packages/sim/src/generator.ts`, `packages/sim/src/policies.ts`, `packages/sim/src/runner.ts`, `packages/sim/test/*.test.ts`
**Interfaces:** `generateSession(seed, options) -> SimSession`, `runPolicy(policy, session) -> SimResult`

- [x] Write a failing test that a never-compact policy overflows its window
- [ ] Run it — verify RED
- [x] Implement the generator and the runner
- [ ] Run it — verify GREEN
- [x] Add the fixed-threshold and periodic baselines
- [x] Produce the policy comparison table for the README
- [x] Commit `feat(sim): seeded ground-truth policy comparison`

## Task 3: DeepSeek Harness adapter

**Files:** `packages/dsh/src/index.ts`, `packages/dsh/cordis.patch.yml`, `packages/dsh/test/*.test.ts`
**Interfaces:** `maybeCompact(ctx, config, agent, turn, signal) -> Decision`, `install(ctx, config) -> dispose`

- [x] Write a failing contract test with a fake compaction seam
- [x] Run it — verify RED
- [x] Implement the state builder and the pre-step policy
- [x] Run it — verify GREEN
- [x] Verify tool-pair balance and the keep path on a live session (headless, two committed compactions)
- [x] Commit `feat(dsh): model-driven compaction plugin`

## Task 4: Codex adapter

**Files:** `packages/codex/src/index.ts`, `packages/codex/src/*.ts`, `packages/codex/test/*.test.ts`
**Interfaces:** documented in `docs/specs/codex-adapter.md`

- [x] Write a failing test for the Codex event mapping
- [x] Run it — verify RED
- [x] Implement the adapter against the supported Codex surface
- [x] Run it — verify GREEN
- [x] Record the supported and unsupported signals in the spec
- [x] Commit `feat(codex): optimal-compaction adapter`

## Task 5: CLI and examples

**Files:** `packages/cli/src/*.ts`, `packages/cli/test/*.test.ts`
**Interfaces:** `optcompact explain --state <file>`, `optcompact simulate --policy hazard --seed 7`

- [ ] Write a failing CLI snapshot test
- [ ] Run it — verify RED
- [ ] Implement the commands
- [ ] Run it — verify GREEN
- [ ] Add a worked example under `examples/`
- [ ] Commit `feat(cli): explain and simulate commands`

## Task 6: Publish and release

**Files:** `.github/workflows/ci.yml`, `README.md`, `docs/changes/CHANGELOG.md`

- [x] Add CI: install, test, typecheck, link check
- [x] Verify CI green on the remote (run 40734190220)
- [x] Tag `v0.1.0` and publish the GitHub release
- [x] Confirm the repository is public and the README renders the evidence table
- [x] Commit `chore(release): v0.1.0`

---

*Rules: one plan per epic at `docs/plans/YYYY-MM-DD-<epic-slug>.md`; bite-sized tasks; no placeholders; MRs reference `Closes #N`. Style: [`docs/standards/writing-guide.md`](../standards/writing-guide.md).*
