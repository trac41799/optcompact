# @optcompact/dsh

DeepSeek Harness policy plugin that decides when to compact, while the stock `dsh-compaction-basic` backend keeps the durable transaction.

## How it works

1. The composition mounts `dsh-compaction-basic` with `auto: false`. The backend still provides `/compact`, summarization, tool-pair validation, checkpoint framing, and overflow recovery.
2. This plugin listens on `agent/pre-step`. It reads `ctx.tokenMeter.measure(session)` and the routed model window from `ctx.llm.resolveModelInfo`.
3. It calls `decide()` from `@optcompact/core`. On `compact`, it calls `ctx.compaction.compactRegion(start, end, agent, signal)` with the chosen cut.
4. It re-adds an `agent/request-error` listener for `CONTEXT_WINDOW_EXCEEDED`, delegates recovery to the backend, and retries only after `surface.replaceGeneration` advances.

A decision error never blocks the step: the plugin logs a warning and calls `next()`.

## Mounting

Host-plane profiles (headless, SDK, custom) use the bundle patch:

```bash
dsh plugin --profile <name> add @optcompact/dsh
```

The patch sets `compaction-basic.auto: false` and inserts the policy row. Verify with:

```bash
dsh --profile <name> --dump-config
```

Web and Desktop profiles mount an isolated `compaction` group inside each preset. A host-plane insert cannot see that isolated service. Those profiles need the preset configuration restated with the policy row inside the compaction group; that override is not shipped in v0.1.0.

## Configuration

| Key | Default | Meaning |
|---|---|---|
| `firstCompactableNode` | 1 | First surface node the policy may shadow; node 0 is the system prompt |
| `prices.input` | 1 | Utility per input token |
| `prices.output` | 4 | Utility per output token |
| `prices.fixedCallCost` | 20000 | Fixed cost of one summarization call |
| `outputReserveTokens` | 8192 | Fallback output reservation |
| `growthPerTurn` | 2000 | Fallback growth estimate |
| `params` | core defaults | Model parameter overrides |
| `onDecision` | none | Receives every decision for evidence |

## Known limits

- The range walk is local because the backend does not export its selector.
- Checkpoint generation is not detected yet, so a degraded checkpoint is not protected on this path.
- The live mount is unverified in this environment. The unit tests use a fake seam that mirrors the measured signatures.
