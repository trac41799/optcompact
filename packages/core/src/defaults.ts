/**
 * Default model parameters and the merge helper.
 *
 * @module
 */
import type { PolicyParams } from './types.ts';

/** Default parameters, chosen as calibration starting points, not constants. */
export const DEFAULTS: PolicyParams = {
  tau: 12,
  beta: 0.98,
  horizonTurns: 50,
  retentionRatio: 0.16,
  retentionGrid: [0.05, 0.08, 0.12, 0.16, 0.25, 0.4],
  tailRatio: 0.16,
  minShadowTokens: 512,
  cooldownTurns: 3,
  hysteresis: 0,
  hazardFloor: 0.01,
  typeHazard: {
    goal: 0.9,
    constraint: 0.8,
    decision: 0.6,
    error: 0.7,
    file: 0.4,
    tool: 0.25,
    chatter: 0.1
  },
  typeCost: {
    goal: 8,
    constraint: 6,
    decision: 3,
    error: 2,
    file: 1.2,
    tool: 0.5,
    chatter: 0.1
  },
  typeCeiling: {
    goal: 1,
    constraint: 0.98,
    decision: 0.95,
    error: 0.98,
    file: 0.9,
    tool: 0.75,
    chatter: 0.95
  },
  gamma: 1,
  dMin: 0.15,
  dMax: 0.9,
  spanScale: 25_000,
  degradation: { price: 0.05, exponent: 2 },
  lossAversion: 3,
  qualityFloor: 0.7,
  checkpointFloor: 0.5
};

/** Merge partial parameters over the defaults, including nested records. */
export function defaultParams(overrides: Partial<PolicyParams> = {}): PolicyParams {
  return {
    ...DEFAULTS,
    ...overrides,
    typeHazard: { ...DEFAULTS.typeHazard, ...overrides.typeHazard },
    typeCost: { ...DEFAULTS.typeCost, ...overrides.typeCost },
    typeCeiling: { ...DEFAULTS.typeCeiling, ...overrides.typeCeiling },
    degradation: { ...DEFAULTS.degradation, ...overrides.degradation },
    retentionGrid: overrides.retentionGrid ? [...overrides.retentionGrid] : [...DEFAULTS.retentionGrid]
  };
}
