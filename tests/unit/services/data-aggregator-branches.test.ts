// Residual-branch suite for `src/services/data-aggregator.ts`, complementing
// `tests/unit/services/data-aggregator.test.ts` (which owns the module surface, the happy paths and
// the cache/TTL semantics). This file exists to reach the legs that suite never lands on: the
// cache-fallback `catch` blocks of `aggregateHistoricalData` (:105-113) and
// `aggregateFinancialData` (:138-146), the `sourceData.primary ?? sourceData.cached ?? {}`
// short-circuits (:82, :115, :148), the third source in each fallback chain (:99, :132), and the
// quiet legs of `validateStrictCompletion` (:381, :396), `assessDataQuality` (:412),
// `calculateCompleteness` (:424) and `extractNumber` (:531).
//
// `data-aggregator.ts` is unwired draft code — nothing in `src/` constructs it — so these are
// branch-truth tests of the module as written, not of a shipped request path.
//
// Timing: `tryWithRetry` backs off with real `setTimeout(2 ** attempt * 1000)` (:264-283), so every
// test runs on fake timers and drains the whole chain with `jest.runAllTimersAsync()`. Nothing here
// touches the network or sleeps on the wall clock.

import { DataAggregator } from '../../../src/services/data-aggregator';
import type { DataCompletionConfig } from '../../../src/types/config';

const BASE_TIME = new Date('2026-01-01T00:00:00.000Z');

const baseConfig = (overrides: Partial<DataCompletionConfig> = {}): DataCompletionConfig => ({
  enabled: true,
  level: 'moderate',
  requiredFields: [],
  preferredFields: [],
  allowPartial: true,
  fallbackToCache: true,
  ...overrides
});

type FakeClient = {
  getQuoteSummary: jest.Mock;
  getChart: jest.Mock;
  getQuote: jest.Mock;
};

const fakeClient = (overrides: Partial<FakeClient> = {}): FakeClient => {
  const client: FakeClient = {
    getQuoteSummary: jest.fn().mockResolvedValue({}),
    getChart: jest.fn().mockResolvedValue({} as never),
    getQuote: jest.fn().mockResolvedValue({ quoteResponse: { result: [] } })
  };
  for (const key of Object.keys(overrides) as Array<keyof FakeClient>) {
    client[key] = overrides[key] as jest.Mock;
  }
  return client;
};

const reporter = (): { reportDataQuality: jest.Mock; reportMissingFields: jest.Mock; reportAggregationSource: jest.Mock } => ({
  reportDataQuality: jest.fn(),
  reportMissingFields: jest.fn(),
  reportAggregationSource: jest.fn()
});

// Every fetch of this client rejects, so the retry chain exhausts and the catch block runs.
const deadClient = (message = 'upstream down'): FakeClient => ({
  getQuoteSummary: jest.fn().mockRejectedValue(new Error(message)),
  getChart: jest.fn().mockRejectedValue(new Error(message)),
  getQuote: jest.fn().mockRejectedValue(new Error(message))
});

async function settle<T>(promise: Promise<T>): Promise<{ fulfilled: boolean; value?: T; error?: unknown }> {
  let outcome: { fulfilled: boolean; value?: T; error?: unknown } = { fulfilled: false };
  const tracked = promise.then(
    (value) => { outcome = { fulfilled: true, value }; },
    (error) => { outcome = { fulfilled: false, error }; }
  );
  await jest.runAllTimersAsync();
  await tracked;
  return outcome;
}

describe('DataAggregator: a primary source that resolves undefined', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(BASE_TIME);
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  test('aggregateQuoteData still returns a fully-null QuoteResult rather than throwing', async () => {
    const aggregator = new DataAggregator(
      fakeClient({ getQuoteSummary: jest.fn().mockResolvedValue(undefined) }) as never,
      baseConfig()
    );
    const spy = reporter();
    aggregator.setQualityReporter(spy as never);

    const outcome = await settle(aggregator.aggregateQuoteData('AAPL', []));

    expect(outcome.fulfilled).toBe(true);
    const price = (outcome.value as { price: Record<string, unknown> }).price;
    // `sourceData.primary ?? sourceData.cached ?? {}` reaches its third leg, so transformToQuoteResult
    // sees an empty record: every number is null and the symbol is the hardcoded ''.
    expect(price['symbol']).toBe('');
    expect(price['regularMarketPrice']).toBeNull();
    expect(price['marketCap']).toBeNull();
    expect(spy.reportAggregationSource).toHaveBeenCalledWith('AAPL', 'quote', 'primary');
    expect(spy.reportDataQuality).toHaveBeenCalledWith('AAPL', 'quote', 'high', { completeness: 1 });
  });

  test('aggregateHistoricalData serves the empty record it just computed', async () => {
    const aggregator = new DataAggregator(
      fakeClient({ getChart: jest.fn().mockResolvedValue(undefined) }) as never,
      baseConfig()
    );
    const spy = reporter();
    aggregator.setQualityReporter(spy as never);

    await expect(aggregator.aggregateHistoricalData('AAPL', [])).resolves.toEqual({});
    expect(spy.reportDataQuality).toHaveBeenCalledWith('AAPL', 'historical', 'high', { completeness: 1 });
  });

  test('aggregateFinancialData returns its hardcoded empty statement envelope', async () => {
    const aggregator = new DataAggregator(
      fakeClient({ getQuoteSummary: jest.fn().mockResolvedValue(undefined) }) as never,
      baseConfig()
    );

    const result = await aggregator.aggregateFinancialData('AAPL', []);

    expect(Object.keys(result).sort()).toEqual([
      'balanceSheetHistory',
      'balanceSheetHistoryQuarterly',
      'cashflowStatementHistory',
      'cashflowStatementHistoryQuarterly',
      'incomeStatementHistory',
      'incomeStatementHistoryQuarterly'
    ]);
    // DEFECT: transformToFinancialResult ignores its argument entirely, so an undefined primary and a
    // fully populated one produce byte-identical output.
    expect(result.incomeStatementHistory).toEqual({ maxAge: 0, quarterly: [], annual: [] });
  });
});

describe('DataAggregator cache-fallback legs in the aggregate catch blocks', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(BASE_TIME);
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  test('historical: an empty cache makes tryCachedData return null, and the original error rethrows', async () => {
    const aggregator = new DataAggregator(deadClient() as never, baseConfig());
    const spy = reporter();
    aggregator.setQualityReporter(spy as never);

    const outcome = await settle(aggregator.aggregateHistoricalData('AAPL', []));

    expect(outcome.fulfilled).toBe(false);
    expect((outcome.error as Error).message).toBe('upstream down');
    expect(spy.reportAggregationSource).not.toHaveBeenCalled();
  });

  test('historical: a cached object payload is served and reported as the source', async () => {
    const client = fakeClient({ getChart: jest.fn().mockResolvedValue({ timestamps: [1, 2] }) });
    const aggregator = new DataAggregator(client as never, baseConfig());
    const spy = reporter();
    aggregator.setQualityReporter(spy as never);

    await aggregator.aggregateHistoricalData('AAPL', []);
    client.getChart = jest.fn().mockRejectedValue(new Error('chart gone'));
    client.getQuoteSummary = jest.fn().mockRejectedValue(new Error('summary gone'));

    const outcome = await settle(aggregator.aggregateHistoricalData('AAPL', []));

    expect(outcome.fulfilled).toBe(true);
    expect(outcome.value).toEqual({ timestamps: [1, 2] });
    expect(spy.reportAggregationSource).toHaveBeenLastCalledWith('AAPL', 'historical', 'cached');
  });

  test('historical: a cached non-object payload fails the typeof guard and rethrows', async () => {
    const client = fakeClient({ getChart: jest.fn().mockResolvedValue('plain string' as never) });
    const aggregator = new DataAggregator(client as never, baseConfig());
    await aggregator.aggregateHistoricalData('AAPL', []);

    client.getChart = jest.fn().mockRejectedValue(new Error('chart gone'));
    client.getQuoteSummary = jest.fn().mockRejectedValue(new Error('summary gone'));

    const outcome = await settle(aggregator.aggregateHistoricalData('AAPL', []));
    expect(outcome.fulfilled).toBe(false);
    expect((outcome.error as Error).message).toBe('chart gone');
  });

  test('financial: an empty cache rethrows the primary error', async () => {
    const aggregator = new DataAggregator(deadClient('quoteSummary 500') as never, baseConfig());
    const spy = reporter();
    aggregator.setQualityReporter(spy as never);

    const outcome = await settle(aggregator.aggregateFinancialData('AAPL', []));

    expect(outcome.fulfilled).toBe(false);
    expect((outcome.error as Error).message).toBe('quoteSummary 500');
    expect(spy.reportAggregationSource).not.toHaveBeenCalled();
  });

  test('financial: a cached object is served, but the transform discards it', async () => {
    const payload = { incomeStatementHistory: { annual: [{ totalRevenue: 1 }] } };
    const client = fakeClient({ getQuoteSummary: jest.fn().mockResolvedValue(payload) });
    const aggregator = new DataAggregator(client as never, baseConfig());
    const spy = reporter();
    aggregator.setQualityReporter(spy as never);

    await aggregator.aggregateFinancialData('AAPL', []);
    client.getQuoteSummary = jest.fn().mockRejectedValue(new Error('summary gone'));

    const outcome = await settle(aggregator.aggregateFinancialData('AAPL', []));

    expect(spy.reportAggregationSource).toHaveBeenLastCalledWith('AAPL', 'financial', 'cached');
    // DEFECT: the cached annual row is present but transformToFinancialResult hardcodes empty arrays.
    expect(outcome.value).toEqual({
      incomeStatementHistory: { maxAge: 0, quarterly: [], annual: [] },
      balanceSheetHistory: { maxAge: 0, quarterly: [], annual: [] },
      cashflowStatementHistory: { maxAge: 0, quarterly: [], annual: [] },
      incomeStatementHistoryQuarterly: { maxAge: 0, quarterly: [], annual: [] },
      balanceSheetHistoryQuarterly: { maxAge: 0, quarterly: [], annual: [] },
      cashflowStatementHistoryQuarterly: { maxAge: 0, quarterly: [], annual: [] }
    });
  });

  test('financial: a cached non-object payload rethrows instead of serving garbage', async () => {
    const client = fakeClient({ getQuoteSummary: jest.fn().mockResolvedValue(42 as never) });
    const aggregator = new DataAggregator(client as never, baseConfig());
    await aggregator.aggregateFinancialData('AAPL', []);

    client.getQuoteSummary = jest.fn().mockRejectedValue(new Error('summary gone'));

    const outcome = await settle(aggregator.aggregateFinancialData('AAPL', []));
    expect(outcome.fulfilled).toBe(false);
    expect((outcome.error as Error).message).toBe('summary gone');
  });

  test('DEFECT: fallbackToCache:false turns a cache hit into a rethrow of the original error', async () => {
    const client = fakeClient({ getChart: jest.fn().mockResolvedValue({ timestamps: [1] }) });
    const aggregator = new DataAggregator(client as never, baseConfig({ fallbackToCache: false }));

    await aggregator.aggregateHistoricalData('AAPL', []);
    expect(aggregator.getCacheSize()).toBe(1);

    client.getChart = jest.fn().mockRejectedValue(new Error('chart gone'));
    client.getQuoteSummary = jest.fn().mockRejectedValue(new Error('summary gone'));

    const outcome = await settle(aggregator.aggregateHistoricalData('AAPL', []));
    expect(outcome.fulfilled).toBe(false);
    expect(aggregator.tryCachedData('AAPL')).toBeNull();
  });
});

describe('DataAggregator third leg of each fallback chain', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(BASE_TIME);
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  test('historical falls through both chart intervals to a quoteSummary price module', async () => {
    const client = fakeClient({
      getChart: jest.fn((_symbol: string, interval: string) =>
        Promise.reject(new Error(`chart ${interval} down`))),
      getQuoteSummary: jest.fn().mockResolvedValue({ price: { regularMarketPrice: 7 } })
    });
    const aggregator = new DataAggregator(client as never, baseConfig());

    const outcome = await settle(aggregator.aggregateHistoricalData('AAPL', []));

    expect(outcome.fulfilled).toBe(true);
    expect(outcome.value).toEqual({ price: { regularMarketPrice: 7 } });
    expect(client.getChart).toHaveBeenCalledWith('AAPL', '1d', '1mo');
    expect(client.getChart).toHaveBeenCalledWith('AAPL', '1wk', '1mo');
    expect(client.getQuoteSummary).toHaveBeenCalledWith('AAPL', ['price']);
  });

  test('financial falls through annual and quarterly statements to defaultKeyStatistics', async () => {
    const client = fakeClient({
      getQuoteSummary: jest.fn((_symbol: string, modules: string[]) => {
        if (modules.includes('defaultKeyStatistics')) {
          return Promise.resolve({ beta: 1.2 });
        }
        return Promise.reject(new Error(`no ${modules[0]}`));
      })
    });
    const aggregator = new DataAggregator(client as never, baseConfig());

    const outcome = await settle(aggregator.aggregateFinancialData('AAPL', []));

    expect(outcome.fulfilled).toBe(true);
    expect(client.getQuoteSummary).toHaveBeenCalledWith('AAPL', ['defaultKeyStatistics']);
    // DEFECT: the winning payload is thrown away by the transform, so the caller cannot tell the
    // three sources apart.
    expect(outcome.value).toMatchObject({ incomeStatementHistory: { maxAge: 0, annual: [] } });
  });
});

describe('DataAggregator.selectBestSource fallthrough', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(BASE_TIME);
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  test('an undefined candidate in the priority list is skipped for the next source', () => {
    const aggregator = new DataAggregator(fakeClient() as never, baseConfig());
    expect(
      aggregator.selectBestSource({ primary: undefined, secondary: { price: 2 } }, ['primary', 'secondary'])
    ).toEqual({ price: 2 });
  });

  test('a priority list of only-undefined candidates reaches the empty-object default', () => {
    const aggregator = new DataAggregator(fakeClient() as never, baseConfig());
    expect(aggregator.selectBestSource({ primary: undefined }, ['primary'])).toEqual({});
    expect(aggregator.selectBestSource({}, ['primary'])).toEqual({});
  });
});

describe('DataAggregator.validateStrictCompletion quiet legs', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(BASE_TIME);
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  test('strict level with every required field present reports nothing and returns the data', () => {
    const aggregator = new DataAggregator(
      fakeClient() as never,
      baseConfig({ level: 'strict', requiredFields: ['price'], allowPartial: false })
    );
    const spy = reporter();
    aggregator.setQualityReporter(spy as never);

    expect(aggregator.completeMissingFields({ price: 10 }, {})).toEqual({ price: 10 });
    expect(spy.reportMissingFields).not.toHaveBeenCalled();
  });

  test('strict + allowPartial with no onIncomplete hook reports but neither throws nor calls back', () => {
    const aggregator = new DataAggregator(
      fakeClient() as never,
      baseConfig({ level: 'strict', requiredFields: ['price'], allowPartial: true })
    );
    const spy = reporter();
    aggregator.setQualityReporter(spy as never);

    expect(aggregator.completeMissingFields({}, {})).toEqual({});
    expect(spy.reportMissingFields).toHaveBeenCalledWith('unknown', 'unknown', ['price']);
  });
});

describe('DataAggregator quality grading and extraction edges', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(BASE_TIME);
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  test('a 0.8 completeness ratio is graded medium, and an explicit null counts as absent', async () => {
    const aggregator = new DataAggregator(
      fakeClient({
        getChart: jest.fn().mockResolvedValue({ f1: 1, f2: 2, f3: 3, f4: 4, f5: null })
      }) as never,
      baseConfig({ requiredFields: ['f1', 'f2', 'f3', 'f4', 'f5'] })
    );
    const spy = reporter();
    aggregator.setQualityReporter(spy as never);

    await aggregator.aggregateHistoricalData('AAPL', []);

    expect(spy.reportDataQuality).toHaveBeenCalledWith('AAPL', 'historical', 'medium', {
      completeness: 0.8
    });
  });

  test('a `{raw}` box only yields a number when raw is actually a number', async () => {
    const aggregator = new DataAggregator(
      fakeClient({
        getQuoteSummary: jest.fn().mockResolvedValue({
          regularMarketPrice: { raw: 'not-a-number' },
          marketCap: { raw: 5000 },
          beta: { raw: null },
          trailingPE: '12.5',
          forwardPE: 'oops'
        })
      }) as never,
      baseConfig()
    );

    const result = await aggregator.aggregateQuoteData('AAPL', []);

    expect(result.price.regularMarketPrice).toBeNull();
    expect(result.price.marketCap).toBe(5000);
    expect(result.price.beta).toBeNull();
    // A numeric string is parsed; a non-numeric one becomes null rather than NaN.
    expect(result.price.trailingPE).toBe(12.5);
    expect(result.price.forwardPE).toBeNull();
  });
});
