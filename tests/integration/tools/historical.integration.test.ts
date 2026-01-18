import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { HistoricalTools } from '../../../src/tools/historical';
import { YahooFinanceClient } from '../../../src/services/yahoo-finance';
import { DataQualityReporter } from '../../../src/utils/data-completion';
import type { HistoricalPriceResult } from '../../../src/types/yahoo-finance';

jest.mock('../../../src/services/yahoo-finance');
jest.mock('../../../src/utils/data-completion');

const mockHistoricalResult: HistoricalPriceResult = {
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
    range: '1mo',
    validRanges: ['1d', '5d', '1mo', '3mo', '6mo', '1y', '2y', '5y', '10y', 'ytd', 'max']
  },
  timestamps: [1700000000, 1700086400, 1700172800, 1700259200, 1700345600],
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

describe('HistoricalTools Integration Tests', () => {
  let historicalTools: HistoricalTools;
  let mockServer: Server;
  let mockClient: jest.Mocked<YahooFinanceClient>;
  let mockQualityReporter: jest.Mocked<DataQualityReporter>;

  beforeEach(() => {
    mockServer = new Server({ name: 'test', version: '1.0.0' }, { capabilities: {} });

    mockClient = {
      getHistoricalPrices: jest.fn(),
      initialize: jest.fn().mockResolvedValue(undefined),
      shutdown: jest.fn().mockResolvedValue(undefined),
      getQuote: jest.fn(),
      getSummaryProfile: jest.fn(),
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
      calculateCompleteness: jest.fn().mockReturnValue(90),
      generateWarnings: jest.fn().mockReturnValue([]),
      generateQualityReport: jest.fn().mockReturnValue({
        sourceReliability: 'high',
        warnings: [],
        recommendation: 'Data is reliable'
      })
    } as unknown as jest.Mocked<DataQualityReporter>;

    historicalTools = new HistoricalTools(mockServer, mockClient, mockQualityReporter);
  });

  afterEach(() => {
    jest.clearAllMocks();
    historicalTools.clearCache();
  });

  describe('handleGetHistoricalPrices - Success Cases', () => {
    it('should successfully fetch historical prices for single symbol', async () => {
      mockClient.getHistoricalPrices.mockResolvedValue(mockHistoricalResult);

      const request = {
        params: {
          name: 'get_historical_prices',
          arguments: {
            symbol: 'AAPL',
            startDate: '2023-01-01',
            endDate: '2023-01-05',
            interval: '1d',
            validateData: true
          }
        }
      };

      const result = await (historicalTools as any).handleGetHistoricalPrices(request.params.arguments);
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.symbol).toBe('AAPL');
      expect(parsed.data).toBeInstanceOf(Array);
      expect(parsed.data.length).toBe(5);
      expect(parsed.data[0].date).toBe('2023-11-15');
      expect(parsed.data[0].open).toBe(174.0);
      expect(parsed.data[0].high).toBe(175.0);
      expect(parsed.data[0].low).toBe(173.5);
      expect(parsed.data[0].close).toBe(174.5);
      expect(parsed.meta.fromCache).toBe(false);
      expect(parsed.meta.completenessScore).toBeGreaterThan(0);
      expect(mockClient.getHistoricalPrices).toHaveBeenCalledWith('AAPL', expect.objectContaining({
        period1: expect.any(Date),
        period2: expect.any(Date),
        interval: '1d'
      }));
    });

    it('should fetch historical prices with default interval', async () => {
      mockClient.getHistoricalPrices.mockResolvedValue(mockHistoricalResult);

      const request = {
        params: {
          name: 'get_historical_prices',
          arguments: {
            symbol: 'AAPL',
            startDate: '2023-01-01'
          }
        }
      };

      const result = await (historicalTools as any).handleGetHistoricalPrices(request.params.arguments);

      expect(mockClient.getHistoricalPrices).toHaveBeenCalledWith('AAPL', expect.objectContaining({
        interval: '1d'
      }));
    });

    it('should handle different intervals', async () => {
      mockClient.getHistoricalPrices.mockResolvedValue(mockHistoricalResult);

      const intervals = ['1m', '5m', '1h', '1d', '1wk', '1mo'];

      for (const interval of intervals) {
        const request = {
          params: {
            name: 'get_historical_prices',
            arguments: {
              symbol: 'AAPL',
              startDate: '2023-01-01',
              interval
            }
          }
        };

        await (historicalTools as any).handleGetHistoricalPrices(request.params.arguments);

        expect(mockClient.getHistoricalPrices).toHaveBeenCalledWith('AAPL', expect.objectContaining({
          interval
        }));
      }
    });

    it('should use cached data when available and fresh', async () => {
      mockClient.getHistoricalPrices.mockResolvedValue(mockHistoricalResult);

      const request = {
        params: {
          name: 'get_historical_prices',
          arguments: {
            symbol: 'AAPL',
            startDate: '2023-01-01',
            interval: '1d'
          }
        }
      };

      const result1 = await (historicalTools as any).handleGetHistoricalPrices(request.params.arguments);
      const result2 = await (historicalTools as any).handleGetHistoricalPrices(request.params.arguments);

      expect(mockClient.getHistoricalPrices).toHaveBeenCalledTimes(1);
    });

    it('should validate price data when requested', async () => {
      mockClient.getHistoricalPrices.mockResolvedValue(mockHistoricalResult);

      const request = {
        params: {
          name: 'get_historical_prices',
          arguments: {
            symbol: 'AAPL',
            startDate: '2023-01-01',
            validateData: true
          }
        }
      };

      const result = await (historicalTools as any).handleGetHistoricalPrices(request.params.arguments);
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.meta.integrityFlags).toBeDefined();
      expect(Array.isArray(parsed.meta.integrityFlags)).toBe(true);
    });

    it('should skip data validation when requested', async () => {
      mockClient.getHistoricalPrices.mockResolvedValue(mockHistoricalResult);

      const request = {
        params: {
          name: 'get_historical_prices',
          arguments: {
            symbol: 'AAPL',
            startDate: '2023-01-01',
            validateData: false
          }
        }
      };

      const result = await (historicalTools as any).handleGetHistoricalPrices(request.params.arguments);
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.data).toBeDefined();
      expect(parsed.data.length).toBeGreaterThan(0);
    });
  });

  describe('handleGetHistoricalPrices - Error Handling', () => {
    it('should handle fetch failures and return stale cached data', async () => {
      mockClient.getHistoricalPrices.mockResolvedValueOnce(mockHistoricalResult);

      const request = {
        params: {
          name: 'get_historical_prices',
          arguments: {
            symbol: 'AAPL',
            startDate: '2023-01-01'
          }
        }
      };

      const result1 = await (historicalTools as any).handleGetHistoricalPrices(request.params.arguments);

      mockClient.getHistoricalPrices.mockRejectedValueOnce(new Error('API error'));

      const result2 = await (historicalTools as any).handleGetHistoricalPrices(request.params.arguments);
      const parsed2 = JSON.parse(result2.content[0].text);

      expect(parsed2.meta.fromCache).toBe(true);
      expect(parsed2.meta.warnings).toContain('Using stale cached data due to fetch failure');
      expect(parsed2.meta.integrityFlags).toContain('stale_data');
    });

    it('should throw error when no cached data available on failure', async () => {
      mockClient.getHistoricalPrices.mockRejectedValue(new Error('API error'));

      const request = {
        params: {
          name: 'get_historical_prices',
          arguments: {
            symbol: 'AAPL',
            startDate: '2023-01-01'
          }
        }
      };

      await expect((historicalTools as any).handleGetHistoricalPrices(request.params.arguments))
        .rejects.toThrow('Failed to fetch historical data');
    });

    it('should retry with alternative intervals on failure', async () => {
      mockClient.getHistoricalPrices.mockRejectedValueOnce(new Error('Primary interval failed'));
      mockClient.getHistoricalPrices.mockResolvedValueOnce(mockHistoricalResult);

      const request = {
        params: {
          name: 'get_historical_prices',
          arguments: {
            symbol: 'AAPL',
            startDate: '2023-01-01',
            interval: '5m'
          }
        }
      };

      const result = await (historicalTools as any).handleGetHistoricalPrices(request.params.arguments);
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.data).toBeDefined();
      expect(mockClient.getHistoricalPrices).toHaveBeenCalled();
    });

    it('should handle network timeouts', async () => {
      mockClient.getHistoricalPrices.mockRejectedValue(new Error('Request timeout'));

      const request = {
        params: {
          name: 'get_historical_prices',
          arguments: {
            symbol: 'AAPL',
            startDate: '2023-01-01'
          }
        }
      };

      await expect((historicalTools as any).handleGetHistoricalPrices(request.params.arguments))
        .rejects.toThrow();
    });
  });

  describe('handleGetHistoricalPricesMulti - Batch Processing', () => {
    it('should successfully fetch historical prices for multiple symbols', async () => {
      mockClient.getHistoricalPrices.mockResolvedValue(mockHistoricalResult);

      const request = {
        params: {
          name: 'get_historical_prices_multi',
          arguments: {
            symbols: ['AAPL', 'MSFT', 'GOOGL'],
            startDate: '2023-01-01',
            interval: '1d'
          }
        }
      };

      const result = await (historicalTools as any).handleGetHistoricalPricesMulti(request.params.arguments);
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed).toHaveProperty('AAPL');
      expect(parsed).toHaveProperty('MSFT');
      expect(parsed).toHaveProperty('GOOGL');
      expect(parsed.AAPL.status).toBe('success');
      expect(parsed.AAPL.data).toBeInstanceOf(Array);
      expect(mockClient.getHistoricalPrices).toHaveBeenCalledTimes(3);
    });

    it('should handle partial failures in batch requests', async () => {
      mockClient.getHistoricalPrices
        .mockResolvedValueOnce(mockHistoricalResult)
        .mockRejectedValueOnce(new Error('Symbol not found'))
        .mockResolvedValueOnce(mockHistoricalResult);

      const request = {
        params: {
          name: 'get_historical_prices_multi',
          arguments: {
            symbols: ['AAPL', 'INVALID', 'MSFT'],
            startDate: '2023-01-01'
          }
        }
      };

      const result = await (historicalTools as any).handleGetHistoricalPricesMulti(request.params.arguments);
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.AAPL.status).toBe('success');
      expect(parsed.INVALID.status).toBe('error');
      expect(parsed.INVALID.error).toContain('Symbol not found');
      expect(parsed.MSFT.status).toBe('success');
    });

    it('should handle all symbols failing in batch request', async () => {
      mockClient.getHistoricalPrices.mockRejectedValue(new Error('All failed'));

      const request = {
        params: {
          name: 'get_historical_prices_multi',
          arguments: {
            symbols: ['AAPL', 'MSFT'],
            startDate: '2023-01-01'
          }
        }
      };

      const result = await (historicalTools as any).handleGetHistoricalPricesMulti(request.params.arguments);
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.AAPL.status).toBe('error');
      expect(parsed.MSFT.status).toBe('error');
    });

    it('should respect batch size limits', async () => {
      mockClient.getHistoricalPrices.mockResolvedValue(mockHistoricalResult);

      const symbols = Array.from({ length: 50 }, (_, i) => `SYMBOL${i}`);

      const request = {
        params: {
          name: 'get_historical_prices_multi',
          arguments: {
            symbols,
            startDate: '2023-01-01'
          }
        }
      };

      const result = await (historicalTools as any).handleGetHistoricalPricesMulti(request.params.arguments);
      const parsed = JSON.parse(result.content[0].text);

      expect(Object.keys(parsed).length).toBe(50);
      expect(mockClient.getHistoricalPrices).toHaveBeenCalledTimes(50);
    });
  });

  describe('Data Validation', () => {
    it('should detect price anomalies', async () => {
      const anomalousResult = {
        ...mockHistoricalResult,
        indicators: {
          quote: [
            {
              open: [100.0, 200.0, 150.0],
              high: [90.0, 210.0, 160.0],
              low: [110.0, 190.0, 140.0],
              close: [105.0, 205.0, 155.0],
              volume: [50000000, 52000000, 48000000]
            }
          ],
          adjclose: [
            {
              adjclose: [105.0, 205.0, 155.0]
            }
          ]
        }
      };

      mockClient.getHistoricalPrices.mockResolvedValue(anomalousResult);

      const request = {
        params: {
          name: 'get_historical_prices',
          arguments: {
            symbol: 'AAPL',
            startDate: '2023-01-01',
            validateData: true
          }
        }
      };

      const result = await (historicalTools as any).handleGetHistoricalPrices(request.params.arguments);
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.meta.integrityFlags.length).toBeGreaterThan(0);
      expect(parsed.meta.warnings).toContainEqual(expect.stringContaining('integrity issues'));
    });

    it('should detect gaps in data', async () => {
      const gappedResult = {
        ...mockHistoricalResult,
        timestamps: [1700000000, 1700345600]
      };

      mockClient.getHistoricalPrices.mockResolvedValue(gappedResult);

      const request = {
        params: {
          name: 'get_historical_prices',
          arguments: {
            symbol: 'AAPL',
            startDate: '2023-01-01',
            validateData: true
          }
        }
      };

      const result = await (historicalTools as any).handleGetHistoricalPrices(request.params.arguments);
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.data.some((item: any) => item.isGap === true)).toBe(true);
    });

    it('should detect stock splits', async () => {
      mockClient.getHistoricalPrices.mockResolvedValue(mockHistoricalResult);

      const request = {
        params: {
          name: 'get_historical_prices',
          arguments: {
            symbol: 'AAPL',
            startDate: '2023-01-01',
            validateData: true
          }
        }
      };

      const result = await (historicalTools as any).handleGetHistoricalPrices(request.params.arguments);
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.data).toBeDefined();
      expect(parsed.data[0]).toHaveProperty('isSplit');
    });

    it('should detect null values', async () => {
      const nullResult = {
        ...mockHistoricalResult,
        indicators: {
          quote: [
            {
              open: [0, 0, 0],
              high: [0, 0, 0],
              low: [0, 0, 0],
              close: [0, 0, 0],
              volume: [0, 0, 0]
            }
          ],
          adjclose: [
            {
              adjclose: [0, 0, 0]
            }
          ]
        }
      };

      mockClient.getHistoricalPrices.mockResolvedValue(nullResult);

      const request = {
        params: {
          name: 'get_historical_prices',
          arguments: {
            symbol: 'AAPL',
            startDate: '2023-01-01',
            validateData: true
          }
        }
      };

      const result = await (historicalTools as any).handleGetHistoricalPrices(request.params.arguments);
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.data.some((item: any) => item.hasNulls === true)).toBe(true);
    });

    it('should calculate completeness score', async () => {
      mockQualityReporter.calculateCompleteness.mockReturnValue(85);

      mockClient.getHistoricalPrices.mockResolvedValue(mockHistoricalResult);

      const request = {
        params: {
          name: 'get_historical_prices',
          arguments: {
            symbol: 'AAPL',
            startDate: '2023-01-01'
          }
        }
      };

      const result = await (historicalTools as any).handleGetHistoricalPrices(request.params.arguments);
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.meta.completenessScore).toBe(0.85);
    });
  });

  describe('Cache Management', () => {
    it('should clear cache successfully', () => {
      historicalTools.clearCache();
      expect(historicalTools.getCacheSize()).toBe(0);
    });

    it('should report correct cache size', async () => {
      mockClient.getHistoricalPrices.mockResolvedValue(mockHistoricalResult);

      const request = {
        params: {
          name: 'get_historical_prices',
          arguments: {
            symbol: 'AAPL',
            startDate: '2023-01-01'
          }
        }
      };

      await (historicalTools as any).handleGetHistoricalPrices(request.params.arguments);

      expect(historicalTools.getCacheSize()).toBeGreaterThan(0);
    });
  });
});
