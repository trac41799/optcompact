/**
 * Minimal newline-delimited JSON-RPC client for `codex app-server`.
 *
 * Framing and method shapes verified against codex-cli 0.164.0 on 2026-10-29:
 * `initialize` and `thread/start` return results, and `thread/compact/start`
 * returns an empty result object.
 *
 * @module
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import readline from 'node:readline';

export interface JsonRpcError {
  code: number;
  message: string;
}

interface Pending {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

/** Correlate JSON-RPC requests over an injected line writer. */
export class JsonRpcClient {
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  private readonly notificationHandlers: Array<(method: string, params: unknown) => void> = [];

  private readonly write: (line: string) => void;

  constructor(write: (line: string) => void) {
    this.write = write;
  }

  /** Send one request and resolve with its result. */
  request<T = unknown>(method: string, params: unknown = {}): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
      this.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    });
  }

  /** Register a notification handler. */
  onNotification(handler: (method: string, params: unknown) => void): void {
    this.notificationHandlers.push(handler);
  }

  /** Consume one response or notification line. */
  handleLine(line: string): void {
    if (!line.trim()) return;
    let message: { id?: number; method?: string; params?: unknown; result?: unknown; error?: JsonRpcError };
    try {
      message = JSON.parse(line) as typeof message;
    } catch {
      return;
    }
    if (message.method) {
      for (const handler of this.notificationHandlers) handler(message.method, message.params);
      return;
    }
    if (typeof message.id !== 'number') return;
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);
    if (message.error) pending.reject(new Error(`${message.error.code}: ${message.error.message}`));
    else pending.resolve(message.result);
  }
}

/** A live connection to `codex app-server`. */
export class CodexAppServer {
  readonly client: JsonRpcClient;
  private readonly child: ChildProcessWithoutNullStreams;

  private constructor(client: JsonRpcClient, child: ChildProcessWithoutNullStreams) {
    this.client = client;
    this.child = child;
  }

  /** Spawn `codex app-server --listen stdio://` and complete the handshake. */
  static async connect(options: { command?: string; cwd?: string } = {}): Promise<CodexAppServer> {
    const child = spawn(options.command ?? 'codex', ['app-server', '--listen', 'stdio://'], {
      cwd: options.cwd,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    const client = new JsonRpcClient((line) => child.stdin.write(line));
    readline.createInterface({ input: child.stdout }).on('line', (line) => client.handleLine(line));
    const server = new CodexAppServer(client, child);
    await client.request('initialize', {
      clientInfo: { name: 'optcompact', version: '0.1.0' },
      capabilities: {}
    });
    return server;
  }

  /** Start a thread and return its id. */
  async startThread(cwd = process.cwd()): Promise<string> {
    const result = await this.client.request<{ thread?: { id?: string } }>('thread/start', { cwd });
    const id = result.thread?.id;
    if (!id) throw new Error('codex: thread/start returned no thread id');
    return id;
  }

  /** Force a compaction on one thread. */
  async compact(threadId: string): Promise<void> {
    await this.client.request('thread/compact/start', { threadId });
  }

  /** Terminate the server process. */
  close(): void {
    this.child.kill();
  }
}
