import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { spawn } from 'child_process';
import path from 'path';
import { existsSync } from 'fs';
import { validSymbols } from '../fixtures/test-data.ts';

// `import.meta` cannot be downleveled by the CommonJS-forced Jest transform
// (jest.config.js:15); `__dirname` comes from `@types/node` under that transform.
const SERVER_PATH = path.resolve(__dirname, '../../dist/index.js');
const READY_MARKER = 'Yahoo Finance MCP Server started successfully';
const STARTUP_TIMEOUT_MS = 25000;
const REQUEST_TIMEOUT_MS = 20000;
const LIVE_REQUEST_TIMEOUT_MS = 60000;

const EXPECTED_RESOURCE_URIS = [
  'ticker://{symbol}/quote',
  'ticker://{symbol}/profile',
  'ticker://{symbol}/financials',
  'ticker://{symbol}/historical',
  'ticker://{symbol}/news',
  'ticker://{symbol}/analysis'
];

// `historical` is deliberately absent: reading that template always fails with -32603
// (see the pinned-defect test below), so the readable set is asserted without it.
const READABLE_RESOURCE_TYPES = ['quote', 'profile', 'financials', 'news', 'analysis'];

type WireMessage = Record<string, any>;
type ChildProcessHandle = ReturnType<typeof spawn>;

type Pending = {
  resolve: (message: WireMessage) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

/** stdout is the MCP channel; every line must be exactly one JSON-RPC message. */
class StdoutFraming {
  readonly violations: string[] = [];
  private buffer = '';

  consume(chunk: string): WireMessage[] {
    this.buffer += chunk;
    const completed = this.buffer.split('\n');
    this.buffer = completed.pop() ?? '';

    const messages: WireMessage[] = [];
    for (const line of completed) {
      if (line.trim() === '') continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        this.violations.push(`stdout line is not JSON: ${line.slice(0, 200)}`);
        continue;
      }
      if (parsed === null || typeof parsed !== 'object') {
        this.violations.push(`stdout line is not a JSON-RPC object: ${line.slice(0, 200)}`);
        continue;
      }
      const message = parsed as WireMessage;
      if (message.jsonrpc !== '2.0' || (message.id === undefined && message.method === undefined)) {
        this.violations.push(`stdout line is not a JSON-RPC message: ${line.slice(0, 200)}`);
        continue;
      }
      messages.push(message);
    }
    return messages;
  }

  assertClean(): void {
    if (this.buffer !== '') {
      this.violations.push(`stdout ended with an unterminated frame: ${this.buffer.slice(0, 200)}`);
      this.buffer = '';
    }
    expect(this.violations).toEqual([]);
  }
}

class SpawnedServer {
  readonly child: ChildProcessHandle;
  readonly framing = new StdoutFraming();
  readonly unsolicited: WireMessage[] = [];
  private stderrText = '';
  private nextId = 0;
  private readonly pending = new Map<number, Pending>();
  private exited: { code: number | null; signal: string | null } | null = null;

  constructor() {
    if (!existsSync(SERVER_PATH)) {
      throw new Error('Server build not found. Run "npm run build" first.');
    }

    this.child = spawn(process.execPath, [SERVER_PATH], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, NODE_ENV: 'test' }
    });

    this.child.stdout?.on('data', (chunk: Buffer) => {
      for (const message of this.framing.consume(chunk.toString())) {
        this.route(message);
      }
    });

    this.child.stderr?.on('data', (chunk: Buffer) => {
      this.stderrText += chunk.toString();
    });

    this.child.on('exit', (code, signal) => {
      this.exited = { code, signal };
      for (const [id, entry] of this.pending) {
        clearTimeout(entry.timer);
        this.pending.delete(id);
        entry.reject(new Error(`Server exited (${code ?? signal}) before answering id ${id}`));
      }
    });
  }

  private route(message: WireMessage): void {
    if (typeof message.id === 'number' && this.pending.has(message.id)) {
      const entry = this.pending.get(message.id) as Pending;
      clearTimeout(entry.timer);
      this.pending.delete(message.id);
      entry.resolve(message);
      return;
    }
    this.unsolicited.push(message);
  }

  private describe(): string {
    return `stderr tail: ${this.stderrText.split('\n').slice(-12).join(' | ').slice(-600)}`;
  }

  isRunning(): boolean {
    return this.exited === null;
  }

  notify(method: string, params: Record<string, unknown> = {}): void {
    this.child.stdin?.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);
  }

  async request(
    method: string,
    params: Record<string, unknown> = {},
    timeoutMs: number = REQUEST_TIMEOUT_MS
  ): Promise<WireMessage> {
    this.nextId += 1;
    const id = this.nextId;

    return await new Promise<WireMessage>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Request '${method}' (id ${id}) timed out after ${timeoutMs} ms. ${this.describe()}`));
      }, timeoutMs);

      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin?.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    });
  }

  async waitForReady(timeoutMs: number = STARTUP_TIMEOUT_MS): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (this.exited !== null) {
        throw new Error(`Server exited during startup (${this.exited.code ?? this.exited.signal}). ${this.describe()}`);
      }
      if (this.stderrText.includes(READY_MARKER)) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Server did not report ready within ${timeoutMs} ms. ${this.describe()}`);
  }

  async stop(graceMs: number = 3000): Promise<void> {
    if (this.exited !== null) return;

    this.child.stdin?.end();
    await this.waitForExit(graceMs);
    if (this.exited !== null) return;

    this.child.kill('SIGTERM');
    await this.waitForExit(1500);
    if (this.exited !== null) return;

    this.child.kill('SIGKILL');
    await this.waitForExit(1500);
  }

  private async waitForExit(timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline && this.exited === null) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
}

const spawned: SpawnedServer[] = [];
let server: SpawnedServer;

beforeAll(async () => {
  server = new SpawnedServer();
  spawned.push(server);
  await server.waitForReady();
  await server.request('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: { tools: {}, resources: {}, prompts: {} },
    clientInfo: { name: 'e2e-resource-client', version: '1.0.0' }
  });
  server.notify('notifications/initialized');
}, STARTUP_TIMEOUT_MS + REQUEST_TIMEOUT_MS);

afterAll(async () => {
  for (const instance of spawned) {
    await instance.stop();
  }
  spawned.length = 0;
});

/** Reads a resource and returns the parsed `contents[0]`, failing on a protocol error. */
async function readResource(uri: string): Promise<Record<string, any>> {
  const response = await server.request('resources/read', { uri }, LIVE_REQUEST_TIMEOUT_MS);

  if (response.error !== undefined) {
    throw new Error(`resources/read ${uri} failed: ${JSON.stringify(response.error).slice(0, 300)}`);
  }
  const contents = (response.result as Record<string, any>).contents as Array<Record<string, any>>;
  expect(Array.isArray(contents)).toBe(true);

  return {
    uri: contents[0].uri,
    mimeType: contents[0].mimeType,
    payload: JSON.parse(contents[0].text as string) as Record<string, any>
  };
}

async function readResourceError(uri: string): Promise<string> {
  const response = await server.request('resources/read', { uri });

  expect(response.result).toBeUndefined();
  expect(response.error).toBeDefined();
  return String(response.error.message);
}

describe('Resource Access E2E — listing and error framing (no market data required)', () => {
  test('lists exactly the 6 advertised resources', async () => {
    const response = await server.request('resources/list');
    const resources = (response.result as Record<string, any>).resources as Array<Record<string, any>>;

    expect(resources).toHaveLength(6);
    expect([...resources.map(r => r.uri)].sort()).toEqual([...EXPECTED_RESOURCE_URIS].sort());
  });

  test('gives every advertised resource name, description and JSON mime type', async () => {
    const response = await server.request('resources/list');
    const resources = (response.result as Record<string, any>).resources as Array<Record<string, any>>;

    for (const resource of resources) {
      expect(typeof resource.name).toBe('string');
      expect(resource.name.length).toBeGreaterThan(0);
      expect(resource.description).toBe(`Resource for ${resource.uri}`);
      expect(resource.mimeType).toBe('application/json');
    }
  });

  test('lists exactly 6 resource templates that match the advertised resources', async () => {
    const response = await server.request('resources/templates/list');

    // Regression: before 2026-10-13 this request returned JSON-RPC -32601.
    expect(response.error).toBeUndefined();

    const templates = (response.result as Record<string, any>).resourceTemplates as Array<Record<string, any>>;
    expect(templates).toHaveLength(6);
    expect([...templates.map(t => t.uriTemplate)].sort()).toEqual([...EXPECTED_RESOURCE_URIS].sort());
    for (const template of templates) {
      expect(template.uriTemplate).toMatch(/^ticker:\/\/\{symbol\}\/(quote|profile|financials|historical|news|analysis)$/);
      expect(template.mimeType).toBe('application/json');
    }
  });

  test('refuses a URI that does not match the ticker scheme', async () => {
    expect(await readResourceError('invalid-uri-format')).toContain('Invalid resource URI: invalid-uri-format');
    expect(await readResourceError('')).toContain('Invalid resource URI');
    expect(server.isRunning()).toBe(true);
  });

  test('refuses a resource type that is not implemented', async () => {
    expect(await readResourceError('ticker://AAPL/unknown')).toContain('Unknown resource type: unknown');
  });

  test('refuses a symbol outside the input grammar before any network call', async () => {
    // '_' is not in /^[A-Z0-9.\-\^]+$/, so this fails at InputValidator (src/server.ts
    // read handler), never reaching Yahoo — the old version of this test expected `result`.
    expect(await readResourceError('ticker://INVALID_SYMBOL_12345/quote'))
      .toContain('Symbol contains invalid characters');
  });

  test('refuses a read request with no uri parameter', async () => {
    const response = await server.request('resources/read', {});

    expect(response.result).toBeUndefined();
    expect(response.error.code).toBe(-32603);
    expect(response.error.message).toContain('uri');
  });

  test('resource failures are protocol errors, unlike tool failures', async () => {
    // src/AGENTS.md: tool failures return `isError: true` content, resource failures rethrow.
    const badRead = await server.request('resources/read', { uri: 'ticker://AAPL/unknown' });
    const badTool = await server.request('tools/call', { name: 'no_such_tool', arguments: {} });

    expect(badRead.error).toBeDefined();
    expect(badRead.result).toBeUndefined();
    expect(badTool.error).toBeUndefined();
    expect((badTool.result as Record<string, any>).isError).toBe(true);
  });

  test('answers repeated and concurrent list requests identically', async () => {
    const responses = await Promise.all([
      server.request('resources/list', {}, REQUEST_TIMEOUT_MS),
      server.request('resources/list', {}, REQUEST_TIMEOUT_MS),
      server.request('resources/templates/list', {}, REQUEST_TIMEOUT_MS)
    ]);

    expect(responses[1].result).toEqual(responses[0].result);
    expect(new Set(responses.map(r => r.id)).size).toBe(3);
  });

  test('stdout stayed a clean JSON-RPC channel across the deterministic run', () => {
    expect(server.unsolicited).toEqual([]);
    server.framing.assertClean();
  });
});

describe('Resource Access E2E — live market data (requires network access to Yahoo Finance)', () => {
  test('the quote resource serves priced data nested under price/meta', async () => {
    const symbol = validSymbols[0];
    const { uri, mimeType, payload } = await readResource(`ticker://${symbol}/quote`);

    expect(uri).toBe(`ticker://${symbol}/quote`);
    expect(mimeType).toBe('application/json');
    // The read handler returns the client's QuoteResult, i.e. `{ price, meta }`; the older
    // version of this test expected flat `regularMarketPrice` keys that never exist here.
    expect(payload.price.regularMarketPrice).toBeGreaterThan(0);
    expect(payload.meta.symbol).toBe(symbol);
  }, LIVE_REQUEST_TIMEOUT_MS + 10000);

  test('the profile resource serves an asset profile', async () => {
    const { payload } = await readResource(`ticker://${validSymbols[0]}/profile`);

    expect(typeof payload.assetProfile).toBe('object');
    expect(Object.keys(payload.assetProfile as Record<string, unknown>).length).toBeGreaterThan(0);
  }, LIVE_REQUEST_TIMEOUT_MS + 10000);

  test('the financials resource serves statement history', async () => {
    const { payload } = await readResource(`ticker://${validSymbols[0]}/financials`);

    expect(payload).toHaveProperty('incomeStatementHistory');
  }, LIVE_REQUEST_TIMEOUT_MS + 10000);

  test('the news resource serves a count plus an article list', async () => {
    const { payload } = await readResource(`ticker://${validSymbols[0]}/news`);

    // The client returns `{ count, news }`; the older version of this test expected the
    // `itemsResult.items` shape of a different API generation.
    expect(Array.isArray(payload.news)).toBe(true);
    expect(payload.count).toBe(payload.news.length);
  }, LIVE_REQUEST_TIMEOUT_MS + 10000);

  test('the analysis resource serves ratings and trends', async () => {
    const { payload } = await readResource(`ticker://${validSymbols[0]}/analysis`);

    expect(payload).toHaveProperty('analystOpinion');
    expect(payload).toHaveProperty('recommendationTrend');
    expect(payload).toHaveProperty('earningsTrend');
  }, LIVE_REQUEST_TIMEOUT_MS + 10000);

  test('every readable resource type answers with parseable JSON and a JSON mime type', async () => {
    const symbol = validSymbols[1];

    for (const resourceType of READABLE_RESOURCE_TYPES) {
      const { mimeType, payload } = await readResource(`ticker://${symbol}/${resourceType}`);

      expect(mimeType).toBe('application/json');
      expect(typeof payload).toBe('object');
    }
  }, LIVE_REQUEST_TIMEOUT_MS + 30000);

  test('Pinned defect: the advertised historical template is not readable', async () => {
    // `ticker://{symbol}/historical` is advertised by both `resources/list` and
    // `resources/templates/list`, but the read handler calls
    // `getHistoricalPrices(symbol)` with no options, which requests a full-history daily
    // chart from 1970 and fails; `sanitizeError` then collapses the cause to
    // 'Unknown error'. Meanwhile `tools/call get_historical_prices` with a bounded
    // `startDate` succeeds, so the failure is in the resource path, not in Yahoo.
    const message = await readResourceError(`ticker://${validSymbols[2]}/historical`);

    expect(message).toBe('Unknown error');
  }, LIVE_REQUEST_TIMEOUT_MS + 10000);

  test('a repeated read stays on the same uri and serves from cache', async () => {
    const uri = `ticker://${validSymbols[0]}/quote`;
    const first = await readResource(uri);
    const second = await readResource(uri);

    expect(second.uri).toBe(first.uri);
    expect(second.payload.price.regularMarketPrice).toBe(first.payload.price.regularMarketPrice);
  }, LIVE_REQUEST_TIMEOUT_MS + 20000);

  test('concurrent reads across symbols are answered independently', async () => {
    const symbols = validSymbols.slice(0, 3);
    const results = await Promise.all(
      symbols.map(symbol => readResource(`ticker://${symbol}/quote`))
    );

    symbols.forEach((symbol, index) => {
      expect(results[index].uri).toBe(`ticker://${symbol}/quote`);
      expect(results[index].payload.meta.symbol).toBe(symbol);
    });
  }, LIVE_REQUEST_TIMEOUT_MS + 30000);

  test('mixed resource and tool requests are both answered', async () => {
    const responses = await Promise.all([
      server.request('resources/read', { uri: `ticker://${validSymbols[0]}/quote` }, LIVE_REQUEST_TIMEOUT_MS),
      server.request('tools/call', { name: 'get_quote', arguments: { symbols: [validSymbols[1]] } }, LIVE_REQUEST_TIMEOUT_MS)
    ]);

    for (const response of responses) {
      expect(response.error).toBeUndefined();
      expect(response.result).toBeDefined();
    }
  }, LIVE_REQUEST_TIMEOUT_MS + 30000);

  test('the live run never broke stdout framing', () => {
    expect(server.unsolicited).toEqual([]);
    server.framing.assertClean();
  });
});
