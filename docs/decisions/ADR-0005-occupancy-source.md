# ADR-0005: Provider-anchored occupancy with adapter-owned measurement

**Status:** Accepted · **Date:** 2026-11-03 · **Related:** ADR-0004

## Context

The v0.4.2 trigger reads `contextPressure` from the harness projection registry, the same value the UI meter shows. That fixed the 42%-versus-52% disagreement, but it left two questions open:

- The projection is exact only at a provider anchor. Between anchors, and immediately after a checkpoint, it is a heuristic delta over the previous prompt. Reporting `postTokens: 126,509` for a checkpoint whose summary and tail were about 3.3k tokens showed the residual can be materially wrong.
- The project targets DeepSeek Harness and Codex. A core rule that names a DSH service would not port.

Paired evidence from 17 live decisions measured provider over surface at 1.17–1.71, median 1.50. Surface systematically undercounts because it prices nodes at four characters per token and excludes tool schemas; the projection includes the full request envelope. Neither estimate is a billing record, and both can be wrong in different directions.

## Decision

1. **The core consumes numbers, not harness state.** `selectOccupancy` takes `providerTokens`, `surfaceTokens`, `capacityTokens`, and `routeChanged`, and returns `{ usedTokens, capacityTokens, source }`. `@optcompact/core` imports no harness API.
2. **Each adapter supplies the best available sample.** DSH uses `contextPressure.projectedTokens ?? pressureTokens` over `contextPressure.contextWindow`. Codex already uses provider-reported `inputTokens` from `thread/tokenUsage/updated`.
3. **The provider sample wins only while it is current.** It must be finite, positive, and taken on the same route. DSH tracks the last `provider/model` per session; when the route changes, that decision falls back to the surface estimate and the freshly resolved window, because a route switch pairs a new window with the previous route's pressure.
4. **The hard cap is conservative.** The 0.9 hard checkpoint uses `max(provider, surface)` through `safetyOccupancy`, so a stale-low projection cannot defer an overflow decision. Soft thresholds still use the selected sample, which keeps the trigger aligned with the meter.
5. **Evidence records provenance.** Each checkpoint record includes `source`, `route`, `routeChanged`, and `safetyOccupancy`. Post-checkpoint `postTokens` and `ratio` remain surface-based, because the projection residual is not the retained context.
6. **No calibration yet.** A calibrated source is added only when a supported harness has no provider usage. Until then, adding a fitted factor would encode one harness's prompt envelope into the portable core.
7. **No separate staleness timer.** A checkpoint is followed by a request in the same turn, and the same-turn cooldown blocks another decision before that request re-anchors the projection. The next turn therefore reads a fresh anchor; a TTL would add state without covering a reachable case.

## Consequences

Positive:

- The trigger matches the meter on the common path, while a route switch cannot apply an old window to a new model.
- The occupancy rule is testable in the dependency-free core and reusable by both adapters.
- A projection that drifts below the surface cannot suppress the hard checkpoint.

Negative:

- Between anchors the projection is still a heuristic. It is acceptable for a soft trigger at 0.5 and is bounded by the conservative hard cap, but it is not a precise occupancy measurement.
- The adapter must track route identity; adding a harness means implementing the sample, not only calling the core.
- There is no calibrated fallback for a hypothetical harness without provider usage.

## Alternatives rejected

- **Surface only.** Underestimated occupancy by roughly a third and missed the 52% trigger that motivated the work.
- **Projection always.** Applies a stale window and prompt after a model switch, and overstates retained context after a checkpoint.
- **Put the DSH projection type in core.** Couples the model to one harness and blocks the Codex adapter.
- **Fit a calibration factor now.** No supported harness lacks provider usage; a fitted constant would be unvalidated and harness-specific.
- **Use `max(provider, surface)` for the soft trigger.** Compacts below the meter's threshold when surface is the higher estimate, which surprises the operator and hides which source drove the decision.
