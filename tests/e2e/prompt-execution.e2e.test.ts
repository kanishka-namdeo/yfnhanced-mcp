import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { spawn } from 'child_process';
import path from 'path';
import { existsSync } from 'fs';

// `import.meta` cannot be downleveled by the CommonJS-forced Jest transform
// (jest.config.js:15); `__dirname` comes from `@types/node` under that transform.
const SERVER_PATH = path.resolve(__dirname, '../../dist/index.js');
const READY_MARKER = 'Yahoo Finance MCP Server started successfully';
const STARTUP_TIMEOUT_MS = 25000;
const REQUEST_TIMEOUT_MS = 20000;

const EXPECTED_PROMPTS = [
  'analyze_stock',
  'compare_stocks',
  'financial_health_check',
  'earnings_analysis',
  'market_overview',
  'portfolio_due_diligence'
];

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
    clientInfo: { name: 'e2e-prompt-client', version: '1.0.0' }
  });
  server.notify('notifications/initialized');
}, STARTUP_TIMEOUT_MS + REQUEST_TIMEOUT_MS);

afterAll(async () => {
  for (const instance of spawned) {
    await instance.stop();
  }
  spawned.length = 0;
});

/**
 * Prompt rendering is pure string templating in `src/server.ts` — it never calls Yahoo —
 * so this whole suite belongs in the default run and needs no network.
 */
async function promptText(name: string, args: Record<string, unknown>): Promise<string> {
  const response = await server.request('prompts/get', { name, arguments: args });

  if (response.error !== undefined) {
    throw new Error(`prompts/get ${name} failed: ${JSON.stringify(response.error).slice(0, 300)}`);
  }
  const messages = (response.result as Record<string, any>).messages as Array<Record<string, any>>;
  expect(Array.isArray(messages)).toBe(true);
  expect(messages[0].role).toBe('user');
  expect(messages[0].content.type).toBe('text');
  return String(messages[0].content.text);
}

describe('Prompt Execution E2E — listing (no market data required)', () => {
  test('lists exactly the 6 registered prompts', async () => {
    const response = await server.request('prompts/list');
    const prompts = (response.result as Record<string, any>).prompts as Array<Record<string, any>>;

    expect(prompts).toHaveLength(6);
    expect([...prompts.map(p => p.name)].sort()).toEqual([...EXPECTED_PROMPTS].sort());
  });

  test('gives every prompt a description and an argument list', async () => {
    const response = await server.request('prompts/list');
    const prompts = (response.result as Record<string, any>).prompts as Array<Record<string, any>>;

    for (const prompt of prompts) {
      expect(typeof prompt.description).toBe('string');
      expect(prompt.description.length).toBeGreaterThan(0);
      expect(Array.isArray(prompt.arguments)).toBe(true);
      for (const arg of prompt.arguments as Array<Record<string, any>>) {
        expect(typeof arg.name).toBe('string');
        expect(typeof arg.description).toBe('string');
        expect(typeof arg.required).toBe('boolean');
      }
    }
  });

  test('declares analyze_stock with a required symbol and an optional recommendations flag', async () => {
    const response = await server.request('prompts/list');
    const prompts = (response.result as Record<string, any>).prompts as Array<Record<string, any>>;
    const analyzeStock = prompts.find(prompt => prompt.name === 'analyze_stock') as Record<string, any>;

    expect(analyzeStock.arguments[0]).toEqual({
      name: 'symbol',
      description: 'Stock symbol to analyze',
      required: true
    });
    expect(analyzeStock.arguments[1].name).toBe('include_recommendations');
    expect(analyzeStock.arguments[1].required).toBe(false);
  });

  test('refuses an unknown prompt name as a protocol error', async () => {
    const response = await server.request('prompts/get', { name: 'unknown_prompt', arguments: {} });

    expect(response.result).toBeUndefined();
    expect(response.error.message).toContain('Unknown prompt: unknown_prompt');
    expect(server.isRunning()).toBe(true);
  });

  test('accepts notifications between prompt calls without responding to them', async () => {
    const before = server.unsolicited.length;

    server.notify('notifications/initialized');
    await promptText('analyze_stock', { symbol: 'AAPL' });
    server.notify('notifications/cancelled', { requestId: 1 });
    await promptText('market_overview', {});

    expect(server.unsolicited).toHaveLength(before);
  });
});

describe('Prompt Execution E2E — analyze_stock (no market data required)', () => {
  test('renders the analysis brief for the requested symbol', async () => {
    const text = await promptText('analyze_stock', { symbol: 'AAPL' });

    expect(text).toContain('Perform a comprehensive analysis of AAPL');
    expect(text).toContain('Financial statements overview');
    expect(text).toContain('Key financial ratios');
  });

  test('adds the analyst recommendations line only when asked', async () => {
    const withRecommendations = await promptText('analyze_stock', {
      symbol: 'AAPL',
      include_recommendations: 'true'
    });
    const withoutRecommendations = await promptText('analyze_stock', {
      symbol: 'AAPL',
      include_recommendations: 'false'
    });

    expect(withRecommendations).toContain('Analyst recommendations');
    expect(withoutRecommendations).not.toContain('Analyst recommendations');
  });
});

describe('Prompt Execution E2E — compare_stocks (no market data required)', () => {
  test('renders every comma-separated symbol', async () => {
    const text = await promptText('compare_stocks', { symbols: 'AAPL,MSFT,GOOGL' });

    expect(text).toContain('Compare the following stocks: AAPL,MSFT,GOOGL');
    expect(text).toContain('MSFT');
    expect(text).toContain('GOOGL');
  });

  test('interpolates custom metrics instead of the defaults', async () => {
    const custom = await promptText('compare_stocks', {
      symbols: 'AAPL,MSFT',
      metrics: 'P/E,market cap,revenue'
    });
    const defaulted = await promptText('compare_stocks', { symbols: 'AAPL,MSFT' });

    expect(custom).toContain('- P/E,market cap,revenue');
    expect(custom).not.toContain('Valuation metrics');
    expect(defaulted).toContain('Valuation metrics (P/E, P/B, P/S)');
  });
});

describe('Prompt Execution E2E — financial_health_check (no market data required)', () => {
  test('renders all four ratio families and a rating request', async () => {
    const text = await promptText('financial_health_check', { symbol: 'AAPL' });

    expect(text).toContain('financial health check for AAPL');
    expect(text).toContain('Liquidity ratios');
    expect(text).toContain('Solvency ratios');
    expect(text).toContain('Profitability ratios');
    expect(text).toContain('Efficiency ratios');
    expect(text).toContain('health rating (Excellent/Good/Fair/Poor)');
  });
});

describe('Prompt Execution E2E — earnings_analysis (no market data required)', () => {
  test('defaults to 8 quarters when none is supplied', async () => {
    const text = await promptText('earnings_analysis', { symbol: 'AAPL' });

    expect(text).toContain('over the last 8 quarters');
  });

  test('honours a custom quarter count', async () => {
    const text = await promptText('earnings_analysis', { symbol: 'AAPL', quarters: '12' });

    expect(text).toContain('over the last 12 quarters');
  });

  test('lists the earnings analysis components', async () => {
    const text = await promptText('earnings_analysis', { symbol: 'AAPL' });

    expect(text).toContain('Quarterly earnings trend');
    expect(text).toContain('Earnings surprise analysis (beats/misses)');
    expect(text).toContain('Revenue growth trends');
    expect(text).toContain('Forward earnings estimates');
  });
});

describe('Prompt Execution E2E — market_overview (no market data required)', () => {
  test('defaults to US markets', async () => {
    expect(await promptText('market_overview', {})).toContain('market overview for US markets');
  });

  test('honours a custom region', async () => {
    expect(await promptText('market_overview', { region: 'EU' })).toContain('market overview for EU markets');
  });

  test('lists the market overview components', async () => {
    const text = await promptText('market_overview', {});

    expect(text).toContain('Major index performance');
    expect(text).toContain('Trending stocks');
    expect(text).toContain('Sector performance');
    expect(text).toContain('Market sentiment indicators');
  });
});

describe('Prompt Execution E2E — portfolio_due_diligence (no market data required)', () => {
  test('renders every portfolio symbol', async () => {
    const text = await promptText('portfolio_due_diligence', { symbols: 'AAPL,MSFT,GOOGL' });

    expect(text).toContain('portfolio containing: AAPL,MSFT,GOOGL');
    expect(text).toContain('MSFT');
    expect(text).toContain('GOOGL');
  });

  test('defaults risk tolerance to moderate and honours an override', async () => {
    const defaulted = await promptText('portfolio_due_diligence', { symbols: 'AAPL,MSFT' });
    const aggressive = await promptText('portfolio_due_diligence', {
      symbols: 'AAPL,MSFT',
      risk_tolerance: 'high'
    });

    expect(defaulted).toContain('moderate risk tolerance');
    expect(aggressive).toContain('high risk tolerance');
  });

  test('lists the portfolio analysis components', async () => {
    const text = await promptText('portfolio_due_diligence', { symbols: 'AAPL,MSFT' });

    expect(text).toContain('Current financial health');
    expect(text).toContain('Valuation assessment');
    expect(text).toContain('Growth prospects');
    expect(text).toContain('Diversification assessment');
    expect(text).toContain('Concentration risks');
  });
});

describe('Prompt Execution E2E — argument handling (no market data required)', () => {
  test('Pinned defect: required arguments are not enforced and interpolate as undefined', async () => {
    // `prompts/list` declares `symbol` required, but the `prompts/get` handler
    // (src/server.ts) reads `args.symbol` without any check, so the missing value renders
    // literally into the message instead of producing an error.
    const text = await promptText('analyze_stock', {});

    expect(text).toContain('Perform a comprehensive analysis of undefined');
  });

  test('an empty symbols string is accepted and rendered empty', async () => {
    // Same boundary: `compare_stocks` with `symbols: ''` is not rejected, and there is no
    // symbol list in the brief. `symbols` is absent, not a list, so only the wrapper text
    // is asserted here.
    const text = await promptText('compare_stocks', { symbols: '' });

    expect(text).toContain('Compare the following stocks:');
    expect(text).not.toContain('AAPL');
  });

  test('non-string argument values reach the template unchanged', async () => {
    const quarters = await promptText('earnings_analysis', { symbol: 'AAPL', quarters: '4' });
    const recommendations = await promptText('analyze_stock', {
      symbol: 'AAPL',
      include_recommendations: 'true'
    });

    expect(quarters).toContain('over the last 4 quarters');
    expect(recommendations).toContain('Analyst recommendations');
  });
});

describe('Prompt Execution E2E — concurrency and framing (no market data required)', () => {
  test('handles multiple concurrent calls for the same prompt', async () => {
    const symbols = ['AAPL', 'MSFT', 'GOOGL'];
    const texts = await Promise.all(
      symbols.map(symbol => promptText('analyze_stock', { symbol }))
    );

    symbols.forEach((symbol, index) => {
      expect(texts[index]).toContain(`analysis of ${symbol}`);
    });
  });

  test('handles mixed prompt types concurrently', async () => {
    const texts = await Promise.all([
      promptText('analyze_stock', { symbol: 'AAPL' }),
      promptText('compare_stocks', { symbols: 'MSFT,GOOGL' }),
      promptText('financial_health_check', { symbol: 'AMZN' }),
      promptText('earnings_analysis', { symbol: 'TSLA' })
    ]);

    expect(texts).toHaveLength(4);
    expect(texts[1]).toContain('MSFT,GOOGL');
    expect(texts[2]).toContain('financial health check for AMZN');
    expect(texts[3]).toContain('earnings history for TSLA');
  });

  test('a protocol error for one prompt does not affect the others', async () => {
    const bad = await server.request('prompts/get', { name: 'nope', arguments: {} });
    const good = await promptText('market_overview', {});

    expect(bad.error).toBeDefined();
    expect(good).toContain('market overview for US markets');
  });

  test('stdout carried only JSON-RPC frames for the whole prompt session', () => {
    expect(server.unsolicited).toEqual([]);
    server.framing.assertClean();
  });
});
