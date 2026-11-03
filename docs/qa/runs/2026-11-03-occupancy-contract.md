# Occupancy contract BDD run, 2026-11-03

**Verdict:** the provider-anchored occupancy contract is implemented and green. The live profile needs a restart before the v0.5.0 bundle governs new sessions.

## Scope

ADR-0005 and spec §17 AC-14/15. The core selects a provider or surface sample. The DSH adapter supplies both, guards a route change, and uses the larger estimate for the hard cap.

## Scenarios

### Provider current

**Given** a projection of 45,000 on the current route and a surface estimate of 30,000 in a 100,000-token window,
**when** a checkpoint is evaluated,
**then** occupancy is 0.45 and evidence records `source: provider`.

### Provider absent

**Given** no projection and a surface estimate of 42,000 in a 100,000-token window,
**when** the selector runs,
**then** it returns 42,000 with `source: surface`.

### Route changed

**Given** a 45,000 projection recorded on `deepseek-chat` and a surface estimate of 30,000,
**when** the route changes to `deepseek-reasoner` and a checkpoint is evaluated,
**then** the decision uses 30,000, resolves the new window, and evidence records `source: surface`, `routeChanged: true`.

### Conservative hard cap

**Given** a primary occupancy of 0.55 and a conservative estimate of 0.95,
**when** `decideCheckpoint` runs,
**then** it checkpoints with `reason: hard`.

## Red evidence

```text
$ pnpm exec node --test packages/core/test/occupancy.test.ts
SyntaxError: The requested module '../src/index.ts' does not provide an export named 'selectOccupancy'
tests 1, pass 0, fail 1

$ pnpm exec node --test packages/dsh/test/policy.test.ts
AssertionError: Expected values to be strictly equal:
+ actual - expected
+ undefined
- 'provider'
tests 16, pass 15, fail 1
```

## Green evidence

```text
$ pnpm exec node --test packages/core/test/occupancy.test.ts
tests 5, pass 5, fail 0

$ pnpm exec node --test packages/dsh/test/policy.test.ts
tests 16, pass 16, fail 0

$ pnpm test
tests 92, pass 92, fail 0

$ pnpm typecheck
(no output)
```

## Deployment

- Bundle `0.5.0` built by `pnpm bundle:dsh`; it exports `selectOccupancy` in the inlined core.
- Previous vendor directory backed up as `optcompact-dsh.bak-20261103-092227`.
- New bundle copied to `%DSH_HOME%\profiles\tauri\vendor\optcompact-dsh`.
- Profile import prints `apply,buildUnits,inject,install,maybeCheckpoint,maybeCompact,name,snapCutToStep` and `install-ok`.
- Activation requires an app restart; the running session keeps its boot composition.
- Release `v0.5.0` is public; CI run `41550712668` passed.

## Residual risk

- The projection is exact only at a provider anchor; between anchors it is a heuristic. The soft trigger accepts that, and the hard cap uses the larger estimate.
- The route guard updates the last route on the first pre-step after the change. If that step aborts before sending a request, the next pre-step can still read the previous route's projection. The same-turn cooldown and the conservative cap bound the exposure.
- Live activation is unverified until the app restarts with the v0.5.0 vendor bundle.
