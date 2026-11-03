import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decideCheckpoint, selectOccupancy } from '../src/index.ts';

const base = {
  providerTokens: 52_000,
  surfaceTokens: 42_000,
  capacityTokens: 100_000,
  routeChanged: false
};

test('uses the provider sample when it belongs to the current route', () => {
  const sample = selectOccupancy(base);
  assert.equal(sample.usedTokens, 52_000);
  assert.equal(sample.source, 'provider');
});

test('falls back to the surface estimate when no provider sample exists', () => {
  const sample = selectOccupancy({ ...base, providerTokens: undefined });
  assert.equal(sample.usedTokens, 42_000);
  assert.equal(sample.source, 'surface');
});

test('ignores a provider sample taken on another route', () => {
  const sample = selectOccupancy({ ...base, routeChanged: true });
  assert.equal(sample.usedTokens, 42_000);
  assert.equal(sample.source, 'surface');
});

test('rejects a non-positive capacity', () => {
  assert.throws(() => selectOccupancy({ ...base, capacityTokens: 0 }), /capacityTokens/);
});

test('forces a hard checkpoint when the conservative estimate crosses the cap', () => {
  const decision = decideCheckpoint({
    occupancy: 0.55,
    safetyOccupancy: 0.95,
    atBoundary: false,
    contextTokens: 55_000,
    windowTokens: 100_000,
    checkpointTokens: 4_000,
    tailTokens: 1_000
  });
  assert.equal(decision.action, 'checkpoint');
  assert.equal(decision.reason, 'hard');
});
