import { SummaryTools } from '../../../src/tools/summary';
import { YahooFinanceClient } from '../../../src/services/yahoo-finance';

describe('SummaryTools', () => {
  let tools: SummaryTools;
  let mockClient: jest.Mocked<YahooFinanceClient>;

  beforeEach(() => {
    mockClient = {
      getSummaryProfile: jest.fn(),
      getTrending: jest.fn(),
      screener: jest.fn()
    } as unknown as jest.Mocked<YahooFinanceClient>;

    const config = {
      serverInfo: {
        name: 'Test Server',
        version: '1.0.0',
        protocolVersion: '1.0'
      },
      capabilities: {},
      transport: 'stdio',
      rateLimit: {
        strategy: 'token-bucket' as const,
        maxRequests: 10,
        windowMs: 60000,
        tokenRefillRate: 1
      },
      cache: {
        enabled: true,
        store: 'memory',
        ttl: 60000,
        maxEntries: 100
      },
      retry: {
        enabled: true,
        maxRetries: 3,
        initialDelayMs: 1000,
        maxDelayMs: 10000,
        strategy: 'exponential',
        backoffMultiplier: 2,
        jitter: false,
        retryableStatusCodes: [429, 500],
        retryableErrorCodes: ['ECONNRESET']
      },
      circuitBreaker: {
        enabled: true,
        timeoutMs: 60000,
        errorThresholdPercentage: 5,
        resetTimeoutMs: 60000,
        rollingCountBuckets: 60,
        rollingCountTimeoutMs: 60000,
        volumeThreshold: 5,
        halfOpenMaxAttempts: 3
      },
      queue: {
        enabled: true,
        maxSize: 100,
        strategy: 'fifo',
        concurrency: 5,
        timeoutMs: 30000,
        processingTimeoutMs: 60000
      },
      dataCompletion: {
        enabled: true,
        level: 'moderate',
        requiredFields: [],
        preferredFields: [],
        allowPartial: true,
        fallbackToCache: true
      },
      logging: {
        level: 'info',
        format: 'text',
        destination: 'console'
      },
      network: {
        timeoutMs: 30000,
        keepAlive: true,
        keepAliveMsecs: 1000,
        maxSockets: 10,
        maxFreeSockets: 5,
        scheduling: 'fifo',
        maxRedirects: 5,
        followRedirects: true
      },
      yahooFinance: {
        baseUrl: 'https://query1.finance.yahoo.com',
        timeoutMs: 30000,
        userAgent: 'Mozilla/5.0',
        maxConcurrentRequests: 5,
        requestQueueSize: 100,
        validateResponses: true,
        strictMode: false
      }
    };

    tools = new SummaryTools(mockClient, config);
  });

  describe('getSummaryProfile', () => {
    test('should get summary profile successfully', async () => {
      const mockResult = {
        assetProfile: {
          address1: 'One Apple Park Way',
          city: 'Cupertino',
          state: 'CA',
          zip: '95014',
          country: 'United States',
          phone: '408-996-1010',
          website: 'https://www.apple.com',
          industry: 'Consumer Electronics',
          sector: 'Technology',
          fullTimeEmployees: 164000,
          longBusinessSummary: 'Apple Inc. designs, manufactures, and markets smartphones...'
        }
      };

      mockClient.getSummaryProfile.mockResolvedValue(mockResult);

      const result = await tools.getSummaryProfile({ symbol: 'AAPL' });

      expect(result).toHaveProperty('symbol', 'AAPL');
      expect(result).toHaveProperty('profile');
      expect(result).toHaveProperty('meta');
      expect(result.meta).toHaveProperty('fromCache');
      expect(result.meta).toHaveProperty('dataAge');
      expect(result.meta).toHaveProperty('completenessScore');
      expect(result.meta).toHaveProperty('warnings');
    });

    test('should handle missing sector', async () => {
      const mockResult = {
        assetProfile: {
          address1: 'One Apple Park Way',
          city: 'Cupertino',
          state: 'CA',
          zip: '95014',
          country: 'United States',
          phone: '408-996-1010',
          website: 'https://www.apple.com',
          industry: 'Software',
          sector: '',
          fullTimeEmployees: 164000,
          longBusinessSummary: 'Apple Inc. designs software...'
        }
      };

      mockClient.getSummaryProfile.mockResolvedValue(mockResult);

      const result = await tools.getSummaryProfile({ symbol: 'AAPL' });

      expect(result.meta.warnings).toContain('Sector data is missing');
    });

    test('should handle missing industry', async () => {
      const mockResult = {
        assetProfile: {
          address1: 'One Apple Park Way',
          city: 'Cupertino',
          state: 'CA',
          zip: '95014',
          country: 'United States',
          phone: '408-996-1010',
          website: 'https://www.apple.com',
          industry: '',
          sector: 'Technology',
          fullTimeEmployees: 164000,
          longBusinessSummary: 'Apple Inc. designs...'
        }
      };

      mockClient.getSummaryProfile.mockResolvedValue(mockResult);

      const result = await tools.getSummaryProfile({ symbol: 'AAPL' });

      expect(result.meta.warnings).toContain('Industry data is missing');
    });

    test('should handle missing business summary', async () => {
      const mockResult = {
        assetProfile: {
          address1: 'One Apple Park Way',
          city: 'Cupertino',
          state: 'CA',
          zip: '95014',
          country: 'United States',
          phone: '408-996-1010',
          website: 'https://www.apple.com',
          industry: 'Consumer Electronics',
          sector: 'Technology',
          fullTimeEmployees: 164000,
          longBusinessSummary: ''
        }
      };

      mockClient.getSummaryProfile.mockResolvedValue(mockResult);

      const result = await tools.getSummaryProfile({ symbol: 'AAPL', includeBusinessSummary: true });

      expect(result.meta.warnings).toContain('Business summary is unavailable');
    });

    test('should throw error on client failure', async () => {
      mockClient.getSummaryProfile.mockRejectedValue(new Error('Network error'));

      await expect(tools.getSummaryProfile({ symbol: 'AAPL' })).rejects.toThrow('Failed to fetch summary profile for AAPL');
    });
  });

  describe('getCryptoQuote', () => {
    test('should get crypto quote successfully', async () => {
      const result = await tools.getCryptoQuote({ symbols: ['BTC-USD', 'ETH-USD'] });

      expect(result).toHaveProperty('results');
      expect(result).toHaveProperty('summary');
      expect(result.results).toHaveProperty('BTC-USD');
      expect(result.results).toHaveProperty('ETH-USD');
      expect(result.summary.totalRequested).toBe(2);
    });

    test('should handle errors for individual symbols', async () => {
      const result = await tools.getCryptoQuote({ symbols: ['BTC-USD', 'INVALID'] });

      expect(result.summary.totalReturned).toBe(2);
      expect(result.summary.errors).toBeDefined();
    });

    test('should respect currency parameter', async () => {
      const result = await tools.getCryptoQuote({ symbols: ['BTC-USD'], currency: 'EUR' });

      expect(result.results['BTC-USD']).toBeDefined();
    });
  });

  describe('getForexQuote', () => {
    test('should get forex quote successfully', async () => {
      const result = await tools.getForexQuote({ pairs: ['EURUSD', 'GBPUSD'] });

      expect(result).toHaveProperty('results');
      expect(result).toHaveProperty('summary');
      expect(result.results).toHaveProperty('EURUSD');
      expect(result.results).toHaveProperty('GBPUSD');
      expect(result.summary.totalRequested).toBe(2);
    });

    test('should handle errors for individual pairs', async () => {
      const result = await tools.getForexQuote({ pairs: ['EURUSD', 'INVALID'] });

      expect(result.summary.totalReturned).toBe(2);
      expect(result.summary.errors).toBeDefined();
    });
  });

  describe('getTrendingSymbols', () => {
    test('should get trending symbols successfully', async () => {
      const mockTrending = {
        quotes: [
          { symbol: 'AAPL', name: 'Apple Inc.' },
          { symbol: 'MSFT', name: 'Microsoft Corporation' }
        ]
      };

      mockClient.getTrending.mockResolvedValue(mockTrending);

      const result = await tools.getTrendingSymbols({ region: 'US', limit: 10 });

      expect(result).toHaveProperty('trending');
      expect(result).toHaveProperty('meta');
      expect(result.trending.quotes).toHaveLength(2);
      expect(result.meta).toHaveProperty('fromCache');
      expect(result.meta).toHaveProperty('dataAge');
      expect(result.meta).toHaveProperty('completenessScore');
      expect(result.meta).toHaveProperty('warnings');
    });

    test('should handle empty trending list', async () => {
      const mockTrending = {
        quotes: []
      };

      mockClient.getTrending.mockResolvedValue(mockTrending);

      const result = await tools.getTrendingSymbols({ region: 'US' });

      expect(result.meta.warnings).toContain('No trending symbols returned');
      expect(result.meta.completenessScore).toBe(0);
    });

    test('should respect limit parameter', async () => {
      const mockTrending = {
        quotes: Array.from({ length: 20 }, (_, i) => ({
          symbol: `SYMBOL${i}`,
          name: `Stock ${i}`
        }))
      };

      mockClient.getTrending.mockResolvedValue(mockTrending);

      const result = await tools.getTrendingSymbols({ limit: 5 });

      expect(result.trending.quotes).toHaveLength(5);
    });

    test('should throw error on client failure', async () => {
      mockClient.getTrending.mockRejectedValue(new Error('Network error'));

      await expect(tools.getTrendingSymbols({ region: 'US' })).rejects.toThrow('Failed to fetch trending symbols');
    });
  });

  describe('screener', () => {
    test('should screen stocks successfully', async () => {
      const mockScreener = {
        finance: {
          result: [
            {
              quotes: [
                { symbol: 'AAPL', lastPrice: 150, volume: 50000000, marketCap: 2500000000000 },
                { symbol: 'MSFT', lastPrice: 300, volume: 30000000, marketCap: 2800000000000 }
              ]
            }
          ]
        }
      };

      mockClient.screener.mockResolvedValue(mockScreener);

      const result = await tools.screener({
        filters: { sector: 'Technology' },
        limit: 25
      });

      expect(result).toHaveProperty('screened');
      expect(result).toHaveProperty('meta');
      expect(result.meta).toHaveProperty('fromCache');
      expect(result.meta).toHaveProperty('dataAge');
      expect(result.meta).toHaveProperty('completenessScore');
      expect(result.meta).toHaveProperty('warnings');
    });

    test('should validate filters', async () => {
      await expect(
        tools.screener({
          filters: { invalidField: 'value' },
          validateFilters: true
        })
      ).rejects.toThrow('Invalid screener filters');
    });

    test('should skip validation when requested', async () => {
      const mockScreener = {
        finance: {
          result: [
            {
              quotes: []
            }
          ]
        }
      };

      mockClient.screener.mockResolvedValue(mockScreener);

      await expect(
        tools.screener({
          filters: { invalidField: 'value' },
          validateFilters: false
        })
      ).resolves.toBeDefined();
    });

    test('should handle screener errors', async () => {
      const mockScreener = {
        finance: {
          error: {
            description: 'Invalid filter'
          }
        }
      };

      mockClient.screener.mockResolvedValue(mockScreener);

      const result = await tools.screener({
        filters: { sector: 'Technology' }
      });

      expect(result.meta.warnings).toContain('Screener error: Invalid filter');
    });

    test('should throw error on client failure', async () => {
      mockClient.screener.mockRejectedValue(new Error('Network error'));

      await expect(
        tools.screener({
          filters: { sector: 'Technology' }
        })
      ).rejects.toThrow('Failed to fetch screener results');
    });
  });

  describe('getTools', () => {
    test('should return all summary tools', () => {
      const toolList = tools.getTools();

      expect(toolList).toHaveLength(5);
      expect(toolList[0].name).toBe('get_summary_profile');
      expect(toolList[1].name).toBe('get_crypto_quote');
      expect(toolList[2].name).toBe('get_forex_quote');
      expect(toolList[3].name).toBe('get_trending_symbols');
      expect(toolList[4].name).toBe('screener');
    });

    test('should have proper tool schemas', () => {
      const toolList = tools.getTools();

      toolList.forEach(tool => {
        expect(tool).toHaveProperty('name');
        expect(tool).toHaveProperty('description');
        expect(tool).toHaveProperty('inputSchema');
        expect(tool.inputSchema).toHaveProperty('type', 'object');
        expect(tool.inputSchema).toHaveProperty('properties');
      });
    });

    test('should have required fields in schemas', () => {
      const toolList = tools.getTools();

      toolList.forEach(tool => {
        if (tool.name === 'get_summary_profile') {
          expect(tool.inputSchema.required).toContain('symbol');
        } else if (tool.name === 'get_crypto_quote') {
          expect(tool.inputSchema.required).toContain('symbols');
        } else if (tool.name === 'get_forex_quote') {
          expect(tool.inputSchema.required).toContain('pairs');
        } else if (tool.name === 'screener') {
          expect(tool.inputSchema.required).toContain('filters');
        }
      });
    });
  });
});
