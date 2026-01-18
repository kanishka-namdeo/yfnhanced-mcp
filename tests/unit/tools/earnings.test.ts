import { EarningsTools } from '../../../src/tools/earnings';
import { YahooFinanceClient } from '../../../src/services/yahoo-finance';

describe('EarningsTools', () => {
  let tools: EarningsTools;
  let mockClient: jest.Mocked<YahooFinanceClient>;

  beforeEach(() => {
    mockClient = {
      getEarnings: jest.fn()
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

    tools = new EarningsTools(mockClient, config);
  });

  describe('getEarnings', () => {
    test('should get earnings successfully', async () => {
      const mockEarnings = {
        earningsChart: {
          quarterly: [
            {
              date: '2024-01-15',
              actual: { raw: 2.18 },
              estimate: { raw: 2.10 }
            }
          ]
        },
        earnings: {
          currentQuarterEstimate: { raw: 2.25 },
          nextQuarterEstimate: { raw: 2.30 }
        }
      };

      mockClient.getEarnings.mockResolvedValue(mockEarnings);

      const result = await tools.getEarnings({ symbol: 'AAPL' });

      expect(result).toHaveProperty('symbol', 'AAPL');
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('meta');
      expect(result.data).toHaveProperty('quarterly');
      expect(result.data).toHaveProperty('currentQuarterEstimate');
      expect(result.data).toHaveProperty('nextQuarterEstimate');
    });

    test('should handle empty earnings', async () => {
      const mockEarnings = {
        earningsChart: { quarterly: [] },
        earnings: {
          currentQuarterEstimate: { raw: 2.25 },
          nextQuarterEstimate: { raw: 2.30 }
        }
      };

      mockClient.getEarnings.mockResolvedValue(mockEarnings);

      const result = await tools.getEarnings({ symbol: 'AAPL' });

      expect(result.data.quarterly).toHaveLength(0);
    });

    test('should handle client error', async () => {
      mockClient.getEarnings.mockRejectedValue(new Error('Network error'));

      await expect(tools.getEarnings({ symbol: 'AAPL' })).rejects.toThrow();
    });
  });

  describe('getTools', () => {
    test('should return earnings tools', () => {
      const toolList = tools.getTools();

      expect(toolList).toHaveLength(1);
      expect(toolList[0].name).toBe('get_earnings');
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
