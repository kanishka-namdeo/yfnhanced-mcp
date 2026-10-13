import { describe, test, expect, beforeAll, afterAll, afterEach, jest } from '@jest/globals';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { existsSync } from 'fs';
import { RetryPolicy, createRetryPolicy, retry, MaxRetriesExceededError } from '../../src/middleware/retry';
import { classifyError } from '../../src/utils/error-classifier';
import { YahooFinanceClient } from '../../src/services/yahoo-finance';
import { YahooFinanceError, YF_ERR_TIMEOUT, YF_ERR_NETWORK, YF_ERR_UNKNOWN, YF_ERR_COOKIE_ERROR } from '../../src/types/errors';
import { timeoutValues, retryConfigs } from '../fixtures/test-data.ts';

const SERVER_PATH = path.resolve(__dirname, '../../dist/index.js');

type Strategy = 'exponential' | 'linear' | 'fixed';

function configFor(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    enabled: true,
    // `retryConfigs` names `baseDelay`/`maxDelay`; `RetryConfig` reads `initialDelayMs`/
    // `maxDelayMs`, so the values are mapped rather than passed through.
    maxRetries: retryConfigs.maxRetries,
    initialDelayMs: retryConfigs.baseDelay,
    maxDelayMs: retryConfigs.maxDelay,
    strategy: 'exponential' as Strategy,
    backoffMultiplier: 2,
    jitter: false,
    retryableStatusCodes: [429, 500, 502, 503, 504],
    retryableErrorCodes: [],
    ...overrides
  };
}

function policyWith(overrides: Record<string, unknown> = {}, onDelay?: (ms: number) => Promise<void>): RetryPolicy {
  return new RetryPolicy(configFor(overrides) as never, onDelay);
}

async function outcome(policy: RetryPolicy, fn: () => Promise<unknown>): Promise<{ error: unknown; resolved: boolean }> {
  return policy.execute(fn).then(
    () => ({ resolved: true, error: null }),
    error => ({ resolved: false, error })
  );
}

describe('Timeout chaos (in-process fault injection)', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('timeout classification decides whether the retry layer acts at all', () => {
    test('a timeout-shaped error is classified as YF_ERR_TIMEOUT and is retryable', () => {
      const classified = classifyError(new Error('network timeout occurred'));
      expect(classified.code).toBe(YF_ERR_TIMEOUT);
      expect(classified.isRetryable).toBe(true);
      expect(classified.statusCode).toBeNull();
    });

    test('a real ETIMEDOUT error is NOT classified as a timeout: the matcher looks for etimeout', () => {
      // `isTimeoutError` matches 'timeout' and 'etimeout'; the Node code string is
      // 'ETIMEDOUT', which lowercases to 'etimedout' and contains neither. So a genuine
      // socket timeout lands in the UNKNOWN bucket (retryable, but with the wrong code).
      const fromCode = classifyError(Object.assign(new Error('upstream stalled'), { code: 'ETIMEDOUT' }));
      expect(fromCode.code).toBe(YF_ERR_UNKNOWN);
      expect(fromCode.isRetryable).toBe(true);

      const fromCodeString = classifyError(new Error('ETIMEDOUT while reading chart'));
      expect(fromCodeString.code).toBe(YF_ERR_UNKNOWN);

      const fromMessage = classifyError(new Error('timeout of 1000ms exceeded'));
      expect(fromMessage.code).toBe(YF_ERR_TIMEOUT);
    });

    test('a slow-upstream failure burns exactly maxRetries + 1 attempts and rethrows the classified error', async () => {
      const delays: number[] = [];
      const policy = policyWith({ maxRetries: 3, initialDelayMs: 100 }, async (ms: number) => { delays.push(ms); });
      let attempts = 0;

      const result = await outcome(policy, async () => {
        attempts++;
        throw new Error('timeout of 1000ms exceeded');
      });

      expect(attempts).toBe(4);
      expect(delays).toEqual([100, 200, 400]);
      expect(result.resolved).toBe(false);
      expect((result.error as YahooFinanceError).code).toBe(YF_ERR_TIMEOUT);
      expect(result.error).not.toBeInstanceOf(MaxRetriesExceededError);
    });

    test('a non-retryable error stops after the first attempt and reports onGiveUp', async () => {
      const giveUps: Array<{ message: string; attempt: number }> = [];
      const policy = policyWith({
        maxRetries: 3,
        onGiveUp: (error: Error, attempt: number) => { giveUps.push({ message: error.message, attempt }); }
      }, async () => undefined);
      let attempts = 0;

      const result = await outcome(policy, async () => {
        attempts++;
        throw new YahooFinanceError('Symbol not found', 'YF_ERR_SYMBOL_NOT_FOUND', 404, false, false, {}, 'check symbol');
      });

      expect(attempts).toBe(1);
      expect(result.resolved).toBe(false);
      expect((result.error as YahooFinanceError).code).toBe('YF_ERR_SYMBOL_NOT_FOUND');
      expect(giveUps[0].attempt).toBe(1);
    });

    test('retryHistory records every failed attempt with the delay that followed it', async () => {
      const policy = policyWith({ maxRetries: 1, initialDelayMs: 250 }, async () => undefined);
      await outcome(policy, async () => { throw new Error('request timeout'); });

      const history = policy.retryHistory;
      expect(history).toHaveLength(1);
      expect(history[0].attempt).toBe(1);
      expect(history[0].delayMs).toBe(250);
      expect(history[0].errorType).toBe(YF_ERR_TIMEOUT);
      expect(history[0].isRetryable).toBe(true);
    });
  });

  describe('backoff arithmetic', () => {
    const policy = policyWith({ maxRetries: 3, initialDelayMs: 100, maxDelayMs: 10000 });

    test('exponential multiplies by backoffMultiplier per attempt', () => {
      expect(policy.calculateDelay(1)).toBe(100);
      expect(policy.calculateDelay(2)).toBe(200);
      expect(policy.calculateDelay(3)).toBe(400);
    });

    test('linear and fixed strategies use their own formula', () => {
      const linear = policyWith({ strategy: 'linear', initialDelayMs: 300 });
      expect(linear.calculateDelay(1)).toBe(300);
      expect(linear.calculateDelay(3)).toBe(900);

      const fixed = policyWith({ strategy: 'fixed', retryDelayMs: 50 });
      expect(fixed.calculateDelay(4)).toBe(50);
    });

    test('a fixed strategy with a zero or NaN retryDelayMs falls back to initialDelayMs', () => {
      expect(policyWith({ strategy: 'fixed', retryDelayMs: 0, initialDelayMs: 120 }).calculateDelay(2)).toBe(120);
      expect(policyWith({ strategy: 'fixed', retryDelayMs: NaN, initialDelayMs: 120 }).calculateDelay(2)).toBe(120);
    });

    test('maxDelayMs caps the growth', () => {
      const capped = policyWith({ strategy: 'exponential', initialDelayMs: 1000, maxDelayMs: 2500, backoffMultiplier: 5 });
      expect(capped.calculateDelay(1)).toBe(1000);
      expect(capped.calculateDelay(2)).toBe(2500);
      expect(capped.calculateDelay(4)).toBe(2500);
    });

    test('jitter is +/-25% with a 100ms floor', () => {
      const jittered = policyWith({ strategy: 'exponential', initialDelayMs: 1000, jitter: true });
      const spy = jest.spyOn(Math, 'random');

      spy.mockReturnValue(0.5);
      expect(jittered.calculateDelay(1)).toBe(1000);
      spy.mockReturnValue(0);
      expect(jittered.calculateDelay(1)).toBe(750);
      spy.mockReturnValue(0.99999);
      expect(jittered.calculateDelay(1)).toBeCloseTo(1249.995, 2);
      spy.mockReturnValue(0);
      expect(jittered.calculateDelay(1) >= 100).toBe(true);

      spy.mockReturnValue(0);
      expect(jittered.addJitter(10)).toBe(100);
      expect(jittered.addJitter(0)).toBe(100);
    });

    test('transient server errors back off 1.5x and cookie errors half as long', () => {
      const probe = policyWith({ strategy: 'exponential', initialDelayMs: 200, maxDelayMs: 100000 });
      const badGateway = new YahooFinanceError('bad gateway', 'YF_ERR_SERVER', 502, true, false, {}, 'retry');
      const cookie = new YahooFinanceError('cookie expired', YF_ERR_COOKIE_ERROR, null, true, false, {}, 'refresh');

      expect(probe.calculateDelayForError(badGateway, 1)).toBe(300);
      expect(probe.calculateDelayForError(badGateway, 2)).toBe(600);
      expect(probe.calculateDelayForError(cookie, 1)).toBe(100);
      expect(probe.calculateDelayForError(new Error('plain') as never, 1)).toBe(200);
    });

    test('the fixture timeout ladder doubles under exponential backoff until maxDelayMs caps it', () => {
      for (const attempt of timeoutValues.slice(0, 4)) {
        const delay = policyWith({ initialDelayMs: attempt }).calculateDelay(2);
        expect(delay).toBe(Math.min(attempt * 2, retryConfigs.maxDelay));
      }
    });
  });

  describe('the documented timeout failure mode cannot be produced by the resilience stack', () => {
    test('the timeout request option never reaches the request path', async () => {
      const client = slowClient(200);
      const started = Date.now();
      const quote = await client.getQuote('AAPL', { timeout: 5 });
      const elapsed = Date.now() - started;

      expect(quote.price.regularMarketPrice).toBe(185.92);
      expect(elapsed).toBeGreaterThanOrEqual(150);
    });

    test('nothing races a never-settling upstream: the request just hangs', async () => {
      const policy = policyWith({ maxRetries: 2, initialDelayMs: 1 }, async () => undefined);
      const hanging = policy.execute(() => new Promise<never>(() => undefined));
      hanging.catch(() => undefined);

      const settled = await Promise.race([
        hanging.then(() => 'settled', () => 'settled'),
        new Promise(resolve => { setTimeout(() => resolve('still-pending'), 150); })
      ]);

      expect(settled).toBe('still-pending');
    });

    test('the only deadline a client actually gets is its own harness timeout', async () => {
      const client = slowClient(120);
      const first = Date.now();
      await client.getQuote('AAPL', { timeout: 1 });
      const second = Date.now();
      await client.getQuote('MSFT', { timeout: 1 });

      expect(second - first).toBeLessThan(1000);
      expect(timeoutValues[0]).toBe(100);
    });

    test('a cache hit short-circuits before the timeout would matter', async () => {
      let libraryCalls = 0;
      const client = new YahooFinanceClient({
        serverInfo: { name: 'chaos', version: '0', protocolVersion: '2024-11-05' },
        capabilities: { tools: {} },
        transport: 'stdio',
        rateLimit: { strategy: 'token-bucket', maxRequests: 500, windowMs: 60000, tokenRefillRate: 500, requestsPerMinute: 100000 },
        cache: { enabled: true, store: 'memory', ttl: 60000, maxEntries: 20 },
        retry: configFor({ maxRetries: 0, initialDelayMs: 1 }) as never,
        yahooFinance: { baseUrl: 'https://example.invalid', timeoutMs: 1000, maxConcurrentRequests: 5, requestQueueSize: 10, validateResponses: true, strictMode: false },
        circuitBreaker: { errorThresholdPercentage: 50, halfOpenMaxAttempts: 1, resetTimeoutMs: 60000, rollingCountTimeoutMs: 60000 }
      } as never) as YahooFinanceClient & Record<string, unknown>;

      (client as Record<string, unknown>).yahooFinanceInstance = {
        quote: async () => {
          libraryCalls++;
          await new Promise(resolve => { setTimeout(resolve, 100); });
          return { symbol: 'AAPL', regularMarketPrice: 185.92 };
        }
      };

      await client.getQuote('AAPL', { timeout: 10 });
      const cached = await client.getQuote('AAPL', { timeout: 10 });

      expect(libraryCalls).toBe(1);
      expect(cached.price.regularMarketPrice).toBe(185.92);
    });
  });

  describe('createRetryPolicy and the retry() helper share the same semantics', () => {
    test('both drive the same attempt count', async () => {
      let viaFactory = 0;
      let viaHelper = 0;

      await outcome(createRetryPolicy(configFor({ maxRetries: 2, initialDelayMs: 1 }) as never, async () => undefined),
        async () => { viaFactory++; throw new Error('timeout'); });

      await retry(async () => { viaHelper++; throw new Error('timeout'); },
        configFor({ maxRetries: 2, initialDelayMs: 1 }) as never, undefined, async () => undefined)
        .catch(() => undefined);

      expect(viaFactory).toBe(3);
      expect(viaHelper).toBe(3);
    });

    test('network codes the classifier misses are still retried via the raw error code', async () => {
      let attempts = 0;
      await outcome(policyWith({ maxRetries: 2, initialDelayMs: 1 }, async () => undefined), async () => {
        attempts++;
        throw Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' });
      });

      expect(attempts).toBe(3);
      // ECONNRESET is retried by the raw-code list only; the classifier calls it UNKNOWN,
      // while ECONNREFUSED and ENOTFOUND are matched by message substring into YF_ERR_NETWORK.
      expect(classifyError(Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' })).code).toBe(YF_ERR_UNKNOWN);
      expect(classifyError(new Error('connect ECONNREFUSED 127.0.0.1:443')).code).toBe(YF_ERR_NETWORK);
      expect(classifyError(new Error('getaddrinfo ENOTFOUND query1.finance.yahoo.com')).code).toBe(YF_ERR_NETWORK);
    });
  });

  describe('spawned-server prompt traffic proves list handlers need no upstream', () => {
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
        clientInfo: { name: 'chaos-timeout', version: '1.0.0' }
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

    test('prompts/list answers with all 6 prompts in well under the harness timeout', async () => {
      const started = Date.now();
      const response = await sendMCPRequest(createMCPRequest('prompts/list', {}, 1));
      const elapsed = Date.now() - started;

      expect((response.result as { prompts: unknown[] }).prompts).toHaveLength(6);
      expect(elapsed).toBeLessThan(5000);
    });
  });
});

function slowClient(delayMs: number): YahooFinanceClient & Record<string, unknown> {
  const client = new YahooFinanceClient({
    serverInfo: { name: 'chaos', version: '0', protocolVersion: '2024-11-05' },
    capabilities: { tools: {} },
    transport: 'stdio',
    rateLimit: { strategy: 'token-bucket', maxRequests: 500, windowMs: 60000, tokenRefillRate: 500, requestsPerMinute: 100000 },
    cache: { enabled: false, store: 'memory', ttl: 60000, maxEntries: 20 },
    retry: configFor({ maxRetries: 0, initialDelayMs: 1 }) as never,
    yahooFinance: { baseUrl: 'https://example.invalid', timeoutMs: 1000, maxConcurrentRequests: 5, requestQueueSize: 10, validateResponses: true, strictMode: false },
    circuitBreaker: { errorThresholdPercentage: 50, halfOpenMaxAttempts: 1, resetTimeoutMs: 60000, rollingCountTimeoutMs: 60000 }
  } as never) as YahooFinanceClient & Record<string, unknown>;

  (client as Record<string, unknown>).yahooFinanceInstance = {
    quote: async () => {
      await new Promise(resolve => { setTimeout(resolve, delayMs); });
      return { symbol: 'AAPL', regularMarketPrice: 185.92 };
    }
  };
  return client;
}
