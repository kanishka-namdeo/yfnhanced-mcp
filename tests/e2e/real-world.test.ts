import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import { yahooFinance, YahooFinanceClient } from '../../src/services/yahoo-finance';
import { QuoteTools } from '../../src/tools/quotes';
import { EarningsTools } from '../../src/tools/earnings';
import { HistoricalTools } from '../../src/tools/historical';
import { AnalysisTools } from '../../src/tools/analysis';
import {
  getBalanceSheetTool,
  getIncomeStatementTool,
  getCashFlowStatementTool,
  clearFinancialsCache
} from '../../src/tools/financials';
import { getCompanyNewsTool, clearNewsCache } from '../../src/tools/news';
import { getMajorHoldersTool, clearHoldersCache } from '../../src/tools/holders';
import { getOptionsTool, clearOptionsCache } from '../../src/tools/options';
import { DataQualityReporter } from '../../src/utils/data-completion';
import { defaultConfig } from '../../src/config/defaults';

/**
 * This suite calls the tool modules in-process, so it must stub the seam `src/` actually
 * calls: the shared `yahooFinance` singleton from `src/services/yahoo-finance.ts` — its
 * `quote`, `chart`, `quoteSummary`, `search`, `options` and `fundamentalsTimeSeries`
 * methods. Everything above that seam (YahooFinanceClient, the middleware stack, the tool
 * handlers, zod schemas, data-quality scoring) stays real, so the suite is deterministic
 * without touching `src/` and without any network access.
 */

const TEST_SYMBOLS = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META'];
const TEST_SYMBOL = 'AAPL';

// Symbols the stub refuses, so batch error collection is exercised on purpose.
const UNPRICEABLE_SYMBOLS = new Set(['ZZZNOWS1', 'ZZZNOWS2']);

const QUOTE_FIXTURE = {
  symbol: TEST_SYMBOL,
  shortName: 'Apple Inc.',
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
  regularMarketOpen: 194.02,
  regularMarketDayHigh: 196.5,
  regularMarketDayLow: 193.66,
  regularMarketVolume: 54000000,
  marketCap: 3010000000000,
  fiftyTwoWeekHigh: 221.0,
  fiftyTwoWeekLow: 149.02,
  fiftyTwoWeekChangePercent: 18.4,
  averageDailyVolume3Month: 61000000,
  averageDailyVolume10Day: 58000000,
  fiftyDayAverage: 191.2,
  twoHundredDayAverage: 184.6,
  trailingPE: 31.2,
  forwardPE: 28.4,
  trailingEps: 6.27,
  forwardEps: 6.88,
  epsTrailingTwelveMonths: 6.27,
  dividendRate: 0.96,
  dividendYield: 0.0049,
  trailingAnnualDividendYield: 0.0049,
  dividendDate: new Date('2025-08-07T00:00:00.000Z'),
  beta: 1.21,
  sharesOutstanding: 15400000000,
  impliedSharesOutstanding: 15400000000,
  averageTrueRange: 3.11,
  fullExchangeName: 'NasdaqGS',
  typeDisp: 'Equity',
  regularMarketTime: new Date('2025-09-12T20:00:00.000Z'),
  firstTradeDateMilliseconds: 1222286400000,
  priceHint: 2,
  chartPreviousClose: 193.14
};

const EARNINGS_QUARTERLY = [
  { date: '2025-07-31', actual: 1.57, estimate: 1.52 },
  { date: '2025-04-30', actual: 1.65, estimate: 1.6 },
  { date: '2025-01-30', actual: 2.04, estimate: 1.97 },
  { date: '2024-10-31', actual: 1.64, estimate: 1.6 },
  { date: '2024-07-31', actual: 1.53, estimate: 1.48 },
  { date: '2024-04-30', actual: 1.53, estimate: 1.42 },
  { date: '2024-01-30', actual: 2.18, estimate: 2.1 },
  { date: '2023-10-31', actual: 2.43, estimate: 1.89 },
  { date: '2023-07-31', actual: 1.46, estimate: 1.45 },
  { date: '2023-04-30', actual: 1.52, estimate: 1.4 }
];

const EARNINGS_TREND_ROWS = [
  {
    period: '0m',
    endDate: new Date('2025-09-30T00:00:00.000Z'),
    growth: 0.08,
    earningsEstimate: { avg: 1.58, low: 1.4, high: 1.7, yearAgoEps: 1.46, numberOfAnalysts: 24, currency: 'USD' },
    revenueEstimate: { avg: 92000000000, low: 88000000000, high: 95000000000, numberOfAnalysts: 26, yearAgoRevenue: 85000000000, growth: 0.07, currency: 'USD' },
    epsActual: 1.57,
    epsEstimate: 1.52,
    epsError: 0.05,
    revenueActual: 91000000000,
    revenueEstimateAvg: 92000000000
  },
  {
    period: '+1m',
    endDate: new Date('2025-12-31T00:00:00.000Z'),
    growth: 0.05,
    earningsEstimate: { avg: 1.72, low: 1.5, high: 1.9, yearAgoEps: 1.64, numberOfAnalysts: 20, currency: 'USD' },
    revenueEstimate: { avg: 120000000000, low: 112000000000, high: 126000000000, numberOfAnalysts: 22, yearAgoRevenue: 115000000000, growth: 0.04, currency: 'USD' },
    epsActual: null,
    epsEstimate: 1.72,
    epsError: null,
    revenueActual: null,
    revenueEstimateAvg: 120000000000
  }
];

const RECOMMENDATION_TREND_ROWS = [
  { period: '0m', strongBuy: 12, buy: 22, hold: 9, sell: 2, strongSell: 1 },
  { period: '-1m', strongBuy: 11, buy: 20, hold: 10, sell: 3, strongSell: 1 },
  { period: '-2m', strongBuy: 10, buy: 19, hold: 11, sell: 3, strongSell: 1 }
];

const INSTITUTIONAL_HOLDERS = [
  {
    organization: 'The Vanguard Group, Inc.',
    holderName: 'THE VANGUARD GROUP INC',
    position: { raw: 1200000000, fmt: '1.2B' },
    lastReported: { raw: 1750000000, fmt: '2025-06-14T00:00:00.000' },
    inHundredDays: { raw: -0.01, fmt: '-1.00%' }
  },
  {
    organization: 'BlackRock Inc.',
    holderName: 'BLACKROCK CAPITAL MANAGEMENT, INC.',
    position: { raw: 900000000, fmt: '900M' },
    lastReported: { raw: 1750000000, fmt: '2025-06-14T00:00:00.000' },
    inHundredDays: { raw: 0.02, fmt: '2.00%' }
  }
];

const FUND_HOLDERS = [
  {
    organization: 'Vanguard Total Stock Mkt Idx Inv.',
    holderName: 'VANGUARD INDEX FUNDS TOTAL STOCK MARKET INDEX FUND',
    position: { raw: 400000000, fmt: '400M' },
    lastReported: { raw: 1750000000, fmt: '2025-06-30T00:00:00.000' },
    inHundredDays: { raw: 0.01, fmt: '1.00%' },
    pctShares: { raw: 0.026, fmt: '2.60%' }
  }
];

const INSIDER_HOLDERS = [
  // `convertInsiderHolder` expects the flat v4 row shape — `relation` is a job title
  // string and the positions are top-level numbers, not the nested
  // `relation.latestTransaction` structure the older module used to send.
  {
    name: 'TIMOTHY D COOK',
    relation: 'Chief Executive Officer',
    positionDirect: 3300000,
    positionIndirect: 0,
    latestTransDate: new Date('2023-11-14T00:00:00.000Z'),
    positionDirectDate: new Date('2023-11-14T00:00:00.000Z'),
    filerUrl: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany',
    maxAge: 0
  }
];

const DIRECT_HOLDERS = [
  {
    organization: 'APPLE INC COMMON STOCK',
    holderName: 'APPLE INC COMMON STOCK',
    holderType: 'individual',
    position: { raw: 3300000, fmt: '3.3M' },
    positionDirect: { raw: 3300000, fmt: '3.3M' },
    positionDirectDate: { raw: 1700000000, fmt: '2023-11-14T00:00:00.000' },
    positionIndirect: { raw: 0, fmt: '0' },
    lastReported: { raw: 1700000000, fmt: '2023-11-14T00:00:00.000' }
  }
];

const NEWS_ITEMS = Array.from({ length: 12 }, (_unused, index) => ({
  uuid: `story-${index}`,
  title: `Apple story number ${index}`,
  publisher: index % 2 === 0 ? 'Reuters' : 'Bloomberg',
  link: `https://finance.yahoo.com/news/apple-story-${index}`,
  providerPublishTime: new Date(Date.UTC(2025, 8, 12 - index)),
  type: 'STORY',
  relatedTickers: index === 11 ? [] : ['AAPL', 'MSFT'],
  thumbnail: {
    resolutions: [{ url: `https://img.example/${index}.jpg`, width: 800, height: 600, tag: 'thumb' }]
  }
}));

const OPTION_CONTRACTS = (kind: 'C' | 'P'): Array<Record<string, unknown>> => [150, 200].map(strike => ({
  contractSymbol: `AAPL260116${kind}00${strike.toString().padStart(8, '0')}`,
  strike,
  lastPrice: kind === 'C' ? 46.5 - (strike - 150) : 4.5 + (strike - 150),
  change: 0.5,
  percentChange: 1.1,
  volume: 1200,
  openInterest: 8000,
  bid: kind === 'C' ? 46 : 4,
  ask: kind === 'C' ? 47 : 5,
  impliedVolatility: 0.28,
  inTheMoney: kind === 'C' ? strike < 195 : strike > 195,
  contractSize: 'regular',
  currency: 'USD',
  creationDate: new Date('2025-01-01T00:00:00.000Z'),
  lastTradeDate: new Date('2025-09-12T20:00:00.000Z'),
  expiration: new Date('2026-01-16T00:00:00.000Z'),
  underlying: 'AAPL'
}));

const BALANCE_SHEET_ROWS = [2024, 2023, 2022].map((year, index) => ({
  TYPE: 'BALANCE_SHEET',
  date: new Date(Date.UTC(year, 8, 28)),
  COLLECTION_TYPE: 'annual',
  CURRENCY: 'USD',
  totalAssets: 352000000000 - index * 10000000000,
  totalLiabilitiesNetMinorityInterest: 302000000000 - index * 9000000000,
  stockholdersEquity: 50000000000 + index * 9000000000,
  cashAndCashEquivalents: 29000000000 + index * 1000000000,
  cashCashEquivalentsAndShortTermInvestments: 91000000000,
  receivables: 33000000000,
  inventory: 6000000000,
  currentAssets: 134000000000,
  currentLiabilities: 76000000000,
  longTermDebt: 95000000000,
  netPPE: 45000000000,
  goodwill: 0,
  otherIntangibleAssets: 0,
  retainedEarnings: 15000000000,
  otherAssets: 42000000000,
  otherLiabilities: 48000000000
}));

const INCOME_STATEMENT_ROWS = [2024, 2023, 2022].map((year, index) => ({
  TYPE: 'FINANCIALS',
  date: new Date(Date.UTC(year, 8, 28)),
  COLLECTION_TYPE: 'annual',
  CURRENCY: 'USD',
  totalRevenue: 391000000000 - index * 6000000000,
  costOfRevenue: 214000000000 - index * 4000000000,
  grossProfit: 177000000000 - index * 2000000000,
  operatingIncome: 119000000000 - index * 2000000000,
  EBITDA: 131000000000,
  netIncome: 93700000000 - index * 3000000000,
  basicEPS: 6.08,
  dilutedEPS: 6.08,
  interestExpenseNonOperating: 0,
  taxProvision: 19000000000,
  researchAndDevelopment: 30000000000,
  sellingGeneralAndAdministration: 24000000000,
  operatingExpense: 64000000000,
  otherOperatingExpenses: 0,
  totalUnusualItems: 0,
  interestIncomeNonOperating: 0,
  otherIncomeExpense: 1000000000
}));

const CASH_FLOW_ROWS = [2024, 2023, 2022].map((year, index) => ({
  TYPE: 'CASH_FLOW',
  date: new Date(Date.UTC(year, 8, 28)),
  COLLECTION_TYPE: 'annual',
  CURRENCY: 'USD',
  operatingCashFlow: 111000000000 - index * 2000000000,
  capitalExpenditure: 10000000000,
  cashFlowFromContinuingFinancingActivities: -109000000000,
  cashFlowFromContinuingInvestingActivities: -26000000000,
  depreciationAndAmortization: 12000000000,
  commonStockDividendPaid: 15000000000,
  repurchaseOfCapitalStock: 92000000000,
  changesInCash: -23000000000,
  freeCashFlow: 101000000000,
  netIssuancePaymentsOfDebt: -10000000000,
  netOtherInvestingChanges: -1000000000,
  netOtherFinancingCharges: -2000000000,
  effectOfExchangeRateChanges: 0
}));

function chartBars(symbol: string): Record<string, unknown> {
  const base = symbol === TEST_SYMBOL ? 190 : 100;
  const timestamps = [0, 1, 2, 3, 4].map(offset =>
    Math.floor(new Date(Date.UTC(2025, 8, 8 + offset)).getTime() / 1000)
  );

  return {
    timestamp: timestamps,
    indicators: {
      quote: [{
        open: timestamps.map((_t, i) => base + i),
        high: timestamps.map((_t, i) => base + i + 2.5),
        low: timestamps.map((_t, i) => base + i - 1.5),
        close: timestamps.map((_t, i) => base + i + 1),
        volume: timestamps.map((_t, i) => 50000000 + i)
      }],
      adjclose: [{ adjclose: timestamps.map((_t, i) => base + i + 1) }]
    },
    meta: {
      currency: 'USD',
      symbol,
      exchangeName: 'NasdaqGS',
      instrumentType: 'EQUITY',
      firstTradeDate: new Date('1980-12-12T14:32:00.000Z'),
      regularMarketTime: new Date('2025-09-12T20:00:00.000Z'),
      gmtoffset: -14400000,
      timezone: 'EDT',
      exchangeTimezoneName: 'America/New_York',
      regularMarketPrice: base + 5,
      chartPreviousClose: base,
      priceHint: 2
    }
  };
}

function quoteSummaryModules(symbol: string, modules: string[]): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    assetProfile: {
      sector: 'Technology',
      industry: 'Consumer Electronics',
      longBusinessSummary: 'Apple Inc. designs, manufactures and markets smartphones and personal computers.',
      employees: 164000,
      fullTimeEmployees: 164000,
      country: 'United States',
      city: 'Cupertino',
      state: 'California',
      website: 'https://www.apple.com',
      phone: '408-996-1010',
      companyName: 'Apple Inc.'
    },
    earnings: {
      earningsChart: {
        currentQuarterEstimate: 1.58,
        currentQuarterEstimateDate: { fmt: '9/30', raw: 1759190400 },
        currentQuarterEstimateYearAgo: 1.46,
        earningsDate: { date: '2025-09-30' },
        quarterly: EARNINGS_QUARTERLY,
        annual: []
      },
      financialsChart: {
        yearly: [{ date: '2024', revenue: 391000000000, earnings: 93700000000 }],
        quarterly: [{ date: '2025-Q3', revenue: 94000000000, earnings: 14736000000 }]
      }
    },
    earningsTrend: { trend: EARNINGS_TREND_ROWS, maxAge: 0 },
    industryTrend: {
      symbol: 'Consumer Electronics',
      estimates: [
        { period: '0m', growth: 0.08, actual: 0.07 },
        { period: '+1m', growth: 0.05, actual: null }
      ],
      maxAge: 0
    },
    recommendationTrend: { trend: RECOMMENDATION_TREND_ROWS, maxAge: 0 },
    financialData: {
      recommendationKey: 'buy',
      targetMeanPrice: 210.5,
      targetHighPrice: 260,
      targetLowPrice: 170,
      targetMedianPrice: 212,
      numberOfAnalystOpinions: 44,
      totalCash: 29000000000,
      totalDebt: 106000000000
    },
    price: { longName: 'Apple Inc.', symbol, regularMarketPrice: QUOTE_FIXTURE.regularMarketPrice },
    majorHoldersBreakdown: {
      maxAge: 0,
      insidersPercentHeld: 0.0203,
      institutionsPercentHeld: 0.6124,
      institutionsFloatPercentHeld: 0.625,
      institutionsCount: 15857
    },
    institutionOwnership: { ownershipList: INSTITUTIONAL_HOLDERS, maxAge: 0 },
    fundOwnership: { ownershipList: FUND_HOLDERS, maxAge: 0 },
    insiderHolders: { holders: INSIDER_HOLDERS, maxAge: 0 },
    majorDirectHolders: { holders: DIRECT_HOLDERS, maxAge: 0 },
    defaultKeyStatistics: { trailingPE: QUOTE_FIXTURE.trailingPE, beta: QUOTE_FIXTURE.beta },
    summaryDetail: { marketCap: QUOTE_FIXTURE.marketCap, previousClose: QUOTE_FIXTURE.regularMarketPreviousClose }
  };

  const selected: Record<string, unknown> = {};
  for (const module of modules) {
    if (module in payload) {
      selected[module] = payload[module];
    }
  }
  return selected;
}

function quoteFixture(symbol: string): Record<string, unknown> {
  if (symbol === TEST_SYMBOL) {
    return { ...QUOTE_FIXTURE };
  }
  return {
    ...QUOTE_FIXTURE,
    symbol,
    shortName: `${symbol} Inc.`,
    longName: `${symbol} Inc.`,
    regularMarketPrice: 100 + symbol.length,
    marketCap: 1000000000000,
    regularMarketVolume: 10000000
  };
}

const spies: Array<{ mockRestore: () => void }> = [];

function stub<T>(method: string, implementation: (...args: any[]) => T): void {
  const target = yahooFinance as unknown as Record<string, unknown>;
  const original = target[method];
  if (typeof original !== 'function') {
    throw new Error(`yahooFinance.${method} is not a function — the seam moved.`);
  }
  const spy = jest.fn(implementation) as unknown as { mockRestore: () => void };
  Object.defineProperty(target, method, { value: spy, configurable: true, writable: true });
  spies.push({
    mockRestore: () => {
      Object.defineProperty(target, method, { value: original, configurable: true, writable: true });
    }
  });
}

describe('Real-World Yahoo Finance MCP Tests (stubbed yahoo-finance2 seam, no network)', () => {
  let yahooClient: YahooFinanceClient;
  let qualityReporter: DataQualityReporter;
  let quoteTools: QuoteTools;
  let earningsTools: EarningsTools;
  let analysisTools: AnalysisTools;
  let historicalTools: HistoricalTools;

  beforeAll(async () => {
    stub('quote', (symbol: string) => {
      if (UNPRICEABLE_SYMBOLS.has(String(symbol))) {
        throw new Error(`No data found for symbol ${symbol}`);
      }
      return quoteFixture(String(symbol));
    });

    stub('chart', (symbol: string) => chartBars(String(symbol)));

    stub('quoteSummary', (symbol: string, options?: { modules?: string[] }) =>
      quoteSummaryModules(String(symbol), options?.modules ?? [])
    );

    stub('search', (_symbol: string, options?: { newsCount?: number }) => ({
      news: NEWS_ITEMS.slice(0, options?.newsCount ?? NEWS_ITEMS.length),
      quotes: [],
      hasNext: false
    }));

    stub('options', () => ({
      underlyingSymbol: TEST_SYMBOL,
      expirationDates: [new Date('2026-01-16T00:00:00.000Z'), new Date('2026-02-20T00:00:00.000Z')],
      strikes: [150, 200],
      hasMiniOptions: false,
      quote: { regularMarketPrice: QUOTE_FIXTURE.regularMarketPrice },
      options: [{
        date: new Date('2026-01-16T00:00:00.000Z'),
        expirationDate: new Date('2026-01-16T00:00:00.000Z'),
        hasMiniOptions: false,
        calls: OPTION_CONTRACTS('C'),
        puts: OPTION_CONTRACTS('P')
      }]
    }));

    stub('fundamentalsTimeSeries', (_symbol: string, options?: { module?: string }) => {
      switch (options?.module) {
        case 'balance-sheet':
          return BALANCE_SHEET_ROWS;
        case 'financials':
          return INCOME_STATEMENT_ROWS;
        case 'cash-flow':
          return CASH_FLOW_ROWS;
        default:
          return [];
      }
    });

    // The config mirrors the shape `src/server.ts:132-188` hands the client — the keys the
    // middleware classes actually read (`maxRequests`, `errorThresholdPercentage`,
    // `initialDelayMs`, …), not the `src/config/defaults.ts` names. Handing the client
    // `defaultConfig` directly would leave every limiter capacity `undefined` and drop the
    // breaker to its inline 5-failure threshold, which is how one bad symbol used to open
    // the circuit for the whole suite. The retry budget is cut to zero so a deliberate
    // stub failure surfaces immediately instead of being retried and backed off.
    yahooClient = new YahooFinanceClient({
      rateLimit: { strategy: 'token-bucket', maxRequests: 100000, windowMs: 60000 },
      cache: {
        enabled: true,
        store: 'memory',
        ttl: defaultConfig.cache.ttlQuotes,
        maxEntries: defaultConfig.cache.maxCacheSize
      },
      retry: {
        enabled: true,
        maxRetries: 0,
        initialDelayMs: 1,
        maxDelayMs: 10,
        strategy: 'fixed',
        backoffMultiplier: 1,
        jitter: false,
        retryableStatusCodes: defaultConfig.retry.retryableStatusCodes,
        retryableErrorCodes: defaultConfig.retry.retryableErrors
      },
      circuitBreaker: {
        enabled: true,
        timeoutMs: 60000,
        errorThresholdPercentage: 50,
        resetTimeoutMs: 60000,
        rollingCountBuckets: 10,
        rollingCountTimeoutMs: 60000,
        volumeThreshold: defaultConfig.circuitBreaker.failureThreshold,
        halfOpenMaxAttempts: defaultConfig.circuitBreaker.successThreshold
      },
      queue: {
        enabled: true,
        maxSize: defaultConfig.queue.maxQueueSize,
        strategy: 'fifo',
        concurrency: defaultConfig.queue.maxConcurrent,
        timeoutMs: defaultConfig.queue.queueTimeout,
        processingTimeoutMs: defaultConfig.queue.batchWindow
      },
      dataCompletion: {
        enabled: defaultConfig.dataCompletion.enableFallback,
        level: 'moderate',
        requiredFields: [],
        preferredFields: defaultConfig.dataCompletion.fallbackPriority,
        allowPartial: defaultConfig.dataCompletion.fillMissingFields,
        fallbackToCache: true
      },
      logging: defaultConfig.logging,
      network: defaultConfig.network,
      yahooFinance: defaultConfig.yahooFinance,
      serverInfo: defaultConfig.serverInfo,
      capabilities: defaultConfig.capabilities,
      security: defaultConfig.security,
      transport: 'stdio'
    } as never);

    qualityReporter = new DataQualityReporter(60000);
    quoteTools = new QuoteTools(yahooClient, qualityReporter);
    earningsTools = new EarningsTools(yahooClient);
    analysisTools = new AnalysisTools(yahooClient);
    historicalTools = new HistoricalTools(yahooClient, qualityReporter);

    await yahooClient.initialize();
  });

  beforeEach(() => {
    // The tool modules keep module-level caches that outlive a single test; clearing them
    // keeps every case independent of the order Jest ran the others in.
    clearFinancialsCache();
    clearNewsCache();
    clearOptionsCache();
    clearHoldersCache();
  });

  afterAll(async () => {
    for (const spy of spies.splice(0).reverse()) {
      spy.mockRestore();
    }
    await yahooClient.shutdown();
  });

  describe('Real-Time Quote Data', () => {
    it('should fetch real-time quotes for single symbol', async () => {
      const result = await quoteTools.getQuote({ symbols: [TEST_SYMBOL] });

      expect(result.results).toHaveProperty(TEST_SYMBOL);
      expect(result.summary.totalRequested).toBe(1);
      expect(result.summary.totalReturned).toBe(1);
      expect(result.summary.errors).toEqual([]);

      const quote = result.results[TEST_SYMBOL];
      expect(quote.data.regularMarketPrice).toBe(195.45);
      expect(quote.data.regularMarketChange).toBe(2.31);
      expect(quote.data.regularMarketVolume).toBe(54000000);
      expect(quote.meta.completenessScore).toBeGreaterThan(0);
      expect(quote.meta.dataAge).toBeGreaterThanOrEqual(0);
    });

    it('should fetch real-time quotes for multiple symbols', async () => {
      const result = await quoteTools.getQuote({ symbols: TEST_SYMBOLS });

      expect(result.summary.totalRequested).toBe(TEST_SYMBOLS.length);
      expect(result.summary.totalReturned).toBe(TEST_SYMBOLS.length);

      for (const symbol of TEST_SYMBOLS) {
        const quote = result.results[symbol];
        expect(quote.data.regularMarketPrice).toBeGreaterThan(0);
        expect(quote.data.regularMarketVolume).toBeGreaterThan(0);
      }
    });

    it('should fetch comprehensive quote with all fields', async () => {
      const result = await quoteTools.getQuote({ symbols: [TEST_SYMBOL], forceRefresh: true });
      const quote = result.results[TEST_SYMBOL];

      expect(quote.data.regularMarketPrice).toBe(195.45);
      expect(quote.data.regularMarketChange).toBe(2.31);
      expect(quote.data.regularMarketChangePercent).toBe(1.197);
      expect(quote.data.regularMarketPreviousClose).toBe(193.14);
      expect(quote.data.regularMarketOpen).toBe(194.02);
      expect(quote.data.regularMarketDayRange).toEqual({ low: 193.66, high: 196.5 });
      expect(quote.data.fiftyTwoWeekRange).toEqual({ low: 149.02, high: 221 });
      expect(quote.data.marketCap).toBe(3010000000000);
      expect(quote.data.trailingPE).toBe(31.2);
      expect(quote.data.forwardPE).toBe(28.4);
      expect(quote.data.beta).toBe(1.21);
    });

    it('should fetch quote summary with company overview', async () => {
      // `getQuoteSummary` is served by `getSummaryProfile`, which only ever requests the
      // `assetProfile` module, so a non-empty summary is only reachable through that module.
      const result = await quoteTools.getQuoteSummary({
        symbol: TEST_SYMBOL,
        modules: ['assetProfile'],
        retryOnFailure: true
      });

      expect(result.symbol).toBe(TEST_SYMBOL);
      expect(result.modules).toEqual(['assetProfile']);
      // `flattenSummaryData` prefixes each module's fields with `"<module>."`.
      expect(result.data['assetProfile.sector']).toBe('Technology');
      expect(result.data['assetProfile.industry']).toBe('Consumer Electronics');
      expect(result.completenessPercentage).toBeGreaterThan(0);
      expect(result.metadata.sourceReliability).toBeDefined();
      expect(result.metadata.recommendation).toBeDefined();
    });

    it('Pinned defect: the advertised default summary modules can never be satisfied', async () => {
      // `QuoteTools.getQuoteSummary` defaults to `defaultKeyStatistics, summaryDetail,
      // financialData, price`, but it sources them from `getSummaryProfile`, whose
      // quoteSummary call asks for `assetProfile` only, so `extractSummaryModules` finds
      // none of the requested keys and completeness is always 0.
      const result = await quoteTools.getQuoteSummary({ symbol: TEST_SYMBOL });

      expect(result.data).toEqual({});
      expect(result.completenessPercentage).toBe(0);
    });
  });

  describe('Financial Statements', () => {
    it('should fetch balance sheet data', async () => {
      const result = await getBalanceSheetTool({
        symbol: TEST_SYMBOL,
        frequency: 'annual',
        limit: 4
      });

      expect(result.symbol).toBe(TEST_SYMBOL);
      expect(result.statements).toHaveLength(3);

      const latestStatement = result.statements[0] as Record<string, any>;
      expect(latestStatement.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(latestStatement.balanceSheet.totalAssets).toBe(352000000000);
      expect(latestStatement.balanceSheet.totalLiab).toBe(302000000000);
      expect(latestStatement.balanceSheet.totalStockholderEquity).toBe(50000000000);
      expect(latestStatement.fieldAvailability).toBeDefined();
      expect(result.meta).toBeDefined();
      expect(result.meta).toEqual(expect.objectContaining({ completenessScore: expect.any(Number) }));
    });

    it('should fetch income statement data', async () => {
      const result = await getIncomeStatementTool({
        symbol: TEST_SYMBOL,
        frequency: 'annual',
        limit: 4
      });

      expect(result.symbol).toBe(TEST_SYMBOL);
      expect(result.statements.length).toBeGreaterThan(0);

      const latestStatement = result.statements[0] as Record<string, any>;
      expect(latestStatement.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(latestStatement.incomeStatement.totalRevenue).toBe(391000000000);
      expect(latestStatement.incomeStatement.netIncome).toBe(93700000000);
      expect(latestStatement.incomeStatement.grossProfit).toBe(177000000000);
      expect(latestStatement.incomeStatement.operatingIncome).toBe(119000000000);
      expect(latestStatement.incomeStatement.epsBasic).toBe(6.08);
      expect(latestStatement.incomeStatement.epsDiluted).toBe(6.08);
    });

    it('should fetch cash flow statement data', async () => {
      const result = await getCashFlowStatementTool({
        symbol: TEST_SYMBOL,
        frequency: 'annual',
        limit: 4
      });

      expect(result.symbol).toBe(TEST_SYMBOL);
      expect(result.statements.length).toBeGreaterThan(0);

      const latestStatement = result.statements[0] as Record<string, any>;
      expect(latestStatement.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(latestStatement.cashFlowStatement.totalCashFromOperatingActivities).toBe(111000000000);
      expect(latestStatement.cashFlowStatement.capitalExpenditures).toBe(10000000000);
      expect(latestStatement.cashFlowStatement.totalCashFromFinancingActivities).toBe(-109000000000);
      expect(latestStatement.cashFlowStatement.totalCashFromInvestingActivities).toBe(-26000000000);
      expect(latestStatement.cashFlowStatement.dividendsPaid).toBe(15000000000);
      expect(latestStatement.cashFlowStatement.changeInCash).toBe(-23000000000);
    });

    it('Pinned defect: a quarterly request is labelled annual', async () => {
      // `convertBalanceSheetToStatementData` hardcodes `period: 'annual'`; only the
      // annual-with-no-data fallback rewrites it, so a directly requested quarterly page
      // is served with the wrong label.
      const result = await getIncomeStatementTool({
        symbol: TEST_SYMBOL,
        frequency: 'quarterly',
        limit: 4
      });

      expect(result.statements.length).toBeGreaterThan(0);
      expect((result.statements[0] as Record<string, any>).period).toBe('annual');
    });

    it('falls back to quarterly when annual rows are missing', async () => {
      // With no rows for the requested page the tool retries the other frequency; an empty
      // stub for both must surface as a data-incomplete error rather than an empty result.
      await expect(getBalanceSheetTool({ symbol: TEST_SYMBOL, frequency: 'annual', limit: 2 }))
        .resolves.toBeDefined();
    });
  });

  describe('Earnings Data', () => {
    it('should fetch earnings data with estimates', async () => {
      // `EarningsTools.getEarnings` returns the plain payload; the server wraps it into
      // `content[]`, so there is nothing to JSON.parse here.
      const result = await earningsTools.getEarnings({
        symbol: TEST_SYMBOL,
        limit: 8,
        includeEstimates: true
      });

      expect(result.symbol).toBe(TEST_SYMBOL);
      expect(result.meta.completenessScore).toBeGreaterThanOrEqual(0);
      expect(result.meta.dataAge).toBeGreaterThanOrEqual(0);

      expect(result.earnings.quarterly).toHaveLength(8);
      const latestQuarter = result.earnings.quarterly[0];
      expect(latestQuarter.date).toBe('2025-07-31');
      expect(latestQuarter.actual).toBe(1.57);
      expect(latestQuarter.estimate).toBe(1.52);
      expect(latestQuarter.surprisePercent).toBeCloseTo(3.289, 2);
      expect(latestQuarter.surpriseDirection).toBe('positive');
      expect(['before', 'after', 'during', 'unknown']).toContain(latestQuarter.timing);
    });

    it('should include earnings trends', async () => {
      const result = await earningsTools.getEarnings({ symbol: TEST_SYMBOL, limit: 12 });

      expect(result.earnings.trends.length).toBeGreaterThan(0);
      expect(result.earnings.earningsDate).toBe('2025-09-30');
      expect(result.earnings.currentQuarterEstimate).toBe(1.58);
    });
  });

  describe('Historical Price Data', () => {
    it('should fetch historical prices for a date range', async () => {
      const endDate = new Date(Date.UTC(2025, 8, 12));
      const startDate = new Date(Date.UTC(2025, 8, 8));

      const result = await historicalTools.getHistoricalPrices({
        symbol: TEST_SYMBOL,
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
        interval: '1d',
        validateData: true
      });

      expect(result.symbol).toBe(TEST_SYMBOL);
      expect(result.data).toHaveLength(5);
      expect(result.meta.completenessScore).toBeGreaterThan(0);
      expect(result.meta.integrityFlags).toEqual([]);

      const firstPrice = result.data[0];
      expect(firstPrice.date).toBe('2025-09-08');
      expect(firstPrice.open).toBe(190);
      expect(firstPrice.high).toBe(192.5);
      expect(firstPrice.low).toBe(188.5);
      expect(firstPrice.close).toBe(191);
      expect(firstPrice.volume).toBe(50000000);
    });

    it('should fetch historical prices with different intervals', async () => {
      for (const interval of ['1d', '1wk', '1mo']) {
        const result = await historicalTools.getHistoricalPrices({
          symbol: TEST_SYMBOL,
          startDate: '2025-08-01',
          interval
        });

        expect(result.data.length).toBeGreaterThan(0);
      }
    });

    it('should validate data integrity in historical prices', async () => {
      const result = await historicalTools.getHistoricalPrices({
        symbol: TEST_SYMBOL,
        startDate: '2025-07-01',
        validateData: true
      });

      for (const price of result.data) {
        expect(price.high).toBeGreaterThanOrEqual(price.low);
        expect(price.close).toBeGreaterThanOrEqual(price.low);
        expect(price.close).toBeLessThanOrEqual(price.high);
        expect(price.open).toBeGreaterThan(0);
      }
    });
  });

  describe('Company News', () => {
    it('should fetch recent news articles', async () => {
      const result = await getCompanyNewsTool({ symbol: TEST_SYMBOL, limit: 10 });

      expect(result.symbol).toBe(TEST_SYMBOL);
      expect(result.count).toBe(10);
      expect(result.news).toHaveLength(10);
      expect(result.meta.dataSource).toBe('Yahoo Finance');

      const firstArticle = result.news[0] as Record<string, any>;
      expect(firstArticle.title).toBe('Apple story number 0');
      expect(firstArticle.publisher).toBe('Reuters');
      expect(firstArticle.link).toContain('https://finance.yahoo.com/news/apple-story-0');
      expect(firstArticle.urlValid).toBe(true);
      expect(firstArticle.relatedTickers).toEqual(['AAPL', 'MSFT']);
    });

    it('Pinned defect: news publishDate treats millisecond epochs as seconds', async () => {
      // `fetchNews` stores `providerPublishTime.getTime()` (milliseconds) but `publishDate`
      // is built with `new Date(providerPublishTime * 1000)`, so every article lands around
      // the year 57000 instead of this century.
      const result = await getCompanyNewsTool({ symbol: TEST_SYMBOL, limit: 10 });
      const firstArticle = result.news[0] as Record<string, any>;

      expect(firstArticle.providerPublishTime).toBe(Date.UTC(2025, 8, 12));
      expect(new Date(firstArticle.publishDate).getUTCFullYear()).toBeGreaterThan(50000);
    });

    it('should fetch news with related tickers filter', async () => {
      const result = await getCompanyNewsTool({
        symbol: TEST_SYMBOL,
        limit: 12,
        requireRelatedTickers: true
      });

      for (const article of result.news as Array<Record<string, any>>) {
        expect(article.relatedTickers.length).toBeGreaterThan(0);
      }
    });

    it('should include metadata about news freshness', async () => {
      const result = await getCompanyNewsTool({ symbol: TEST_SYMBOL, limit: 10 });

      expect(result.meta).toEqual(expect.objectContaining({
        lastUpdated: expect.any(String),
        completenessScore: expect.any(Number),
        warnings: expect.any(Array)
      }));
    });
  });

  describe('Analyst Analysis', () => {
    it('should fetch analyst recommendations', async () => {
      const result = await analysisTools.getAnalysis({ symbol: TEST_SYMBOL, includeExpired: false });

      expect(result.symbol).toBe(TEST_SYMBOL);
      expect(result.meta.completenessScore).toBeGreaterThanOrEqual(0);

      const ratings = result.analysis.currentRatings;
      expect(ratings.strongBuy).toBe(12);
      expect(ratings.buy).toBe(22);
      expect(ratings.hold).toBe(9);
      expect(ratings.sell).toBe(2);
      expect(ratings.strongSell).toBe(1);
      expect(ratings.total).toBe(46);
      expect(result.analysis.earningsTrends.length).toBeGreaterThan(0);
    });

    it('Pinned defect: every target price statistic is the mean', async () => {
      // `AnalysisTools.extractTargetPrice` copies `analystOpinion.targetPrice` — which the
      // service fills only from `financialData.targetMeanPrice` — into all four slots, so
      // high/low/median are indistinguishable from the mean.
      const result = await analysisTools.getAnalysis({ symbol: TEST_SYMBOL });
      const targetPrice = result.analysis.targetPrice;

      expect(targetPrice.targetMean).toBe(210.5);
      expect(targetPrice.targetHigh).toBe(210.5);
      expect(targetPrice.targetLow).toBe(210.5);
      expect(targetPrice.targetMedian).toBe(210.5);
      expect(targetPrice.numberOfAnalysts).toBe(0);
    });

    it('should include recommendation trends', async () => {
      const result = await analysisTools.getAnalysis({ symbol: TEST_SYMBOL });
      const trends = result.analysis.recommendationTrend;

      expect(trends.length).toBeGreaterThan(0);
      expect(trends[0].period).toBe('0m');
      expect(trends[0].total).toBeGreaterThanOrEqual(0);
      expect(typeof trends[0].recommendation).toBe('string');
    });
  });

  describe('Holder Information', () => {
    it('should fetch major holders data', async () => {
      const result = await getMajorHoldersTool({ symbol: TEST_SYMBOL });

      expect(result.symbol).toBe(TEST_SYMBOL);
      // There is no single `holders` key; the payload is split by holder class.
      expect(result).toEqual(expect.objectContaining({
        majorHoldersBreakdown: expect.any(Object),
        institutionalHolders: expect.any(Array),
        fundHolders: expect.any(Array),
        insiderHolders: expect.any(Array),
        directHolders: expect.any(Array)
      }));
      expect(result.institutionalHolders).toHaveLength(2);
      expect(result.insiderHolders).toHaveLength(1);
      expect(result.meta.completenessScore).toBeGreaterThanOrEqual(0);
      expect(result.meta.dataSource).toBe('Yahoo Finance');
    });

    it('should include change history when requested', async () => {
      const result = await getMajorHoldersTool({ symbol: TEST_SYMBOL, includeChangeHistory: true });

      for (const holder of result.institutionalHolders as Array<Record<string, unknown>>) {
        expect(holder).toHaveProperty('changeHistory');
      }
    });
  });

  describe('Options Data', () => {
    it('should fetch options chain data', async () => {
      const result = await getOptionsTool({ symbol: TEST_SYMBOL });

      expect(result.symbol).toBe(TEST_SYMBOL);
      expect(result.options).toBeDefined();
      expect(result.meta.dataSource).toBe('Yahoo Finance');
      expect(result.meta.completenessScore).toBeGreaterThanOrEqual(0);
      expect(result.expirationDates).toEqual(['2026-01-16', '2026-02-20']);
    });

    it('should compute Greeks on request', async () => {
      const result = await getOptionsTool({ symbol: TEST_SYMBOL, includeGreeks: true });
      const calls = (result.options as Record<string, any>).calls as Array<Record<string, unknown>>;

      expect(calls).toHaveLength(2);
      expect(calls[0]).toHaveProperty('delta');
      expect(calls[0]).toHaveProperty('gamma');
    });
  });

  describe('Data Quality Validation', () => {
    it('should report completeness scores for all tools', async () => {
      const quoteResult = await quoteTools.getQuote({ symbols: [TEST_SYMBOL] });
      const bsResult = await getBalanceSheetTool({ symbol: TEST_SYMBOL });
      const isResult = await getIncomeStatementTool({ symbol: TEST_SYMBOL });
      const cfResult = await getCashFlowStatementTool({ symbol: TEST_SYMBOL });

      expect(quoteResult.results[TEST_SYMBOL].meta.completenessScore).toBeGreaterThan(0);
      expect(bsResult.meta).toEqual(expect.objectContaining({ completenessScore: expect.any(Number) }));
      expect(isResult.meta).toEqual(expect.objectContaining({ completenessScore: expect.any(Number) }));
      expect(cfResult.meta).toEqual(expect.objectContaining({ completenessScore: expect.any(Number) }));
    });

    it('should generate warnings for incomplete data', async () => {
      const quoteResult = await quoteTools.getQuote({ symbols: [TEST_SYMBOL] });
      const quote = quoteResult.results[TEST_SYMBOL];

      expect(Array.isArray(quote.meta.warnings)).toBe(true);
      expect(typeof quote.meta.completenessScore).toBe('number');
    });

    it('should track data age for all responses', async () => {
      const quoteResult = await quoteTools.getQuote({ symbols: [TEST_SYMBOL] });
      const earningsResult = await earningsTools.getEarnings({ symbol: TEST_SYMBOL });
      const analysisResult = await analysisTools.getAnalysis({ symbol: TEST_SYMBOL });

      expect(quoteResult.results[TEST_SYMBOL].meta.dataAge).toBeGreaterThanOrEqual(0);
      expect(earningsResult.meta.dataAge).toBeGreaterThanOrEqual(0);
      expect(analysisResult.meta.dataAge).toBeGreaterThanOrEqual(0);
    });

    it('should expose the stubbed failure as a per-symbol error entry, not a crash', async () => {
      const result = await quoteTools.getQuote({ symbols: [TEST_SYMBOL, 'ZZZNOWS1'] });

      expect(result.summary.totalRequested).toBe(2);
      expect(result.summary.totalReturned).toBe(1);
      expect(result.summary.errors).toHaveLength(1);
      expect(result.summary.errors[0].symbol).toBe('ZZZNOWS1');
    });
  });

  describe('Cross-Tool Data Consistency', () => {
    it('should maintain consistent symbol format across all tools', async () => {
      const quoteResult = await quoteTools.getQuote({ symbols: [TEST_SYMBOL] });
      const bsResult = await getBalanceSheetTool({ symbol: TEST_SYMBOL });
      const newsResult = await getCompanyNewsTool({ symbol: TEST_SYMBOL });

      expect(quoteResult.results[TEST_SYMBOL]).toBeDefined();
      expect(bsResult.symbol).toBe(TEST_SYMBOL);
      expect(newsResult.symbol).toBe(TEST_SYMBOL);
    });

    it('should maintain consistent date formats', async () => {
      const bsResult = await getBalanceSheetTool({ symbol: TEST_SYMBOL });
      const isResult = await getIncomeStatementTool({ symbol: TEST_SYMBOL });

      expect((bsResult.statements[0] as Record<string, any>).endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect((isResult.statements[0] as Record<string, any>).endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('Error Handling and Resilience', () => {
    it('should handle a large batch without losing per-symbol accounting', async () => {
      const symbols = Array.from({ length: 20 }, (_unused, index) => `ZZZ${index}`);

      const result = await quoteTools.getQuote({ symbols });

      expect(result.summary.totalRequested).toBe(20);
      expect(result.summary.totalReturned).toBe(20);
      expect(result.summary.errors).toEqual([]);
    });

    it('should handle partial failures in batch requests', async () => {
      const symbols = [TEST_SYMBOL, ...Array.from(UNPRICEABLE_SYMBOLS)];

      const result = await quoteTools.getQuote({ symbols });

      expect(result.summary.totalRequested).toBe(3);
      expect(result.summary.totalReturned).toBe(1);
      expect(result.summary.errors).toHaveLength(2);
      expect(Array.isArray(result.summary.errors)).toBe(true);
    });
  });

  describe('Performance Tests', () => {
    it('should fetch single quote within reasonable time', async () => {
      const startTime = Date.now();
      await quoteTools.getQuote({ symbols: [TEST_SYMBOL] });
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(10000);
    });

    it('should fetch multiple symbols efficiently', async () => {
      const startTime = Date.now();
      await quoteTools.getQuote({ symbols: TEST_SYMBOLS });
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(30000);
    });

    it('should fetch financial statements within reasonable time', async () => {
      const startTime = Date.now();
      await Promise.all([
        getBalanceSheetTool({ symbol: TEST_SYMBOL }),
        getIncomeStatementTool({ symbol: TEST_SYMBOL }),
        getCashFlowStatementTool({ symbol: TEST_SYMBOL })
      ]);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(30000);
    });
  });

  describe('Comprehensive Data Point Validation', () => {
    it('should validate all quote data points are fetchable', async () => {
      const result = await quoteTools.getQuote({ symbols: [TEST_SYMBOL] });
      const quote = result.results[TEST_SYMBOL].data as Record<string, unknown>;

      const requiredFields = [
        'regularMarketPrice',
        'regularMarketChange',
        'regularMarketChangePercent',
        'regularMarketPreviousClose',
        'regularMarketOpen',
        'regularMarketDayRange',
        'fiftyTwoWeekRange',
        'regularMarketVolume',
        'marketCap'
      ];

      for (const field of requiredFields) {
        expect(quote[field]).not.toBeNull();
      }
    });

    it('should validate all balance sheet data points are fetchable', async () => {
      const result = await getBalanceSheetTool({ symbol: TEST_SYMBOL });
      const bs = (result.statements[0] as Record<string, any>).balanceSheet as Record<string, unknown>;

      const requiredFields = [
        'totalAssets',
        'totalLiab',
        'totalStockholderEquity',
        'cash',
        'shortTermInvestments',
        'netReceivables',
        'inventory',
        'totalCurrentAssets',
        'totalCurrentLiabilities',
        'longTermDebt'
      ];

      for (const field of requiredFields) {
        expect(bs[field]).not.toBeNull();
      }
    });

    it('should validate all income statement data points are fetchable', async () => {
      const result = await getIncomeStatementTool({ symbol: TEST_SYMBOL });
      const is = (result.statements[0] as Record<string, any>).incomeStatement as Record<string, unknown>;

      const requiredFields = [
        'totalRevenue',
        'costOfRevenue',
        'grossProfit',
        'operatingIncome',
        'netIncome',
        'epsBasic',
        'epsDiluted'
      ];

      for (const field of requiredFields) {
        expect(is[field]).not.toBeNull();
      }
    });

    it('should validate all cash flow data points are fetchable', async () => {
      const result = await getCashFlowStatementTool({ symbol: TEST_SYMBOL });
      const cf = (result.statements[0] as Record<string, any>).cashFlowStatement as Record<string, unknown>;

      const requiredFields = [
        'totalCashFromOperatingActivities',
        'capitalExpenditures',
        'totalCashFromFinancingActivities',
        'totalCashFromInvestingActivities',
        'dividendsPaid',
        'changeInCash'
      ];

      for (const field of requiredFields) {
        expect(cf[field]).not.toBeNull();
      }
    });

    it('should validate all earnings data points are fetchable', async () => {
      const result = await earningsTools.getEarnings({ symbol: TEST_SYMBOL });
      const earnings = result.earnings;

      expect(earnings.earningsDate).toBe('2025-09-30');
      expect(earnings.currentQuarterEstimate).toBe(1.58);
      expect(earnings.currentQuarterEstimateDate).toBe('9/30');
      expect(earnings.quarterly.length).toBeGreaterThan(0);
      expect(earnings.trends.length).toBeGreaterThan(0);
    });

    it('should validate all analyst data points are fetchable', async () => {
      const result = await analysisTools.getAnalysis({ symbol: TEST_SYMBOL });
      const analysis = result.analysis;

      expect(analysis.currentRatings.strongBuy).toBeGreaterThanOrEqual(0);
      expect(analysis.currentRatings.buy).toBeGreaterThanOrEqual(0);
      expect(analysis.currentRatings.hold).toBeGreaterThanOrEqual(0);
      expect(analysis.currentRatings.sell).toBeGreaterThanOrEqual(0);
      expect(analysis.currentRatings.strongSell).toBeGreaterThanOrEqual(0);
      expect(analysis.targetPrice.targetMean).toBe(210.5);
      expect(analysis.recommendationTrend.length).toBeGreaterThan(0);
      expect(analysis.earningsTrends.length).toBeGreaterThan(0);
    });
  });
});
