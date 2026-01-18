import { HistoricalTools } from '../../../src/tools/historical';
import { YahooFinanceClient } from '../../../src/services/yahoo-finance';

describe('HistoricalTools', () => {
  let tools: HistoricalTools;
  let mockClient: jest.Mocked<YahooFinanceClient>;

  beforeEach(() => {
    mockClient = {
      getHistorical: jest.fn()
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

    tools = new HistoricalTools(mockClient, config);
  });

  describe('getHistorical', () => {
    test('should get historical data with period', async () => {
      const mockHistorical = {
        meta: { currency: 'USD', symbol: 'AAPL' },
        indicators: { quote: [{ close: [150, 152, 148] }] },
        timestamp: [1234567890, 1234567950, 1234568010]
      };

      mockClient.getHistorical.mockResolvedValue(mockHistorical);

      const result = await tools.getHistorical({ symbol: 'AAPL', period: '1mo', interval: '1d' });

      expect(result).toHaveProperty('symbol', 'AAPL');
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('meta');
    });

    test('should get historical data with date range', async () => {
      const mockHistorical = {
        meta: { currency: 'USD', symbol: 'AAPL' },
        indicators: { quote: [{ close: [150] }] },
        timestamp: [1234567890]
      };

      mockClient.getHistorical.mockResolvedValue(mockHistorical);

      const result = await tools.getHistorical({
        symbol: 'AAPL',
        startDate: '2024-01-01',
        endDate: '2024-01-31',
        interval: '1d'
      });

      expect(result).toHaveProperty('symbol', 'AAPL');
    });

    test('should handle client error', async () => {
      mockClient.getHistorical.mockRejectedValue(new Error('Network error'));

      await expect(
        tools.getHistorical({ symbol: 'AAPL', period: '1mo', interval: '1d' })
      ).rejects.toThrow();
    });
  });

  describe('getTools', () => {
    test('should return historical tools', () => {
      const toolList = tools.getTools();

      expect(toolList).toHaveLength(1);
      expect(toolList[0].name).toBe('get_historical');
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
