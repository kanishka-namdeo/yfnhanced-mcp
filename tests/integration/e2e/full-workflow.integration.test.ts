import { QuoteTools } from '../../../src/tools/quotes';
import { HistoricalTools } from '../../../src/tools/historical';
import { EarningsTools } from '../../../src/tools/earnings';
import { AnalysisTools } from '../../../src/tools/analysis';
import { SummaryTools } from '../../../src/tools/summary';
import {
  getBalanceSheetTool,
  getIncomeStatementTool,
  getCashFlowStatementTool,
  clearFinancialsCache
} from '../../../src/tools/financials';
import { getCompanyNewsTool, clearNewsCache } from '../../../src/tools/news';
import { getMajorHoldersTool, clearHoldersCache } from '../../../src/tools/holders';
import { DataQualityReporter } from '../../../src/utils/data-completion';
import { yahooFinance } from '../../../src/services/yahoo-finance';
import { YahooFinanceError, YF_ERR_DATA_INCOMPLETE } from '../../../src/types/errors';

// This suite used to `jest.mock('yahoo-finance2')` and then call
// `(yahooFinance.quoteSummary as jest.Mock).mockResolvedValue(...)`, which resolved to
// undefined because the source never reaches the library through that namespace: financials
// go through the process-wide `yahooFinance` singleton's `fundamentalsTimeSeries`, news
// through `search`, holders through `quoteSummary`, and quote/historical/earnings/analysis/
// summary through methods on the injected `YahooFinanceClient`. It also built
// `new HistoricalTools(mockServer, client, reporter)` while the constructor takes
// (client, qualityReporter), so the tools were wired to a Server object.
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

type QuoteResultFixture = {
  price: Record<string, unknown>;
  meta: Record<string, unknown>;
};

function rawQuote(symbol: string, price: number): QuoteResultFixture {
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

// HistoricalPriceResult: chart() shape with epoch-SECOND timestamps, which is what
// HistoricalTools.extractHistoricalData reads.
function chartResult(closes: number[], startEpochSeconds: number): Record<string, unknown> {
  const opens = closes.map((c) => c - 0.5);
  const highs = closes.map((c) => c + 0.5);
  const lows = closes.map((c) => c - 1);
  const volumes = closes.map(() => 50000000);

  return {
    timestamps: closes.map((_c, i) => startEpochSeconds + i * 86400),
    meta: {
      currency: 'USD',
      symbol: 'AAPL',
      exchangeName: 'NasdaqGS',
      instrumentType: 'EQUITY',
      regularMarketPrice: closes[closes.length - 1]
    },
    indicators: {
      quote: [{ open: opens, high: highs, low: lows, close: closes, volume: volumes }],
      adjclose: [{ adjclose: closes }]
    }
  };
}

function statementRow(type: string, date: string, metrics: Record<string, number>): Record<string, unknown> {
  return { TYPE: type, date: new Date(date), ...metrics };
}

function stubStatements(): void {
  library.fundamentalsTimeSeries.mockImplementation(
    async (_symbol: string, options: { module: string }) => {
      if (options.module === 'balance-sheet') {
        return [
          statementRow('BALANCE_SHEET', '2023-09-30T00:00:00Z', {
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
            otherIntangibleAssets: 7000000000
          })
        ];
      }
      if (options.module === 'financials') {
        return [
          statementRow('FINANCIALS', '2023-09-30T00:00:00Z', {
            totalRevenue: 383285000000,
            costOfRevenue: 214137000000,
            grossProfit: 169148000000,
            operatingIncome: 114301000000,
            EBITDA: 126332000000,
            netIncome: 96995000000,
            basicEPS: 1.64,
            dilutedEPS: 1.62
          })
        ];
      }
      if (options.module === 'cash-flow') {
        return [
          statementRow('CASH_FLOW', '2023-09-30T00:00:00Z', {
            operatingCashFlow: 110543000000,
            capitalExpenditure: -10957000000,
            cashFlowFromContinuingFinancingActivities: -104954000000,
            cashFlowFromContinuingInvestingActivities: -7399000000,
            freeCashFlow: 99586000000
          })
        ];
      }
      return [];
    }
  );
}

type Meta = {
  fromCache: boolean;
  dataAge: number;
  completenessScore: number;
  warnings: string[];
};

type StatementPayload = {
  symbol: string;
  statements: Array<Record<string, unknown>>;
  meta: Meta & { recency: string };
};

type QuotePayload = {
  results: Record<string, { data: Record<string, number | undefined>; meta: Meta }>;
  summary: {
    totalRequested: number;
    totalReturned: number;
    fromCache: number;
    rateLimited: boolean;
    errors: Array<{ symbol: string; error: string }>;
  };
};

type HistoricalPayload = {
  symbol: string;
  data: Array<Record<string, number | boolean | string>>;
  meta: Meta & { integrityFlags: string[] };
};

describe('Full Workflow Integration Tests', () => {
  let client: Record<string, jest.Mock>;
  let reporter: DataQualityReporter;
  let quoteTools: QuoteTools;
  let historicalTools: HistoricalTools;
  let earningsTools: EarningsTools;
  let analysisTools: AnalysisTools;
  let summaryTools: SummaryTools;

  beforeAll(() => {
    // HistoricalTools backs off with real 1 s / 2 s sleeps between interval retries, and
    // QuoteTools paces batches at 200 ms. Fake timers keep both off the wall clock.
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
    clearHoldersCache();

    client = {
      getQuote: jest.fn(),
      getQuotes: jest.fn(),
      getHistoricalPrices: jest.fn(),
      getFinancials: jest.fn(),
      getEarnings: jest.fn(),
      getAnalysis: jest.fn(),
      getNews: jest.fn(),
      getOptions: jest.fn(),
      getSummaryProfile: jest.fn(),
      getCryptoQuote: jest.fn(),
      getForexQuote: jest.fn(),
      getTrending: jest.fn(),
      screener: jest.fn(),
      getStats: jest.fn().mockReturnValue({}),
      initialize: jest.fn().mockResolvedValue(undefined),
      shutdown: jest.fn().mockResolvedValue(undefined)
    };

    reporter = new DataQualityReporter(60000);
    quoteTools = new QuoteTools(client as never, reporter);
    // HistoricalTools takes (client, qualityReporter): it never takes a Server.
    historicalTools = new HistoricalTools(client as never, reporter);
    earningsTools = new EarningsTools(client as never);
    analysisTools = new AnalysisTools(client as never);
    summaryTools = new SummaryTools(client as never, {} as never);

    stubStatements();
  });

  afterEach(() => {
    historicalTools.clearCache();
  });

  function num(value: unknown): number {
    return typeof value === 'number' ? value : Number.NaN;
  }

  describe('analyze_stock workflow', () => {
    it('should complete the full stock analysis workflow', async () => {
      (client.getQuote as jest.Mock).mockImplementation(async (symbol: string) => rawQuote(symbol, 175.5));
      (client.getEarnings as jest.Mock).mockResolvedValue({ earningsDate: null, quarterly: [], trends: [] });
      (client.getAnalysis as jest.Mock).mockResolvedValue({});
      library.search.mockResolvedValue({ count: 1, news: [] });

      const symbol = 'AAPL';

      const quote = (await quoteTools.getQuote({ symbols: [symbol] })) as unknown as QuotePayload;
      const balanceSheet = (await getBalanceSheetTool({ symbol })) as unknown as StatementPayload;
      const incomeStatement = (await getIncomeStatementTool({ symbol })) as unknown as StatementPayload;
      const cashFlow = (await getCashFlowStatementTool({ symbol })) as unknown as StatementPayload;
      const earnings = await earningsTools.getEarnings({ symbol });
      const analysis = await analysisTools.getAnalysis({ symbol });
      const news = (await getCompanyNewsTool({ symbol })) as Record<string, unknown>;

      expect(quote.summary.totalReturned).toBe(1);
      expect(num(quote.results[symbol].data.regularMarketPrice)).toBe(175.5);

      const balance = balanceSheet.statements[0].balanceSheet as Record<string, number>;
      const income = incomeStatement.statements[0].incomeStatement as Record<string, number>;
      const flows = cashFlow.statements[0].cashFlowStatement as Record<string, number>;

      expect(balance.totalAssets).toBe(352583000000);
      expect(income.totalRevenue).toBe(383285000000);
      expect(flows.freeCashFlow).toBe(99586000000);

      expect(earnings.symbol).toBe(symbol);
      expect(analysis.symbol).toBe(symbol);
      expect(news.symbol).toBe(symbol);

      const health = {
        debtToEquity: balance.totalLiab / balance.totalStockholderEquity,
        profitMargin: income.netIncome / income.totalRevenue,
        currentRatio: balance.totalCurrentAssets / balance.totalCurrentLiabilities
      };

      expect(health.profitMargin).toBeGreaterThan(0.25);
      expect(health.profitMargin).toBeLessThan(0.3);
      expect(health.debtToEquity).toBeGreaterThan(4);
      expect(health.currentRatio).toBeLessThan(1);
    });

    it('should return plain objects, never pre-wrapped MCP content', async () => {
      (client.getQuote as jest.Mock).mockImplementation(async (symbol: string) => rawQuote(symbol, 175.5));
      (client.getHistoricalPrices as jest.Mock).mockResolvedValue(
        chartResult([174.5, 175.5], Math.floor(Date.parse('2024-01-02T00:00:00Z') / 1000))
      );
      (client.getEarnings as jest.Mock).mockResolvedValue({ earningsChart: {}, earningsTrend: [] });

      const quote = (await quoteTools.getQuote({ symbols: ['AAPL'] })) as unknown as QuotePayload;
      const historical = (await historicalTools.getHistoricalPrices({
        symbol: 'AAPL',
        startDate: '2024-01-02',
        interval: '1d'
      })) as unknown as HistoricalPayload;

      // src/server.ts is the only place that wraps a handler result as
      // content: [{ type: 'text', text: JSON.stringify(...) }]. earnings.ts, analysis.ts and
      // historical.ts used to pre-wrap it themselves and double-encoded on the wire.
      for (const result of [quote, historical]) {
        expect(result).not.toHaveProperty('content');
        expect(result).not.toHaveProperty('isError');
      }

      const earnings = await earningsTools.getEarnings({ symbol: 'AAPL' });
      expect(earnings).not.toHaveProperty('content');
    });

    it('should dereference earningsChart without a guard when the service omits the module', async () => {
      (client.getEarnings as jest.Mock).mockResolvedValue(undefined);

      // Defect: processEarningsData reads result.earningsChart directly (src/tools/earnings.ts:166)
      // while every later access is optional-chained, so a degraded service response that
      // lacks the module key crashes the handler with a TypeError instead of degrading.
      await expect(earningsTools.getEarnings({ symbol: 'AAPL' })).rejects.toBeInstanceOf(TypeError);

      (client.getEarnings as jest.Mock).mockResolvedValue({ earningsChart: {}, earningsTrend: [] });
      const degraded = await earningsTools.getEarnings({ symbol: 'AAPL' });

      expect(degraded.earnings.quarterly).toEqual([]);
      expect(degraded.earnings.earningsDate).toBeNull();
    });

    it('should handle partial data gracefully in the analysis workflow', async () => {
      (client.getQuote as jest.Mock).mockImplementation(async (symbol: string) => rawQuote(symbol, 175.5));
      library.fundamentalsTimeSeries.mockImplementation(async (_symbol: string, options: { module: string }) =>
        options.module === 'balance-sheet'
          ? [statementRow('BALANCE_SHEET', '2023-09-30T00:00:00Z', { totalAssets: 1 })]
          : []
      );

      await quoteTools.getQuote({ symbols: ['AAPL'] });

      const balanceSheet = (await getBalanceSheetTool({ symbol: 'AAPL' })) as unknown as StatementPayload;
      expect(balanceSheet.meta.completenessScore).toBeLessThan(0.2);

      // An empty row set is a hard failure for the two statements that got nothing back.
      await expect(getIncomeStatementTool({ symbol: 'AAPL' })).rejects.toMatchObject({
        code: YF_ERR_DATA_INCOMPLETE
      });
      await expect(getCashFlowStatementTool({ symbol: 'AAPL' })).rejects.toMatchObject({
        code: YF_ERR_DATA_INCOMPLETE
      });
    });

    it('should wrap a library failure into YahooFinanceError', async () => {
      library.fundamentalsTimeSeries.mockRejectedValue(new Error('API error'));

      await expect(getBalanceSheetTool({ symbol: 'AAPL' })).rejects.toBeInstanceOf(YahooFinanceError);
      await expect(getIncomeStatementTool({ symbol: 'AAPL' })).rejects.toThrow(
        /Failed to fetch income statement for AAPL: API error/
      );
    });
  });

  describe('compare_stocks workflow', () => {
    it('should complete the stock comparison workflow', async () => {
      const prices: Record<string, number> = { AAPL: 175.5, MSFT: 378.5, GOOGL: 141.2 };
      (client.getQuote as jest.Mock).mockImplementation(async (symbol: string) =>
        rawQuote(symbol, prices[symbol] ?? 100)
      );

      const symbols = ['AAPL', 'MSFT', 'GOOGL'];
      const quote = (await quoteTools.getQuote({ symbols })) as unknown as QuotePayload;

      expect(quote.summary.totalReturned).toBe(3);

      const comparison = symbols.map((s) => ({
        symbol: s,
        price: num(quote.results[s].data.regularMarketPrice),
        marketCap: num(quote.results[s].data.marketCap)
      }));

      expect(Math.max(...comparison.map((c) => c.price))).toBe(378.5);
      expect(Math.min(...comparison.map((c) => c.price))).toBe(141.2);
      expect(comparison.every((c) => c.marketCap === 2800000000000)).toBe(true);
    });

    it('should keep comparing when one symbol fails', async () => {
      (client.getQuote as jest.Mock).mockImplementation(async (symbol: string) => {
        if (symbol === 'INVALID') {
          throw new Error('Symbol not found');
        }
        return rawQuote(symbol, 100);
      });

      const quote = (await quoteTools.getQuote({ symbols: ['AAPL', 'MSFT', 'INVALID'] })) as unknown as QuotePayload;

      expect(quote.summary.totalRequested).toBe(3);
      expect(quote.summary.totalReturned).toBe(2);
      expect(quote.summary.errors).toHaveLength(1);
      expect(quote.summary.errors[0].symbol).toBe('INVALID');
    });

    it('should collect per-symbol results from the multi historical tool', async () => {
      (client.getHistoricalPrices as jest.Mock).mockImplementation(async (symbol: string) => {
        if (symbol === 'MSFT') {
          throw new Error('No chart data');
        }
        return chartResult([174.5, 175.5, 176.5], Math.floor(Date.parse('2024-01-02T00:00:00Z') / 1000));
      });

      const pending = historicalTools.getHistoricalPricesMulti({
        symbols: ['AAPL', 'MSFT'],
        startDate: '2024-01-02',
        interval: '1d'
      });
      // MSFT fails, so the tool backs off and re-probes intervals before giving up.
      await jest.advanceTimersByTimeAsync(30000);
      const multi = (await pending) as unknown as Record<string, Record<string, unknown>>;

      expect(Object.keys(multi)).toEqual(['AAPL', 'MSFT']);
      expect(multi.AAPL.status).toBe('success');
      expect(multi.MSFT.status).toBe('error');
      expect(multi.MSFT.error).toBe('No chart data');
    });
  });

  describe('financial_health_check workflow', () => {
    it('should complete a financial health analysis', async () => {
      const balanceSheet = (await getBalanceSheetTool({ symbol: 'AAPL', frequency: 'annual' })) as unknown as StatementPayload;
      const incomeStatement = (await getIncomeStatementTool({ symbol: 'AAPL', frequency: 'annual' })) as unknown as StatementPayload;
      const cashFlow = (await getCashFlowStatementTool({ symbol: 'AAPL', frequency: 'annual' })) as unknown as StatementPayload;

      const balance = balanceSheet.statements[0].balanceSheet as Record<string, number>;
      const income = incomeStatement.statements[0].incomeStatement as Record<string, number>;
      const flows = cashFlow.statements[0].cashFlowStatement as Record<string, number>;

      expect(balance.totalAssets).toBe(352583000000);
      expect(balance.totalLiab).toBe(290437000000);
      expect(balance.totalStockholderEquity).toBe(62146000000);
      expect(income.netIncome).toBe(96995000000);
      expect(flows.totalCashFromOperatingActivities).toBe(110543000000);

      const netIncomeOverRevenue = income.netIncome / income.totalRevenue;
      const returnOnEquity = income.netIncome / balance.totalStockholderEquity;
      const freeCashYield = flows.freeCashFlow / balance.totalAssets;

      expect(netIncomeOverRevenue).toBeGreaterThan(0);
      expect(netIncomeOverRevenue).toBeLessThan(1);
      expect(returnOnEquity).toBeGreaterThan(1);
      expect(freeCashYield).toBeGreaterThan(0);
      expect(balanceSheet.meta.recency).toBe('2023-09-30');
    });

    it('should handle missing financial data in the health analysis', async () => {
      library.fundamentalsTimeSeries.mockImplementation(async (_symbol: string, options: { module: string }) => {
        if (options.module === 'balance-sheet') {
          return [statementRow('BALANCE_SHEET', '2023-09-30T00:00:00Z', { totalAssets: 1, totalLiabilitiesNetMinorityInterest: 2 })];
        }
        if (options.module === 'financials') {
          return [statementRow('FINANCIALS', '2023-09-30T00:00:00Z', { totalRevenue: 3 })];
        }
        return [statementRow('CASH_FLOW', '2023-09-30T00:00:00Z', { operatingCashFlow: 4 })];
      });

      const balanceSheet = (await getBalanceSheetTool({ symbol: 'AAPL' })) as unknown as StatementPayload;
      const incomeStatement = (await getIncomeStatementTool({ symbol: 'AAPL' })) as unknown as StatementPayload;
      const cashFlow = (await getCashFlowStatementTool({ symbol: 'AAPL' })) as unknown as StatementPayload;

      const availability = (statement: StatementPayload): Record<string, boolean> =>
        statement.statements[0].fieldAvailability as Record<string, boolean>;

      expect(availability(balanceSheet).totalAssets).toBe(true);
      expect(availability(balanceSheet).totalStockholderEquity).toBe(false);
      expect(availability(incomeStatement).totalRevenue).toBe(true);
      expect(availability(incomeStatement).netIncome).toBe(false);
      expect(availability(cashFlow).operatingCashFlow ?? availability(cashFlow).totalCashFromOperatingActivities).toBe(true);
      expect(availability(cashFlow).freeCashFlow).toBe(false);
    });
  });

  describe('trend analysis workflow', () => {
    it('should complete a trend analysis workflow', async () => {
      (client.getQuote as jest.Mock).mockImplementation(async (symbol: string) => rawQuote(symbol, 175.5));
      (client.getHistoricalPrices as jest.Mock).mockResolvedValue(
        chartResult([174.5, 175.0, 175.5, 176.0, 176.5], Math.floor(Date.parse('2024-01-02T00:00:00Z') / 1000))
      );

      const quote = (await quoteTools.getQuote({ symbols: ['AAPL'] })) as unknown as QuotePayload;
      const historical = (await historicalTools.getHistoricalPrices({
        symbol: 'AAPL',
        startDate: '2024-01-02',
        endDate: '2024-01-08',
        interval: '1d'
      })) as unknown as HistoricalPayload;

      expect(historical.data).toHaveLength(5);
      expect(historical.meta.fromCache).toBe(false);
      expect(historical.meta.completenessScore).toBe(1);

      const closes = historical.data.map((row) => num(row.close));
      const avg = closes.reduce((a, b) => a + b, 0) / closes.length;

      expect(avg).toBeCloseTo(175.5, 5);
      expect(Math.min(...closes)).toBe(174.5);
      expect(Math.max(...closes)).toBe(176.5);

      const ranges = quote.results.AAPL.data.fiftyTwoWeekRange as unknown as { low: number; high: number };
      expect(ranges).toEqual({ low: 122.85, high: 210.6 });
      expect(num(quote.results.AAPL.data.regularMarketPrice)).toBe(175.5);
    });

    it('should serve the second identical request from the tool cache', async () => {
      (client.getHistoricalPrices as jest.Mock).mockResolvedValue(
        chartResult([174.5, 175.5], Math.floor(Date.parse('2024-01-02T00:00:00Z') / 1000))
      );

      const args = { symbol: 'AAPL', startDate: '2024-01-02', interval: '1d' as const };
      const first = (await historicalTools.getHistoricalPrices(args)) as unknown as HistoricalPayload;
      const second = (await historicalTools.getHistoricalPrices(args)) as unknown as HistoricalPayload;

      expect(client.getHistoricalPrices).toHaveBeenCalledTimes(1);
      expect(second.meta.fromCache).toBe(true);
      expect(second.data).toEqual(first.data);
      expect(historicalTools.getCacheSize()).toBe(1);

      // The cache-hit branch feeds generateWarnings a `{ data: rows }` envelope, and that
      // reporter scores flat quote fields, so every cached historical replay is reported as
      // missing quote fields. dataAge is also computed from the tool's own timestamp, not
      // from any provenance the service layer actually provides.
      expect(second.meta.warnings).toEqual([
        'Missing critical fields: symbol, regularMarketPrice',
        'Missing important fields: regularMarketChange, regularMarketChangePercent, marketCap, volume'
      ]);
      expect(second.meta.dataAge).toBe(0);
    });

    it('should report an empty chart as a successful empty series', async () => {
      (client.getHistoricalPrices as jest.Mock).mockResolvedValue({
        timestamps: [],
        meta: { currency: 'USD', symbol: 'AAPL' },
        indicators: { quote: [], adjclose: [] }
      });

      const result = (await historicalTools.getHistoricalPrices({
        symbol: 'AAPL',
        startDate: '2024-01-02'
      })) as unknown as HistoricalPayload;

      // extractHistoricalData only dereferences indicators.quote[0] inside the timestamp loop,
      // so an empty timestamps array hides the missing series entirely: the tool returns a
      // clean-looking payload with no rows and no warning, and caches it for an hour.
      expect(result.data).toEqual([]);
      expect(result.meta.completenessScore).toBe(0);
      expect(result.meta.warnings).toEqual([]);
      expect(result.meta.fromCache).toBe(false);

      const replay = (await historicalTools.getHistoricalPrices({
        symbol: 'AAPL',
        startDate: '2024-01-02'
      })) as unknown as HistoricalPayload;

      expect(client.getHistoricalPrices).toHaveBeenCalledTimes(1);
      expect(replay.meta.fromCache).toBe(true);
    });
  });

  describe('portfolio_due_diligence workflow', () => {
    it('should complete a portfolio analysis workflow', async () => {
      const prices: Record<string, number> = { AAPL: 175.5, MSFT: 378.5, GOOGL: 141.2, AMZN: 150, TSLA: 250 };
      (client.getQuote as jest.Mock).mockImplementation(async (symbol: string) =>
        rawQuote(symbol, prices[symbol] ?? 100)
      );

      const portfolio = [
        { symbol: 'AAPL', shares: 10 },
        { symbol: 'MSFT', shares: 5 },
        { symbol: 'GOOGL', shares: 15 },
        { symbol: 'AMZN', shares: 8 },
        { symbol: 'TSLA', shares: 3 }
      ];

      const quote = (await quoteTools.getQuote({
        symbols: portfolio.map((p) => p.symbol)
      })) as unknown as QuotePayload;

      expect(quote.summary.totalReturned).toBe(5);

      const holdings = portfolio.map((position) => {
        const price = num(quote.results[position.symbol].data.regularMarketPrice);
        return { ...position, price, value: price * position.shares };
      });

      const totalValue = holdings.reduce((sum, h) => sum + h.value, 0);

      expect(totalValue).toBeCloseTo(175.5 * 10 + 378.5 * 5 + 141.2 * 15 + 150 * 8 + 250 * 3, 5);
      // GOOGL at 15 shares is the largest leg, not the highest-priced one.
      expect(holdings.sort((a, b) => b.value - a.value)[0].symbol).toBe('GOOGL');
    });

    it('should report the holdings that could not be priced', async () => {
      (client.getQuote as jest.Mock).mockImplementation(async (symbol: string) => {
        if (symbol === 'INVALID') {
          throw new Error('Symbol not found');
        }
        return rawQuote(symbol, 100);
      });

      const quote = (await quoteTools.getQuote({ symbols: ['AAPL', 'INVALID', 'MSFT'] })) as unknown as QuotePayload;

      expect(quote.summary.totalReturned).toBe(2);
      expect(quote.summary.errors).toHaveLength(1);
      expect(quote.results.INVALID).toBeUndefined();
    });

    it('should degrade profile, crypto and forex steps instead of failing the workflow', async () => {
      (client.getSummaryProfile as jest.Mock).mockResolvedValue({
        assetProfile: {
          sector: 'Technology',
          industry: 'Consumer Electronics',
          longBusinessSummary: 'Apple Inc. designs, manufactures and sells smartphones.',
          fullTimeEmployees: 155000,
          city: 'Cupertino',
          country: 'United States',
          website: 'https://www.apple.com'
        }
      });
      (client.getCryptoQuote as jest.Mock).mockResolvedValue({ 'BTC-USD': { regularMarketPrice: 60000 } });
      (client.getForexQuote as jest.Mock).mockResolvedValue({ 'EURUSD=X': { regularMarketPrice: 1.08 } });

      const profile = await summaryTools.getSummaryProfile({ symbol: 'AAPL' });
      const crypto = await summaryTools.getCryptoQuote({ symbols: ['BTC-USD'] });
      const forex = await summaryTools.getForexQuote({ pairs: ['EURUSD=X'] });

      expect(profile.symbol).toBe('AAPL');
      expect(crypto.summary.totalReturned).toBe(1);
      expect(crypto.results['BTC-USD']).toEqual({ regularMarketPrice: 60000 });
      expect(forex.summary.totalReturned).toBe(1);
      expect(client.getSummaryProfile).toHaveBeenCalledTimes(1);
    });

    it('should collect market overview from trending and screener', async () => {
      (client.getTrending as jest.Mock).mockResolvedValue({
        quotes: [{ symbol: 'AAPL', lastPrice: 175.5 }],
        jobTimestamp: 1,
        startInterval: 0,
        endInterval: 1
      });
      (client.screener as jest.Mock).mockResolvedValue({
        finance: { result: [{ quotes: [{ symbol: 'NVDA', industry: 'Semiconductors' }], meta: { count: 1, start: 0, end: 1 } }], error: undefined }
      });

      const trending = await summaryTools.getTrendingSymbols({ region: 'US', limit: 10 });
      const screened = await summaryTools.screener({ filters: { sector: 'Technology' }, limit: 10 });

      expect(trending.trending.quotes).toHaveLength(1);
      // meta.fromCache on this path is `dataAge > 1000`, i.e. invented provenance.
      expect(trending.meta.fromCache).toBe(false);
      expect(screened.meta.completenessScore).toBeGreaterThan(0);

      // getTrending takes a single options object; the limit is applied downstream by the tool.
      expect(client.getTrending).toHaveBeenCalledWith({ region: 'US' });
      expect(client.screener).toHaveBeenCalledWith(
        [{ field: 'sector', operator: '=', value: 'Technology' }],
        { count: 10, offset: 0 }
      );
    });
  });

  describe('error recovery workflow', () => {
    it('should not retry inside a tool handler', async () => {
      let calls = 0;
      (client.getQuote as jest.Mock).mockImplementation(async () => {
        calls++;
        throw new Error('API error');
      });

      const quote = (await quoteTools.getQuote({ symbols: ['AAPL'] })) as unknown as QuotePayload;

      expect(calls).toBe(1);
      expect(quote.summary.totalReturned).toBe(0);
      expect(quote.summary.errors[0].error).toBe('API error');
    });

    it('should retry the same interval three times and never reach the fallback interval', async () => {
      (client.getHistoricalPrices as jest.Mock).mockRejectedValue(new Error('chart unavailable'));

      const pending = historicalTools.getHistoricalPrices({ symbol: 'AAPL', startDate: '2024-01-02', interval: '1d' });
      const rejection = expect(pending).rejects.toThrow('chart unavailable');
      await jest.advanceTimersByTimeAsync(30000);
      await rejection;

      // fetchWithRetry builds ['1d', '1wk'] from the requested interval, but the last attempt
      // of the inner loop RETURNS rather than breaking, so the second interval is dead code
      // and only three attempts ever happen.
      expect(client.getHistoricalPrices).toHaveBeenCalledTimes(3);
      const intervals = (client.getHistoricalPrices as jest.Mock).mock.calls.map(
        (call) => (call[1] as { interval: string }).interval
      );
      expect(intervals).toEqual(['1d', '1d', '1d']);
    });

    it('should replay a cached payload when a later fetch fails', async () => {
      (client.getHistoricalPrices as jest.Mock).mockResolvedValueOnce(
        chartResult([174.5, 175.5], Math.floor(Date.parse('2024-01-02T00:00:00Z') / 1000))
      );

      const args = { symbol: 'AAPL', startDate: '2024-01-02', interval: '1d' as const };
      await historicalTools.getHistoricalPrices(args);

      (client.getHistoricalPrices as jest.Mock).mockRejectedValue(new Error('chart unavailable'));

      // The cache hit short-circuits before any fetch, so the failing client is never asked.
      const replay = (await historicalTools.getHistoricalPrices(args)) as unknown as HistoricalPayload;

      expect(replay.meta.fromCache).toBe(true);
      expect(client.getHistoricalPrices).toHaveBeenCalledTimes(1);
    });

    it('should surface every symbol failure when all of them fail', async () => {
      (client.getQuote as jest.Mock).mockRejectedValue(new Error('API error'));

      const quote = (await quoteTools.getQuote({ symbols: ['AAPL', 'MSFT', 'GOOGL'] })) as unknown as QuotePayload;

      expect(quote.summary.totalReturned).toBe(0);
      expect(quote.summary.errors).toHaveLength(3);
    });

    it('should degrade holders and news instead of throwing on a silent module', async () => {
      library.quoteSummary.mockResolvedValue({
        majorHoldersBreakdown: {
          maxAge: 1,
          insidersPercentHeld: 0.02,
          institutionsPercentHeld: 0.61,
          institutionsFloatPercentHeld: 0.66,
          institutionsCount: 4213
        }
      });
      library.search.mockResolvedValue({ count: 0, news: [] });

      const holders = (await getMajorHoldersTool({ symbol: 'AAPL' })) as Record<string, unknown>;
      const news = (await getCompanyNewsTool({ symbol: 'AAPL' })) as Record<string, unknown>;

      const meta = holders.meta as Meta & { dataSource: string };
      expect(meta.completenessScore).toBeCloseTo(0.2, 5);
      expect(meta.dataSource).toBe('Yahoo Finance');
      expect(news.count).toBe(0);
      expect((news.meta as Meta).warnings).toContain('No news articles available for this symbol');
    });
  });

  describe('data quality workflow', () => {
    it('should validate data quality across every tool family', async () => {
      (client.getQuote as jest.Mock).mockImplementation(async (symbol: string) => rawQuote(symbol, 175.5));
      library.search.mockResolvedValue({ count: 0, news: [] });

      const quote = (await quoteTools.getQuote({ symbols: ['AAPL'] })) as unknown as QuotePayload;
      const balanceSheet = (await getBalanceSheetTool({ symbol: 'AAPL' })) as unknown as StatementPayload;
      const incomeStatement = (await getIncomeStatementTool({ symbol: 'AAPL' })) as unknown as StatementPayload;
      const cashFlow = (await getCashFlowStatementTool({ symbol: 'AAPL' })) as unknown as StatementPayload;
      const news = (await getCompanyNewsTool({ symbol: 'AAPL' })) as Record<string, unknown>;

      const metas: Meta[] = [
        quote.results.AAPL.meta,
        balanceSheet.meta,
        incomeStatement.meta,
        cashFlow.meta,
        news.meta as Meta
      ];

      for (const meta of metas) {
        expect(meta.completenessScore).toBeGreaterThanOrEqual(0);
        expect(meta.completenessScore).toBeLessThanOrEqual(1);
        expect(Array.isArray(meta.warnings)).toBe(true);
        expect(typeof meta.fromCache).toBe('boolean');
        expect(typeof meta.dataAge).toBe('number');
      }

      // Financials report a full 13-field balance sheet, so only the quote is allowed to be
      // anything other than perfect here.
      expect(balanceSheet.meta.completenessScore).toBe(1);
    });

    it('should warn when data is only partially available', async () => {
      (client.getQuote as jest.Mock).mockResolvedValue({ invalid: 'data' });

      const quote = (await quoteTools.getQuote({ symbols: ['AAPL'] })) as unknown as QuotePayload;

      expect(quote.results.AAPL.meta.completenessScore).toBe(0);
      expect(quote.results.AAPL.meta.warnings).toContain('Low data completeness (<50%)');
    });

    it('should report statement recency from the period end, never a data age', async () => {
      const balanceSheet = (await getBalanceSheetTool({ symbol: 'AAPL' })) as unknown as StatementPayload;

      // buildStatementMetadata is always called with dataAge 0, so the staleness branch in
      // financials.ts cannot fire from this path.
      expect(balanceSheet.meta.dataAge).toBe(0);
      expect(balanceSheet.meta.recency).toBe('2023-09-30');
      expect(balanceSheet.meta.warnings).toEqual([]);
    });
  });

  describe('performance workflow', () => {
    it('should complete a multi-tool workflow within the batch pacing budget', async () => {
      (client.getQuote as jest.Mock).mockImplementation(async (symbol: string) => rawQuote(symbol, 175.5));

      const started = Date.now();

      const pending = quoteTools.getQuote({ symbols: ['AAPL', 'MSFT', 'GOOGL'] });
      await jest.advanceTimersByTimeAsync(1000);
      await pending;

      await getBalanceSheetTool({ symbol: 'AAPL' });
      await getIncomeStatementTool({ symbol: 'AAPL' });
      await getCashFlowStatementTool({ symbol: 'AAPL' });

      expect(Date.now() - started).toBeLessThan(5000);
    });

    it('should keep a batch of 50 symbols inside the pacing envelope', async () => {
      (client.getQuote as jest.Mock).mockImplementation(async (symbol: string) => rawQuote(symbol, 100));

      const symbols = Array.from({ length: 50 }, (_unused, i) => `SYM${i}`);
      const started = Date.now();

      const pending = quoteTools.getQuote({ symbols });
      await jest.advanceTimersByTimeAsync(800);
      const quote = (await pending) as unknown as QuotePayload;

      expect(quote.summary.totalReturned).toBe(50);
      // 5 batches of BATCH_SIZE 10 means exactly 4 pacing delays of 200 ms.
      expect(Date.now() - started).toBe(800);
    });
  });
});
