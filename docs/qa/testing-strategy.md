# Testing strategy

**Status:** Proposed

## 1. Gates

| Gate | Command | Blocks release |
|---|---|---|
| Unit and contract tests | `pnpm test` | yes |
| Type safety | `pnpm typecheck` | yes |
| Build | `pnpm build` | yes |
| Docs rules | `python ../docs-ops/scripts/check_docs.py --strict --root .` | yes |
| Simulator comparison | `pnpm sim` | yes, on regression |
| Live harness smoke | `pnpm smoke:dsh` | yes |

## 2. Test layers

- **Formula tests.** Each equation in the model has one shape test and one extreme-value test.
- **Decision tests.** Every branch of `decide()` has a test. The branches are empty, single unit, cooldown, hard pressure, soft positive, soft below gate, no feasible cut, and tool split.
- **Property tests.** Seeded random states verify cut bounds, tool balance, and breakdown additivity.
- **Contract tests.** Each adapter is tested against a fake harness that reproduces the real event and transaction shapes.
- **Simulator tests.** A seeded ground-truth session verifies that a never-compact policy overflows and that the hazard policy stays inside the window.
- **Docs tests.** The checker plus a link scan.

## 3. Thresholds

- Core decision latency: under 1 ms for 2,000 units on the reference laptop.
- Decision record size: under 8 KB.
- Simulator: the hazard policy must not outspend the fixed-threshold baseline. It must retain at least as many needs. This holds on at least 90% of seeds.

## 4. Evidence policy

- Latest run only under `docs/qa/evidence/`; history lives in git.
- Dated run reports under `docs/qa/runs/`.
- Every report lists the command, the commit, and the summary line.
- Do not paste screenshots of code.

## 5. Regression rules

- A model change updates the spec and adds a calibration note.
- A failing test is fixed, never deleted.
- A new adapter ships with a smoke script and a limitation section.
