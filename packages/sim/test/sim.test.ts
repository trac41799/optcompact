import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateSession, runComparison, simulatePolicy, type SimConfig } from '../src/index.ts';

const config: SimConfig = {
  seed: 7,
  turns: 80,
  windowTokens: 200_000,
  startTokens: 4_000,
  outputTokensPerTurn: 250
};

test('session generation is deterministic for a seed', () => {
  const a = generateSession(config);
  const b = generateSession(config);
  const c = generateSession({ ...config, seed: 8 });
  assert.equal(JSON.stringify(a.units), JSON.stringify(b.units));
  assert.notEqual(JSON.stringify(a.units), JSON.stringify(c.units));
});

test('an emergency-only policy overflows the window', () => {
  const session = generateSession(config);
  const result = simulatePolicy(session, 'never');
  assert.ok(result.maxContextTokens > session.windowTokens * 0.9);
  assert.ok(result.overflowTurns > 0);
});

test('the hazard policy compacts and stays inside the window', () => {
  const session = generateSession(config);
  const result = simulatePolicy(session, 'hazard');
  assert.ok(result.compactions > 0);
  assert.equal(result.overflowTurns, 0);
  assert.ok(result.maxContextTokens <= session.windowTokens);
});

test('comparison returns one result per policy', () => {
  const session = generateSession(config);
  const results = runComparison(session);
  assert.deepEqual(
    results.map((r) => r.policy),
    ['never', 'fixed', 'periodic', 'hazard', 'planned']
  );
  for (const result of results) {
    assert.ok(result.tokensSpent > 0);
    assert.ok(result.needs > 0);
  }
});
