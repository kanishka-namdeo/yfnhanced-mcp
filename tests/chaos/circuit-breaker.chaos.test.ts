import { describe, test, expect, beforeAll, afterAll, afterEach, jest } from '@jest/globals';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { existsSync } from 'fs';
import { CircuitBreaker } from '../../src/middleware/circuit-breaker';
import { RetryPolicy } from '../../src/middleware/retry';
import { YahooFinanceClient } from '../../src/services/yahoo-finance';
import { classifyError } from '../../src/utils/error-classifier';
import { YahooFinanceError, YF_ERR_CIRCUIT_OPEN } from '../../src/types/errors';
import { circuitBreakerConfigs } from '../fixtures/test-data.ts';

// `__dirname` is required, not `import.meta.url`: the Jest transform forces
// `module: 'commonjs'` (`jest.config.js:15`) and `import.meta` cannot be downleveled.
const SERVER_PATH = path.resolve(__dirname, '../../dist/index.js');

// `tests/fixtures/test-data.ts` names its breaker keys after a different vocabulary
// (`failureThreshold`/`successThreshold`/`timeout`) than `CircuitBreaker` reads
// (`errorThresholdPercentage`/`halfOpenMaxAttempts`/`resetTimeoutMs`). The mapping below is
// the only way those fixture values reach the class; passing the fixture object unchanged
// silently falls back to the inline defaults (5 / 3 / 60000 / 60000).
function breakerConfig(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    errorThresholdPercentage: circuitBreakerConfigs.failureThreshold,
    halfOpenMaxAttempts: circuitBreakerConfigs.successThreshold,
    resetTimeoutMs: circuitBreakerConfigs.timeout,
    rollingCountTimeoutMs: circuitBreakerConfigs.monitoringWindow,
    ...overrides
  };
}

const FAST_BREAKER = {
  errorThresholdPercentage: 2,
  halfOpenMaxAttempts: 1,
  resetTimeoutMs: 1000,
  rollingCountTimeoutMs: 60000
};

async function failThrough(cb: CircuitBreaker, marker: string): Promise<unknown> {
  return cb.execute(async () => { throw new Error(`${marker} down`); })
    .then(value => ({ ok: true, value }), error => ({ ok: false, error }));
}

describe('Circuit breaker chaos (in-process fault injection)', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('CLOSED to OPEN', () => {
    test('opens once failures reach the threshold inside the monitoring window', async () => {
      const cb = new CircuitBreaker(FAST_BREAKER as never);
      expect(cb.getState()).toBe('CLOSED');

      await failThrough(cb, 'first');
      expect(cb.getState()).toBe('CLOSED');

      await failThrough(cb, 'second');
      expect(cb.getState()).toBe('OPEN');
      expect(cb.getMetrics().failureCount).toBe(2);
    });

    test('stays closed while failures stay below the threshold', async () => {
      const cb = new CircuitBreaker({ ...FAST_BREAKER, errorThresholdPercentage: 5 } as never);
      for (let attempt = 0; attempt < 4; attempt++) {
        await failThrough(cb, `below-${String(attempt)}`);
      }
      expect(cb.getState()).toBe('CLOSED');
      expect(cb.getMetrics().failureCount).toBe(4);
    });

    test('successes do not clear the failure counter by themselves', async () => {
      const cb = new CircuitBreaker({ ...FAST_BREAKER, errorThresholdPercentage: 3 } as never);
      await failThrough(cb, 'a');
      await cb.execute(async () => 'ok');
      await failThrough(cb, 'b');
      expect(cb.getState()).toBe('CLOSED');
      await failThrough(cb, 'c');
      expect(cb.getState()).toBe('OPEN');
    });

    test('failures older than the monitoring window are dropped before the threshold check', async () => {
      jest.useFakeTimers();
      const cb = new CircuitBreaker({ ...FAST_BREAKER, errorThresholdPercentage: 3, rollingCountTimeoutMs: 10000 } as never);

      await failThrough(cb, 'old-1');
      await failThrough(cb, 'old-2');
      jest.advanceTimersByTime(11000);

      await failThrough(cb, 'new-1');
      await failThrough(cb, 'new-2');

      expect(cb.getState()).toBe('CLOSED');
      expect(cb.getMetrics().failureCount).toBe(2);
    });

    test('intermittent failures under the threshold keep serving results', async () => {
      const cb = new CircuitBreaker({ ...FAST_BREAKER, errorThresholdPercentage: 5 } as never);
      const outcomes: string[] = [];
      for (let i = 0; i < 10; i++) {
        const outcome = i % 3 === 0
          ? await failThrough(cb, `flaky-${String(i)}`)
          : { ok: true, value: await cb.execute(async () => 'payload') };
        outcomes.push(outcome.ok ? 'ok' : 'failed');
      }
      expect(cb.getState()).toBe('CLOSED');
      expect(cb.getMetrics().failureCount).toBe(4);
      expect(outcomes.filter(o => o === 'ok').length).toBe(6);
    });
  });

  describe('OPEN rejects before the call is made', () => {
    test('an open circuit throws CircuitBreakerOpenError without invoking fn', async () => {
      const cb = new CircuitBreaker(FAST_BREAKER as never);
      await failThrough(cb, 'one');
      await failThrough(cb, 'two');
      expect(cb.getState()).toBe('OPEN');

      let invoked = 0;
      const rejection = await cb.execute(async () => { invoked++; return 'never'; })
        .then(() => null, (error: unknown) => error);

      expect(invoked).toBe(0);
      expect(rejection).toBeInstanceOf(Error);
      const err = rejection as YahooFinanceError;
      expect(err.name).toBe('CircuitBreakerOpenError');
      expect(err.code).toBe(YF_ERR_CIRCUIT_OPEN);
      expect(err.statusCode).toBeNull();
      expect(err.isRetryable).toBe(false);
      expect(err.suggestedAction).toBe('Wait for circuit breaker to reset before retrying');
    });

    test('the classifier maps a bare circuit-open message to the same code', () => {
      const classified = classifyError(new Error('Circuit open, request rejected'));
      expect(classified.code).toBe(YF_ERR_CIRCUIT_OPEN);
      expect(classified.isRetryable).toBe(false);
    });
  });

  describe('OPEN to HALF_OPEN to CLOSED or OPEN', () => {
    test('transitions to HALF_OPEN lazily once resetTimeoutMs has elapsed', async () => {
      jest.useFakeTimers();
      const cb = new CircuitBreaker({ ...FAST_BREAKER, resetTimeoutMs: 1000 } as never);
      await failThrough(cb, 'one');
      await failThrough(cb, 'two');

      jest.advanceTimersByTime(999);
      expect(cb.getState()).toBe('OPEN');
      const rejected = await cb.execute(async () => 'nope').then(() => 'resolved', () => 'rejected');
      expect(rejected).toBe('rejected');

      jest.advanceTimersByTime(2);
      expect(cb.getState()).toBe('HALF_OPEN');
    });

    test('a single failure in HALF_OPEN reopens immediately, whatever successThreshold says', async () => {
      jest.useFakeTimers();
      const cb = new CircuitBreaker({ errorThresholdPercentage: 2, halfOpenMaxAttempts: 5, resetTimeoutMs: 1000, rollingCountTimeoutMs: 60000 } as never);
      await failThrough(cb, 'one');
      await failThrough(cb, 'two');
      jest.advanceTimersByTime(1001);
      expect(cb.getState()).toBe('HALF_OPEN');

      await failThrough(cb, 'probe');
      expect(cb.getState()).toBe('OPEN');
    });

    test('HALF_OPEN closes only after successThreshold successes', async () => {
      jest.useFakeTimers();
      const cb = new CircuitBreaker({ errorThresholdPercentage: 2, halfOpenMaxAttempts: 2, resetTimeoutMs: 1000, rollingCountTimeoutMs: 60000 } as never);
      await failThrough(cb, 'one');
      await failThrough(cb, 'two');
      jest.advanceTimersByTime(1001);

      await cb.execute(async () => 'probe-1');
      expect(cb.getState()).toBe('HALF_OPEN');
      await cb.execute(async () => 'probe-2');
      expect(cb.getState()).toBe('CLOSED');
      expect(cb.getMetrics()).toEqual({ failureCount: 0, successCount: 0 });
    });

    test('a reopening failure in HALF_OPEN discards the successes already collected', async () => {
      jest.useFakeTimers();
      const cb = new CircuitBreaker({ errorThresholdPercentage: 2, halfOpenMaxAttempts: 2, resetTimeoutMs: 1000, rollingCountTimeoutMs: 60000 } as never);
      await failThrough(cb, 'one');
      await failThrough(cb, 'two');
      jest.advanceTimersByTime(1001);

      await cb.execute(async () => 'probe-1');
      expect(cb.getMetrics().successCount).toBe(1);
      await failThrough(cb, 'probe-fail');
      expect(cb.getState()).toBe('OPEN');
      expect(cb.getMetrics().successCount).toBe(0);
    });

    test('reset() forces CLOSED and clears both counters', async () => {
      const cb = new CircuitBreaker(FAST_BREAKER as never);
      await failThrough(cb, 'one');
      await failThrough(cb, 'two');
      expect(cb.getState()).toBe('OPEN');

      cb.reset();
      expect(cb.getState()).toBe('CLOSED');
      expect(cb.getMetrics()).toEqual({ failureCount: 0, successCount: 0 });
      expect(await cb.execute(async () => 'served')).toBe('served');
    });

    test('a configured fallback answers the caller but still counts the failure', async () => {
      const cb = new CircuitBreaker({ ...FAST_BREAKER, fallback: () => 'fallback-payload' } as never);

      expect(await cb.execute(async () => { throw new Error('boom'); })).toBe('fallback-payload');
      expect(cb.getState()).toBe('CLOSED');

      expect(await cb.execute(async () => { throw new Error('boom'); })).toBe('fallback-payload');
      expect(cb.getState()).toBe('OPEN');
    });
  });

  describe('breaker and retry layers interact as the service composes them', () => {
    const retryConfig = {
      enabled: true, maxRetries: 2, initialDelayMs: 100, maxDelayMs: 10000,
      strategy: 'exponential', backoffMultiplier: 2, jitter: false,
      retryableStatusCodes: [429, 500, 502, 503, 504], retryableErrorCodes: []
    };

    test('an open breaker short-circuits retry: the retry layer never runs', async () => {
      const cb = new CircuitBreaker({ ...FAST_BREAKER, resetTimeoutMs: 60000 } as never);
      const delays: number[] = [];
      const policy = new RetryPolicy(retryConfig as never, async (ms: number) => { delays.push(ms); });
      let innerCalls = 0;

      const composed = async (): Promise<unknown> => cb.execute(() => policy.execute(async () => {
        innerCalls++;
        throw Object.assign(new Error('ECONNREFUSED refused'), { code: 'ECONNREFUSED' });
      }));

      await composed().catch(() => undefined);
      await composed().catch(() => undefined);
      expect(cb.getState()).toBe('OPEN');

      const breakerCalls = innerCalls;
      const rejection = await composed().then(() => 'resolved', (error: unknown) => error);
      expect(innerCalls).toBe(breakerCalls);
      expect((rejection as YahooFinanceError).code).toBe(YF_ERR_CIRCUIT_OPEN);
      expect(delays.length).toBe(4);
    });

    test('CircuitBreakerOpenError is never retried even when retry wraps it directly', async () => {
      const policy = new RetryPolicy(retryConfig as never, async () => undefined);
      let calls = 0;
      await policy.execute(async () => {
        calls++;
        throw Object.assign(new Error('Circuit breaker is open'), { code: YF_ERR_CIRCUIT_OPEN });
      }).catch(() => undefined);
      expect(calls).toBe(1);
    });
  });

  describe('breaker state is shared across endpoints', () => {
    test('the breaker counts a whole retry chain as one failure, then rejects other symbols', async () => {
      let libraryCalls = 0;
      const client = clientFor(async () => {
        libraryCalls++;
        throw Object.assign(new Error('connection refused by upstream'), { code: 'ECONNREFUSED' });
      });

      // One getQuote = maxRetries + 1 = 2 library attempts, but the breaker sits outside
      // retry, so it records a single failure.
      await client.getQuote('AAPL').catch(() => undefined);
      expect(libraryCalls).toBe(2);
      expect((client.circuitBreaker as never as CircuitBreaker).getState()).toBe('CLOSED');

      await client.getQuote('MSFT').catch(() => undefined);
      expect((client.circuitBreaker as never as CircuitBreaker).getState()).toBe('OPEN');

      const callsBeforeRejection = libraryCalls;
      const rejection = await client.getQuote('GOOGL').then(() => 'resolved', (error: unknown) => error);

      expect(libraryCalls).toBe(callsBeforeRejection);
      expect((rejection as YahooFinanceError).code).toBe(YF_ERR_CIRCUIT_OPEN);
    });

    test('the rejected call keeps the shape the MCP boundary reports', async () => {
      const client = clientFor(async () => {
        throw Object.assign(new Error('connection refused by upstream'), { code: 'ECONNREFUSED' });
      });
      await client.getQuote('AAPL').catch(() => undefined);
      await client.getQuote('MSFT').catch(() => undefined);

      const error = await client.getQuote('GOOGL').then(() => null, (e: unknown) => e as YahooFinanceError);
      expect(error).not.toBeNull();

      const payload = error?.toJSON();
      expect(payload.code).toBe(YF_ERR_CIRCUIT_OPEN);
      expect(payload.statusCode).toBeNull();
      expect(payload.isRetryable).toBe(false);
      expect(payload.suggestedAction).toBe('Wait for circuit breaker to reset before retrying');
    });
  });

  test('concurrent failures are all recorded; callers already in flight are not rejected', async () => {
    const cb = new CircuitBreaker({ ...FAST_BREAKER, errorThresholdPercentage: 4 } as never);
    const inflight = [1, 2, 3, 4, 5].map(i => cb.execute(async () => { throw new Error(`burst-${String(i)}`); })
      .then(() => 'ok', () => 'failed'));
    const settled = await Promise.all(inflight);

    expect(settled).toEqual(['failed', 'failed', 'failed', 'failed', 'failed']);
    expect(cb.getState()).toBe('OPEN');
    expect(cb.getMetrics().failureCount).toBe(5);
  });

  describe('spawned-server protocol surface is not governed by the breaker', () => {
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
        // No USE_MOCK_API: nothing in `src/` reads it, so it stubs nothing.
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
        clientInfo: { name: 'chaos-circuit-breaker', version: '1.0.0' }
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

    test('rejected tool calls neither wedge the transport nor trip anything: tools/list still reports 17 tools', async () => {
      const rejections = await Promise.all(Array.from({ length: 12 }, (_unused, i) =>
        sendMCPRequest(createMCPRequest('tools/call', { name: 'not_a_tool', arguments: {} }, i + 10))));

      rejections.forEach(response => {
        const result = response.result as { isError?: boolean; content?: Array<{ text: string }> };
        expect(result.isError).toBe(true);
        expect(result.content?.[0].text).toContain('Unknown tool');
      });

      const listed = await sendMCPRequest(createMCPRequest('tools/list', {}, 99));
      const tools = (listed.result as { tools: unknown[] }).tools;
      expect(tools).toHaveLength(17);
    });
  });
});

function clientFor(handler: (symbol: string) => Promise<unknown>): YahooFinanceClient & Record<string, unknown> {
  const client = new YahooFinanceClient({
    serverInfo: { name: 'chaos', version: '0', protocolVersion: '2024-11-05' },
    capabilities: { tools: {} },
    transport: 'stdio',
    rateLimit: { strategy: 'token-bucket', maxRequests: 1000, windowMs: 60000, tokenRefillRate: 1000, requestsPerMinute: 100000 },
    cache: { enabled: true, store: 'memory', ttl: 60000, maxEntries: 50 },
    retry: {
      enabled: true, maxRetries: 1, initialDelayMs: 1, maxDelayMs: 10,
      strategy: 'fixed', backoffMultiplier: 2, jitter: false,
      retryableStatusCodes: [429, 500], retryableErrorCodes: []
    },
    yahooFinance: { baseUrl: 'https://example.invalid', timeoutMs: 1000, maxConcurrentRequests: 5, requestQueueSize: 10, validateResponses: true, strictMode: false },
    // Two failures open the breaker, and it stays OPEN for the whole test.
    circuitBreaker: { errorThresholdPercentage: 2, halfOpenMaxAttempts: 1, resetTimeoutMs: 60000, rollingCountTimeoutMs: 60000 }
  } as never) as YahooFinanceClient & Record<string, unknown>;

  client.yahooFinanceInstance = { quote: async (symbol: string) => handler(symbol) };
  return client;
}
