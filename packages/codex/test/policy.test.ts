import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CodexPolicy, parseCompactHook } from '../src/index.ts';

const base = { threadId: 'thr_1', usage: { inputTokens: 10_000, outputTokens: 500 } };

test('keeps while the context is small', () => {
  const policy = new CodexPolicy({ windowTokens: 200_000 });
  const action = policy.observe(base);
  assert.equal(action, null);
});

test('requests a compaction when the model gain is positive', () => {
  const policy = new CodexPolicy({ windowTokens: 200_000 });
  let action = null;
  for (let i = 0; i < 14; i += 1) {
    action = policy.observe({ ...base, usage: { inputTokens: 12_000 * (i + 1), outputTokens: 500 } });
  }
  assert.ok(action);
  assert.equal(action?.method, 'thread/compact/start');
  assert.equal(action?.params.threadId, 'thr_1');
});

test('compaction resets the cooldown', () => {
  const policy = new CodexPolicy({ windowTokens: 200_000 });
  for (let i = 0; i < 14; i += 1) {
    policy.observe({ ...base, usage: { inputTokens: 12_000 * (i + 1), outputTokens: 500 } });
  }
  policy.noteCompaction('thr_1');
  const action = policy.observe({ ...base, usage: { inputTokens: 150_000, outputTokens: 500 } });
  assert.equal(action, null);
});

test('parses a PostCompact hook payload into an evidence record', () => {
  const record = parseCompactHook(
    JSON.stringify({
      hook_event_name: 'PostCompact',
      session_id: 's1',
      transcript_path: 'C:/tmp/t.jsonl',
      cwd: 'C:/repo',
      model: 'gpt-6.1-sol',
      trigger: 'auto',
      turn_id: 'turn-1'
    })
  );
  assert.equal(record.event, 'PostCompact');
  assert.equal(record.trigger, 'auto');
  assert.equal(record.sessionId, 's1');
  assert.ok(record.recordedAt);
});
