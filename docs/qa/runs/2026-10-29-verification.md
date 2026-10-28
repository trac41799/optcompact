# Verification run: v0.1.0, 2026-10-29

**Verdict:** all local gates pass. CI passed on `main`. The release exists. Two live-harness gates remain open.

## Commands and results

| Gate | Command | Result |
|---|---|---|
| Build | `pnpm build` | exit 0 |
| Tests | `pnpm test` | 41 pass, 0 fail |
| Types | `pnpm typecheck` | exit 0 |
| Docs | `python ../docs-ops/scripts/check_docs.py --strict --root .` | 0 errors, 0 warnings |
| Links | `node scripts/check-links.mjs` | all relative links resolve |
| CI | GitHub Actions run `40734190220` | success |
| Release | `gh release view v0.1.0` | published |

Test breakdown: core 27, DeepSeek Harness 6, simulator 4, Codex 4.

## Open gates

- Live DeepSeek Harness mount. The contract tests use a fake seam; no real composition loaded the plugin.
- Live Codex compaction. The account hit its usage limit, so only hook parsing and the controller logic are verified.
- Task-level evaluation. Need coverage is a proxy, not SWE-bench success.

## Evidence policy

This report records the latest run. Git history holds earlier runs. The commands above are reproducible from the tag `v0.1.0`.
