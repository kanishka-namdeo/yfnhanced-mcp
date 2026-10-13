// src/services/data-aggregator.ts is dead, unwired draft code: nothing in src/ constructs it,
// and its LOCAL YahooFinanceClient interface (:10-14) demands getQuoteSummary/getChart/getQuote
// shapes the real YahooFinanceClient does not expose. This suite therefore injects a fake client
// object and tests only what the module actually exports.
//
// Symbols the old suite imported that have NEVER existed:
// - FallbackStrategy (no enum/object anywhere in the repo; SECONDARY_ONLY/CASCADE/PARALLEL/
//   CACHE_FIRST included)
// - DataQualityReport used as a VALUE — src/utils/data-completion.ts:1 declares it as a `type`
//   object alias, so `toBeInstanceOf(DataQualityReport)` could never work
// - DataAggregator members the old suite called: aggregate(), aggregateHistorical(), getConfig(),
//   updateConfig(), getStats(), resetStats(), getQualityReport(), getCacheStats(), warmCache().
//   The class has NO config/stats/quality-report surface at all; its real public surface is
//   aggregateQuoteData / aggregateHistoricalData / aggregateFinancialData / completeMissingFields /
//   verifyDataConsistency / selectBestSource / tryPrimaryThenFallback / tryWithRetry /
//   tryCachedData / verifyPriceData / verifyVolumeData / verifyTimestampData / setQualityReporter /
//   clearCache / getCacheSize / getCacheEntries.
//
// Timing: tryWithRetry backs off with real setTimeout(2^attempt * 1000) (:264-283), so every
// failure-path test runs on jest fake timers and drains the whole backoff chain with
// runAllTimersAsync(). Nothing in this file sleeps on the wall clock.

import * as dataAggregatorModule from '../../../src/services/data-aggregator';
import { DataAggregator } from '../../../src/services/data-aggregator';
import { YahooFinanceError, YF_ERR_DATA_INCOMPLETE } from '../../../src/types/errors';
import type { DataCompletionConfig } from '../../../src/types/config';

const BASE_TIME = new Date('2026-01-01T00:00:00.000Z');

function baseConfig(overrides: Partial<DataCompletionConfig> = {}): DataCompletionConfig {
  return {
    enabled: true,
    level: 'moderate',
    requiredFields: [],
    preferredFields: [],
    allowPartial: true,
    fallbackToCache: true,
    ...overrides
  };
}

interface FakeClient {
  getQuoteSummary: jest.Mock;
  getChart: jest.Mock;
  getQuote: jest.Mock;
}

function fakeClient(overrides: Partial<Record<keyof FakeClient, unknown>> = {}): FakeClient {
  const client: FakeClient = {
    getQuoteSummary: jest.fn().mockResolvedValue({}),
    getChart: jest.fn().mockResolvedValue({}),
    getQuote: jest.fn().mockResolvedValue({})
  };
  for (const key of Object.keys(overrides) as Array<keyof FakeClient>) {
    client[key] = overrides[key] as jest.Mock;
  }
  return client;
}

function fakeReporter(): Record<'reportDataQuality' | 'reportMissingFields' | 'reportAggregationSource', jest.Mock> {
  return {
    reportDataQuality: jest.fn(),
    reportMissingFields: jest.fn(),
    reportAggregationSource: jest.fn()
  };
}

type Settled<T> = { fulfilled: boolean; value?: T; error?: unknown };

// Awaits every queued timer (the whole exponential backoff chain) before settling, so no test
// ever depends on how fast the machine is.
async function settle<T>(promise: Promise<T>): Promise<Settled<T>> {
  let outcome: Settled<T> = { fulfilled: false };
  const tracked = promise.then(
    (value) => { outcome = { fulfilled: true, value }; },
    (error) => { outcome = { fulfilled: false, error }; }
  );
  await jest.runAllTimersAsync();
  await tracked;
  return outcome;
}

describe('data-aggregator module surface', () => {
  test('exports exactly one runtime value: DataAggregator', () => {
    // The SourcePriority / SourceData / DataQualityReporter / local YahooFinanceClient shapes are
    // interfaces and vanish at compile time; FallbackStrategy never existed at all.
    const runtimeExports = Object.keys(dataAggregatorModule).filter((key) => key !== '__esModule');
    expect(runtimeExports.sort()).toEqual(['DataAggregator']);
  });
});

describe('DataAggregator construction', () => {
  let client: FakeClient;
  let aggregator: DataAggregator;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(BASE_TIME);
    client = fakeClient();
    aggregator = new DataAggregator(client as any, baseConfig());
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('starts with an empty cache and the documented 300000 ms TTL constant', () => {
    expect(aggregator.getCacheSize()).toBe(0);
    expect(aggregator.getCacheEntries()).toEqual([]);
    expect(aggregator['CACHE_TTL_MS']).toBe(300000);
  });

  test('the default quality reporter is a no-op triple, so aggregation never throws on reporting', async () => {
    client.getQuoteSummary.mockResolvedValue({ symbol: 'AAPL', regularMarketPrice: 1 });
    await expect(aggregator.aggregateQuoteData('AAPL', [])).resolves.toBeDefined();
  });

  test('setQualityReporter replaces the default reporter and it receives every callback', async () => {
    const reporter = fakeReporter();
    aggregator.setQualityReporter(reporter as any);
    client.getQuoteSummary.mockResolvedValue({ symbol: 'AAPL', regularMarketPrice: 150.5 });

    await aggregator.aggregateQuoteData('AAPL', ['ignored-by-src']);

    expect(reporter.reportAggregationSource).toHaveBeenCalledWith('AAPL', 'quote', 'primary');
    // requiredFields is empty → calculateCompleteness short-circuits to 1 → 'high'
    expect(reporter.reportDataQuality).toHaveBeenCalledWith('AAPL', 'quote', 'high', { completeness: 1 });
    expect(reporter.reportMissingFields).not.toHaveBeenCalled();
  });
});

describe('DataAggregator.aggregateQuoteData', () => {
  let client: FakeClient;
  let aggregator: DataAggregator;
  let reporter: ReturnType<typeof fakeReporter>;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(BASE_TIME);
    client = fakeClient();
    aggregator = new DataAggregator(client as any, baseConfig());
    reporter = fakeReporter();
    aggregator.setQualityReporter(reporter as any);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('primary source is the 4-module quoteSummary request and the result is flattened to { price }', async () => {
    client.getQuoteSummary.mockResolvedValue({
      symbol: 'AAPL',
      regularMarketPrice: 150.5,
      regularMarketChange: '2.5', // string numerics are parsed
      regularMarketVolume: 50000000,
      currency: 'USD',
      marketCap: { raw: 2500000000000 }, // {raw} wrappers are unwrapped
      dividendDate: '2026-01-05',
      beta: 'not-a-number'
    });

    const result = await aggregator.aggregateQuoteData('AAPL', ['primary']);

    expect(client.getQuoteSummary).toHaveBeenCalledWith('AAPL', [
      'defaultKeyStatistics', 'summaryDetail', 'financialData', 'price'
    ]);
    expect(result.price.symbol).toBe('AAPL');
    expect(result.price.regularMarketPrice).toBe(150.5);
    expect(result.price.regularMarketChange).toBe(2.5);
    expect(result.price.marketCap).toBe(2500000000000);
    // extractString(dividendDate) is mapped onto exDividendDate
    expect(result.price.exDividendDate).toBe('2026-01-05');
    // non-numeric strings and absent keys become null, never undefined
    expect(result.price.beta).toBeNull();
    expect(result.price.fiftyTwoWeekHigh).toBeNull();
    // transformToQuoteResult builds ONLY `price` — there is no meta on this path
    expect((result as any).meta).toBeUndefined();
    expect(reporter.reportAggregationSource).toHaveBeenCalledWith('AAPL', 'quote', 'primary');
  });

  test('an absent symbol normalizes to the empty string, not undefined', async () => {
    client.getQuoteSummary.mockResolvedValue({ regularMarketPrice: 10 });
    const result = await aggregator.aggregateQuoteData('MSFT', []);
    expect(result.price.symbol).toBe('');
  });

  test('primary failure cascades to getChart then to getQuote', async () => {
    client.getQuoteSummary.mockRejectedValue(new Error('summary down'));
    client.getChart.mockRejectedValue(new Error('chart down'));
    client.getQuote.mockResolvedValue({ regularMarketPrice: 42, symbol: 'AAPL' });

    const outcome = await settle(aggregator.aggregateQuoteData('AAPL', []));

    expect(outcome.fulfilled).toBe(true);
    expect(client.getQuoteSummary).toHaveBeenCalledTimes(4); // tryWithRetry maxRetries 3
    expect(client.getChart).toHaveBeenCalledWith('AAPL', '1d', '5d');
    expect(result3Price(outcome.value)).toBe(42);
    expect(reporter.reportAggregationSource).toHaveBeenCalledWith('AAPL', 'quote', 'primary');
  });

  test('every source failing with an empty cache rejects with the PRIMARY error, not a fallback error', async () => {
    client.getQuoteSummary.mockRejectedValue(new Error('primary failed'));
    client.getChart.mockRejectedValue(new Error('chart failed'));
    client.getQuote.mockRejectedValue(new Error('quote failed'));

    const outcome = await settle(aggregator.aggregateQuoteData('AAPL', []));

    expect(outcome.fulfilled).toBe(false);
    expect((outcome.error as Error).message).toBe('primary failed');
  });

  test('every source failing with a warm cache still resolves and reports the cached source', async () => {
    client.getQuoteSummary.mockResolvedValue({ symbol: 'AAPL', regularMarketPrice: 150 });
    await aggregator.aggregateQuoteData('AAPL', []);

    client.getQuoteSummary.mockRejectedValue(new Error('primary failed'));
    client.getChart.mockRejectedValue(new Error('chart failed'));
    client.getQuote.mockRejectedValue(new Error('quote failed'));

    const outcome = await settle(aggregator.aggregateQuoteData('AAPL', []));

    expect(outcome.fulfilled).toBe(true);
    expect(reporter.reportAggregationSource).toHaveBeenLastCalledWith('AAPL', 'quote', 'cached');
    expect(result3Price(outcome.value)).toBe(150);
  });

  test('DEFECT: the cache is keyed by symbol alone, so quote/historical/financial entries collide', async () => {
    client.getQuoteSummary.mockResolvedValue({ symbol: 'AAPL', regularMarketPrice: 150 });
    await aggregator.aggregateQuoteData('AAPL', []);
    expect(aggregator.getCacheSize()).toBe(1);

    // A historical aggregation for the SAME symbol overwrites the quote entry.
    client.getChart.mockResolvedValue({ meta: { symbol: 'AAPL' }, indicators: {}, timestamps: [] });
    await aggregator.aggregateHistoricalData('AAPL', []);

    expect(aggregator.getCacheSize()).toBe(1); // still one slot, not two
    expect(aggregator.getCacheEntries().map((e) => e.symbol)).toEqual(['AAPL']);
    expect(aggregator.tryCachedData('AAPL')).toMatchObject({ meta: { symbol: 'AAPL' } });
  });

  test('DEFECT: quality is graded against the transformed envelope, so a quote never scores above low', async () => {
    const strict = new DataAggregator(fakeClient({
      getQuoteSummary: jest.fn().mockResolvedValue({ symbol: 'AAPL', regularMarketPrice: 1 })
    }) as any, baseConfig({ requiredFields: ['regularMarketPrice', 'marketCap', 'volume'] }));
    const spy = fakeReporter();
    strict.setQualityReporter(spy as any);

    await strict.aggregateQuoteData('AAPL', []);

    // calculateCompleteness reads data[field] on the QuoteResult, whose only key is `price`,
    // so flat field names are always absent → completeness 0 → 'low', however complete the
    // upstream payload was.
    expect(spy.reportDataQuality).toHaveBeenCalledWith('AAPL', 'quote', 'low', { completeness: 0 });
  });

  test('a successful call caches the RAW source payload, not the transformed QuoteResult', async () => {
    const raw = { symbol: 'AAPL', regularMarketPrice: 150 };
    client.getQuoteSummary.mockResolvedValue(raw);
    await aggregator.aggregateQuoteData('AAPL', []);

    expect(aggregator.tryCachedData('AAPL')).toBe(raw);
  });

  function result3Price(value: unknown): unknown {
    return (value as { price: { regularMarketPrice: unknown } }).price.regularMarketPrice;
  }
});

describe('DataAggregator.aggregateHistoricalData', () => {
  let client: FakeClient;
  let aggregator: DataAggregator;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(BASE_TIME);
    client = fakeClient();
    aggregator = new DataAggregator(client as any, baseConfig());
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('primary is getChart(1d, 1mo) and the payload is passed through with no transform', async () => {
    const chart = { meta: { symbol: 'AAPL', currency: 'USD' }, indicators: { quote: [] }, timestamps: [1] };
    client.getChart.mockResolvedValue(chart);

    const result = await aggregator.aggregateHistoricalData('AAPL', []);

    expect(client.getChart).toHaveBeenCalledWith('AAPL', '1d', '1mo');
    expect(result).toEqual(chart);
    expect(result).not.toBe(chart); // fillMissingFields returns a shallow copy
  });

  test('a failing weekly-chart fallback is what rescues the call, not quoteSummary', async () => {
    client.getChart.mockImplementation((symbol: string, interval: string) =>
      interval === '1d'
        ? Promise.reject(new Error('1d empty'))
        : Promise.resolve({ meta: { symbol: 'AAPL' }, indicators: {}, timestamps: [] })
    );

    const outcome = await settle(aggregator.aggregateHistoricalData('AAPL', []));

    expect(outcome.fulfilled).toBe(true);
    // the primary's own retries reuse 1d, so the 1wk call only arrives after they are spent
    expect(client.getChart).toHaveBeenNthCalledWith(5, 'AAPL', '1wk', '1mo');
    expect(client.getQuoteSummary).not.toHaveBeenCalled();
  });

  test('disabled completion returns the cached/chart object identity untouched', async () => {
    const disabled = new DataAggregator(client as any, baseConfig({ enabled: false }));
    const chart = { meta: {}, indicators: {}, timestamps: [] };
    client.getChart.mockResolvedValue(chart);

    await expect(disabled.aggregateHistoricalData('AAPL', [])).resolves.toBe(chart);
  });
});

describe('DataAggregator.aggregateFinancialData', () => {
  let client: FakeClient;
  let aggregator: DataAggregator;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(BASE_TIME);
    client = fakeClient();
    aggregator = new DataAggregator(client as any, baseConfig());
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('DEFECT: transformToFinancialResult ignores its input and returns hardcoded empty statements', async () => {
    client.getQuoteSummary.mockResolvedValue({
      incomeStatementHistory: { annual: [{ totalRevenue: 394332000000 }] }
    });

    const result = await aggregator.aggregateFinancialData('AAPL', []);

    expect(client.getQuoteSummary).toHaveBeenCalledWith('AAPL', [
      'incomeStatementHistory', 'balanceSheetHistory', 'cashflowStatementHistory'
    ]);
    // the real annual row is gone; every bucket is the same empty stub
    expect(result.incomeStatementHistory).toEqual({ maxAge: 0, quarterly: [], annual: [] });
    expect(Object.keys(result)).toHaveLength(6);
    expect(result.incomeStatementHistoryQuarterly).toEqual({ maxAge: 0, quarterly: [], annual: [] });
  });

  test('annual → quarterly → key-statistics fallback order, resolving on the quarterly module list', async () => {
    client.getQuoteSummary.mockImplementation((_symbol: string, modules: string[]) =>
      modules[0] === 'incomeStatementHistory'
        ? Promise.reject(new Error('annual unavailable'))
        : Promise.resolve({ marker: 'quarterly' })
    );

    const outcome = await settle(aggregator.aggregateFinancialData('AAPL', []));

    expect(outcome.fulfilled).toBe(true);
    expect(client.getQuoteSummary).toHaveBeenNthCalledWith(5, 'AAPL', [
      'incomeStatementHistoryQuarterly', 'balanceSheetHistoryQuarterly', 'cashflowStatementHistoryQuarterly'
    ]);
    // and the rescued payload is still discarded by the transform
    expect(outcome.value).toEqual(expect.objectContaining({
      incomeStatementHistory: { maxAge: 0, quarterly: [], annual: [] }
    }));
  });
});

describe('DataAggregator.completeMissingFields', () => {
  const config = baseConfig({ requiredFields: ['price', 'volume'] });
  let aggregator: DataAggregator;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(BASE_TIME);
    aggregator = new DataAggregator(fakeClient() as any, config);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('disabled completion returns the SAME object reference', () => {
    const disabled = new DataAggregator(fakeClient() as any, baseConfig({ enabled: false }));
    const data = { price: 1 };
    expect(disabled.completeMissingFields(data, { primary: data })).toBe(data);
  });

  test('missing required fields are pulled from the first source that carries a non-null value', () => {
    const completed = aggregator.completeMissingFields(
      { price: 150, volume: null },
      { primary: { price: 151 }, secondary: { volume: 50000000 } }
    );

    // Only MISSING fields are filled — a present value is never overwritten by another source.
    expect(completed).toEqual({ price: 150, volume: 50000000 });
  });

  test('a source entry that is undefined is skipped and a null value never fills', () => {
    const completed = aggregator.completeMissingFields(
      { price: undefined },
      { primary: undefined, secondary: { price: null }, tertiary: { price: 7 } }
    );
    expect(completed.price).toBe(7);
  });

  test('level strict with allowPartial false throws YF_ERR_DATA_INCOMPLETE', () => {
    const strict = new DataAggregator(fakeClient() as any, baseConfig({
      level: 'strict', requiredFields: ['price', 'volume'], allowPartial: false
    }));

    let caught: unknown;
    try {
      strict.completeMissingFields({ price: 150 }, { primary: { price: 150 } });
    } catch (error) {
      caught = error;
    }

    const yfError = caught as YahooFinanceError;
    expect(yfError).toBeInstanceOf(YahooFinanceError);
    expect(yfError.code).toBe(YF_ERR_DATA_INCOMPLETE);
    expect(yfError.isRetryable).toBe(false);
    expect(yfError.context).toEqual({ missingFields: ['volume'] });
    expect(yfError.message).toBe('Required fields missing: volume');
  });

  test('level strict with allowPartial true reports the missing fields and calls onIncomplete instead of throwing', () => {
    const onIncomplete = jest.fn();
    const reporter = fakeReporter();
    const lenient = new DataAggregator(fakeClient() as any, baseConfig({
      level: 'strict', requiredFields: ['price', 'volume'], allowPartial: true, onIncomplete
    }));
    lenient.setQualityReporter(reporter as any);

    const completed = lenient.completeMissingFields({ price: 150 }, { primary: { price: 150 } });

    expect(completed.volume).toBeUndefined();
    expect(reporter.reportMissingFields).toHaveBeenCalledWith('unknown', 'unknown', ['volume']);
    expect(onIncomplete).toHaveBeenCalledWith(['volume'], completed);
  });

  test('level moderate never runs strict validation, even with missing required fields', () => {
    const reporter = fakeReporter();
    const moderate = new DataAggregator(fakeClient() as any, baseConfig({
      level: 'moderate', requiredFields: ['volume'], allowPartial: false
    }));
    moderate.setQualityReporter(reporter as any);

    expect(() => moderate.completeMissingFields({ price: 1 }, { primary: { price: 1 } })).not.toThrow();
    expect(reporter.reportMissingFields).not.toHaveBeenCalled();
  });
});

describe('DataAggregator.verifyDataConsistency', () => {
  let aggregator: DataAggregator;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(BASE_TIME);
    aggregator = new DataAggregator(fakeClient() as any, baseConfig());
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('price keys tolerate 1% relative difference', () => {
    expect(aggregator.verifyDataConsistency({ price: 100 }, { price: 100.5 })).toBe(true);
    expect(aggregator.verifyDataConsistency({ price: 100 }, { price: 102 })).toBe(false);
  });

  test('volume keys tolerate 5% relative difference', () => {
    expect(aggregator.verifyDataConsistency({ volume: 1000000 }, { volume: 1040000 })).toBe(true);
    expect(aggregator.verifyDataConsistency({ volume: 1000000 }, { volume: 1060000 })).toBe(false);
  });

  test('time and date keys tolerate an absolute 60000 ms', () => {
    expect(aggregator.verifyDataConsistency({ lastTime: 1000 }, { lastTime: 60500 })).toBe(true);
    expect(aggregator.verifyDataConsistency({ asOfDate: 1000 }, { asOfDate: 61500 })).toBe(false);
  });

  test('other numeric keys fall back to the 1% price-style tolerance', () => {
    expect(aggregator.verifyDataConsistency({ marketCap: 1000 }, { marketCap: 1005 })).toBe(true);
    expect(aggregator.verifyDataConsistency({ marketCap: 1000 }, { marketCap: 1100 })).toBe(false);
  });

  test('non-numeric values must be strictly equal', () => {
    expect(aggregator.verifyDataConsistency({ currency: 'USD' }, { currency: 'USD' })).toBe(true);
    expect(aggregator.verifyDataConsistency({ currency: 'USD' }, { currency: 'usd' })).toBe(false);
  });

  test('a key missing on either side is skipped, not failed', () => {
    expect(aggregator.verifyDataConsistency({ price: 1, beta: 2 }, { price: 1 })).toBe(true);
    expect(aggregator.verifyDataConsistency({ price: 1 }, { price: 1, beta: undefined })).toBe(true);
  });

  test('key classification is substring based and first-match wins: price beats volume beats time', () => {
    // 'priceVolume' contains both price and volume, so the 1% price rule applies.
    expect(aggregator.verifyDataConsistency({ priceVolume: 100 }, { priceVolume: 104 })).toBe(false);
    expect(aggregator.verifyDataConsistency({ priceVolume: 100 }, { priceVolume: 100.5 })).toBe(true);
  });

  test('only keys of data1 are compared, so extra data2 keys are invisible', () => {
    expect(aggregator.verifyDataConsistency({ price: 1 }, { price: 1, junk: 'x' })).toBe(true);
  });
});

describe('DataAggregator.selectBestSource', () => {
  let aggregator: DataAggregator;

  beforeEach(() => {
    jest.useFakeTimers();
    aggregator = new DataAggregator(fakeClient() as any, baseConfig());
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('returns the first priority entry that is defined, in priority order not insertion order', () => {
    const sources = { primary: undefined, secondary: { price: 2 }, cached: { price: 3 } };
    expect(aggregator.selectBestSource(sources as any, ['secondary', 'primary'])).toEqual({ price: 2 });
  });

  test('an empty priority list falls through to the first stored value', () => {
    const sources = { primary: { price: 1 }, secondary: { price: 2 } };
    expect(aggregator.selectBestSource(sources as any, [])).toEqual({ price: 1 });
  });

  test('all-undefined sources yield the empty-object sentinel', () => {
    expect(aggregator.selectBestSource({ primary: undefined }, [])).toEqual({});
    expect(aggregator.selectBestSource({}, [])).toEqual({});
  });
});

describe('DataAggregator.tryPrimaryThenFallback', () => {
  let aggregator: DataAggregator;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(BASE_TIME);
    aggregator = new DataAggregator(fakeClient() as any, baseConfig());
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('no fallbacks means the primary error propagates after exactly 4 attempts', async () => {
    const primary = jest.fn().mockRejectedValue(new Error('boom'));
    const outcome = await settle(aggregator.tryPrimaryThenFallback('AAPL', primary, []));

    expect(outcome.fulfilled).toBe(false);
    expect((outcome.error as Error).message).toBe('boom');
    expect(primary).toHaveBeenCalledTimes(4); // attempts 0..3, backoff 1s + 2s + 4s
  });

  test('fallbacks get 3 attempts each (maxRetries 2) and the primary error is the one thrown', async () => {
    const primary = jest.fn().mockRejectedValue(new Error('primary failed'));
    const fallbackA = jest.fn().mockRejectedValue(new Error('fallback A'));
    const fallbackB = jest.fn().mockResolvedValue('B worked');

    const outcome = await settle(aggregator.tryPrimaryThenFallback('AAPL', primary, [fallbackA, fallbackB]));

    expect(outcome.fulfilled).toBe(true);
    expect(outcome.value).toBe('B worked');
    expect(primary).toHaveBeenCalledTimes(4);
    expect(fallbackA).toHaveBeenCalledTimes(3);
    expect(fallbackB).toHaveBeenCalledTimes(1);
  });

  test('every attempt failing rethrows the PRIMARY error, which is what callers surface', async () => {
    const primary = jest.fn().mockRejectedValue(new Error('primary failed'));
    const fallback = jest.fn().mockRejectedValue(new Error('fallback failed'));

    const outcome = await settle(aggregator.tryPrimaryThenFallback('AAPL', primary, [fallback]));

    expect(outcome.fulfilled).toBe(false);
    expect((outcome.error as Error).message).toBe('primary failed');
  });
});

describe('DataAggregator.tryWithRetry', () => {
  let aggregator: DataAggregator;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(BASE_TIME);
    aggregator = new DataAggregator(fakeClient() as any, baseConfig());
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('success caches under the symbol and returns the value', async () => {
    const outcome = await settle(aggregator.tryWithRetry('AAPL', async () => ({ price: 1 }), 3));
    expect(outcome.fulfilled).toBe(true);
    expect(aggregator.tryCachedData('AAPL')).toEqual({ price: 1 });
  });

  test('exhausts maxRetries + 1 attempts and throws the LAST error', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(new Error('first'))
      .mockRejectedValueOnce(new Error('second'))
      .mockRejectedValueOnce(new Error('third'))
      .mockRejectedValueOnce(new Error('fourth'));

    const outcome = await settle(aggregator.tryWithRetry('AAPL', fn, 3));

    expect(fn).toHaveBeenCalledTimes(4);
    expect((outcome.error as Error).message).toBe('fourth');
    expect(aggregator.tryCachedData('AAPL')).toBeNull(); // failures never write the cache
  });

  test('a non-Error rejection is wrapped into an Error', async () => {
    const outcome = await settle(aggregator.tryWithRetry('AAPL', () => Promise.reject('plain string'), 1));
    expect(outcome.error).toBeInstanceOf(Error);
    expect((outcome.error as Error).message).toBe('plain string');
  });

  test('exponential backoff is 1s, 2s, 4s of scheduled delay, deterministic under fake timers', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('boom'));
    const pending = aggregator.tryWithRetry('AAPL', fn, 2);

    await jest.advanceTimersByTimeAsync(0);
    expect(fn).toHaveBeenCalledTimes(1); // first attempt is immediate
    await jest.advanceTimersByTimeAsync(1000);
    expect(fn).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(2000);
    expect(fn).toHaveBeenCalledTimes(3);

    const outcome = await settle(pending);
    expect(outcome.fulfilled).toBe(false);
  });
});

describe('DataAggregator.tryCachedData', () => {
  let aggregator: DataAggregator;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(BASE_TIME);
    aggregator = new DataAggregator(fakeClient() as any, baseConfig());
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('unknown symbol is a null, not undefined', () => {
    expect(aggregator.tryCachedData('NOPE')).toBeNull();
  });

  test('fallbackToCache false short-circuits to null even with a warm entry', () => {
    const disabled = new DataAggregator(fakeClient() as any, baseConfig({ fallbackToCache: false }));
    disabled['cache'].set('AAPL', { data: { price: 1 }, timestamp: Date.now() });
    expect(disabled.tryCachedData('AAPL')).toBeNull();
  });

  test('an entry older than 300000 ms is deleted and reported as a miss', () => {
    aggregator['cache'].set('AAPL', { data: { price: 1 }, timestamp: Date.now() });
    jest.advanceTimersByTime(300001);

    expect(aggregator.tryCachedData('AAPL')).toBeNull();
    expect(aggregator.getCacheSize()).toBe(0); // the expired entry was evicted on read
  });

  test('an entry exactly at the TTL boundary is still served (age > ttl, not >=)', () => {
    aggregator['cache'].set('AAPL', { data: { price: 1 }, timestamp: Date.now() });
    jest.advanceTimersByTime(300000);
    expect(aggregator.tryCachedData('AAPL')).toEqual({ price: 1 });
  });
});

describe('DataAggregator tolerance helpers', () => {
  let aggregator: DataAggregator;

  beforeEach(() => {
    jest.useFakeTimers();
    aggregator = new DataAggregator(fakeClient() as any, baseConfig());
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('verifyPriceData uses the mean of the magnitudes as the denominator', () => {
    expect(aggregator.verifyPriceData(100, 101, 0.01)).toBe(true);
    expect(aggregator.verifyPriceData(100, 103, 0.01)).toBe(false);
    expect(aggregator.verifyPriceData(0, 0, 0.01)).toBe(true);
    expect(aggregator.verifyPriceData(0, 1, 0.5)).toBe(false);
  });

  test('verifyVolumeData has an explicit both-zero fast path', () => {
    expect(aggregator.verifyVolumeData(0, 0, 0)).toBe(true);
    expect(aggregator.verifyVolumeData(1000, 1040, 0.05)).toBe(true);
    expect(aggregator.verifyVolumeData(1000, 1200, 0.05)).toBe(false);
    expect(aggregator.verifyVolumeData(0, 5, 0.05)).toBe(false);
  });

  test('verifyTimestampData is a plain absolute-difference window', () => {
    expect(aggregator.verifyTimestampData(1000, 61000, 60000)).toBe(true);
    expect(aggregator.verifyTimestampData(1000, 61001, 60000)).toBe(false);
  });
});

describe('DataAggregator cache management', () => {
  let aggregator: DataAggregator;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(BASE_TIME);
    aggregator = new DataAggregator(fakeClient() as any, baseConfig());
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('getCacheEntries reports one row per symbol with its stored timestamp', async () => {
    client_seed(aggregator, 'AAPL', { price: 1 });
    client_seed(aggregator, 'MSFT', { price: 2 });

    const entries = aggregator.getCacheEntries();
    expect(entries).toEqual([
      { symbol: 'AAPL', timestamp: BASE_TIME.getTime() },
      { symbol: 'MSFT', timestamp: BASE_TIME.getTime() }
    ]);
    expect(aggregator.getCacheSize()).toBe(2);
  });

  test('clearCache empties the map', () => {
    client_seed(aggregator, 'AAPL', { price: 1 });
    aggregator.clearCache();
    expect(aggregator.getCacheSize()).toBe(0);
    expect(aggregator.tryCachedData('AAPL')).toBeNull();
  });

  function client_seed(target: DataAggregator, symbol: string, data: unknown): void {
    target['cache'].set(symbol, { data, timestamp: Date.now() });
  }
});

describe('DataAggregator unreachable private helpers', () => {
  let aggregator: DataAggregator;

  beforeEach(() => {
    jest.useFakeTimers();
    aggregator = new DataAggregator(fakeClient() as any, baseConfig());
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // mergeData, prioritizeFields and getSourcePriority are declared but never called by any
  // public method in this module — they are draft residue. Pinned so a future wiring decision
  // has the current semantics on record rather than a silent rewrite.
  test('mergeData only fills keys the target leaves undefined or null', () => {
    const merged = aggregator['mergeData']({ a: 1, b: null, c: undefined }, { a: 9, b: 2, c: 3, d: 4 });
    expect(merged).toEqual({ a: 1, b: 2, c: 3, d: 4 });
  });

  test('prioritizeFields reorders to priority-first and values each key by its ORIGINAL index', () => {
    const ranked = aggregator['prioritizeFields'](['a', 'b', 'c'], ['c']);
    expect(Object.keys(ranked)).toEqual(['c', 'a', 'b']);
    expect(ranked).toEqual({ c: 2, a: 0, b: 1 });
  });

  test('getSourcePriority filters to recognised names and defaults to the full list', () => {
    expect(aggregator['getSourcePriority'](['cached', 'nonsense']).sources).toEqual(['cached']);
    expect(aggregator['getSourcePriority'](['primary', 'secondary', 'tertiary', 'cached']).sources)
      .toEqual(['primary', 'secondary', 'tertiary', 'cached']);
    expect(aggregator['getSourcePriority'](['nothing-recognised']).sources)
      .toEqual(['primary', 'secondary', 'tertiary', 'cached']);
    expect(aggregator['getSourcePriority']([]).fallbackEnabled).toBe(true);
  });
});
