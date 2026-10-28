/**
 * Policy runner over a synthetic session.
 *
 * @module
 */
import { decide, defaultParams, type ContextUnit, type PolicyState } from '@optcompact/core';
import { hashUnit } from './generator.ts';
import type { PolicyName, SimOptions, SimResult, SimSession, SimUnit, SimUnitType } from './types.ts';

const CORE_TYPE: Record<SimUnitType, ContextUnit['type']> = {
  goal: 'goal',
  decision: 'decision',
  file: 'file',
  tool: 'tool',
  error: 'error',
  chatter: 'chatter'
};

const TRUE_CEILING: Record<SimUnitType, number> = {
  goal: 0.95,
  decision: 0.7,
  file: 0.6,
  tool: 0.45,
  error: 0.7,
  chatter: 0.6
};

function trueFidelity(type: SimUnitType, retentionRatio: number, spanTokens: number): number {
  const distortion = 0.2 + 0.7 * (1 - Math.exp(-spanTokens / 20_000));
  return Math.max(0, 1 - (1 - TRUE_CEILING[type]) * distortion * (1 - retentionRatio));
}

function cutForTarget(units: readonly SimUnit[], targetTokens: number): number {
  let remaining = units.reduce((sum, u) => sum + u.tokens, 0);
  let cut = 0;
  while (cut < units.length - 1 && remaining > targetTokens) {
    remaining -= units[cut]!.tokens;
    cut += 1;
  }
  return cut;
}

function allowedUnits(session: SimSession, turn: number): SimUnit[] {
  return session.units.filter((u) => u.createdTurn <= turn);
}

/**
 * Run one policy over a generated session.
 * The session carries latent reuse parameters; the policy sees only the
 * observable surface, never the latent hazard values.
 */
export function simulatePolicy(
  session: SimSession,
  policy: PolicyName,
  options: SimOptions = {}
): SimResult {
  const fixedLoad = options.fixedLoad ?? 0.8;
  const periodicTurns = options.periodicTurns ?? 15;
  const targetLoad = options.targetLoad ?? 0.6;
  const fixedCallCost = options.fixedCallCost ?? 2_000;
  const params = defaultParams(options.params);
  const tau = session.tauTrue;

  const unitIndex = new Map(session.units.map((u, i) => [u.id, i] as const));
  const live = new Map<string, boolean>();
  const fidelity = new Map<string, number>();
  const lastNeed = new Map<string, number>();
  let checkpointTokens = 0;
  let checkpointFidelity = 1;
  let contextTokens = 0;
  let tokensSpent = 0;
  let reworkTokens = 0;
  let needs = 0;
  let satisfied = 0;
  let lost = 0;
  let compactions = 0;
  let overflowTurns = 0;
  let maxContextTokens = 0;
  let inputTokens = 0;
  let lastCompactionTurn: number | undefined;

  for (let turn = 1; turn <= session.turns; turn += 1) {
    const all = allowedUnits(session, turn);
    for (const u of all) if (!live.has(u.id)) live.set(u.id, true);
    const liveUnits = all.filter((u) => live.get(u.id));
    contextTokens = checkpointTokens + liveUnits.reduce((sum, u) => sum + u.tokens, 0);

    let cut = 0;
    let retentionRatio = 0.16;
    let includeCheckpoint = true;

    if (policy === 'hazard') {
      const state: PolicyState = {
        turn,
        windowTokens: session.windowTokens,
        outputReserveTokens: 8_000,
        headroomTokens: 0,
        contextTokens,
        growthPerTurn: 6_000,
        units: liveUnits.map((u) => ({
          id: u.id,
          type: CORE_TYPE[u.type],
          tokens: u.tokens,
          createdTurn: u.createdTurn,
          lastReferencedTurn: lastNeed.get(u.id) ?? Math.max(1, u.createdTurn - 1),
          generation: 0
        })),
        prices: { input: 1, output: 4, fixedCallCost },
        params,
        lastCompactionTurn,
        checkpoint:
          checkpointTokens > 0
            ? { tokens: checkpointTokens, generation: compactions, fidelity: checkpointFidelity }
            : undefined
      };
      const decision = decide(state);
      if (decision.action === 'compact' && decision.cutIndex > 0) {
        cut = Math.min(decision.cutIndex, liveUnits.length - 1);
        retentionRatio = decision.retentionRatio;
        includeCheckpoint = decision.diagnostics.includedCheckpoint;
      }
    } else if (policy === 'fixed') {
      if (contextTokens / session.windowTokens >= fixedLoad) {
        cut = cutForTarget(liveUnits, targetLoad * session.windowTokens - checkpointTokens);
      }
    } else if (policy === 'periodic') {
      if (turn % periodicTurns === 0) {
        cut = cutForTarget(liveUnits, targetLoad * session.windowTokens - checkpointTokens);
      }
    }

    if (contextTokens > session.windowTokens) {
      overflowTurns += 1;
      cut = cutForTarget(liveUnits, targetLoad * session.windowTokens - checkpointTokens);
    }

    if (cut > 0) {
      const shadowed = liveUnits.slice(0, cut);
      const shadowedIds = new Set(shadowed.map((u) => u.id));
      const span = shadowed.reduce((sum, u) => sum + u.tokens, 0);
      const spanFidelity = trueFidelity(shadowed[0]?.type ?? 'tool', retentionRatio, span);
      for (const u of shadowed) {
        live.set(u.id, false);
        fidelity.set(u.id, trueFidelity(u.type, retentionRatio, span));
      }
      if (includeCheckpoint) {
        for (const [id, value] of fidelity) {
          if (!live.get(id) && !shadowedIds.has(id)) fidelity.set(id, value * spanFidelity);
        }
        checkpointTokens = retentionRatio * (checkpointTokens + span);
      } else {
        checkpointTokens += retentionRatio * span;
      }
      let weighted = 0;
      let weight = 0;
      for (const u of all) {
        if (live.get(u.id)) continue;
        weighted += (fidelity.get(u.id) ?? 0) * u.tokens;
        weight += u.tokens;
      }
      checkpointFidelity = weight > 0 ? weighted / weight : 1;
      compactions += 1;
      lastCompactionTurn = turn;
      const remaining = all.filter((u) => live.get(u.id));
      contextTokens = checkpointTokens + remaining.reduce((sum, u) => sum + u.tokens, 0);
    }

    maxContextTokens = Math.max(maxContextTokens, contextTokens);
    inputTokens += contextTokens;

    for (const u of all) {
      if (u.createdTurn >= turn) continue;
      const need = u.baseHazard * Math.exp(-(turn - u.createdTurn) / tau);
      if (hashUnit(session.seed, turn, unitIndex.get(u.id) ?? 0) >= need) continue;
      needs += 1;
      lastNeed.set(u.id, turn);
      if (live.get(u.id)) {
        satisfied += 1;
        continue;
      }
      const preserved = hashUnit(session.seed ^ 0x5f3759df, turn, unitIndex.get(u.id) ?? 0);
      if (preserved < (fidelity.get(u.id) ?? 0)) satisfied += 1;
      else {
        lost += 1;
        reworkTokens += u.costMultiplier * u.tokens;
      }
    }

    tokensSpent += contextTokens + session.outputTokensPerTurn;
  }

  return {
    policy,
    tokensSpent,
    reworkTokens,
    needs,
    satisfied,
    lost,
    compactions,
    overflowTurns,
    maxContextTokens,
    avgContextTokens: session.turns > 0 ? inputTokens / session.turns : 0,
    finalContextTokens: contextTokens
  };
}

/** Run every baseline plus the hazard policy on one session. */
export function runComparison(session: SimSession, options: SimOptions = {}): SimResult[] {
  const policies: PolicyName[] = ['never', 'fixed', 'periodic', 'hazard'];
  return policies.map((policy) => simulatePolicy(session, policy, options));
}
