import { QuotesTools } from '../../../src/tools/quotes';
import { YahooFinanceClient } from '../../../src/services/yahoo-finance';

describe('QuotesTools', () => {
  let tools: QuotesTools;
  let mockClient: jest.Mocked<YahooFinanceClient>;

  beforeEach(() => {
    mockClient = {
      getQuote: jest.fn(),
      getBatchQuotes: jest.fn()
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

    tools = new QuotesTools(mockClient, config);
  });

  describe('getQuote', () => {
    test('should get single quote successfully', async () => {
      const mockQuote = {
        price: { regularMarketPrice: 150.5, regularMarketChange: 2.5, regularMarketChangePercent: 1.69 }
      };

      mockClient.getQuote.mockResolvedValue(mockQuote);

      const result = await tools.getQuote({ symbol: 'AAPL' });

      expect(result).toHaveProperty('symbol', 'AAPL');
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('meta');
    });

    test('should handle client error', async () => {
      mockClient.getQuote.mockRejectedValue(new Error('Network error'));

      await expect(tools.getQuote({ symbol: 'AAPL' })).rejects.toThrow();
    });
  });

  describe('getBatchQuotes', () => {
    test('should get batch quotes successfully', async () => {
      const mockQuotes = [
        { price: { regularMarketPrice: 150.5 } },
        { price: { regularMarketPrice: 300.25 } }
      ];

      mockClient.getBatchQuotes.mockResolvedValue(mockQuotes);

      const result = await tools.getBatchQuotes({ symbols: ['AAPL', 'MSFT'] });

      expect(result).toHaveProperty('data');
      expect(result.data).toHaveLength(2);
      expect(result).toHaveProperty('meta');
    });

    test('should handle empty symbols array', async () => {
      mockClient.getBatchQuotes.mockResolvedValue([]);

      const result = await tools.getBatchQuotes({ symbols: [] });

      expect(result.data).toHaveLength(0);
    });

    test('should handle client error', async () => {
      mockClient.getBatchQuotes.mockRejectedValue(new Error('Network error'));

      await expect(tools.getBatchQuotes({ symbols: ['AAPL'] })).rejects.toThrow();
    });
  });

  describe('getTools', () => {
    test('should return all quote tools', () => {
      const toolList = tools.getTools();

      expect(toolList).toHaveLength(2);
      expect(toolList[0].name).toBe('get_quote');
      expect(toolList[1].name).toBe('get_batch_quotes');
    });

    test('should have proper tool schemas', () => {
      const toolList = tools.getTools();

      toolList.forEach(tool => {
        expect(tool).toHaveProperty('name');
        expect(tool).toHaveProperty('description');
        expect(tool).toHaveProperty('inputSchema');
      });
    });
  });
});
