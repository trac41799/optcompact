# @optcompact/codex

Codex integration for OptCompact. The control path is experimental; the hook parser is stable.

## Why app-server

Codex 0.164 exposes `PreCompact` and `PostCompact` hooks, but a hook cannot trigger or defer compaction. `continue: false` aborts the turn. The only surface that both observes usage and forces compaction is `codex app-server`:

```text
initialize → thread/start → turn/start
  ← thread/tokenUsage/updated
  ← item/completed type=contextCompaction
  → thread/compact/start { threadId }
```

`codex exec --json` carries no compaction item, so a wrapper cannot see or act on compaction.

## Usage

```ts
import { CodexPolicy } from '@optcompact/codex';

const policy = new CodexPolicy({ windowTokens: 200_000, outputReserveTokens: 8_192 });
for await (const event of usageEvents) {
  const request = policy.observe({ threadId: event.threadId, usage: { inputTokens: event.inputTokens } });
  if (request) send(request);
}
```

After Codex confirms a compaction item, call `policy.noteCompaction(threadId)`.

## Hook evidence

`parseCompactHook(stdinText)` turns a `PreCompact` or `PostCompact` payload into a record. Use it to log compaction events; do not return `continue: false` unless aborting the turn is acceptable.

## Client

`CodexAppServer.connect()` spawns the server, performs the handshake, starts a thread, and sends `thread/compact/start`. The framing is newline-delimited JSON, verified against codex-cli 0.164.0 ([report](../../docs/qa/runs/2026-10-29-codex-protocol.md)).

```ts
import { CodexAppServer } from '@optcompact/codex';

const server = await CodexAppServer.connect();
const threadId = await server.startThread(process.cwd());
await server.compact(threadId);
server.close();
```

## Limits

- A full compaction of a populated thread is unverified because the account hit its usage limit. Framing, handshake, thread creation, and the compaction call are verified.
- Usage updates are post-hoc; they are not the exact model-visible token count before a request.
- Hooks cannot veto by skipping, only by aborting.
