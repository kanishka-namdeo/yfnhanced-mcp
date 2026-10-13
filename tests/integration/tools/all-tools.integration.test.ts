import { QuoteTools } from '../../../src/tools/quotes';
import { DataQualityReporter } from '../../../src/utils/data-completion';
import {
  getBalanceSheetTool,
  getIncomeStatementTool,
  getCashFlowStatementTool,
  getFinancialsToolDefinitions,
  clearFinancialsCache
} from '../../../src/tools/financials';
import { getMajorHoldersTool, getHoldersToolDefinitions, clearHoldersCache } from '../../../src/tools/holders';
import { getCompanyNewsTool, getNewsToolDefinitions, clearNewsCache } from '../../../src/tools/news';
import { getOptionsTool, getOptionsToolDefinitions, clearOptionsCache } from '../../../src/tools/options';
import { yahooFinance } from '../../../src/services/yahoo-finance';
import {
  FinancialsInputSchema,
  HoldersInputSchema,
  NewsInputSchema,
  OptionsInputSchema,
  HistoricalInputSchema,
  EarningsInputSchema,
  AnalysisInputSchema
} from '../../../src/schemas/index';
import { YahooFinanceError, YF_ERR_RATE_LIMIT, YF_ERR_SYMBOL_NOT_FOUND } from '../../../src/types/errors';
import { SecurityError } from '../../../src/utils/security';

// The network seam for the tool layer is not one thing. `quotes.ts`, `historical.ts` and
// `summary.ts` call methods on the injected `YahooFinanceClient`; `financials.ts`,
// `holders.ts`, `news.ts` and `options.ts` reach the process-wide `yahooFinance` singleton
// exported by the same module. Mocking `yahoo-finance2` — which is what this file used to do
// — left every `mockResolvedValue` landing on a member the source never calls, and mocking
// `src/tools/holders` etc. turned the exported definition functions into `undefined`.
// So: mock the service module, keep every tool module real, and stub the seams per family.
jest.mock('../../../src/services/yahoo-finance', () => ({
  yahooFinance: {
    quote: jest.fn(),
    chart: jest.fn(),
    quoteSummary: jest.fn(),
    fundamentalsTimeSeries: jest.fn(),
    search: jest.fn(),
    options: jest.fn(),
    trendingSymbols: jest.fn(),
    screener: jest.fn()
  },
  YahooFinanceClient: class {
    initialize(): Promise<void> {
      return Promise.resolve();
    }
  },
  toOptionContract: (contract: unknown): unknown => contract
}));

const library = yahooFinance as unknown as Record<string, jest.Mock>;

type StatementRow = Record<string, unknown>;

function balanceSheetRow(date: string, overrides: StatementRow = {}): StatementRow {
  return {
    TYPE: 'BALANCE_SHEET',
    date: new Date(date),
    totalAssets: 352583000000,
    totalLiabilitiesNetMinorityInterest: 290437000000,
    stockholdersEquity: 62146000000,
    cashAndCashEquivalents: 29965000000,
    cashCashEquivalentsAndShortTermInvestments: 31775000000,
    receivables: 29508000000,
    inventory: 6331000000,
    currentAssets: 143566000000,
    currentLiabilities: 145306000000,
    longTermDebt: 95281000000,
    netPPE: 43715000000,
    goodwill: 1400000000,
    otherIntangibleAssets: 7000000000,
    retainedEarnings: 21423000000,
    ...overrides
  };
}

function incomeStatementRow(date: string, overrides: StatementRow = {}): StatementRow {
  return {
    TYPE: 'FINANCIALS',
    date: new Date(date),
    totalRevenue: 383285000000,
    costOfRevenue: 214137000000,
    grossProfit: 169148000000,
    operatingIncome: 114301000000,
    EBITDA: 126332000000,
    netIncome: 96995000000,
    basicEPS: 1.64,
    dilutedEPS: 1.62,
    ...overrides
  };
}

function cashFlowRow(date: string, overrides: StatementRow = {}): StatementRow {
  return {
    TYPE: 'CASH_FLOW',
    date: new Date(date),
    operatingCashFlow: 110543000000,
    capitalExpenditure: -10957000000,
    cashFlowFromContinuingFinancingActivities: -104954000000,
    cashFlowFromContinuingInvestingActivities: -7399000000,
    freeCashFlow: 99586000000,
    ...overrides
  };
}

type RowSet = {
  balanceSheet?: StatementRow[];
  incomeStatement?: StatementRow[];
  cashFlow?: StatementRow[];
};

function stubRows(rows: RowSet): void {
  library.fundamentalsTimeSeries.mockImplementation(
    async (_symbol: string, options: { module: string }) => {
      if (options.module === 'balance-sheet') return rows.balanceSheet ?? [];
      if (options.module === 'financials') return rows.incomeStatement ?? [];
      if (options.module === 'cash-flow') return rows.cashFlow ?? [];
      return [];
    }
  );
}

function rawQuote(symbol: string, price: number): Record<string, unknown> {
  return {
    price: {
      symbol,
      regularMarketPrice: price,
      regularMarketChange: 2.3,
      regularMarketChangePercent: 1.33,
      regularMarketPreviousClose: price - 2.3,
      regularMarketOpen: price - 1,
      regularMarketDayHigh: price + 1,
      regularMarketDayLow: price - 1,
      regularMarketVolume: 50000000,
      marketCap: 2800000000000,
      fiftyTwoWeekHigh: price * 1.2,
      fiftyTwoWeekLow: price * 0.7,
      averageDailyVolume3Month: 52000000,
      averageDailyVolume10Day: 48000000,
      trailingPE: 30.1,
      forwardPE: 27.4,
      trailingEps: 6.1,
      forwardEps: 6.8,
      dividendRate: 0.96,
      dividendYield: 0.51,
      beta: 1.21,
      sharesOutstanding: 15000000000,
      averageTrueRange: 2.4,
      currency: 'USD',
      marketState: 'REGULAR',
      quoteType: 'EQUITY',
      exchange: 'NMS',
      exchangeTimezoneName: 'America/New_York',
      gmtOffSetMilliseconds: -14400000
    },
    meta: {
      symbol,
      currency: 'USD',
      exchangeName: 'NasdaqGS',
      instrumentType: 'EQUITY',
      exchangeTimezoneName: 'America/New_York',
      regularMarketTime: Date.now()
    }
  };
}

type QuoteOutput = {
  results: Record<string, { data: Record<string, number | undefined>; meta: {
    fromCache: boolean;
    dataAge: number;
    completenessScore: number;
    warnings: string[];
  } }>;
  summary: {
    totalRequested: number;
    totalReturned: number;
    fromCache: number;
    rateLimited: boolean;
    errors: Array<{ symbol: string; error: string }>;
  };
};

type StatementOutput = {
  symbol: string;
  statements: Array<Record<string, unknown>>;
  meta: { completenessScore: number; warnings: string[]; recency: string; fromCache: boolean; dataAge: number };
};

describe('All Tools Integration Tests', () => {
  let client: Record<string, jest.Mock | unknown>;
  let quoteTools: QuoteTools;
  let reporter: DataQualityReporter;

  beforeAll(() => {
    // getQuote paces multi-batch requests with a real 200 ms setTimeout per batch boundary;
    // fake timers keep that from costing wall-clock time.
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-16T09:30:00.000Z'));
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    clearFinancialsCache();
    clearNewsCache();
    clearOptionsCache();
    clearHoldersCache();

    client = {
      getQuote: jest.fn(),
      getQuotes: jest.fn(),
      getSummaryProfile: jest.fn(),
      getHistoricalPrices: jest.fn(),
      getFinancials: jest.fn(),
      getEarnings: jest.fn(),
      getAnalysis: jest.fn(),
      getNews: jest.fn(),
      getOptions: jest.fn(),
      getCryptoQuote: jest.fn(),
      getForexQuote: jest.fn(),
      getTrending: jest.fn(),
      screener: jest.fn(),
      initialize: jest.fn().mockResolvedValue(undefined),
      shutdown: jest.fn().mockResolvedValue(undefined),
      getStats: jest.fn().mockReturnValue({})
    };

    // The real reporter, not a stub: completeness and warnings then mean what they say.
    reporter = new DataQualityReporter(60000);
    quoteTools = new QuoteTools(client as never, reporter);

    stubRows({
      balanceSheet: [balanceSheetRow('2023-09-30T00:00:00Z'), balanceSheetRow('2022-09-24T00:00:00Z')],
      incomeStatement: [incomeStatementRow('2023-09-30T00:00:00Z'), incomeStatementRow('2022-09-24T00:00:00Z')],
      cashFlow: [cashFlowRow('2023-09-30T00:00:00Z'), cashFlowRow('2022-09-24T00:00:00Z')]
    });
  });

  async function getQuote(symbols: string[], options: Record<string, unknown> = {}): Promise<QuoteOutput> {
    return (await quoteTools.getQuote({ symbols, ...options })) as unknown as QuoteOutput;
  }

  function financials(symbol: string): Promise<StatementOutput> {
    return getBalanceSheetTool({ symbol }) as unknown as Promise<StatementOutput>;
  }

  describe('Cross-Tool Data Consistency', () => {
    it('should report the same symbol from every tool family', async () => {
      (client.getQuote as jest.Mock).mockImplementation(async (symbol: string) => rawQuote(symbol, 175.5));
      library.search.mockResolvedValue({ count: 1, news: [] });
      library.quoteSummary.mockResolvedValue({
        majorHoldersBreakdown: {
          maxAge: 1,
          insidersPercentHeld: 0.02,
          institutionsPercentHeld: 0.61,
          institutionsFloatPercentHeld: 0.66,
          institutionsCount: 4213
        }
      });

      const quote = await getQuote(['AAPL']);
      const balanceSheet = await financials('AAPL');
      const incomeStatement = (await getIncomeStatementTool({ symbol: 'AAPL' })) as unknown as StatementOutput;
      const cashFlow = (await getCashFlowStatementTool({ symbol: 'AAPL' })) as unknown as StatementOutput;
      const news = (await getCompanyNewsTool({ symbol: 'AAPL' })) as Record<string, unknown>;
      const holders = (await getMajorHoldersTool({ symbol: 'AAPL' })) as Record<string, unknown>;

      expect(quote.results.AAPL).toBeDefined();
      expect(balanceSheet.symbol).toBe('AAPL');
      expect(incomeStatement.symbol).toBe('AAPL');
      expect(cashFlow.symbol).toBe('AAPL');
      expect(news.symbol).toBe('AAPL');
      expect(holders.symbol).toBe('AAPL');
    });

    it('should emit ISO period ends from all three statements', async () => {
      const balanceSheet = await financials('AAPL');
      const incomeStatement = (await getIncomeStatementTool({ symbol: 'AAPL' })) as unknown as StatementOutput;
      const cashFlow = (await getCashFlowStatementTool({ symbol: 'AAPL' })) as unknown as StatementOutput;

      const firstPeriod = (statement: StatementOutput): string =>
        (statement.statements[0] as Record<string, unknown>).endDate as string;

      expect(firstPeriod(balanceSheet)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(firstPeriod(incomeStatement)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(firstPeriod(cashFlow)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(firstPeriod(balanceSheet)).toBe(firstPeriod(incomeStatement));
    });

    it('should carry the same meta block shape across tools', async () => {
      (client.getQuote as jest.Mock).mockImplementation(async (symbol: string) => rawQuote(symbol, 175.5));

      const quote = await getQuote(['AAPL']);
      const balanceSheet = await financials('AAPL');

      for (const meta of [quote.results.AAPL.meta, balanceSheet.meta]) {
        expect(typeof meta.fromCache).toBe('boolean');
        expect(typeof meta.dataAge).toBe('number');
        expect(meta.completenessScore).toBeGreaterThanOrEqual(0);
        expect(meta.completenessScore).toBeLessThanOrEqual(1);
        expect(Array.isArray(meta.warnings)).toBe(true);
      }
    });

    it('should reject an invalid symbol at every entry point', async () => {
      await expect(getQuote(['aapl'])).rejects.toBeInstanceOf(SecurityError);
      await expect(getIncomeStatementTool({ symbol: 'aapl' })).rejects.toBeInstanceOf(SecurityError);
      await expect(getCashFlowStatementTool({ symbol: 'aapl' })).rejects.toBeInstanceOf(SecurityError);
      await expect(getCompanyNewsTool({ symbol: 'aapl' })).rejects.toBeInstanceOf(SecurityError);
      await expect(getMajorHoldersTool({ symbol: 'aapl' })).rejects.toBeInstanceOf(SecurityError);

      // getBalanceSheetTool parsed the schema but never called InputValidator.validateSymbol, so a
      // lowercase symbol reached the library on a direct handler call and only the MCP-boundary
      // securityMiddleware would have caught it. It gates like its siblings since 2026-10-13.
      await expect(getBalanceSheetTool({ symbol: 'aapl' })).rejects.toBeInstanceOf(SecurityError);
      expect(library.fundamentalsTimeSeries).not.toHaveBeenCalledWith('aapl', expect.anything());

      library.fundamentalsTimeSeries.mockClear();
      library.search.mockClear();
      library.quoteSummary.mockClear();
    });
  });

  describe('Tool Availability', () => {
    it('should expose definitions for the non-class tool modules', () => {
      const holdersDefs = getHoldersToolDefinitions();
      const newsDefs = getNewsToolDefinitions();
      const financialsDefs = getFinancialsToolDefinitions();

      expect(holdersDefs).toHaveLength(1);
      expect(newsDefs).toHaveLength(1);
      expect(financialsDefs).toHaveLength(3);

      expect(holdersDefs[0].name).toBe('get_major_holders');
      expect(newsDefs[0].name).toBe('get_news');
      expect(financialsDefs.map((d) => d.name)).toEqual([
        'get_balance_sheet',
        'get_income_statement',
        'get_cash_flow_statement'
      ]);

      // getOptionsToolDefinitions is imported by src/server.ts but never invoked there; it
      // is still a real export and still describes the callable get_options.
      expect(getOptionsToolDefinitions()[0].name).toBe('get_options');
    });

    it('should give every definition an object input schema requiring symbol', () => {
      const definitions = [...getHoldersToolDefinitions(), ...getNewsToolDefinitions(), ...getFinancialsToolDefinitions()];

      for (const definition of definitions) {
        const schema = definition.inputSchema as {
          type: string;
          properties: Record<string, unknown>;
          required: string[];
        };

        expect(schema.type).toBe('object');
        expect(schema.properties).toHaveProperty('symbol');
        expect(schema.required).toContain('symbol');
        expect((definition.description ?? '').length).toBeGreaterThan(0);
      }
    });

    it('should advertise keys the input schemas actually parse', () => {
      // A definition advertising a key the handler strips is invisible drift: zod schemas in
      // this repo never use .strict(), so an unmatched key silently falls back to the default.
      const newsProperties = (getNewsToolDefinitions()[0].inputSchema as { properties: Record<string, unknown> }).properties;
      expect(Object.keys(newsProperties).sort()).toEqual(
        Object.keys(NewsInputSchema.shape).sort()
      );

      const holdersProperties = (getHoldersToolDefinitions()[0].inputSchema as { properties: Record<string, unknown> }).properties;
      expect(Object.keys(holdersProperties).sort()).toEqual(Object.keys(HoldersInputSchema.shape).sort());
    });

    it('should provide a parseable zod contract for every domain', () => {
      const schemas = [
        FinancialsInputSchema,
        HoldersInputSchema,
        NewsInputSchema,
        OptionsInputSchema,
        HistoricalInputSchema,
        EarningsInputSchema,
        AnalysisInputSchema
      ];

      for (const schema of schemas) {
        expect(typeof schema.parse).toBe('function');
        expect(typeof schema.safeParse).toBe('function');
      }

      expect(FinancialsInputSchema.safeParse({ symbol: 'AAPL', frequency: 'annual', limit: 4 }).success).toBe(true);
      expect(FinancialsInputSchema.safeParse({ symbol: 'AAPL', limit: 0 }).success).toBe(false);
      expect(FinancialsInputSchema.safeParse({ symbol: 'AAPL', frequency: 'monthly' }).success).toBe(false);
    });
  });

  describe('Batch Processing', () => {
    it('should fan a batch out to one client call per symbol', async () => {
      (client.getQuote as jest.Mock).mockImplementation(async (symbol: string) => rawQuote(symbol, 100));

      const result = await getQuote(['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META']);

      expect(result.summary.totalRequested).toBe(5);
      expect(result.summary.totalReturned).toBe(5);
      expect(result.summary.errors).toHaveLength(0);
      expect(client.getQuote).toHaveBeenCalledTimes(5);
    });

    it('should collect per-symbol errors and keep the successes', async () => {
      (client.getQuote as jest.Mock).mockImplementation(async (symbol: string) => {
        if (symbol === 'INVALID' || symbol === 'INVALID2') {
          throw new Error('Symbol not found');
        }
        return rawQuote(symbol, 100);
      });

      const result = await getQuote(['AAPL', 'INVALID', 'MSFT', 'INVALID2', 'GOOGL']);

      expect(result.summary.totalRequested).toBe(5);
      expect(result.summary.totalReturned).toBe(3);
      expect(result.summary.errors).toHaveLength(2);
      expect(result.summary.errors.map((e) => e.symbol)).toEqual(['INVALID', 'INVALID2']);
      expect(result.results.AAPL).toBeDefined();
    });

    it('should pace every batch after the first with a fixed 200 ms delay', async () => {
      (client.getQuote as jest.Mock).mockImplementation(async (symbol: string) => rawQuote(symbol, 100));

      const eleven = Array.from({ length: 11 }, (_unused, i) => `SYM${i}`);
      const pending = quoteTools.getQuote({ symbols: eleven });

      // BATCH_SIZE is 10, so 11 symbols means one batch boundary.
      await jest.advanceTimersByTimeAsync(200);
      const result = (await pending) as unknown as QuoteOutput;

      expect(result.summary.totalRequested).toBe(11);
      expect(result.summary.totalReturned).toBe(11);
    });

    it('should cap a batch at 50 unique symbols even though the registry advertises 100', async () => {
      const fifty = Array.from({ length: 50 }, (_unused, i) => `SYM${i}`);
      const fiftyOne = [...fifty, 'SYM50'];

      (client.getQuote as jest.Mock).mockImplementation(async (symbol: string) => rawQuote(symbol, 100));

      const pending = getQuote(fifty);
      // 50 symbols is 5 batches of 10, and every boundary costs a real 200 ms delay.
      await jest.advanceTimersByTimeAsync(1000);
      const ok = await pending;

      expect(ok.summary.totalReturned).toBe(50);

      // src/server.ts declares maxItems: 100 for get_quote while InputValidator caps at 50.
      await expect(getQuote(fiftyOne)).rejects.toBeInstanceOf(SecurityError);
    });
  });

  describe('Caching Behavior Across Tools', () => {
    it('should cache each tool family independently', async () => {
      (client.getQuote as jest.Mock).mockImplementation(async (symbol: string) => rawQuote(symbol, 100));

      await getQuote(['AAPL']);
      await financials('AAPL');
      await getIncomeStatementTool({ symbol: 'AAPL' });

      expect(client.getQuote).toHaveBeenCalledTimes(1);
      expect(library.fundamentalsTimeSeries).toHaveBeenCalledTimes(2);
      expect(library.quoteSummary).not.toHaveBeenCalled();
    });

    it('should replay the financials module cache on the second identical call', async () => {
      const first = await financials('AAPL');
      const second = await financials('AAPL');

      expect(library.fundamentalsTimeSeries).toHaveBeenCalledTimes(1);
      expect(second.statements).toEqual(first.statements);

      clearFinancialsCache();
      await financials('AAPL');
      expect(library.fundamentalsTimeSeries).toHaveBeenCalledTimes(2);
    });

    it('should replay the holders module cache and label the hit', async () => {
      library.quoteSummary.mockResolvedValue({
        majorHoldersBreakdown: {
          maxAge: 1,
          insidersPercentHeld: 0.02,
          institutionsPercentHeld: 0.61,
          institutionsFloatPercentHeld: 0.66,
          institutionsCount: 4213
        }
      });

      const first = (await getMajorHoldersTool({ symbol: 'AAPL' })) as Record<string, never>;
      const second = (await getMajorHoldersTool({ symbol: 'AAPL' })) as Record<string, never>;

      expect(library.quoteSummary).toHaveBeenCalledTimes(5);
      expect((second.meta as Record<string, unknown>).fromCache).toBe(true);
      expect(first.symbol).toBe('AAPL');
    });

    it('should hand forceRefresh through to the client rather than short-circuiting', async () => {
      (client.getQuote as jest.Mock).mockImplementation(async (symbol: string) => rawQuote(symbol, 100));

      await getQuote(['AAPL'], { forceRefresh: false });
      await getQuote(['AAPL'], { forceRefresh: true });

      expect(client.getQuote).toHaveBeenCalledTimes(2);

      const options = (client.getQuote as jest.Mock).mock.calls[1][1] as Record<string, unknown>;
      expect(options.forceRefresh).toBe(true);
      expect(options.useCache).toBe(false);
    });
  });

  describe('Data Quality Metrics', () => {
    it('should score a full quote above a hollow one', async () => {
      (client.getQuote as jest.Mock).mockImplementationOnce(async (symbol: string) => rawQuote(symbol, 175.5));
      (client.getQuote as jest.Mock).mockResolvedValueOnce({ invalid: 'data' });

      const full = await getQuote(['AAPL']);
      const hollow = await getQuote(['MSFT']);

      expect(full.results.AAPL.meta.completenessScore).toBeGreaterThan(0.8);
      expect(hollow.results.MSFT.meta.completenessScore).toBe(0);
      expect(hollow.results.MSFT.meta.warnings).toContain('Low data completeness (<50%)');
      expect(full.summary.totalReturned).toBe(1);
      expect(hollow.summary.totalReturned).toBe(1);
    });

    it('should degrade, not fail, when a statement is missing fields', async () => {
      stubRows({
        balanceSheet: [{ TYPE: 'BALANCE_SHEET', date: new Date('2023-09-30T00:00:00Z'), totalAssets: 1 }]
      });

      const result = await financials('AAPL');

      expect(result.meta.completenessScore).toBeGreaterThan(0);
      expect(result.meta.completenessScore).toBeLessThan(1);
      expect(result.meta.warnings).toContain('Data completeness is low (< 50% fields available)');
    });

    it('should report holders completeness from the modules that answered', async () => {
      library.quoteSummary.mockResolvedValue({
        majorHoldersBreakdown: {
          maxAge: 1,
          insidersPercentHeld: 0.02,
          institutionsPercentHeld: 0.61,
          institutionsFloatPercentHeld: 0.66,
          institutionsCount: 4213
        }
      });

      const result = (await getMajorHoldersTool({ symbol: 'AAPL' })) as Record<string, unknown>;
      const meta = result.meta as Record<string, unknown>;

      // Only majorHoldersBreakdown answered, so 1 of 5 fields, and the four silent modules
      // each contribute a warning instead of an error.
      expect(meta.completenessScore).toBeCloseTo(0.2, 5);
      expect(meta.warnings).toContain('Institutional holder data not available');
      expect(meta.dataSource).toBe('Yahoo Finance');
      expect(result.institutionalHolders).toEqual([]);
    });

    it('should report an empty news result as a degraded rather than failed call', async () => {
      library.search.mockResolvedValue({ count: 0, news: [] });

      const result = (await getCompanyNewsTool({ symbol: 'AAPL' })) as Record<string, unknown>;

      expect(result.count).toBe(0);
      expect(result.news).toEqual([]);
      expect(Array.isArray((result.meta as Record<string, unknown>).warnings)).toBe(true);
    });
  });

  describe('Error Recovery', () => {
    it('should not retry inside the tool layer', async () => {
      let calls = 0;
      (client.getQuote as jest.Mock).mockImplementation(async () => {
        calls++;
        throw new Error('Network timeout');
      });

      const result = await getQuote(['AAPL']);

      // Retries belong to YahooFinanceClient's RetryPolicy, not to the handler.
      expect(calls).toBe(1);
      expect(result.summary.totalReturned).toBe(0);
      expect(result.summary.errors[0].error).toBe('Network timeout');
    });

    it('should fall back to the client cache only for a rate-limit error', async () => {
      const cache = new Map<string, unknown>([['quote:AAPL', rawQuote('AAPL', 175.5)]]);
      client.cache = { get: (key: string) => cache.get(key) ?? null };
      quoteTools = new QuoteTools(client as never, reporter);

      (client.getQuote as jest.Mock).mockImplementation(async () => {
        throw new YahooFinanceError(
          'Rate limited',
          YF_ERR_RATE_LIMIT,
          429,
          true,
          true,
          {},
          'Wait and retry'
        );
      });

      const result = await getQuote(['AAPL']);

      expect(result.summary.totalReturned).toBe(1);
      expect(result.results.AAPL.meta.fromCache).toBe(true);
      expect(result.summary.fromCache).toBe(1);
      expect(result.summary.rateLimited).toBe(false);
    });

    it('should rethrow a rate-limit error with no cached value', async () => {
      quoteTools = new QuoteTools(client as never, reporter);

      (client.getQuote as jest.Mock).mockImplementation(async () => {
        throw new YahooFinanceError(
          'Rate limited',
          YF_ERR_RATE_LIMIT,
          429,
          true,
          true,
          {},
          'Wait and retry'
        );
      });

      const result = await getQuote(['AAPL']);

      expect(result.summary.totalReturned).toBe(0);
      expect(result.summary.errors[0].symbol).toBe('AAPL');
    });

    it('should flag a batch as rate limited only when the code reaches the message', async () => {
      (client.getQuote as jest.Mock).mockImplementation(async () => {
        throw new YahooFinanceError(
          'Rate limited',
          YF_ERR_RATE_LIMIT,
          429,
          true,
          true,
          {},
          'Wait and retry'
        );
      });

      const result = await getQuote(['AAPL']);

      // isRateLimited() matches on the code string or the words "rate limit"; the classified
      // message here is 'Rate limited', which matches neither.
      expect(result.summary.rateLimited).toBe(false);
      expect(result.summary.errors[0].error).toBe('Rate limited');
    });

    it('should surface a symbol-not-found failure per symbol and keep the batch alive', async () => {
      (client.getQuote as jest.Mock).mockImplementation(async (symbol: string) => {
        if (symbol === 'ZZZZ') {
          throw new YahooFinanceError(
            'Symbol not found',
            YF_ERR_SYMBOL_NOT_FOUND,
            404,
            false,
            false,
            { symbol },
            'Check the symbol'
          );
        }
        return rawQuote(symbol, 100);
      });

      const result = await getQuote(['AAPL', 'ZZZZ']);

      expect(result.summary.totalReturned).toBe(1);
      expect(result.summary.errors).toHaveLength(1);
    });

    it('should wrap financials library failures in YahooFinanceError', async () => {
      library.fundamentalsTimeSeries.mockRejectedValue(new Error('API error'));

      await expect(getBalanceSheetTool({ symbol: 'AAPL' })).rejects.toBeInstanceOf(YahooFinanceError);
      await expect(getIncomeStatementTool({ symbol: 'AAPL' })).rejects.toThrow(
        /Failed to fetch income statement for AAPL: API error/
      );
      await expect(getCashFlowStatementTool({ symbol: 'AAPL' })).rejects.toThrow(
        /Failed to fetch cash flow statement for AAPL: API error/
      );
    });
  });

  describe('Integration with the Yahoo Finance Boundary', () => {
    it('should read statements through fundamentalsTimeSeries, not quoteSummary', async () => {
      await getBalanceSheetTool({ symbol: 'AAPL' });
      await getIncomeStatementTool({ symbol: 'AAPL' });
      await getCashFlowStatementTool({ symbol: 'AAPL' });

      const modules = library.fundamentalsTimeSeries.mock.calls.map(
        (call) => (call[1] as { module: string }).module
      );

      expect(modules).toEqual(['balance-sheet', 'financials', 'cash-flow']);
      expect(library.quoteSummary).not.toHaveBeenCalled();

      for (const call of library.fundamentalsTimeSeries.mock.calls) {
        expect((call[1] as { type: string }).type).toBe('annual');
        expect((call[1] as { period1: Date }).period1).toBeInstanceOf(Date);
      }
    });

    it('should stop the holders fan-out at the first module when the breakdown is absent', async () => {
      library.quoteSummary.mockResolvedValue({});

      await expect(getMajorHoldersTool({ symbol: 'AAPL' })).rejects.toBeInstanceOf(YahooFinanceError);

      // fetchMajorHoldersBreakdown is the only fetcher that throws; the other four degrade.
      // Because it runs first, an empty answer costs one library call, not five.
      expect(library.quoteSummary).toHaveBeenCalledTimes(1);
      expect((library.quoteSummary.mock.calls[0][1] as { modules: string[] }).modules).toEqual([
        'majorHoldersBreakdown'
      ]);
    });

    it('should ask exactly the five holder modules once the breakdown answers', async () => {
      library.quoteSummary.mockImplementation(async (_symbol: string, options: { modules: string[] }) => {
        const [module] = options.modules;
        if (module === 'majorHoldersBreakdown') {
          return {
            majorHoldersBreakdown: {
              maxAge: 1,
              insidersPercentHeld: 0.02,
              institutionsPercentHeld: 0.61,
              institutionsFloatPercentHeld: 0.66,
              institutionsCount: 4213
            }
          };
        }
        return {};
      });

      await getMajorHoldersTool({ symbol: 'AAPL' });

      const requested = library.quoteSummary.mock.calls.map(
        (call) => (call[1] as { modules: string[] }).modules[0]
      );

      expect(requested).toEqual([
        'majorHoldersBreakdown',
        'institutionOwnership',
        'fundOwnership',
        'insiderHolders',
        'majorDirectHolders'
      ]);
    });

    it('should over-fetch news and report the pre-slice count', async () => {
      library.search.mockResolvedValue({
        count: 5,
        news: Array.from({ length: 5 }, (_unused, i) => ({
          uuid: `n${i}`,
          title: `Headline ${i}`,
          publisher: 'Reuters',
          link: 'https://example.com/a',
          providerPublishTime: new Date(Date.now() - i * 3600000),
          type: 'STORY',
          relatedTickers: ['AAPL']
        }))
      });

      const result = (await getCompanyNewsTool({ symbol: 'AAPL', limit: 2 })) as Record<string, unknown>;

      // getNewsData asks for Math.max(limit * 2, 20) articles so it can still fill the request
      // after the related-ticker filter, then slices to `limit`. The handler recomputes count
      // from the sliced array, so the over-fetch never leaks into the payload.
      expect(library.search).toHaveBeenCalledWith('AAPL', { newsCount: 20, quotesCount: 1 });
      expect(result.news).toHaveLength(2);
      expect(result.count).toBe(2);
      expect(library.quoteSummary).not.toHaveBeenCalled();
    });

    it('should fail an options request when the chain reports no expirations', async () => {
      library.options.mockResolvedValue({ options: [] });

      await expect(getOptionsTool({ symbol: 'AAPL' })).rejects.toBeInstanceOf(YahooFinanceError);

      // options() is called with the symbol alone: no module list, no optionsType.
      expect(library.options).toHaveBeenCalledWith('AAPL');
    });
  });

  describe('Tool Compatibility', () => {
    it('should accept fields and timeout on get_quote without parsing them', async () => {
      (client.getQuote as jest.Mock).mockImplementation(async (symbol: string) => rawQuote(symbol, 175.5));

      const fields = await getQuote(['AAPL'], { fields: ['regularMarketPrice'] });
      const timeout = await getQuote(['AAPL'], { timeout: 10000 });

      expect(fields.summary.totalReturned).toBe(1);
      expect(timeout.summary.totalReturned).toBe(1);

      // get_quote has no zod input parse at the handler: unknown keys are simply ignored and
      // `fields` is forwarded to the client, which is where filtering actually happens.
      expect(fields.results.AAPL.data.regularMarketPrice).toBe(175.5);
    });

    it('should ignore keys the handler never reads', async () => {
      (client.getQuote as jest.Mock).mockImplementation(async (symbol: string) => rawQuote(symbol, 175.5));

      const result = await getQuote(['AAPL'], { limit: 1, interval: '1d' });

      expect(result.summary.totalReturned).toBe(1);
      expect(client.getQuote).toHaveBeenCalledTimes(1);
    });

    it('should reject a financials limit below the schema floor', async () => {
      await expect(getBalanceSheetTool({ symbol: 'AAPL', limit: 0 })).rejects.toThrow();
      expect(library.fundamentalsTimeSeries).not.toHaveBeenCalled();
    });
  });
});
