# Codex app-server protocol check, 2026-10-29

**Verdict:** the app-server control path is real and reachable. Framing, handshake, thread creation, and the compaction call all respond. A full compaction still needs quota.

## Environment

- `codex-cli 0.164.0` on Windows.
- Account mode: `chatgpt` (plan `plus`). The account hit its usage limit earlier, so no turn ran.

## Method

Spawn `codex app-server --listen stdio://` and exchange newline-delimited JSON-RPC messages.

1. `initialize` with `clientInfo` and empty `capabilities`.
2. `thread/start` with `{ cwd }`.
3. `thread/compact/start` with `{ threadId }`.

## Observed

Framing is **newline-delimited JSON**. There are no `Content-Length` headers.

```json
{"id":1,"result":{"userAgent":"optcompact/0.164.0 (Windows 10.0.19045; x86_64) ...","codexHome":"C:\\Users\\mrtra\\.codex","platformFamily":"windows","platformOs":"windows"}}
```

`thread/start` returns the id at `result.thread.id`:

```json
{"thread":{"id":"01a183a4-38b0-7d52-863b-89741813328a","environments":[{"environmentId":"local","cwd":"..."}],"sessionId":"..."}}
```

`thread/compact/start` returns an empty result:

```json
{"id":3,"result":{}}
```

## What this proves

- The client framing in `packages/codex/src/appserver.ts` matches the runtime.
- The thread id path in `CodexAppServer.startThread` matches the runtime.
- The compaction request shape in `CodexPolicy` matches the runtime.

## What this does not prove

- An actual compaction of a populated thread. That needs a completed turn.
- The `contextCompaction` item lifecycle after a real compaction.
- Hook firing. Only hook payload parsing is verified.

The remaining gate needs an account with quota. It is not a code gap.

## Code

`packages/codex/src/appserver.ts` implements `JsonRpcClient` and `CodexAppServer`. Unit tests cover correlation, error rejection, notification forwarding, and malformed input.
