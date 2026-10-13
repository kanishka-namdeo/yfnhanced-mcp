// Determinism notes: same seam as tests/unit/services/yahoo-finance-endpoints.test.ts — the shared
// `yahooFinance` singleton's methods are replaced with jest fakes and restored in afterAll, the clock
// is pinned with fake timers, retry runs with maxRetries: 0 so no backoff sleep is scheduled, and the
// breaker threshold is set beyond any failure count a test can produce. No network, no wall clock.
//
// Scope of this file: the resilience paths that the endpoint suite cannot reach —
// executeWithGracefulDegradation (cache-first combine + fallback), handleCookieError, the
// rate-limiter cache adapter the client wires at :173-176, the remaining tryAlternativeEndpoint
// arms, shutdown()/warning-buffer state, and combineWithCache's drop-a-key arm.
//
// IMPORTANT: `executeWithGracefulDegradation` and `handleCookieError` are private and have NO caller
// anywhere in src/ (verified by grep), exactly like `tryAlternativeEndpoint`. They are driven directly
// through the private bracket seam so their own observable behavior is pinned; nothing here claims the
// server reaches them on a request path.

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, jest } from '@jest/globals';
import { yahooFinance, YahooFinanceClient } from '../../../src/services/yahoo-finance';
import {
  YahooFinanceError,
  YF_ERR_API_CHANGED,
  YF_ERR_DATA_UNAVAILABLE,
  type DataWarning
} from '../../../src/types/errors';

const LIB_METHODS = [
  'quote', 'chart', 'quoteSummary', 'trendingSymbols', 'screener', 'search', 'options', 'fundamentalsTimeSeries'
] as const;

type LibMethod = (typeof LIB_METHODS)[number];

const BASE_TIME = new Date('2026-04-01T00:00:00.000Z');
const seam = yahooFinance as unknown as Record<string, unknown>;
const originals = {} as Record<LibMethod, unknown>;
const lib = {} as Record<LibMethod, jest.Mock>;

function clientConfig(cacheEnabled = true, userAgent: string | null = 'TestAgent/9.9'): any {
  return {
    serverInfo: { name: 'Test Server', version: '1.0.0', protocolVersion: '1.0' },
    capabilities: {},
    transport: 'stdio',
    rateLimit: {
      strategy: 'token-bucket', maxRequests: 100000, requestsPerMinute: 100000,
      requestsPerHour: 1000000, windowMs: 60000, tokenRefillRate: 100000, burstLimit: 100000
    },
    cache: { enabled: cacheEnabled, store: 'memory', ttl: 60000, maxEntries: 1000 },
    retry: {
      enabled: true, maxRetries: 0, initialDelayMs: 1000, maxDelayMs: 10000,
      strategy: 'exponential', backoffMultiplier: 2, jitter: false,
      retryableStatusCodes: [429, 500], retryableErrorCodes: ['ECONNRESET']
    },
    circuitBreaker: {
      enabled: true, errorThresholdPercentage: 1000000, halfOpenMaxAttempts: 3,
      resetTimeoutMs: 60000, rollingCountTimeoutMs: 60000
    },
    queue: { enabled: true, maxSize: 100, strategy: 'fifo', concurrency: 5 },
    dataCompletion: { enabled: true, level: 'moderate', allowPartial: true, fallbackToCache: true },
    logging: { level: 'info', format: 'text', destination: 'console' },
    network: { timeoutMs: 30000 },
    yahooFinance: {
      baseUrl: 'https://query1.finance.yahoo.com', timeoutMs: 30000, userAgent: userAgent ?? undefined,
      maxConcurrentRequests: 5, requestQueueSize: 100, validateResponses: true, strictMode: false
    }
  };
}

// The library `quote` payload is FLAT; validateQuote maps it onto { price, meta }.
function rawQuote(symbol: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    symbol,
    shortName: 'Apple',
    longName: 'Apple Inc.',
    currency: 'USD',
    marketState: 'REGULAR',
    quoteType: 'EQUITY',
    exchange: 'NMS',
    exchangeTimezoneName: 'America/New_York',
    regularMarketPrice: 195.45,
    regularMarketChange: 2.31,
    regularMarketChangePercent: 1.197,
    regularMarketPreviousClose: 193.14,
    regularMarketVolume: 54000000,
    ...overrides
  };
}

// A payload validateDataQuality considers complete at this layer: symbol, meta and a price object
// carrying the three fields it inspects.
function completePayload(symbol = 'AAPL'): Record<string, unknown> {
  return {
    symbol,
    meta: { currency: 'USD' },
    price: { regularMarketPrice: 195.45, regularMarketChange: 2.31, regularMarketVolume: 54000000 }
  };
}

function degrade(client: YahooFinanceClient, cacheKey: string, fn: () => Promise<any>, options?: any): Promise<any> {
  return (client as any)['executeWithGracefulDegradation'](cacheKey, fn, options) as Promise<any>;
}

function cookieError(hints: unknown): YahooFinanceError {
  return new YahooFinanceError(
    'Cookie/session error', YF_ERR_API_CHANGED, null, false, false, { hints }, 'refresh the session'
  );
}

// The degradation and cookie paths end in a floating `.then`, so the microtask queue must be drained
// before their warnings are readable. Fake timers never block microtasks.
async function flushMicrotasks(): Promise<void> {
  for (let tick = 0; tick < 5; tick++) {
    await Promise.resolve();
  }
}

function mockResponse(body: unknown, init: { status?: number; setCookie?: string | null } = {}): Response {
  const status = init.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    headers: {
      get: (name: string): string | null =>
        name.toLowerCase() === 'set-cookie' ? (init.setCookie ?? null) : null
    }
  } as unknown as Response;
}

async function cacheKeys(client: YahooFinanceClient): Promise<string[]> {
  return (client as any)['cache'].keys() as Promise<string[]>;
}

describe('YahooFinanceClient degradation, cookie and lifecycle branches (stubbed yahooFinance seam, no network)', () => {
  let client: YahooFinanceClient;
  let fetchSpy: jest.SpyInstance;

  beforeAll(() => {
    for (const method of LIB_METHODS) {
      originals[method] = seam[method];
      if (typeof originals[method] !== 'function') {
        throw new Error(`yahooFinance.${method} is not a function - the seam moved.`);
      }
    }
  });

  afterAll(() => {
    for (const method of LIB_METHODS) {
      Object.defineProperty(seam, method, { value: originals[method], configurable: true, writable: true });
    }
  });

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(BASE_TIME);

    for (const method of LIB_METHODS) {
      lib[method] = jest.fn(async () => ({}));
      Object.defineProperty(seam, method, { value: lib[method], configurable: true, writable: true });
    }
    lib.quote.mockImplementation(async (symbol: unknown) => rawQuote(String(symbol)));
    fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse({ chart: { error: null } }));

    client = new YahooFinanceClient(clientConfig());
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    jest.useRealTimers();
  });

  describe('executeWithGracefulDegradation: cache-first combine (no caller in src/)', () => {
    it('a clean live result is cached, reported whole, and yields no warnings', async () => {
      const result = await degrade(client, 'quote:AAPL', async () => completePayload());

      expect(result).toEqual({ data: completePayload(), warnings: [], isPartial: false, hasData: true });
      expect(await cacheKeys(client)).toEqual(['quote:AAPL']);
      // the degradation buffer is separate from the client's own warning buffer
      expect(client.getWarnings()).toEqual([]);
    });

    it('a live result carrying holes is reported partial with the data-quality warnings attached', async () => {
      const result = await degrade(client, 'quote:MSFT', async () => ({ price: { regularMarketPrice: 1 } }));

      expect(result.hasData).toBe(true);
      expect(result.isPartial).toBe(true);
      expect(result.warnings.map((w: DataWarning) => w.field)).toEqual([
        'symbol', 'meta', 'price.regularMarketChange', 'price.regularMarketVolume'
      ]);
      expect(result.warnings.every((w: DataWarning) => w.timestamp instanceof Date)).toBe(true);
    });

    it('a live null is never written to the cache and reports hasData false', async () => {
      const result = await degrade(client, 'quote:GOOGL', async () => null);

      expect(result).toEqual({ data: null, warnings: [], isPartial: false, hasData: false });
      expect(await cacheKeys(client)).toEqual([]);
    });

    it('a live failure with a cached entry serves the cache, warns, and seeds the fallback cache', async () => {
      const cached = completePayload('AMZN');
      await (client as any)['cache'].set('quote:AMZN', cached);

      const result = await degrade(client, 'quote:AMZN', async () => {
        throw new Error('boom');
      });

      expect(result.data).toBe(cached);
      expect(result).toMatchObject({ isPartial: true, hasData: true });
      expect(result.warnings).toEqual([
        expect.objectContaining({
          field: 'data',
          severity: 'warning',
          message: 'Failed to fetch fresh data: Unknown error. Returning cached data.'
        })
      ]);
      expect((client as any)['fallbackCache'].get('fallback:quote:AMZN')).toBe(cached);
    });

    it('forceRefresh skips the cached read, so a cached value cannot rescue the failure', async () => {
      await (client as any)['cache'].set('quote:META', completePayload('META'));

      await expect(degrade(client, 'quote:META', async () => {
        throw new Error('boom');
      }, { forceRefresh: true })).rejects.toMatchObject({ code: 'YF_ERR_UNKNOWN', message: 'Unknown error' });

      // nothing was seeded, because the cached read never happened
      expect((client as any)['fallbackCache'].size).toBe(0);
    });

    it('useCache:false reads and writes nothing, so a failure has neither cache nor fallback', async () => {
      await expect(degrade(client, 'quote:NFLX', async () => {
        throw new YahooFinanceError('gone', YF_ERR_DATA_UNAVAILABLE, null, false, false, {}, 'no action');
      }, { useCache: false })).rejects.toBeInstanceOf(YahooFinanceError);

      expect(await cacheKeys(client)).toEqual([]);
    });

    it('a client whose cache is disabled in config degrades the same way', async () => {
      const disabled = new YahooFinanceClient(clientConfig(false));

      await expect(degrade(disabled, 'quote:AAPL', async () => {
        throw new Error('boom');
      })).rejects.toMatchObject({ code: 'YF_ERR_UNKNOWN' });
    });

    it('with no cached entry a seeded fallbackCache entry is served instead', async () => {
      (client as any)['fallbackCache'].set('fallback:quote:KO', { symbol: 'KO', price: { regularMarketPrice: 60 } });

      const result = await degrade(client, 'quote:KO', async () => {
        throw new Error('boom');
      });

      expect(result.data).toEqual({ symbol: 'KO', price: { regularMarketPrice: 60 } });
      expect(result.warnings).toEqual([
        expect.objectContaining({ message: 'Failed to fetch data: Unknown error. Returning fallback data.' })
      ]);
      expect(result).toMatchObject({ isPartial: true, hasData: true });
    });

    it('a cache read that throws during the pre-fetch is swallowed and the live value still returns', async () => {
      const getSpy = jest.spyOn((client as any)['cache'], 'get').mockRejectedValueOnce(new Error('cache down'));

      const result = await degrade(client, 'quote:PEP', async () => completePayload('PEP'));

      expect(getSpy).toHaveBeenCalledWith('quote:PEP');
      expect(result.hasData).toBe(true);
      expect(result.data).toEqual(completePayload('PEP'));
      getSpy.mockRestore();
    });

    it('the fallback the degradation path writes is the one executeWithMiddleware can later read', async () => {
      const cached = completePayload('ADV');
      await (client as any)['cache'].set('quote:ADV', cached);
      await degrade(client, 'quote:ADV', async () => {
        throw new Error('boom');
      });

      lib.quote.mockRejectedValue(new Error('still down'));
      const served = await client.getQuote('ADV', { forceRefresh: true });

      expect(served).toEqual(cached);
      expect(client.getWarnings()).toEqual([
        expect.objectContaining({ field: 'quote:ADV', message: 'Using fallback data due to: Unknown error' })
      ]);
    });
  });

  describe('validateDataQuality branch on the price shape', () => {
    it('a price that is not an object is skipped rather than probed, but a null price is still critical', () => {
      expect((client as any)['validateDataQuality'](completePayload())).toEqual([]);
      // 42 is neither null nor an object: no critical hit, no nested probe.
      expect((client as any)['validateDataQuality']({ symbol: 'AAPL', meta: {}, price: 42 })).toEqual([]);
      // null falls into the criticalFields loop instead.
      expect((client as any)['validateDataQuality']({ symbol: 'AAPL', meta: {}, price: null })).toEqual([
        expect.objectContaining({ field: 'price', severity: 'warning', message: "Critical field 'price' is missing or null" })
      ]);
    });

    it('a price object of nulls reports every inspected price field as missing', () => {
      const warnings = (client as any)['validateDataQuality']({ symbol: 'AAPL', meta: {}, price: {} });
      expect(warnings.map((w: DataWarning) => w.field)).toEqual([
        'price.regularMarketPrice', 'price.regularMarketChange', 'price.regularMarketVolume'
      ]);
    });
  });

  describe('handleCookieError (no caller in src/)', () => {
    it('DEFECT PIN: hint matching is case-sensitive, so the csrf and session warnings the classifier should trigger never fire', async () => {
      await (client as any)['cache'].set('quote:AAPL', completePayload());

      // These are exactly the strings src/utils/error-classifier.ts getCookieErrorHints() produces.
      // `h.includes('csrf')` and `h.includes('session')` are case-sensitive, so only the crumb
      // warning is produced; the buffered value adds its own info warning.
      (client as any)['handleCookieError'](
        cookieError([
          'Cookie crumb token may be expired',
          'CSRF token validation failed',
          'Session may have expired'
        ]),
        'quote:AAPL'
      );
      await flushMicrotasks();

      expect(client.getWarnings().map((w: DataWarning) => w.field)).toEqual(['cookie.crumb', 'cookie']);
    });

    it('lower-cased hints do fire all three token warnings plus the cached-data one', async () => {
      await (client as any)['cache'].set('quote:MSFT', completePayload('MSFT'));

      (client as any)['handleCookieError'](cookieError(['crumb gone', 'csrf rejected', 'session aged out']), 'quote:MSFT');
      await flushMicrotasks();

      expect(client.getWarnings()).toEqual([
        expect.objectContaining({ field: 'cookie.crumb', severity: 'warning', message: 'Cookie crumb token expired or invalid. Session may need refresh.' }),
        expect.objectContaining({ field: 'cookie.csrf', severity: 'warning', message: 'CSRF token validation failed. Request may need to be retried with new session.' }),
        expect.objectContaining({ field: 'cookie.session', severity: 'warning', message: 'Session expired. Attempting to use cached data or retry with fresh session.' }),
        expect.objectContaining({ field: 'cookie', severity: 'info', message: 'Using cached data while cookie session is being refreshed' })
      ]);
      expect((client as any)['fallbackCache'].get('fallback:quote:MSFT')).toEqual(completePayload('MSFT'));
    });

    it('non-array hints degrade to no hints, so only the cached-data warning is emitted', async () => {
      await (client as any)['cache'].set('quote:MSFT', completePayload('MSFT'));

      (client as any)['handleCookieError'](cookieError('crumb csrf session (a string, not an array)'), 'quote:MSFT');
      await flushMicrotasks();

      expect(client.getWarnings()).toEqual([
        expect.objectContaining({ field: 'cookie', severity: 'info' })
      ]);
    });

    it('hints that name none of the tokens, with a cache miss, emit nothing and seed nothing', async () => {
      (client as any)['handleCookieError'](cookieError(['totally unrelated', 42]), 'quote:GOOGL');
      await flushMicrotasks();

      expect(client.getWarnings()).toEqual([]);
      expect((client as any)['fallbackCache'].size).toBe(0);
    });

    it('a missing context object is treated as no hints at all', async () => {
      (client as any)['handleCookieError'](
        new YahooFinanceError('cookie broke', YF_ERR_API_CHANGED, null, false, false, {}, 'no action'),
        'quote:AMZN'
      );
      await flushMicrotasks();

      expect(client.getWarnings()).toEqual([]);
    });

    it('a cache read that rejects is swallowed by the empty catch', async () => {
      const getSpy = jest.spyOn((client as any)['cache'], 'get').mockRejectedValueOnce(new Error('cache down'));

      (client as any)['handleCookieError'](cookieError(['crumb']), 'quote:TSLA');
      await flushMicrotasks();

      expect(getSpy).toHaveBeenCalledWith('quote:TSLA');
      expect(client.getWarnings().map((w: DataWarning) => w.field)).toEqual(['cookie.crumb']);
      getSpy.mockRestore();
    });
  });

  describe('the cache adapter the client hands to the rate limiter', () => {
    it('the wired adapter delegates both halves to the client cache, but the limiter only ever reads it', async () => {
      const adapter = (client as any)['rateLimiter'].cache;

      await adapter.set('rate_limited_quote:TSLA', completePayload('TSLA'), 60000);
      expect(await adapter.get('rate_limited_quote:TSLA')).toEqual(completePayload('TSLA'));

      // DEFECT PIN: RateLimiter never calls the `set` half of this adapter, so the
      // `rate_limited_<key>` entries its 429 rescue reads are never written by anything in src/.
      lib.quote.mockRejectedValue(new Error('rate limit exceeded'));
      await expect(client.getQuote('RIVN')).rejects.toMatchObject({ code: 'YF_ERR_RATE_LIMIT' });
      expect(await cacheKeys(client)).toEqual(['rate_limited_quote:TSLA']);
    });

    it('DEFECT PIN: a classified rate-limit is NOT rescued, because the classifier rewrites the message', async () => {
      const rescued = completePayload('MC');
      await (client as any)['cache'].set('rate_limited_quote:MC', rescued);
      lib.quote.mockRejectedValue(new Error('rate limit exceeded'));

      // The limiter's rescue tests `error.message.includes('429') || includes('rate limit')`, but by
      // the time the error reaches it the classifier has replaced the message with 'Rate limit
      // exceeded' — capital R, no 429 — so the seeded entry is never served.
      await expect(client.getQuote('MC')).rejects.toMatchObject({
        code: 'YF_ERR_RATE_LIMIT',
        message: 'Rate limit exceeded',
        isRateLimit: true
      });
    });

    it('an error that still carries "429" in its own message is rescued from the rate_limited_ entry', async () => {
      const rescued = completePayload('SPY');
      await (client as any)['cache'].set('rate_limited_quote:SPY', rescued);
      lib.quote.mockRejectedValue(
        new YahooFinanceError('upstream 429', 'YF_ERR_RATE_LIMIT', 429, true, true, {}, 'wait')
      );

      const served = await client.getQuote('SPY');

      expect(served).toBe(rescued);
      expect(client.getWarnings()).toEqual([]);
    });

    it('DEFECT PIN: a bare "429" is reclassified as Unknown error, so the limiter never recognises it', async () => {
      await (client as any)['cache'].set('rate_limited_quote:COIN', completePayload('COIN'));
      lib.quote.mockRejectedValue(new Error('HTTP 429 from Yahoo'));

      // classifyError() rewrites the message before the limiter's `includes('429')` test can see it,
      // so the cached rescue is skipped and the caller gets an unknown-error rejection.
      await expect(client.getQuote('COIN')).rejects.toMatchObject({
        code: 'YF_ERR_UNKNOWN',
        message: 'Unknown error'
      });
    });
  });

  describe('tryAlternativeEndpoint arms the existing suite leaves open (dead path, driven directly)', () => {
    it('a 500 response is neither a cookie failure nor a success: no warning, null after the list', async () => {
      fetchSpy.mockResolvedValueOnce(mockResponse({ notes: 'unavailable' }, { status: 500 }));

      expect(await (client as any)['tryAlternativeEndpoint']('AAPL', 'quote')).toBeNull();
      expect(client.getWarnings()).toEqual([]);
    });

    it('a rejection that is not an Error is stringified before the cookie test', async () => {
      fetchSpy.mockRejectedValueOnce('cookie jar is corrupt');

      expect(await (client as any)['tryAlternativeEndpoint']('AAPL', 'quote')).toBeNull();
      expect(client.getWarnings()).toEqual([
        expect.objectContaining({ field: 'cookie', severity: 'warning', message: expect.stringContaining('cookie jar is corrupt') })
      ]);
    });

    it('a plain non-cookie Error message is retried-through without any warning', async () => {
      fetchSpy.mockRejectedValueOnce(new Error('ECONNRESET by peer'));

      expect(await (client as any)['tryAlternativeEndpoint']('AAPL', 'historical')).toBeNull();
      expect(client.getWarnings()).toEqual([]);
    });

    it('an absent configured user agent falls back to Mozilla/5.0 on the dead path', async () => {
      const bare = new YahooFinanceClient(clientConfig(true, null));
      fetchSpy.mockResolvedValueOnce(mockResponse({ chart: { result: [] } }));

      await (bare as any)['tryAlternativeEndpoint']('AAPL', 'quote');

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://query1.finance.yahoo.com/v8/finance/chart/AAPL',
        expect.objectContaining({ headers: expect.objectContaining({ 'User-Agent': 'Mozilla/5.0' }) })
      );
    });
  });

  describe('combineWithCache arms the existing suite leaves open', () => {
    it('a live null never overwrites, but a cached null survives through the initial spread', () => {
      const merged = (client as any)['combineWithCache'](
        { price: null, volume: null, kept: 1 },
        { price: null }
      ) as Record<string, unknown>;

      expect(merged).toEqual({ price: null, kept: 1 });
      expect(merged).not.toHaveProperty('volume');
    });

    it('a live string and a cached string still collapse to the live side', () => {
      expect((client as any)['combineWithCache']('live', null)).toBe('live');
      expect((client as any)['combineWithCache'](null, 'cached')).toBe('cached');
    });
  });

  describe('the module-level logger handed to yahoo-finance2', () => {
    it('routes every level to console.error so no library log line can reach the stdout MCP channel', () => {
      const logger = (yahooFinance as any)._opts?.logger as
        | Record<'info' | 'warn' | 'error' | 'debug' | 'dir', (...args: unknown[]) => void>
        | undefined;
      if (logger === undefined) {
        throw new Error('yahooFinance._opts.logger is gone — the stderr-steering seam moved.');
      }

      expect(Object.keys(logger).sort()).toEqual(['debug', 'dir', 'error', 'info', 'warn']);

      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const infoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      logger.info('quote notice', 1);
      logger.warn('deprecated historical()');
      logger.error('crumb rejected');
      logger.debug('request body');
      logger.dir({ store: 'memory' });

      expect(errorSpy).toHaveBeenCalledTimes(5);
      expect(errorSpy).toHaveBeenNthCalledWith(1, 'quote notice', 1);
      expect(logSpy).not.toHaveBeenCalled();
      expect(infoSpy).not.toHaveBeenCalled();
      expect(warnSpy).not.toHaveBeenCalled();

      errorSpy.mockRestore();
      logSpy.mockRestore();
      infoSpy.mockRestore();
      warnSpy.mockRestore();
    });
  });

  describe('shutdown and lifecycle state', () => {
    it('shutdown resets the breaker counts, the warning buffer, the fallback map and initialization', async () => {
      await client.initialize();
      lib.quote.mockRejectedValue(new Error('boom'));
      // NFLX rather than AAPL: initialize() already cached quote:AAPL/MSFT/GOOGL, so those would
      // be served by the cache pre-check and never reach the failure path.
      await expect(client.getQuote('NFLX')).rejects.toBeInstanceOf(YahooFinanceError);
      (client as any)['fallbackCache'].set('fallback:x', 1);
      await (client as any)['cache'].set('quote:KEEP', completePayload('KEEP'));

      await client.shutdown();

      expect(client.isInitialized()).toBe(false);
      expect(client.getWarnings()).toEqual([]);
      expect((client as any)['fallbackCache'].size).toBe(0);
      expect(await cacheKeys(client)).toEqual([]);
      expect(client.getStats().circuitBreaker).toEqual({ state: 'CLOSED', failureCount: 0, successCount: 0 });
      expect(client.getStats().warnings).toEqual([]);
      expect(client.getStats().rateLimiter.totalRequests).toBe(0);
    });

    it('the stats view exposes the live warning buffer without draining it', () => {
      fetchSpy.mockResolvedValueOnce(mockResponse({}, { status: 401 }));
      return (client as any)['tryAlternativeEndpoint']('AAPL', 'quote').then(async () => {
        const buffered = client.getStats().warnings;
        expect(buffered).toHaveLength(1);
        expect(client.getStats().warnings).toHaveLength(1);
        expect(client.getWarnings()).toHaveLength(1);
        expect(client.getStats().warnings).toHaveLength(0);
      });
    });

    it('a getQuote failure that classifies as symbol-not-found is not retried and stays non-retryable', async () => {
      lib.quote.mockRejectedValue(new Error('No data found for symbol ZZZ'));

      await expect(client.getQuote('ZZZ')).rejects.toMatchObject({
        code: 'YF_ERR_SYMBOL_NOT_FOUND',
        statusCode: 404,
        isRetryable: false
      });
      expect(lib.quote).toHaveBeenCalledTimes(1);
    });
  });
});
