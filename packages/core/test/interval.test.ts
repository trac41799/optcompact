import assert from 'node:assert/strict';
import { test } from 'node:test';
import { economicInterval } from '../src/index.ts';

const base = {
  fixedCallCost: 20_000,
  inputPrice: 1,
  retentionRatio: 0.16,
  growthPerTurn: 1_000
};

test('economic interval follows the EOQ form', () => {
  const expected = Math.sqrt((2 * base.fixedCallCost) / (base.inputPrice * base.retentionRatio * base.growthPerTurn));
  assert.ok(Math.abs(economicInterval(base) - expected) < 1e-9);
});

test('doubling the fixed call cost multiplies the interval by sqrt(2)', () => {
  const a = economicInterval(base);
  const b = economicInterval({ ...base, fixedCallCost: base.fixedCallCost * 2 });
  assert.ok(Math.abs(b / a - Math.SQRT2) < 1e-12);
});

test('rejects non-positive growth or retention', () => {
  assert.throws(() => economicInterval({ ...base, growthPerTurn: 0 }), /growthPerTurn/);
  assert.throws(() => economicInterval({ ...base, retentionRatio: 0 }), /retentionRatio/);
});
