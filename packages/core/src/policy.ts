/**
 * Per-turn compaction decision rule.
 *
 * The rule sums token-denominated gains over the oldest prefix, adds the
 * load-reduction benefit, and compacts when the total clears the gate.
 *
 * @module
 */
import { defaultParams } from './defaults.ts';
import { remainingTurns, unitValue } from './hazard.ts';
import { summaryFidelity } from './fidelity.ts';
import { economicInterval } from './interval.ts';
import type {
  CompactionAction,
  ContextUnit,
  Decision,
  GainBreakdown,
  PolicyParams,
  PolicyState,
  Urgency
} from './types.ts';

/** True when a cut keeps every assistant tool call next to its result. */
export function isToolBalanced(units: readonly ContextUnit[], cut: number): boolean {
  const open = new Map<string, number>();
  for (let i = 0; i < units.length; i += 1) {
    const unit = units[i];
    if (!unit || !unit.toolPairId || !unit.role) continue;
    if (unit.role === 'call') {
      open.set(unit.toolPairId, i);
      continue;
    }
    const callIndex = open.get(unit.toolPairId);
    if (callIndex === undefined) continue;
    if (callIndex < cut && i >= cut) return false;
    open.delete(unit.toolPairId);
  }
  return true;
}

interface Candidate {
  cutIndex: number;
  retentionRatio: number;
  shadowTokens: number;
  summaryTokens: number;
  fidelity: number;
  lostValue: number;
  rawLostValue: number;
  valueSum: number;
  includedCheckpoint: boolean;
  tokensSaved: number;
  summaryCost: number;
  riskBenefit: number;
  fixedCost: number;
  total: number;
}

interface SearchResult {
  candidates: Candidate[];
  candidateTotals: number[];
  best: Candidate | null;
  maxCut: Candidate | null;
}

function emptyDecision(
  state: PolicyState,
  params: PolicyParams,
  reasons: string[],
  urgency: Urgency = 'none'
): Decision {
  const thresholdTokens = Math.max(1, state.windowTokens - state.outputReserveTokens - state.headroomTokens);
  const tailFloorTokens = Math.max(0, params.tailRatio * Math.max(0, state.windowTokens - state.outputReserveTokens));
  const zero: GainBreakdown = {
    tokensSaved: 0,
    summaryCost: 0,
    lostValue: 0,
    riskBenefit: 0,
    fixedCost: 0,
    total: 0
  };
  return {
    action: 'keep',
    urgency,
    cutIndex: 0,
    shadowTokens: 0,
    retentionRatio: params.retentionRatio,
    summaryTokens: 0,
    fidelity: 1,
    expectedGainTokens: 0,
    expectedQualityLoss: 0,
    riskBenefit: 0,
    cer: 0,
    nextCheckInTurns: safeInterval(state, params),
    reasons,
    breakdown: zero,
    diagnostics: {
      load: state.windowTokens > 0 ? state.contextTokens / state.windowTokens : 0,
      thresholdTokens,
      tailFloorTokens,
      candidateTotals: [],
      bestCutIndex: 0,
      tau: params.tau,
      horizonTurns: remainingTurns(params),
      includedCheckpoint: false
    }
  };
}

function safeInterval(state: PolicyState, params: PolicyParams): number {
  const growth = Math.max(1, state.growthPerTurn);
  const interval = economicInterval({
    fixedCallCost: Math.max(0, state.prices.fixedCallCost),
    inputPrice: Math.max(1e-12, state.prices.input),
    retentionRatio: params.retentionRatio,
    growthPerTurn: growth
  });
  return Math.max(1, Math.round(interval));
}

function search(state: PolicyState, params: PolicyParams): SearchResult {
  const units = state.units;
  const n = units.length;
  const horizon = remainingTurns(params);
  const windowTokens = Math.max(1, state.windowTokens);
  const tailFloor = Math.max(0, params.tailRatio * Math.max(0, windowTokens - state.outputReserveTokens));
  const fixedCost = Math.max(0, state.prices.fixedCallCost);
  const degradation = state.degradation ?? params.degradation;
  const riskPrice = Math.max(0, degradation.price) * Math.max(0, state.prices.input) * windowTokens;
  const loadBefore = Math.max(0, state.contextTokens / windowTokens);
  const pressure = Math.max(1, degradation.exponent);

  const prefixTokens = new Array<number>(n + 1).fill(0);
  for (let i = 0; i < n; i += 1) {
    prefixTokens[i + 1] = prefixTokens[i]! + Math.max(0, units[i]?.tokens ?? 0);
  }
  const totalTokens = prefixTokens[n]!;

  const checkpointTokens = Math.max(0, state.checkpoint?.tokens ?? 0);
  const checkpointGeneration = Math.max(0, state.checkpoint?.generation ?? 0) + 1;
  const checkpointFidelity = Math.min(1, Math.max(0, state.checkpoint?.fidelity ?? 1));
  const checkpointUnit: ContextUnit = {
    id: 'checkpoint',
    type: 'decision',
    tokens: checkpointTokens,
    createdTurn: 0,
    lastReferencedTurn: state.turn
  };
  const checkpointValue =
    checkpointTokens > 0 ? unitValue(checkpointUnit, state.turn, params) * checkpointFidelity : 0;
  const lossPrice = Math.max(1, params.lossAversion);

  const bestByCut = new Array<Candidate | null>(n + 1).fill(null);
  const candidateTotals = new Array<number>(n + 1).fill(Number.NEGATIVE_INFINITY);

  for (const retentionRatio of params.retentionGrid) {
    const rho = Math.min(1, Math.max(0, retentionRatio));
    const values: number[] = [];
    for (let i = 0; i < n; i += 1) {
      values.push(unitValue(units[i]!, state.turn, params));
    }

    for (let k = 1; k < n; k += 1) {
      const shadowTokens = prefixTokens[k]!;
      const tailTokens = totalTokens - shadowTokens;
      if (tailTokens + 1e-9 < tailFloor) continue;
      if (shadowTokens + 1e-9 < params.minShadowTokens) continue;
      if (!isToolBalanced(units, k)) continue;

      const includeCheckpoint = checkpointTokens > 0 && checkpointFidelity >= params.checkpointFloor;
      for (const include of includeCheckpoint ? [false, true] : [false]) {
        const spanTotal = shadowTokens + (include ? checkpointTokens : 0);
        const summaryTokens = spanTotal * rho;
        const loadAfter = Math.max(0, (state.contextTokens - spanTotal * (1 - rho)) / windowTokens);
        const riskBenefit = horizon * riskPrice * (loadBefore ** pressure - loadAfter ** pressure);

        let rawLostValue = 0;
        let spanValue = 0;
        for (let i = 0; i < k; i += 1) {
          const unit = units[i]!;
          const value = values[i]!;
          const fidelity = summaryFidelity({
            retentionRatio: rho,
            spanTokens: spanTotal,
            type: unit.type,
            params,
            generation: (unit.generation ?? 0) + 1
          });
          rawLostValue += (1 - fidelity) * value;
          spanValue += value;
        }
        if (include && checkpointValue > 0) {
          const checkpointFidelityAfter = summaryFidelity({
            retentionRatio: rho,
            spanTokens: spanTotal,
            type: 'decision',
            params,
            generation: checkpointGeneration
          });
          rawLostValue += (1 - checkpointFidelityAfter) * checkpointValue;
        }
        const operationValue = spanValue + (include ? checkpointValue : 0);
        const fidelity = operationValue > 0 ? 1 - rawLostValue / operationValue : 1;
        if (fidelity + 1e-12 < params.qualityFloor) continue;

        const lostValue = rawLostValue * lossPrice;
        const tokensSaved = state.prices.input * horizon * spanTotal * (1 - rho);
        const summaryCost = state.prices.input * spanTotal + state.prices.output * rho * spanTotal;
        const total = tokensSaved - summaryCost - lostValue + riskBenefit - fixedCost;

        const candidate: Candidate = {
          cutIndex: k,
          retentionRatio: rho,
          shadowTokens,
          summaryTokens,
          fidelity,
          lostValue,
          rawLostValue,
          valueSum: operationValue,
          includedCheckpoint: include,
          tokensSaved,
          summaryCost,
          riskBenefit,
          fixedCost,
          total
        };
        const existing = bestByCut[k];
        if (!existing || total > existing.total) {
          bestByCut[k] = candidate;
          candidateTotals[k] = total;
        }
      }
    }
  }

  let best: Candidate | null = null;
  let maxCut: Candidate | null = null;
  for (const candidate of bestByCut) {
    if (!candidate) continue;
    if (!best || candidate.total > best.total) best = candidate;
    if (!maxCut || candidate.shadowTokens > maxCut.shadowTokens) maxCut = candidate;
  }
  return { candidates: bestByCut.filter((c): c is Candidate => c !== null), candidateTotals, best, maxCut };
}

function toDecision(
  state: PolicyState,
  params: PolicyParams,
  candidate: Candidate,
  action: CompactionAction,
  urgency: Urgency,
  reasons: string[],
  candidateTotals: number[]
): Decision {
  const breakdown: GainBreakdown = {
    tokensSaved: candidate.tokensSaved,
    summaryCost: candidate.summaryCost,
    lostValue: candidate.lostValue,
    riskBenefit: candidate.riskBenefit,
    fixedCost: candidate.fixedCost,
    total: candidate.total
  };
  const cost = candidate.summaryCost + candidate.lostValue + candidate.fixedCost;
  return {
    action,
    urgency,
    cutIndex: candidate.cutIndex,
    shadowTokens: candidate.shadowTokens,
    retentionRatio: candidate.retentionRatio,
    summaryTokens: candidate.summaryTokens,
    fidelity: candidate.fidelity,
    expectedGainTokens: candidate.total,
    expectedQualityLoss: candidate.rawLostValue,
    riskBenefit: candidate.riskBenefit,
    cer: cost > 0 ? candidate.tokensSaved / cost : Number.POSITIVE_INFINITY,
    nextCheckInTurns: safeInterval(state, params),
    reasons,
    breakdown,
    diagnostics: {
      load: state.windowTokens > 0 ? state.contextTokens / state.windowTokens : 0,
      thresholdTokens: Math.max(1, state.windowTokens - state.outputReserveTokens - state.headroomTokens),
      tailFloorTokens: Math.max(0, params.tailRatio * Math.max(0, state.windowTokens - state.outputReserveTokens)),
      candidateTotals,
      bestCutIndex: candidate.cutIndex,
      tau: params.tau,
      horizonTurns: remainingTurns(params),
      includedCheckpoint: candidate.includedCheckpoint
    }
  };
}

/**
 * Decide whether to compact at the current turn.
 * Returns a `keep` decision for empty or short contexts.
 */
export function decide(state: PolicyState): Decision {
  const params = state.params ?? defaultParams();
  if (state.units.length === 0) return emptyDecision(state, params, ['empty-context']);

  const thresholdTokens = Math.max(1, state.windowTokens - state.outputReserveTokens - state.headroomTokens);
  const overloaded = state.contextTokens + state.growthPerTurn > thresholdTokens;
  const result = search(state, params);

  if (overloaded) {
    if (!result.maxCut) return emptyDecision(state, params, ['no-feasible-cut'], 'hard');
    return toDecision(state, params, result.maxCut, 'compact', 'hard', ['pressure'], result.candidateTotals);
  }

  if (
    state.lastCompactionTurn !== undefined &&
    state.turn - state.lastCompactionTurn < params.cooldownTurns
  ) {
    return emptyDecision(state, params, ['cooldown']);
  }

  if (!result.best) return emptyDecision(state, params, ['no-feasible-cut']);
  if (!(result.best.total > params.hysteresis)) return emptyDecision(state, params, ['below-gate']);
  return toDecision(state, params, result.best, 'compact', 'soft', ['positive-gain'], result.candidateTotals);
}
