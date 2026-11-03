# Changelog

All notable changes to this project. Format: [Keep a Changelog](https://keepachangelog.com/). Versioning: [SemVer](https://semver.org/).

## [Unreleased]

## [0.5.1] — 2026-11-04

### Fixed

- A policy row that cannot reach the preset-scoped `compaction` service no longer blocks every session on that preset. The plugin no longer declares `compaction` in `inject`; DSH reports a pending preset row as `agent-preset/invalid` and refuses to resume any session that selects the preset.
- The backend is resolved per call through `compactionOf` (`ctx.get('compaction')` with a guarded fallback). When it is absent the plugin warns once per session and leaves the step alone; the step paths record `no-compaction-service`. The overflow handler delegates to `next()`.

### Verified

- 98 tests pass, typecheck clean.
- Incident report: [`qa/runs/2026-11-03-preset-mount-block.md`](../qa/runs/2026-11-03-preset-mount-block.md).

## [0.5.0] — 2026-11-03

### Added

- `selectOccupancy` in `@optcompact/core`: chooses the provider sample when it is current, otherwise the surface estimate, without importing harness APIs.
- `CheckpointInput.safetyOccupancy`: the hard 0.9 checkpoint uses the larger of the provider and surface estimates.
- ADR-0005, the occupancy contract plan, and the BDD run report.

### Changed

- The DeepSeek Harness adapter tracks the last `provider/model` per session. A route change ignores the previous route's projection for that decision and resolves the new window.
- Checkpoint evidence records `source`, `route`, `routeChanged`, and `safetyOccupancy`.

### Verified

- 92 tests pass, typecheck clean, docs gate 0 errors / 0 warnings.

## [0.4.2] — 2026-11-03

### Fixed

- Post-compaction evidence measures the retained surface, not the projection residual, so `ratio` and `postTokens` reflect the actual checkpoint.
- Occupancy is recomputed after pruning, so a pruned turn decides on current pressure.

## [0.4.1] — 2026-11-03

### Fixed

- Checkpoint occupancy now matches the UI meter: provider-anchored `contextPressure.projectedTokens` over `contextPressure.contextWindow`, not `surfaceTokens`.
- Mid-turn checkpoints trigger at 50% occupancy; the urgent threshold defaults to the ceiling instead of 0.75.
- Manual `/compact` no longer truncates: the checkpoint cap is 32768, replacing 1600.
- A same-turn cooldown prevents repeated checkpoints after one succeeds.
- Evidence records window, surface, and used tokens for diagnosis.
## [0.4.0] — 2026-11-02

### Added

- Boundary checkpoint mode, now the DeepSeek Harness default: trigger at 50% occupancy on a turn boundary, 75% without one, 90% always. Keeps a short verbatim tail and replaces the rest with a structured checkpoint capped at 1600 output tokens.
- `decideCheckpoint` in `@optcompact/core` with post-compaction footprint and per-event ratio.
- Simulator checkpoint policy with critical units, per-event reduction, post occupancy, and critical recall.
- ADR-0004 and the checkpoint mode run report.

### Changed

- `dsh-compaction-basic` is configured with `maxTokens: 1600`; the preset generator sets it for every preset.
- Metrics are split: per-event reduction and post occupancy are separate from session-total token savings.

### Verified

- 85 tests pass. Measured: 88% per-event reduction, 8.6% post occupancy, 99.6% critical recall, 8.16M total tokens against 12.75M.
## [0.3.0] — 2026-10-29

### Added

- `planSchedule` in `@optcompact/core`: minimizes cumulative carrying, summary, and rework tokens over a horizon for a quality target, optimizing both interval and retention ratio.
- Tiered compaction in `@optcompact/dsh`: run the model-free tool-result pruner before deciding, re-measure, then summarize only if gain remains. New `prune` and `pruneAt` settings.
- Simulator `planned` and `prune` policies with quality-target sweeps.
- ADR-0003 and the token optimization run report.

### Changed

- Recommended high-quality configuration: prune old tool results, compact at 0.75. Measured 10.96M consumed tokens at 96.91% need coverage versus 12.75M at 96.85% for the fixed baseline: 14.0% fewer tokens at equal quality.

### Verified

- 75 tests pass. Docs gate clean. CI green on v0.3.0.

## [0.2.0] — 2026-10-29

### Added

- Preset override generator (`scripts/preset-override.mjs`) for Web and Desktop profiles, with tests and an operator guide. Composition verified on the real `tauri` dump: 8 presets, 8 compaction groups, one policy row each.
- Calibration estimators `fitReuseTau` and `ewmaGrowth` in `@optcompact/core`.
- BDD acceptance suite expanded; suite total 59 tests plus 5 generator tests.

## [0.1.1] — 2026-10-29

### Added

- Live headless proof for the DeepSeek Harness plugin: two committed compactions through the stock backend ([report](../qa/runs/2026-10-29-live-dsh.md)).
- Step-boundary snapping for compaction cuts, so a cut cannot split a step.
- JSONL decision evidence for the harness adapter, including skip reasons and committed ranges.
- Codex app-server JSON-RPC client with handshake, thread creation, and compaction calls.
- Codex protocol check: newline-delimited framing, `thread/start`, and `thread/compact/start` verified ([report](../qa/runs/2026-10-29-codex-protocol.md)).
- BDD acceptance suite in `packages/core/test/acceptance.test.ts`.

### Fixed

- The plugin now resolves the routed model from `agent.options` when no request header exists yet.
- Removed the default export that prevented Cordis from reading the plugin `inject` list.

## [0.1.0] — 2026-10-29

### Added

- `@optcompact/core`: reuse-hazard value model, Weibull fidelity curve, prefix-gain decision rule, renewal-reward interval, anchor-retention metric, checkpoint guard and quality floor.
- `@optcompact/dsh`: DeepSeek Harness policy plugin over the stock compaction backend, with overflow recovery delegation.
- `@optcompact/codex`: app-server usage controller, compaction request emitter, PostCompact hook parser.
- `@optcompact/sim`: seeded ground-truth simulator with never, fixed, periodic, and hazard policies.
- Normative model spec, product spec, ADR-0001 and ADR-0002, research notes for both harnesses and the literature, testing strategy, and the first simulation run report.
- 41 unit and contract tests.

### Known limitations

- Live DeepSeek Harness mount and live Codex compaction are unverified.
- Need coverage is not task success; task-level evaluation is pending.
- Web and Desktop DSH profiles need a preset override that v0.1.0 does not ship.
