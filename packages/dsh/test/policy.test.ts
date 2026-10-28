import assert from 'node:assert/strict';
import { test } from 'node:test';
import { install, maybeCompact, type DshAgent, type DshContext } from '../src/index.ts';

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
