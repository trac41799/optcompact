# spec(codex): compaction adapter

**Status:** Proposed · **Version:** 0.1.0

## Purpose

Define exactly what OptCompact can observe and act on in Codex, so users do not expect a control that does not exist. Evidence: [`docs/research/codex-compaction-surface.md`](../research/codex-compaction-surface.md).

## Scope

Codex CLI 0.164.x. The app-server protocol is experimental and changes without notice.

## Supported signals

- **Token usage.** `thread/tokenUsage/updated` reports usage after a request. It is post-hoc, not a pre-request count.
- **Compaction events.** An `item/completed` with type `contextCompaction` proves a compaction happened on a thread.
- **Hook events.** `PreCompact` and `PostCompact` fire around a compaction. The payload carries `cwd`, `model`, `session_id`, `transcript_path`, `trigger`, and `turn_id`. It carries no token counts.

## Supported actions

- **Force compaction.** `thread/compact/start { threadId }` requests compaction through the app-server.
- **Record evidence.** A hook can append a `CompactHookRecord` to a log.

## Unsupported actions

- A hook cannot skip or defer compaction. `continue: false` aborts the turn.
- `codex exec --json` cannot observe or trigger compaction, because its item enum has no compaction variant.
- MCP tools cannot reach the compaction lifecycle.
- The adapter cannot read the exact model-visible token count before a request.

## Requirements

- **R1.** The controller MUST emit `thread/compact/start` only for a thread it observed.
- **R2.** The controller MUST NOT emit a request while a previous one is unconfirmed.
- **R3.** A hook handler MUST NOT return `continue: false` by default.
- **R4.** The package MUST document that the app-server path is experimental.

## Acceptance criteria

- **AC-1** A usage stream that crosses the model gate produces exactly one compaction request.
- **AC-2** `noteCompaction` applies the cooldown.
- **AC-3** A `PostCompact` payload parses into a record with event, trigger, session, and timestamp.
- **AC-4** No code path calls `continue: false` unless a caller opts in.
