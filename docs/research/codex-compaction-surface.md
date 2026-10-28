# Codex CLI Compaction Surface (0.164.0)

## Conclusion (BLUF)

Native compaction hooks exist in Codex CLI 0.164.0. `PreCompact` and `PostCompact` are real hook
events, verified three ways: the installed binary contains both event names, the generated hook
schemas ship a `pre-compact.command.input/output` pair, and the feature was merged as
[openai/codex#19905](https://github.com/openai/codex/pull/19905) on 2026-05-07.

What those hooks can do is narrow. `PreCompact` can *block* a compaction that is already happening
(`continue: false` aborts the turn). It cannot *trigger* compaction, cannot schedule it, and its
payload carries no token counts. There is no hook output field that requests compaction.

Only one API can force compaction at a chosen moment: app-server `thread/compact/start` over
JSON-RPC. That same connection also streams `thread/tokenUsage/updated` and emits a
`contextCompaction` item, which together are exactly the two signals an optimal-compaction policy
needs. A `codex exec --json` wrapper cannot do this: its item enum has no compaction variant and it
exposes usage only once per turn, after the fact.

Recommended adapter: a **`codex app-server` client** that observes usage, decides, and calls
`thread/compact/start`; plus an optional `PreCompact` hook used only as a veto (policy says "too
early"), never as the scheduler.

## Scope

Target: locally installed `codex-cli 0.164.0`
(`C:\Users\mrtra\AppData\Local\Programs\OpenAI\Codex\bin\codex.exe`), config dir
`C:\Users\mrtra\.codex`, Windows.

Evidence classes used below:

- **local** — read from the installed binary, its files, or its `--help` output in this pass.
- **docs** — official Codex documentation on `learn.chatgpt.com` (the current docs host).
- **source** — `openai/codex` at `main`; may be ahead of 0.164.0, flagged where it matters.
- **unverified** — plausible, not confirmed from a primary source in this pass.

One local experiment was blocked: the signed-in account had exhausted its usage limit
(`turn.failed: "You've hit your usage limit"`), so no model turn ran. Hook *config parsing* was
exercised locally; hook *firing* and live compaction were not. Those points are marked unverified.

## Native compaction

### Triggers

| Trigger | Surface | Evidence |
|---|---|---|
| Token threshold, automatic | any session | docs |
| `/compact` | TUI slash command | docs |
| `thread/compact/start` | app-server JSON-RPC | docs + local + source |

Automatic compaction fires when the active context crosses `model_auto_compact_token_limit`. The
docs describe the key as "Token threshold that triggers automatic history compaction (unset uses
model defaults)", and its companion key
`model_auto_compact_token_limit_scope` as "`total \| body_after_prefix`", where `total` is the
default and `body_after_prefix` counts "only growth after the carried compaction-window prefix"
([config reference](https://learn.chatgpt.com/docs/config-file/config-reference.md)). The carried
prefix means the post-compaction context is not empty: a prefix survives and only growth past it is
counted.

The numeric default is not stated in the docs. The local model catalog gives the inputs but not the
formula: `gpt-6.1-sol` has `context_window = 500000`, `effective_context_window_percent = 95`,
`max_context_window = 872000` (`C:\Users\mrtra\.codex\models_cache.json`). Any derived threshold
(for example 475000) is **unverified**.

`codex config` is not a subcommand in 0.164.0. `codex config --help` prints the top-level help and
exits 0 (local), so config keys come from `-c key=value`, `codex features`, and the docs reference.

### Summarized vs truncation

Three distinct mechanisms exist, and they are not interchangeable:

1. **Local summarization** — the default. `/compact` "replaces earlier turns with a concise
   summary" ([developer commands](https://learn.chatgpt.com/docs/developer-commands.md)). The
   summarization prompt is overridable with `compact_prompt` ("Inline override for the history
   compaction prompt") or `experimental_compact_prompt_file` (config reference).
2. **Remote/provider compaction** — `model_providers.<id>.capabilities.remote_compaction` takes
   `unsupported | v2`; `v2` "sends compaction triggers through Responses", `unsupported` "uses local
   compaction" (config reference).
3. **Token-budget compaction (truncation)** — the source is explicit: "Token-budget compaction
   skips model/server summarization and installs a fresh context window instead. It is still modeled
   as compaction so compact hooks and `ContextCompaction` turn items observe the same lifecycle"
   (`codex-rs/core/src/compact_token_budget.rs`, source). This path is gated: feature `token_budget`
   is `under development  false` in `codex features list` (local).

A model-driven fallback also exists in the catalog: `model_messages.token_budget` (at
`$.models[0].model_messages.token_budget`) carries `auto_compact_fallback_buffer_tokens: 16384` and
an `auto_compact_fallback_prompt` whose text begins "The current context window is exhausted. Do not
continue the task..." and instructs the model to call `functions.new_context` (local, models cache).
Treat its activation conditions as **unverified**.

### What the model receives

Observed contract, from source: compaction emits a `TurnItem::ContextCompaction` pair
(`emit_turn_item_started` then `emit_turn_item_completed`) around `start_new_context_window`
(`compact_token_budget.rs`, source). The post-compaction request therefore contains a summary (or a
fresh window, on the token-budget path) plus the retained prefix, not the original turns. The exact
message list is **unverified**; `codex debug prompt-input` renders the model-visible prompt input as
JSON and is the right tool to confirm it.

### Config keys (exact names)

| Key | Meaning | Default |
|---|---|---|
| `model_auto_compact_token_limit` | auto-compaction threshold | unset = model defaults |
| `model_auto_compact_token_limit_scope` | `total` \| `body_after_prefix` | `total` |
| `compact_prompt` | inline compaction prompt override | unset |
| `experimental_compact_prompt_file` | load override from file | unset |
| `model_providers.<id>.capabilities.remote_compaction` | `unsupported` \| `v2` | provider default |
| `[features] hooks` | enable hook runtime | `true` |

## Hook system status

Hooks exist and are on by default. `codex features list` reports `hooks  stable  true` (local).
`codex --help` documents `--dangerously-bypass-hook-trust` ("Run enabled hooks without requiring
persisted hook trust for this invocation"), and this machine already has a working hook config plus
recorded trust hashes (`C:\Users\mrtra\.codex\hooks.json:1-15`,
`C:\Users\mrtra\.codex\config.toml:154-175`).

### Locations

Codex discovers hooks beside each active config layer, as `hooks.json` or inline `[hooks]` TOML, and
also from enabled plugins and managed `requirements.toml`
([hooks docs](https://learn.chatgpt.com/docs/hooks.md)):

- `~/.codex/hooks.json`
- `~/.codex/config.toml` (inline `[[hooks.<Event>]]`)
- `<repo>/.codex/hooks.json` and `<repo>/.codex/config.toml` (only when the project is trusted)
- plugins: `hooks/hooks.json` in the plugin root
- managed: `requirements.toml` `[hooks]` with `managed_dir` / `windows_managed_dir`

Layers merge; a higher-precedence layer does not replace lower ones.

### Events

Ten events (docs, and corroborated by the bridge package's own list of what it does *not* support):

`PreToolUse`, `PermissionRequest`, `PostToolUse`, `PreCompact`, `PostCompact`, `UserPromptSubmit`,
`SubagentStop`, `Stop`, `Interrupt`, `SessionStart`, `SubagentStart`, `SessionEnd`.

Local confirmation that compaction events are compiled into 0.164.0: the binary contains 85
occurrences each of `PreCompact`, `PostCompact` and `PostToolUse`, 102 of `PreToolUse`, 98 of
`UserPromptSubmit`, 87 of `SubagentStop`.

### Payload schema (PreCompact)

Verbatim from the generated schema
(`codex-rs/hooks/schema/generated/pre-compact.command.input.schema.json`, source):

```json
{
  "properties": {
    "agent_id":           { "type": "string" },
    "agent_type":         { "type": "string" },
    "cwd":                { "type": "string" },
    "hook_event_name":    { "const": "PreCompact", "type": "string" },
    "model":              { "type": "string" },
    "session_id":         { "type": "string" },
    "transcript_path":    { "$ref": "#/definitions/NullableString" },
    "trigger":            { "enum": ["manual", "auto"], "type": "string" },
    "turn_id":            { "type": "string" }
  },
  "required": ["cwd","hook_event_name","model","session_id","transcript_path","trigger","turn_id"]
}
```

There is no token-count, message-count, or context-size field. `additionalProperties: false`
confirms the list is closed.

### Output schema and exit semantics

`pre-compact.command.output.schema.json` and `post-compact.command.output.schema.json` are identical:

```json
{ "continue": true, "stopReason": null, "suppressOutput": false, "systemMessage": null }
```

Semantics:

- `continue: false` on `PreCompact` stops before compacting. Source is unambiguous about the cost:
  `PreCompactHookOutcome::Stopped => return Err(CodexErr::TurnAborted)`
  (`codex-rs/core/src/compact_token_budget.rs`, source). Blocking compaction ends the turn; it does
  not merely skip the compaction and continue.
- `continue: false` on `PostCompact` likewise returns `TurnAborted` (same source).
- `systemMessage` surfaces as a UI/event warning. `suppressOutput` is parsed but not implemented.
- For other events the docs add `decision: "block"` shapes and exit code `2` with `stderr`; those
  belong to `PreToolUse` / `PostToolUse` / `UserPromptSubmit` / `Stop`, not to the compact events.
- Plain `stdout` is ignored for `PreCompact`/`PostCompact`.

### Can a hook block, defer, or trigger compaction?

| Capability | Answer | Basis |
|---|---|---|
| Block an in-flight compaction | yes, `continue: false` (aborts the turn) | schema + source |
| Annotate / warn | yes, `systemMessage` | schema |
| Defer / reschedule compaction | no | no output field exists; closed schema |
| Trigger compaction | no | no output field exists; closed schema |
| Observe token usage | no | payload has no counters; `transcript_path` format is explicitly unstable |

`async: true` runs a hook in the background so Codex does not wait for it, but background hooks
"can't block, approve, rewrite, or otherwise control the operation that triggered them"; their output
is delivered at the next safe point. That is not deferred compaction.

### Trust model

Non-managed hooks must be reviewed and trusted before they run; trust is recorded against a hash, so
editing a hook re-triggers review. `/hooks` in the TUI is the review UI. Managed hooks from
`requirements.toml`, MDM, or cloud are trusted by policy and cannot be disabled from `/hooks`.
`allow_managed_hooks_only = true` skips user, project, session, and plugin hooks.

## Alternative integration points

| Surface | Events / data | Sees token usage | Can force compaction at a chosen turn | Notes |
|---|---|---|---|---|
| `notify` | command invoked for notifications; JSON payload on stdin. Local binary contains `agent-turn-complete`; docs list `approval-requested` historically | no tally of its own | no | fire-and-forget; `notify` is ignored in project-scoped config |
| MCP server (tools/resources/prompts) | model-callable tools | only if the model passes numbers in, or your server reads the transcript | no | no MCP tool triggers compaction; a hook can *call* an MCP tool (`mcp_tool` handler), not the reverse |
| `AGENTS.md` | developer instructions | no | no | can ask the model to wrap up, but the model has no compaction tool to call |
| `codex exec --json` | `thread.started`, `turn.started`, `turn.completed`, `turn.failed`, `item.*`, `error` | yes, once per turn: `usage.input_tokens / cached_input_tokens / output_tokens / reasoning_output_tokens` | no | `ThreadItemDetails` has no compaction variant, so compaction is invisible here (source: `codex-rs/exec/src/exec_events.rs`) |
| `codex app-server` (JSON-RPC) | full item stream incl. `contextCompaction`, `hook/started`/`hook/completed`, `thread/tokenUsage/updated` | yes, per-update | **yes — `thread/compact/start`** | experimental but the only control plane that exists |
| `codex mcp-server` | removed | n/a | n/a | "The `codex mcp-server` command and standalone `codex-mcp-server` binary have been removed. Use the Codex app server instead." |
| Wrapper/shim around the CLI | whatever the subprocess emits | only post-hoc | only by restarting/replaying; `exec` has no in-turn injection point | `/compact` is a TUI command, not an argument |

Detail on the app-server path (docs):

```json
{ "method": "thread/compact/start", "id": 25, "params": { "threadId": "thr_b" } }
{ "id": 25, "result": {} }
```

Progress arrives as standard `turn/*` and `item/*` notifications, "including a `contextCompaction`
item lifecycle (`item/started` then `item/completed`)". Usage arrives as
`thread/tokenUsage/updated`. The legacy `thread/compacted` notification is deprecated in favour of
the `contextCompaction` item.

`thread/compact/start` takes no trigger argument, so a client cannot label its request `manual` or
`auto`; the hooks will observe whatever Codex assigns. Which trigger value an app-server-initiated
compaction receives is **unverified**.

## dsh-hooks-codex

`@deepseek-ai/dsh-hooks-codex` exists on npm (latest `0.2.2-alpha.2`, 43 versions, ~1.09M
downloads/month; publisher `imccyu`, repo `deepseek-ai/deepseek-harness`). It is **not** installed
locally: `C:\Users\mrtra\AppData\Roaming\dsh-tauri\dependencies\dsh\node_modules\@deepseek-ai\` has
no `dsh-hooks-codex` entry.

Direction matters. The package does not expose Codex compaction to anything. It is the inverse
bridge: it "runs command hooks from an existing Codex `hooks.json` during agent runs", i.e. it
executes Codex-shaped hook config *inside DeepSeek Harness* (README, Summary). The wire protocol it
implements is the Codex/Claude hook format — snake_case payloads, `turn_id`, `model`, stdin without a
trailing newline, exit-code/stdout semantics — shared through `@deepseek-ai/dsh-hook-protocol`
("Shared Claude Code / Codex hook wire protocol: matcher engine, stdin/exit-code/stdout codec,
multi-hook merge"). Codex does not consume this package; nothing about it extends Codex.

It supports five events only: `PreToolUse`, `PostToolUse`, `SessionStart`, `UserPromptSubmit`,
`Stop` (`lib/types/config.d.ts:9`). The README states the limit plainly: "Unsupported hook events (5
of Codex's current 10) — `PermissionRequest`, `PreCompact`, `PostCompact`, `SubagentStart`, and
`SubagentStop`. Config for these events is silently dropped during parsing" (README:171).

Consequence for this project: `dsh-hooks-codex` is a usable reference for the *shape* of the hook
contract and a way to reuse Codex hooks under DSH, but it is not a Codex compaction adapter and
provides no path to trigger compaction in Codex.

## Recommended adapter

Two layers, because no single surface both observes usage and forces compaction.

**Control layer (primary): an app-server JSON-RPC client.**

```
codex app-server --listen stdio://        # or ws://127.0.0.1:PORT
  initialize { clientInfo, capabilities }
  thread/start  |  thread/resume
  turn/start
  <- thread/tokenUsage/updated           (policy input: current usage)
  <- item/completed  type=contextCompaction  (policy feedback: a compaction happened)
  -> thread/compact/start { threadId }    (policy output: compact now)
```

This is the honest design: usage is observable, the compaction moment is observable, and the trigger
is a real API rather than a side effect.

**Policy layer (optional): a `PreCompact` hook used only as a veto.**
When the policy would rather not compact yet, a `PreCompact` hook can return `continue: false`. The
cost is severe and must be documented to users: the turn is aborted, not paused. Use it for
hard floor rules ("never compact below N tokens"), not for scheduling.

Rejected shapes, with reasons:

- *`codex exec --json` wrapper injecting `/compact`.* `exec` accepts a prompt, not a slash command,
  and its JSONL carries no compaction item; a wrapper would be blind to compaction and could only
  restart the session. It can report usage (`turn.completed.usage`) but cannot act mid-turn.
- *MCP server as the actuator.* MCP tools are model-callable; the model has no compaction tool, and
  no MCP method reaches the compaction lifecycle.
- *Config + AGENTS.md only.* `model_auto_compact_token_limit` is a single global threshold with no
  per-turn logic; `AGENTS.md` can influence the model's prose but cannot call `/compact`.

Observable vs not, stated plainly:

| Signal | Observable? | How |
|---|---|---|
| Tokens consumed so far, per thread | yes | `thread/tokenUsage/updated` |
| That a compaction occurred, and when | yes | `contextCompaction` item (`item/started`/`item/completed`) |
| Whether it was manual or auto | yes, in hooks only | `PreCompact.trigger` |
| Exact model-visible token count before a request | no | usage updates are post-hoc |
| A chance to veto *before* cost is incurred | no | hooks fire at the lifecycle point, not before the request |
| Hook execution itself | yes | `hook/started` / `hook/completed` notifications |

## Verification plan

Cheap, ordered, each step falsifiable.

1. **Hook config parses with compaction events present.** Write a `hooks.json` with `PreCompact`,
   run `codex exec` pointing `CODEX_HOME` at it. Expect no "failed to parse hooks config" item.
   Note: the file must be UTF-8 **without BOM**; a BOM produced
   `failed to parse hooks config ... expected value at line 1 column 1` in this pass.
2. **PreCompact actually fires.** Set `model_auto_compact_token_limit = 2000`, feed a prompt larger
   than that, and have the hook append its stdin to a log. Expect one `PreCompact` record with
   `"trigger":"auto"` and no token counters. Then run the same probe via `thread/compact/start` and
   compare `trigger`.
3. **Blocking semantics.** Return `{"continue": false}` from `PreCompact`. Expect the turn to fail
   with a turn-aborted error and no compaction item — confirming veto-by-abort, not veto-by-skip.
4. **App-server control loop.** Drive
   `initialize → thread/start → turn/start`, read `thread/tokenUsage/updated`, call
   `thread/compact/start`, and assert an `item/completed` with `type: "contextCompaction"` arrives on
   the same `threadId`.
5. **Exec blindness check.** Run the same session under `codex exec --json` and assert no item with a
   compaction type appears, while `turn.completed.usage.input_tokens` grows. This documents why the
   app-server path is required.

Runtime facts from this pass that the tests should reproduce, not assume:
`codex features list` shows `hooks stable true`; the installed binary is 354,558,768 bytes; the
account in `C:\Users\mrtra\.codex\auth.json` must have quota, or every turn ends in `turn.failed`
before any compaction can occur.

## Sources

Official documentation (fetched 2026-10-29):

- [Hooks](https://learn.chatgpt.com/docs/hooks.md) — event table, locations, trust, matcher rules,
  PreCompact/PostCompact input and output, exit-code semantics.
- [Configuration Reference](https://learn.chatgpt.com/docs/config-file/config-reference.md) —
  `model_auto_compact_token_limit`, `model_auto_compact_token_limit_scope`, `compact_prompt`,
  `experimental_compact_prompt_file`, `remote_compaction`, `notify`.
- [Codex App Server](https://learn.chatgpt.com/docs/app-server.md) — `thread/compact/start`,
  `thread/tokenUsage/updated`, `contextCompaction` item, deprecated `thread/compacted`.
- [Non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode.md) — `codex exec --json`
  event types and `turn.completed.usage`.
- [Developer commands](https://learn.chatgpt.com/docs/developer-commands.md) — `/compact` in the
  slash-command table; removal of `codex mcp-server`.

GitHub `openai/codex`:

- [PR #19905 — Add compact lifecycle hooks](https://github.com/openai/codex/pull/19905) (merged
  2026-05-07).
- [PR #19060 — original external contribution](https://github.com/openai/codex/pull/19060) (closed,
  unmerged).
- `codex-rs/hooks/schema/generated/pre-compact.command.input.schema.json`,
  `pre-compact.command.output.schema.json`, `post-compact.command.output.schema.json`.
- `codex-rs/core/src/compact_token_budget.rs` — `TurnAborted` on `PreCompactHookOutcome::Stopped`;
  token-budget compaction skips summarization.
- `codex-rs/exec/src/exec_events.rs` — `ThreadItemDetails` has no compaction variant.

npm:

- [`@deepseek-ai/dsh-hooks-codex`](https://www.npmjs.com/package/@deepseek-ai/dsh-hooks-codex)
  (registry metadata + unpacked `README.md:171`, `lib/types/config.d.ts:9`).
- [`@deepseek-ai/dsh-hook-protocol`](https://www.npmjs.com/package/@deepseek-ai/dsh-hook-protocol) —
  shared Claude Code / Codex hook wire protocol.

Local installation:

- `C:\Users\mrtra\.codex\hooks.json:1-15` — live `PreToolUse` hook.
- `C:\Users\mrtra\.codex\config.toml:154-175` — `[hooks.state...]` trust hashes for
  `pre_tool_use`, `post_tool_use`, `session_start`, `session_end`.
- `C:\Users\mrtra\.codex\config.toml:5` — `notify` command.
- `C:\Users\mrtra\.codex\models_cache.json` — `context_window` 500000,
  `effective_context_window_percent` 95, `max_context_window` 872000 for `gpt-6.1-sol`;
  `$.models[0].model_messages.token_budget` with `auto_compact_fallback_buffer_tokens: 16384`.
- `codex --version` → `codex-cli 0.164.0`; `codex features list` → `hooks stable true`,
  `token_budget under development false`; `codex config --help` → no such subcommand.
