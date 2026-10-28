import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  defaultParams,
  unitValue,
  type ContextUnit,
  type PolicyParams
} from '../src/index.ts';

const unit = (over: Partial<ContextUnit> = {}): ContextUnit => ({
  id: 'u1',
  type: 'file',
  tokens: 1_000,
  createdTurn: 1,
  lastReferencedTurn: 1,
  ...over
});

test('unit value decays by exp(-1/tau) per unreferenced turn', () => {
  const params: PolicyParams = defaultParams({ tau: 10 });
  const fresh = unitValue(unit({ lastReferencedTurn: 10 }), 10, params);
  const stale = unitValue(unit({ lastReferencedTurn: 9 }), 10, params);
  assert.ok(fresh > stale);
  assert.ok(Math.abs(stale / fresh - Math.exp(-1 / 10)) < 1e-12);
});

test('unit value is linear in token size', () => {
  const params = defaultParams({ tau: 10 });
  const small = unitValue(unit({ tokens: 500 }), 5, params);
  const large = unitValue(unit({ tokens: 1_500 }), 5, params);
  assert.ok(Math.abs(large / small - 3) < 1e-12);
});

test('goal units outrank chatter of equal size', () => {
  const params = defaultParams();
  const goal = unitValue(unit({ type: 'goal' }), 3, params);
  const chatter = unitValue(unit({ type: 'chatter' }), 3, params);
  assert.ok(goal > chatter * 10);
});

test('finite horizon replaces the infinite sum when beta equals one', () => {
  const params = defaultParams({ beta: 1, horizonTurns: 40, tau: 12 });
  const value = unitValue(unit({ lastReferencedTurn: 1 }), 1, params);
  const q = Math.exp(-1 / 12);
  const expectedQ = (q * (1 - q ** 40)) / (1 - q);
  const expected = 1.2 * 1_000 * 0.4 * expectedQ;
  assert.ok(Math.abs(value - expected) < 1e-9);
});
