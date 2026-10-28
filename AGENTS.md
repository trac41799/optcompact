# AGENTS.md — OptCompact repository instructions

## What this repository is

OptCompact computes when a coding-agent session should compact its context.
The core package holds the math model and policy engine.
The adapters connect the engine to DeepSeek Harness and Codex.

## Read before changing code

1. `docs/specs/compaction-model.md` — normative model and decision rule.
2. `docs/architecture/architecture.md` — package boundaries.
3. `docs/CONTRIBUTING.md` — docs lifecycle and review gates.

## Commands

- Install: `pnpm install`
- Test: `pnpm test`
- Typecheck: `pnpm typecheck`
- Build: `pnpm build`
- Docs gate: `python ../docs-ops/scripts/check_docs.py --strict --root .`

## Engineering rules

- Work test-first. Write the failing test, then the minimal code.
- Never weaken or delete a failing test to pass a gate.
- Keep `@optcompact/core` free of runtime dependencies.
- Keep every exported function documented with a one-line summary.
- Run `pnpm test` and `pnpm typecheck` before every commit.
- Update the spec, ADR, and changelog in the same change.

## Documentation rules

- Follow the user `docs-ops` conventions.
- One home per fact. Link instead of restating.
- Lead every document with the conclusion.
- Use uppercase RFC 2119 keywords only under `docs/specs`, `docs/decisions`, `docs/standards`.
- Never hand-edit generated outputs.

## Boundaries

- Do not publish to npm without explicit user approval.
- Do not change model defaults without an ADR and calibration evidence.
- Do not add a network call to `@optcompact/core`.
