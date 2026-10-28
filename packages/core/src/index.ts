/**
 * OptCompact core: a dependency-free model for when coding-agent sessions
 * should compact their context.
 *
 * @module
 */
export type {
  Anchor,
  CompactionAction,
  ContextUnit,
  Decision,
  DegradationParams,
  GainBreakdown,
  PolicyDiagnostics,
  PolicyParams,
  PolicyState,
  PriceTable,
  ToolRole,
  UnitType,
  Urgency
} from './types.ts';

export { DEFAULTS, defaultParams } from './defaults.ts';
export {
  demandCoefficient,
  hazardDecay,
  rederivationCost,
  remainingTurns,
  unitHazard,
  unitValue
} from './hazard.ts';
export { distortionFloor, fidelitySlope, summaryFidelity, type FidelityInput } from './fidelity.ts';
export { economicInterval, type IntervalInput } from './interval.ts';
export { decide, isToolBalanced } from './policy.ts';
export { anchorRetentionScore, decisionCer, extractAnchors } from './metrics.ts';
