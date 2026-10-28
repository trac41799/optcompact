import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  decide,
  defaultParams,
  type ContextUnit,
  type PolicyState
} from '../src/index.ts';

const params = defaultParams();

const unit = (over: Partial<ContextUnit>): ContextUnit => ({
  id: `u${Math.random().toString(16).slice(2)}`,
  type: 'file',
  tokens: 10_000,
  createdTurn: 1,
  lastReferencedTurn: 1,
  ...over
});

function state(over: Partial<PolicyState> = {}): PolicyState {
  return {
    turn: 20,
    windowTokens: 100_000,
    outputReserveTokens: 8_000,
    headroomTokens: 0,
    contextTokens: 40_000,
    growthPerTurn: 2_000,
    units: [
      unit({ id: 'a', lastReferencedTurn: 2 }),
      unit({ id: 'b', lastReferencedTurn: 4 }),
      unit({ id: 'c', lastReferencedTurn: 6 }),
      unit({ id: 'd', lastReferencedTurn: 18 })
    ],
    prices: { input: 1, output: 4, fixedCallCost: 20_000 },
    params,
    ...over
  };
}

test('keeps an empty context', () => {
  const decision = decide(state({ units: [], contextTokens: 0 }));
  assert.equal(decision.action, 'keep');
  assert.equal(decision.cutIndex, 0);
});

test('compacts when pressure exceeds the safe window', () => {
  const decision = decide(state({ contextTokens: 95_000, growthPerTurn: 8_000 }));
  assert.equal(decision.action, 'compact');
  assert.equal(decision.urgency, 'hard');
});

test('compacts a stale, bulky prefix with positive gain', () => {
  const decision = decide(state());
  assert.equal(decision.action, 'compact');
  assert.equal(decision.urgency, 'soft');
  assert.ok(decision.expectedGainTokens > 0);
  assert.ok(decision.shadowTokens > 0);
});

test('retains a recent tail even when the prefix looks valuable', () => {
  const decision = decide(
    state({
      units: [unit({ id: 'only', tokens: 20_000, lastReferencedTurn: 1 })],
      contextTokens: 20_000
    })
  );
  assert.equal(decision.action, 'keep');
});

test('respects the cooldown after a compaction', () => {
  const decision = decide(state({ turn: 22, lastCompactionTurn: 21 }));
  assert.equal(decision.action, 'keep');
  assert.ok(decision.reasons.includes('cooldown'));
});

test('never splits an assistant tool call from its result', () => {
  const decision = decide(
    state({
      units: [
        unit({ id: 'call', tokens: 12_000, type: 'tool', toolPairId: 'p1', role: 'call' }),
        unit({ id: 'result', tokens: 12_000, type: 'tool', toolPairId: 'p1', role: 'result' }),
        unit({ id: 'tail', tokens: 30_000, type: 'file', lastReferencedTurn: 19 })
      ],
      contextTokens: 54_000
    })
  );
  assert.notEqual(decision.cutIndex, 1);
});

test('reports a gain breakdown that sums to the total', () => {
  const decision = decide(
    state({
      units: [
        unit({ id: 'a', tokens: 30_000 }),
        unit({ id: 'tail', tokens: 30_000, lastReferencedTurn: 19 })
      ],
      contextTokens: 60_000
    })
  );
  const b = decision.breakdown;
  const sum = b.tokensSaved - b.summaryCost - b.lostValue + b.riskBenefit - b.fixedCost;
  assert.ok(Math.abs(sum - b.total) < 1e-9);
  assert.ok(Math.abs(decision.expectedGainTokens - b.total) < 1e-9);
});

test('a degraded checkpoint is never re-summarized', () => {
  const degraded = decide(
    state({ checkpoint: { tokens: 40_000, generation: 3, fidelity: 0.35 } })
  );
  const healthy = decide(
    state({ checkpoint: { tokens: 40_000, generation: 1, fidelity: 0.9 } })
  );
  assert.equal(degraded.diagnostics.includedCheckpoint, false);
  assert.equal(healthy.diagnostics.includedCheckpoint, true);
});

test('loss aversion prices quality loss above raw re-derivation cost', () => {
  const cautious = decide(state({ params: defaultParams({ lossAversion: 10 }) }));
  const neutral = decide(state({ params: defaultParams({ lossAversion: 1 }) }));
  assert.ok(cautious.expectedGainTokens <= neutral.expectedGainTokens);
});

test('selected cut maximizes the reported candidate totals', () => {
  const decision = decide(state());
  const totals = decision.diagnostics.candidateTotals;
  const best = Math.max(...totals);
  assert.ok(Math.abs(totals[decision.cutIndex] - best) < 1e-9);
});
