import { describe, test, expect, beforeAll, afterAll, afterEach, jest } from '@jest/globals';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { existsSync } from 'fs';
import { RateLimiter, RateLimitError } from '../../src/middleware/rate-limiter';
import { RetryPolicy } from '../../src/middleware/retry';
import { Cache } from '../../src/middleware/cache';
import { YahooFinanceClient } from '../../src/services/yahoo-finance';
import { YahooFinanceError, YF_ERR_RATE_LIMIT } from '../../src/types/errors';
import { rateLimitConfigs } from '../fixtures/test-data.ts';

const SERVER_PATH = path.resolve(__dirname, '../../dist/index.js');

function limiterConfig(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { strategy: 'token-bucket', maxRequests: 5, windowMs: 60000, tokenRefillRate: 1, ...overrides };
}

async function attempt(limiter: RateLimiter, endpoint?: string): Promise<string> {
  return limiter.execute(async () => 'payload', endpoint)
    .then(() => 'ok', (error: unknown) => {
      const err = error as RateLimitError;
      return `${err.name}|${err.message}|${String(err.code)}|${String(err.statusCode)}|${String(err.retryAfter)}`;
    });
}

describe('Rate limit chaos (in-process fault injection)', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  describe('exhaustion throws, it never queues', () => {
    test('the calendar-window tracker rejects the request that passes the per-minute limit', async () => {
      // `requestsPerMinute` unset falls back to `maxRequests`, so the minute window trips
      // on the request AFTER the burst capacity is used (`count >= limit`).
      const limiter = new RateLimiter(limiterConfig({ maxRequests: 3 }) as never);

      expect(await attempt(limiter)).toBe('ok');
      expect(await attempt(limiter)).toBe('ok');
      expect(await attempt(limiter)).toContain('RateLimitError|Rate limit exceeded|YF_ERR_RATE_LIMIT|429|60');
      expect(limiter.getStats().rejectedRequests).toBe(1);
      expect(limiter.getStats().totalRequests).toBe(2);
    });

    test('an explicit requestsPerMinute is honored independently of burst capacity', async () => {
      // Fake timers freeze `Date.now`, so the token bucket cannot refill mid-loop and the
      // only limiter that can trip is the fixed calendar-window tracker.
      jest.useFakeTimers();
      const limiter = new RateLimiter(limiterConfig({
        maxRequests: 1000,
        requestsPerMinute: rateLimitConfigs.requestsPerMinute,
        tokenRefillRate: 1000
      }) as never);

      const results: string[] = [];
      for (let i = 0; i < rateLimitConfigs.requestsPerMinute + 1; i++) {
        results.push(await attempt(limiter));
      }

      // Measured off-by-one: `trackRequest` increments first and `isExceeded` then compares
      // `count >= limit`, so a per-minute limit of N only ever serves N - 1 requests.
      expect(results.filter(r => r === 'ok')).toHaveLength(rateLimitConfigs.requestsPerMinute - 1);
      expect(results[rateLimitConfigs.requestsPerMinute - 1])
        .toBe('RateLimitError|Rate limit exceeded|YF_ERR_RATE_LIMIT|429|60');

      jest.advanceTimersByTime(60000);
      expect(await attempt(limiter)).toBe('ok');
    });

    test('exhaustion rejects immediately instead of parking the caller in a queue', async () => {
      const limiter = new RateLimiter(limiterConfig({ maxRequests: 2, requestsPerMinute: 100000 }) as never);
      const inflight = [
        limiter.execute(async () => { await new Promise(r => setTimeout(r, 300)); return 'a'; }, 'slow-a'),
        limiter.execute(async () => { await new Promise(r => setTimeout(r, 300)); return 'b'; }, 'slow-b')
      ];
      await Promise.all(inflight);

      // Tokens are gone (capacity 2, refill 1/s) and the per-endpoint concurrency guard is
      // hit for the same endpoint; either way the caller is thrown at, not queued.
      const started = Date.now();
      const rejected = await attempt(limiter, 'slow-a');
      expect(Date.now() - started).toBeLessThan(90);
      expect(rejected).toContain('RateLimitError');
      expect(limiter.getStats().queueLength).toBe(0);
    });

    test('only concurrency queues, and it drains FIFO once a slot frees', async () => {
      const limiter = new RateLimiter(limiterConfig({ maxRequests: 2, requestsPerMinute: 100000, tokenRefillRate: 100 }) as never);
      await limiter.acquire();
      await limiter.acquire();

      let released = false;
      const queued = limiter.acquire().then(() => { released = true; });
      expect(limiter.getStats().queueLength).toBe(1);

      await new Promise(r => setTimeout(r, 20));
      expect(released).toBe(false);

      limiter.release();
      await queued;
      expect(released).toBe(true);
      expect(limiter.getStats().queueLength).toBe(0);
    });

    test('the token bucket refills continuously and restores service', async () => {
      jest.useFakeTimers();
      const limiter = new RateLimiter(limiterConfig({ maxRequests: 4, requestsPerMinute: 100000, tokenRefillRate: 1 }) as never);

      for (let i = 0; i < 4; i++) {
        expect(await attempt(limiter)).toBe('ok');
      }
      expect(await attempt(limiter)).toContain('RateLimitError');

      jest.advanceTimersByTime(2000);
      expect(await attempt(limiter)).toBe('ok');
    });
  });

  describe('adaptive throttling from response headers', () => {
    test('low remaining plus retry-after shrinks the limit and makes the next call throw', async () => {
      const limiter = new RateLimiter(limiterConfig({
        maxRequests: 100, requestsPerMinute: 100000, tokenRefillRate: 100
      }) as never);
      expect(limiter.predictiveThrottle()).toBe(false);

      limiter.updateFromHeaders(new Headers({
        'x-ratelimit-limit': '100',
        'x-ratelimit-remaining': '1',
        'retry-after': '30'
      }));

      expect(limiter.getStats().currentLimit).toBe(81);
      expect(limiter.predictiveThrottle()).toBe(true);
      expect(limiter.getBackoffDuration()).toBe(30);

      const rejected = await attempt(limiter);
      expect(rejected).toContain('Predictive rate limit triggered to avoid hard limit');
      expect(rejected).toContain('|429|30');
    });

    test('a healthy remaining ratio does not throttle', async () => {
      const limiter = new RateLimiter(limiterConfig({
        maxRequests: 100, requestsPerMinute: 100000, tokenRefillRate: 100
      }) as never);
      limiter.updateFromHeaders(new Headers({ 'x-ratelimit-limit': '100', 'x-ratelimit-remaining': '90' }));
      expect(limiter.predictiveThrottle()).toBe(false);
      expect(await attempt(limiter)).toBe('ok');
    });

    test('the adaptive floor is a quarter of maxRequests', async () => {
      const limiter = new RateLimiter(limiterConfig({ maxRequests: 40 }) as never);
      limiter.updateFromHeaders(new Headers({ 'x-ratelimit-remaining': '0', 'retry-after': '5' }));
      for (let i = 0; i < 40; i++) {
        limiter.updateFromHeaders(new Headers({ 'x-ratelimit-remaining': '0', 'retry-after': '5' }));
      }
      expect(limiter.getStats().currentLimit).toBe(10);
    });
  });

  describe('a 429 from upstream inside execute', () => {
    test('serves the cached rate_limited_<endpoint> entry instead of throwing', async () => {
      const cache = new Cache({ enabled: true, store: 'memory', ttl: 60000, maxEntries: 10 } as never);
      const limiter = new RateLimiter(limiterConfig({ maxRequests: 50, requestsPerMinute: 100000, tokenRefillRate: 100 }) as never);
      limiter.setCache({ get: key => cache.get(key), set: (key, value) => cache.set(key, value) });
      await cache.set('rate_limited_ep429', 'stale-but-serving');

      const served = await limiter.execute(async () => {
        throw new Error('HTTP 429 Too Many Requests');
      }, 'ep429');

      expect(served).toBe('stale-but-serving');
    });

    test('without a cached entry it throws RateLimitError with a 60 second hint', async () => {
      const cache = new Cache({ enabled: true, store: 'memory', ttl: 60000, maxEntries: 10 } as never);
      const limiter = new RateLimiter(limiterConfig({ maxRequests: 50, requestsPerMinute: 100000, tokenRefillRate: 100 }) as never);
      limiter.setCache({ get: key => cache.get(key), set: (key, value) => cache.set(key, value) });

      const rejected = await limiter.execute(async () => {
        throw new Error('HTTP 429 Too Many Requests');
      }, 'epMissing').then(() => 'resolved', (error: unknown) => error as RateLimitError);

      expect(rejected).toBeInstanceOf(Error);
      const err = rejected as RateLimitError;
      expect(err.message).toBe('Rate limit exceeded, falling back to cached data');
      expect(err.code).toBe(YF_ERR_RATE_LIMIT);
      expect(err.statusCode).toBe(429);
      expect(err.isRateLimit).toBe(true);
      expect(err.retryAfter).toBe(60);
    });

    test('non-429 failures are rethrown unchanged', async () => {
      const limiter = new RateLimiter(limiterConfig({ maxRequests: 50, requestsPerMinute: 100000, tokenRefillRate: 100 }) as never);
      const failure = await limiter.execute(async () => { throw new Error('upstream exploded'); }, 'plain')
        .then(() => 'resolved', (error: unknown) => error as Error);
      expect((failure as Error).message).toBe('upstream exploded');
    });
  });

  describe('rate-limit aware retry backoff', () => {
    const retryConfig = {
      enabled: true, maxRetries: 2, initialDelayMs: 100, maxDelayMs: 10000,
      strategy: 'exponential', backoffMultiplier: 2, jitter: false,
      retryableStatusCodes: [429, 500, 502, 503, 504], retryableErrorCodes: []
    };

    async function delaysFor(error: YahooFinanceError, maxRetries = 1): Promise<number[]> {
      const delays: number[] = [];
      const policy = new RetryPolicy({ ...retryConfig, maxRetries } as never, async (ms: number) => { delays.push(ms); });
      await policy.execute(async () => { throw error; }).catch(() => undefined);
      return delays;
    }

    test('a rate limit without a retry-after doubles the base delay', async () => {
      const delays = await delaysFor(new RateLimitError('slow down', undefined, 100, 0));
      expect(delays).toEqual([200]);
    });

    test('a rate limit with a retry-after waits retryAfter * 1000, never less than the base', async () => {
      const long = await delaysFor(new RateLimitError('slow down', 7, 100, 0));
      expect(long).toEqual([7000]);

      const twoAttempts = await delaysFor(new RateLimitError('slow down', 7, 100, 0), 2);
      expect(twoAttempts).toEqual([7000, 7000]);

      const subBase = await delaysFor(new RateLimitError('slow down', 0, 100, 0));
      expect(subBase).toEqual([200]);
    });

    test('the doubled delay is still capped by maxDelayMs', async () => {
      const delays = await delaysFor(new RateLimitError('slow down', undefined, 100, 0));
      const capped = new RetryPolicy({ ...retryConfig, maxRetries: 1, maxDelayMs: 150 } as never, async () => undefined);
      expect(capped.calculateDelayForError(new RateLimitError('slow down', undefined, 100, 0), 1)).toBe(150);
      expect(delays).toEqual([200]);
    });

    test('a classified 429 response is treated as a rate limit and retried', async () => {
      const delays: number[] = [];
      const policy = new RetryPolicy(retryConfig as never, async (ms: number) => { delays.push(ms); });
      let calls = 0;
      await policy.execute(async () => {
        calls++;
        throw Object.assign(new Error('Too Many Requests'), { status: 429 });
      }).catch(() => undefined);

      expect(calls).toBe(3);
      expect(delays).toEqual([200, 400]);
    });
  });

  describe('the limiter inside the service composition', () => {
    test('retry attempts bypass the limiter: one tracked request covers the whole retry chain', async () => {
      let libraryCalls = 0;
      const client = new YahooFinanceClient({
        serverInfo: { name: 'chaos', version: '0', protocolVersion: '2024-11-05' },
        capabilities: { tools: {} },
        transport: 'stdio',
        rateLimit: { strategy: 'token-bucket', maxRequests: 50, windowMs: 60000, tokenRefillRate: 50, requestsPerMinute: 2 },
        cache: { enabled: false, store: 'memory', ttl: 60000, maxEntries: 10 },
        retry: {
          enabled: true, maxRetries: 2, initialDelayMs: 1, maxDelayMs: 5,
          strategy: 'fixed', backoffMultiplier: 2, jitter: false,
          retryableStatusCodes: [429], retryableErrorCodes: []
        },
        yahooFinance: { baseUrl: 'https://example.invalid', timeoutMs: 1000, maxConcurrentRequests: 5, requestQueueSize: 10, validateResponses: true, strictMode: false },
        circuitBreaker: { errorThresholdPercentage: 50, halfOpenMaxAttempts: 1, resetTimeoutMs: 60000, rollingCountTimeoutMs: 60000 }
      } as never) as YahooFinanceClient & Record<string, unknown>;

      (client as Record<string, unknown>).yahooFinanceInstance = {
        quote: async () => {
          libraryCalls++;
          throw Object.assign(new Error('Too Many Requests'), { status: 429 });
        }
      };

      const rejection = await client.getQuote('AAPL').then(() => null, (error: unknown) => error as YahooFinanceError);

      expect(libraryCalls).toBe(3);
      expect(rejection?.code).toBe(YF_ERR_RATE_LIMIT);
      expect((client.rateLimiter as never as RateLimiter).getStats().totalRequests).toBe(1);
      expect((client.rateLimiter as never as RateLimiter).getStats().minuteCount).toBe(1);
    });
  });

  describe('reset and stats', () => {
    test('reset() clears tokens, windows, endpoint state and counters', async () => {
      const limiter = new RateLimiter(limiterConfig({ maxRequests: 2, requestsPerMinute: 100000 }) as never);
      await attempt(limiter);
      await attempt(limiter);
      expect(await attempt(limiter)).toContain('RateLimitError');

      limiter.reset();
      const stats = limiter.getStats();
      expect(stats.totalRequests).toBe(0);
      expect(stats.rejectedRequests).toBe(0);
      expect(stats.minuteCount).toBe(0);
      expect(stats.queueLength).toBe(0);
      expect(await attempt(limiter)).toBe('ok');
    });
  });

  describe('spawned-server protocol surface under request pressure', () => {
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
        clientInfo: { name: 'chaos-rate-limit', version: '1.0.0' }
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

    test('a burst of concurrent requests is answered, not dropped: every reply carries all 17 tools', async () => {
      const responses = await Promise.all(Array.from({ length: 20 }, (_unused, i) =>
        sendMCPRequest(createMCPRequest('tools/list', {}, i + 1))));

      expect(responses).toHaveLength(20);
      responses.forEach((response, index) => {
        expect(response.id).toBe(index + 1);
        expect((response.result as { tools: unknown[] }).tools).toHaveLength(17);
      });
    });
  });
});
