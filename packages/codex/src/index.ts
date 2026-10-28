/**
 * Codex integration: a policy controller for the app-server JSON-RPC surface,
 * plus the PreCompact/PostCompact hook evidence format.
 *
 * The app-server path is experimental. See `docs/research/codex-compaction-surface.md`.
 *
 * @module
 */
import {
  decide,
  defaultParams,
  type ContextUnit,
  type Decision,
  type PolicyParams
} from '@optcompact/core';

/** Token usage reported by `thread/tokenUsage/updated`. */
export interface CodexUsage {
  inputTokens: number;
  outputTokens?: number;
  cachedInputTokens?: number;
}

/** One observed usage update. */
export interface CodexUsageEvent {
  threadId: string;
  usage: CodexUsage;
}

/** Configuration for the controller. */
export interface CodexConfig {
  windowTokens?: number;
  outputReserveTokens?: number;
  params?: Partial<PolicyParams>;
  prices?: { input?: number; output?: number; fixedCallCost?: number };
  onDecision?: (decision: Decision, threadId: string) => void;
}

/** A JSON-RPC request that forces compaction. */
export interface CompactionRequest {
  method: 'thread/compact/start';
  params: { threadId: string };
}

interface ThreadState {
  turn: number;
  lastTokens: number;
  lastCompactionTurn?: number;
  units: ContextUnit[];
}

/** Decide when to call `thread/compact/start` from usage updates. */
export class CodexPolicy {
  private readonly threads = new Map<string, ThreadState>();
  private readonly config: Required<Pick<CodexConfig, 'windowTokens' | 'outputReserveTokens'>> & CodexConfig;

  constructor(config: CodexConfig = {}) {
    this.config = {
      ...config,
      windowTokens: config.windowTokens ?? 200_000,
      outputReserveTokens: config.outputReserveTokens ?? 8_192
    };
  }

  /** Consume one usage update and return a compaction request when the model gains. */
  observe(event: CodexUsageEvent): CompactionRequest | null {
    const state = this.threads.get(event.threadId) ?? { turn: 0, lastTokens: 0, units: [] };
    state.turn += 1;
    const input = Math.max(0, event.usage.inputTokens);
    const delta = Math.max(0, input - state.lastTokens);
    state.lastTokens = input;
    if (delta > 0) {
      state.units.push({
        id: `${event.threadId}:${state.turn}`,
        type: delta >= 4_000 ? 'tool' : 'chatter',
        tokens: delta,
        createdTurn: state.turn,
        lastReferencedTurn: state.turn
      });
    }
    this.threads.set(event.threadId, state);

    const prices = {
      input: this.config.prices?.input ?? 1,
      output: this.config.prices?.output ?? 4,
      fixedCallCost: this.config.prices?.fixedCallCost ?? 20_000
    };
    const decision = decide({
      turn: state.turn,
      windowTokens: this.config.windowTokens,
      outputReserveTokens: this.config.outputReserveTokens,
      headroomTokens: 0,
      contextTokens: input,
      growthPerTurn: delta,
      units: state.units,
      prices,
      params: defaultParams(this.config.params),
      lastCompactionTurn: state.lastCompactionTurn
    });
    this.config.onDecision?.(decision, event.threadId);
    if (decision.action !== 'compact') return null;
    return { method: 'thread/compact/start', params: { threadId: event.threadId } };
  }

  /** Record a confirmed compaction so the cooldown applies. */
  noteCompaction(threadId: string): void {
    const state = this.threads.get(threadId);
    if (state) state.lastCompactionTurn = state.turn;
  }
}

/** Evidence record produced from a Codex compaction hook. */
export interface CompactHookRecord {
  event: string;
  trigger: string;
  sessionId: string;
  cwd: string;
  model: string;
  transcriptPath: string;
  turnId: string;
  recordedAt: string;
}

/** Parse a PreCompact/PostCompact hook payload from stdin. */
export function parseCompactHook(raw: string): CompactHookRecord {
  const payload = JSON.parse(raw) as Record<string, unknown>;
  return {
    event: String(payload.hook_event_name ?? 'unknown'),
    trigger: String(payload.trigger ?? 'unknown'),
    sessionId: String(payload.session_id ?? ''),
    cwd: String(payload.cwd ?? ''),
    model: String(payload.model ?? ''),
    transcriptPath: String(payload.transcript_path ?? ''),
    turnId: String(payload.turn_id ?? ''),
    recordedAt: new Date().toISOString()
  };
}
