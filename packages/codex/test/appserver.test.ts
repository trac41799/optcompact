import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JsonRpcClient } from '../src/index.ts';

function makeClient() {
  const lines: string[] = [];
  const client = new JsonRpcClient((line) => lines.push(line));
  return { client, lines };
}

test('correlates a response with its request id', async () => {
  const { client, lines } = makeClient();
  const pending = client.request('initialize', { clientInfo: { name: 'test' } });
  const sent = JSON.parse(lines[0]!) as { id: number; method: string };
  assert.equal(sent.method, 'initialize');
  client.handleLine(JSON.stringify({ jsonrpc: '2.0', id: sent.id, result: { ok: true } }));
  assert.deepEqual(await pending, { ok: true });
});

test('rejects a request that returns an error', async () => {
  const { client, lines } = makeClient();
  const pending = client.request('thread/start');
  const sent = JSON.parse(lines[0]!) as { id: number };
  client.handleLine(JSON.stringify({ jsonrpc: '2.0', id: sent.id, error: { code: -32601, message: 'nope' } }));
  await assert.rejects(() => pending, /-32601: nope/);
});

test('forwards notifications without resolving requests', () => {
  const { client } = makeClient();
  const seen: string[] = [];
  client.onNotification((method) => seen.push(method));
  client.handleLine(JSON.stringify({ jsonrpc: '2.0', method: 'thread/tokenUsage/updated', params: {} }));
  assert.deepEqual(seen, ['thread/tokenUsage/updated']);
});

test('ignores malformed lines', () => {
  const { client } = makeClient();
  assert.doesNotThrow(() => client.handleLine('not json'));
  assert.doesNotThrow(() => client.handleLine(''));
});
