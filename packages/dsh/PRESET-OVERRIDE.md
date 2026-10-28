# Preset-backed profiles (Web and Desktop)

**Audience:** operators who run DeepSeek Harness Web or Desktop (`tauri` profile).

## Why a generator

Web and Desktop mount an isolated `compaction` group inside each agent preset. A host-plane insert cannot reach an isolated service. Cordis patch indexing does not recurse into a preset's `plugins` array. The only supported route is to restate each `preset-<id>` row with the policy row inside its compaction group.

The generator does that mechanically from the composed profile dump.

## Steps

1. Install the plugin as a profile dependency. From a local bundle directory:

   ```powershell
   dsh plugin --profile tauri add <bundle-dir>
   ```

2. Dump the composed profile:

   ```powershell
   dsh --profile tauri --dump-config | Out-File -Encoding utf8 dump.yml
   ```

3. Generate the overlay:

   ```powershell
   node scripts/preset-override.mjs --input dump.yml --output optcompact.patch.yml
   ```

4. Inspect the diff. Each `preset-*` block must gain one `optcompact-policy` row. Each `compaction-basic` row must gain `config: auto: false`.

5. Verify the composition before applying:

   ```powershell
   dsh --profile tauri --patch optcompact.patch.yml --dump-config | Select-String 'optcompact|auto: false'
   ```

6. Apply. Either pass the overlay at boot:

   ```powershell
   dsh --profile tauri --patch optcompact.patch.yml
   ```

   Or append the generated rows to `$DSH_HOME\profiles\tauri\cordis.patch.yml`.

7. Restart the app. The composition reloads on startup.

## Revert

Remove the `- id: preset-*` rows the generator added. Restore the profile patch file from version control, or delete the appended block. The stock rows return because the overlay no longer replaces them.

## After a DeepSeek Harness upgrade

Preset internals change between releases. Regenerate from the new dump. Do not reuse an old overlay across versions.

## Limits

- The overlay restates entire presets. It is large by construction.
- Composition is verified with `--dump-config` on 8 presets. A live boot of the Web app was not run in this repository's verification.
- The policy still snaps cuts to `user/message` boundaries, so a one-step session cannot compact.
- Preset isolation also scopes `toolResultPruner`. The overlay keeps that row untouched.

## Evidence

- Generator tests: `node --test scripts/preset-override.test.mjs`.
- Real dump check: 8 presets, 8 groups patched, one policy row each, `auto: false` on every `compaction-basic`.
