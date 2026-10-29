# OptCompact

[![CI](https://github.com/trac41799/optcompact/actions/workflows/ci.yml/badge.svg)](https://github.com/trac41799/optcompact/actions/workflows/ci.yml)

**Compact a coding-agent session when the value of carrying context falls below the cost of losing it.**

Fixed pressure thresholds (80% of the window, one global limit) ignore what the old context is worth, what the summary costs, and how much fidelity the summarizer loses. OptCompact computes a per-turn decision from observable signals and reports every term in token-equivalents, so the decision is auditable.

- **Model:** reuse hazard × re-derivation cost, Weibull rate-distortion fidelity, prefix-gain scheduling, renewal-reward interval.
- **Engine:** dependency-free TypeScript, deterministic, no model call on the decision path.
- **Adapters:** DeepSeek Harness policy plugin, Codex app-server controller and hook parser.
- **Evidence:** seeded simulator with latent reuse, plus 64 unit, contract, acceptance, and generator tests.

## Decision in one equation

For a context unit `i` with token size `s_i`, last reference `r_i`, re-derivation cost `w_i`, and summary retention `ρ`:

```text
G_i = λ·L·s_i·(1−ρ)                    tokens saved by not carrying the unit
    − (λ_in·s_i + λ_o·ρ·s_i)           summary cost, paid once
    − Λ·(1−φ_i)·V_i                     quality loss, priced
```

Compact the oldest prefix when its summed gain clears the gate. `V_i` is a discounted reuse-hazard value, `φ_i` is a rate-distortion fidelity curve, and `Λ` prices quality loss above raw re-derivation. Full derivation: [`docs/specs/compaction-model.md`](docs/specs/compaction-model.md).

## Simulated results

20 seeded 100-turn sessions, 200k window, latent reuse hidden from the policy:

| Policy | Tokens | Need coverage | Compactions |
|---|---|---|---|
| Never compact | 13.54M | 97.4% | 5.3 |
| Fixed 80% threshold | 11.93M | 96.9% | 9.8 |
| Periodic 15 turns | 12.94M | 96.9% | 7.7 |
| **OptCompact (default)** | **4.50M** | **83.2%** | 30.6 |
| OptCompact (quality floor 0.95) | 12.16M | 95.0% | 15.2 |
| **Prune old tool results, then compact** | **10.96M** | **96.9%** | 3.5 |
| Prune, compact harder (lowest at ≥96.6%) | 10.68M | 96.7% | 2.8 |

The result is a frontier, not a single number. Default settings trade 13.7 points of need coverage for a 62% token reduction. The quality-first profile recovers coverage at no token advantage over the fixed baseline.

The v0.3.0 tiered policy dominates the fixed baseline at the high-quality end: pruning old tool results before summarizing consumes 10.96M tokens at 96.9% coverage against 12.75M at 96.9%. Method and threats to validity: [`docs/qa/runs/2026-10-29-token-optimization.md`](docs/qa/runs/2026-10-29-token-optimization.md).

## Packages

| Package | Purpose |
|---|---|
| [`@optcompact/core`](packages/core) | Model, estimators, decision rule, anchor-retention metric |
| [`@optcompact/dsh`](packages/dsh) | DeepSeek Harness policy plugin over the stock compaction backend |
| [`@optcompact/codex`](packages/codex) | Codex app-server controller and hook evidence parser |
| [`@optcompact/sim`](packages/sim) | Seeded ground-truth policy comparison |

## Quick start

```bash
pnpm install
pnpm test        # builds, then runs every package test
pnpm typecheck
```

Decide for a synthetic state:

```ts
import { decide, defaultParams } from '@optcompact/core';

const decision = decide({
  turn: 40,
  windowTokens: 200_000,
  outputReserveTokens: 8_192,
  headroomTokens: 0,
  contextTokens: 150_000,
  growthPerTurn: 4_000,
  units: [
    { id: 'u1', type: 'file', tokens: 12_000, createdTurn: 3, lastReferencedTurn: 6 },
    { id: 'u2', type: 'tool', tokens: 40_000, createdTurn: 5, lastReferencedTurn: 7 },
    { id: 'u3', type: 'file', tokens: 9_000, createdTurn: 30, lastReferencedTurn: 39 }
  ],
  prices: { input: 1, output: 4, fixedCallCost: 20_000 },
  params: defaultParams()
});

console.log(decision.action, decision.cutIndex, decision.expectedGainTokens);
```

## DeepSeek Harness

The plugin requires a harness that exposes `ctx.compaction`, `ctx.tokenMeter`, and `ctx.llm`. It expects `dsh-compaction-basic` mounted with `auto: false`, because the plugin owns the trigger.

```bash
dsh plugin --profile <name> add @optcompact/dsh
dsh --profile <name> --dump-config   # confirm compaction-basic auto:false and the policy row
```

The bundle patch works for host-plane profiles (headless, SDK, custom). A live headless run mounted the plugin, compacted twice, and produced durable checkpoints: [`docs/qa/runs/2026-10-29-live-dsh.md`](docs/qa/runs/2026-10-29-live-dsh.md).

Web and Desktop isolate the compaction service per preset. Generate a preset overlay with `scripts/preset-override.mjs`; the procedure is in [`packages/dsh/PRESET-OVERRIDE.md`](packages/dsh/PRESET-OVERRIDE.md). The overlay is composition-verified on the real `tauri` dump: 8 presets, 8 groups, one policy row each.

## Codex

Codex can only be driven through `codex app-server`: it exposes `thread/tokenUsage/updated` and `thread/compact/start`. Hooks (`PreCompact`, `PostCompact`) cannot trigger or defer compaction; `continue: false` aborts the turn. The package therefore ships a controller plus a hook-payload parser, and marks the control path experimental.

```ts
import { CodexPolicy } from '@optcompact/codex';

const policy = new CodexPolicy({ windowTokens: 200_000 });
const request = policy.observe({ threadId: 'thr_1', usage: { inputTokens: 168_000 } });
if (request) send(request); // { method: 'thread/compact/start', params: { threadId } }
```

Details and limits: [`docs/research/codex-compaction-surface.md`](docs/research/codex-compaction-surface.md).

## Repository layout

```
packages/core      model and decision rule
packages/dsh       DeepSeek Harness plugin
packages/codex     Codex controller and hooks
packages/sim       simulator and benchmarks
docs/specs         normative model and product spec
docs/decisions     ADR-0001 model, ADR-0002 adapters
docs/research      harness surfaces and literature
docs/qa            testing strategy and run evidence
```

## Status and limitations

- v0.3.0. The model and both adapters are implemented.
- The DeepSeek Harness plugin passed a live headless run with two committed compactions.
- The Codex app-server protocol is verified. A full compaction of a populated thread waits on account quota.
- Web and Desktop use a generated preset overlay. Composition is verified; a live Web boot was not run in this repository.
- Need coverage is not task success. Task-level evaluation is the next gate.
- Defaults are hypotheses. Calibration per model and summarizer is required before production use.

## License

MIT.
