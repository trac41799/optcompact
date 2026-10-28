/**
 * Reuse-hazard value model.
 *
 * The value of a context unit is the discounted sum of future re-derivation
 * costs, weighted by the probability that the unit is needed again.
 *
 * @module
 */
import type { ContextUnit, PolicyParams } from './types.ts';

/** Geometric decay per turn for a hazard with constant `tau`. */
export function hazardDecay(params: PolicyParams): number {
  return Math.exp(-1 / params.tau);
}

/** Discounted sum of the per-turn hazard weights. */
export function demandCoefficient(params: PolicyParams): number {
  const q = hazardDecay(params);
  if (params.beta < 1) {
    const bq = params.beta * q;
    return bq / (1 - bq);
  }
  const h = Math.max(1, params.horizonTurns);
  return (q * (1 - q ** h)) / (1 - q);
}

/** Per-turn need probability of a unit. */
export function unitHazard(unit: ContextUnit, turn: number, params: PolicyParams): number {
  const age = Math.max(0, turn - unit.lastReferencedTurn);
  const base = params.typeHazard[unit.type] ?? params.typeHazard.chatter;
  return Math.max(params.hazardFloor, base * Math.exp(-age / params.tau));
}

/** Token-equivalent cost of losing a unit. */
export function rederivationCost(unit: ContextUnit, params: PolicyParams): number {
  const multiplier = params.typeCost[unit.type] ?? params.typeCost.chatter;
  return multiplier * Math.max(0, unit.tokens);
}

/** Discounted expected value of keeping a unit, in utility units. */
export function unitValue(unit: ContextUnit, turn: number, params: PolicyParams): number {
  const age = Math.max(0, turn - unit.lastReferencedTurn);
  const base = params.typeHazard[unit.type] ?? params.typeHazard.chatter;
  return (
    demandCoefficient(params) *
    rederivationCost(unit, params) *
    base *
    Math.exp(-age / params.tau)
  );
}

/**
 * Fit the reuse decay constant from observed reuse gaps.
 * The exponential hazard has mean `tau`; the sample mean is its estimator.
 */
export function fitReuseTau(gaps: readonly number[]): number {
  if (gaps.length === 0) throw new Error('fitReuseTau: an empty sample has no estimate');
  const total = gaps.reduce((sum, gap) => sum + Math.max(0, gap), 0);
  return Math.max(1, total / gaps.length);
}

/** Estimate context growth as an exponentially weighted mean of per-turn deltas. */
export function ewmaGrowth(deltas: readonly number[], alpha: number): number {
  const weight = Math.min(1, Math.max(0, alpha));
  let value = 0;
  for (const delta of deltas) value = weight * delta + (1 - weight) * value;
  return value;
}

/** Expected remaining turns used by the carrying-cost term. */
export function remainingTurns(params: PolicyParams): number {
  if (params.beta < 1) return params.beta / (1 - params.beta);
  return Math.max(1, params.horizonTurns);
}
