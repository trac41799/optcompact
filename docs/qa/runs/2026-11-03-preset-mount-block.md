# Incident: every DSH session blocked by a pending preset row, 2026-11-03

**Verdict:** one defect in the v0.5.0 deployment contract. The policy plugin required the preset-scoped `compaction` service. DSH treats a preset row that waits for a service as fatal for every session on that preset.

## Symptoms

Every model operation in DSH and DSH Tauri failed with:

```text
gateway/internal: resume failed for session "session-b35c6ccd-…":
RemoteError: optcompact-policy (@optcompact/dsh): waiting for compaction
```

A new session (`agentPreset: standard`, zero turns) could not be resumed. No session on any preset could run.

## Evidence

- The preset registry formats that line in `auditRows`. It lists every enabled row whose injected service is not visible.
- `retain()` turns one audit line into `RemoteError("agent-preset/invalid")`. The session controller wraps any resume rejection as `gateway/internal: resume failed`.
- `--dump-config` showed the row in the right place: last child of each preset's `compaction` group. So the file was not the failing input. The running harness had booted 90 s before the patch was rewritten.
- An offline mount of the posted composition activated every row. The audit was empty. The composition used the real group, backend, command, pruner, and policy bundle.
- `command-compact` also injects `compaction`, and it was not reported. One sibling cannot see the service while another can. The reported row was therefore not inside the isolated group in the booted composition.

## Root causes

1. **A required service in an advisory plugin.** `@optcompact/dsh` injected `compaction`. Only a row inside the preset's isolated group can resolve it. Any other placement leaves the row pending forever.
2. **Pending is fatal upstream.** The preset registry refuses to retain a preset with a pending row. A misplaced policy row took down session resume instead of only itself.

## Fixes

- `inject` is now `['tokenMeter', 'llm']`. The backend is resolved per call by `compactionOf`, which uses `ctx.get('compaction')` plus a guarded property fallback.
- A missing backend warns once per session. The step paths record `no-compaction-service`. The step continues unchanged.
- The `agent/request-error` overflow path delegates to `next()` when the backend is absent. It has no turn number, so it writes no evidence.
- Six contract tests cover the inert paths and the live resolution path. They cover gain mode, checkpoint mode, `ctx.get`, the injected-service list, and both overflow outcomes.

## Verification

- 98 tests pass, typecheck clean.
- Offline preset mount with the rebuilt bundle: `inject=[tokenMeter,llm]`, all five rows active, audit empty.
- Offline mount with the row outside the group. The row activates, the audit stays empty, and the policy finds no backend.
- `dsh --profile tauri --dump-config`: 8 presets, one policy row inside each `compaction` group.

## Residual

- The running harness must restart to load the rebuilt bundle and the current patch. The failed process had booted before the profile patch was corrected.
- A hand-edited vendored bundle is replaced by a source build. Never patch the vendored bundle by hand.
- A row outside the group that still reaches an ancestor scope's backend drives that backend, not the preset's. `compactionOf` does not judge which engine it found.
