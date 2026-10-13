import { QuoteTools, QuoteMetaSchema, GetQuoteOutputSchema } from '../../../src/tools/quotes';
import { DataQualityReporter } from '../../../src/utils/data-completion';
import { YahooFinanceError, YF_ERR_RATE_LIMIT } from '../../../src/types/errors';
import type { QuoteResult } from '../../../src/types/yahoo-finance';
import type { YahooFinanceClient } from '../../../src/services/yahoo-finance';

// src/tools/quotes.ts exports the CLASS `QuoteTools` (there is no `QuotesTools`) plus its
// zod contracts. It is constructed exactly once as
// `new QuoteTools(this.yahooClient, this.qualityReporter)` (src/server.ts:213), so the
// seam under test is the injected YahooFinanceClient: `getQuote` calls
// `client.getQuote(symbol, options)` once per symbol, and `getQuoteSummary` calls
// `client.getSummaryProfile(symbol, { validate: true })` with `client.getQuote(symbol)`
// as its fallback. `getQuote` does NOT run zod — src/server.ts:275 casts the args — so
// the grammar gate that actually fires here is InputValidator.validateSymbols.
// Handlers return a PLAIN OBJECT; src/server.ts:583 is what wraps it in MCP `content`.

function fullQuote(symbol: string = 'AAPL'): QuoteResult {
  return {
    price: {
      symbol,
      regularMarketPrice: 175.5,
      regularMarketChange: 2.5,
      regularMarketChangePercent: 1.45,
      regularMarketVolume: 50000000,
      marketCap: 2800000000000
    },
    meta: {
      symbol,
      currency: 'USD',
      exchangeName: 'NasdaqGS',
      instrumentType: 'EQUITY',
      exchangeTimezoneName: 'America/New_York',
      regularMarketTime: Date.now()
    }
  } as unknown as QuoteResult;
}

function quoteWithNullPrice(symbol: string = 'AAPL'): QuoteResult {
  return {
    price: {
      symbol,
      regularMarketPrice: null,
      regularMarketChange: null,
      regularMarketChangePercent: null,
      regularMarketVolume: null,
      marketCap: null
    },
    meta: {
      symbol,
      currency: null,
      exchangeName: null,
      instrumentType: null,
      exchangeTimezoneName: null,
      regularMarketTime: null
    }
  } as unknown as QuoteResult;
}

function rateLimitError(symbol: string): YahooFinanceError {
  return new YahooFinanceError(
    `${YF_ERR_RATE_LIMIT}: rate limited for ${symbol}`,
    YF_ERR_RATE_LIMIT,
    429,
    true,
    true,
    { symbol },
    'Back off and retry'
  );
}

describe('QuoteTools', () => {
  let tools: QuoteTools;
  let getQuote: jest.Mock;
  let getSummaryProfile: jest.Mock;
  let cachedStore: Map<string, unknown>;

  beforeEach(() => {
    getQuote = jest.fn();
    getSummaryProfile = jest.fn();
    cachedStore = new Map();

    // YahooFinanceClient keeps its Cache on a private `cache` field; quotes.ts reaches it
    // as `yahooClient.cache.get(key)` for the rate-limit fallback, so the stub exposes one.
    const client = {
      getQuote,
      getSummaryProfile,
      cache: { get: (key: string) => (cachedStore.has(key) ? cachedStore.get(key) : null) }
    } as unknown as YahooFinanceClient;

    tools = new QuoteTools(client, new DataQualityReporter());
  });

  describe('getQuote', () => {
    test('returns a plain per-symbol payload, never an MCP content array', async () => {
      getQuote.mockResolvedValue(fullQuote('AAPL'));

      const result = await tools.getQuote({ symbols: ['AAPL'] });

      expect(result).not.toHaveProperty('content');
      expect(Object.keys(result.results)).toEqual(['AAPL']);
      expect(result.results.AAPL).toHaveProperty('data');
      expect(result.results.AAPL).toHaveProperty('meta');
      expect(result.summary.totalRequested).toBe(1);
      expect(result.summary.totalReturned).toBe(1);
    });

    test('carries the meta contract and satisfies QuoteMetaSchema', async () => {
      getQuote.mockResolvedValue(fullQuote('AAPL'));

      const result = await tools.getQuote({ symbols: ['AAPL'] });
      const meta = result.results.AAPL.meta;

      expect(QuoteMetaSchema.parse(meta)).toEqual(meta);
      expect(meta.fromCache).toBe(false);
      expect(typeof meta.dataAge).toBe('number');
      expect(meta.completenessScore).toBe(1);
      expect(meta.warnings).toEqual([]);
    });

    test('maps the flattened quote onto the declared data fields', async () => {
      getQuote.mockResolvedValue(fullQuote('AAPL'));

      const result = await tools.getQuote({ symbols: ['AAPL'] });

      expect(result.results.AAPL.data).toMatchObject({
        regularMarketPrice: 175.5,
        regularMarketChange: 2.5,
        regularMarketChangePercent: 1.45,
        regularMarketVolume: 50000000,
        marketCap: 2800000000000
      });
      expect(GetQuoteOutputSchema.parse(result)).toEqual(result);
    });

    test('forwards fields, forceRefresh and timeout and disables its own cache on refresh', async () => {
      getQuote.mockResolvedValue(fullQuote('MSFT'));

      await tools.getQuote({
        symbols: ['MSFT'],
        fields: ['regularMarketPrice'],
        forceRefresh: true,
        timeout: 5000
      });

      expect(getQuote).toHaveBeenCalledWith('MSFT', {
        fields: ['regularMarketPrice'],
        forceRefresh: true,
        timeout: 5000,
        useCache: false
      });

      await tools.getQuote({ symbols: ['MSFT'] });

      expect(getQuote).toHaveBeenLastCalledWith('MSFT', {
        fields: undefined,
        forceRefresh: false,
        timeout: undefined,
        useCache: true
      });
    });

    test('keeps only the requested fields in the payload', async () => {
      getQuote.mockResolvedValue(fullQuote('AAPL'));

      const result = await tools.getQuote({ symbols: ['AAPL'], fields: ['regularMarketPrice'] });

      expect(result.results.AAPL.data.regularMarketPrice).toBe(175.5);
      expect(result.results.AAPL.data.marketCap).toBeUndefined();
      expect(result.results.AAPL.data.regularMarketVolume).toBeUndefined();
    });

    test('degrades a quote with no values instead of throwing', async () => {
      getQuote.mockResolvedValue(quoteWithNullPrice('AAPL'));

      const result = await tools.getQuote({ symbols: ['AAPL'] });
      const meta = result.results.AAPL.meta;

      expect(result.summary.totalReturned).toBe(1);
      expect(meta.completenessScore).toBeLessThan(1);
      expect(meta.warnings).toContain('Missing current price');
      expect(meta.warnings).toContain('Missing volume data');
      expect(meta.warnings).toContain('Low data completeness (<50%)');
    });

    test('warns when the quote timestamp is older than the delayed-data threshold', async () => {
      const stale = fullQuote('AAPL');
      (stale.meta as { regularMarketTime: number }).regularMarketTime = Date.now() - 20 * 60 * 1000;
      getQuote.mockResolvedValue(stale);

      const result = await tools.getQuote({ symbols: ['AAPL'] });

      expect(result.results.AAPL.meta.warnings).toContain('Data is delayed (15+ minutes)');
      expect(result.results.AAPL.meta.dataAge).toBeGreaterThan(15 * 60 * 1000);
    });

    test('collects per-symbol errors and still returns the symbols that worked', async () => {
      getQuote.mockImplementation((symbol: string) =>
        symbol === 'BAD' ? Promise.reject(new Error('no data for BAD')) : Promise.resolve(fullQuote(symbol))
      );

      const result = await tools.getQuote({ symbols: ['AAPL', 'BAD', 'MSFT'] });

      expect(Object.keys(result.results).sort()).toEqual(['AAPL', 'MSFT']);
      expect(result.summary.totalRequested).toBe(3);
      expect(result.summary.totalReturned).toBe(2);
      expect(result.summary.errors).toEqual([{ symbol: 'BAD', error: 'no data for BAD' }]);
      expect(result.summary.rateLimited).toBe(false);
    });

    test('flags the summary as rate limited when a rate-limited symbol has no cached copy', async () => {
      getQuote.mockRejectedValue(rateLimitError('AAPL'));

      const result = await tools.getQuote({ symbols: ['AAPL'] });

      expect(result.summary.rateLimited).toBe(true);
      expect(result.summary.errors[0].symbol).toBe('AAPL');
      expect(result.summary.errors[0].error).toContain(YF_ERR_RATE_LIMIT);
      expect(result.results).toEqual({});
    });

    test('serves the cached quote when the live call is rate limited', async () => {
      cachedStore.set('quote:AAPL', fullQuote('AAPL'));
      getQuote.mockRejectedValue(rateLimitError('AAPL'));

      const result = await tools.getQuote({ symbols: ['AAPL'] });

      expect(result.summary.rateLimited).toBe(false);
      expect(result.summary.totalReturned).toBe(1);
      expect(result.summary.fromCache).toBe(1);
      expect(result.results.AAPL.meta.fromCache).toBe(true);
      expect(result.results.AAPL.data.regularMarketPrice).toBe(175.5);
    });

    test('splits a large request into batches of ten and calls the client per symbol', async () => {
      const symbols = Array.from({ length: 11 }, (_, i) => `SYM${i}`);
      getQuote.mockImplementation((symbol: string) => Promise.resolve(fullQuote(symbol)));

      const result = await tools.getQuote({ symbols });

      expect(getQuote).toHaveBeenCalledTimes(11);
      expect(result.summary.totalReturned).toBe(11);
      expect(Object.keys(result.results)).toHaveLength(11);
    }, 20000);

    test('rejects invalid symbol grammar before touching the client', async () => {
      await expect(tools.getQuote({ symbols: ['aapl'] })).rejects.toThrow('Symbol contains invalid characters');
      expect(getQuote).not.toHaveBeenCalled();

      await expect(tools.getQuote({ symbols: [] })).rejects.toThrow('Symbols array cannot be empty');
      await expect(tools.getQuote({ symbols: ['AAPL', 'AAPL'] })).rejects.toThrow('Duplicate symbols are not allowed');

      const tooMany = Array.from({ length: 51 }, (_, i) => `SYM${i}`);
      await expect(tools.getQuote({ symbols: tooMany })).rejects.toThrow('Maximum 50 symbols per request');
      expect(getQuote).not.toHaveBeenCalled();
    });

    test('rejects a field name that is not a string', async () => {
      getQuote.mockResolvedValue(fullQuote('AAPL'));

      await expect(
        tools.getQuote({ symbols: ['AAPL'], fields: [42 as unknown as string] })
      ).rejects.toThrow('field must be a string');
    });
  });

  describe('getQuoteSummary', () => {
    test('returns a plain summary payload with completeness and quality metadata', async () => {
      getSummaryProfile.mockResolvedValue({
        price: { regularMarketPrice: 175.5, regularMarketTime: Date.now() },
        summaryDetail: { marketCap: 2800000000000 },
        defaultKeyStatistics: { trailingPE: 30.1 },
        financialData: { currentPrice: 175.5 }
      });

      const result = await tools.getQuoteSummary({ symbol: 'AAPL' });

      expect(result).not.toHaveProperty('content');
      expect(result.symbol).toBe('AAPL');
      expect(result.modules).toEqual(['defaultKeyStatistics', 'summaryDetail', 'financialData', 'price']);
      expect(result.completenessPercentage).toBe(100);
      // flattenSummaryData prefixes every key with its module name, so the tool's own
      // identifyMissingFields (quotes.ts:572) never matches the camelCase names it looks
      // for and reports all five canonical fields as missing on a complete payload.
      expect(result.missingFields).toEqual([
        'regularMarketPrice',
        'regularMarketChange',
        'regularMarketChangePercent',
        'regularMarketVolume',
        'marketCap'
      ]);
      expect(result.metadata.sourceReliability).toBe('high');
      expect(result.metadata.lastSuccessfulUpdate).toEqual(expect.any(Number));
      expect(result.metadata.dataAge).toBeGreaterThanOrEqual(0);
      expect(result.metadata.warnings.some((w) => w.includes('Missing critical fields'))).toBe(true);
      expect(typeof result.metadata.recommendation).toBe('string');
      expect(result.alternativeModules).toBeUndefined();
    });

    test('honours an explicit module list and keeps only the requested modules', async () => {
      getSummaryProfile.mockResolvedValue({
        price: { regularMarketPrice: 175.5 },
        summaryDetail: { marketCap: 1 },
        financialData: { currentPrice: 1 }
      });

      const result = await tools.getQuoteSummary({ symbol: 'AAPL', modules: ['price'] });

      expect(result.modules).toEqual(['price']);
      expect(Object.keys(result.data)).toEqual(['price.regularMarketPrice']);
    });

    test('falls back to quote data when the summary endpoint fails', async () => {
      getSummaryProfile.mockRejectedValue(new Error('summary endpoint down'));
      getQuote.mockResolvedValue(fullQuote('AAPL'));

      const result = await tools.getQuoteSummary({ symbol: 'AAPL' });

      expect(getQuote).toHaveBeenCalledWith('AAPL');
      expect(result.data).toMatchObject({ regularMarketPrice: 175.5, marketCap: 2800000000000 });
      expect(result.missingFields).toEqual(['regularMarketChange', 'regularMarketChangePercent']);
      // completeness scores only the keys that are present, so a payload that carries
      // three of the five canonical fields still reports 100.
      expect(result.completenessPercentage).toBe(100);
    });

    test('degrades to a zero-completeness payload when every requested module is absent', async () => {
      getSummaryProfile.mockResolvedValue({ somethingElse: { x: 1 } });

      const result = await tools.getQuoteSummary({ symbol: 'AAPL' });

      expect(result.data).toEqual({});
      expect(result.completenessPercentage).toBe(0);
      expect(result.missingFields).toEqual([
        'regularMarketPrice',
        'regularMarketChange',
        'regularMarketChangePercent',
        'regularMarketVolume',
        'marketCap'
      ]);
      expect(result.metadata.sourceReliability).toBe('low');
    });

    test('rejects when both the summary endpoint and the quote fallback fail', async () => {
      getSummaryProfile.mockRejectedValue(new Error('summary endpoint down'));
      getQuote.mockRejectedValue(new Error('quote endpoint down'));

      await expect(tools.getQuoteSummary({ symbol: 'AAPL' })).rejects.toThrow('quote endpoint down');
    });

    test('retryOnFailure walks every alternative module combination before giving up', async () => {
      getSummaryProfile.mockRejectedValue(new Error('summary endpoint down'));
      getQuote.mockRejectedValue(new Error('quote endpoint down'));

      await expect(
        tools.getQuoteSummary({ symbol: 'AAPL', retryOnFailure: true })
      ).rejects.toThrow('quote endpoint down');

      // one primary attempt plus the five combinations generated for the default module list
      expect(getSummaryProfile).toHaveBeenCalledTimes(6);
      expect(getQuote).toHaveBeenCalledTimes(6);
    });

    test('reports every alternative combination it tried after the primary call failed', async () => {
      getSummaryProfile.mockRejectedValueOnce(new Error('summary endpoint down'));
      getQuote.mockRejectedValueOnce(new Error('quote endpoint down'));
      getSummaryProfile.mockResolvedValue({ price: { regularMarketPrice: 175.5 } });
      getQuote.mockResolvedValue(fullQuote('AAPL'));

      const result = await tools.getQuoteSummary({
        symbol: 'AAPL',
        modules: ['price', 'summaryDetail'],
        retryOnFailure: true
      });

      // essential pair, each non-essential requested module, then the two hardcoded pairs
      expect(result.alternativeModules).toEqual([
        { modules: ['summaryDetail', 'defaultKeyStatistics'], success: true, fieldsProvided: [] },
        { modules: ['price'], success: true, fieldsProvided: ['price'] },
        { modules: ['price', 'summaryDetail'], success: true, fieldsProvided: ['price'] },
        { modules: ['financialData', 'defaultKeyStatistics'], success: true, fieldsProvided: [] }
      ]);
      // the first "successful" alternative extracted nothing, and later successes do not
      // overwrite it (quotes.ts:293), so the payload stays empty even though two
      // alternatives returned the price module.
      expect(result.data).toEqual({});
      expect(result.completenessPercentage).toBe(0);
    });

    test('skips the symbol grammar gate that getQuote applies', async () => {
      // getQuoteSummary never calls InputValidator (quotes.ts:271), so a symbol that
      // get_quote would reject is forwarded to the client verbatim here.
      getSummaryProfile.mockResolvedValue({ price: { regularMarketPrice: 1 } });

      const result = await tools.getQuoteSummary({ symbol: 'bad symbol!' });

      expect(getSummaryProfile).toHaveBeenCalledWith('bad symbol!', { validate: true });
      expect(result.symbol).toBe('bad symbol!');
    });
  });
});
