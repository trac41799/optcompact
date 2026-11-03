# OptCompact

[![CI](https://github.com/trac41799/optcompact/actions/workflows/ci.yml/badge.svg)](https://github.com/trac41799/optcompact/actions/workflows/ci.yml)

**Distill context at task boundaries: one checkpoint removes 88% of the window and keeps 99.6% of critical context.**

Fixed pressure thresholds (80% of the window, one global limit) trim rather than distill. OptCompact triggers at 50% occupancy on a task boundary, replaces history with a bounded structured checkpoint, keeps a short verbatim tail, and reports the measured per-event reduction and post-compaction footprint.

- **Model:** reuse hazard × re-derivation cost, rate-distortion fidelity, boundary checkpoints, prefix-gain scheduling, renewal-reward interval.
- **Engine:** dependency-free TypeScript, deterministic, no model call on the decision path.
- **Adapters:** DeepSeek Harness policy plugin (checkpoint mode default), Codex app-server controller and hook parser.
- **Evidence:** seeded simulator with latent reuse and critical units, plus 92 unit, contract, acceptance, and generator tests.

## Decision in one equation

For a context unit `i` with token size `s_i`, last reference `r_i`, re-derivation cost `w_i`, and summary retention `ρ`:

```math
\begin{aligned}
G_i &= \lambda\,L\,s_i\,(1-\rho)
     && \text{tokens saved by not carrying the unit} \\
    &\quad - \bigl(\lambda_{\mathrm{in}}\,s_i + \lambda_o\,\rho\,s_i\bigr)
     && \text{summary cost, paid once} \\
    &\quad - \Lambda\,(1-\phi_i)\,V_i
     && \text{quality loss, priced}
\end{aligned}
```

Compact the oldest prefix when its summed gain clears the gate. $V_i$ is a discounted reuse-hazard value, $\phi_i$ is a rate-distortion fidelity curve, and $\Lambda$ prices quality loss above raw re-derivation. Full derivation: [`docs/specs/compaction-model.md`](docs/specs/compaction-model.md).

## Measured results

20 seeded 100-turn sessions with critical units tracked separately. Two different numbers matter:

- **Per-event reduction**: how much one compaction removes, `1 - post/pre`.
- **Post occupancy**: context size after the checkpoint, as a fraction of the window.

| Policy | Total tokens | Per-event reduction | Post occupancy | Critical recall | All-need coverage |
|---|---|---|---|---|---|
| Fixed 80% threshold | 12.75M | 30% | 58.3% | 97.1% | 96.8% |
| Prune + compact | 10.96M | 19% | 62.8% | 99.8% | 96.9% |
| **Boundary checkpoint at 50%** | **8.16M** | **88%** | **8.6%** | **99.6%** | **90.6%** |
| Checkpoint at 40%, 1000-token budget | 7.40M | 94% | 4.7% | 99.3% | 89.0% |

The earlier "14%" was session-total token savings against a baseline, not the compaction ratio. The default checkpoint mode now removes 88% of the context per event, leaves 8.6% of the window, and retains 99.6% of critical context. All-need coverage falls because bulk tool detail is deliberately discarded.

Method and threats to validity: [`docs/qa/runs/2026-11-02-checkpoint-mode.md`](docs/qa/runs/2026-11-02-checkpoint-mode.md).

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
docs/decisions     ADR-0001..0005 model, adapters, checkpoint, occupancy
docs/research      harness surfaces and literature
docs/qa            testing strategy and run evidence
```

## Status and limitations

- v0.5.0. The model and both adapters are implemented.
- The DeepSeek Harness plugin passed a live headless run with two committed compactions.
- The Codex app-server protocol is verified. A full compaction of a populated thread waits on account quota.
- Web and Desktop use a generated preset overlay. Composition is verified; a live Web boot was not run in this repository.
- Need coverage is not task success. Task-level evaluation is the next gate.
- Defaults are hypotheses. Calibration per model and summarizer is required before production use.

## License

MIT.
