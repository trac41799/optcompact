/**
 * Simulator vocabulary: synthetic sessions with latent reuse.
 *
 * @module
 */
export type SimUnitType = 'goal' | 'decision' | 'file' | 'tool' | 'error' | 'chatter';

export interface SimUnit {
  id: string;
  type: SimUnitType;
  tokens: number;
  createdTurn: number;
  /** True per-turn reuse probability at creation. */
  baseHazard: number;
  /** True re-derivation cost multiplier. */
  costMultiplier: number;
}

export interface SimConfig {
  seed: number;
  turns: number;
  windowTokens: number;
  startTokens: number;
  outputTokensPerTurn: number;
}

export interface SimSession {
  seed: number;
  turns: number;
  windowTokens: number;
  outputTokensPerTurn: number;
  tauTrue: number;
  units: SimUnit[];
}

export type PolicyName = 'never' | 'fixed' | 'periodic' | 'hazard' | 'planned' | 'prune';

export interface SimResult {
  policy: PolicyName;
  tokensSpent: number;
  summaryTokens: number;
  reworkTokens: number;
  totalTokens: number;
  needs: number;
  satisfied: number;
  lost: number;
  compactions: number;
  overflowTurns: number;
  maxContextTokens: number;
  avgContextTokens: number;
  finalContextTokens: number;
}

export interface SimOptions {
  /** Fixed-threshold baseline load. */
  fixedLoad?: number;
  /** Periodic baseline interval in turns. */
  periodicTurns?: number;
  /** Target load after a baseline compaction. */
  targetLoad?: number;
  /** Fixed cost per summarization call. */
  fixedCallCost?: number;
  /** Parameter overrides for the hazard policy. */
  params?: Partial<import('@optcompact/core').PolicyParams>;
  /** Quality target for the planned policy. */
  qualityTarget?: number;
  /** Summary retention ratio for baselines and the planned policy. */
  retentionRatio?: number;
  /** Prune policy: remaining fraction of a pruned tool result. */
  pruneScale?: number;
  /** Prune policy: minimum age in turns before pruning. */
  pruneAge?: number;
  /** Prune policy: minimum token size before pruning. */
  pruneMinTokens?: number;
  /** Prune policy: load at which pruning starts. */
  pruneLoad?: number;
}
