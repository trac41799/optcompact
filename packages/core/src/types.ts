/**
 * Public vocabulary for the OptCompact decision model.
 *
 * @module
 */

/** Kind of context unit, used by the hazard and cost priors. */
export type UnitType = 'goal' | 'constraint' | 'decision' | 'error' | 'file' | 'tool' | 'chatter';

/** Role of a unit inside an assistant tool call. */
export type ToolRole = 'call' | 'result';

/** One addressable piece of the derived conversation context. */
export interface ContextUnit {
  /** Stable identifier within the session. */
  id: string;
  /** Semantic kind driving the priors. */
  type: UnitType;
  /** Token size of the unit. */
  tokens: number;
  /** Turn that created the unit. */
  createdTurn: number;
  /** Turn that last referenced the unit. */
  lastReferencedTurn: number;
  /** Optional raw text used for identifier extraction. */
  text?: string;
  /** Optional tool-call pairing key, used to keep calls and results together. */
  toolPairId?: string;
  /** Optional role inside a tool-call pair. */
  role?: ToolRole;
  /** Number of prior compactions this unit survived, used by the fidelity penalty. */
  generation?: number;
}

/** Token prices and the fixed cost of one summarization call. */
export interface PriceTable {
  /** Utility units per input token. */
  input: number;
  /** Utility units per output token. */
  output: number;
  /** Fixed cost of one summarization call, in utility units. */
  fixedCallCost: number;
}

/** State of the existing checkpoint that a new compaction would replace. */
export interface CheckpointState {
  /** Current checkpoint size in tokens. */
  tokens: number;
  /** Number of compactions the checkpoint has survived. */
  generation: number;
  /** Current value-weighted fidelity of the checkpoint. */
  fidelity: number;
}

/** Load-coupled quality degradation parameters. */
export interface DegradationParams {
  /** Price multiplier applied to the window, dimensionless. */
  price: number;
  /** Degradation exponent, at least one. */
  exponent: number;
}

/** Tunable model parameters. */
export interface PolicyParams {
  /** Hazard decay constant in turns. */
  tau: number;
  /** Per-turn discount factor. */
  beta: number;
  /** Horizon used when beta equals one. */
  horizonTurns: number;
  /** Default retention ratio used by the interval estimate. */
  retentionRatio: number;
  /** Retention ratios evaluated by the decision rule. */
  retentionGrid: readonly number[];
  /** Retained tail as a fraction of window minus output reservation. */
  tailRatio: number;
  /** Minimum shadowed span in tokens. */
  minShadowTokens: number;
  /** Turns to wait after a compaction. */
  cooldownTurns: number;
  /** Strict gain gate. */
  hysteresis: number;
  /** Hazard floor, keeps very old units from reaching zero. */
  hazardFloor: number;
  /** Base reuse propensity per unit type. */
  typeHazard: Record<UnitType, number>;
  /** Re-derivation cost multiplier per unit type. */
  typeCost: Record<UnitType, number>;
  /** Maximum fidelity per unit type under lossy summarization. */
  typeCeiling: Record<UnitType, number>;
  /** Distortion curvature in the retention ratio. */
  gamma: number;
  /** Distortion floor at zero retention. */
  dMin: number;
  /** Distortion ceiling at zero retention. */
  dMax: number;
  /** Span size at which omission saturates. */
  spanScale: number;
  /** Load-coupled degradation parameters. */
  degradation: DegradationParams;
  /** Shadow price of lost quality relative to tokens re-derived. */
  lossAversion: number;
  /** Minimum retained value fraction for any compaction. */
  qualityFloor: number;
  /** Minimum checkpoint fidelity required before re-summarizing it. */
  checkpointFloor: number;
}

/** Complete observable state submitted to the decision rule. */
export interface PolicyState {
  /** Current turn index. */
  turn: number;
  /** Model context window in tokens. */
  windowTokens: number;
  /** Output tokens reserved by the provider. */
  outputReserveTokens: number;
  /** Extra safety headroom in tokens. */
  headroomTokens: number;
  /** Derived context size in tokens. */
  contextTokens: number;
  /** Recent context growth in tokens per turn. */
  growthPerTurn: number;
  /** Compactable units in causal order. */
  units: readonly ContextUnit[];
  /** Token prices. */
  prices: PriceTable;
  /** Optional parameter overrides. */
  params?: PolicyParams;
  /** Turn of the last successful compaction. */
  lastCompactionTurn?: number;
  /** Optional degradation overrides. */
  degradation?: DegradationParams;
  /** Existing checkpoint that a new compaction would replace. */
  checkpoint?: CheckpointState;
}

/** Requested action. */
export type CompactionAction = 'keep' | 'compact';

/** Why compaction is requested. */
export type Urgency = 'none' | 'soft' | 'hard';

/** Additive explanation of one decision, all terms in utility units. */
export interface GainBreakdown {
  /** Future carrying cost avoided by shadowing the span. */
  tokensSaved: number;
  /** Input plus output cost of the summarization call. */
  summaryCost: number;
  /** Token-equivalent value destroyed by imperfect fidelity. */
  lostValue: number;
  /** Quality benefit from lowering the load. */
  riskBenefit: number;
  /** Fixed call cost. */
  fixedCost: number;
  /** Signed sum of every term. */
  total: number;
}

/** Machine-readable decision evidence. */
export interface PolicyDiagnostics {
  /** Current load, `contextTokens / windowTokens`. */
  load: number;
  /** Pressure threshold in tokens. */
  thresholdTokens: number;
  /** Retained tail floor in tokens. */
  tailFloorTokens: number;
  /** Best total per candidate cut, invalid entries are `-Infinity`. */
  candidateTotals: number[];
  /** Cut index chosen before hysteresis. */
  bestCutIndex: number;
  /** Hazard decay constant used. */
  tau: number;
  /** Expected remaining turns used. */
  horizonTurns: number;
  /** Whether the chosen candidate re-summarizes the existing checkpoint. */
  includedCheckpoint: boolean;
}

/** Decision returned for one observed turn. */
export interface Decision {
  /** `compact` or `keep`. */
  action: CompactionAction;
  /** `hard` when pressure forces the action. */
  urgency: Urgency;
  /** Number of leading units to shadow; zero when keeping. */
  cutIndex: number;
  /** Tokens in the shadowed span. */
  shadowTokens: number;
  /** Retention ratio selected for the summary. */
  retentionRatio: number;
  /** Estimated summary size in tokens. */
  summaryTokens: number;
  /** Value-weighted fidelity of the shadowed span. */
  fidelity: number;
  /** Signed decision value in utility units. */
  expectedGainTokens: number;
  /** Token-equivalent value destroyed. */
  expectedQualityLoss: number;
  /** Quality benefit from lower load. */
  riskBenefit: number;
  /** Tokens saved per unit of cost; Infinity when cost is zero. */
  cer: number;
  /** Suggested turns until the next check. */
  nextCheckInTurns: number;
  /** Human-readable reason codes. */
  reasons: string[];
  /** Additive explanation. */
  breakdown: GainBreakdown;
  /** Diagnostic evidence. */
  diagnostics: PolicyDiagnostics;
}

/** A checkable fact extracted from the pre-compaction text. */
export interface Anchor {
  /** Normalized anchor text. */
  text: string;
  /** Anchor kind. */
  kind: 'path' | 'error' | 'symbol' | 'number';
  /** Importance weight. */
  weight: number;
}
