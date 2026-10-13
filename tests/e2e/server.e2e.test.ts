import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { spawn } from 'child_process';
import path from 'path';
import { existsSync, readFileSync } from 'fs';

// `import.meta` is banned in every test file: the Jest transform forces
// `module: 'commonjs'` (jest.config.js:15) and TypeScript cannot downlevel it, so the
// suite fails to load. `__dirname` is provided by `@types/node` under that transform.
const SERVER_PATH = path.resolve(__dirname, '../../dist/index.js');
const PACKAGE_JSON_PATH = path.resolve(__dirname, '../../package.json');
const READY_MARKER = 'Yahoo Finance MCP Server started successfully';
const STARTUP_TIMEOUT_MS = 25000;
const REQUEST_TIMEOUT_MS = 20000;

const EXPECTED_TOOLS = [
  'get_quote',
  'get_quote_summary',
  'get_historical_prices',
  'get_historical_prices_multi',
  'get_earnings',
  'get_analysis',
  'get_major_holders',
  'get_news',
  'get_options',
  'get_balance_sheet',
  'get_income_statement',
  'get_cash_flow_statement',
  'get_summary_profile',
  'get_crypto_quote',
  'get_forex_quote',
  'get_trending_symbols',
  'screener'
];

const EXPECTED_PROMPTS = [
  'analyze_stock',
  'compare_stocks',
  'financial_health_check',
  'earnings_analysis',
  'market_overview',
  'portfolio_due_diligence'
];

const EXPECTED_RESOURCE_URIS = [
  'ticker://{symbol}/quote',
  'ticker://{symbol}/profile',
  'ticker://{symbol}/financials',
  'ticker://{symbol}/historical',
  'ticker://{symbol}/news',
  'ticker://{symbol}/analysis'
];

type WireMessage = Record<string, any>;
type ChildProcessHandle = ReturnType<typeof spawn>;

type Pending = {
  resolve: (message: WireMessage) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

/**
 * Every line the server writes to stdout must be exactly one JSON-RPC message.
 * All diagnostics belong on stderr (src/AGENTS.md: stdout is the MCP channel), so a
 * stray `console.log` shows up here as a framing violation instead of a corrupt wire.
 */
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

  describe(): string {
    const tail = this.stderrText.split('\n').slice(-12).join(' | ');
    return `stderr tail: ${tail.slice(-600)}`;
  }

  isRunning(): boolean {
    return this.exited === null;
  }

  write(message: WireMessage): void {
    const stdin = this.child.stdin;
    if (stdin === null || stdin.destroyed) {
      throw new Error('Server stdin is closed; cannot write ' + String(message.method));
    }
    stdin.write(`${JSON.stringify(message)}\n`);
  }

  /** Fire-and-forget JSON-RPC notification — by contract it gets no response. */
  notify(method: string, params: Record<string, unknown> = {}): void {
    this.write({ jsonrpc: '2.0', method, params });
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
      try {
        this.write({ jsonrpc: '2.0', id, method, params });
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  /** Wait for the startup log line, which is emitted only after `state = 'ready'`. */
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

  /**
   * Shutdown escalation: closing stdin lets the transport see EOF, SIGTERM then SIGKILL
   * cover the known defect that `shutdown()` never closes the transport, so a hung child
   * cannot survive into the next suite.
   */
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

function packageVersion(): string {
  return String((JSON.parse(readFileSync(PACKAGE_JSON_PATH, 'utf8')) as { version: string }).version);
}

const spawned: SpawnedServer[] = [];
let server: SpawnedServer;
let initializeResponse: WireMessage;

async function startSpawnedServer(): Promise<SpawnedServer> {
  const instance = new SpawnedServer();
  spawned.push(instance);
  await instance.waitForReady();
  return instance;
}

beforeAll(async () => {
  server = await startSpawnedServer();
  initializeResponse = await server.request('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: { tools: {}, resources: {}, prompts: {} },
    clientInfo: { name: 'e2e-client', version: '1.0.0' }
  });
  server.notify('notifications/initialized');
}, STARTUP_TIMEOUT_MS + REQUEST_TIMEOUT_MS);

afterAll(async () => {
  for (const instance of spawned) {
    await instance.stop();
  }
  spawned.length = 0;
});

describe('Server E2E — protocol contract (no market data required)', () => {
  test('answers initialize with a protocol version and the three capability sections', () => {
    expect(initializeResponse.jsonrpc).toBe('2.0');
    expect(typeof initializeResponse.id).toBe('number');
    expect(initializeResponse.error).toBeUndefined();

    const result = initializeResponse.result as Record<string, any>;
    expect(typeof result.protocolVersion).toBe('string');
    expect(result.protocolVersion.length).toBeGreaterThan(0);
    expect(result.capabilities).toEqual(expect.objectContaining({
      tools: expect.any(Object),
      resources: expect.any(Object),
      prompts: expect.any(Object)
    }));
  });

  test('reports serverInfo name and a version that matches package.json', () => {
    const serverInfo = (initializeResponse.result as Record<string, any>).serverInfo as Record<string, any>;

    expect(serverInfo.name).toBe('y-finance-mcp-server');
    expect(serverInfo.version).toBe(packageVersion());
  });

  test('lists exactly 17 tools, each with a dispatchable name and a valid object input schema', async () => {
    const response = await server.request('tools/list');
    const tools = (response.result as Record<string, any>).tools as Array<Record<string, any>>;

    expect(tools).toHaveLength(17);
    expect([...tools.map(tool => tool.name)].sort()).toEqual([...EXPECTED_TOOLS].sort());

    for (const tool of tools) {
      expect(tool.name).toMatch(/^[a-z0-9_]+$/);
      expect(typeof tool.description).toBe('string');
      expect((tool.description as string).length).toBeGreaterThan(0);

      const schema = tool.inputSchema as Record<string, any>;
      expect(schema).toBeDefined();
      expect(schema.type).toBe('object');
      expect(typeof schema.properties).toBe('object');
      if (schema.required !== undefined) {
        expect(Array.isArray(schema.required)).toBe(true);
        for (const required of schema.required as string[]) {
          expect(schema.properties[required]).toBeDefined();
        }
      }
    }
  });

  test('lists exactly 6 resources with JSON mime types', async () => {
    const response = await server.request('resources/list');
    const resources = (response.result as Record<string, any>).resources as Array<Record<string, any>>;

    expect(resources).toHaveLength(6);
    expect([...resources.map(r => r.uri)].sort()).toEqual([...EXPECTED_RESOURCE_URIS].sort());
    for (const resource of resources) {
      expect(typeof resource.name).toBe('string');
      expect(typeof resource.description).toBe('string');
      expect(resource.mimeType).toBe('application/json');
    }
  });

  test('lists exactly 6 resource templates instead of failing with Method not found', async () => {
    const response = await server.request('resources/templates/list');

    // Regression: this method was unhandled until 2026-10-13 and answered -32601.
    expect(response.error).toBeUndefined();

    const templates = (response.result as Record<string, any>).resourceTemplates as Array<Record<string, any>>;
    expect(templates).toHaveLength(6);
    expect([...templates.map(t => t.uriTemplate)].sort()).toEqual([...EXPECTED_RESOURCE_URIS].sort());
    for (const template of templates) {
      expect(template.uriTemplate).toMatch(/^ticker:\/\/\{symbol\}\/(quote|profile|financials|historical|news|analysis)$/);
      expect(typeof template.name).toBe('string');
      expect(template.mimeType).toBe('application/json');
    }
  });

  test('lists exactly 6 prompts with argument definitions', async () => {
    const response = await server.request('prompts/list');
    const prompts = (response.result as Record<string, any>).prompts as Array<Record<string, any>>;

    expect(prompts).toHaveLength(6);
    expect([...prompts.map(p => p.name)].sort()).toEqual([...EXPECTED_PROMPTS].sort());
    for (const prompt of prompts) {
      expect(typeof prompt.description).toBe('string');
      expect(Array.isArray(prompt.arguments)).toBe(true);
      for (const arg of prompt.arguments as Array<Record<string, any>>) {
        expect(typeof arg.name).toBe('string');
        expect(typeof arg.description).toBe('string');
        expect(typeof arg.required).toBe('boolean');
      }
    }
  });

  test('accepts notifications without responding and stays usable', async () => {
    const before = server.unsolicited.length;

    server.notify('notifications/initialized');
    server.notify('notifications/cancelled', { requestId: 999 });
    server.notify('notifications/message', { level: 'info', data: 'e2e ping' });
    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(server.unsolicited).toHaveLength(before);
    expect(server.isRunning()).toBe(true);

    const after = await server.request('tools/list');
    expect((after.result as Record<string, any>).tools).toHaveLength(17);
  });

  test('frames an unknown method as JSON-RPC -32601 without crashing', async () => {
    const response = await server.request('unknown/method');

    expect(response.result).toBeUndefined();
    expect(response.error).toEqual({ code: -32601, message: 'Method not found' });
    expect(server.isRunning()).toBe(true);
  });

  test('frames an unknown tool name as an isError envelope, not a protocol error or crash', async () => {
    const response = await server.request('tools/call', {
      name: 'tool_that_does_not_exist',
      arguments: {}
    });

    expect(response.error).toBeUndefined();
    const result = response.result as Record<string, any>;
    expect(result.isError).toBe(true);
    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toContain('Unknown tool: tool_that_does_not_exist');

    const stillAlive = await server.request('prompts/list');
    expect((stillAlive.result as Record<string, any>).prompts).toHaveLength(6);
  });

  test('rejects non-object tool arguments at the protocol layer', async () => {
    const response = await server.request('tools/call', {
      name: 'get_quote',
      arguments: 'not-an-object'
    });

    expect(response.result).toBeUndefined();
    expect(response.error.code).toBe(-32603);
    expect(typeof response.error.message).toBe('string');
  });

  test('omitting arguments entirely produces an isError envelope rather than a crash', async () => {
    // Tool failures return `isError: true` content (src/server.ts), they are not JSON-RPC
    // errors — the older version of this test asserted `.error` and could never pass.
    const response = await server.request('tools/call', { name: 'get_quote' });

    expect(response.error).toBeUndefined();
    const result = response.result as Record<string, any>;
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0].text as string)).toEqual(
      expect.objectContaining({ error: expect.any(String) })
    );
  });

  test('an empty symbols array is a tool-level error, not an unhandled throw', async () => {
    const response = await server.request('tools/call', {
      name: 'get_quote',
      arguments: { symbols: [] }
    });

    expect(response.error).toBeUndefined();
    const result = response.result as Record<string, any>;
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Symbols array cannot be empty');
  });

  test('a symbol that violates the input grammar is refused locally and framed as isError', async () => {
    // '_' is outside /^[A-Z0-9.\-\^]+$/, so this is rejected before any Yahoo call.
    const response = await server.request('tools/call', {
      name: 'get_quote',
      arguments: { symbols: ['INVALID_SYMBOL_THAT_DOES_NOT_EXIST_12345'] }
    });

    expect(response.error).toBeUndefined();
    expect((response.result as Record<string, any>).isError).toBe(true);
    expect(server.isRunning()).toBe(true);
  });

  test('ignores a malformed JSON line on stdin and keeps the wire parseable', async () => {
    const violationsBefore = server.framing.violations.length;

    server.child.stdin?.write('this is not json\n');
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(server.framing.violations).toHaveLength(violationsBefore);
    expect(server.isRunning()).toBe(true);

    const response = await server.request('resources/list');
    expect((response.result as Record<string, any>).resources).toHaveLength(6);
  });

  test('keeps static listings identical across repeated requests', async () => {
    const first = await server.request('tools/list');
    const second = await server.request('tools/list');

    expect(second.result).toEqual(first.result);
  });

  test('correlates concurrent requests by id', async () => {
    const methods = ['tools/list', 'resources/list', 'resources/templates/list', 'prompts/list'];
    const responses = await Promise.all(methods.map(method => server.request(method)));

    const ids = responses.map(response => response.id);
    expect(new Set(ids).size).toBe(methods.length);
    expect(server.isRunning()).toBe(true);
    for (const response of responses) {
      expect(response.error).toBeUndefined();
      expect(response.result).toBeDefined();
    }
  });

  test('writes only JSON-RPC frames to stdout for the whole session', () => {
    // Hard src/AGENTS.md contract: stdout is the protocol channel, diagnostics are stderr.
    expect(server.unsolicited).toEqual([]);
    server.framing.assertClean();
  });
});

describe('Server E2E — process lifecycle (no market data required)', () => {
  test('starts a fresh child, answers the handshake, and exits when stdin closes', async () => {
    const child = await startSpawnedServer();
    const response = await child.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'lifecycle-client', version: '1.0.0' }
    });

    expect(response.result).toBeDefined();
    expect(child.isRunning()).toBe(true);

    await child.stop();
    expect(child.isRunning()).toBe(false);
    child.framing.assertClean();
  });
});

describe('Server E2E — live market data (requires network access to Yahoo Finance)', () => {
  test('serves a real quote through tools/call', async () => {
    const response = await server.request('tools/call', {
      name: 'get_quote',
      arguments: { symbols: ['AAPL'] }
    }, 45000);

    const result = response.result as Record<string, any>;
    expect(result.isError).not.toBe(true);
    const payload = JSON.parse(result.content[0].text as string) as Record<string, any>;
    expect(payload.results.AAPL.data.regularMarketPrice).toBeGreaterThan(0);
  }, 60000);

  test('serves a real resource read through resources/read', async () => {
    const response = await server.request('resources/read', { uri: 'ticker://AAPL/quote' }, 45000);

    expect(response.error).toBeUndefined();
    const contents = (response.result as Record<string, any>).contents as Array<Record<string, any>>;
    expect(contents[0].mimeType).toBe('application/json');
    expect(JSON.parse(contents[0].text as string)).toBeDefined();
  }, 60000);
});
