# DSH compaction integration surface

Conclusion: a third-party policy plugin should keep `@deepseek-ai/dsh-compaction-basic` as the
engine, mount it with `auto: false`, and make its own `agent/pre-step` decision that calls
`ctx.compaction.compactRegion(start, end, agent, signal)` inside the same Cordis isolation realm as
the engine. Subclassing `BasicCompactionEngine` works but buys nothing the seam does not already
expose, and it costs a replacement of every engine row. The hard constraint is placement, not API:
in preset-backed profiles (Web/Desktop) `ctx.compaction` lives inside an isolated per-preset group,
so any policy plugin has to be mounted inside that group.

Path root for every citation: `C:\Users\mrtra\AppData\Roaming\dsh-tauri\dependencies\dsh\node_modules\`
(cited below as `@deepseek-ai/<package>/<file>:<lines>`). Installed version is `0.2.1-rc.2`
(`@deepseek-ai/dsh-compaction/package.json:4`).

## Scope

- Read-only study of the installed runtime at the path root above: READMEs, `lib/*.js`,
  `lib/types/*.d.ts`, `package.json` `exports`, plus `dsh --profile tauri --dump-config` output.
- Question: how can an npm package replace DSH's *when-to-compact* decision while reusing DSH's
  compaction transaction and summarizer.
- Out of scope: writing a production plugin, model-quality of summaries, pricing.
- Anything executed is listed in [Feasibility evidence](#feasibility-evidence); everything else is
  marked unverified.

## Service seam

`ctx.compaction` is a Cordis service whose name is fixed at construction:

```js
var CompactionEngine = class extends Service {
  constructor(ctx) { super(ctx, "compaction"); }
};
```
`@deepseek-ai/dsh-compaction/lib/index.js:169-173`

The service is declared for TypeScript by module augmentation, so `ctx.compaction` is typed once the
package's types are imported:

```ts
declare module '@deepseek-ai/cordis' {
    interface Context { compaction: CompactionEngine; }
```
`@deepseek-ai/dsh-compaction/lib/types/index.d.ts:67-70`

The abstract API is three operations. Note the parameter types: the abstract class takes
`CompactionAgentContext`, while the basic backend narrows it to `Agent`.

```ts
export declare abstract class CompactionEngine extends Service {
    constructor(ctx: Context);
    abstract compactIfNeeded(agent: CompactionAgentContext, trigger: CompactionTrigger, signal: AbortSignal): Promise<CompactionResult | null>;
    abstract compactNow(agent: ManualCompactAgentContext, signal: AbortSignal, sourceCommandId?: CommandId): Promise<CompactionResult | null>;
    abstract compactRegion(start: SessionSeq, end: SessionSeq, agent: CompactionAgentContext, signal?: AbortSignal): Promise<CompactionResult>;
}
```
`@deepseek-ai/dsh-compaction/lib/types/index.d.ts:102-158`

`CompactionTrigger` is a closed union of two strings:

```ts
export type CompactionTrigger = 'pressure' | 'context-overflow';
```
`@deepseek-ai/dsh-compaction/lib/types/index.d.ts:25`

`CompactionAgentContext` needs only the session and routing options; `ManualCompactAgentContext`
adds idle-maintenance admission (`runMaintenance`), which is why `compactNow` cannot be called from
inside an open turn:

```ts
export interface CompactionAgentContext { session: Session; options: { provider?: string; model?: string; }; }
export interface ManualCompactAgentContext extends CompactionAgentContext {
    runMaintenance<T>(task: (signal: AbortSignal) => Promise<T>): Promise<T>;
}
```
`@deepseek-ai/dsh-compaction/lib/types/index.d.ts:45-66`

`CompactionResult` reports the whole durable bracket plus the shadowed span (a surface-position span,
not a numeric interval):

```ts
export interface CompactionResult {
    compactionId: CompactionId;
    sourceCommandId?: CommandId;
    startSeq: SessionSeq;
    summarySeq: SessionSeq;
    endSeq: SessionSeq;
    summary: ContentBlock[];
    shadowedRange: { start: SessionSeq; end: SessionSeq; };
    shadowedSeqs: SessionSeq[];
    shadowedTokenCount: number;
}
```
`@deepseek-ai/dsh-compaction/lib/types/types.d.ts:102-131`

`ManualCompactionError` is the classified failure type with a closed code set:

```ts
export type ManualCompactionErrorCode = 'busy' | 'cancelled' | 'changed' | 'summary' | 'commit' | 'persistence';
export declare class ManualCompactionError extends Error {
    readonly code: ManualCompactionErrorCode;
    readonly name = "ManualCompactionError";
    constructor(code: ManualCompactionErrorCode, message: string, options?: ErrorOptions);
}
```
`@deepseek-ai/dsh-compaction/lib/types/index.d.ts:27-43`

The two edge helpers are the only exported range utilities; both take `(session, seq)` and return a
boolean, throwing when the seq is not on the current surface:

```js
function toolPairingBalancedBefore(session, seq) { return cutBalance(balanceCache(session), seq, 0); }
function toolPairingBalancedAfter(session, seq) { return cutBalance(balanceCache(session), seq, 1); }
```
`@deepseek-ai/dsh-compaction/lib/index.js:80-93`

Log-only session events a policy plugin can observe or correlate: `compaction/start`,
`compaction/summary`, `compaction/end`, `compaction/prune`
(`@deepseek-ai/dsh-compaction/lib/types/types.d.ts:14-99`). The recovery waterfall for a failed
summary is `compaction/summary-error` (`@deepseek-ai/dsh-compaction/lib/types/index.d.ts:71-91`).

Symbol-to-subpath map, from the `exports` block:

| Symbol | Subpath | Evidence |
|---|---|---|
| `CompactionEngine` (also `default`) | `@deepseek-ai/dsh-compaction` | `@deepseek-ai/dsh-compaction/package.json:16-20`, `lib/index.js:175` |
| `CompactionResult` (type only) | `@deepseek-ai/dsh-compaction` (re-export) and `/types` | `lib/types/index.d.ts:14`, `package.json:21-24` |
| `CompactionTrigger`, `ManualCompactionErrorCode`, `ManualCompactionError`, `CompactionAgentContext`, `ManualCompactAgentContext` | `@deepseek-ai/dsh-compaction` | `lib/types/index.d.ts:25-66`, `lib/index.js:175` |
| `toolPairingBalancedBefore` / `toolPairingBalancedAfter` | `@deepseek-ai/dsh-compaction` (no dedicated subpath) | `package.json:16-31`, `lib/index.js:175` |
| `CompactionId` | `@deepseek-ai/dsh-compaction` | `lib/types/index.d.ts:15` |
| `compactCheckpointSource`, `isCompactCheckpointSource`, `CompactionCheckpointSource` | `@deepseek-ai/dsh-compaction` and `/checkpoint` | `lib/types/index.d.ts:17-18`, `package.json:25-28` |

`selectCompactableRange` is **not** exported anywhere: `dsh-compaction-basic` exposes only the class
(`@deepseek-ai/dsh-compaction-basic/lib/index.js:1027`) and its only code subpath is `.`
(`.../package.json:16-24`; the other subpaths are `./package.json`, `./locale/*.json`, `./src/*`).
A policy plugin that wants the same retention walk must reimplement it (~20 lines, see below).

## Automatic trigger

`BasicCompactionEngine` binds three required services and one config schema:

```js
static inject = ["llm", "tokenMeter", "sessions"];
static Config = z.object({ thresholdRatio, headroomTokens, retainRatio, retainTokens,
  summarizationProvider, summarizationModel, maxTokens, compactionRetries, maxOverflowRetries,
  modelPolicies: z.array(modelPolicy), auto: z.boolean() });
constructor(ctx, config = {}) {
  super(ctx);
  this.config = resolveConfig(config);
  if (this.config.auto) this._registerAutomaticCompaction();
}
```
`@deepseek-ai/dsh-compaction-basic/lib/index.js:801-828`

The automatic listeners are registered in the constructor, so listener order follows plugin *start*
order, not row order — dsh-base states that "row order carries no load semantics (activation is
service-availability driven)" (`@deepseek-ai/dsh-base/cordis.patch.yml:12-13`). There is no numeric
priority; `ctx.on` takes only a `prepend` flag (`@deepseek-ai/cordis/lib/types/events.d.ts:88`,
`:101-106`), which turns `push` into `unshift` (`@deepseek-ai/cordis/lib/index.js:335-345`). Waterfall
listeners run in registration order, first registered outermost (`@deepseek-ai/cordis/lib/index.js:317-325`).
A policy plugin should therefore not depend on relative listener order; with `auto: false` there is
nothing to order against.

The pressure trigger is an `agent/pre-step` waterfall listener; it awaits the compaction before
calling `next()`:

```js
ctx.on("agent/pre-step", async ({ agent, signal }, next) => {
    if (!signal.aborted) try {
        const result = await this.compactIfNeeded(agent, "pressure", signal);
        if (result !== null) logResult(result, "step pressure");
    } catch (error) { ... ctx.logger.warn(`step compaction failed: ${message}; continuing the turn`); }
    return next();
});
```
`@deepseek-ai/dsh-compaction-basic/lib/index.js:839-852`

Two more listeners ride along: `agent/status` resets overflow retry counters
(`lib/index.js:853-855`), `session/event` does the same after an `assistant/message`
(`:856-860`), and the overflow path is an `agent/request-error` waterfall gated on
`CONTEXT_WINDOW_EXCEEDED` (`:861-887`, code constant at `@deepseek-ai/dsh-llm/lib/types/error.d.ts:18`).

Pressure is measured through `ctx.tokenMeter.measure(session)` and only compacts above a threshold
derived from the routed model's capacity:

```js
const info = await this.ctx.llm.resolveModelInfo(target.provider, target.model, signal);
assertNoActiveCompaction(agent.session, "automatic pressure compaction");
const spec = resolveCompactSpec(policy, info.context.contextWindow, reservedCompletionTokens(agent, info.defaultMaxTokens));
if (measurement.totalTokens < spec.thresholdTokens) return null;
```
`@deepseek-ai/dsh-compaction-basic/lib/index.js:936-941`

Default trigger is `floor(min(W × 0.8, W − O − 65536))` and the retained tail is 16% of `W − O`
(`@deepseek-ai/dsh-compaction-basic/README.md:62-76`; schema defaults resolved in
`lib/types/config.d.ts:22-42`).

Disabling `auto` is a config value only; `auto` defaults to `true`
(`@deepseek-ai/dsh-compaction-basic/lib/types/types.d.ts:39-41`,
`.../README.md:76`). With `auto: false` the three listeners above are never registered, so both
pressure compaction **and** overflow recovery disappear; `/compact` still works because it calls
`compactNow` (`@deepseek-ai/dsh-command-compact/lib/index.js:49-72`).

`compactIfNeeded` can be overridden, and the override is honored at event time because the listener
calls `this.compactIfNeeded` rather than a captured function:

```ts
/** Register automatic between-step pressure and model-request overflow
 * recovery. `compactIfNeeded` stays dynamically dispatched so subclass
 * overrides are honored at event time. */
private _registerAutomaticCompaction;
```
`@deepseek-ai/dsh-compaction-basic/lib/types/index.d.ts:33-38`, dispatch at `lib/index.js:841`, `:872`

Range selection, the piece a custom policy must reproduce:

```js
function selectCompactableRange(session, measurement, retainTokens) {
    const pricedNodes = measurement.nodes;
    if (pricedNodes.length === 0) return null;
    const surfaceNodes = session.surface.nodes;
    if (surfaceNodes.length !== pricedNodes.length || surfaceNodes.some((seq, index) => seq !== pricedNodes[index]?.seq))
        throw new Error("compaction: token-meter surface does not match the current session surface");
    const firstIdx = systemHead(session, surfaceNodes[0]) === void 0 ? 0 : 1;
    let accumulated = 0; let keepFromIdx = pricedNodes.length;
    for (let index = pricedNodes.length - 1; index >= 0; index -= 1) {
        accumulated += pricedNodes[index].tokens; keepFromIdx = index;
        if (accumulated >= retainTokens) break;
    }
    if (keepFromIdx <= firstIdx) return null;
    while (keepFromIdx > firstIdx) {
        if (toolPairingBalancedBefore(session, surfaceNodes[keepFromIdx])) break;
        keepFromIdx -= 1;
    }
    if (keepFromIdx <= firstIdx) return null;
    return { start: surfaceNodes[firstIdx], end: surfaceNodes[keepFromIdx - 1] };
}
```
`@deepseek-ai/dsh-compaction-basic/lib/index.js:410-433`

## Token measurement

`ctx.tokenMeter` has exactly two public operations:

```ts
measure(session: Session, requestHeader?: EpochHeader): TokenMeasurement;
estimateMessage(message: Message): number;
```
`@deepseek-ai/dsh-token-meter/lib/types/index.d.ts:46`, `:57`

`TokenMeasurement` is detached, deeply immutable, and O(surface) per call:

```ts
export interface TokenMeasurement {
    readonly logRevision: SessionLogOffset;
    readonly baseline: TokenMeasurementBaseline;
    readonly surfaceDeltaTokens: number;
    readonly totalTokens: number;      // request-and-response pressure
    readonly surfaceTokens: number;    // sum of nodes[].tokens
    readonly nodes: readonly TokenSurfaceNode[];
}
export interface TokenSurfaceNode {
    readonly seq: SessionSeq;
    readonly tokens: number;           // route-priced
    readonly heuristicTokens: number;  // route-independent
}
```
`@deepseek-ai/dsh-token-meter/lib/types/types.d.ts:24-55`

Pressure capacity comes from the adapter that owns the route, not from the meter:
`ctx.llm.resolveModelInfo(provider, model, signal)` returns `LlmResolvedModelInfo` with
`context?: { contextWindow: number }` and `defaultMaxTokens?: number`
(`@deepseek-ai/dsh-llm/lib/types/index.d.ts:377`, `.../types.d.ts:333-337`, `:394-405`).

The session surface is a readonly positional view with a replacement generation counter:

```ts
export interface SessionSurface {
    readonly nodes: readonly SessionSeq[];
    readonly replaceGeneration: number;
    readonly contentGeneration: number;
}
```
`@deepseek-ai/dsh-session/lib/types/surface.d.ts:118-125`, reached via `session.surface`
(`@deepseek-ai/dsh-session/lib/types/index.d.ts:141`). `SessionSeq` is a branded number with an
identity constructor:

```ts
export type SessionSeq = BrandedNumber<'SessionSeq'>;
export declare function SessionSeq(value: number): SessionSeq;
```
`@deepseek-ai/dsh-session/lib/types/types.d.ts:14-20`

Relevant session methods for a policy: `session.seq`, `session.requestHeader()`,
`session.deriveEventMessage(event)` (`@deepseek-ai/dsh-session/lib/types/index.d.ts:239`, `:303`, `:354`).

Events that fire before a model request, all scope-filtered waterfalls (`this: Scoped<Agent>`):

```ts
'agent/pre-step'(this: Scoped<Agent>, payload: {
    agent: Agent; messages: UserMessage[]; turn: number; step: number; signal: AbortSignal;
}, next: () => Promise<PreStepDecision>): Promise<PreStepDecision>;

'agent/request'(this: Scoped<Agent>, payload: {
    agent: Agent; turn: number; step: number; signal: AbortSignal;
}, next: () => Promise<LlmCallConfig>): Promise<LlmCallConfig>;

'agent/request-error'(this: Scoped<Agent>, payload: {
    agent: Agent; turn: number; step: number; provider: string;
    failure: LlmFailure; retryPolicy: ResolvedRetryPolicy | undefined; signal: AbortSignal;
}, next: () => Promise<RequestErrorAction>): Promise<RequestErrorAction>;
```
`@deepseek-ai/dsh-agent/lib/types/runtime-types.d.ts:304-310`, `:327-332`, `:348-356`

`agent/pre-step` runs after `turn/start` is appended and before `step/start`, so an open turn already
exists when a listener runs:

```js
this.session.append("turn/start", { turn });
...
const decision = await this.preStep(target, { turn, step });
```
`@deepseek-ai/dsh-agent-loop/lib/index.js:945`, `:956-959`; the waterfall itself at `:909-920`.

## Plugin loading

A plugin module is one of a function, class, or `{ apply }` object, with optional `name`, `Config`
(any standard-schema validator), `inject`, `provide` (`@deepseek-ai/cordis/lib/types/registry.d.ts:48-81`).
DSH's own plugins use the function shape with three exports:

```ts
export declare const name = "command-compact";
export declare const inject: string[];
export declare function apply(ctx: Context): void;
```
`@deepseek-ai/dsh-command-compact/lib/types/index.d.ts:6-12`

`inject` accepts an array of service names or a name→intercept-config map
(`@deepseek-ai/cordis/lib/types/registry.d.ts:13-15`); the plugin only loads while every named
service exists (`:52-63`). `Config` is any standard-schema validator (`:55-56`); the shipped backends
use schemastery, for example `static Config = z.object({...})` with `@deepseek-ai/schemastery` as a
runtime dependency (`@deepseek-ai/dsh-compaction-basic/lib/index.js:806-818`,
`.../package.json:46-49`).

Installation and composition:

- A profile is `$DSH_HOME/profiles/<name>` with `package.json` (dependencies plus
  `dsh.profile.bundles`) and `cordis.patch.yml` (`@deepseek-ai/dsh/README.md:37`).
- Layer order is bundle patches in `dsh.profile.bundles` order, then the profile patch, then
  `$DSH_HOME/cordis.patch.yml`, then `--patch` overlays (`@deepseek-ai/dsh/README.md:41-46`).
- A package becomes a bundle layer by declaring `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }`;
  `patch` may be a string or an ordered array (`@deepseek-ai/dsh-package-manifest/lib/types/types.d.ts:65-74`).
- A profile patch replaces the matched row's whole `config` (no deep merge) and can insert new rows
  (`@deepseek-ai/dsh-app-boot/README.md:61`, `:204`). Insert rows accept package specifiers, absolute
  paths, or `file:` URLs (`@deepseek-ai/dsh-app-boot/README.md:65`).
- Insert semantics: a patch with `insert` and no `id` appends to the top level; with an `id` it
  appends to that group's `config` array (`@deepseek-ai/cordis-plugin-include/lib/index.js:67-85`,
  type at `.../lib/types/index.d.ts:27-38`).

Exact user-facing commands (the CLI forwards everything after the profile flag to pnpm):

```text
dsh plugin --profile <name> add <package>
dsh plugin --profile <name> remove <package>
dsh plugin --profile <name> why <package>
```
`@deepseek-ai/dsh/lib/bin.js:116-122` (or `dsh --help`, which prints
`dsh plugin --profile tui add <package>  install a plugin into the tui profile`, `bin.js:48`).

`dsh plugin` runs pnpm in the profile directory (`@deepseek-ai/dsh/lib/plugin-BiveYA7h.js:63-99`,
`@deepseek-ai/dsh-plugin-manager/lib/types/operations.js:591-602`). After a successful install it
reconciles the bundle list: a new dependency that declares `dsh.bundle.patch` is pushed onto
`dsh.profile.bundles`, one that does not is only warned about (`operations.js:96-124`, called at
`:558-560`). So an installed bundle activates without hand-editing `package.json`.

Version admission: `engines.dsh` alone decides when present, otherwise every `@deepseek-ai/dsh*`
peer range must match the running version (`@deepseek-ai/dsh-app-boot/README.md:52`). An exact-version
exemption is written to `compatibility.json` beside `package.json`
(`@deepseek-ai/dsh-plugin-manager/README.md:71`).

Where the engine actually lives is deployment-dependent, and this is the decisive fact:

- Host plane: `dsh-base` mounts `token-meter`, `compaction-basic`, `command-compact` as top-level rows
  (`@deepseek-ai/dsh-base/cordis.patch.yml:348-357`). `headless` and `sdk-minimal` keep them
  (`@deepseek-ai/dsh-sdk-minimal/cordis.patch.yml:61-68`; `@deepseek-ai/dsh-headless/cordis.patch.yml:1-43`
  overrides none of them).
- Preset plane: `dsh-web-app` disables both host rows
  (`@deepseek-ai/dsh-web-app/cordis.patch.yml:532-543`) and each shipped preset declares its own
  isolated compaction group:

```yaml
          - id: compaction
            name: cordis:group
            group: true
            isolate:
              compaction: true
              toolResultPruner: true
            config:
              - id: compaction-basic
                name: '@deepseek-ai/dsh-compaction-basic'
              - id: command-compact
                name: '@deepseek-ai/dsh-command-compact'
              - id: tool-result-pruner
                name: '@deepseek-ai/dsh-compaction-tool-result-pruner'
```
`@deepseek-ai/dsh-web-app/presets/standard.patch.yml:66-82`

This is live in the installed deployment: `dsh --profile tauri --dump-config` prints
`- id: compaction-basic / name: '@deepseek-ai/dsh-compaction-basic' / disabled: true` at top level
(dump line 272-277) and eight preset rows each containing the isolated group (dump lines 748-765,
912-929, 1000-1006, 1175-1182, 1358-1365, 1489-1496, 1626-1633, 1799-1806).

Isolation is a Cordis service scope: `ctx.isolate(name, label)` makes reads of `name` resolve
against a different label than the parent (`@deepseek-ai/cordis/lib/types/context.d.ts:71-83`), and
the loader's `isolate` entry option installs that realm (`@deepseek-ai/cordis-plugin-loader/lib/types/config/isolate.d.ts:4-12`).
A host-plane plugin therefore cannot see a preset's `ctx.compaction`; the preset guidance says a
service provider and all its consumers must sit in the same realm
(`@deepseek-ai/dsh-agent-preset/skills/editing-cordis-compositions/SKILL.md:76-80`).

Preset declarations are ordinary rows addressed as `preset-<id>`
(`@deepseek-ai/dsh-agent-preset/README.md:40-48`). They can be overridden from the profile patch by
row id, replacing the whole `config` including `plugins`
(`@deepseek-ai/dsh-web-app/presets/standard.patch.yml:1-3`,
`.../skills/editing-cordis-compositions/SKILL.md:54-66`). A nested group inside `config.plugins`
is not individually addressable, because patch indexing only recurses into entries that carry
`group: true` in the entry list itself, and a preset row does not
(`@deepseek-ai/cordis-plugin-include/lib/index.js:59-66`). Duplicate preset ids fail declaration
loading, so a second `preset-standard` cannot be inserted instead
(`@deepseek-ai/dsh-agent-preset/README.md:84`).

## Recommended integration

Recommended: option (b), with one refinement. Keep `dsh-compaction-basic` as the engine, set
`auto: false`, and let the policy plugin own both the pressure decision and overflow recovery. The
engine is unmodified stock code, all decisions go through the documented seam, and the package never
depends on a private method.

Why not option (a) (subclass `BasicCompactionEngine`):

- The subclass must *replace* every mounted `compaction-basic` row — one per preset in Web/Desktop,
  one at host plane elsewhere — because `ctx.compaction` is registered under a single name by the
  constructor (`@deepseek-ai/dsh-compaction/lib/index.js:169-173`) and the seam says load one
  implementation per context (`@deepseek-ai/dsh-compaction/lib/types/index.d.ts:96-101`).
- The only documented subclass hook is `summarize()` (`@deepseek-ai/dsh-compaction-basic/README.md:109`,
  `.../lib/types/index.d.ts:41-49`). Overriding `compactIfNeeded` is supported by dispatch
  (`lib/types/index.d.ts:33-38`), but the listener set, the event, its ordering, and the `auto` flag
  are fixed in a private method (`lib/index.js:834-888`). So a subclass can change *decisions*, not
  *where or when the check runs* — which is the whole point of a when-to-compact policy.
- It pins the third-party package to `BasicCompactionEngine`'s class shape and its
  `Agent`-narrowed signatures (`lib/types/index.d.ts:60-79`) across DSH upgrades.
- It does not remove the work: the plugin still has to be mounted in the same realm.

So option (a) is only justified if the deployment must keep the stock listener (for example to avoid
a second `agent/pre-step` listener, which is cheap) or wants to replace the summarizer too.

Policy plugin shape (runs inside the same realm as the engine):

```js
export const name = 'optcompact-compaction-policy'
export const inject = ['compaction', 'tokenMeter', 'llm']
export const Config = z.object({ /* threshold, retain, minGain ... */ })

export function apply(ctx, config) {
  ctx.on('agent/pre-step', async ({ agent, signal }, next) => {
    try {
      if (!signal.aborted) await maybeCompact(ctx, config, agent, signal)
    } catch (error) {
      ctx.logger.warn(`optcompact: ${error?.message ?? error}; continuing the step`)
    }
    return next()          // never veto the step
  }, true)                 // prepend only matters if auto stays true

  ctx.on('agent/request-error', async ({ agent, failure, signal }, next) => {
    if (failure.code !== 'CONTEXT_WINDOW_EXCEEDED' || signal.aborted) return next()
    const generation = agent.session.surface.replaceGeneration
    // delegate recovery to the engine's own overflow policy, or run the policy decision
    await ctx.compaction.compactIfNeeded(agent, 'context-overflow', signal)
    // retry only after the surface really changed, mirroring lib/index.js:883-886
    return agent.session.surface.replaceGeneration > generation ? { kind: 'retry' } : next()
  })
}

async function maybeCompact(ctx, config, agent, signal) {
  const target = agent.session.requestHeader()?.config
  if (!target?.provider || !target?.model) return
  const info = await ctx.llm.resolveModelInfo(target.provider, target.model, signal)
  if (info.context === undefined) return
  const measurement = ctx.tokenMeter.measure(agent.session)
  if (!policySaysCompact(config, measurement, info.context.contextWindow, target.maxTokens ?? info.defaultMaxTokens))
    return
  const range = selectRange(agent.session, measurement, config.retainTokens)  // local copy of the walk
  if (range === null) return
  await ctx.compaction.compactRegion(range.start, range.end, agent, signal)
}
```

`selectRange` must copy `selectCompactableRange` (`@deepseek-ai/dsh-compaction-basic/lib/index.js:410-433`)
because it is not exported: align `measurement.nodes` with `session.surface.nodes`, start at the first
non-`system/message` node, accumulate the retained tail from the end, then snap the leading cut with
`toolPairingBalancedBefore` from `@deepseek-ai/dsh-compaction`. The routed request's own output cap is
`LlmCallConfig.maxTokens` (`@deepseek-ai/dsh-llm/lib/types/call-config.d.ts:14`, `:23`); the backend
prefers it over the adapter default for the same reservation (`lib/index.js:757-759`).

`compactRegion` accepts an arbitrary balanced range. It does not re-check the pressure threshold, the
retained tail, or the system head; it does re-validate and re-price:

```js
async compactRegion(start, end, agent, signal) {
    return compactSurfaceRegion(this.regionDependencies(), agent.session, start, end, agent, {
        owner: "current-turn",
        stability: "whole-surface"
    }, signal);
}
```
`@deepseek-ai/dsh-compaction-basic/lib/index.js:971-976`

What `compactSurfaceRegion` enforces (`lib/index.js:450-522`):

- balanced edges and surface membership: `validateSurfaceRegion` rejects a missing, reversed, or
  unbalanced span (`:550-566`);
- an open turn for `owner === "current-turn"`, else `throw new Error("compactRegion: no open turn …")`
  (`:459-462`); the README states the same constraint (`.../README.md:245`);
- the durable lock: an unmatched `compaction/start` after the newest `session/end-seed` reports `busy`
  (`:536-539`, `:453-454`);
- fresh prices: `prepareCompaction` calls `meter.measure(session)` and rebuilds
  `shadowedTokenCount` / `shadowedRouteTokenCount` from the live measurement, throwing
  `SurfaceChangedError` if the selected nodes moved (`:568-580`);
- shrink: the framed summary must be strictly cheaper than the shadowed route tokens (`:600-601`);
- whole-surface stability during summarization: every surface node's seq and prices must be unchanged
  before commit (`:609-610`), unlike the manual path, which only checks the selected span (`:617-626`).

A sibling policy plugin resolves the same services the engine already resolves: the preset-scoped
engine injects host-plane `llm`, `tokenMeter`, and `sessions`
(`@deepseek-ai/dsh-compaction-basic/lib/index.js:801-805`), because only `compaction` and
`toolResultPruner` are isolated. So `inject: ['compaction', 'tokenMeter', 'llm']` works inside the
group; mounting it at host plane while presets are in use does not.

Mounting. The package ships one bundle patch; the CLI appends the bundle to the end of
`dsh.profile.bundles`, so its patch lands after `dsh-web-app` and can override its rows
(`operations.js:106-118`; layer order `@deepseek-ai/dsh/README.md:41-46`).

```jsonc
// package.json
{
  "name": "@optcompact/dsh-compaction-policy",
  "version": "0.1.0",
  "type": "module",
  "main": "lib/index.js",
  "exports": { ".": { "default": "./lib/index.js" }, "./cordis.patch.yml": "./cordis.patch.yml" },
  "dsh": { "bundle": { "patch": "./cordis.patch.yml" } },
  "engines": { "dsh": "0.2.1-rc.2" },
  "peerDependencies": {
    "@deepseek-ai/cordis": "~4.0.5",
    "@deepseek-ai/dsh-agent": "0.2.1-rc.2",
    "@deepseek-ai/dsh-compaction": "0.2.1-rc.2",
    "@deepseek-ai/dsh-llm": "0.2.1-rc.2",
    "@deepseek-ai/dsh-session": "0.2.1-rc.2",
    "@deepseek-ai/dsh-token-meter": "0.2.1-rc.2"
  }
}
```

```yaml
# cordis.patch.yml — host plane (headless / sdk / custom profiles)
- id: compaction-basic
  name: '@deepseek-ai/dsh-compaction-basic'
  config:
    auto: false
- insert:
    - id: optcompact-policy
      name: '@optcompact/dsh-compaction-policy'
      disabled: !!js 'ctx.get("agentPresets") !== undefined'   # presets mount their own engine

# cordis.patch.yml — preset plane (web / desktop): replace the whole preset config,
# restating the shipped plugins list and changing only the compaction group.
- id: preset-standard
  name: '@deepseek-ai/dsh-agent-preset'
  config:
    id: standard
    order: 1
    plugins:
      # ...the shipped list from @deepseek-ai/dsh-web-app/presets/standard.patch.yml...
      - id: compaction
        name: cordis:group
        group: true
        isolate:
          compaction: true
          toolResultPruner: true
        config:
          - id: compaction-basic
            name: '@deepseek-ai/dsh-compaction-basic'
            config:
              auto: false
          - id: optcompact-policy
            name: '@optcompact/dsh-compaction-policy'
          - id: command-compact
            name: '@deepseek-ai/dsh-command-compact'
          - id: tool-result-pruner
            name: '@deepseek-ai/dsh-compaction-tool-result-pruner'
            config:
              thresholdChars: 8192
              headChars: 4096
              tailChars: 1024
```

Install and verify:

```powershell
dsh plugin --profile tauri add @optcompact/dsh-compaction-policy
dsh --profile tauri --dump-config | Select-String -Pattern 'optcompact|compaction-basic' -Context 0,6
```

Remove: `dsh plugin --profile tauri remove @optcompact/dsh-compaction-policy`. The bundle patch layer
disappears with the package, so its rows go with it. If the rows were added by hand to the profile's
own `cordis.patch.yml` instead, delete them there: an `insert` row that names an uninstalled package
still tries to import on the next start and fails that entry.

Risks and constraints:

- open turn required: call `compactRegion` only from an event inside a turn (`agent/pre-step` is;
  `agent/request` is; idle/`session/event` is not). `@deepseek-ai/dsh-compaction-basic/lib/index.js:459-462`.
- whole-surface stability: any surface append or replacement during summarization aborts with
  `SurfaceChangedError` after a `compaction/end` carrying the error
  (`lib/index.js:609-610`, `:487-507`). Do not inject context from the policy plugin, and do not
  trigger from an event that races other surface writers.
- shrink: a verbose summary over a small range throws and leaves an error-marked bracket
  (`lib/index.js:601`). Enforce a minimum range size in the policy.
- tool-pair balance both edges: `lib/index.js:557-558`; use the exported helpers to snap, and never
  include surface node 0 when it is a `system/message` (`lib/index.js:415`).
- one compaction at a time: a failed close leaves a durable orphan lock that blocks until a newer
  `session/end-seed` (`lib/index.js:536-539`).
- losing overflow recovery with `auto: false`: either delegate it as sketched above, or accept that
  a provider-side overflow is terminal.
- preset overrides are version-fragile: the shipped `plugins` list must be restated and re-checked
  after each DSH upgrade; the Web preset editor writes to the same `preset-<id>` row, so a user edit
  and this patch contend for one row (last applied wins).
- presets a user already declares (for example `@local/dsh-sdlc-preset`) need the same override if
  they are to use the policy; otherwise they keep the stock trigger.
- the engine row must stay enabled: `compactRegion`/`compactNow` are the only summarizers, so a
  deployment that disables `compaction-basic` has no compaction at all.

## Feasibility evidence

Two throwaway ESM scripts under `%TEMP%` imported the installed packages by absolute `file://` URL
(no install, no writes to the dependency tree), run with `node v24.13.1`.

Probe 1 (`dsh-probe.mjs`) — imports succeeded for `dsh-compaction`, `dsh-compaction-basic`,
`dsh-token-meter`, `dsh-session`, `dsh-agent`:

```json
"compaction": { "exports": ["CompactionEngine","CompactionId","ManualCompactionError",
  "compactCheckpointSource","default","isCompactCheckpointSource","toolPairingBalancedAfter",
  "toolPairingBalancedBefore"],
  "isCordisServiceSubclass": "Service",
  "enginePrototypeMembers": ["constructor"], "constructorArity": 1,
  "balanceHelpers": [["toolPairingBalancedBefore","function",2],["toolPairingBalancedAfter","function",2]] },
"basic": { "exports": ["BasicCompactionEngine","default"], "staticInject": ["llm","tokenMeter","sessions"],
  "ownPrototypeMembers": ["constructor","_registerAutomaticCompaction","summarize","compactIfNeeded",
    "compactRegion","compactNow","regionDependencies"],
  "extendsCompactionEngine": "CompactionEngine", "subclassOk": true },
"tokenMeter": { "staticInject": ["sessionProjections"],
  "protoMembers": ["constructor","measure","_routeImagePricing","_fileRequestText","estimateMessage",
    "_sync","_foldEvent","_estimateProviderAssistant"] },
"session": { "sessionProto": ["constructor","surface","id","eventAt","snapshotEvents","ownEvents",
  "isOwnSeq","seq","append","publicationEntry","commit","requestHeader","requestContext",
  "toolHistory","deriveMessages","deriveEventMessage"] }
```

Probe 2 (`dsh-probe2.mjs`) — offline surface and seam exercise, no daemon:

```json
"emptySession": { "seq": 0, "surfaceNodes": [], "replaceGeneration": 0, "contentGeneration": 0, "requestHeader": null },
"balanceEmpty": "throws: tool-pairing balance: surface seq 0 not found",
"oneNodeSession": { "seq": 1, "surfaceNodes": [0], "balancedBefore": true, "balancedAfter": true },
"abstractEngine": "throws: TypeError: Cannot read properties of undefined (reading 'reflect')",
"manualError": { "name": "ManualCompactionError", "code": "busy", "isError": true },
"policySubclass": { "inheritInject": ["llm","tokenMeter","sessions"], "hasOwnConfig": false,
  "methods": [["compactIfNeeded","function"],["compactRegion","function"],["compactNow","function"],["summarize","function"]] }
```

Interpretation: the seam types and helpers load with no DSH process; a `Session` can be created and
its surface read offline; a subclass of `BasicCompactionEngine` is a legal class but needs a Cordis
`Context` to instantiate; the balance helpers throw on non-membership as documented.

Composition was verified from a real CLI run, not from reading patches alone:

```text
dsh --version                                  -> 0.2.1-rc.2
dsh --profile tauri --dump-config
  line 272-277 : - id: compaction-basic / name: '@deepseek-ai/dsh-compaction-basic' / disabled: true
                 - id: command-compact  / name: '@deepseek-ai/dsh-command-compact'  / disabled: true
  line 269-270 : - id: token-meter / name: '@deepseek-ai/dsh-token-meter'   (host plane, not isolated)
  line 811-928 : preset-ptc row, whose plugins include the isolated group at 912-928
                 (- id: compaction, cordis:group, isolate {compaction, toolResultPruner},
                  config: compaction-basic, command-compact, tool-result-pruner)
```

Not executed, therefore unverified: mounting the policy plugin and observing a live compaction;
whether `dsh-hmr` applies the profile patch live for this profile (the `hmr` row exists in the dump,
but live reload was not exercised); whether a pending host-plane `optcompact-policy` entry produces a
warning rather than an error (documented behavior is a warning,
`@deepseek-ai/dsh-app-boot/README.md:94`); exact behavior when a user patch and the Web preset editor
both target `preset-<id>`.

## Open questions

1. Does the Desktop shell's own plugin manager path (`install_bundle`) apply the same
   `dsh.profile.bundles` reconciliation as `dsh plugin add`? The README says package operations are
   owned by the Desktop shell (`@deepseek-ai/dsh-plugin-manager/README.md:146`) while the CLI section
   documents the shared `operations.ts` (`:98`), so parity is probable but unverified for this build.
2. Is there a supported way to address a nested group inside a preset's `plugins` without restating
   the whole preset? Patch indexing does not recurse into non-`group` entries
   (`@deepseek-ai/cordis-plugin-include/lib/index.js:59-66`); the skill's workflow assumes whole-config
   replacement (`.../editing-cordis-compositions/SKILL.md:54-66`). Unverified whether any later
   loader feature changes that.
3. Does `agent/pre-step` in a preset-scoped plugin receive every agent of that preset, or only the
   agent whose scope chain includes the preset's group? The event is `Scoped<Agent>`
   (`@deepseek-ai/dsh-agent/lib/types/runtime-types.d.ts:304`) and presets "load eagerly"
   (`@deepseek-ai/dsh-agent-preset/README.md:12`), so scope filtering decides; not exercised.
4. Public docs at `https://github.com/deepseek-ai/deepseek-harness` were not fetched for this note;
   every claim above comes from the installed files and one CLI dump. Cross-check the subsystem
   reference `docs/subsystems/compaction.md` there before publishing the package.
5. Whether `compactRegion` tolerates a range whose start is node 0 while node 0 is a non-system
   message: `validateSurfaceRegion` does not forbid it (`lib/index.js:550-566`), but the summarizer
   also replays the head (`lib/index.js:695-704`), so behaviour is untested and not recommended.
