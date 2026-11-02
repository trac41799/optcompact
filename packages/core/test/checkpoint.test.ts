import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decideCheckpoint, type CheckpointInput } from '../src/index.ts';

const base: CheckpointInput = {
  occupancy: 0.5,
  atBoundary: true,
  contextTokens: 100_000,
  windowTokens: 200_000,
  checkpointTokens: 1_500,
  tailTokens: 8_000
};

test('keeps below the occupancy threshold', () => {
  const decision = decideCheckpoint({ ...base, occupancy: 0.4 });
  assert.equal(decision.action, 'keep');
  assert.equal(decision.reason, 'below-threshold');
});

test('waits for a boundary when urgency is configured higher', () => {
  const decision = decideCheckpoint({ ...base, occupancy: 0.6, atBoundary: false, urgentOccupancy: 0.8 });
  assert.equal(decision.action, 'keep');
  assert.equal(decision.reason, 'no-boundary');
});

test('checkpoints mid-turn once the ceiling is crossed', () => {
  const decision = decideCheckpoint({ ...base, occupancy: 0.52, atBoundary: false });
  assert.equal(decision.action, 'checkpoint');
  assert.equal(decision.reason, 'urgency');
});

test('checkpoints at a boundary and reports an aggressive ratio', () => {
  const decision = decideCheckpoint(base);
  assert.equal(decision.action, 'checkpoint');
  assert.equal(decision.reason, 'boundary');
  assert.equal(decision.postTokens, 9_500);
  assert.ok(decision.ratio > 0.9);
  assert.ok(decision.targetOccupancy < 0.1);
});

test('ignores the boundary when occupancy is urgent', () => {
  const decision = decideCheckpoint({ ...base, occupancy: 0.8, atBoundary: false });
  assert.equal(decision.action, 'checkpoint');
  assert.equal(decision.reason, 'urgency');
});

test('forces a checkpoint at hard pressure', () => {
  const decision = decideCheckpoint({ ...base, occupancy: 0.95, atBoundary: false });
  assert.equal(decision.action, 'checkpoint');
  assert.equal(decision.reason, 'hard');
});

test('rejects invalid tokens', () => {
  assert.throws(() => decideCheckpoint({ ...base, windowTokens: 0 }), /windowTokens/);
  assert.throws(() => decideCheckpoint({ ...base, contextTokens: -1 }), /contextTokens/);
});
