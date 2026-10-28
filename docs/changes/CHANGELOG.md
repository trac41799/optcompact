# Changelog

All notable changes to this project. Format: [Keep a Changelog](https://keepachangelog.com/). Versioning: [SemVer](https://semver.org/).

## [Unreleased]

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
