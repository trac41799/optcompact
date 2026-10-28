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

## Limits

- The app-server protocol is experimental and was unverified end to end in this environment because the account hit its usage limit.
- Usage updates are post-hoc; they are not the exact model-visible token count before a request.
- Hooks cannot veto by skipping, only by aborting.
