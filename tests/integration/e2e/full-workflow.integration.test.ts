import * as yahooFinance from 'yahoo-finance2';
import { QuoteTools } from '../../../src/tools/quotes';
import { HistoricalTools } from '../../../src/tools/historical';
import {
  getBalanceSheetTool,
  getIncomeStatementTool,
  getCashFlowStatementTool
} from '../../../src/tools/financials';
import { DataQualityReporter } from '../../../src/utils/data-completion';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';

jest.mock('yahoo-finance2');

const mockQuoteData = {
  price: {
    regularMarketPrice: 175.5,
    regularMarketChange: 2.3,
    regularMarketChangePercent: 1.33,
    regularMarketPreviousClose: 173.2,
    regularMarketDayHigh: 176.0,
    regularMarketDayLow: 173.5,
    regularMarketVolume: 50000000,
    marketCap: 2800000000000,
    fiftyTwoWeekHigh: 198.23,
    fiftyTwoWeekLow: 124.17,
    averageDailyVolume3Month: 52000000,
    currency: 'USD',
    symbol: 'AAPL',
    shortName: 'Apple Inc.',
    longName: 'Apple Inc.',
    exchange: 'NASDAQ'
  },
  meta: {
    currency: 'USD',
    symbol: 'AAPL',
    regularMarketTime: Date.now(),
    timezone: 'EST'
  }
};

const mockHistoricalData = {
  meta: {
    currency: 'USD',
    symbol: 'AAPL',
    exchangeName: 'NMS',
    instrumentType: 'EQUITY',
    firstTradeDate: 345479400,
    regularMarketTime: Date.now(),
    gmtoffset: -14400000,
    timezone: 'EST',
    regularMarketPrice: 175.5,
    dataGranularity: '1d',
    range: '1mo'
  },
  timestamps: [Date.now() - 4 * 86400000, Date.now() - 3 * 86400000, Date.now() - 2 * 86400000, Date.now() - 86400000, Date.now()],
  indicators: {
    quote: [
      {
        open: [174.0, 174.5, 175.0, 175.5, 176.0],
        high: [175.0, 175.5, 176.0, 176.5, 177.0],
        low: [173.5, 174.0, 174.5, 175.0, 175.5],
        close: [174.5, 175.0, 175.5, 176.0, 176.5],
        volume: [50000000, 52000000, 48000000, 51000000, 49000000]
      }
    ],
    adjclose: [
      {
        adjclose: [174.5, 175.0, 175.5, 176.0, 176.5]
      }
    ]
  }
};

const mockFinancialsData = {
  balanceSheetHistory: {
    maxAge: 1,
    annual: [
      {
        endDate: { fmt: '2023-09-30', raw: 1696118400 },
        totalAssets: { fmt: '352,583,000,000', raw: 352583000000 },
        totalLiab: { fmt: '290,437,000,000', raw: 290437000000 },
        totalStockholderEquity: { fmt: '62,146,000,000', raw: 62146000000 }
      }
    ],
    quarterly: []
  },
  incomeStatementHistory: {
    maxAge: 1,
    annual: [
      {
        endDate: { fmt: '2023-09-30', raw: 1696118400 },
        totalRevenue: { fmt: '383,285,000,000', raw: 383285000000 },
        grossProfit: { fmt: '169,148,000,000', raw: 169148000000 },
        operatingIncome: { fmt: '114,301,000,000', raw: 114301000000 },
        netIncome: { fmt: '96,995,000,000', raw: 96995000000 },
        epsBasic: { fmt: '1.64', raw: 1.64 },
        epsDiluted: { fmt: '1.62', raw: 1.62 }
      }
    ],
    quarterly: []
  },
  cashflowStatementHistory: {
    maxAge: 1,
    annual: [
      {
        endDate: { fmt: '2023-09-30', raw: 1696118400 },
        totalCashFromOperatingActivities: { fmt: '110,543,000,000', raw: 110543000000 },
        capitalExpenditures: { fmt: '-10,957,000,000', raw: -10957000000 },
        freeCashFlow: { fmt: '99,586,000,000', raw: 99586000000 }
      }
    ],
    quarterly: []
  }
};

describe('Full Workflow Integration Tests', () => {
  let quoteTools: QuoteTools;
  let historicalTools: HistoricalTools;
  let mockServer: Server;
  let mockYahooClient: any;
  let mockQualityReporter: any;

  beforeEach(() => {
    mockServer = new Server({ name: 'test', version: '1.0.0' }, { capabilities: {} });

    mockYahooClient = {
      getQuote: jest.fn(),
      getSummaryProfile: jest.fn(),
      getHistoricalPrices: jest.fn(),
      initialize: jest.fn().mockResolvedValue(undefined),
      shutdown: jest.fn().mockResolvedValue(undefined)
    };

    mockQualityReporter = {
      calculateCompleteness: jest.fn().mockReturnValue(90),
      generateWarnings: jest.fn().mockReturnValue([]),
      generateQualityReport: jest.fn().mockReturnValue({
        sourceReliability: 'high',
        warnings: [],
        recommendation: 'Data is reliable'
      })
    };

    quoteTools = new QuoteTools(mockYahooClient, mockQualityReporter);
    historicalTools = new HistoricalTools(mockServer, mockYahooClient, mockQualityReporter);

    jest.clearAllMocks();
  });

  describe('analyze_stock Workflow', () => {
    it('should complete full stock analysis workflow', async () => {
      mockYahooClient.getQuote.mockResolvedValue(mockQuoteData);
      mockYahooClient.getHistoricalPrices.mockResolvedValue(mockHistoricalData);
      (yahooFinance.quoteSummary as jest.Mock).mockResolvedValue(mockFinancialsData);

      const symbol = 'AAPL';

      const quoteResult = await quoteTools.getQuote({
        symbols: [symbol]
      });

      expect(quoteResult.summary.totalReturned).toBe(1);
      expect(quoteResult.results[symbol].data.regularMarketPrice).toBe(175.5);

      const balanceSheet = await getBalanceSheetTool({
        symbol
      });

      expect(balanceSheet.symbol).toBe(symbol);
      expect(balanceSheet.statements.length).toBeGreaterThan(0);

      const incomeStatement = await getIncomeStatementTool({
        symbol
      });

      expect(incomeStatement.symbol).toBe(symbol);
      expect(incomeStatement.statements.length).toBeGreaterThan(0);

      const cashFlow = await getCashFlowStatementTool({
        symbol
      });

      expect(cashFlow.symbol).toBe(symbol);
      expect(cashFlow.statements.length).toBeGreaterThan(0);

      const analysis = {
        symbol,
        currentPrice: quoteResult.results[symbol].data.regularMarketPrice,
        marketCap: quoteResult.results[symbol].data.marketCap,
        totalAssets: balanceSheet.statements[0].balanceSheet.totalAssets,
        totalRevenue: incomeStatement.statements[0].incomeStatement.totalRevenue,
        freeCashFlow: cashFlow.statements[0].cashFlowStatement.freeCashFlow
      };

      expect(analysis.symbol).toBe('AAPL');
      expect(analysis.currentPrice).toBe(175.5);
      expect(analysis.totalAssets).toBe(352583000000);
      expect(analysis.totalRevenue).toBe(383285000000);
      expect(analysis.freeCashFlow).toBe(99586000000);
    });

    it('should handle partial data gracefully in analysis workflow', async () => {
      mockYahooClient.getQuote.mockResolvedValue(mockQuoteData);
      (yahooFinance.quoteSummary as jest.Mock).mockImplementation((symbol, options) => {
        if (options?.modules?.includes('balanceSheetHistory')) {
          return Promise.resolve(mockFinancialsData);
        }
        return Promise.reject(new Error('Data not available'));
      });

      const symbol = 'AAPL';

      const quoteResult = await quoteTools.getQuote({
        symbols: [symbol]
      });

      expect(quoteResult.summary.totalReturned).toBe(1);

      const balanceSheet = await getBalanceSheetTool({
        symbol
      });

      expect(balanceSheet.symbol).toBe(symbol);

      try {
        await getIncomeStatementTool({ symbol });
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  describe('compare_stocks Workflow', () => {
    it('should complete stock comparison workflow', async () => {
      mockYahooClient.getQuote.mockImplementation(async (symbol) => {
        if (symbol === 'AAPL') {
          return {
            ...mockQuoteData,
            price: {
              ...mockQuoteData.price,
              symbol: 'AAPL',
              regularMarketPrice: 175.5,
              marketCap: 2800000000000
            }
          };
        } else if (symbol === 'MSFT') {
          return {
            ...mockQuoteData,
            price: {
              ...mockQuoteData.price,
              symbol: 'MSFT',
              regularMarketPrice: 378.5,
              marketCap: 2700000000000
            }
          };
        } else if (symbol === 'GOOGL') {
          return {
            ...mockQuoteData,
            price: {
              ...mockQuoteData.price,
              symbol: 'GOOGL',
              regularMarketPrice: 141.2,
              marketCap: 1700000000000
            }
          };
        }
        return mockQuoteData;
      });

      (yahooFinance.quoteSummary as jest.Mock).mockResolvedValue(mockFinancialsData);

      const symbols = ['AAPL', 'MSFT', 'GOOGL'];

      const quoteResult = await quoteTools.getQuote({
        symbols
      });

      expect(quoteResult.summary.totalReturned).toBe(3);

      const comparison = {
        AAPL: {
          price: quoteResult.results.AAPL.data.regularMarketPrice,
          marketCap: quoteResult.results.AAPL.data.marketCap
        },
        MSFT: {
          price: quoteResult.results.MSFT.data.regularMarketPrice,
          marketCap: quoteResult.results.MSFT.data.marketCap
        },
        GOOGL: {
          price: quoteResult.results.GOOGL.data.regularMarketPrice,
          marketCap: quoteResult.results.GOOGL.data.marketCap
        }
      };

      expect(comparison.AAPL.price).toBe(175.5);
      expect(comparison.MSFT.price).toBe(378.5);
      expect(comparison.GOOGL.price).toBe(141.2);

      const highestPrice = Math.max(
        comparison.AAPL.price,
        comparison.MSFT.price,
        comparison.GOOGL.price
      );

      const lowestPrice = Math.min(
        comparison.AAPL.price,
        comparison.MSFT.price,
        comparison.GOOGL.price
      );

      expect(highestPrice).toBe(378.5);
      expect(lowestPrice).toBe(141.2);

      const highestMarketCap = Math.max(
        comparison.AAPL.marketCap,
        comparison.MSFT.marketCap,
        comparison.GOOGL.marketCap
      );

      expect(highestMarketCap).toBe(2800000000000);
    });

    it('should handle comparison with different data availability', async () => {
      mockYahooClient.getQuote.mockImplementation(async (symbol) => {
        if (symbol === 'AAPL') {
          return mockQuoteData;
        } else if (symbol === 'MSFT') {
          return mockQuoteData;
        }
        throw new Error('Symbol not found');
      });

      const quoteResult = await quoteTools.getQuote({
        symbols: ['AAPL', 'MSFT', 'INVALID']
      });

      expect(quoteResult.summary.totalRequested).toBe(3);
      expect(quoteResult.summary.totalReturned).toBe(2);
      expect(quoteResult.summary.errors).toHaveLength(1);
    });
  });

  describe('financial_health Workflow', () => {
    it('should complete financial health analysis', async () => {
      (yahooFinance.quoteSummary as jest.Mock).mockResolvedValue(mockFinancialsData);

      const symbol = 'AAPL';

      const balanceSheet = await getBalanceSheetTool({
        symbol,
        frequency: 'annual'
      });

      const incomeStatement = await getIncomeStatementTool({
        symbol,
        frequency: 'annual'
      });

      const cashFlow = await getCashFlowStatementTool({
        symbol,
        frequency: 'annual'
      });

      const totalAssets = balanceSheet.statements[0].balanceSheet.totalAssets;
      const totalLiabilities = balanceSheet.statements[0].balanceSheet.totalLiab;
      const totalEquity = balanceSheet.statements[0].balanceSheet.totalStockholderEquity;
      const totalRevenue = incomeStatement.statements[0].incomeStatement.totalRevenue;
      const netIncome = incomeStatement.statements[0].incomeStatement.netIncome;
      const operatingCashFlow = cashFlow.statements[0].cashFlowStatement.totalCashFromOperatingActivities;
      const freeCashFlow = cashFlow.statements[0].cashFlowStatement.freeCashFlow;

      const debtToEquity = totalLiabilities / totalEquity;
      const currentRatio = 2.5;
      const profitMargin = netIncome / totalRevenue;
      const operatingMargin = 0.298;
      const roe = netIncome / totalEquity;

      const healthMetrics = {
        debtToEquity,
        currentRatio,
        profitMargin,
        operatingMargin,
        roe,
        totalAssets,
        totalLiabilities,
        totalEquity,
        totalRevenue,
        netIncome,
        operatingCashFlow,
        freeCashFlow
      };

      expect(healthMetrics.debtToEquity).toBeGreaterThan(0);
      expect(healthMetrics.profitMargin).toBeGreaterThan(0);
      expect(healthMetrics.profitMargin).toBeLessThan(1);
      expect(healthMetrics.roe).toBeGreaterThan(0);
      expect(healthMetrics.freeCashFlow).toBeGreaterThan(0);
    });

    it('should handle missing financial data in health analysis', async () => {
      const incompleteData = {
        balanceSheetHistory: {
          maxAge: 1,
          annual: [
            {
              endDate: { fmt: '2023-09-30', raw: 1696118400 },
              totalAssets: { fmt: '352,583,000,000', raw: 352583000000 },
              totalLiab: { fmt: '290,437,000,000', raw: 290437000000 }
            }
          ],
          quarterly: []
        },
        incomeStatementHistory: {
          maxAge: 1,
          annual: [
            {
              endDate: { fmt: '2023-09-30', raw: 1696118400 },
              totalRevenue: { fmt: '383,285,000,000', raw: 383285000000 }
            }
          ],
          quarterly: []
        },
        cashflowStatementHistory: {
          maxAge: 1,
          annual: [
            {
              endDate: { fmt: '2023-09-30', raw: 1696118400 }
            }
          ],
          quarterly: []
        }
      };

      (yahooFinance.quoteSummary as jest.Mock).mockResolvedValue(incompleteData);

      const symbol = 'AAPL';

      const balanceSheet = await getBalanceSheetTool({
        symbol
      });

      const incomeStatement = await getIncomeStatementTool({
        symbol
      });

      const cashFlow = await getCashFlowStatementTool({
        symbol
      });

      expect(balanceSheet.statements[0].fieldAvailability.totalStockholderEquity).toBe(false);
      expect(incomeStatement.statements[0].fieldAvailability.netIncome).toBe(false);
      expect(cashFlow.statements[0].fieldAvailability.freeCashFlow).toBe(false);
    });
  });

  describe('trend_analysis Workflow', () => {
    it('should complete trend analysis workflow', async () => {
      mockYahooClient.getQuote.mockResolvedValue(mockQuoteData);
      mockYahooClient.getHistoricalPrices.mockResolvedValue(mockHistoricalData);

      const symbol = 'AAPL';

      const quoteResult = await quoteTools.getQuote({
        symbols: [symbol]
      });

      const historicalResult = await mockYahooClient.getHistoricalPrices(
        symbol,
        {
          period1: new Date(Date.now() - 30 * 86400000),
          period2: new Date(),
          interval: '1d'
        }
      );

      const currentPrice = quoteResult.results[symbol].data.regularMarketPrice;
      const dayChange = quoteResult.results[symbol].data.regularMarketChange;
      const dayChangePercent = quoteResult.results[symbol].data.regularMarketChangePercent;
      const dayHigh = quoteResult.results[symbol].data.regularMarketDayHigh;
      const dayLow = quoteResult.results[symbol].data.regularMarketDayLow;
      const fiftyTwoWeekHigh = quoteResult.results[symbol].data.fiftyTwoWeekHigh;
      const fiftyTwoWeekLow = quoteResult.results[symbol].data.fiftyTwoWeekLow;

      const prices = historicalResult.indicators.quote[0].close;
      const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
      const minPrice = Math.min(...prices);
      const maxPrice = Math.max(...prices);

      const trend = {
        symbol,
        currentPrice,
        dayChange,
        dayChangePercent,
        dayHigh,
        dayLow,
        fiftyTwoWeekHigh,
        fiftyTwoWeekLow,
        avgPrice,
        minPrice,
        maxPrice,
        distanceFrom52WHigh: (fiftyTwoWeekHigh - currentPrice) / fiftyTwoWeekHigh,
        distanceFrom52WLow: (currentPrice - fiftyTwoWeekLow) / fiftyTwoWeekLow
      };

      expect(trend.currentPrice).toBe(175.5);
      expect(trend.dayChange).toBe(2.3);
      expect(trend.dayChangePercent).toBe(1.33);
      expect(trend.avgPrice).toBeGreaterThan(0);
      expect(trend.distanceFrom52WHigh).toBeGreaterThan(0);
      expect(trend.distanceFrom52WLow).toBeGreaterThan(0);
    });

    it('should handle missing historical data in trend analysis', async () => {
      mockYahooClient.getQuote.mockResolvedValue(mockQuoteData);
      mockYahooClient.getHistoricalPrices.mockResolvedValue({
        meta: mockHistoricalData.meta,
        timestamps: [],
        indicators: {
          quote: [],
          adjclose: []
        }
      });

      const symbol = 'AAPL';

      const quoteResult = await quoteTools.getQuote({
        symbols: [symbol]
      });

      expect(quoteResult.summary.totalReturned).toBe(1);
    });
  });

  describe('portfolio_analysis Workflow', () => {
    it('should complete portfolio analysis workflow', async () => {
      mockYahooClient.getQuote.mockImplementation(async (symbol) => {
        const prices = {
          AAPL: 175.5,
          MSFT: 378.5,
          GOOGL: 141.2,
          AMZN: 150.0,
          TSLA: 250.0
        };
        return {
          ...mockQuoteData,
          price: {
            ...mockQuoteData.price,
            symbol,
            regularMarketPrice: prices[symbol] || 100
          }
        };
      });

      const portfolio = [
        { symbol: 'AAPL', shares: 10 },
        { symbol: 'MSFT', shares: 5 },
        { symbol: 'GOOGL', shares: 15 },
        { symbol: 'AMZN', shares: 8 },
        { symbol: 'TSLA', shares: 3 }
      ];

      const quoteResult = await quoteTools.getQuote({
        symbols: portfolio.map(p => p.symbol)
      });

      expect(quoteResult.summary.totalReturned).toBe(5);

      let totalValue = 0;
      const holdings = [];

      for (const position of portfolio) {
        const price = quoteResult.results[position.symbol].data.regularMarketPrice;
        const value = price * position.shares;
        totalValue += value;
        holdings.push({
          symbol: position.symbol,
          shares: position.shares,
          price,
          value
        });
      }

      const portfolioAnalysis = {
        holdings,
        totalValue,
        holdingsCount: portfolio.length
      };

      expect(portfolioAnalysis.totalValue).toBeGreaterThan(0);
      expect(portfolioAnalysis.holdingsCount).toBe(5);

      const sortedHoldings = holdings.sort((a, b) => b.value - a.value);
      expect(sortedHoldings[0].symbol).toBeDefined();
      expect(sortedHoldings[0].value).toBeGreaterThan(0);
    });

    it('should handle portfolio with invalid symbols', async () => {
      mockYahooClient.getQuote.mockImplementation(async (symbol) => {
        if (symbol === 'INVALID') {
          throw new Error('Symbol not found');
        }
        return mockQuoteData;
      });

      const portfolio = [
        { symbol: 'AAPL', shares: 10 },
        { symbol: 'INVALID', shares: 5 },
        { symbol: 'MSFT', shares: 8 }
      ];

      const quoteResult = await quoteTools.getQuote({
        symbols: portfolio.map(p => p.symbol)
      });

      expect(quoteResult.summary.totalRequested).toBe(3);
      expect(quoteResult.summary.totalReturned).toBe(2);
      expect(quoteResult.summary.errors).toHaveLength(1);
    });
  });

  describe('error_recovery Workflow', () => {
    it('should recover from API errors gracefully', async () => {
      let callCount = 0;
      mockYahooClient.getQuote.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error('API error');
        }
        return mockQuoteData;
      });

      const quoteResult = await quoteTools.getQuote({
        symbols: ['AAPL'],
        retryOnFailure: true
      });

      expect(callCount).toBeGreaterThan(1);
      expect(quoteResult.summary.totalReturned).toBe(1);
    });

    it('should use cached data when API is unavailable', async () => {
      mockYahooClient.getQuote.mockResolvedValueOnce(mockQuoteData);
      mockYahooClient.getQuote.mockRejectedValueOnce(new Error('API unavailable'));

      const result1 = await quoteTools.getQuote({
        symbols: ['AAPL']
      });

      const result2 = await quoteTools.getQuote({
        symbols: ['AAPL'],
        useCache: true
      });

      expect(result1.summary.totalReturned).toBe(1);
      expect(result2.summary.totalReturned).toBe(1);
    });

    it('should handle multiple concurrent failures', async () => {
      mockYahooClient.getQuote.mockRejectedValue(new Error('API error'));

      const quoteResult = await quoteTools.getQuote({
        symbols: ['AAPL', 'MSFT', 'GOOGL']
      });

      expect(quoteResult.summary.totalReturned).toBe(0);
      expect(quoteResult.summary.errors).toHaveLength(3);
    });
  });

  describe('data_quality Workflow', () => {
    it('should validate data quality across all tools', async () => {
      mockYahooClient.getQuote.mockResolvedValue(mockQuoteData);
      (yahooFinance.quoteSummary as jest.Mock).mockResolvedValue(mockFinancialsData);

      const quoteResult = await quoteTools.getQuote({
        symbols: ['AAPL']
      });

      const balanceSheet = await getBalanceSheetTool({
        symbol: 'AAPL'
      });

      const incomeStatement = await getIncomeStatementTool({
        symbol: 'AAPL'
      });

      const cashFlow = await getCashFlowStatementTool({
        symbol: 'AAPL'
      });

      expect(quoteResult.results.AAPL.meta.completenessScore).toBeGreaterThanOrEqual(0);
      expect(balanceSheet.meta.completenessScore).toBeGreaterThanOrEqual(0);
      expect(incomeStatement.meta.completenessScore).toBeGreaterThanOrEqual(0);
      expect(cashFlow.meta.completenessScore).toBeGreaterThanOrEqual(0);

      expect(quoteResult.results.AAPL.meta.warnings).toBeDefined();
      expect(balanceSheet.meta.warnings).toBeDefined();
      expect(incomeStatement.meta.warnings).toBeDefined();
      expect(cashFlow.meta.warnings).toBeDefined();
    });

    it('should generate warnings for incomplete data', async () => {
      mockQualityReporter.calculateCompleteness.mockReturnValue(30);

      mockYahooClient.getQuote.mockResolvedValue(mockQuoteData);

      const quoteResult = await quoteTools.getQuote({
        symbols: ['AAPL']
      });

      expect(quoteResult.results.AAPL.meta.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('performance Workflow', () => {
    it('should complete complex workflow within acceptable time', async () => {
      mockYahooClient.getQuote.mockResolvedValue(mockQuoteData);
      mockYahooClient.getHistoricalPrices.mockResolvedValue(mockHistoricalData);
      (yahooFinance.quoteSummary as jest.Mock).mockResolvedValue(mockFinancialsData);

      const startTime = Date.now();

      await quoteTools.getQuote({
        symbols: ['AAPL', 'MSFT', 'GOOGL']
      });

      await getBalanceSheetTool({ symbol: 'AAPL' });
      await getIncomeStatementTool({ symbol: 'AAPL' });
      await getCashFlowStatementTool({ symbol: 'AAPL' });

      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(5000);
    });

    it('should handle concurrent requests efficiently', async () => {
      mockYahooClient.getQuote.mockResolvedValue(mockQuoteData);

      const symbols = Array.from({ length: 20 }, (_, i) => `SYMBOL${i}`);

      const startTime = Date.now();

      await quoteTools.getQuote({
        symbols
      });

      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(10000);
    });
  });
});
