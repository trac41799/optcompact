import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  anchorRetentionScore,
  extractAnchors
} from '../src/index.ts';

const before = [
  'Fix the failing test in packages/core/src/policy.ts.',
  'The error is CONTEXT_WINDOW_EXCEEDED from the adapter.',
  'Keep defaultParams() stable and cap the window at 200000 tokens.'
].join('\n');

test('extracts paths, errors, symbols, and numbers with weights', () => {
  const anchors = extractAnchors(before);
  const texts = anchors.map((a) => a.text);
  assert.ok(texts.includes('packages/core/src/policy.ts'));
  assert.ok(texts.includes('CONTEXT_WINDOW_EXCEEDED'));
  assert.ok(texts.includes('defaultParams'));
  const path = anchors.find((a) => a.text === 'packages/core/src/policy.ts');
  const symbol = anchors.find((a) => a.text === 'defaultParams');
  assert.ok(path && symbol && path.weight > symbol.weight);
});

test('deduplicates repeated anchors and keeps the strongest weight', () => {
  const anchors = extractAnchors('policy.ts is bad. policy.ts is still bad.');
  const hits = anchors.filter((a) => a.text === 'policy.ts');
  assert.equal(hits.length, 1);
});

test('anchor retention is one when every anchor survives', () => {
  const anchors = extractAnchors(before);
  const after = before;
  assert.equal(anchorRetentionScore(anchors, after), 1);
});

test('anchor retention is zero when no anchor survives', () => {
  const anchors = extractAnchors(before);
  assert.equal(anchorRetentionScore(anchors, 'nothing useful remains here'), 0);
});

test('anchor retention is weighted by anchor importance', () => {
  const anchors = extractAnchors('packages/core/src/policy.ts and defaultParams');
  const score = anchorRetentionScore(anchors, 'packages/core/src/policy.ts only');
  assert.ok(score > 0 && score < 1);
});
