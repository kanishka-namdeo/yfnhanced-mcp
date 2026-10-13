import { describe, test, expect, beforeAll, afterAll, afterEach, jest } from '@jest/globals';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { existsSync } from 'fs';
import { RetryPolicy } from '../../src/middleware/retry';
import { CircuitBreaker } from '../../src/middleware/circuit-breaker';
import { classifyError } from '../../src/utils/error-classifier';
import { YahooFinanceClient } from '../../src/services/yahoo-finance';
import { YahooFinanceError, YF_ERR_NETWORK, YF_ERR_TIMEOUT, YF_ERR_UNKNOWN } from '../../src/types/errors';
import { networkFailureScenarios } from '../fixtures/test-data.ts';

const SERVER_PATH = path.resolve(__dirname, '../../dist/index.js');

const retryConfig = {
  enabled: true, maxRetries: 2, initialDelayMs: 1, maxDelayMs: 5,
  strategy: 'fixed' as const, backoffMultiplier: 2, jitter: false,
  retryableStatusCodes: [429, 500], retryableErrorCodes: []
};

function makeClient(quoteHandler: (symbol: string) => Promise<unknown>, cacheEnabled: boolean): YahooFinanceClient & Record<string, unknown> {
  const client = new YahooFinanceClient({
    serverInfo: { name: 'chaos', version: '0', protocolVersion: '2024-11-05' },
    capabilities: { tools: {} },
    transport: 'stdio',
    rateLimit: { strategy: 'token-bucket', maxRequests: 500, windowMs: 60000, tokenRefillRate: 500, requestsPerMinute: 100000 },
    cache: { enabled: cacheEnabled, store: 'memory', ttl: 60000, maxEntries: 50 },
    retry: retryConfig as never,
    yahooFinance: { baseUrl: 'https://example.invalid', timeoutMs: 1000, maxConcurrentRequests: 5, requestQueueSize: 10, validateResponses: true, strictMode: false },
    circuitBreaker: { errorThresholdPercentage: 2, halfOpenMaxAttempts: 1, resetTimeoutMs: 60000, rollingCountTimeoutMs: 60000 }
  } as never) as YahooFinanceClient & Record<string, unknown>;

  (client as Record<string, unknown>).yahooFinanceInstance = { quote: quoteHandler };
  return client;
}

function asError(result: unknown): YahooFinanceError {
  return result as YahooFinanceError;
}

describe('Network failure chaos (in-process fault injection)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('what the classifier actually produces for each scenario shape', () => {
    test('the fixture codes only classify when they arrive in the message, and only three of them', () => {
      const byMessage = (message: string): YahooFinanceError => classifyError(new Error(message));

      // `networkFailureScenarios` stores bare codes (`ECONNREFUSED`, `ENOTFOUND`, ...).
      // `classifyError` has no code table for network errors at all: it substring-matches the
      // message, so ENETDOWN and ECONNRESET never become YF_ERR_NETWORK.
      expect(byMessage(`connect ${networkFailureScenarios.connectionRefused.code} 127.0.0.1:443`).code).toBe(YF_ERR_NETWORK);
      expect(byMessage(`getaddrinfo ${networkFailureScenarios.dnsError.code} query1.finance.yahoo.com`).code).toBe(YF_ERR_NETWORK);
      expect(byMessage(networkFailureScenarios.socketHangUp.code).code).toBe(YF_ERR_UNKNOWN);
      expect(byMessage(networkFailureScenarios.networkDown.code).code).toBe(YF_ERR_UNKNOWN);
      expect(byMessage('socket hang up').code).toBe(YF_ERR_UNKNOWN);
    });

    test('every network-shaped failure with a real code is retryable, and the fixture timeout entry has no code', () => {
      const codes = Object.values(networkFailureScenarios)
        .map(s => s.code)
        .filter((code): code is string => typeof code === 'string');

      // `networkFailureScenarios.timeout` carries `{ timeout: 30000 }` and no `code`, so the
      // fixture cannot produce a timeout-shaped error object at all.
      expect(codes).toEqual(['ECONNREFUSED', 'ENOTFOUND', 'ENETDOWN', 'ECONNRESET']);

      for (const code of codes) {
        const classified = classifyError(new Error(`upstream failed with ${code}`));
        expect(classified.isRetryable).toBe(true);
        expect(classified.statusCode).toBeNull();
      }

      expect(classifyError(new Error(`upstream failed with ${codes[3]}`)).code).toBe(YF_ERR_UNKNOWN);

      // A message that merely contains the word "undefined" (which is how the fixture's
      // codeless entry stringifies) is swallowed by the null-data rule instead.
      const undefinedShaped = classifyError(new Error('upstream failed: undefined'));
      expect(undefinedShaped.code).toBe('YF_ERR_DATA_UNAVAILABLE');
      expect(undefinedShaped.isRetryable).toBe(false);
    });

    test('a timeout string is the only network shape that reaches YF_ERR_TIMEOUT', () => {
      expect(classifyError(new Error('network timeout reached')).code).toBe(YF_ERR_TIMEOUT);
      expect(classifyError(new Error('ETIMEDOUT')).code).toBe(YF_ERR_UNKNOWN);
    });

    test('the raw error code list rescues ECONNRESET and friends even when classification says UNKNOWN', async () => {
      const attempts: string[] = [];
      const policy = new RetryPolicy(retryConfig as never, async () => undefined);

      for (const code of ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED', 'ENETDOWN']) {
        let calls = 0;
        await policy.execute(async () => {
          calls++;
          throw Object.assign(new Error('transport failure'), { code });
        }).catch(() => undefined);
        attempts.push(`${code}=${String(calls)}`);
      }

      // The four codes in `RETRYABLE_ERROR_CODES` are retried; ENETDOWN is retried only
      // because the UNKNOWN classification is marked retryable, not by the code list.
      expect(attempts).toEqual(['ECONNRESET=3', 'ETIMEDOUT=3', 'ENOTFOUND=3', 'ECONNREFUSED=3', 'ENETDOWN=3']);
    });
  });

  describe('a total outage through the real composition', () => {
    test('one call burns the whole retry budget and rethrows the classified error', async () => {
      let attempts = 0;
      const client = makeClient(async () => {
        attempts++;
        throw Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:443'), { code: 'ECONNREFUSED' });
      }, false);

      const error = asError(await client.getQuote('AAPL').then(() => null, (e: unknown) => e));

      expect(attempts).toBe(retryConfig.maxRetries + 1);
      expect(error.code).toBe(YF_ERR_NETWORK);
      expect(error.isRetryable).toBe(true);
    });

    test('the outage trips the breaker and later calls fail without touching the network', async () => {
      let attempts = 0;
      const client = makeClient(async () => {
        attempts++;
        throw Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:443'), { code: 'ECONNREFUSED' });
      }, false);

      await client.getQuote('AAPL').catch(() => undefined);
      await client.getQuote('MSFT').catch(() => undefined);
      const attemptsWhileOpen = attempts;
      await client.getQuote('GOOGL').catch(() => undefined);

      expect((client.circuitBreaker as never as CircuitBreaker).getState()).toBe('OPEN');
      expect(attempts).toBe(attemptsWhileOpen);
    });

    test('a cached quote is served through the outage with one degradation warning', async () => {
      let outage = false;
      const client = makeClient(async () => {
        if (outage) throw Object.assign(new Error('socket network is unreachable'), { code: 'ENETUNREACH' });
        return { symbol: 'AAPL', regularMarketPrice: 185.92, regularMarketVolume: 44981879 };
      }, true);

      const fresh = await client.getQuote('AAPL');
      outage = true;
      const served = await client.getQuote('AAPL', { forceRefresh: true });

      expect(served.price.regularMarketPrice).toBe(fresh.price.regularMarketPrice);
      const warnings = client.getWarnings() as Array<{ message: string }>;
      expect(warnings).toHaveLength(1);
      expect(warnings[0].message).toContain('Using cached data due to: Network error');
    });

    test('with no cache and no network the caller gets an error envelope, not a hang', async () => {
      const client = makeClient(async () => { throw Object.assign(new Error('write ENETDOWN'), { code: 'ENETDOWN' }); }, true);
      const error = asError(await client.getQuote('ZZZZ', { forceRefresh: true }).then(() => null, (e: unknown) => e));

      expect(error.code).toBe(YF_ERR_UNKNOWN);
      expect(error.suggestedAction).toContain('Review error details');
    });
  });

  describe('the fallback paths a real outage would need', () => {
    test('no data call ever reaches the raw fetch path, though the path itself works', async () => {
      const fetchSpy = jest.fn(async (): Promise<never> => { throw new Error('alternative endpoint unreachable'); });
      const originalFetch = global.fetch;
      global.fetch = fetchSpy as unknown as typeof fetch;

      try {
        const client = makeClient(async () => {
          throw Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:443'), { code: 'ECONNREFUSED' });
        }, false);
        await client.getQuote('AAPL').catch(() => undefined);

        // `tryAlternativeEndpoint` is the only raw `fetch()` in `src/` and nothing calls it,
        // so an outage has exactly one path: fail, retry, then the breaker.
        expect(fetchSpy).toHaveBeenCalledTimes(0);

        const fallback = await client.tryAlternativeEndpoint('AAPL', 'quote');
        expect(fallback).toBeNull();
        expect(fetchSpy.mock.calls.length).toBeGreaterThan(0);
      } finally {
        global.fetch = originalFetch;
      }
    });

    test('network and yahooFinance config knobs do not change the failure mode', async () => {
      let attempts = 0;
      const client = makeClient(async () => {
        attempts++;
        throw Object.assign(new Error('getaddrinfo ENOTFOUND query1.finance.yahoo.com'), { code: 'ENOTFOUND' });
      }, false);

      client.config = {
        ...(client.config as Record<string, unknown>),
        network: { timeoutMs: 1, maxRetries: 0, maxRedirects: 0, followRedirects: false },
        yahooFinance: { baseUrl: 'https://proxy.invalid', timeoutMs: 1 }
      };

      const error = asError(await client.getQuote('AAPL').then(() => null, (e: unknown) => e));

      expect(attempts).toBe(retryConfig.maxRetries + 1);
      expect(error.code).toBe(YF_ERR_NETWORK);
    });
  });

  describe('spawned server handshake is independent of upstream reachability', () => {
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

    test('initialize negotiates the protocol and advertises tools, resources and prompts', async () => {
      const response = await sendMCPRequest(createMCPRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {}, resources: {}, prompts: {} },
        clientInfo: { name: 'chaos-network-failures', version: '1.0.0' }
      }, 1));

      expect(response.error).toBeUndefined();
      const result = response.result as {
        protocolVersion: string;
        serverInfo: { name: string; version: string };
        capabilities: Record<string, unknown>;
      };
      expect(result.protocolVersion).toBe('2024-11-05');
      expect(result.serverInfo.version).toMatch(/^\d+\.\d+\.\d+/);
      expect(Object.keys(result.capabilities).sort()).toEqual(['prompts', 'resources', 'tools']);

      serverProcess?.stdin?.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);

      const unknownTool = await sendMCPRequest(createMCPRequest('tools/call', { name: 'no_such_tool', arguments: {} }, 2));
      const toolResult = unknownTool.result as { isError: boolean; content: Array<{ text: string }> };
      expect(toolResult.isError).toBe(true);
      expect(toolResult.content[0].text).toContain('Unknown tool');
    });
  });
});
