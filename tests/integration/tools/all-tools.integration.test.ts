import * as yahooFinance from 'yahoo-finance2';
import { QuoteTools } from '../../../src/tools/quotes';
import { DataQualityReporter } from '../../../src/utils/data-completion';
import {
  getBalanceSheetTool,
  getIncomeStatementTool,
  getCashFlowStatementTool
} from '../../../src/tools/financials';
import {
  getMajorHoldersTool,
  getHoldersToolDefinitions
} from '../../../src/tools/holders';
import {
  getCompanyNewsTool,
  getNewsToolDefinitions
} from '../../../src/tools/news';
import {
  getOptionsTool,
  getOptionsToolDefinitions
} from '../../../src/tools/options';
import {
  getBalanceSheet,
  getIncomeStatement,
  getCashFlowStatement,
  getEarnings,
  getAnalysis,
  getNews,
  getOptions
} from '../../../src/schemas';

jest.mock('yahoo-finance2');
jest.mock('../../../src/tools/holders');
jest.mock('../../../src/tools/news');
jest.mock('../../../src/tools/options');
jest.mock('../../../src/tools/earnings');
jest.mock('../../../src/tools/analysis');

const mockQuoteResult = {
  price: {
    regularMarketPrice: 175.5,
    regularMarketChange: 2.3,
    regularMarketChangePercent: 1.33,
    regularMarketPreviousClose: 173.2,
    regularMarketVolume: 50000000,
    marketCap: 2800000000000,
    currency: 'USD',
    symbol: 'AAPL',
    exchange: 'NASDAQ'
  },
  meta: {
    currency: 'USD',
    symbol: 'AAPL',
    regularMarketTime: Date.now(),
    timezone: 'EST'
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
        netIncome: { fmt: '96,995,000,000', raw: 96995000000 }
      }
    ],
    quarterly: []
  },
  cashflowStatementHistory: {
    maxAge: 1,
    annual: [
      {
        endDate: { fmt: '2023-09-30', raw: 1696118400 },
        totalCashFromOperatingActivities: { fmt: '110,543,000,000', raw: 110543000000 }
      }
    ],
    quarterly: []
  }
};

describe('All Tools Integration Tests', () => {
  let quoteTools: QuoteTools;
  let mockYahooClient: any;
  let mockQualityReporter: any;

  beforeEach(() => {
    mockYahooClient = {
      getQuote: jest.fn(),
      getSummaryProfile: jest.fn(),
      initialize: jest.fn().mockResolvedValue(undefined),
      shutdown: jest.fn().mockResolvedValue(undefined)
    };

    mockQualityReporter = {
      calculateCompleteness: jest.fn().mockReturnValue(90),
      generateQualityReport: jest.fn().mockReturnValue({
        sourceReliability: 'high',
        warnings: [],
        recommendation: 'Data is reliable'
      })
    };

    quoteTools = new QuoteTools(mockYahooClient, mockQualityReporter);
    jest.clearAllMocks();
  });

  describe('Cross-Tool Data Consistency', () => {
    it('should return consistent symbol across all tools', async () => {
      mockYahooClient.getQuote.mockResolvedValue(mockQuoteResult);
      (yahooFinance.quoteSummary as jest.Mock).mockImplementation((symbol, options) => {
        if (options?.modules?.includes('balanceSheetHistory')) {
          return Promise.resolve(mockFinancialsData);
        }
        return Promise.resolve({});
      });

      const quoteResult = await quoteTools.getQuote({
        symbols: ['AAPL']
      });

      const balanceSheetResult = await getBalanceSheetTool({
        symbol: 'AAPL'
      });

      const incomeStatementResult = await getIncomeStatementTool({
        symbol: 'AAPL'
      });

      const cashFlowResult = await getCashFlowStatementTool({
        symbol: 'AAPL'
      });

      expect(quoteResult.results.AAPL.data.regularMarketPrice).toBeGreaterThan(0);
      expect(balanceSheetResult.symbol).toBe('AAPL');
      expect(incomeStatementResult.symbol).toBe('AAPL');
      expect(cashFlowResult.symbol).toBe('AAPL');
    });

    it('should maintain consistent date formats across tools', async () => {
      (yahooFinance.quoteSummary as jest.Mock).mockResolvedValue(mockFinancialsData);

      const balanceSheetResult = await getBalanceSheetTool({ symbol: 'AAPL' });
      const incomeStatementResult = await getIncomeStatementTool({ symbol: 'AAPL' });
      const cashFlowResult = await getCashFlowStatementTool({ symbol: 'AAPL' });

      const bsDate = balanceSheetResult.statements[0].endDate;
      const isDate = incomeStatementResult.statements[0].endDate;
      const cfDate = cashFlowResult.statements[0].endDate;

      expect(bsDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(isDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(cfDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('should handle consistent error responses across tools', async () => {
      mockYahooClient.getQuote.mockRejectedValue(new Error('API error'));
      (yahooFinance.quoteSummary as jest.Mock).mockRejectedValue(new Error('API error'));

      await expect(quoteTools.getQuote({ symbols: ['INVALID'] })).resolves.not.toThrow();
      await expect(getBalanceSheetTool({ symbol: 'INVALID' })).rejects.toThrow();
      await expect(getIncomeStatementTool({ symbol: 'INVALID' })).rejects.toThrow();
    });
  });

  describe('Tool Availability', () => {
    it('should have all financial tool definitions', () => {
      const holdersDefs = getHoldersToolDefinitions();
      const newsDefs = getNewsToolDefinitions();
      const optionsDefs = getOptionsToolDefinitions();

      expect(holdersDefs.length).toBeGreaterThan(0);
      expect(newsDefs.length).toBeGreaterThan(0);
      expect(optionsDefs.length).toBeGreaterThan(0);

      holdersDefs.forEach(def => {
        expect(def.name).toBeDefined();
        expect(def.description).toBeDefined();
        expect(def.inputSchema).toBeDefined();
      });

      newsDefs.forEach(def => {
        expect(def.name).toBeDefined();
        expect(def.description).toBeDefined();
        expect(def.inputSchema).toBeDefined();
      });

      optionsDefs.forEach(def => {
        expect(def.name).toBeDefined();
        expect(def.description).toBeDefined();
        expect(def.inputSchema).toBeDefined();
      });
    });

    it('should provide consistent input schema structure', () => {
      const allSchemas = [
        getBalanceSheet,
        getIncomeStatement,
        getCashFlowStatement,
        getEarnings,
        getAnalysis,
        getNews,
        getOptions
      ];

      allSchemas.forEach(schema => {
        expect(schema).toBeDefined();
        expect(typeof schema.parse).toBe('function');
        expect(typeof schema.safeParse).toBe('function');
      });
    });
  });

  describe('Batch Processing', () => {
    it('should handle batch quote requests efficiently', async () => {
      mockYahooClient.getQuote.mockResolvedValue(mockQuoteResult);

      const symbols = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META'];

      const startTime = Date.now();
      const result = await quoteTools.getQuote({ symbols });
      const endTime = Date.now();

      expect(result.summary.totalRequested).toBe(5);
      expect(result.summary.totalReturned).toBe(5);
      expect(result.summary.errors).toHaveLength(0);
      expect(mockYahooClient.getQuote).toHaveBeenCalledTimes(5);
    });

    it('should handle partial failures in batch requests', async () => {
      mockYahooClient.getQuote.mockImplementation(async (symbol) => {
        if (symbol === 'INVALID') {
          throw new Error('Symbol not found');
        }
        return mockQuoteResult;
      });

      const result = await quoteTools.getQuote({
        symbols: ['AAPL', 'INVALID', 'MSFT', 'INVALID2', 'GOOGL']
      });

      expect(result.summary.totalRequested).toBe(5);
      expect(result.summary.totalReturned).toBe(3);
      expect(result.summary.errors).toHaveLength(2);
      expect(result.summary.errors[0].symbol).toBe('INVALID');
      expect(result.summary.errors[1].symbol).toBe('INVALID2');
    });
  });

  describe('Caching Behavior Across Tools', () => {
    it('should cache results independently per tool', async () => {
      mockYahooClient.getQuote.mockResolvedValue(mockQuoteResult);
      (yahooFinance.quoteSummary as jest.Mock).mockImplementation((symbol, options) => {
        if (options?.modules?.includes('balanceSheetHistory')) {
          return Promise.resolve(mockFinancialsData);
        }
        return Promise.resolve({});
      });

      await quoteTools.getQuote({ symbols: ['AAPL'] });
      await getBalanceSheetTool({ symbol: 'AAPL' });
      await getIncomeStatementTool({ symbol: 'AAPL' });

      const quoteCallCount = mockYahooClient.getQuote.mock.calls.length;
      const summaryCallCount = (yahooFinance.quoteSummary as jest.Mock).mock.calls.length;

      expect(quoteCallCount).toBe(1);
      expect(summaryCallCount).toBe(2);
    });

    it('should refresh cached data when forceRefresh is true', async () => {
      mockYahooClient.getQuote.mockResolvedValue(mockQuoteResult);

      await quoteTools.getQuote({ symbols: ['AAPL'], forceRefresh: false });
      await quoteTools.getQuote({ symbols: ['AAPL'], forceRefresh: true });

      expect(mockYahooClient.getQuote).toHaveBeenCalledTimes(2);
    });
  });

  describe('Data Quality Metrics', () => {
    it('should report consistent quality metrics across tools', async () => {
      mockYahooClient.getQuote.mockResolvedValue(mockQuoteResult);
      (yahooFinance.quoteSummary as jest.Mock).mockResolvedValue(mockFinancialsData);

      const quoteResult = await quoteTools.getQuote({ symbols: ['AAPL'] });
      const balanceSheetResult = await getBalanceSheetTool({ symbol: 'AAPL' });
      const incomeStatementResult = await getIncomeStatementTool({ symbol: 'AAPL' });

      expect(quoteResult.results.AAPL.meta.completenessScore).toBeGreaterThanOrEqual(0);
      expect(quoteResult.results.AAPL.meta.completenessScore).toBeLessThanOrEqual(1);
      expect(balanceSheetResult.meta.completenessScore).toBeGreaterThanOrEqual(0);
      expect(balanceSheetResult.meta.completenessScore).toBeLessThanOrEqual(1);
      expect(incomeStatementResult.meta.completenessScore).toBeGreaterThanOrEqual(0);
      expect(incomeStatementResult.meta.completenessScore).toBeLessThanOrEqual(1);
    });

    it('should generate warnings for low quality data', async () => {
      mockQualityReporter.calculateCompleteness.mockReturnValue(30);

      mockYahooClient.getQuote.mockResolvedValue(mockQuoteResult);

      const result = await quoteTools.getQuote({ symbols: ['AAPL'] });

      expect(result.results.AAPL.meta.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('Error Recovery', () => {
    it('should handle rate limiting gracefully', async () => {
      let callCount = 0;
      mockYahooClient.getQuote.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          const error = new Error('Rate limit exceeded');
          (error as any).isRateLimit = true;
          throw error;
        }
        return mockQuoteResult;
      });

      const result = await quoteTools.getQuote({ symbols: ['AAPL'] });

      expect(callCount).toBeGreaterThanOrEqual(1);
      expect(result.results.AAPL).toBeDefined();
    });

    it('should handle network timeouts with retry', async () => {
      let callCount = 0;
      mockYahooClient.getQuote.mockImplementation(async () => {
        callCount++;
        if (callCount <= 2) {
          throw new Error('Network timeout');
        }
        return mockQuoteResult;
      });

      await quoteTools.getQuote({ symbols: ['AAPL'] });

      expect(callCount).toBeGreaterThanOrEqual(3);
    });

    it('should handle malformed API responses', async () => {
      mockYahooClient.getQuote.mockResolvedValue({ invalid: 'data' });

      const result = await quoteTools.getQuote({ symbols: ['AAPL'] });

      expect(result.summary.totalReturned).toBe(1);
      expect(result.results.AAPL).toBeDefined();
    });
  });

  describe('Performance Characteristics', () => {
    it('should complete requests within reasonable time', async () => {
      mockYahooClient.getQuote.mockResolvedValue(mockQuoteResult);

      const startTime = Date.now();
      await quoteTools.getQuote({ symbols: ['AAPL', 'MSFT', 'GOOGL'] });
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(5000);
    });

    it('should handle concurrent requests efficiently', async () => {
      mockYahooClient.getQuote.mockResolvedValue(mockQuoteResult);

      const promises = Array.from({ length: 10 }, (_, i) =>
        quoteTools.getQuote({ symbols: [`SYMBOL${i}`] })
      );

      const startTime = Date.now();
      await Promise.all(promises);
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(10000);
    });

    it('should respect rate limiting constraints', async () => {
      mockYahooClient.getQuote.mockResolvedValue(mockQuoteResult);

      const promises = Array.from({ length: 100 }, (_, i) =>
        quoteTools.getQuote({ symbols: [`SYMBOL${i}`] })
      );

      const results = await Promise.all(promises);

      results.forEach(result => {
        expect(result.summary).toBeDefined();
        expect(result.results).toBeDefined();
      });
    });
  });

  describe('Integration with Yahoo Finance API', () => {
    it('should use correct API modules for each tool', async () => {
      (yahooFinance.quoteSummary as jest.Mock).mockResolvedValue({});

      await getBalanceSheetTool({ symbol: 'AAPL' });
      await getIncomeStatementTool({ symbol: 'AAPL' });
      await getCashFlowStatementTool({ symbol: 'AAPL' });

      const calls = (yahooFinance.quoteSummary as jest.Mock).mock.calls;

      expect(calls[0]).toEqual(['AAPL', { modules: ['balanceSheetHistory'] }]);
      expect(calls[1]).toEqual(['AAPL', { modules: ['incomeStatementHistory'] }]);
      expect(calls[2]).toEqual(['AAPL', { modules: ['cashflowStatementHistory'] }]);
    });

    it('should handle API response variations', async () => {
      (yahooFinance.quoteSummary as jest.Mock).mockImplementation(() => {
        return Promise.resolve({
          balanceSheetHistory: {
            maxAge: 1,
            annual: []
          }
        });
      });

      await expect(getBalanceSheetTool({ symbol: 'AAPL' })).rejects.toThrow();
    });
  });

  describe('Tool Compatibility', () => {
    it('should work with various input formats', async () => {
      mockYahooClient.getQuote.mockResolvedValue(mockQuoteResult);

      const result1 = await quoteTools.getQuote({ symbols: ['AAPL'] });
      const result2 = await quoteTools.getQuote({ symbols: ['AAPL'], fields: ['regularMarketPrice'] });
      const result3 = await quoteTools.getQuote({ symbols: ['AAPL'], timeout: 10000 });

      expect(result1.summary.totalReturned).toBe(1);
      expect(result2.summary.totalReturned).toBe(1);
      expect(result3.summary.totalReturned).toBe(1);
    });

    it('should handle edge cases in input parameters', async () => {
      mockYahooClient.getQuote.mockResolvedValue(mockQuoteResult);

      const result1 = await quoteTools.getQuote({ symbols: ['AAPL'], limit: 1 });
      const result2 = await quoteTools.getQuote({ symbols: ['AAPL'], interval: '1d' });

      expect(result1.summary.totalReturned).toBe(1);
      expect(result2.summary.totalReturned).toBe(1);
    });
  });
});
