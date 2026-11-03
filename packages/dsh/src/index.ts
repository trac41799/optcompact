/**
 * DeepSeek Harness compaction policy plugin.
 *
 * Keeps the shipped `dsh-compaction-basic` engine as the transaction owner and
 * `auto: false`, then decides *when* to compact with `@optcompact/core`.
 *
 * @module
 */
import { appendFileSync } from 'node:fs';
import {
  decide,
  decideCheckpoint,
  defaultParams,
  selectOccupancy,
  type CheckpointDecision,
  type ContextUnit,
  type Decision,
  type PolicyParams,
  type PolicyState
} from '@optcompact/core';

/** One token-priced surface node, structural subset of `TokenSurfaceNode`. */
export interface DshNode {
  seq: number;
  tokens: number;
  heuristicTokens?: number;
}

/** Structural subset of `TokenMeasurement`. */
export interface DshMeasurement {
  totalTokens: number;
  surfaceTokens: number;
  nodes: readonly DshNode[];
}

/** Structural subset of `Session`. */
export interface DshSession {
  surface: { nodes: readonly number[]; replaceGeneration: number };
  requestHeader?: () => { config?: { provider?: string; model?: string; maxTokens?: number } } | undefined;
  /** Read one committed event, used to snap a cut to a step boundary. */
  eventAt?: (seq: number) => { type?: string } | undefined;
}

/** Structural subset of `Agent`. */
export interface DshAgent {
  session: DshSession;
  options?: { provider?: string; model?: string; maxTokens?: number };
}

/** Structural subset of `ctx.compaction`. */
export interface DshCompaction {
  compactRegion(start: number, end: number, agent: DshAgent, signal?: AbortSignal): Promise<unknown>;
  compactIfNeeded(agent: DshAgent, trigger: 'context-overflow', signal?: AbortSignal): Promise<unknown>;
}

/** Structural subset of `ctx.tokenMeter`. */
export interface DshTokenMeter {
  measure(session: DshSession): DshMeasurement;
}

/** Structural subset of `ctx.llm`. */
export interface DshLlm {
  resolveModelInfo(
    provider: string,
    model: string,
    signal?: AbortSignal
  ): Promise<{ context?: { contextWindow: number }; defaultMaxTokens?: number }>;
}

/** Structural subset of the Cordis context used by this plugin. */
export interface DshContext {
  on(event: string, handler: (...args: never[]) => unknown, prepend?: boolean): unknown;
  /** Locate an optional service without a hard injection requirement. */
  get?(name: string): unknown;
  logger: { warn(message: string): void; info?(message: string): void };
  tokenMeter: DshTokenMeter;
  llm: DshLlm;
  /**
   * Stock compaction backend, read opportunistically rather than injected.
   *
   * The service lives in the preset's isolated `compaction` group, so a row
   * mounted anywhere else resolves it to `undefined`. Declaring it in `inject`
   * would leave the row permanently pending, and a pending preset row is fatal
   * to every session that selects that preset — the policy must stay inert
   * instead of blocking the composition.
   */
  compaction?: DshCompaction;
}

/** Plugin configuration. */
export interface DshConfig {
  /** Model parameter overrides. */
  params?: Partial<PolicyParams>;
  /** Token prices; defaults keep the model unit-free. */
  prices?: { input?: number; output?: number; fixedCallCost?: number };
  /** Output reservation when the route declares none. */
  outputReserveTokens?: number;
  /** First surface node the policy may shadow. */
  firstCompactableNode?: number;
  /** Fallback growth estimate in tokens per turn. */
  growthPerTurn?: number;
  /** Receives every decision for logging or evidence. */
  onDecision?: (decision: Decision, agent: DshAgent, turn: number) => void;
  /** Append-only JSONL path for decision evidence. */
  evidencePath?: string;
  /** Run the mounted tool-result pruner before deciding. Defaults to true. */
  prune?: boolean;
  /** Load fraction at which pruning runs. Defaults to 0.45. */
  pruneAt?: number;
  /** Decision mode. Checkpoint is the default; gain keeps the v0.3 optimizer. */
  mode?: 'checkpoint' | 'gain';
  /** Occupancy ceiling for a boundary checkpoint. Defaults to 0.5. */
  maxOccupancy?: number;
  /** Occupancy that forces a checkpoint without a boundary. Defaults to `maxOccupancy`. */
  urgentOccupancy?: number;
  /** Occupancy that forces an immediate checkpoint. Defaults to 0.9. */
  hardOccupancy?: number;
  /** Surface nodes kept verbatim after a checkpoint. Defaults to 4. */
  tailNodes?: number;
  /** Checkpoint budget used for the ratio estimate. Defaults to 1500. */
  checkpointTokens?: number;
}

const lastCheckpointTurn = new WeakMap<DshSession, number>();
const lastRoute = new WeakMap<DshSession, string>();

interface PrunerService {
  pruneSession(session: DshSession): unknown;
}

interface ContextPressure {
  projectedTokens?: number;
  pressureTokens?: number;
  contextWindow?: number;
}

interface ProjectionRegistry {
  snapshot?(session: DshSession, keys?: readonly string[]): { values?: { contextPressure?: ContextPressure } } | undefined;
}

/** Read the same occupancy source the UI meter uses, when available. */
function pressureOf(ctx: DshContext, session: DshSession): ContextPressure | undefined {
  try {
    const registry = ctx.get?.('sessionProjections') as ProjectionRegistry | undefined;
    return registry?.snapshot?.(session, ['contextPressure'])?.values?.contextPressure;
  } catch {
    return undefined;
  }
}

function optionalPruner(ctx: DshContext): PrunerService | undefined {
  try {
    const service = ctx.get?.('toolResultPruner') as PrunerService | undefined;
    return service && typeof service.pruneSession === 'function' ? service : undefined;
  } catch {
    return undefined;
  }
}

const warnedNoCompaction = new WeakSet<DshSession>();

/**
 * Read the stock compaction backend from this scope.
 *
 * Returns `undefined` when the row cannot see the preset's isolated
 * `compaction` group, or when its provider is not active yet. The caller then
 * skips the transaction and records why, so a mis-mounted row degrades to a
 * warning instead of failing the preset mount.
 */
export function compactionOf(ctx: DshContext, session: DshSession): DshCompaction | undefined {
  let service: DshCompaction | undefined;
  try {
    service = (ctx.get?.('compaction') as DshCompaction | undefined) ?? ctx.compaction;
  } catch {
    service = undefined;
  }
  if (service && typeof service.compactRegion === 'function') return service;
  if (!warnedNoCompaction.has(session)) {
    warnedNoCompaction.add(session);
    ctx.logger.warn(
      'optcompact: no compaction backend in this scope; the policy stays inert. Mount this row inside the preset compaction group.'
    );
  }
  return undefined;
}

const DEFAULT_PRICES = { input: 1, output: 4, fixedCallCost: 20_000 };
const lastCompaction = new WeakMap<DshSession, number>();
const lastTokens = new WeakMap<DshSession, { turn: number; tokens: number }>();

function growthFor(agent: DshAgent, config: DshConfig, turn: number, tokens: number): number {
  const previous = lastTokens.get(agent.session);
  lastTokens.set(agent.session, { turn, tokens });
  if (!previous || turn <= previous.turn) return config.growthPerTurn ?? 2_000;
  return Math.max(0, (tokens - previous.tokens) / (turn - previous.turn));
}

/** Append one decision record, never failing the turn. */
function recordEvidence(
  path: string | undefined,
  turn: number,
  decision: Decision,
  extra: Record<string, unknown> = {}
): void {
  if (!path) return;
  writeEvidence(path, {
    turn,
    action: decision.action,
    urgency: decision.urgency,
    cutIndex: decision.cutIndex,
    shadowTokens: decision.shadowTokens,
    retentionRatio: decision.retentionRatio,
    expectedGainTokens: decision.expectedGainTokens,
    expectedQualityLoss: decision.expectedQualityLoss,
    cer: Number.isFinite(decision.cer) ? decision.cer : null,
    reasons: decision.reasons,
    ...extra
  });
}

/** Record why the policy could not decide, never failing the turn. */
function recordSkip(path: string | undefined, turn: number, reason: string): void {
  if (!path) return;
  writeEvidence(path, { turn, action: 'skip', reason });
}

function writeEvidence(path: string, record: Record<string, unknown>): void {
  try {
    appendFileSync(path, `${JSON.stringify(record)}\n`, 'utf8');
  } catch {
    // Evidence is advisory; a failed write must not affect the turn.
  }
}

function unitType(tokens: number, index: number): ContextUnit['type'] {
  if (index === 0) return 'decision';
  if (tokens >= 4_000) return 'tool';
  if (tokens >= 1_000) return 'file';
  return 'chatter';
}

/**
 * Snap a cut so the first retained node is a user message, which is a step
 * boundary. Returns zero when no boundary exists in the compactable prefix.
 */
export function snapCutToStep(
  seqs: readonly number[],
  cut: number,
  typeOf: (seq: number) => string | undefined
): number {
  let k = Math.min(Math.max(0, cut), Math.max(0, seqs.length - 1));
  while (k > 0) {
    const seq = seqs[k];
    if (seq !== undefined && typeOf(seq) === 'user/message') return k;
    k -= 1;
  }
  return 0;
}

/** Map surface nodes to model units, oldest first. */
export function buildUnits(
  measurement: DshMeasurement,
  turn: number,
  firstCompactableNode = 1
): { units: ContextUnit[]; seqs: number[] } {
  const nodes = measurement.nodes.slice(Math.max(0, firstCompactableNode));
  const units: ContextUnit[] = nodes.map((node, index) => ({
    id: `seq:${node.seq}`,
    type: unitType(node.tokens, index),
    tokens: Math.max(0, node.tokens),
    createdTurn: Math.max(1, turn - (nodes.length - 1 - index)),
    lastReferencedTurn: Math.max(1, turn - (nodes.length - 1 - index))
  }));
  return { units, seqs: nodes.map((node) => node.seq) };
}

/**
 * Consult the model and compact through the stock backend when the model gains.
 * Returns the decision, or `null` when no target or window is available.
 */
export async function maybeCompact(
  ctx: DshContext,
  config: DshConfig,
  agent: DshAgent,
  turn: number,
  signal: AbortSignal
): Promise<Decision | null> {
  if (signal.aborted) {
    recordSkip(config.evidencePath, turn, 'aborted');
    return null;
  }
  const header = agent.session.requestHeader?.()?.config;
  const target = header?.provider && header.model ? header : agent.options;
  if (!target?.provider || !target?.model) {
    recordSkip(config.evidencePath, turn, 'no-target');
    return null;
  }

  const info = await ctx.llm.resolveModelInfo(target.provider, target.model, signal);
  if (signal.aborted) {
    recordSkip(config.evidencePath, turn, 'aborted');
    return null;
  }
  if (!info.context) {
    recordSkip(config.evidencePath, turn, 'no-window');
    return null;
  }

  let measurement = ctx.tokenMeter.measure(agent.session);
  let pruned = false;
  const pruneAt = config.pruneAt ?? 0.45;
  const loadBefore = (measurement.surfaceTokens || measurement.totalTokens) / info.context.contextWindow;
  if (config.prune !== false && loadBefore >= pruneAt) {
    const pruner = optionalPruner(ctx);
    if (pruner) {
      try {
        pruner.pruneSession(agent.session);
        measurement = ctx.tokenMeter.measure(agent.session);
        pruned = true;
      } catch (error) {
        ctx.logger.warn(`optcompact: prune failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  const contextTokens = measurement.surfaceTokens || measurement.totalTokens;
  const { units, seqs } = buildUnits(measurement, turn, config.firstCompactableNode ?? 1);
  if (units.length < 2) {
    recordSkip(config.evidencePath, turn, 'insufficient-units');
    return null;
  }

  const params = defaultParams(config.params);
  const prices = {
    input: config.prices?.input ?? DEFAULT_PRICES.input,
    output: config.prices?.output ?? DEFAULT_PRICES.output,
    fixedCallCost: config.prices?.fixedCallCost ?? DEFAULT_PRICES.fixedCallCost
  };
  const state: PolicyState = {
    turn,
    windowTokens: info.context.contextWindow,
    outputReserveTokens: target.maxTokens ?? info.defaultMaxTokens ?? config.outputReserveTokens ?? 8_192,
    headroomTokens: 0,
    contextTokens,
    growthPerTurn: growthFor(agent, config, turn, contextTokens),
    units,
    prices,
    params,
    lastCompactionTurn: lastCompaction.get(agent.session)
  };

  const decision = decide(state);
  recordEvidence(config.evidencePath, turn, decision, {
    windowTokens: state.windowTokens,
    contextTokens: state.contextTokens,
    units: units.length,
    tailFloorTokens: decision.diagnostics.tailFloorTokens,
    pruned
  });
  config.onDecision?.(decision, agent, turn);
  if (decision.action !== 'compact') return decision;
  if (signal.aborted) return decision;
  const compaction = compactionOf(ctx, agent.session);
  if (!compaction) {
    recordSkip(config.evidencePath, turn, 'no-compaction-service');
    return null;
  }

  let cut = decision.cutIndex;
  if (agent.session.eventAt) {
    const typeOf = (seq: number): string | undefined => agent.session.eventAt?.(seq)?.type;
    cut = snapCutToStep(seqs, cut, typeOf);
    if (cut === 0) {
      recordSkip(config.evidencePath, turn, 'no-step-boundary');
      return null;
    }
  }

  const endSeq = seqs[cut - 1];
  const startSeq = seqs[0];
  if (startSeq === undefined || endSeq === undefined) return decision;

  await compaction.compactRegion(startSeq, endSeq, agent, signal);
  lastCompaction.set(agent.session, turn);
  writeEvidence(config.evidencePath ?? '', {
    turn,
    action: 'compacted',
    cutIndex: cut,
    startSeq,
    endSeq
  });
  return decision;
}

/**
 * Boundary checkpoint mode: compact at the first task boundary after occupancy
 * reaches the ceiling, keep a short verbatim tail, and target a small
 * checkpoint budget.
 */
export async function maybeCheckpoint(
  ctx: DshContext,
  config: DshConfig,
  agent: DshAgent,
  turn: number,
  signal: AbortSignal
): Promise<CheckpointDecision | null> {
  if (signal.aborted) {
    recordSkip(config.evidencePath, turn, 'aborted');
    return null;
  }
  const header = agent.session.requestHeader?.()?.config;
  const target = header?.provider && header.model ? header : agent.options;
  if (!target?.provider || !target?.model) {
    recordSkip(config.evidencePath, turn, 'no-target');
    return null;
  }

  const info = await ctx.llm.resolveModelInfo(target.provider, target.model, signal);
  if (signal.aborted) {
    recordSkip(config.evidencePath, turn, 'aborted');
    return null;
  }
  if (!info.context) {
    recordSkip(config.evidencePath, turn, 'no-window');
    return null;
  }

  const routeKey = `${target.provider}/${target.model}`;
  const previousRoute = lastRoute.get(agent.session);
  const routeChanged = previousRoute !== undefined && previousRoute !== routeKey;
  lastRoute.set(agent.session, routeKey);

  let measurement = ctx.tokenMeter.measure(agent.session);
  let pruned = false;
  let pressure = pressureOf(ctx, agent.session);
  const windowTokens = routeChanged ? info.context.contextWindow : pressure?.contextWindow ?? info.context.contextWindow;
  let surfaceTokens = measurement.surfaceTokens || measurement.totalTokens;
  let sample = selectOccupancy({
    providerTokens: pressure?.projectedTokens ?? pressure?.pressureTokens,
    surfaceTokens,
    capacityTokens: windowTokens,
    routeChanged
  });
  const pruneAt = config.pruneAt ?? 0.45;
  if (config.prune !== false && sample.usedTokens / windowTokens >= pruneAt) {
    const pruner = optionalPruner(ctx);
    if (pruner) {
      try {
        pruner.pruneSession(agent.session);
        measurement = ctx.tokenMeter.measure(agent.session);
        pressure = pressureOf(ctx, agent.session);
        surfaceTokens = measurement.surfaceTokens || measurement.totalTokens;
        sample = selectOccupancy({
          providerTokens: pressure?.projectedTokens ?? pressure?.pressureTokens,
          surfaceTokens,
          capacityTokens: windowTokens,
          routeChanged
        });
        pruned = true;
      } catch (error) {
        ctx.logger.warn(`optcompact: prune failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  const contextTokens = sample.usedTokens;
  const safetyTokens = Math.max(sample.usedTokens, surfaceTokens);
  const boundary = lastCheckpointTurn.get(agent.session) !== turn;
  lastCheckpointTurn.set(agent.session, turn);
  if (lastCompaction.get(agent.session) === turn) {
    recordSkip(config.evidencePath, turn, 'cooldown');
    return null;
  }
  const occupancy = contextTokens / windowTokens;
  const { units, seqs } = buildUnits(measurement, turn, config.firstCompactableNode ?? 1);

  const tailNodes = Math.max(1, config.tailNodes ?? 4);
  let cut = Math.max(0, units.length - tailNodes);
  const tailTokens = units.slice(cut).reduce((sum, unit) => sum + Math.max(0, unit.tokens), 0);
  const decision = decideCheckpoint({
    occupancy,
    atBoundary: boundary,
    contextTokens,
    windowTokens,
    checkpointTokens: config.checkpointTokens ?? 4_000,
    tailTokens,
    maxOccupancy: config.maxOccupancy ?? 0.5,
    urgentOccupancy: config.urgentOccupancy ?? 0.5,
    hardOccupancy: config.hardOccupancy ?? 0.9,
    safetyOccupancy: safetyTokens / windowTokens
  });
  writeEvidence(config.evidencePath ?? '', {
    mode: 'checkpoint',
    turn,
    occupancy,
    windowTokens,
    surfaceTokens,
    usedTokens: sample.usedTokens,
    source: sample.source,
    route: routeKey,
    routeChanged,
    safetyOccupancy: safetyTokens / windowTokens,
    boundary,
    pruned,
    ...decision
  });

  if (decision.action !== 'checkpoint') return decision;
  if (cut < 1 || cut >= units.length) {
    recordSkip(config.evidencePath, turn, 'insufficient-units');
    return null;
  }
  const compaction = compactionOf(ctx, agent.session);
  if (!compaction) {
    recordSkip(config.evidencePath, turn, 'no-compaction-service');
    return null;
  }
  if (agent.session.eventAt) {
    const typeOf = (seq: number): string | undefined => agent.session.eventAt?.(seq)?.type;
    cut = snapCutToStep(seqs, cut, typeOf);
    if (cut === 0) {
      recordSkip(config.evidencePath, turn, 'no-step-boundary');
      return null;
    }
  }
  const startSeq = seqs[0];
  const endSeq = seqs[cut - 1];
  if (startSeq === undefined || endSeq === undefined) return null;

  await compaction.compactRegion(startSeq, endSeq, agent, signal);
  lastCompaction.set(agent.session, turn);
  let actual = decision;
  try {
    // Measure the post state on the same surface basis as the pre surface total:
    // the projection still carries a provider/heuristic residual right after a
    // large shadow, which would overstate the retained context.
    const after = ctx.tokenMeter.measure(agent.session);
    const afterTokens = after.surfaceTokens || after.totalTokens;
    actual = {
      ...decision,
      postTokens: afterTokens,
      ratio: surfaceTokens > 0 ? 1 - afterTokens / surfaceTokens : 0,
      targetOccupancy: afterTokens / windowTokens
    };
  } catch {
    // Keep the estimate when the meter cannot re-measure.
  }
  writeEvidence(config.evidencePath ?? '', {
    mode: 'checkpoint',
    turn,
    action: 'compacted',
    cutIndex: cut,
    startSeq,
    endSeq,
    tailTokens,
    postTokens: actual.postTokens,
    ratio: actual.ratio,
    targetOccupancy: actual.targetOccupancy
  });
  return actual;
}

/** Register the plugin handlers; returns a disposer. */
export function install(ctx: DshContext, config: DshConfig = {}): () => void {
  const disposers: unknown[] = [];
  ctx.logger.info?.(
    `optcompact: policy active (firstCompactableNode=${config.firstCompactableNode ?? 1}, qualityFloor=${config.params?.qualityFloor ?? 0.7})`
  );

  disposers.push(
    ctx.on('agent/pre-step', async (payload: unknown, next: () => Promise<unknown>) => {
      const { agent, turn, signal } = payload as { agent: DshAgent; turn: number; signal: AbortSignal };
      try {
        if ((config.mode ?? 'checkpoint') === 'gain') await maybeCompact(ctx, config, agent, turn, signal);
        else await maybeCheckpoint(ctx, config, agent, turn, signal);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        recordSkip(config.evidencePath, turn, `error:${message}`);
        ctx.logger.warn(`optcompact: ${message}; continuing the step`);
      }
      return next();
    })
  );

  disposers.push(
    ctx.on('agent/request-error', async (payload: unknown, next: () => Promise<unknown>) => {
      const { agent, failure, signal } = payload as {
        agent: DshAgent;
        failure: { code?: string };
        signal: AbortSignal;
      };
      if (failure.code !== 'CONTEXT_WINDOW_EXCEEDED' || signal.aborted) return next();
      const compaction = compactionOf(ctx, agent.session);
      if (!compaction) return next();
      const generation = agent.session.surface.replaceGeneration;
      try {
        await compaction.compactIfNeeded(agent, 'context-overflow', signal);
      } catch (error) {
        ctx.logger.warn(`optcompact: overflow recovery failed: ${error instanceof Error ? error.message : String(error)}`);
        return next();
      }
      return agent.session.surface.replaceGeneration > generation ? { kind: 'retry' } : next();
    })
  );

  return () => {
    for (const dispose of disposers) if (typeof dispose === 'function') (dispose as () => void)();
  };
}

/** Cordis plugin name. */
export const name = 'optcompact-compaction-policy';

/**
 * Services required from the composition.
 *
 * The compaction backend is deliberately absent: it lives in the preset's
 * isolated `compaction` group, and a row that cannot see it would pend forever.
 * DSH treats a pending preset row as fatal for every session on that preset, so
 * the backend is resolved per call through {@link compactionOf} instead.
 */
export const inject = ['tokenMeter', 'llm'];

/** Cordis plugin entry. */
export function apply(ctx: DshContext, config: DshConfig = {}): () => void {
  return install(ctx, config);
}
