/**
 * OptCompact simulator: seeded ground-truth sessions for policy comparison.
 *
 * @module
 */
export { generateSession, hashUnit, mulberry32 } from './generator.ts';
export { runComparison, simulatePolicy } from './runner.ts';
export type {
  PolicyName,
  SimConfig,
  SimOptions,
  SimResult,
  SimSession,
  SimUnit,
  SimUnitType
} from './types.ts';
