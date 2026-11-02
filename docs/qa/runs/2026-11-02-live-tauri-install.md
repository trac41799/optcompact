# Live tauri profile install, 2026-11-02

**Verdict:** the checkpoint policy is installed into the live `tauri` profile and composes into all 8 agent presets. It activates on the next app start.

## What changed on this machine

| Item | Location |
|---|---|
| Plugin bundle (self-contained ESM) | `%DSH_HOME%\profiles\tauri\vendor\optcompact-dsh` |
| Profile dependency | `package.json` → `"@optcompact/dsh": "link:.../vendor/optcompact-dsh"` |
| Policy rows and backend caps | `%DSH_HOME%\profiles\tauri\cordis.patch.yml` (57 KB appended) |
| Decision evidence | `%DSH_HOME%\profiles\tauri\optcompact-events.jsonl` |
| Backups | `cordis.patch.yml.bak-optcompact-20261102-143218`, `package.json.bak-optcompact-20261102-143218` |

Each of the 8 presets gained one `optcompact-policy` row inside its isolated `compaction` group. Each `compaction-basic` row gained `auto: false` and `maxTokens: 32768`.

## Verification

- `dsh --profile tauri --dump-config` exits 0.
- 8 preset blocks, 8 policy rows, 8 `auto: false`, 8 `maxTokens: 32768`, 8 `evidencePath` rows.
- `import('@optcompact/dsh')` from the profile root exports `apply`, `inject`, `install`, `maybeCheckpoint`, `maybeCompact`.
- No competing host-plane trigger: the tauri profile disables host `compaction-basic`.

## Activation

The profile composition is read at boot. Restart the DeepSeek Harness app to apply it to new and resumed sessions. The currently running session keeps its in-memory composition until then.

## Rebuild after a code change

```powershell
pnpm build
pnpm bundle:dsh
Copy-Item -Recurse -Force build\optcompact-dsh "$env:DSH_HOME\profiles\tauri\vendor\optcompact-dsh"
```

Restart the app.

## Rollback

1. Stop the app.
2. Restore `cordis.patch.yml.bak-optcompact-20261102-143218` over `cordis.patch.yml`.
3. Restore `package.json.bak-optcompact-20261102-143218` over `package.json`.
4. Delete `%DSH_HOME%\profiles\tauri\vendor\optcompact-dsh`.
5. Run `pnpm install` in the profile, or run `dsh plugin --profile tauri remove @optcompact/dsh`.
6. Start the app.

## Caveats

- Live behavior is unverified until the restart. Composition and module resolution are verified.
- The backend caps every checkpoint at 32768 tokens. The policy keeps the last 4 surface nodes verbatim.
- Aggressive distillation drops bulk detail by design; raise `tailNodes` or the checkpoint cap if next-action retention proves weak.
- Editing presets restates them in full. A DSH upgrade can invalidate the overlay; regenerate it with `scripts/preset-override.mjs`.
