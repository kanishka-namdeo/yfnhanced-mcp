// Determinism notes: this suite used to reach the live Yahoo API from two places — initialize()
// warming quote:AAPL/MSFT/GOOGL through the real yahoo-finance2 singleton (:185-194), and
// tryAlternativeEndpoint() calling global fetch (:1352). Both are now stubbed, so nothing here
// depends on the network or on elapsed wall-clock time; the clock is pinned with fake timers and
// only YahooFinanceClient (never a mock of it) is under test.
//
// Symbols the old suite used that do not exist: client.warmCache (jest.spyOn threw
// "Property warmCache does not exist"). initialize()'s guard returns early on `initialized`
// (:181), so the reinitialize assertion is pinned on cache.warm and on the library call count.
// validateQuote was also fed a {price:{...}} object while the real input is the FLAT raw quote
// the library returns, and validateHistorical was fed `timestamp` while detectAPIChanges
// requires the plural `timestamps` (:1316) — so that input made it throw API_CHANGED.

import { YahooFinanceClient } from '../../../src/services/yahoo-finance';
import { YahooFinanceError, YF_ERR_DATA_INCOMPLETE } from '../../../src/types/errors';

jest.mock('yahoo-finance2', () => {
  const instance = {
    quote: jest.fn(),
    chart: jest.fn(),
    quoteSummary: jest.fn(),
    trendingSymbols: jest.fn(),
    screener: jest.fn(),
    search: jest.fn(),
    options: jest.fn()
  };
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => instance),
    __instance: instance
  };
});

const lib = (jest.requireMock('yahoo-finance2') as {
  __instance: Record<'quote' | 'chart' | 'quoteSummary' | 'trendingSymbols' | 'screener' | 'search' | 'options', jest.Mock>;
}).__instance;

const BASE_TIME = new Date('2026-01-01T00:00:00.000Z');

function testConfig(): any {
  return {
    serverInfo: { name: 'Test Server', version: '1.0.0', protocolVersion: '1.0' },
    capabilities: {},
    transport: 'stdio',
    rateLimit: { strategy: 'token-bucket', maxRequests: 10, windowMs: 60000, tokenRefillRate: 1 },
    cache: { enabled: true, store: 'memory', ttl: 60000, maxEntries: 100 },
    retry: {
      enabled: true, maxRetries: 3, initialDelayMs: 1000, maxDelayMs: 10000,
      strategy: 'exponential', backoffMultiplier: 2, jitter: false,
      retryableStatusCodes: [429, 500], retryableErrorCodes: ['ECONNRESET']
    },
    circuitBreaker: {
      enabled: true, timeoutMs: 60000, errorThresholdPercentage: 5, resetTimeoutMs: 60000,
      rollingCountBuckets: 60, rollingCountTimeoutMs: 60000, volumeThreshold: 5, halfOpenMaxAttempts: 3
    },
    queue: { enabled: true, maxSize: 100, strategy: 'fifo', concurrency: 5, timeoutMs: 30000, processingTimeoutMs: 60000 },
    dataCompletion: { enabled: true, level: 'moderate', requiredFields: [], preferredFields: [], allowPartial: true, fallbackToCache: true },
    logging: { level: 'info', format: 'text', destination: 'console' },
    network: { timeoutMs: 30000, keepAlive: true, keepAliveMsecs: 1000, maxSockets: 10, maxFreeSockets: 5, scheduling: 'fifo', maxRedirects: 5, followRedirects: true },
    yahooFinance: {
      baseUrl: 'https://query1.finance.yahoo.com', timeoutMs: 30000, userAgent: 'Mozilla/5.0',
      maxConcurrentRequests: 5, requestQueueSize: 100, validateResponses: true, strictMode: false
    }
  };
}

// A library `quote` payload is FLAT (RawQuote); validateQuote maps it onto { price, meta }.
function rawQuote(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    symbol: 'AAPL',
    longName: 'Apple Inc.',
    shortName: 'Apple',
    currency: 'USD',
    marketState: 'REGULAR',
    quoteType: 'EQUITY',
    exchange: 'NMS',
    exchangeTimezoneName: 'America/New_York',
    regularMarketPrice: 150.5,
    regularMarketChange: 2.5,
    regularMarketChangePercent: 1.69,
    regularMarketPreviousClose: 148,
    regularMarketVolume: 50000000,
    ...overrides
  };
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

describe('YahooFinanceClient', () => {
  let client: YahooFinanceClient;
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(BASE_TIME);
    for (const method of Object.keys(lib) as Array<keyof typeof lib>) {
      lib[method].mockReset();
    }
    lib.quote.mockImplementation(async (symbol: string) => rawQuote({ symbol }));
    fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse({ chart: { result: [] } }));
    client = new YahooFinanceClient(testConfig());
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    jest.useRealTimers();
  });

  test('should initialize with config', () => {
    expect(client).toBeInstanceOf(YahooFinanceClient);
    expect(client.isInitialized()).toBe(false);
  });

  test('initialize warms the three documented quote keys through the library', async () => {
    await client.initialize();

    expect(client.isInitialized()).toBe(true);
    expect(lib.quote).toHaveBeenCalledTimes(3);
    expect(lib.quote).toHaveBeenNthCalledWith(1, 'AAPL');
    expect(lib.quote).toHaveBeenNthCalledWith(2, 'MSFT');
    expect(lib.quote).toHaveBeenNthCalledWith(3, 'GOOGL');
    // the warm write stores the MAPPED shape, not the raw library object
    expect(await client['cache'].get('quote:AAPL')).toMatchObject({ price: { symbol: 'AAPL' } });
  });

  test('should not reinitialize if already initialized', async () => {
    await client.initialize();
    const callsAfterFirst = lib.quote.mock.calls.length;
    const warmSpy = jest.spyOn(client['cache'], 'warm');

    await client.initialize();

    expect(warmSpy).not.toHaveBeenCalled(); // the guard is `if (this.initialized) return` (:181)
    expect(lib.quote).toHaveBeenCalledTimes(callsAfterFirst);
  });

  test('a warm failure is swallowed by the empty catch and initialize still completes', async () => {
    lib.quote.mockRejectedValue(new Error('network down'));
    await client.initialize();
    expect(client.isInitialized()).toBe(true);
    expect(await client['cache'].get('quote:AAPL')).toBeNull();
  });

  test('should shutdown successfully', async () => {
    await client.initialize();
    await client.shutdown();

    expect(client.isInitialized()).toBe(false);
    expect(client['fallbackCache'].size).toBe(0);
    expect(client.getWarnings()).toEqual([]);
    expect(client['cache'].getStats().entries).toBe(0);
  });

  describe('validateQuote', () => {
    test('maps the flat raw quote onto price + meta', () => {
      const result = client['validateQuote'](rawQuote({
        typeDisp: 'Equity',
        fullExchangeName: 'NasdaqGS',
        regularMarketTime: new Date('2026-01-02T21:00:00.000Z'),
        firstTradeDateMilliseconds: 256510800000,
        priceHint: 2,
        chartPreviousClose: 148
      }));

      expect(result.price.regularMarketPrice).toBe(150.5);
      expect(result.price.longName).toBe('Apple Inc.');
      expect(result.meta.symbol).toBe('AAPL');
      expect(result.meta.exchangeName).toBe('NasdaqGS');
      expect(result.meta.instrumentType).toBe('Equity');
      expect(result.meta.regularMarketTime).toBe(new Date('2026-01-02T21:00:00.000Z').getTime());
      expect(result.meta.priceHint).toBe(2);
    });

    test('instrumentType falls back to quoteType when typeDisp is absent', () => {
      const result = client['validateQuote'](rawQuote());
      expect(result.meta.instrumentType).toBe('EQUITY');
    });

    test('Date fields become ISO strings and epoch ms, never Date objects', () => {
      const result = client['validateQuote'](rawQuote({
        dividendDate: new Date('2026-01-05T00:00:00.000Z'),
        preMarketTime: new Date('2026-01-05T09:00:00.000Z'),
        postMarketTime: undefined
      }));

      expect(result.price.exDividendDate).toBe('2026-01-05T00:00:00.000Z');
      expect(result.price.preMarketTime).toBe(new Date('2026-01-05T09:00:00.000Z').getTime());
      expect(result.price.postMarketTime).toBeNull();
    });

    test('NaN numerics normalize to null exactly like absent ones', () => {
      const result = client['validateQuote'](rawQuote({ trailingPE: NaN, beta: 1.2 }));
      expect(result.price.trailingPE).toBeNull();
      expect(result.price.beta).toBe(1.2);
    });

    test('missing critical fields produce warning-severity entries on the returned quote', () => {
      const result = client['validateQuote'](rawQuote({ regularMarketVolume: undefined }));
      const warnings = result.warnings ?? [];
      const critical = warnings.filter((warning) => warning.severity === 'warning');

      expect(result.price.regularMarketVolume).toBeNull();
      expect(critical.map((warning) => warning.field)).toEqual(
        expect.arrayContaining(['price.regularMarketVolume'])
      );
      expect(warnings[0].timestamp).toBeInstanceOf(Date);
    });

    test('absent preferred fields are info-severity, and a missing symbol is a warning', () => {
      const result = client['validateQuote'](rawQuote({ symbol: undefined }));
      const fields = (result.warnings ?? []).map((warning) => warning.field);

      expect(result.price.symbol).toBe('');
      expect(fields).toContain('symbol');
      expect(fields).toContain('price.marketCap'); // preferred → severity info
      expect((result.warnings ?? []).find((w) => w.field === 'price.marketCap')?.severity).toBe('info');
      expect((result.warnings ?? []).find((w) => w.field === 'symbol')?.severity).toBe('warning');
    });

    test('a fully populated quote carries no warnings key at all', () => {
      const complete = rawQuote({
        regularMarketOpen: 149, regularMarketDayHigh: 151, regularMarketDayLow: 148.5,
        marketCap: 2500000000000, fiftyTwoWeekHigh: 199, fiftyTwoWeekLow: 125
      });
      const result = client['validateQuote'](complete);
      expect(result.warnings).toBeUndefined();
    });

    test('should throw error for invalid quote', () => {
      expect(() => client['validateQuote'](null)).toThrow(YahooFinanceError);
      expect(() => client['validateQuote']('a string')).toThrow('Invalid quote result: not an object');
    });

    test('should handle missing quote fields gracefully', () => {
      const result = client['validateQuote'](rawQuote({ regularMarketChange: null as unknown as number }));
      expect(result.price.regularMarketChange).toBeNull();
    });
  });

  describe('validateHistorical', () => {
    test('accepts a mapped chart result, which must carry meta, indicators AND timestamps', () => {
      const mockData = {
        meta: { currency: 'USD', symbol: 'AAPL' },
        indicators: { quote: [], adjclose: [] },
        timestamps: [1234567890]
      };

      const result = client['validateHistorical'](mockData);

      expect(result).toBe(mockData); // pass-through, no transform at this layer
      expect(result.meta).toBeDefined();
      expect(result.indicators).toBeDefined();
    });

    test('DEFECT: a singular `timestamp` key is read as an API change and throws', () => {
      // detectAPIChanges (:1314-1326) requires the companion `timestamps` whenever
      // `indicators` is present, so the raw chart() shape (`timestamp`) cannot pass validation.
      const rawChartShape = {
        meta: { currency: 'USD', symbol: 'AAPL' },
        indicators: { quote: [] },
        timestamp: [1234567890]
      };

      expect(client['detectAPIChanges'](rawChartShape)).toBe(true);
      expect(() => client['validateHistorical'](rawChartShape)).toThrow(
        'API structure changed for endpoint: historical'
      );
    });

    test('missing meta or indicators throws DATA_INCOMPLETE before the API-change check', () => {
      expect(() => client['validateHistorical']({ indicators: {}, timestamps: [] })).toThrow(
        'Invalid historical result: missing meta or indicators'
      );
      expect(() => client['validateHistorical']({ meta: {}, timestamps: [] })).toThrow(
        'Invalid historical result: missing meta or indicators'
      );
      try {
        client['validateHistorical']({ meta: {}, timestamps: [] });
      } catch (error) {
        expect((error as YahooFinanceError).code).toBe(YF_ERR_DATA_INCOMPLETE);
      }
    });

    test('should throw error for invalid historical data', () => {
      expect(() => client['validateHistorical'](null)).toThrow('Invalid historical result: not an object');
    });
  });

  describe('mapChartToHistorical (private)', () => {
    test('converts the object-form chart() result into the repo shape', () => {
      const mapped = client['mapChartToHistorical']({
        meta: { symbol: 'AAPL', currency: 'USD', firstTradeDate: new Date('2001-01-01T00:00:00.000Z') },
        timestamp: [1, 2],
        indicators: { quote: [{ open: [1], high: [2], low: [0.5], close: [1.5], volume: [10] }] }
      });

      expect(mapped.timestamps).toEqual([1, 2]);
      expect(mapped.meta.symbol).toBe('AAPL');
      expect(mapped.meta.firstTradeDate).toBe(new Date('2001-01-01T00:00:00.000Z').getTime());
      expect(mapped.indicators.quote[0].close).toEqual([1.5]);
      expect(mapped.indicators.adjclose).toEqual([{ adjclose: [] }]);
    });

    test('a chart result with no quote series throws DATA_INCOMPLETE', () => {
      expect(() => client['mapChartToHistorical']({ meta: {}, timestamp: [] })).toThrow(
        'Historical result contains no price series'
      );
    });
  });

  describe('the pass-through validators', () => {
    test('should validate financials data', () => {
      const mockData = { balanceSheetHistory: { quarterly: [], annual: [] }, incomeStatementHistory: {} };
      expect(client['validateFinancials'](mockData)).toBe(mockData);
    });

    test('throw error for invalid financials data', () => {
      expect(() => client['validateFinancials'](null)).toThrow('Invalid financials result: not an object');
      expect(() => client['validateFinancials']({ price: 1 })).toThrow(
        'Financial result contained no statement module'
      );
    });

    test('should validate earnings data', () => {
      const mockData = { earningsChart: { quarterly: [] }, earnings: { currentQuarterEstimate: 2.5 } };
      expect(client['validateEarnings'](mockData)).toBe(mockData);
    });

    test('should validate analysis data', () => {
      const mockData = { earningsTrend: { trend: [] }, industryTrend: { trend: [] } };
      expect(client['validateAnalysis'](mockData)).toBe(mockData);
    });

    test('should validate news data', () => {
      const mockData = { news: [{ uuid: '123', title: 'Test News', providerPublishTime: 1234567890 }] };
      expect(client['validateNews'](mockData)).toBe(mockData);
    });

    test('should validate options data', () => {
      const mockData = { optionChain: { result: [] } };
      expect(client['validateOptions'](mockData)).toBe(mockData);
    });

    test('should validate summary profile data', () => {
      const mockData = { assetProfile: { address1: 'One Apple Park Way', city: 'Cupertino', state: 'CA' } };
      expect(client['validateSummaryProfile'](mockData)).toBe(mockData);
    });

    test('should validate crypto quote data', () => {
      const mockData = { regularMarketPrice: 50000, regularMarketVolume: 1000000000 };
      expect(client['validateCryptoQuote'](mockData)).toBe(mockData);
    });

    test('should validate forex quote data', () => {
      const mockData = { regularMarketPrice: 1.08, regularMarketVolume: 1000000 };
      expect(client['validateForexQuote'](mockData)).toBe(mockData);
    });

    test('should validate trending data', () => {
      const mockData = { quotes: [{ symbol: 'AAPL', name: 'Apple Inc.' }] };
      expect(client['validateTrending'](mockData)).toBe(mockData);
    });

    test('should validate screener data', () => {
      const mockData = { finance: { result: [{ symbol: 'AAPL', name: 'Apple Inc.' }] } };
      expect(client['validateScreener'](mockData)).toBe(mockData);
    });

    test('every pass-through validator rejects non-objects with API_CHANGED', () => {
      for (const name of ['validateEarnings', 'validateAnalysis', 'validateNews', 'validateOptions',
        'validateSummaryProfile', 'validateCryptoQuote', 'validateForexQuote', 'validateTrending',
        'validateScreener'] as const) {
        expect(() => (client[name] as (value: unknown) => unknown)(null)).toThrow(YahooFinanceError);
        expect(() => (client[name] as (value: unknown) => unknown)(null)).toThrow(/not an object/);
      }
    });
  });

  describe('detectAPIChanges / handleAPIChange', () => {
    test('should detect API changes', () => {
      expect(client['detectAPIChanges']({ unexpectedField: 'value' })).toBe(true);
      expect(client['detectAPIChanges'](null)).toBe(true);
      expect(client['detectAPIChanges']('quote')).toBe(true);
    });

    test('should not detect API changes for known structure', () => {
      expect(client['detectAPIChanges']({ price: { regularMarketPrice: 150 }, meta: { currency: 'USD' } })).toBe(false);
      expect(client['detectAPIChanges']({ indicators: {}, meta: {}, timestamps: [] })).toBe(false);
    });

    test('an anchor with a missing companion counts as a change', () => {
      expect(client['detectAPIChanges']({ indicators: {} })).toBe(true);
      expect(client['detectAPIChanges']({ price: {} })).toBe(true);
    });

    test('should handle API change', () => {
      expect(() => client['handleAPIChange']('quote', { price: 150 })).toThrow(
        'API structure changed for endpoint: quote'
      );
    });

    test('DEFECT: handleAPIChange caches under api_change:* but getFallbackData reads fallback:*', () => {
      expect(() => client['handleAPIChange']('quote', { price: 150 })).toThrow(
        'API structure changed for endpoint: quote'
      );
      const writeKey = Array.from(client['fallbackCache'].keys())[0];

      expect(writeKey).toMatch(/^api_change:quote:/);
      expect(client['fallbackCache'].get(writeKey)).toEqual({ price: 150 });
      // so the recovery path can never find what handleAPIChange just stored
      expect(client['getFallbackData']('quote')).toBeNull();
    });
  });

  describe('tryAlternativeEndpoint', () => {
    test('quotes the v8 chart URL with the configured user agent and returns the JSON body', async () => {
      fetchSpy.mockResolvedValueOnce(mockResponse({ chart: { result: [{ symbol: 'AAPL' }] } }));

      const result = await client['tryAlternativeEndpoint']('AAPL', 'quote');

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://query1.finance.yahoo.com/v8/finance/chart/AAPL',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({ 'User-Agent': 'Mozilla/5.0', 'Cache-Control': 'no-cache' })
        })
      );
      expect(result).toEqual({ chart: { result: [{ symbol: 'AAPL' }] } });
    });

    test('an unknown endpoint has no registered alternative, so nothing is fetched and null is returned', async () => {
      expect(await client['tryAlternativeEndpoint']('AAPL', 'news')).toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    test('a crumb cookie in set-cookie adds an info warning without changing the payload', async () => {
      fetchSpy.mockResolvedValueOnce(mockResponse({ ok: true }, { setCookie: 'crumb=abc123' }));

      expect(await client['tryAlternativeEndpoint']('AAPL', 'quote')).toEqual({ ok: true });
      expect(client.getWarnings()).toEqual([
        expect.objectContaining({ field: 'cookie', severity: 'info', message: 'Cookie crumb updated - session refreshed' })
      ]);
    });

    test('401 records a cookie warning, moves on, and null is returned when the list is exhausted', async () => {
      fetchSpy.mockResolvedValueOnce(mockResponse({}, { status: 401 }));

      expect(await client['tryAlternativeEndpoint']('AAPL', 'historical')).toBeNull();
      expect(client.getWarnings()).toEqual([
        expect.objectContaining({
          field: 'cookie',
          severity: 'warning',
          message: expect.stringContaining('Authentication failed (401)')
        })
      ]);
    });

    test('a thrown fetch whose message mentions crumb is recorded and swallowed', async () => {
      fetchSpy.mockRejectedValueOnce(new Error('bad crumb response'));

      expect(await client['tryAlternativeEndpoint']('AAPL', 'quote')).toBeNull();
      expect(client.getWarnings()[0].message).toContain('Cookie error during alternative endpoint fetch');
    });

    test('the warning buffer is destructive: getWarnings empties it', async () => {
      fetchSpy.mockResolvedValueOnce(mockResponse({}, { status: 403 }));
      await client['tryAlternativeEndpoint']('AAPL', 'quote');

      expect(client.getWarnings()).toHaveLength(1);
      expect(client.getWarnings()).toHaveLength(0);
    });
  });

  describe('fallback and merge helpers', () => {
    test('should get fallback data', () => {
      client['fallbackCache'].set('fallback:AAPL', { price: 150 });
      expect(client['getFallbackData']('AAPL')).toEqual({ price: 150 });
    });

    test('should return null for non-existent fallback data', () => {
      expect(client['getFallbackData']('NONEXISTENT')).toBeNull();
    });

    test('should combine live and cached data', () => {
      const liveData = { price: 150, volume: null };
      const cachedData = { price: 148, volume: 50000000 };

      const result = client['combineWithCache'](liveData, cachedData) as Record<string, unknown>;
      expect(result.price).toBe(150);
      expect(result.volume).toBe(50000000);
    });

    test('combineWithCache keeps cached keys the live object does not mention at all', () => {
      const result = client['combineWithCache']({ price: 150 }, { price: 148, volume: 50000000 }) as Record<string, unknown>;
      expect(result).toEqual({ price: 150, volume: 50000000 });
    });

    test('should return live data when cache is null', () => {
      const liveData = { price: 150, volume: 50000000 };
      expect(client['combineWithCache'](liveData, null)).toBe(liveData);
    });

    test('should return cached data when live is null', () => {
      const cachedData = { price: 150, volume: 50000000 };
      expect(client['combineWithCache'](null, cachedData)).toBe(cachedData);
    });

    test('two nulls collapse to the live side, and non-objects fall through', () => {
      expect(client['combineWithCache'](null, null)).toBeNull();
      expect(client['combineWithCache']('live', 'cached')).toBe('live');
    });
  });

  describe('getStats', () => {
    test('should get stats', () => {
      const stats = client.getStats();
      expect(stats).toHaveProperty('rateLimiter');
      expect(stats).toHaveProperty('circuitBreaker');
      expect(stats).toHaveProperty('cache');
      expect(stats).toHaveProperty('warnings');
    });

    test('should get rate limiter stats', () => {
      const stats = client.getStats().rateLimiter;
      expect(stats).toHaveProperty('tokens');
      expect(stats).toHaveProperty('concurrentRequests');
      expect(stats).toHaveProperty('minuteCount');
      expect(stats).toHaveProperty('hourCount');
    });

    test('should get circuit breaker stats', () => {
      const stats = client.getStats().circuitBreaker;
      expect(stats.state).toBe('CLOSED'); // uppercase runtime state, not the lowercase config union
      expect(stats.failureCount).toBe(0);
      expect(stats.successCount).toBe(0);
    });

    test('should get cache stats', () => {
      const stats = client.getStats().cache;
      expect(stats).toHaveProperty('hits');
      expect(stats).toHaveProperty('misses');
      expect(stats).toHaveProperty('hitRate');
    });
  });

  describe('validateDataQuality (private)', () => {
    test('flags absent critical fields and nested price holes, and ignores non-objects', () => {
      const warnings = client['validateDataQuality']({ price: { regularMarketPrice: 1 } });
      const fields = warnings.map((warning) => warning.field);

      expect(fields).toEqual(expect.arrayContaining(['symbol', 'meta', 'price.regularMarketChange', 'price.regularMarketVolume']));
      expect(client['validateDataQuality']('not an object')).toEqual([]);
      expect(client['validateDataQuality'](null)).toEqual([]);
    });

    test('an object with every anchor present yields no warnings', () => {
      expect(client['validateDataQuality']({
        symbol: 'AAPL', meta: {}, price: { regularMarketPrice: 1, regularMarketChange: 1, regularMarketVolume: 1 }
      })).toEqual([]);
    });
  });
});
