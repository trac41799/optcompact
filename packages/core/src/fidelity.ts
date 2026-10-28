/**
 * Rate-distortion model of summary fidelity.
 *
 * @module
 */
import type { PolicyParams, UnitType } from './types.ts';

/** Input for one fidelity estimate. */
export interface FidelityInput {
  /** Summary size divided by shadowed span size, in `[0, 1]`. */
  retentionRatio: number;
  /** Shadowed span size in tokens. */
  spanTokens: number;
  /** Unit type driving the ceiling. */
  type: UnitType;
  /** Parameters supplying the distortion curve. */
  params: PolicyParams;
  /** Compaction generation of the material, at least one. */
  generation?: number;
}

/** Distortion floor at zero retention for a span of `spanTokens`. */
export function distortionFloor(spanTokens: number, params: PolicyParams): number {
  const span = Math.max(0, spanTokens);
  return params.dMin + (params.dMax - params.dMin) * (1 - Math.exp(-span / params.spanScale));
}

/**
 * Value fraction preserved by a summary at the given retention ratio.
 * Full retention preserves all value; a longer span and a smaller ratio lose more.
 * Repeated compaction compounds the loss once per generation.
 */
export function summaryFidelity(input: FidelityInput): number {
  const { params } = input;
  const ratio = Math.min(1, Math.max(0, input.retentionRatio));
  const lossCeiling = 1 - (params.typeCeiling[input.type] ?? params.typeCeiling.chatter);
  const distortion = distortionFloor(input.spanTokens, params) * (1 - ratio) ** params.gamma;
  const fidelity = Math.max(0, 1 - lossCeiling * distortion);
  const generation = Math.max(1, input.generation ?? 1);
  return fidelity ** generation;
}

/** Partial derivative of fidelity with respect to the retention ratio. */
export function fidelitySlope(input: FidelityInput): number {
  const { params } = input;
  const ratio = Math.min(1, Math.max(0, input.retentionRatio));
  const lossCeiling = 1 - (params.typeCeiling[input.type] ?? params.typeCeiling.chatter);
  const derivative = lossCeiling * distortionFloor(input.spanTokens, params) * params.gamma * (1 - ratio) ** (params.gamma - 1);
  return Math.max(0, derivative);
}
