import { AnalysisTools } from '../../../src/tools/analysis';
import { YahooFinanceClient } from '../../../src/services/yahoo-finance';

describe('AnalysisTools', () => {
  let tools: AnalysisTools;
  let mockClient: jest.Mocked<YahooFinanceClient>;

  beforeEach(() => {
    mockClient = {
      getAnalysis: jest.fn()
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

    tools = new AnalysisTools(mockClient, config);
  });

  describe('getAnalysis', () => {
    test('should get analysis successfully', async () => {
      const mockAnalysis = {
        earningsTrend: {
          trend: [
            {
              period: '0m',
              growth: { raw: 5.2 },
              earningsEstimate: { avg: { raw: 2.25 } }
            }
          ]
        },
        industryTrend: { trend: [] },
        financials: {
          year: [
            {
              earningsEstimate: { avg: { raw: 10.5 } },
              revenueEstimate: { avg: { raw: 400000000000 } }
            }
          ]
        }
      };

      mockClient.getAnalysis.mockResolvedValue(mockAnalysis);

      const result = await tools.getAnalysis({ symbol: 'AAPL' });

      expect(result).toHaveProperty('symbol', 'AAPL');
      expect(result).toHaveProperty('analysis');
      expect(result).toHaveProperty('meta');
    });

    test('should handle empty analysis', async () => {
      const mockAnalysis = {
        earningsTrend: { trend: [] },
        industryTrend: { trend: [] },
        financials: { year: [] }
      };

      mockClient.getAnalysis.mockResolvedValue(mockAnalysis);

      const result = await tools.getAnalysis({ symbol: 'AAPL' });

      expect(result.analysis).toBeDefined();
    });

    test('should handle client error', async () => {
      mockClient.getAnalysis.mockRejectedValue(new Error('Network error'));

      await expect(tools.getAnalysis({ symbol: 'AAPL' })).rejects.toThrow();
    });
  });

  describe('getTools', () => {
    test('should return analysis tools', () => {
      const toolList = tools.getTools();

      expect(toolList).toHaveLength(1);
      expect(toolList[0].name).toBe('get_analysis');
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
