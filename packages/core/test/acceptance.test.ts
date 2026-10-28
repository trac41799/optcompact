import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  anchorRetentionScore,
  decide,
  defaultParams,
  economicInterval,
  extractAnchors,
  type ContextUnit,
  type PolicyState
} from '../src/index.ts';

const unit = (over: Partial<ContextUnit> = {}): ContextUnit => ({
  id: 'u1',
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
    params: defaultParams(),
    ...over
  };
}

test('Given an empty context, when the engine decides, then it keeps', () => {
  const decision = decide(state({ units: [], contextTokens: 0 }));
  assert.equal(decision.action, 'keep');
  assert.equal(decision.cutIndex, 0);
});

test('Given a single unit context, when the engine decides, then it keeps', () => {
  const decision = decide(state({ units: [unit()], contextTokens: 10_000 }));
  assert.equal(decision.action, 'keep');
});

test('Given pressure past the safe window, when the engine decides, then it compacts hard', () => {
  const decision = decide(state({ contextTokens: 95_000, growthPerTurn: 8_000 }));
  assert.equal(decision.action, 'compact');
  assert.equal(decision.urgency, 'hard');
});

test('Given any decision, when the breakdown is summed, then it equals the total', () => {
  const decision = decide(state());
  const b = decision.breakdown;
  assert.ok(Math.abs(b.tokensSaved - b.summaryCost - b.lostValue + b.riskBenefit - b.fixedCost - b.total) < 1e-9);
});

test('Given a tool pair, when the engine chooses a cut, then the pair stays together', () => {
  const decision = decide(
    state({
      units: [
        unit({ id: 'call', type: 'tool', toolPairId: 'p', role: 'call' }),
        unit({ id: 'result', type: 'tool', toolPairId: 'p', role: 'result' }),
        unit({ id: 'tail', lastReferencedTurn: 19, tokens: 30_000 })
      ],
      contextTokens: 50_000
    })
  );
  assert.notEqual(decision.cutIndex, 1);
});

test('Given a candidate below the quality floor, when the engine searches, then it never selects it', () => {
  const decision = decide(
    state({ params: defaultParams({ qualityFloor: 1 }), contextTokens: 40_000 })
  );
  assert.equal(decision.action, 'keep');
});

test('Given a degraded checkpoint, when the engine searches, then it does not fold it', () => {
  const decision = decide(
    state({ checkpoint: { tokens: 40_000, generation: 3, fidelity: 0.2 } })
  );
  assert.equal(decision.diagnostics.includedCheckpoint, false);
});

test('Given the same text pair, when anchors are scored twice, then the score is identical', () => {
  const text = 'Fix packages/core/src/policy.ts where CONTEXT_WINDOW_EXCEEDED appears.';
  const anchors = extractAnchors(text);
  assert.equal(anchorRetentionScore(anchors, text), anchorRetentionScore(anchors, text));
});

test('Given the EOQ inputs, when the interval is computed, then it matches the closed form', () => {
  const input = { fixedCallCost: 20_000, inputPrice: 1, retentionRatio: 0.16, growthPerTurn: 1_000 };
  assert.ok(Math.abs(economicInterval(input) - Math.sqrt((2 * 20_000) / (1 * 0.16 * 1_000))) < 1e-9);
});
