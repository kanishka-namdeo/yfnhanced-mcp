import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { existsSync } from 'fs';
import { YahooFinanceClient } from '../../src/services/yahoo-finance';
import { RetryPolicy } from '../../src/middleware/retry';
import { CircuitBreaker } from '../../src/middleware/circuit-breaker';
import { classifyError } from '../../src/utils/error-classifier';
import { YahooFinanceError, YF_ERR_API_CHANGED, YF_ERR_DATA_INCOMPLETE } from '../../src/types/errors';

const SERVER_PATH = path.resolve(__dirname, '../../dist/index.js');

function makeClient(handlers: Partial<Record<'quote' | 'chart' | 'quoteSummary', (a: string, b?: unknown) => Promise<unknown>>>): YahooFinanceClient & Record<string, unknown> {  const client = new YahooFinanceClient({
    serverInfo: { name: 'chaos', version: '0', protocolVersion: '2024-11-05' },
    capabilities: { tools: {} },
    transport: 'stdio',
    rateLimit: { strategy: 'token-bucket', maxRequests: 500, windowMs: 60000, tokenRefillRate: 500, requestsPerMinute: 100000 },
    cache: { enabled: false, store: 'memory', ttl: 60000, maxEntries: 50 },
    retry: {
      enabled: true, maxRetries: 3, initialDelayMs: 1, maxDelayMs: 5,
      strategy: 'fixed', backoffMultiplier: 2, jitter: false,
      retryableStatusCodes: [429, 500], retryableErrorCodes: []
    },
    yahooFinance: { baseUrl: 'https://example.invalid', timeoutMs: 1000, maxConcurrentRequests: 5, requestQueueSize: 10, validateResponses: true, strictMode: false },
    circuitBreaker: { errorThresholdPercentage: 20, halfOpenMaxAttempts: 1, resetTimeoutMs: 60000, rollingCountTimeoutMs: 60000 }
  } as never) as YahooFinanceClient & Record<string, unknown>;

  const noop = async (): Promise<never> => { throw new Error('fake library method not installed'); };
  (client as Record<string, unknown>).yahooFinanceInstance = {
    quote: handlers.quote ?? noop,
    chart: handlers.chart ?? noop,
    quoteSummary: handlers.quoteSummary ?? noop
  };
  return client;
}

function thrownCode(fn: () => unknown): string | undefined {
  try {
    fn();
    return undefined;
  } catch (error) {
    return (error as YahooFinanceError).code;
  }
}

describe('API shape changes (in-process fault injection)', () => {
  describe('renamed and relocated fields are indistinguishable from missing ones', () => {
    test('there is no remapping layer: a renamed price arrives as a null critical field', async () => {
      const client = makeClient({
        quote: async () => ({ symbol: 'AAPL', marketPrice: 185.92, tradingVolume: 44981879 })
      });

      const quote = await client.getQuote('AAPL');
      const fields = ((quote.warnings ?? []) as Array<{ field: string }>).map(w => w.field);

      expect(quote.price.regularMarketPrice).toBeNull();
      expect(fields).toContain('price.regularMarketPrice');
      expect(fields).toContain('price.regularMarketVolume');
    });

    test('an unexpected envelope shape still returns, with an empty price object', async () => {
      const client = makeClient({ quote: async () => ({ data: { quotes: [{ price: 185.92 }] } }) });
      const quote = await client.getQuote('AAPL');

      expect(quote.price.symbol).toBe('');
      expect(quote.price.regularMarketPrice).toBeNull();
    });

    test('a nested relocation is not followed: extra depth reads as absence', async () => {
      const client = makeClient({
        quote: async () => ({ results: [{ marketData: { current: { regularMarketPrice: 185.92 } } }] })
      });
      const quote = await client.getQuote('AAPL');

      expect(quote.price.regularMarketPrice).toBeNull();
    });

    test('an empty result list is served as an empty quote rather than an error', async () => {
      const client = makeClient({ quote: async () => ({}) });
      const quote = await client.getQuote('AAPL');

      expect(quote.price).toBeDefined();
      expect(quote.meta.symbol).toBe('');
    });
  });

  describe('structure that cannot be read at all is API_CHANGED and is never retried', () => {
    test('non-object payloads throw YF_ERR_API_CHANGED on every validator', () => {
      const client = makeClient({});
      const payloads: unknown[] = [null, undefined, 'text', 42];

      for (const payload of payloads) {
        expect(thrownCode(() => client.validateQuote(payload))).toBe(YF_ERR_API_CHANGED);
        expect(thrownCode(() => client.validateHistorical(payload))).toBe(YF_ERR_API_CHANGED);
        expect(thrownCode(() => client.validateFinancials(payload))).toBe(YF_ERR_API_CHANGED);
        expect(thrownCode(() => client.validateNews(payload))).toBe(YF_ERR_API_CHANGED);
      }
    });

    test('the API-changed error exits the retry loop after one attempt', async () => {
      let attempts = 0;
      const delays: number[] = [];
      const policy = new RetryPolicy({
        enabled: true, maxRetries: 3, initialDelayMs: 10, maxDelayMs: 100,
        strategy: 'exponential', backoffMultiplier: 2, jitter: false,
        retryableStatusCodes: [500], retryableErrorCodes: []
      } as never, async (ms: number) => { delays.push(ms); });

      const result = await policy.execute(async () => {
        attempts++;
        throw new YahooFinanceError('quoteSummary modules renamed upstream', YF_ERR_API_CHANGED, null, false, false, {}, 'update extraction logic');
      }).then(() => 'resolved', (error: unknown) => error as YahooFinanceError);

      expect(attempts).toBe(1);
      expect(delays).toHaveLength(0);
      expect(result.code).toBe(YF_ERR_API_CHANGED);
      expect(result.isRetryable).toBe(false);
    });

    test('the classifier recognises only two phrases for an API change', () => {
      expect(classifyError(new Error('API changed without notice')).code).toBe(YF_ERR_API_CHANGED);
      expect(classifyError(new Error('Unexpected structure in quoteResponse')).code).toBe(YF_ERR_API_CHANGED);
      // Every other phrasing of the same failure falls through to UNKNOWN, which IS retryable,
      // so the retry layer burns its whole budget on a shape problem it cannot fix.
      expect(classifyError(new Error('quoteResponse.result is not iterable')).code).toBe('YF_ERR_UNKNOWN');
    });

    test('an API change still counts as a circuit breaker failure', async () => {
      const breaker = new CircuitBreaker({ errorThresholdPercentage: 2, halfOpenMaxAttempts: 1, resetTimeoutMs: 60000, rollingCountTimeoutMs: 60000 } as never);
      const apiChange = async (): Promise<never> => {
        throw new YahooFinanceError('structure changed', YF_ERR_API_CHANGED, null, false, false, {}, 'update logic');
      };

      await breaker.execute(apiChange).catch(() => undefined);
      expect(breaker.getState()).toBe('CLOSED');
      await breaker.execute(apiChange).catch(() => undefined);
      expect(breaker.getState()).toBe('OPEN');
    });
  });

  describe('historical detection path', () => {
    test('detectAPIChanges flags a payload with an anchor but no companion', () => {
      const client = makeClient({});

      expect(client.detectAPIChanges({ price: {} })).toBe(true);
      expect(client.detectAPIChanges({ price: {}, meta: {} })).toBe(false);
      expect(client.detectAPIChanges({ indicators: {}, meta: {}, timestamps: [] })).toBe(false);
      expect(client.detectAPIChanges({ indicators: {} })).toBe(true);
      expect(client.detectAPIChanges({ completely: 'new' })).toBe(true);
      expect(client.detectAPIChanges(null)).toBe(true);
    });

    test('a mapped chart result always carries both anchors, so the detector cannot fire on it', async () => {
      const client = makeClient({
        chart: async () => ({
          meta: { symbol: 'AAPL' },
          timestamp: [1703702400],
          indicators: { quote: [{ open: [1], high: [1], low: [1], close: [1], volume: [1] }] }
        })
      });

      const historical = await client.getHistoricalPrices('AAPL');
      expect(client.detectAPIChanges(historical)).toBe(false);
      expect(historical.timestamps).toEqual([1703702400]);
    });

    test('a chart result with no price series is reported as incomplete, not as an API change', async () => {
      const client = makeClient({ chart: async () => ({ meta: { symbol: 'AAPL' }, timestamp: [], indicators: {} }) });
      const error = await client.getHistoricalPrices('AAPL').then(() => null, (e: unknown) => e as YahooFinanceError);

      expect(error?.code).toBe(YF_ERR_DATA_INCOMPLETE);
    });

    test('handleAPIChange parks the payload under a key nothing ever reads back', () => {
      const client = makeClient({});
      const payload = { price: {} };

      expect(thrownCode(() => client.handleAPIChange('quote', payload))).toBe(YF_ERR_API_CHANGED);

      const archive = client.fallbackCache as unknown as Map<string, unknown>;
      expect(archive.size).toBe(1);
      const stored = [...archive.keys()][0];
      expect(stored).toMatch(/^api_change:quote:\d+$/);
      expect(archive.get(stored)).toEqual(payload);

      // `getFallbackData` only ever reads `fallback:<key>`, so the archived payload is
      // unreachable: the write buys nothing.
      expect(client.getFallbackData('quote')).toBeNull();
      expect(client.getFallbackData(stored)).toBeNull();

      archive.set('fallback:quote:AAPL', payload);
      expect(client.getFallbackData('quote:AAPL')).toEqual(payload);
    });
  });

  describe('quoteSummary module changes', () => {
    test('a financials response without any statement module is incomplete', async () => {
      const client = makeClient({ quoteSummary: async () => ({ price: { regularMarketPrice: 1 } }) });
      const error = await client.getFinancials('AAPL', 'income-statement')
        .then(() => null, (e: unknown) => e as YahooFinanceError);

      expect(error?.code).toBe(YF_ERR_DATA_INCOMPLETE);
    });

    test('a statement module that arrives with null rows still validates', async () => {
      const client = makeClient({
        quoteSummary: async () => ({ incomeStatementHistory: { incomeStatementHistory: [{}] } })
      });

      const statement = await client.getFinancials('AAPL', 'income-statement');
      expect(statement).toBeDefined();
    });
  });

  describe('spawned-server argument contract', () => {
    let serverProcess: ChildProcess | null = null;
    let stdoutBuffer = '';
    const pending = new Map<number, (response: Record<string, unknown>) => void>();

    function createMCPRequest(method: string, params: Record<string, unknown> = {}, id = 1): string {
      return JSON.stringify({ jsonrpc: '2.0', id, method, params });
    }

    function sendMCPRequest(request: string, timeoutMs = 10000): Promise<Record<string, unknown>> {
      const id = (JSON.parse(request) as { id: number }).id;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`Request ${String(id)} timed out after ${String(timeoutMs)} ms`));
        }, timeoutMs);
        pending.set(id, response => { clearTimeout(timer); resolve(response); });
        if (serverProcess?.stdin === null || serverProcess?.stdin === undefined) {
          clearTimeout(timer);
          reject(new Error('Server process not available'));
          return;
        }
        serverProcess.stdin.write(`${request}\n`);
      });
    }

    beforeAll(async () => {
      if (!existsSync(SERVER_PATH)) {
        throw new Error('Server build not found. Run "npm run build" first.');
      }
      serverProcess = spawn(process.execPath, [SERVER_PATH], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, NODE_ENV: 'test' }
      });
      serverProcess.stdout?.setEncoding('utf8');
      serverProcess.stdout?.on('data', (chunk: string) => {
        stdoutBuffer += chunk;
        let newline = stdoutBuffer.indexOf('\n');
        while (newline >= 0) {
          const line = stdoutBuffer.slice(0, newline).trim();
          stdoutBuffer = stdoutBuffer.slice(newline + 1);
          if (line !== '') {
            const response = JSON.parse(line) as Record<string, unknown>;
            const id = response.id as number | undefined;
            if (id !== undefined) {
              pending.get(id)?.(response);
              pending.delete(id);
            }
          }
          newline = stdoutBuffer.indexOf('\n');
        }
      });

      await sendMCPRequest(createMCPRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {}, resources: {}, prompts: {} },
        clientInfo: { name: 'chaos-api-changes', version: '1.0.0' }
      }, 0));
      serverProcess.stdin?.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
    });

    afterAll(async () => {
      if (serverProcess === null) return;
      const exited = new Promise<void>(resolve => { serverProcess?.once('exit', () => resolve()); });
      serverProcess.stdin?.end();
      serverProcess.kill('SIGTERM');
      const killTimer = setTimeout(() => { serverProcess?.kill('SIGKILL'); }, 3000);
      await exited;
      clearTimeout(killTimer);
      serverProcess = null;
    });

    test('malformed arguments come back as an isError envelope, never a transport failure', async () => {
      const cases: Array<{ name: string; arguments: Record<string, unknown>; expect: string }> = [
        { name: 'get_quote', arguments: { symbols: 'AAPL' }, expect: 'Symbols must be an array' },
        { name: 'get_quote', arguments: { symbols: ['bad symbol!'] }, expect: 'invalid characters' },
        { name: 'get_news', arguments: { symbol: 42 }, expect: 'expected string, received number' },
        { name: 'get_earnings', arguments: {}, expect: 'received undefined' }
      ];

      for (const [index, testCase] of cases.entries()) {
        const response = await sendMCPRequest(createMCPRequest('tools/call', {
          name: testCase.name,
          arguments: testCase.arguments
        }, index + 1));

        // A rejected argument is a tool result, not a JSON-RPC error: the envelope stays
        // `result` + `isError: true` so the transport keeps working.
        expect(response.error).toBeUndefined();
        const result = response.result as { isError: boolean; content: Array<{ text: string }> };
        expect(result.isError).toBe(true);
        expect(JSON.parse(result.content[0].text).error).toContain(testCase.expect);
      }
    });
  });
});
