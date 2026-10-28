import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { install, maybeCompact, snapCutToStep, type DshAgent, type DshContext } from '../src/index.ts';

function makeContext(overrides: Record<string, unknown> = {}) {
  const calls: Array<{ start: number; end: number }> = [];
  const ctx = {
    on: () => {},
    logger: { warn: () => {} },
    tokenMeter: {
      measure: () => ({
        totalTokens: 55_000,
        surfaceTokens: 55_000,
        nodes: [
          { seq: 0, tokens: 5_000, heuristicTokens: 5_000 },
          { seq: 10, tokens: 12_000, heuristicTokens: 12_000 },
          { seq: 20, tokens: 12_000, heuristicTokens: 12_000 },
          { seq: 30, tokens: 12_000, heuristicTokens: 12_000 },
          { seq: 40, tokens: 14_000, heuristicTokens: 14_000 }
        ]
      })
    },
    llm: {
      resolveModelInfo: async () => ({ context: { contextWindow: 100_000 }, defaultMaxTokens: 8_000 })
    },
    compaction: {
      compactRegion: async (start: number, end: number) => {
        calls.push({ start, end });
      },
      compactIfNeeded: async () => null
    },
    ...overrides
  };
  return { ctx: ctx as unknown as DshContext, calls };
}

function makeAgent(replaceGeneration = 0): DshAgent {
  return {
    session: {
      surface: { nodes: [0, 10, 20, 30, 40], replaceGeneration },
      requestHeader: () => ({ config: { provider: 'deepseek', model: 'deepseek-chat' } })
    }
  };
}

test('compacts through the stock backend when the model gains', async () => {
  const { ctx, calls } = makeContext();
  const decision = await maybeCompact(ctx, {}, makeAgent(), 30, new AbortController().signal);
  assert.equal(decision?.action, 'compact');
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.start, 10);
  assert.ok((calls[0]?.end ?? 0) >= 20);
});

test('keeps when the signal is already aborted', async () => {
  const { ctx, calls } = makeContext();
  const controller = new AbortController();
  controller.abort();
  const decision = await maybeCompact(ctx, {}, makeAgent(), 30, controller.signal);
  assert.equal(decision, null);
  assert.equal(calls.length, 0);
});

test('keeps when the route has no declared context window', async () => {
  const { ctx, calls } = makeContext({
    llm: { resolveModelInfo: async () => ({}) }
  });
  const decision = await maybeCompact(ctx, {}, makeAgent(), 30, new AbortController().signal);
  assert.equal(decision, null);
  assert.equal(calls.length, 0);
});

test('keeps when the session has no routed target', async () => {
  const { ctx, calls } = makeContext();
  const agent: DshAgent = {
    session: {
      surface: { nodes: [], replaceGeneration: 0 },
      requestHeader: () => undefined
    }
  };
  const decision = await maybeCompact(ctx, {}, agent, 1, new AbortController().signal);
  assert.equal(decision, null);
  assert.equal(calls.length, 0);
});

test('never lets a decision error escape', async () => {
  const { ctx } = makeContext({
    tokenMeter: {
      measure: () => {
        throw new Error('meter failed');
      }
    }
  });
  await assert.rejects(() => maybeCompact(ctx, {}, makeAgent(), 3, new AbortController().signal));
});

test('prunes tool results before deciding when load is high', async () => {
  let pruneCalls = 0;
  let measureCalls = 0;
  const { ctx } = makeContext();
  const pruner = { pruneSession: () => { pruneCalls += 1; } };
  const original = ctx.tokenMeter.measure;
  ctx.tokenMeter.measure = () => {
    measureCalls += 1;
    if (measureCalls === 1) {
      return { totalTokens: 95_000, surfaceTokens: 95_000, nodes: [{ seq: 1, tokens: 95_000, heuristicTokens: 95_000 }] };
    }
    return original(ctx as never);
  };
  (ctx as unknown as { get: (name: string) => unknown }).get = (name) => (name === 'toolResultPruner' ? pruner : undefined);
  await maybeCompact(ctx, { pruneAt: 0.4 }, makeAgent(), 30, new AbortController().signal);
  assert.equal(pruneCalls, 1);
  assert.equal(measureCalls, 2);
});

test('does not prune below the prune threshold', async () => {
  let pruneCalls = 0;
  const { ctx } = makeContext();
  const pruner = { pruneSession: () => { pruneCalls += 1; } };
  (ctx as unknown as { get: (name: string) => unknown }).get = (name) => (name === 'toolResultPruner' ? pruner : undefined);
  await maybeCompact(ctx, { pruneAt: 0.9 }, makeAgent(), 30, new AbortController().signal);
  assert.equal(pruneCalls, 0);
});

test('works when no pruner service is mounted', async () => {
  const { ctx } = makeContext();
  (ctx as unknown as { get: (name: string) => unknown }).get = () => undefined;
  const decision = await maybeCompact(ctx, { pruneAt: 0.4 }, makeAgent(), 30, new AbortController().signal);
  assert.ok(decision === null || typeof decision.action === 'string');
});

test('snaps a cut to a step boundary marked by a user message', () => {
  const seqs = [10, 20, 30, 40, 50];
  const types: Record<number, string> = {
    10: 'user/message',
    20: 'assistant/message',
    30: 'tool/result',
    40: 'user/message',
    50: 'assistant/message'
  };
  const typeOf = (seq: number): string | undefined => types[seq];
  assert.equal(snapCutToStep(seqs, 4, typeOf), 3);
  assert.equal(snapCutToStep(seqs, 3, typeOf), 3);
  assert.equal(snapCutToStep(seqs, 2, typeOf), 0);
});

test('writes one JSONL evidence record per decision', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'optcompact-'));
  const path = join(dir, 'events.jsonl');
  const { ctx } = makeContext();
  await maybeCompact(ctx, { evidencePath: path }, makeAgent(), 30, new AbortController().signal);
  const lines = readFileSync(path, 'utf8').trim().split('\n');
  assert.equal(lines.length, 2);
  const decision = JSON.parse(lines[0]!) as { turn: number; action: string };
  const committed = JSON.parse(lines[1]!) as { turn: number; action: string };
  assert.equal(decision.turn, 30);
  assert.equal(decision.action, 'compact');
  assert.equal(committed.action, 'compacted');
});

test('install registers pre-step and overflow handlers', () => {
  const registered: string[] = [];
  const ctx = {
    on: (event: string) => registered.push(event),
    logger: { warn: () => {} },
    tokenMeter: { measure: () => ({ totalTokens: 0, surfaceTokens: 0, nodes: [] }) },
    llm: { resolveModelInfo: async () => ({}) },
    compaction: { compactRegion: async () => undefined, compactIfNeeded: async () => null }
  } as unknown as DshContext;
  const dispose = install(ctx, {});
  assert.deepEqual(registered, ['agent/pre-step', 'agent/request-error']);
  assert.equal(typeof dispose, 'function');
});
