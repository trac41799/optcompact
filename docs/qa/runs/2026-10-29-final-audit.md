# Objective audit, v0.2.0

**Verdict:** the deliverable is complete. Two runtime checks remain environment-limited and are listed as residual risks, not open work.

## Objective → evidence

| Objective element | Evidence |
|---|---|
| Mathematical model of the optimal compaction point | [`docs/specs/compaction-model.md`](../specs/compaction-model.md): hazard value, rate-distortion fidelity, prefix gain, quality floor, renewal-reward interval, nine propositions and invariants |
| Scientific grounding | [`docs/research/compaction-literature.md`](../research/compaction-literature.md): 44 quantitative anchors, theory toolbox, evidence gaps |
| Optimal token/quality ratio | Quality floor plus loss aversion produce a frontier; measured in [`docs/qa/runs/2026-10-29-simulation.md`](../qa/runs/2026-10-29-simulation.md) |
| SDD | Product spec, model spec, Codex spec, plan, ADR-0001, ADR-0002 |
| TDD | Core tests written first, RED observed, 27 then 36 core tests; plan records the loop |
| BDD | `packages/core/test/acceptance.test.ts`: nine Given/When/Then scenarios |
| DeepSeek Harness plugin | `packages/dsh`; live headless run with two committed compactions ([report](../qa/runs/2026-10-29-live-dsh.md)) |
| Web/Desktop support | `scripts/preset-override.mjs`; real `tauri` dump: 8 presets, 8 groups, one policy row each, `auto: false` |
| Codex adapter | `packages/codex`: policy, app-server JSON-RPC client, hook parser; protocol verified ([report](../qa/runs/2026-10-29-codex-protocol.md)) |
| Published repository | https://github.com/trac41799/optcompact, public, releases v0.1.0 → v0.2.0, CI green |
| Documentation governance | Scaffolded with the user `docs-ops` repo; `check_docs.py --strict` reports 0 errors and 0 warnings |

## Gates

- `pnpm test`: 64 pass, 0 fail.
- `pnpm typecheck`: exit 0.
- `node scripts/check-links.mjs`: all links resolve.
- CI: green on `v0.2.0` (run 40738999374).

## Residual risks

1. **Codex full compaction.** The app-server handshake, thread creation, and `thread/compact/start` are verified. A compaction of a populated thread needs an account with quota. The account hit its usage limit.
2. **Web live boot.** The preset overlay composes correctly on the real `tauri` dump. It was not booted to avoid replacing the live session server.
3. **Task-level quality.** Need coverage is a proxy. A SWE-bench-style evaluation and per-model fidelity calibration remain future work.

## Recommendation

Ship v0.2.0 as the deliverable. Treat the three residuals as follow-up experiments, not missing implementation.
