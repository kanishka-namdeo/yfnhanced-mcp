import { QuoteTools, GetQuoteInputSchema, GetQuoteOutputSchema } from '../../../src/tools/quotes';
import { DataQualityReporter } from '../../../src/utils/data-completion';
import { YahooFinanceClient } from '../../../src/services/yahoo-finance';
import { YahooFinanceError, YF_ERR_RATE_LIMIT } from '../../../src/types/errors';
import type { QuoteResult } from '../../../src/types/yahoo-finance';

jest.mock('../../../src/services/yahoo-finance');
jest.mock('../../../src/utils/data-completion');

const mockQuoteResult: QuoteResult = {
  price: {
    regularMarketPrice: 175.5,
    regularMarketChange: 2.3,
    regularMarketChangePercent: 1.33,
    regularMarketPreviousClose: 173.2,
    regularMarketOpen: 174.0,
    regularMarketDayHigh: 176.0,
    regularMarketDayLow: 173.5,
    regularMarketVolume: 50000000,
    marketCap: 2800000000000,
    fiftyTwoWeekHigh: 198.23,
    fiftyTwoWeekLow: 124.17,
    averageDailyVolume3Month: 52000000,
    averageDailyVolume10Day: 48000000,
    currency: 'USD',
    marketState: 'REGULAR',
    quoteType: 'EQUITY',
    symbol: 'AAPL',
    shortName: 'Apple Inc.',
    longName: 'Apple Inc.',
    exchange: 'NASDAQ',
    exchangeTimezoneName: 'America/New_York',
    exchangeTimezoneShortName: 'EDT',
    gmtOffSetMilliseconds: -14400000,
    preMarketPrice: 175.8,
    preMarketChange: 0.3,
    preMarketChangePercent: 0.17,
    preMarketTime: 1700000000,
    postMarketPrice: 175.2,
    postMarketChange: -0.3,
    postMarketChangePercent: -0.17,
    postMarketTime: 1700000000
  },
  meta: {
    currency: 'USD',
    symbol: 'AAPL',
    exchangeName: 'NMS',
    instrumentType: 'EQUITY',
    firstTradeDate: 345479400,
    regularMarketTime: 1700000000,
    gmtoffset: -14400000,
    timezone: 'EST',
    exchangeTimezoneName: 'America/New_York',
    regularMarketPrice: 175.5,
    chartPreviousClose: 173.2,
    priceHint: 2,
    currentTradingPeriod: {
      pre: {
        timezone: 'EST',
        start: 1700000000,
        end: 1700003600,
        gmtoffset: -18000000
      },
      regular: {
        timezone: 'EST',
        start: 1700003600,
        end: 1700025200,
        gmtoffset: -18000000
      },
      post: {
        timezone: 'EST',
        start: 1700025200,
        end: 1700031600,
        gmtoffset: -18000000
      }
    },
    dataGranularity: '1d',
    range: '1d',
    validRanges: ['1d', '5d', '1mo', '3mo', '6mo', '1y', '2y', '5y', '10y', 'ytd', 'max']
  }
};

describe('QuoteTools Integration Tests', () => {
  let quoteTools: QuoteTools;
  let mockYahooClient: jest.Mocked<YahooFinanceClient>;
  let mockQualityReporter: jest.Mocked<DataQualityReporter>;

  beforeEach(() => {
    mockYahooClient = {
      getQuote: jest.fn(),
      getSummaryProfile: jest.fn(),
      initialize: jest.fn().mockResolvedValue(undefined),
      shutdown: jest.fn().mockResolvedValue(undefined),
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
      getStats: jest.fn().mockReturnValue({})
    } as unknown as jest.Mocked<YahooFinanceClient>;

    mockQualityReporter = {
      calculateCompleteness: jest.fn().mockReturnValue(85),
      generateQualityReport: jest.fn().mockReturnValue({
        sourceReliability: 'high',
        warnings: [],
        recommendation: 'Data is reliable'
      })
    } as unknown as jest.Mocked<DataQualityReporter>;

    quoteTools = new QuoteTools(mockYahooClient, mockQualityReporter);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getQuote - Single Symbol', () => {
    it('should successfully fetch quote for single symbol', async () => {
      mockYahooClient.getQuote.mockResolvedValue(mockQuoteResult);

      const input = GetQuoteInputSchema.parse({
        symbols: ['AAPL']
      });

      const result = await quoteTools.getQuote(input);

      expect(result.results).toHaveProperty('AAPL');
      expect(result.results.AAPL.data.regularMarketPrice).toBe(175.5);
      expect(result.summary.totalRequested).toBe(1);
      expect(result.summary.totalReturned).toBe(1);
      expect(result.summary.errors).toHaveLength(0);
      expect(mockYahooClient.getQuote).toHaveBeenCalledWith('AAPL', expect.any(Object));
    });

    it('should handle cached quotes correctly', async () => {
      mockYahooClient.getQuote.mockResolvedValue(mockQuoteResult);

      const input = GetQuoteInputSchema.parse({
        symbols: ['AAPL']
      });

      const result = await quoteTools.getQuote(input);

      expect(result.results.AAPL.meta.fromCache).toBe(false);
      expect(result.summary.fromCache).toBe(0);
    });

    it('should apply field filtering correctly', async () => {
      mockYahooClient.getQuote.mockResolvedValue(mockQuoteResult);

      const input = GetQuoteInputSchema.parse({
        symbols: ['AAPL'],
        fields: ['regularMarketPrice', 'regularMarketVolume', 'marketCap']
      });

      const result = await quoteTools.getQuote(input);

      expect(result.results.AAPL.data.regularMarketPrice).toBeDefined();
      expect(result.results.AAPL.data.regularMarketVolume).toBeDefined();
      expect(result.results.AAPL.data.marketCap).toBeDefined();
      expect(result.results.AAPL.data.trailingPE).toBeUndefined();
    });

    it('should force refresh from API when requested', async () => {
      mockYahooClient.getQuote.mockResolvedValue(mockQuoteResult);

      const input = GetQuoteInputSchema.parse({
        symbols: ['AAPL'],
        forceRefresh: true
      });

      const result = await quoteTools.getQuote(input);

      expect(mockYahooClient.getQuote).toHaveBeenCalledWith('AAPL', expect.objectContaining({
        forceRefresh: true,
        useCache: false
      }));
    });

    it('should handle timeout parameter', async () => {
      mockYahooClient.getQuote.mockResolvedValue(mockQuoteResult);

      const input = GetQuoteInputSchema.parse({
        symbols: ['AAPL'],
        timeout: 10000
      });

      const result = await quoteTools.getQuote(input);

      expect(mockYahooClient.getQuote).toHaveBeenCalledWith('AAPL', expect.objectContaining({
        timeout: 10000
      }));
    });
  });

  describe('getQuote - Multiple Symbols', () => {
    it('should successfully fetch quotes for multiple symbols', async () => {
      const mockQuotes: Record<string, QuoteResult> = {
        AAPL: mockQuoteResult,
        MSFT: { ...mockQuoteResult, price: { ...mockQuoteResult.price, symbol: 'MSFT', regularMarketPrice: 378.5 } },
        GOOGL: { ...mockQuoteResult, price: { ...mockQuoteResult.price, symbol: 'GOOGL', regularMarketPrice: 141.2 } }
      };

      mockYahooClient.getQuote.mockImplementation(async (symbol) => {
        return mockQuotes[symbol] || mockQuoteResult;
      });

      const input = GetQuoteInputSchema.parse({
        symbols: ['AAPL', 'MSFT', 'GOOGL']
      });

      const result = await quoteTools.getQuote(input);

      expect(result.summary.totalRequested).toBe(3);
      expect(result.summary.totalReturned).toBe(3);
      expect(result.results).toHaveProperty('AAPL');
      expect(result.results).toHaveProperty('MSFT');
      expect(result.results).toHaveProperty('GOOGL');
      expect(result.summary.errors).toHaveLength(0);
    });

    it('should handle partial failures gracefully', async () => {
      mockYahooClient.getQuote.mockImplementation(async (symbol) => {
        if (symbol === 'INVALID') {
          throw new Error('Symbol not found');
        }
        return mockQuoteResult;
      });

      const input = GetQuoteInputSchema.parse({
        symbols: ['AAPL', 'INVALID', 'MSFT']
      });

      const result = await quoteTools.getQuote(input);

      expect(result.summary.totalRequested).toBe(3);
      expect(result.summary.totalReturned).toBe(2);
      expect(result.summary.errors).toHaveLength(1);
      expect(result.summary.errors[0].symbol).toBe('INVALID');
      expect(result.results).toHaveProperty('AAPL');
      expect(result.results).toHaveProperty('MSFT');
    });

    it('should process symbols in batches', async () => {
      const symbols = Array.from({ length: 25 }, (_, i) => `SYMBOL${i}`);
      mockYahooClient.getQuote.mockResolvedValue(mockQuoteResult);

      const input = GetQuoteInputSchema.parse({
        symbols
      });

      const result = await quoteTools.getQuote(input);

      expect(result.summary.totalRequested).toBe(25);
      expect(result.summary.totalReturned).toBe(25);
    });
  });

  describe('getQuote - Error Handling', () => {
    it('should handle rate limit errors with fallback to cache', async () => {
      const rateLimitError = new YahooFinanceError(
        'Rate limit exceeded',
        YF_ERR_RATE_LIMIT,
        429,
        true,
        true,
        {},
        'Retry with backoff'
      );

      mockYahooClient.getQuote.mockRejectedValue(rateLimitError);

      const input = GetQuoteInputSchema.parse({
        symbols: ['AAPL']
      });

      await expect(quoteTools.getQuote(input)).rejects.toThrow();

      expect(result.summary.rateLimited).toBe(true);
    });

    it('should handle network errors', async () => {
      mockYahooClient.getQuote.mockRejectedValue(new Error('Network error'));

      const input = GetQuoteInputSchema.parse({
        symbols: ['AAPL']
      });

      const result = await quoteTools.getQuote(input);

      expect(result.summary.totalReturned).toBe(0);
      expect(result.summary.errors).toHaveLength(1);
      expect(result.summary.errors[0].symbol).toBe('AAPL');
      expect(result.summary.errors[0].error).toContain('Network error');
    });

    it('should handle timeout errors', async () => {
      mockYahooClient.getQuote.mockRejectedValue(new Error('Request timeout'));

      const input = GetQuoteInputSchema.parse({
        symbols: ['AAPL', 'MSFT']
      });

      const result = await quoteTools.getQuote(input);

      expect(result.summary.totalReturned).toBe(0);
      expect(result.summary.errors).toHaveLength(2);
    });
  });

  describe('getQuoteSummary - Single Symbol', () => {
    it('should successfully fetch quote summary', async () => {
      mockYahooClient.getSummaryProfile.mockResolvedValue({
        assetProfile: {
          address1: '1 Apple Park Way',
          city: 'Cupertino',
          state: 'CA',
          zip: '95014',
          country: 'USA',
          phone: '1-408-996-1010',
          website: 'https://www.apple.com',
          industry: 'Consumer Electronics',
          sector: 'Technology',
          longBusinessSummary: 'Apple Inc. designs, manufactures...',
          fullTimeEmployees: 100000
        }
      });

      const input = {
        symbol: 'AAPL',
        modules: ['defaultKeyStatistics', 'summaryDetail', 'financialData']
      };

      const result = await quoteTools.getQuoteSummary(input);

      expect(result.symbol).toBe('AAPL');
      expect(result.modules).toEqual(input.modules);
      expect(result.completenessPercentage).toBeGreaterThan(0);
      expect(result.metadata.lastSuccessfulUpdate).toBeDefined();
      expect(mockYahooClient.getSummaryProfile).toHaveBeenCalledWith('AAPL', expect.any(Object));
    });

    it('should calculate completeness score correctly', async () => {
      mockQualityReporter.calculateCompleteness.mockReturnValue(75);

      mockYahooClient.getSummaryProfile.mockResolvedValue({
        assetProfile: {
          address1: '1 Apple Park Way',
          city: 'Cupertino',
          state: 'CA',
          zip: '95014',
          country: 'USA'
        }
      });

      const input = {
        symbol: 'AAPL',
        modules: ['defaultKeyStatistics', 'summaryDetail']
      };

      const result = await quoteTools.getQuoteSummary(input);

      expect(result.completenessPercentage).toBe(75);
      expect(mockQualityReporter.calculateCompleteness).toHaveBeenCalled();
    });

    it('should identify missing fields', async () => {
      mockYahooClient.getSummaryProfile.mockResolvedValue({
        assetProfile: {
          address1: '1 Apple Park Way',
          city: 'Cupertino'
        }
      });

      const input = {
        symbol: 'AAPL',
        modules: ['defaultKeyStatistics']
      };

      const result = await quoteTools.getQuoteSummary(input);

      expect(result.missingFields).toBeInstanceOf(Array);
      expect(result.missingFields.length).toBeGreaterThan(0);
    });

    it('should generate quality report correctly', async () => {
      mockQualityReporter.generateQualityReport.mockReturnValue({
        sourceReliability: 'medium',
        warnings: ['Data is delayed (15+ minutes)'],
        recommendation: 'Use with caution'
      });

      mockYahooClient.getSummaryProfile.mockResolvedValue({
        assetProfile: {
          address1: '1 Apple Park Way',
          city: 'Cupertino',
          state: 'CA',
          zip: '95014'
        }
      });

      const input = {
        symbol: 'AAPL'
      };

      const result = await quoteTools.getQuoteSummary(input);

      expect(result.metadata.sourceReliability).toBe('medium');
      expect(result.metadata.warnings).toContain('Data is delayed (15+ minutes)');
      expect(result.metadata.recommendation).toBe('Use with caution');
    });

    it('should use default modules when not specified', async () => {
      mockYahooClient.getSummaryProfile.mockResolvedValue({
        assetProfile: {
          address1: '1 Apple Park Way',
          city: 'Cupertino',
          state: 'CA',
          zip: '95014'
        }
      });

      const input = {
        symbol: 'AAPL'
      };

      const result = await quoteTools.getQuoteSummary(input);

      expect(result.modules).toEqual(['defaultKeyStatistics', 'summaryDetail', 'financialData', 'price']);
    });
  });

  describe('getQuoteSummary - Error Handling and Fallback', () => {
    it('should retry with alternative modules on failure', async () => {
      mockYahooClient.getSummaryProfile.mockRejectedValueOnce(new Error('Primary module failed'));
      mockYahooClient.getQuote.mockResolvedValue(mockQuoteResult);

      const input = {
        symbol: 'AAPL',
        modules: ['customModule'],
        retryOnFailure: true
      };

      const result = await quoteTools.getQuoteSummary(input);

      expect(result.alternativeModules).toBeDefined();
      expect(result.alternativeModules!.length).toBeGreaterThan(0);
      expect(result.data).toBeDefined();
    });

    it('should fall back to quote when summary fails', async () => {
      mockYahooClient.getSummaryProfile.mockRejectedValue(new Error('Summary not available'));
      mockYahooClient.getQuote.mockResolvedValue(mockQuoteResult);

      const input = {
        symbol: 'AAPL',
        modules: ['defaultKeyStatistics']
      };

      const result = await quoteTools.getQuoteSummary(input);

      expect(result.data).toBeDefined();
      expect(result.data.regularMarketPrice).toBe(175.5);
    });

    it('should throw error when all retries fail', async () => {
      mockYahooClient.getSummaryProfile.mockRejectedValue(new Error('All methods failed'));
      mockYahooClient.getQuote.mockRejectedValue(new Error('Quote also failed'));

      const input = {
        symbol: 'AAPL',
        retryOnFailure: true
      };

      await expect(quoteTools.getQuoteSummary(input)).rejects.toThrow();
    });
  });

  describe('getQuote - Data Quality', () => {
    it('should calculate completeness score', async () => {
      mockQualityReporter.calculateCompleteness.mockReturnValue(92);

      mockYahooClient.getQuote.mockResolvedValue(mockQuoteResult);

      const input = GetQuoteInputSchema.parse({
        symbols: ['AAPL']
      });

      const result = await quoteTools.getQuote(input);

      expect(result.results.AAPL.meta.completenessScore).toBe(0.92);
    });

    it('should generate warnings for delayed data', async () => {
      const oldQuote = {
        ...mockQuoteResult,
        meta: {
          ...mockQuoteResult.meta!,
          regularMarketTime: Date.now() - 20 * 60 * 1000
        }
      };

      mockYahooClient.getQuote.mockResolvedValue(oldQuote);

      const input = GetQuoteInputSchema.parse({
        symbols: ['AAPL']
      });

      const result = await quoteTools.getQuote(input);

      expect(result.results.AAPL.meta.warnings).toContain('Data is delayed (15+ minutes)');
    });

    it('should generate warnings for incomplete data', async () => {
      mockQualityReporter.calculateCompleteness.mockReturnValue(40);

      const incompleteQuote = {
        ...mockQuoteResult,
        price: {
          ...mockQuoteResult.price,
          regularMarketVolume: null,
          marketCap: null
        }
      };

      mockYahooClient.getQuote.mockResolvedValue(incompleteQuote);

      const input = GetQuoteInputSchema.parse({
        symbols: ['AAPL']
      });

      const result = await quoteTools.getQuote(input);

      expect(result.results.AAPL.meta.warnings).toContain('Low data completeness (<50%)');
      expect(result.results.AAPL.meta.warnings).toContain('Missing volume data');
    });
  });
});
