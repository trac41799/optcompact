/**
 * Seeded session generator.
 *
 * @module
 */
import type { SimConfig, SimSession, SimUnit, SimUnitType } from './types.ts';

const TAU_TRUE = 9;

const TRUE_HAZARD: Record<SimUnitType, number> = {
  goal: 0.5,
  decision: 0.12,
  file: 0.1,
  tool: 0.07,
  error: 0.12,
  chatter: 0.02
};

const TRUE_COST: Record<SimUnitType, number> = {
  goal: 8,
  decision: 3,
  file: 1.5,
  tool: 0.6,
  error: 2,
  chatter: 0.1
};

/** Small deterministic 32-bit PRNG. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic uniform draw from a seed and two indices. */
export function hashUnit(seed: number, turn: number, index: number): number {
  let h = (seed ^ Math.imul(turn + 1, 0x9e3779b1) ^ Math.imul(index + 1, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

function unit(type: SimUnitType, tokens: number, turn: number, index: number): SimUnit {
  return {
    id: `t${turn}u${index}`,
    type,
    tokens: Math.round(tokens),
    createdTurn: turn,
    baseHazard: TRUE_HAZARD[type],
    costMultiplier: TRUE_COST[type]
  };
}

/** Generate a session whose units carry latent reuse parameters. */
export function generateSession(config: SimConfig): SimSession {
  const rand = mulberry32(config.seed);
  const units: SimUnit[] = [];
  for (let turn = 1; turn <= config.turns; turn += 1) {
    let index = 0;
    if (turn === 1) units.push(unit('goal', 600, turn, index++));
    units.push(unit(rand() < 0.25 ? 'decision' : 'chatter', 200 + rand() * 500, turn, index++));
    if (rand() < 0.05) units.push(unit('error', 300 + rand() * 600, turn, index++));
    if (rand() < 0.2) units.push(unit('file', 2_000 + rand() * 4_000, turn, index++));
    if (rand() < 0.5) units.push(unit('tool', 4_000 + rand() * 11_000, turn, index++));
  }
  return {
    seed: config.seed,
    turns: config.turns,
    windowTokens: config.windowTokens,
    outputTokensPerTurn: config.outputTokensPerTurn,
    tauTrue: TAU_TRUE,
    units
  };
}
