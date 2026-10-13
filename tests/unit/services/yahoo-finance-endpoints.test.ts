// Determinism notes: nothing here reaches the network. The seam is the shared `yahooFinance`
// singleton exported by src/services/yahoo-finance.ts — its methods are replaced with jest fakes
// in beforeEach and restored in afterAll, exactly as tests/e2e/real-world.test.ts does.
// YahooFinanceClient, its Cache/CircuitBreaker/RateLimiter/RetryPolicy copies, the mapping code
// and the validators all run for real. The clock is pinned with fake timers (cache TTLs and the
// rate-limiter windows are Date.now-based), retry is configured with maxRetries: 0 so no backoff
// sleep is ever scheduled, and the breaker threshold is set beyond any failure count a test can
// produce, so one refused symbol cannot open the circuit for the next test.
//
// Each test builds its own client: the middleware instances are per-client (src/services/AGENTS.md),
// so a fresh client means a fresh cache and a fresh limiter — no cross-test cache hits.

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, jest } from '@jest/globals';
import { yahooFinance, YahooFinanceClient, toOptionContract } from '../../../src/services/yahoo-finance';
import {
  YahooFinanceError,
  YF_ERR_API_CHANGED,
  YF_ERR_DATA_INCOMPLETE,
  YF_ERR_PARTIAL_DATA,
  type DataWarning
} from '../../../src/types/errors';

const LIB_METHODS = [
  'quote',
  'chart',
  'quoteSummary',
  'trendingSymbols',
  'screener',
  'search',
  'options',
  'fundamentalsTimeSeries'
] as const;

type LibMethod = (typeof LIB_METHODS)[number];

const BASE_TIME = new Date('2026-03-01T00:00:00.000Z');
const seam = yahooFinance as unknown as Record<string, unknown>;
const originals = {} as Record<LibMethod, unknown>;
const lib = {} as Record<LibMethod, jest.Mock>;

// Key names are the ones the middleware classes actually read (src/index.ts translation point),
// not the AppConfig names. Limits are deliberately far above any count a test can issue.
function clientConfig(cacheEnabled = true): any {
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
      resetTimeoutMs: 60000, rollingCountTimeoutMs: 60000, volumeThreshold: 5
    },
    queue: { enabled: true, maxSize: 100, strategy: 'fifo', concurrency: 5 },
    dataCompletion: { enabled: true, level: 'moderate', allowPartial: true, fallbackToCache: true },
    logging: { level: 'info', format: 'text', destination: 'console' },
    network: { timeoutMs: 30000 },
    yahooFinance: {
      baseUrl: 'https://query1.finance.yahoo.com', timeoutMs: 30000, userAgent: 'TestAgent/9.9',
      maxConcurrentRequests: 5, requestQueueSize: 100, validateResponses: true, strictMode: false
    }
  };
}

// The library `quote` payload is FLAT; getQuote maps it to { price, meta }.
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
    exchangeTimezoneShortName: 'EDT',
    gmtOffSetMilliseconds: -14400000,
    quoteSourceName: 'Delayed Quote',
    regularMarketPrice: 195.45,
    regularMarketChange: 2.31,
    regularMarketChangePercent: 1.197,
    regularMarketPreviousClose: 193.14,
    regularMarketVolume: 54000000,
    fullExchangeName: 'NasdaqGS',
    typeDisp: 'Equity',
    ...overrides
  };
}

function chartResult(symbol: string): Record<string, unknown> {
  return {
    timestamp: [1, 2, 3],
    meta: {
      currency: 'USD',
      symbol,
      exchangeName: 'NasdaqGS',
      instrumentType: 'EQUITY',
      firstTradeDate: new Date('2001-01-01T00:00:00.000Z'),
      regularMarketTime: 1740787200,
      gmtoffset: -14400,
      timezone: 'America/New_York',
      exchangeTimezoneName: 'America/New_York',
      regularMarketPrice: 195.45,
      chartPreviousClose: 193.14,
      priceHint: 2
    },
    indicators: {
      quote: [{ open: [1], high: [2], low: [0.5], close: [1.5], volume: [10] }],
      adjclose: [{ adjclose: [1.4] }]
    }
  };
}

async function cacheKeys(client: YahooFinanceClient): Promise<string[]> {
  return (client as any)['cache'].keys() as Promise<string[]>;
}

function warningsOf(client: YahooFinanceClient): DataWarning[] {
  return client.getWarnings();
}

describe('YahooFinanceClient endpoints and middleware composition (stubbed yahooFinance seam, no network)', () => {
  let client: YahooFinanceClient;

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
    lib.chart.mockImplementation(async (symbol: unknown) => chartResult(String(symbol)));
    lib.quoteSummary.mockResolvedValue({ assetProfile: { city: 'Cupertino' } });
    lib.search.mockResolvedValue({ news: [], quotes: [], hasNext: false });
    lib.options.mockResolvedValue({ options: [], expirationDates: [] });
    lib.trendingSymbols.mockResolvedValue({ quotes: [], jobTimestamp: 1, startInterval: 2, endInterval: 3 });
    lib.screener.mockResolvedValue({ quotes: [], count: 0, start: 0 });
    lib.fundamentalsTimeSeries.mockResolvedValue([]);

    client = new YahooFinanceClient(clientConfig());
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('toOptionContract (module export)', () => {
    it('keeps every field the library supplied and converts a parseable contractSize', () => {
      const row = toOptionContract({
        contractSymbol: 'AAPL260116C00150000',
        strike: 150,
        lastPrice: 46.5,
        change: 0.5,
        percentChange: 1.1,
        volume: 1200,
        openInterest: 8000,
        bid: 46,
        ask: 47,
        impliedVolatility: 0.28,
        inTheMoney: true,
        contractSize: 100,
        currency: 'USD'
      } as any);

      expect(row).toEqual({
        contractSymbol: 'AAPL260116C00150000',
        strike: 150,
        lastPrice: 46.5,
        change: 0.5,
        percentChange: 1.1,
        volume: 1200,
        openInterest: 8000,
        bid: 46,
        ask: 47,
        impliedVolatility: 0.28,
        inTheMoney: true,
        contractSize: 100,
        currency: 'USD'
      });
    });

    it('defaults every absent field, and a non-numeric contractSize becomes 0 rather than NaN', () => {
      const row = toOptionContract({} as any);

      expect(row.contractSymbol).toBe('');
      expect(row.strike).toBe(0);
      expect(row.inTheMoney).toBe(false);
      expect(row.currency).toBe('');
      expect(row.contractSize).toBe(0);
      expect(Number.isNaN(row.contractSize)).toBe(false);
    });

    it('DEFECT PIN: the real library contractSize string "regular" is silently 0', () => {
      expect(toOptionContract({ contractSize: 'regular' } as any).contractSize).toBe(0);
      expect(toOptionContract({ contractSize: '200' } as any).contractSize).toBe(200);
    });
  });

  describe('getQuote through executeWithMiddleware', () => {
    it('passes the requested fields through and returns the mapped quote under one cache key', async () => {
      const quote = await client.getQuote('AAPL', { fields: ['regularMarketPrice'] });

      expect(lib.quote).toHaveBeenCalledWith('AAPL', { fields: ['regularMarketPrice'] });
      expect(quote.price.regularMarketPrice).toBe(195.45);
      expect(quote.meta.exchangeName).toBe('NasdaqGS');
      expect(await cacheKeys(client)).toEqual(['quote:AAPL']);
    });

    it('calls the library with no options object at all when no fields are requested', async () => {
      await client.getQuote('MSFT');

      expect(lib.quote).toHaveBeenCalledWith('MSFT', undefined);
      expect(lib.quote.mock.calls[0][1]).toBeUndefined();
    });

    it('a second call for the same symbol is served from cache and returns the identical object reference', async () => {
      const first = await client.getQuote('AAPL');
      const second = await client.getQuote('AAPL');

      expect(lib.quote).toHaveBeenCalledTimes(1);
      expect(second).toBe(first);
    });

    it('forceRefresh skips the pre-check but still writes the fresh value back', async () => {
      await client.getQuote('AAPL');
      const refreshed = await client.getQuote('AAPL', { forceRefresh: true });

      expect(lib.quote).toHaveBeenCalledTimes(2);
      expect(refreshed.price.symbol).toBe('AAPL');
    });

    it('useCache:false neither reads nor writes, so the cache stays empty', async () => {
      await client.getQuote('AAPL', { useCache: false });
      await client.getQuote('AAPL', { useCache: false });

      expect(lib.quote).toHaveBeenCalledTimes(2);
      expect(await cacheKeys(client)).toEqual([]);
    });

    it('validate:false suppresses the cache write only', async () => {
      await client.getQuote('AAPL', { validate: false });

      expect(lib.quote).toHaveBeenCalledTimes(1);
      expect(await cacheKeys(client)).toEqual([]);
    });

    it('a disabled cache config short-circuits the pre-check the same way useCache:false does', async () => {
      const disabled = new YahooFinanceClient(clientConfig(false));
      await disabled.getQuote('AAPL');
      await disabled.getQuote('AAPL');

      expect(lib.quote).toHaveBeenCalledTimes(2);
      expect(await cacheKeys(disabled)).toEqual([]);
    });

    it('a quote mapped with payload warnings never reaches the client warning buffer', async () => {
      lib.quote.mockResolvedValue(rawQuote('AAPL', { regularMarketPrice: undefined }));

      const quote = await client.getQuote('AAPL');

      expect((quote.warnings ?? []).map((w) => w.field)).toContain('price.regularMarketPrice');
      expect(warningsOf(client)).toEqual([]);
    });
  });

  describe('executeWithMiddleware degradation branches', () => {
    it('a retryable failure with seeded fallback data returns it and records one warning keyed by the cache key', async () => {
      (client as any)['fallbackCache'].set('fallback:quote:AAPL', { price: { symbol: 'CACHED' } });
      lib.quote.mockRejectedValue(new Error('boom'));

      const result = await client.getQuote('AAPL');

      expect(result).toEqual({ price: { symbol: 'CACHED' } });
      expect(warningsOf(client)).toEqual([
        expect.objectContaining({
          field: 'quote:AAPL',
          severity: 'warning',
          message: 'Using fallback data due to: Unknown error'
        })
      ]);
    });

    it('a retryable failure with no fallback falls back to the cache entry itself when the pre-check was skipped', async () => {
      await client.getQuote('AAPL');
      lib.quote.mockRejectedValue(new Error('boom'));

      const served = await client.getQuote('AAPL', { forceRefresh: true });

      expect(served.price.symbol).toBe('AAPL');
      expect(warningsOf(client)).toEqual([
        expect.objectContaining({ field: 'quote:AAPL', message: 'Using cached data due to: Unknown error' })
      ]);
    });

    it('a retryable failure with neither fallback nor cached data rethrows the classified error', async () => {
      lib.quote.mockRejectedValue(new Error('boom'));

      await expect(client.getQuote('ZZZ')).rejects.toMatchObject({
        code: 'YF_ERR_UNKNOWN',
        message: 'Unknown error',
        isRetryable: true
      });
      expect(warningsOf(client)).toEqual([]);
    });

    it('a non-retryable classified error never consults fallback or cache', async () => {
      lib.quote.mockRejectedValue(
        new YahooFinanceError('gone', YF_ERR_API_CHANGED, null, false, false, {}, 'no action')
      );

      await expect(client.getQuote('AAPL')).rejects.toBeInstanceOf(YahooFinanceError);
      expect(warningsOf(client)).toEqual([]);
    });

    it('a DATA_INCOMPLETE error carrying partial data is returned and its warnings are buffered', async () => {
      const warning: DataWarning = {
        field: 'price.regularMarketVolume',
        severity: 'warning',
        message: 'volume missing',
        timestamp: BASE_TIME
      };
      lib.quote.mockRejectedValue(
        new YahooFinanceError(
          'incomplete', YF_ERR_DATA_INCOMPLETE, null, false, false, {}, 'no action',
          [warning], { price: { symbol: 'PARTIAL' } }
        )
      );

      const result = await client.getQuote('AAPL');

      expect(result).toEqual({ price: { symbol: 'PARTIAL' } });
      expect(warningsOf(client)).toEqual([expect.objectContaining({ field: 'price.regularMarketVolume' })]);
    });

    it('a PARTIAL_DATA error with partialData null rethrows but leaves its warnings orphaned in the buffer', async () => {
      lib.quote.mockRejectedValue(
        new YahooFinanceError(
          'partial data', YF_ERR_PARTIAL_DATA, null, false, false, {}, 'no action',
          [{ field: 'meta', severity: 'info', message: 'no meta', timestamp: BASE_TIME }], null
        )
      );

      await expect(client.getQuote('AAPL')).rejects.toMatchObject({ code: YF_ERR_PARTIAL_DATA });
      // hasData is true because partialData !== undefined, so the warnings are buffered first and
      // only then does data === null fall through to the rethrow — nobody receives those warnings
      // with the payload, and the next getWarnings() reader drains them.
      expect(warningsOf(client)).toEqual([
        expect.objectContaining({ field: 'meta', severity: 'info', message: 'no meta' })
      ]);
    });

    it('a PARTIAL_DATA error with no partialData at all has hasData false and is rethrown untouched', async () => {
      lib.quote.mockRejectedValue(
        new YahooFinanceError('partial data', YF_ERR_PARTIAL_DATA, null, false, false, {}, 'no action')
      );

      await expect(client.getQuote('AAPL')).rejects.toMatchObject({ code: YF_ERR_PARTIAL_DATA });
    });

    it('the fallback block is skipped when caching is disabled even for a retryable error', async () => {
      (client as any)['fallbackCache'].set('fallback:quote:AAPL', { price: { symbol: 'CACHED' } });
      lib.quote.mockRejectedValue(new Error('boom'));

      await expect(client.getQuote('AAPL', { useCache: false })).rejects.toMatchObject({ code: 'YF_ERR_UNKNOWN' });
      expect(warningsOf(client)).toEqual([]);
    });
  });

  describe('getQuotes batch loop', () => {
    it('returns every successful symbol and throws only when none succeeded', async () => {
      lib.quote.mockImplementation(async (symbol: unknown) => {
        if (String(symbol) === 'BAD') throw new Error('boom');
        return rawQuote(String(symbol));
      });

      const results = await client.getQuotes(['AAPL', 'BAD']);

      expect(Object.keys(results)).toEqual(['AAPL']);
    });

    it('DEFECT PIN: a symbol that failed vanishes without a trace once any symbol succeeded', async () => {
      lib.quote.mockImplementation(async (symbol: unknown) => {
        if (String(symbol) === 'BAD') throw new Error('boom');
        return rawQuote(String(symbol));
      });

      const results = await client.getQuotes(['BAD', 'AAPL']);

      expect(results).not.toHaveProperty('BAD');
      expect(warningsOf(client)).toEqual([]);
      expect(Object.keys(results)).toHaveLength(1);
    });

    it('every symbol failing raises DATA_UNAVAILABLE listing all of them', async () => {
      lib.quote.mockRejectedValue(new Error('boom'));

      await expect(client.getQuotes(['AAA', 'BBB'])).rejects.toMatchObject({
        code: 'YF_ERR_DATA_UNAVAILABLE',
        message: 'Failed to fetch all quotes: AAA, BBB',
        isRetryable: false
      });
    });

    it('a rejection that is not an Error is normalised through String()', async () => {
      lib.quote.mockImplementation(async (symbol: unknown) => {
        if (String(symbol) === 'BAD') throw 'plain string failure';
        return rawQuote(String(symbol));
      });

      await expect(client.getQuotes(['BAD'])).rejects.toMatchObject({
        context: { errors: { BAD: expect.any(Error) } }
      });
    });

    it('all symbols succeeding touches the library once each and records no error branch', async () => {
      const results = await client.getQuotes(['AAPL', 'MSFT']);

      expect(Object.keys(results).sort()).toEqual(['AAPL', 'MSFT']);
      expect(lib.quote).toHaveBeenCalledTimes(2);
    });
  });

  describe('the batch loops normalise a rejection that is not an Error', () => {
    // Every failure raised through executeWithMiddleware has already been through classifyError, so
    // the `error instanceof Error ? error : new Error(String(error))` arms in getQuotes,
    // getCryptoQuote and getForexQuote are only reachable through the one await that bypasses the
    // classifier's try/catch: the cache pre-check at the top of executeWithMiddleware.
    it('getQuotes wraps a non-Error from the cache pre-check into an Error inside context.errors', async () => {
      const getSpy = jest.spyOn((client as any)['cache'], 'get').mockRejectedValue('cache exploded');

      const error: any = await client.getQuotes(['AAPL']).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(YahooFinanceError);
      expect(error.context.errors.AAPL).toBeInstanceOf(Error);
      expect(error.context.errors.AAPL.message).toBe('cache exploded');
      getSpy.mockRestore();
    });

    it('getCryptoQuote wraps a non-Error the same way', async () => {
      const getSpy = jest.spyOn((client as any)['cache'], 'get').mockRejectedValue('cache exploded');

      const error: any = await client.getCryptoQuote(['BTC-USD']).catch((caught: unknown) => caught);
      expect(error.message).toBe('Failed to fetch all crypto quotes: BTC-USD');
      expect(error.context.errors['BTC-USD'].message).toBe('cache exploded');
      getSpy.mockRestore();
    });

    it('getForexQuote wraps a non-Error the same way', async () => {
      const getSpy = jest.spyOn((client as any)['cache'], 'get').mockRejectedValue('cache exploded');

      const error: any = await client.getForexQuote(['EURUSD']).catch((caught: unknown) => caught);
      expect(error.message).toBe('Failed to fetch all forex quotes: EURUSD');
      expect(error.context.errors.EURUSD.message).toBe('cache exploded');
      getSpy.mockRestore();
    });
  });

  describe('getHistoricalPrices and mapChartToHistorical', () => {
    it('requests the chart in object form and keys the cache by every range argument', async () => {
      await client.getHistoricalPrices('AAPL', {
        period1: '2025-01-01',
        period2: '2025-02-01',
        interval: '1wk'
      });

      expect(lib.chart).toHaveBeenCalledWith('AAPL', {
        period1: '2025-01-01',
        period2: '2025-02-01',
        interval: '1wk',
        return: 'object'
      });
      expect(await cacheKeys(client)).toEqual(['historical:AAPL:2025-01-01:2025-02-01:1wk']);
    });

    it('absent options become the epoch start, `now` and 1d in both the key and the request', async () => {
      const result = await client.getHistoricalPrices('MSFT');

      expect(lib.chart).toHaveBeenCalledWith('MSFT', {
        period1: '1970-01-01',
        period2: undefined,
        interval: '1d',
        return: 'object'
      });
      expect(await cacheKeys(client)).toEqual(['historical:MSFT:1970-01-01:now:1d']);
      expect(result.timestamps).toEqual([1, 2, 3]);
    });

    it('mapChartToHistorical accepts Date, plain epoch and anything else as the epoch helpers define them', () => {
      const mapped = (client as any)['mapChartToHistorical']({
        meta: {
          firstTradeDate: new Date('2001-01-01T00:00:00.000Z'),
          regularMarketTime: 1740787200,
          gmtoffset: 'not a number'
        },
        indicators: { quote: [{}] }
      });

      expect(mapped.meta.firstTradeDate).toBe(new Date('2001-01-01T00:00:00.000Z').getTime());
      expect(mapped.meta.regularMarketTime).toBe(1740787200);
      expect(mapped.meta.gmtoffset).toBe('not a number');
      expect(mapped.meta.currency).toBeNull();
      expect(mapped.meta.symbol).toBeNull();
      expect(mapped.timestamps).toEqual([]);
      expect(mapped.indicators.quote[0]).toEqual({ open: [], high: [], low: [], close: [], volume: [] });
      expect(mapped.indicators.adjclose).toEqual([{ adjclose: [] }]);
    });

    it('a chart result without a meta block still maps, defaulting every meta field to null', () => {
      const mapped = (client as any)['mapChartToHistorical']({
        timestamp: [7],
        indicators: { quote: [{ open: null, high: undefined, low: [1], close: [2], volume: [3] }], adjclose: [] }
      });

      expect(mapped.timestamps).toEqual([7]);
      expect(mapped.meta).toEqual({
        currency: null, symbol: null, exchangeName: null, instrumentType: null,
        firstTradeDate: null, regularMarketTime: null, gmtoffset: null, timezone: null,
        exchangeTimezoneName: null, regularMarketPrice: null, chartPreviousClose: null, priceHint: null
      });
      expect(mapped.indicators.quote[0].open).toEqual([]);
      expect(mapped.indicators.quote[0].high).toEqual([]);
      expect(mapped.indicators.adjclose).toEqual([{ adjclose: [] }]);
    });

    it('a chart result with no quote series raises DATA_INCOMPLETE before validation', async () => {
      lib.chart.mockResolvedValue({ meta: { symbol: 'AAPL' }, timestamp: [] });

      await expect(client.getHistoricalPrices('AAPL')).rejects.toMatchObject({
        code: YF_ERR_DATA_INCOMPLETE,
        message: 'Historical result contains no price series'
      });
    });
  });

  describe('getFinancials endpoint switch', () => {
    it('routes each statement type to its own quoteSummary module', async () => {
      lib.quoteSummary.mockResolvedValue({ balanceSheetHistory: { annual: [] } });
      await client.getFinancials('AAPL', 'balance-sheet');
      expect(lib.quoteSummary).toHaveBeenCalledWith('AAPL', { modules: ['balanceSheetHistory'] });

      lib.quoteSummary.mockResolvedValue({ incomeStatementHistory: { annual: [] } });
      await client.getFinancials('MSFT', 'income-statement', { forceRefresh: true });
      expect(lib.quoteSummary).toHaveBeenLastCalledWith('MSFT', { modules: ['incomeStatementHistory'] });

      lib.quoteSummary.mockResolvedValue({ cashflowStatementHistory: { annual: [] } });
      await client.getFinancials('GOOGL', 'cash-flow');
      expect(lib.quoteSummary).toHaveBeenLastCalledWith('GOOGL', { modules: ['cashflowStatementHistory'] });

      expect(await cacheKeys(client)).toEqual([
        'financials:AAPL:balance-sheet',
        'financials:MSFT:income-statement',
        'financials:GOOGL:cash-flow'
      ]);
    });

    it('a quoteSummary result with no statement module raises DATA_INCOMPLETE', async () => {
      lib.quoteSummary.mockResolvedValue({ price: {} });

      await expect(client.getFinancials('AAPL', 'cash-flow')).rejects.toMatchObject({
        code: YF_ERR_DATA_INCOMPLETE,
        message: 'Financial result contained no statement module'
      });
    });
  });

  describe('getEarnings module unwrap', () => {
    it('flattens the earnings module and promotes earningsTrend.trend plus industryTrend', async () => {
      lib.quoteSummary.mockResolvedValue({
        earnings: { earningsChart: { quarterly: [{ date: '2025-07-31' }] } },
        earningsTrend: { trend: [{ period: '0m', growth: 0.08 }, { period: '+1m', growth: 0.05 }] },
        industryTrend: { symbol: '^GSPC', estimates: [] }
      });

      const result = await client.getEarnings('AAPL');

      expect(lib.quoteSummary).toHaveBeenCalledWith('AAPL', {
        modules: ['earnings', 'earningsTrend', 'industryTrend']
      });
      expect(result.earningsChart).toEqual({ quarterly: [{ date: '2025-07-31' }] });
      expect(result.earningsTrend).toHaveLength(2);
      expect(result.industryTrend).toEqual([{ symbol: '^GSPC', estimates: [] }]);
    });

    it('an empty quoteSummary yields an empty trend list and no industry rows', async () => {
      lib.quoteSummary.mockResolvedValue({});

      const result = await client.getEarnings('MSFT');

      expect(result.earningsTrend).toEqual([]);
      expect(result.industryTrend).toEqual([]);
      expect(await cacheKeys(client)).toEqual(['earnings:MSFT']);
    });
  });

  describe('getAnalysis assembly', () => {
    it('assembles ratings, estimates and dates from a fully populated quoteSummary', async () => {
      lib.quoteSummary.mockResolvedValue({
        earningsTrend: { trend: [{ period: '0m', endDate: new Date('2025-09-30T00:00:00.000Z'), growth: 0.08 }] },
        industryTrend: {
          symbol: '^GSPC',
          estimates: [{ period: '0m', growth: 0.07, actual: 1.57 }, { period: '+1m', growth: 'NaN-ish' }]
        },
        recommendationTrend: {
          trend: [{ period: '0m', strongBuy: 12, buy: 22, hold: 9, sell: 2, strongSell: 1 }],
          maxAge: 60
        },
        financialData: { recommendationKey: 'BUY', targetMeanPrice: 210.5 },
        price: { longName: 'Apple Inc.' }
      });

      const result = await client.getAnalysis('AAPL');

      expect(result.analystOpinion).toEqual({
        companyName: 'Apple Inc.',
        currentRatings: { strongBuy: 12, buy: 22, hold: 9, sell: 2, strongSell: 1 },
        currentOpinion: 'BUY',
        targetPrice: 210.5,
        recommendationKey: 'BUY'
      });
      expect(result.earningsTrend[0].endDate).toEqual({ fmt: '2025-09-30', raw: Math.floor(Date.UTC(2025, 8, 30) / 1000) });
      expect(result.industryTrend).toEqual([
        {
          name: '^GSPC',
          estimates: [
            { period: '0m', estimate: 0.07, actual: 1.57 },
            { period: '+1m', estimate: 0, actual: null }
          ]
        }
      ]);
      expect(result.recommendationTrend.maxAge).toBe(60);
    });

    it('an empty quoteSummary yields zeroed ratings, an empty industry list and no dates', async () => {
      lib.quoteSummary.mockResolvedValue({});

      const result = await client.getAnalysis('MSFT');

      expect(result.analystOpinion.currentRatings).toEqual({
        strongBuy: 0, buy: 0, hold: 0, sell: 0, strongSell: 0
      });
      expect(result.analystOpinion.companyName).toBe('');
      expect(result.analystOpinion.targetPrice).toBe(0);
      expect(result.industryTrend).toEqual([]);
      expect(result.recommendationTrend.trend).toEqual([]);
      expect(result.recommendationTrend.maxAge).toBe(0);
    });

    it('a non-Date endDate and a non-string estimate period degrade to the empty forms, not to throw', async () => {
      lib.quoteSummary.mockResolvedValue({
        earningsTrend: { trend: [{ period: '0m', endDate: '2025-09-30' }] },
        industryTrend: { estimates: [{ period: 42, growth: null, actual: undefined }] },
        recommendationTrend: { trend: [] }
      });

      const result = await client.getAnalysis('GOOGL');

      expect(result.earningsTrend[0].endDate).toEqual({ fmt: '', raw: 0 });
      expect(result.industryTrend[0].estimates).toEqual([{ period: '', estimate: 0, actual: null }]);
    });
  });

  describe('getNews through search', () => {
    it('defaults to ten articles and maps full news rows', async () => {
      lib.search.mockResolvedValue({
        news: [
          {
            uuid: 'story-1',
            title: 'Apple beats estimates',
            publisher: 'Reuters',
            link: 'https://example/1',
            providerPublishTime: new Date('2026-02-27T00:00:00.000Z'),
            type: 'STORY',
            relatedTickers: ['AAPL'],
            thumbnail: { resolutions: [{ url: 'https://img/1.jpg', width: 800, height: 600, tag: 'thumb' }] }
          }
        ]
      });

      const result = await client.getNews('AAPL');

      expect(lib.search).toHaveBeenCalledWith('AAPL', { newsCount: 10, quotesCount: 1 });
      expect(result.count).toBe(1);
      expect(result.news[0]).toEqual({
        uuid: 'story-1',
        title: 'Apple beats estimates',
        publisher: 'Reuters',
        link: 'https://example/1',
        providerPublishTime: Date.UTC(2026, 1, 27),
        type: 'STORY',
        thumbnail: { resolutions: [{ url: 'https://img/1.jpg', width: 800, height: 600, tag: 'thumb' }] },
        relatedTickers: ['AAPL']
      });
      expect(await cacheKeys(client)).toEqual(['news:AAPL:10']);
    });

    it('an explicit count is both requested and part of the cache key', async () => {
      await client.getNews('MSFT', { count: 3 });

      expect(lib.search).toHaveBeenCalledWith('MSFT', { newsCount: 3, quotesCount: 1 });
      expect(await cacheKeys(client)).toEqual(['news:MSFT:3']);
    });

    it('sparse rows collapse to empty strings, a zero publish time and no thumbnail', async () => {
      lib.search.mockResolvedValue({
        news: [
          { uuid: 'x', providerPublishTime: 'not a date' },
          { thumbnail: { resolutions: [{}] } }
        ]
      });

      const result = await client.getNews('GOOGL', { count: 2 });

      expect(result.news[0]).toEqual({
        uuid: 'x',
        title: '',
        publisher: '',
        link: '',
        providerPublishTime: 0,
        type: '',
        thumbnail: undefined,
        relatedTickers: []
      });
      expect(result.news[1].thumbnail).toEqual({ resolutions: [{ url: '', width: 0, height: 0, tag: '' }] });
      expect(result.count).toBe(2);
    });

    it('a search result with no news array is an empty list, not an error', async () => {
      lib.search.mockResolvedValue({ quotes: [] });

      const result = await client.getNews('AMZN');

      expect(result).toEqual({ count: 0, news: [] });
    });
  });

  describe('getOptions chain mapping', () => {
    it('converts Date expirations to epoch ms and maps both contract legs', async () => {
      lib.options.mockResolvedValue({
        expirationDates: [new Date('2026-01-16T00:00:00.000Z')],
        quote: { regularMarketPrice: 195.45 },
        options: [
          {
            date: new Date('2026-01-16T00:00:00.000Z'),
            expirationDate: new Date('2026-01-16T00:00:00.000Z'),
            hasMiniOptions: false,
            calls: [{ contractSymbol: 'C1', strike: 150 }],
            puts: [{ contractSymbol: 'P1', strike: 200 }]
          }
        ]
      });

      const result = await client.getOptions('AAPL');

      expect(lib.options).toHaveBeenCalledWith('AAPL');
      expect(result.expirationDates).toEqual([Date.UTC(2026, 0, 16)]);
      expect(result.quote).toEqual({ regularMarketPrice: 195.45 });
      expect(result.options[0]).toEqual({
        date: Date.UTC(2026, 0, 16),
        expirationDate: Date.UTC(2026, 0, 16),
        hasMiniOptions: false,
        calls: [expect.objectContaining({ contractSymbol: 'C1', strike: 150 })],
        puts: [expect.objectContaining({ contractSymbol: 'P1', strike: 200 })]
      });
    });

    it('an empty chain yields no expirations and an empty quote object', async () => {
      lib.options.mockResolvedValue({});

      const result = await client.getOptions('MSFT');

      expect(result).toEqual({ expirationDates: [], options: [], quote: {} });
      expect(await cacheKeys(client)).toEqual(['options:MSFT']);
    });

    it('an expiration row without dates or legs becomes epoch 0 and empty contract lists', async () => {
      lib.options.mockResolvedValue({ options: [{}] });

      const result = await client.getOptions('GOOGL');

      expect(result.options[0]).toEqual({
        date: 0, expirationDate: 0, hasMiniOptions: false, calls: [], puts: []
      });
    });
  });

  describe('getSummaryProfile', () => {
    it('requests assetProfile and returns the raw module result untouched', async () => {
      lib.quoteSummary.mockResolvedValue({ assetProfile: { city: 'Cupertino', sector: 'Technology' } });

      const result = await client.getSummaryProfile('AAPL');

      expect(lib.quoteSummary).toHaveBeenCalledWith('AAPL', { modules: ['assetProfile'] });
      expect(result).toEqual({ assetProfile: { city: 'Cupertino', sector: 'Technology' } });
      expect(await cacheKeys(client)).toEqual(['summary:AAPL']);
    });
  });

  describe('getCryptoQuote batch', () => {
    it('keys results by the requested symbol and passes the flat library quote through untouched', async () => {
      lib.quote.mockImplementation(async (symbol: unknown) => rawQuote(String(symbol), { quoteType: 'CRYPTO' }));

      const results = await client.getCryptoQuote(['BTC-USD']);

      // validateCryptoQuote is a pass-through: unlike getQuote there is no {price, meta} mapping.
      expect(results['BTC-USD']).toEqual(expect.objectContaining({ symbol: 'BTC-USD', quoteType: 'CRYPTO' }));
      expect(results['BTC-USD']).not.toHaveProperty('price');
      expect(await cacheKeys(client)).toEqual(['crypto:BTC-USD']);
    });

    it('DEFECT PIN: a failed coin disappears once any coin succeeded', async () => {
      lib.quote.mockImplementation(async (symbol: unknown) => {
        if (String(symbol) === 'DOGE-USD') throw 'nope';
        return rawQuote(String(symbol));
      });

      const results = await client.getCryptoQuote(['BTC-USD', 'DOGE-USD']);

      expect(Object.keys(results)).toEqual(['BTC-USD']);
      expect(warningsOf(client)).toEqual([]);
    });

    it('all coins failing raises DATA_UNAVAILABLE naming the batch', async () => {
      lib.quote.mockRejectedValue(new Error('boom'));

      await expect(client.getCryptoQuote(['BTC-USD', 'ETH-USD'])).rejects.toMatchObject({
        code: 'YF_ERR_DATA_UNAVAILABLE',
        message: 'Failed to fetch all crypto quotes: BTC-USD, ETH-USD'
      });
    });
  });

  describe('getForexQuote batch and symbol normalisation', () => {
    it('appends =X to a bare pair but leaves an already-qualified one alone', async () => {
      await client.getForexQuote(['EURUSD', 'EUR=USD', 'EUR-USD']);

      const lookups = lib.quote.mock.calls.map((call: unknown[]) => call[0]);
      expect(lookups).toEqual(['EURUSD=X', 'EUR=USD', 'EUR-USD']);
      expect(Object.keys(await client.getForexQuote(['EURUSD', 'EUR=USD']))).toEqual(['EURUSD', 'EUR=USD']);
    });

    it('DEFECT PIN: a refused pair is dropped when another pair succeeded', async () => {
      lib.quote.mockImplementation(async (symbol: unknown) => {
        if (String(symbol) === 'ZZZ=X') throw 'nope';
        return rawQuote(String(symbol));
      });

      const results = await client.getForexQuote(['EURUSD', 'ZZZ']);

      expect(Object.keys(results)).toEqual(['EURUSD']);
    });

    it('all pairs failing raises DATA_UNAVAILABLE with the forex wording', async () => {
      lib.quote.mockRejectedValue(new Error('boom'));

      await expect(client.getForexQuote(['EURUSD'])).rejects.toMatchObject({
        code: 'YF_ERR_DATA_UNAVAILABLE',
        message: 'Failed to fetch all forex quotes: EURUSD',
        suggestedAction: 'Retry individually or check pair validity'
      });
    });
  });

  describe('getTrending with the second price lookup', () => {
    it('enriches with longName, falls back to shortName, and blanks a symbol the lookup omitted', async () => {
      lib.trendingSymbols.mockResolvedValue({
        quotes: [{ symbol: 'AAPL' }, { symbol: 'NVDA' }, { symbol: 'GONE' }],
        jobTimestamp: 1740787200,
        startInterval: 1740783600,
        endInterval: 1740787260
      });
      lib.quote.mockImplementation(async () => [
        rawQuote('AAPL'),
        rawQuote('NVDA', {
          longName: undefined, shortName: 'Nvidia', regularMarketChange: undefined,
          regularMarketChangePercent: undefined, regularMarketVolume: undefined,
          marketCap: 25000000000, quoteType: undefined
        }),
        // a library row with no symbol lands under the '' key and is simply never looked up
        { shortName: 'Orphan', regularMarketPrice: 1 }
      ]);

      const result = await client.getTrending();

      expect(lib.trendingSymbols).toHaveBeenCalledWith('US');
      expect(lib.quote).toHaveBeenCalledWith(['AAPL', 'NVDA', 'GONE']);
      expect(result.quotes).toEqual([
        expect.objectContaining({
          symbol: 'AAPL', name: 'Apple Inc.', lastPrice: 195.45, change: 2.31, changePercent: 1.197,
          volume: 54000000, marketCap: 0, type: 'EQUITY'
        }),
        expect.objectContaining({
          symbol: 'NVDA', name: 'Nvidia', lastPrice: 195.45, change: 0, changePercent: 0,
          volume: 0, marketCap: 25000000000, type: ''
        }),
        expect.objectContaining({
          symbol: 'GONE', name: '', lastPrice: 0, change: 0, changePercent: 0,
          volume: 0, marketCap: 0, type: ''
        })
      ]);
      expect(result).toMatchObject({ jobTimestamp: 1740787200, startInterval: 1740783600, endInterval: 1740787260 });
      expect(await cacheKeys(client)).toEqual(['trending:US']);
    });

    it('entries with a missing or empty symbol are filtered out before the price lookup', async () => {
      lib.trendingSymbols.mockResolvedValue({ quotes: [{ symbol: '' }, {}, { symbol: 'AAPL' }] });
      lib.quote.mockImplementation(async () => [rawQuote('AAPL', { longName: undefined })]);

      const result = await client.getTrending({ region: 'GB' });

      expect(lib.trendingSymbols).toHaveBeenCalledWith('GB');
      expect(lib.quote).toHaveBeenCalledWith(['AAPL']);
      expect(result.quotes).toHaveLength(1);
      expect(result.quotes[0]).toEqual({
        symbol: 'AAPL', name: 'Apple', lastPrice: 195.45, change: 2.31, changePercent: 1.197,
        volume: 54000000, marketCap: 0, type: 'EQUITY'
      });
      expect(result).toMatchObject({ jobTimestamp: 0, startInterval: 0, endInterval: 0 });
      expect(await cacheKeys(client)).toEqual(['trending:GB']);
    });

    it('an empty trending list skips the enrichment quote call entirely', async () => {
      lib.trendingSymbols.mockResolvedValue({ quotes: [] });

      const result = await client.getTrending({ region: 'JP' });

      expect(lib.quote).not.toHaveBeenCalled();
      expect(result.quotes).toEqual([]);
      expect(await cacheKeys(client)).toEqual(['trending:JP']);
    });

    it('a trending payload with no quotes array behaves like the empty list', async () => {
      lib.trendingSymbols.mockResolvedValue({});

      const result = await client.getTrending({ region: 'CA' });

      expect(result).toEqual({ quotes: [], jobTimestamp: 0, startInterval: 0, endInterval: 0 });
    });
  });

  describe('screener', () => {
    it('requests most_actives without count or start when neither is given', async () => {
      lib.screener.mockResolvedValue({
        count: 2,
        start: 5,
        quotes: [
          {
            symbol: 'AAPL', longName: 'Apple Inc.', regularMarketPrice: 195.45, regularMarketChange: 2.31,
            regularMarketChangePercent: 1.2, regularMarketVolume: 54000000, marketCap: 3000000000000,
            sector: 'Technology', industry: 'Consumer Electronics', trailingPE: 31.2, dividendYield: 0.0049,
            fiftyTwoWeekHigh: 221, fiftyTwoWeekLow: 149, beta: 1.21, epsTrailingTwelveMonths: 6.27
          },
          { symbol: 'NVDA' },
          { longName: 'Row without a symbol' }
        ]
      });

      const result = await client.screener();

      expect(lib.screener).toHaveBeenCalledWith({ scrIds: 'most_actives' });
      // `count` comes from the library while `end` is computed from the mapped rows, so a library
      // count that disagrees with the returned rows yields a self-inconsistent meta page.
      expect(result.finance.result[0].meta).toEqual({ count: 2, start: 5, end: 8 });
      expect(result.finance.result[0].quotes).toHaveLength(3);
      expect(result.finance.result[0].quotes[0]).toEqual({
        symbol: 'AAPL', name: 'Apple Inc.', lastPrice: 195.45, change: 2.31, changePercent: 1.2,
        volume: 54000000, marketCap: 3000000000000, sector: 'Technology', industry: 'Consumer Electronics',
        peRatio: 31.2, dividendYield: 0.0049, fiftyTwoWeekHigh: 221, fiftyTwoWeekLow: 149,
        beta: 1.21, eps: 6.27
      });
      expect(result.finance.result[0].quotes[1]).toEqual({
        symbol: 'NVDA', name: '', lastPrice: 0, change: 0, changePercent: 0, volume: 0, marketCap: 0,
        sector: '', industry: '', peRatio: null, dividendYield: null, fiftyTwoWeekHigh: null,
        fiftyTwoWeekLow: null, beta: null, eps: null
      });
      // a row the library returned without a symbol keeps the row and blanks the symbol
      expect(result.finance.result[0].quotes[2]).toEqual(expect.objectContaining({ symbol: '', name: 'Row without a symbol' }));
      expect(result.finance.error).toBeUndefined();
      expect(await cacheKeys(client)).toEqual(['screener:undefined::']);
    });

    it('forwards count and offset into both the request and the cache key', async () => {
      await client.screener(undefined, { count: 25, offset: 10 });

      expect(lib.screener).toHaveBeenCalledWith({ scrIds: 'most_actives', count: 25, start: 10 });
      expect(await cacheKeys(client)).toEqual(['screener:undefined:25:10']);
    });

    it('custom filters are reported as not applied but do not change the request', async () => {
      lib.screener.mockResolvedValue({ quotes: [{ symbol: 'AAPL' }] });

      const result = await client.screener([{ field: 'close', operator: 'gt', value: 100 }]);

      expect(lib.screener).toHaveBeenCalledWith({ scrIds: 'most_actives' });
      expect(result.finance.error).toEqual({
        code: 'FILTERS_NOT_APPLIED',
        description: 'Custom screener filters are not supported by the predefined most_actives module; results are unfiltered'
      });
      expect(result.finance.result[0].meta).toEqual({ count: 1, start: 0, end: 1 });
      expect(await cacheKeys(client)).toEqual(['screener:[{"field":"close","operator":"gt","value":100}]::']);
    });

    it('an empty filters array is not treated as filtered', async () => {
      const result = await client.screener([]);

      expect(result.finance.error).toBeUndefined();
      expect(await cacheKeys(client)).toEqual(['screener:[]::']);
    });

    it('a screener payload with no quotes array yields an empty result page', async () => {
      lib.screener.mockResolvedValue({});

      const result = await client.screener(undefined, { forceRefresh: true });

      expect(result.finance.result[0].quotes).toEqual([]);
      expect(result.finance.result[0].meta).toEqual({ count: 0, start: 0, end: 0 });
    });
  });
});
