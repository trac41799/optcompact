# Incident: no trigger at 52% and truncated manual compaction, 2026-11-03

**Verdict:** two defects, both in the v0.4 deployment. Occupancy used the wrong source, and the checkpoint cap was too small.

## Symptoms

1. The context meter showed 52% occupancy, but no checkpoint ran.
2. A manual `/compact` failed with "Compaction could not produce a useful summary."

## Evidence

- Policy evidence recorded `occupancy: 0.4235` at 423,541 tokens against a 1,000,000 window.
- The UI meter showed 52%. It computes `projectedTokens / contextWindow` from `contextPressure`.
- The session log recorded the exact failure:

```text
compaction/end {"error":"summarization truncated at the token cap (incomplete checkpoint)"}
command/done  {"kind":"error","text":"Compaction could not produce a useful summary..."}
```

## Root causes

1. **Wrong occupancy source.** The plugin divided `surfaceTokens` by the window. The UI divides provider-anchored `contextPressure.projectedTokens` by `contextPressure.contextWindow`. The first said 42%, the second 52%.
2. **Urgency too high.** The mid-turn threshold was 0.75, so crossing 50% inside a turn waited for the next turn boundary.
3. **Cap too small.** `maxTokens: 1600` truncated the checkpoint at real context sizes. The backend rejects a truncated summary, so `/compact` failed.

## Fixes

- Occupancy now reads `contextPressure.projectedTokens` and `contextPressure.contextWindow` via `ctx.get('sessionProjections')`, with a measurable fallback.
- `urgentOccupancy` defaults to `maxOccupancy` (0.5). A checkpoint can run mid-turn once 50% is crossed.
- Same-turn cooldown prevents repeat checkpoints after one succeeds.
- The backend cap is 32768, and `checkpointTokens` is a 4000-token estimate.
- Evidence now records `windowTokens`, `surfaceTokens`, and `usedTokens`.

## Verification

- Core and adapter tests: 15 adapter tests, 6 checkpoint tests, full suite green.
- Forced-compaction smoke on a real harness composition: `usedTokens` 18,768 against `surfaceTokens` 13,177, so the projection source is active. The checkpoint succeeded with the 32768 cap.
- Live composition: 8 presets, `maxTokens: 32768` on every backend.

## Residual

- The running app must restart to load the rebuilt bundle.
- Retest `/compact` and watch for a checkpoint before 60% occupancy.
