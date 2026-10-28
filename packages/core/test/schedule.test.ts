import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultParams, planSchedule, type ScheduleInput } from '../src/index.ts';

const base: ScheduleInput = {
  horizonTurns: 100,
  growthPerTurn: 6_000,
  windowTokens: 200_000,
  outputReserveTokens: 8_000,
  prices: { input: 1, output: 4, fixedCallCost: 20_000 },
  params: defaultParams(),
  qualityTarget: 0.9
};

test('plans an interval that meets the quality target', () => {
  const plan = planSchedule(base);
  assert.ok(plan.intervalTurns >= 1);
  assert.ok(plan.compactions >= 1);
  assert.ok(plan.expectedQuality + 1e-9 >= base.qualityTarget);
  assert.ok(plan.expectedTokens > 0);
});

test('a stricter quality target never shortens the interval', () => {
  const loose = planSchedule({ ...base, qualityTarget: 0.8 });
  const strict = planSchedule({ ...base, qualityTarget: 0.99 });
  assert.ok(strict.intervalTurns >= loose.intervalTurns);
});

test('a looser quality target never costs more tokens', () => {
  const loose = planSchedule({ ...base, qualityTarget: 0.8 });
  const strict = planSchedule({ ...base, qualityTarget: 0.95 });
  assert.ok(loose.expectedTokens <= strict.expectedTokens + 1e-6);
});

test('reports the cost split and it sums to the total', () => {
  const plan = planSchedule(base);
  const sum = plan.carryingTokens + plan.summaryTokens + plan.lossTokens;
  assert.ok(Math.abs(sum - plan.expectedTokens) < 1e-6);
});

test('optimizes the retention ratio when none is supplied', () => {
  const free = planSchedule(base);
  const fixed = planSchedule({ ...base, retentionRatio: 0.16 });
  assert.ok([0.08, 0.12, 0.16, 0.25, 0.35].includes(free.retentionRatio));
  assert.ok(free.expectedTokens <= fixed.expectedTokens + 1e-6);
});

test('handles a horizon shorter than one useful interval', () => {
  const plan = planSchedule({ ...base, horizonTurns: 5, qualityTarget: 0.5 });
  assert.ok(plan.intervalTurns >= 1 && plan.intervalTurns <= 5);
  assert.ok(Number.isFinite(plan.expectedTokens));
});

test('rejects a non-positive horizon', () => {
  assert.throws(() => planSchedule({ ...base, horizonTurns: 0 }), /horizonTurns/);
});

test('a longer horizon at the same quality target uses more compactions', () => {
  const short = planSchedule({ ...base, horizonTurns: 60 });
  const long = planSchedule({ ...base, horizonTurns: 240 });
  assert.ok(long.compactions > short.compactions);
});
