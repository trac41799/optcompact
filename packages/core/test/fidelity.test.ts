import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  defaultParams,
  summaryFidelity,
  type PolicyParams
} from '../src/index.ts';

const params: PolicyParams = defaultParams();

test('full retention preserves all value', () => {
  assert.equal(summaryFidelity({ retentionRatio: 1, spanTokens: 80_000, type: 'tool', params }), 1);
});

test('fidelity falls as retention shrinks', () => {
  const high = summaryFidelity({ retentionRatio: 0.4, spanTokens: 50_000, type: 'file', params });
  const low = summaryFidelity({ retentionRatio: 0.1, spanTokens: 50_000, type: 'file', params });
  assert.ok(high > low);
});

test('fidelity falls as the shadowed span grows', () => {
  const small = summaryFidelity({ retentionRatio: 0.2, spanTokens: 5_000, type: 'file', params });
  const large = summaryFidelity({ retentionRatio: 0.2, spanTokens: 500_000, type: 'file', params });
  assert.ok(small > large);
});

test('generation penalty compounds once per compaction', () => {
  const base = summaryFidelity({ retentionRatio: 0.2, spanTokens: 50_000, type: 'file', params, generation: 1 });
  const second = summaryFidelity({ retentionRatio: 0.2, spanTokens: 50_000, type: 'file', params, generation: 2 });
  assert.ok(Math.abs(second - base ** 2) < 1e-12);
});

test('type ceilings order goal above tool output', () => {
  const goal = summaryFidelity({ retentionRatio: 0.2, spanTokens: 50_000, type: 'goal', params });
  const tool = summaryFidelity({ retentionRatio: 0.2, spanTokens: 50_000, type: 'tool', params });
  assert.ok(goal > tool);
});
