# Changelog

All notable changes to this project. Format: [Keep a Changelog](https://keepachangelog.com/). Versioning: [SemVer](https://semver.org/).

## [Unreleased]

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
