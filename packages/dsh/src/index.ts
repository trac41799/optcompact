/**
 * DeepSeek Harness compaction policy plugin.
 *
 * Keeps the shipped `dsh-compaction-basic` engine as the transaction owner and
 * `auto: false`, then decides *when* to compact with `@optcompact/core`.
 *
 * @module
 */
import { decide, defaultParams, type ContextUnit, type Decision, type PolicyParams, type PolicyState } from '@optcompact/core';

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
}

/** Structural subset of `Agent`. */
export interface DshAgent {
  session: DshSession;
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
  logger: { warn(message: string): void };
  tokenMeter: DshTokenMeter;
  llm: DshLlm;
  compaction: DshCompaction;
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

function unitType(tokens: number, index: number): ContextUnit['type'] {
  if (index === 0) return 'decision';
  if (tokens >= 4_000) return 'tool';
  if (tokens >= 1_000) return 'file';
  return 'chatter';
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
  if (signal.aborted) return null;
  const target = agent.session.requestHeader?.()?.config;
  if (!target?.provider || !target?.model) return null;

  const info = await ctx.llm.resolveModelInfo(target.provider, target.model, signal);
  if (signal.aborted || !info.context) return null;

  const measurement = ctx.tokenMeter.measure(agent.session);
  const contextTokens = measurement.surfaceTokens || measurement.totalTokens;
  const { units, seqs } = buildUnits(measurement, turn, config.firstCompactableNode ?? 1);
  if (units.length < 2) return null;

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
  config.onDecision?.(decision, agent, turn);
  if (decision.action !== 'compact') return decision;
  if (signal.aborted) return decision;

  const endSeq = seqs[decision.cutIndex - 1];
  const startSeq = seqs[0];
  if (startSeq === undefined || endSeq === undefined) return decision;

  await ctx.compaction.compactRegion(startSeq, endSeq, agent, signal);
  lastCompaction.set(agent.session, turn);
  return decision;
}

/** Register the plugin handlers; returns a disposer. */
export function install(ctx: DshContext, config: DshConfig = {}): () => void {
  const disposers: unknown[] = [];

  disposers.push(
    ctx.on('agent/pre-step', async (payload: unknown, next: () => Promise<unknown>) => {
      const { agent, turn, signal } = payload as { agent: DshAgent; turn: number; signal: AbortSignal };
      try {
        await maybeCompact(ctx, config, agent, turn, signal);
      } catch (error) {
        ctx.logger.warn(`optcompact: ${error instanceof Error ? error.message : String(error)}; continuing the step`);
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
      const generation = agent.session.surface.replaceGeneration;
      try {
        await ctx.compaction.compactIfNeeded(agent, 'context-overflow', signal);
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

/** Services required from the composition. */
export const inject = ['compaction', 'tokenMeter', 'llm'];

/** Cordis plugin entry. */
export function apply(ctx: DshContext, config: DshConfig = {}): () => void {
  return install(ctx, config);
}

export default apply;
