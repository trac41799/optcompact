/**
 * Multi-compaction schedule planner.
 *
 * Finds the compaction interval that minimizes cumulative token cost over a
 * horizon while keeping hazard-weighted retained quality above a target.
 *
 * @module
 */
import { summaryFidelity } from './fidelity.ts';
import type { PolicyParams, PriceTable } from './types.ts';

/** Input to the schedule planner. */
export interface ScheduleInput {
  /** Turns to plan over. */
  horizonTurns: number;
  /** Tokens added per turn. */
  growthPerTurn: number;
  /** Model context window. */
  windowTokens: number;
  /** Provider output reservation. */
  outputReserveTokens: number;
  /** Token prices and fixed call cost. */
  prices: PriceTable;
  /** Model parameters supplying hazard and fidelity shape. */
  params: PolicyParams;
  /** Minimum hazard-weighted retained quality, in `[0, 1]`. */
  qualityTarget: number;
  /** Summary retention ratio; defaults to the parameter default. */
  retentionRatio?: number;
}

/** One planned schedule. */
export interface SchedulePlan {
  /** Turns between compactions. */
  intervalTurns: number;
  /** Number of compactions in the horizon. */
  compactions: number;
  /** Retention ratio used. */
  retentionRatio: number;
  /** Total token-equivalent cost. */
  expectedTokens: number;
  /** Hazard-weighted retained quality. */
  expectedQuality: number;
  /** Tokens spent carrying context. */
  carryingTokens: number;
  /** Tokens spent on summarization calls. */
  summaryTokens: number;
  /** Tokens spent re-deriving lost context. */
  lossTokens: number;
}

interface Evaluation {
  intervalTurns: number;
  compactions: number;
  carryingTokens: number;
  summaryTokens: number;
  lossTokens: number;
  expectedTokens: number;
  expectedQuality: number;
}

function evaluate(input: ScheduleInput, interval: number, retention: number): Evaluation {
  const { horizonTurns: horizon, growthPerTurn: growth, prices, params } = input;
  const tailFloor = Math.max(0, params.tailRatio * Math.max(0, input.windowTokens - input.outputReserveTokens));
  const generation = new Array<number>(horizon + 1).fill(0);
  const phiBase = summaryFidelity({
    retentionRatio: retention,
    spanTokens: Math.max(1, growth * interval),
    type: 'file',
    params,
    generation: 1
  });
  const lossMultiplier = params.typeCost.file;

  let context = 0;
  let carrying = 0;
  let summary = 0;
  let compactions = 0;

  for (let turn = 1; turn <= horizon; turn += 1) {
    context += growth;
    if (interval > 0 && turn % interval === 0 && turn < horizon) {
      const tail = Math.min(context, tailFloor);
      const span = context - tail;
      if (span > 0.5) {
        summary += prices.fixedCallCost + prices.input * span + prices.output * retention * span;
        context = tail + retention * span;
        compactions += 1;
        for (let created = 1; created <= turn; created += 1) generation[created] = (generation[created] ?? 0) + 1;
      }
    }
    carrying += context;
  }

  let weightSum = 0;
  let qualitySum = 0;
  let loss = 0;
  for (let created = 1; created <= horizon; created += 1) {
    const age = horizon - created;
    const weight = Math.exp(-age / params.tau);
    const phi = phiBase ** generation[created]!;
    weightSum += weight;
    qualitySum += weight * phi;
    loss += (1 - phi) * growth * lossMultiplier;
  }

  const quality = weightSum > 0 ? qualitySum / weightSum : 1;
  return {
    intervalTurns: interval,
    compactions,
    carryingTokens: carrying,
    summaryTokens: summary,
    lossTokens: loss,
    expectedTokens: carrying + summary + loss,
    expectedQuality: quality
  };
}

/**
 * Choose the cheapest interval whose retained quality meets the target.
 * Falls back to the highest-quality schedule when no interval is feasible.
 */
export function planSchedule(input: ScheduleInput): SchedulePlan {
  if (!(input.horizonTurns > 0)) throw new Error('horizonTurns must be positive');
  if (!(input.growthPerTurn >= 0)) throw new Error('growthPerTurn must be non-negative');
  if (!(input.qualityTarget >= 0 && input.qualityTarget <= 1)) throw new Error('qualityTarget must be in [0, 1]');

  const candidates = input.retentionRatio
    ? [Math.min(1, Math.max(0.01, input.retentionRatio))]
    : [0.08, 0.12, 0.16, 0.25, 0.35];

  let best: Evaluation | null = null;
  let bestRetention = candidates[0]!;
  let fallback: Evaluation | null = null;
  let fallbackRetention = candidates[0]!;

  for (const retention of candidates) {
    for (let interval = 1; interval <= input.horizonTurns; interval += 1) {
      const candidate = evaluate(input, interval, retention);
      if (!fallback || candidate.expectedQuality > fallback.expectedQuality) {
        fallback = candidate;
        fallbackRetention = retention;
      }
      if (candidate.expectedQuality + 1e-12 < input.qualityTarget) continue;
      if (!best || candidate.expectedTokens < best.expectedTokens - 1e-6) {
        best = candidate;
        bestRetention = retention;
      } else if (Math.abs(candidate.expectedTokens - best.expectedTokens) <= 1e-6 && candidate.intervalTurns > best.intervalTurns) {
        best = candidate;
        bestRetention = retention;
      }
    }
  }

  const chosen = best ?? fallback;
  if (!chosen) throw new Error('planSchedule: no schedule could be evaluated');
  return {
    intervalTurns: chosen.intervalTurns,
    compactions: chosen.compactions,
    retentionRatio: best ? bestRetention : fallbackRetention,
    expectedTokens: chosen.expectedTokens,
    expectedQuality: chosen.expectedQuality,
    carryingTokens: chosen.carryingTokens,
    summaryTokens: chosen.summaryTokens,
    lossTokens: chosen.lossTokens
  };
}
