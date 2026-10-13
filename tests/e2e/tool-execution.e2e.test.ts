import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { spawn } from 'child_process';
import path from 'path';
import { existsSync } from 'fs';
import {
  validSymbols,
  cryptoSymbols,
  forexPairs,
  quoteFields,
  optionExpirationDates,
  testPeriods,
  newsCounts,
  testLimits
} from '../fixtures/test-data.ts';

// `import.meta` cannot be downleveled by the CommonJS-forced Jest transform
// (jest.config.js:15), so this file uses `__dirname`, which `@types/node` provides there.
const SERVER_PATH = path.resolve(__dirname, '../../dist/index.js');
const READY_MARKER = 'Yahoo Finance MCP Server started successfully';
const STARTUP_TIMEOUT_MS = 25000;
const REQUEST_TIMEOUT_MS = 20000;
const LIVE_REQUEST_TIMEOUT_MS = 60000;

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

// Arguments that each handler must reject inside its own zod/validator boundary, before
// any Yahoo call. `get_quote_summary` is excluded because it validates nothing at all.
const LOCAL_REJECTION_PROBES: Record<string, Record<string, unknown>> = {
  get_quote: { symbols: ['BAD SYMBOL'] },
  get_historical_prices: { symbol: 'BAD SYMBOL' },
  get_historical_prices_multi: { symbols: ['BAD SYMBOL'] },
  get_earnings: { symbol: 'BAD SYMBOL' },
  get_analysis: { symbol: 'BAD SYMBOL' },
  get_major_holders: { symbol: 'BAD SYMBOL' },
  get_news: { symbol: 'BAD SYMBOL' },
  get_options: { symbol: 'BAD SYMBOL' },
  get_balance_sheet: { symbol: 'BAD SYMBOL' },
  get_income_statement: { symbol: 'BAD SYMBOL' },
  get_cash_flow_statement: { symbol: 'BAD SYMBOL' },
  get_summary_profile: { symbol: 'BAD SYMBOL' },
  get_crypto_quote: { symbols: ['BAD SYMBOL'] },
  get_forex_quote: { pairs: [] },
  get_trending_symbols: { region: 123 },
  screener: {}
};

const SYMBOL_TAKING_TOOLS = [
  'get_quote',
  'get_earnings',
  'get_analysis',
  'get_major_holders',
  'get_news',
  'get_options',
  'get_balance_sheet',
  'get_income_statement',
  'get_cash_flow_statement',
  'get_summary_profile',
  'get_crypto_quote'
];

type WireMessage = Record<string, any>;
type ChildProcessHandle = ReturnType<typeof spawn>;

type Pending = {
  resolve: (message: WireMessage) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

/** stdout is the protocol channel; every line must be exactly one JSON-RPC message. */
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
    clientInfo: { name: 'e2e-tool-client', version: '1.0.0' }
  });
  server.notify('notifications/initialized');
}, STARTUP_TIMEOUT_MS + REQUEST_TIMEOUT_MS);

afterAll(async () => {
  for (const instance of spawned) {
    await instance.stop();
  }
  spawned.length = 0;
});

/** A tool call the server accepted; returns the parsed payload the client would read. */
async function callTool(
  name: string,
  args: Record<string, unknown>,
  timeoutMs: number = LIVE_REQUEST_TIMEOUT_MS
): Promise<Record<string, any>> {
  const response = await server.request('tools/call', { name, arguments: args }, timeoutMs);

  expect(response.error).toBeUndefined();
  const result = response.result as Record<string, any>;
  if (result.isError === true) {
    throw new Error(`${name} returned an error envelope: ${String(result.content?.[0]?.text).slice(0, 300)}`);
  }
  return JSON.parse(result.content[0].text as string) as Record<string, any>;
}

/** The error text a tool call produced, for the deterministic rejection cases. */
async function callToolError(name: string, args: Record<string, unknown>): Promise<string> {
  const response = await server.request('tools/call', { name, arguments: args });
  expect(response.error).toBeUndefined();

  const result = response.result as Record<string, any>;
  expect(result.isError).toBe(true);
  return String(result.content[0].text);
}

describe('Tool Execution E2E — registry dispatch and rejection (no market data required)', () => {
  test('advertises exactly the 17 registered tools', async () => {
    const response = await server.request('tools/list');
    const tools = (response.result as Record<string, any>).tools as Array<Record<string, any>>;

    expect(tools).toHaveLength(17);
    expect([...tools.map(tool => tool.name)].sort()).toEqual([...EXPECTED_TOOLS].sort());
  });

  test.each(EXPECTED_TOOLS.filter(name => name !== 'get_quote_summary'))(
    '%s has a dispatch entry and rejects bad arguments inside its own validation layer',
    async (name) => {
      // A missing registry entry answers 'Unknown tool'; every other handler fails at its
      // zod/InputValidator boundary first, and none of these calls reaches the network.
      const text = await callToolError(name, LOCAL_REJECTION_PROBES[name]);

      expect(text).not.toContain('Unknown tool');
      expect(JSON.parse(text)).toEqual(expect.objectContaining({ error: expect.any(String) }));
    }
  );

  test('every symbol-taking tool refuses symbols outside the input grammar', async () => {
    for (const name of SYMBOL_TAKING_TOOLS) {
      const args = name === 'get_quote' || name === 'get_crypto_quote'
        ? { symbols: ['BAD_SYMBOL'] }
        : { symbol: 'BAD_SYMBOL' };
      const text = await callToolError(name, args);

      expect(text).toContain('Symbol contains invalid characters');
    }
  });

  test('a batch larger than the validator cap is refused even though the schema advertises 100', async () => {
    // Known deviation: `tools/list` advertises maxItems 100 for get_quote, while
    // InputValidator.MAX_SYMBOLS_PER_REQUEST is 50.
    const tooMany = Array.from({ length: 55 }, (_unused, index) => `ZZZ${index}`);
    const text = await callToolError('get_quote', { symbols: tooMany });

    expect(text).toContain('Maximum 50 symbols per request');
  });

  test('duplicate symbols in one batch are refused', async () => {
    const text = await callToolError('get_quote', { symbols: ['AAPL', 'AAPL'] });

    expect(text).toContain('Duplicate symbols are not allowed');
  });

  test('non-object arguments are refused by the protocol layer before dispatch', async () => {
    const response = await server.request('tools/call', {
      name: 'get_quote',
      arguments: ['AAPL']
    });

    expect(response.result).toBeUndefined();
    expect(response.error.code).toBe(-32603);
  });

  test('an unadvertised tool name is answered with an isError envelope', async () => {
    const response = await server.request('tools/call', {
      name: 'get_quotes',
      arguments: { symbols: ['AAPL'] }
    });

    const result = response.result as Record<string, any>;
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Unknown tool: get_quotes');
  });

  test('survives 20 rapid malformed calls and keeps answering', async () => {
    for (let index = 0; index < 10; index++) {
      await server.request('tools/call', { name: 'get_quote', arguments: { symbols: [] } });
      await server.request('tools/call', { name: 'get_earnings', arguments: { symbol: 7 } });
    }

    expect(server.isRunning()).toBe(true);
    const response = await server.request('tools/list');
    expect((response.result as Record<string, any>).tools).toHaveLength(17);
  });

  test('stdout stayed a clean JSON-RPC channel across the deterministic run', () => {
    expect(server.unsolicited).toEqual([]);
    server.framing.assertClean();
  });
});

describe('Tool Execution E2E — live market data (requires network access to Yahoo Finance)', () => {
  test('get_quote returns a priced quote for a single symbol', async () => {
    const payload = await callTool('get_quote', { symbols: [validSymbols[0]] });

    const quote = payload.results[validSymbols[0]];
    expect(quote).toBeDefined();
    expect(quote.data.regularMarketPrice).toBeGreaterThan(0);
    expect(quote.data.regularMarketVolume).toBeGreaterThanOrEqual(0);
    expect(quote.meta.completenessScore).toBeGreaterThan(0);
    expect(Array.isArray(quote.meta.warnings)).toBe(true);
    expect(payload.summary.totalRequested).toBe(1);
    expect(payload.summary.totalReturned).toBe(1);
  }, LIVE_REQUEST_TIMEOUT_MS + 10000);

  test('get_quote returns several symbols from one batch', async () => {
    const symbols = validSymbols.slice(0, 5);
    const payload = await callTool('get_quote', { symbols });

    expect(payload.summary.totalRequested).toBe(symbols.length);
    expect(payload.summary.totalReturned).toBeGreaterThan(0);
    for (const symbol of Object.keys(payload.results) as string[]) {
      expect(payload.results[symbol].data.regularMarketPrice).toBeGreaterThan(0);
    }
  }, LIVE_REQUEST_TIMEOUT_MS + 10000);

  test('get_quote keeps only the requested fields', async () => {
    const fields = quoteFields.slice(0, 2);
    const payload = await callTool('get_quote', { symbols: [validSymbols[0]], fields });

    const data = payload.results[validSymbols[0]].data as Record<string, unknown>;
    expect(data[fields[0]]).toBeDefined();
    expect(data.marketCap).toBeNull();
  }, LIVE_REQUEST_TIMEOUT_MS + 10000);

  test('get_quote honours an explicit timeout argument', async () => {
    const payload = await callTool('get_quote', { symbols: [validSymbols[0]], timeout: 10000 });

    expect(payload.results[validSymbols[0]].data.regularMarketPrice).toBeGreaterThan(0);
  }, LIVE_REQUEST_TIMEOUT_MS + 10000);

  test('get_quote force-refreshes instead of serving the cache', async () => {
    await callTool('get_quote', { symbols: [validSymbols[0]] });
    const payload = await callTool('get_quote', { symbols: [validSymbols[0]], forceRefresh: true });

    expect(payload.results[validSymbols[0]].meta.fromCache).toBe(false);
  }, LIVE_REQUEST_TIMEOUT_MS + 10000);

  test('get_quote_summary answers with the requested symbol and quality metadata', async () => {
    // Pinned src defect: this handler validates nothing — `{}` still performs a network
    // lookup instead of failing at its declared required `symbol` argument.
    const payload = await callTool('get_quote_summary', { symbol: validSymbols[0] });

    expect(payload.symbol).toBe(validSymbols[0]);
    expect(payload.data).toBeDefined();
    expect(typeof payload.completenessPercentage).toBe('number');
    expect(payload.metadata).toBeDefined();
  }, LIVE_REQUEST_TIMEOUT_MS + 10000);

  test('get_quote_summary honours an explicit module list', async () => {
    const requested = ['defaultKeyStatistics', 'summaryDetail'];
    const payload = await callTool('get_quote_summary', {
      symbol: validSymbols[0],
      modules: requested
    });

    expect(payload.symbol).toBe(validSymbols[0]);
    expect(payload.modules).toEqual(requested);
    expect(payload.metadata).toEqual(expect.objectContaining({
      lastSuccessfulUpdate: expect.anything(),
      sourceReliability: expect.any(String)
    }));
  }, LIVE_REQUEST_TIMEOUT_MS + 10000);

  test('get_quote_summary performs a lookup even when its required argument is absent', async () => {
    // Pinned src defect: `getQuoteSummary` (src/tools/quotes.ts) never parses or validates
    // its input, so `{}` is not refused locally the way every other handler refuses it.
    const response = await server.request(
      'tools/call',
      { name: 'get_quote_summary', arguments: {} },
      LIVE_REQUEST_TIMEOUT_MS
    );

    const text = String(((response.result as Record<string, any>).content[0] as Record<string, any>).text);
    expect(text).not.toContain('invalid_type');
    expect(text).not.toContain('Symbol contains invalid characters');
  }, LIVE_REQUEST_TIMEOUT_MS + 10000);

  test('get_quote_summary retries with alternative modules when asked', async () => {
    const payload = await callTool('get_quote_summary', {
      symbol: validSymbols[1],
      retryOnFailure: true
    });

    expect(payload.symbol).toBe(validSymbols[1]);
    expect(payload.data).toBeDefined();
  }, LIVE_REQUEST_TIMEOUT_MS + 10000);

  test('get_historical_prices returns dated bars', async () => {
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - 2);

    const payload = await callTool('get_historical_prices', {
      symbol: validSymbols[0],
      startDate: startDate.toISOString().split('T')[0],
      interval: '1d'
    });

    expect(payload.symbol).toBe(validSymbols[0]);
    expect(Array.isArray(payload.data)).toBe(true);
    expect(payload.data.length).toBeGreaterThan(0);
    expect(payload.data[0].close).toBeGreaterThan(0);
    expect(payload.meta.completenessScore).toBeGreaterThan(0);
  }, LIVE_REQUEST_TIMEOUT_MS + 10000);

  test('get_historical_prices_multi reports per-symbol status', async () => {
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - 2);

    const payload = await callTool('get_historical_prices_multi', {
      symbols: [validSymbols[0], validSymbols[1]],
      startDate: startDate.toISOString().split('T')[0]
    });

    expect(Object.keys(payload)).toHaveLength(2);
    const statuses = Object.values(payload).map((entry: any) => entry.status);
    expect(statuses).toContain('success');
  }, LIVE_REQUEST_TIMEOUT_MS + 10000);

  test('get_earnings returns quarterly rows with surprise analysis', async () => {
    const payload = await callTool('get_earnings', { symbol: validSymbols[0] });

    expect(payload.symbol).toBe(validSymbols[0]);
    expect(Array.isArray(payload.earnings.quarterly)).toBe(true);
    expect(payload.earnings.quarterly.length).toBeGreaterThan(0);
    expect(payload.earnings.quarterly[0]).toHaveProperty('surpriseDirection');
    expect(typeof payload.meta.completenessScore).toBe('number');
  }, LIVE_REQUEST_TIMEOUT_MS + 10000);

  test.each(testLimits.slice(0, 2))('get_earnings respects limit %i', async (limit) => {
    const payload = await callTool('get_earnings', { symbol: validSymbols[0], limit });

    expect(payload.earnings.quarterly.length).toBeLessThanOrEqual(limit);
  }, LIVE_REQUEST_TIMEOUT_MS + 10000);

  test('get_earnings can omit estimates', async () => {
    const payload = await callTool('get_earnings', {
      symbol: validSymbols[0],
      includeEstimates: false
    });

    for (const quarter of payload.earnings.quarterly as Array<Record<string, unknown>>) {
      expect(quarter.estimate).toBeNull();
    }
  }, LIVE_REQUEST_TIMEOUT_MS + 10000);

  test('get_analysis returns ratings and trends', async () => {
    const payload = await callTool('get_analysis', { symbol: validSymbols[0] });

    expect(payload.symbol).toBe(validSymbols[0]);
    expect(payload.analysis.currentRatings).toBeDefined();
    expect(payload.analysis.currentRatings.total).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(payload.analysis.recommendationTrend)).toBe(true);
  }, LIVE_REQUEST_TIMEOUT_MS + 10000);

  test('get_analysis includes expired recommendations on request', async () => {
    const payload = await callTool('get_analysis', {
      symbol: validSymbols[0],
      includeExpired: true
    });

    expect(payload.analysis.targetPrice).toBeDefined();
  }, LIVE_REQUEST_TIMEOUT_MS + 10000);

  test('get_major_holders returns a breakdown and holder lists', async () => {
    const payload = await callTool('get_major_holders', { symbol: validSymbols[0] });

    expect(payload.symbol).toBe(validSymbols[0]);
    expect(payload.majorHoldersBreakdown).toBeDefined();
    expect(Array.isArray(payload.institutionalHolders)).toBe(true);
    expect(Array.isArray(payload.fundHolders)).toBe(true);
    expect(payload.meta.dataSource).toBe('Yahoo Finance');
  }, LIVE_REQUEST_TIMEOUT_MS + 10000);

  test('get_major_holders adds change history on request', async () => {
    const payload = await callTool('get_major_holders', {
      symbol: validSymbols[0],
      includeChangeHistory: true
    });

    for (const holder of payload.institutionalHolders as Array<Record<string, unknown>>) {
      expect(holder).toHaveProperty('changeHistory');
    }
  }, LIVE_REQUEST_TIMEOUT_MS + 10000);

  test('get_news returns articles with publishers and links', async () => {
    const payload = await callTool('get_news', { symbol: validSymbols[0] });

    expect(payload.symbol).toBe(validSymbols[0]);
    expect(Array.isArray(payload.news)).toBe(true);
    expect(payload.count).toBeGreaterThan(0);
    expect(payload.news[0].title.length).toBeGreaterThan(0);
    expect(payload.meta.dataSource).toBe('Yahoo Finance');
  }, LIVE_REQUEST_TIMEOUT_MS + 10000);

  test.each(newsCounts.slice(0, 2))('get_news respects its limit argument (%i)', async (limit) => {
    const payload = await callTool('get_news', { symbol: validSymbols[0], limit });

    expect(payload.news.length).toBeLessThanOrEqual(limit);
  }, LIVE_REQUEST_TIMEOUT_MS + 10000);

  test('get_news ignores the count parameter the registry advertises', async () => {
    // Pinned registry/handler drift: `tools/list` advertises `count`, the handler parses
    // `limit` (src/schemas/news.ts:5), and zod strips the unknown key, so `count` is inert.
    const payload = await callTool('get_news', { symbol: validSymbols[2], count: 1 });

    expect(payload.news.length).toBeGreaterThan(1);
  }, LIVE_REQUEST_TIMEOUT_MS + 10000);

  test('get_news can require related tickers', async () => {
    const payload = await callTool('get_news', {
      symbol: validSymbols[0],
      requireRelated: true
    });

    for (const article of payload.news as Array<Record<string, any>>) {
      expect(article.relatedTickers.length).toBeGreaterThan(0);
    }
  }, LIVE_REQUEST_TIMEOUT_MS + 10000);

  test('get_options returns a chain with expirations', async () => {
    const payload = await callTool('get_options', { symbol: validSymbols[0] });

    expect(payload.symbol).toBe(validSymbols[0]);
    expect(payload.options).toBeDefined();
    expect(Array.isArray(payload.expirationDates)).toBe(true);
    expect(payload.expirationDates[0]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  }, LIVE_REQUEST_TIMEOUT_MS + 10000);

  test('get_options substitutes the nearest expiration for an unavailable date', async () => {
    // The fixture dates are in the past; `options.ts` falls back to the nearest expiry.
    const payload = await callTool('get_options', {
      symbol: validSymbols[0],
      expiration: optionExpirationDates[0]
    });

    expect(payload.meta.requestedExpiration).toBe(optionExpirationDates[0]);
    expect(payload.options).toBeDefined();
  }, LIVE_REQUEST_TIMEOUT_MS + 10000);

  test('get_options adds Greeks when asked', async () => {
    const payload = await callTool('get_options', {
      symbol: validSymbols[0],
      includeGreeks: true
    });

    const calls = payload.options.calls as Array<Record<string, unknown>>;
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0]).toHaveProperty('delta');
  }, LIVE_REQUEST_TIMEOUT_MS + 10000);

  test('get_options ignores the strikeFilter argument the registry advertises', async () => {
    // Pinned registry/handler drift: `OptionsInputSchema` (src/schemas/options.ts) has no
    // `strikeFilter` key, so the advertised object is stripped and never applied.
    const payload = await callTool('get_options', {
      symbol: validSymbols[0],
      strikeFilter: { minStrike: 900000, maxStrike: 900001 }
    });

    const strikes = (payload.options.calls as Array<Record<string, number>>).map(c => c.strike);
    expect(strikes.length).toBeGreaterThan(0);
    expect(Math.max(...strikes)).toBeLessThan(900000);
  }, LIVE_REQUEST_TIMEOUT_MS + 10000);

  test('the three statement tools answer annual rows with the advertised metrics', async () => {
    const symbol = validSymbols[0];
    const balanceSheet = await callTool('get_balance_sheet', { symbol, frequency: testPeriods[0] });
    const incomeStatement = await callTool('get_income_statement', { symbol, frequency: testPeriods[0] });
    const cashFlow = await callTool('get_cash_flow_statement', { symbol, frequency: testPeriods[0] });

    for (const payload of [balanceSheet, incomeStatement, cashFlow]) {
      expect(payload.symbol).toBe(symbol);
      expect(payload.statements.length).toBeGreaterThan(0);
      expect(payload.statements[0].endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    expect(balanceSheet.statements[0].balanceSheet.totalAssets).toBeGreaterThan(0);
    expect(incomeStatement.statements[0].incomeStatement.totalRevenue).toBeGreaterThan(0);
    expect(cashFlow.statements[0].cashFlowStatement).toBeDefined();
  }, LIVE_REQUEST_TIMEOUT_MS + 20000);

  test('the three statement tools answer for the quarterly frequency', async () => {
    const symbol = validSymbols[1];
    const payloads = await Promise.all([
      callTool('get_balance_sheet', { symbol, frequency: testPeriods[1] }),
      callTool('get_income_statement', { symbol, frequency: testPeriods[1] }),
      callTool('get_cash_flow_statement', { symbol, frequency: testPeriods[1] })
    ]);

    for (const payload of payloads) {
      expect(payload.symbol).toBe(symbol);
      expect(payload.statements.length).toBeGreaterThan(0);
      expect(payload.statements[0].endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(typeof payload.statements[0].period).toBe('string');
      expect(payload.meta.completenessScore).toBeGreaterThanOrEqual(0);
    }
  }, LIVE_REQUEST_TIMEOUT_MS + 20000);

  test('the statement tools respect limit on a symbol they have not cached', async () => {
    const payload = await callTool('get_balance_sheet', {
      symbol: validSymbols[6],
      frequency: 'annual',
      limit: 1
    });

    expect(payload.statements).toHaveLength(1);
  }, LIVE_REQUEST_TIMEOUT_MS + 10000);

  test('a cached statement response ignores a smaller limit requested later', async () => {
    // Pinned defect: `FinancialsToolCache.generateCacheKey` is keyed by
    // symbol/type/frequency only, so `limit` never enters the key and a warm hit serves
    // the previously cached page regardless of the new request.
    const symbol = validSymbols[7];
    await callTool('get_balance_sheet', { symbol, frequency: 'annual', limit: 4 });
    const cached = await callTool('get_balance_sheet', { symbol, frequency: 'annual', limit: 1 });

    expect(cached.statements.length).toBe(4);
  }, LIVE_REQUEST_TIMEOUT_MS + 10000);

  test('the statement tools ignore the period parameter the registry advertises', async () => {
    // Pinned registry/handler drift: `tools/list` advertises `period`, the handler parses
    // `frequency` (src/schemas/financials.ts:5), so `period` is stripped and never applied.
    const payload = await callTool('get_income_statement', {
      symbol: validSymbols[8],
      period: 'quarterly'
    });

    expect(payload.statements[0].period).toBe('annual');
  }, LIVE_REQUEST_TIMEOUT_MS + 10000);

  test('get_summary_profile returns an asset profile', async () => {
    const payload = await callTool('get_summary_profile', { symbol: validSymbols[0] });

    expect(payload.symbol).toBe(validSymbols[0]);
    expect(payload.profile).toBeDefined();
    expect(payload.meta).toBeDefined();
  }, LIVE_REQUEST_TIMEOUT_MS + 10000);

  test('get_crypto_quote returns a priced crypto pair', async () => {
    const payload = await callTool('get_crypto_quote', { symbols: [cryptoSymbols[0]] });

    expect(Object.keys(payload.results).length).toBeGreaterThan(0);
    expect(payload.summary.totalRequested).toBe(1);
  }, LIVE_REQUEST_TIMEOUT_MS + 10000);

  test('get_crypto_quote handles a batch', async () => {
    const symbols = cryptoSymbols.slice(0, 3);
    const payload = await callTool('get_crypto_quote', { symbols });

    expect(payload.summary.totalRequested).toBe(symbols.length);
  }, LIVE_REQUEST_TIMEOUT_MS + 10000);

  test('get_forex_quote returns a priced pair', async () => {
    const payload = await callTool('get_forex_quote', { pairs: [forexPairs[0]] });

    expect(payload.summary.totalRequested).toBe(1);
  }, LIVE_REQUEST_TIMEOUT_MS + 10000);

  test('get_forex_quote handles a batch', async () => {
    const pairs = forexPairs.slice(0, 3);
    const payload = await callTool('get_forex_quote', { pairs });

    expect(payload.summary.totalRequested).toBe(pairs.length);
  }, LIVE_REQUEST_TIMEOUT_MS + 10000);

  test('get_trending_symbols returns a trending list', async () => {
    const payload = await callTool('get_trending_symbols', {});

    expect(payload.trending).toBeDefined();
    expect(typeof payload.meta.completenessScore).toBe('number');
  }, LIVE_REQUEST_TIMEOUT_MS + 10000);

  test('screener returns a result envelope', async () => {
    const payload = await callTool('screener', { filters: {} });

    expect(payload.screened).toBeDefined();
    expect(payload.meta).toBeDefined();
  }, LIVE_REQUEST_TIMEOUT_MS + 10000);

  test('concurrent tool calls are answered independently', async () => {
    const symbols = [validSymbols[0], validSymbols[1], validSymbols[2]];
    const payloads = await Promise.all(
      symbols.map(symbol => callTool('get_quote', { symbols: [symbol] }))
    );

    symbols.forEach((symbol, index) => {
      expect(payloads[index].results[symbol].data.regularMarketPrice).toBeGreaterThan(0);
    });
  }, LIVE_REQUEST_TIMEOUT_MS + 20000);

  test('the live run never broke stdout framing', () => {
    expect(server.unsolicited).toEqual([]);
    server.framing.assertClean();
  });
});
