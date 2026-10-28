# ADR-0002: Adapter architecture — policy plugin over stock transactions

**Status:** Proposed · **Date:** 2026-10-29 · **Supersedes:** none

## Context

The model is harness-agnostic, but each harness exposes a different seam.

DeepSeek Harness registers exactly one `CompactionEngine` as `ctx.compaction`. The shipped `dsh-compaction-basic` owns the durable transaction, tool-pair balance, checkpoint framing, summarizer caching, and overflow recovery. Its automatic trigger is a fixed pressure listener registered in a private method.

Codex 0.164 exposes `PreCompact` and `PostCompact` hooks, but a hook cannot trigger or defer compaction. Calling `continue: false` aborts the turn. The only surface that observes usage and forces compaction is the `codex app-server` JSON-RPC control plane (`thread/tokenUsage/updated`, `thread/compact/start`, `contextCompaction` items).

Options considered:

1. **Subclass the DSH backend and override `compactIfNeeded`.** Changes decisions, not where or when the check runs. Pins the package to a private class shape. Must replace every mounted engine row.
2. **Sibling policy plugin plus `auto: false`.** Stock engine keeps the transaction. The plugin owns the trigger and re-adds overflow recovery. Uses only the documented seam.
3. **Wrapper around the Codex CLI.** `codex exec --json` carries no compaction item and accepts no in-turn command, so a wrapper is blind and cannot act.
4. **Codex app-server controller plus hooks.** The only surface that both observes and acts.

## Decision

Adopt option 2 for DeepSeek Harness and option 4 for Codex.

For DeepSeek Harness, the plugin listens on `agent/pre-step`, builds state from `ctx.tokenMeter.measure` and `ctx.llm.resolveModelInfo`, decides with `@optcompact/core`, and calls `ctx.compaction.compactRegion`. It re-adds an `agent/request-error` listener that delegates `CONTEXT_WINDOW_EXCEEDED` recovery to the stock backend and retries only after `surface.replaceGeneration` advances.

For Codex, the package provides a `CodexPolicy` controller for the app-server usage stream and a parser for `PostCompact` hook payloads. It states that the control path is experimental and unverified end to end.

## Consequences

Positive:

- The durable transaction, tool balance, and summarizer stay stock.
- The policy uses documented seams only.
- Each adapter is small enough to test against a fake harness.
- The same core decision drives both harnesses.

Negative:

- The DSH plugin must copy the backend range walk because it is not exported.
- Preset-backed DSH profiles isolate the compaction service, so the bundle patch reaches host-plane profiles only.
- Codex hooks cannot veto without aborting a turn, so evidence collection is their only use.
- The Codex control path depends on an experimental app-server API.

## Alternatives rejected

- Subclassing: couples to private internals and cannot change timing.
- CLI wrapper: cannot observe or trigger compaction.
- MCP actuator: no MCP method reaches compaction.
