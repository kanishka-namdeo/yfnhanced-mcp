import { HoldersTools } from '../../../src/tools/holders';
import { YahooFinanceClient } from '../../../src/services/yahoo-finance';

describe('HoldersTools', () => {
  let tools: HoldersTools;
  let mockClient: jest.Mocked<YahooFinanceClient>;

  beforeEach(() => {
    mockClient = {
      getHolders: jest.fn()
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

    tools = new HoldersTools(mockClient, config);
  });

  describe('getHolders', () => {
    test('should get holders successfully', async () => {
      const mockHolders = {
        majorHoldersBreakdown: {
          insidersPercentHeld: 0.05,
          institutionsPercentHeld: 0.62,
          institutionsFloatPercentHeld: 0.65,
          institutionsCount: 5000
        },
        institutionalHolders: [
          {
            holderName: 'Vanguard Group Inc',
            holderType: 'institution',
            relation: 'direct',
            lastReported: '2024-01-15',
            positionDirect: 1500000000,
            positionDirectDate: '2024-01-15',
            positionIndirect: null,
            positionIndirectDate: null,
            position: 1500000000
          }
        ],
        fundHolders: [],
        insiderHolders: [],
        directHolders: []
      };

      mockClient.getHolders.mockResolvedValue(mockHolders);

      const result = await tools.getHolders({ symbol: 'AAPL' });

      expect(result).toHaveProperty('symbol', 'AAPL');
      expect(result).toHaveProperty('majorHoldersBreakdown');
      expect(result).toHaveProperty('institutionalHolders');
      expect(result).toHaveProperty('meta');
    });

    test('should handle includeChangeHistory parameter', async () => {
      const mockHolders = {
        majorHoldersBreakdown: {
          insidersPercentHeld: 0.05,
          institutionsPercentHeld: 0.62,
          institutionsFloatPercentHeld: 0.65,
          institutionsCount: 5000
        },
        institutionalHolders: [],
        fundHolders: [],
        insiderHolders: [],
        directHolders: []
      };

      mockClient.getHolders.mockResolvedValue(mockHolders);

      const result = await tools.getHolders({ symbol: 'AAPL', includeChangeHistory: true });

      expect(result).toHaveProperty('symbol', 'AAPL');
    });

    test('should handle empty holders', async () => {
      const mockHolders = {
        majorHoldersBreakdown: {
          insidersPercentHeld: 0,
          institutionsPercentHeld: 0,
          institutionsFloatPercentHeld: 0,
          institutionsCount: 0
        },
        institutionalHolders: [],
        fundHolders: [],
        insiderHolders: [],
        directHolders: []
      };

      mockClient.getHolders.mockResolvedValue(mockHolders);

      const result = await tools.getHolders({ symbol: 'AAPL' });

      expect(result.majorHoldersBreakdown.institutionsCount).toBe(0);
    });

    test('should handle client error', async () => {
      mockClient.getHolders.mockRejectedValue(new Error('Network error'));

      await expect(tools.getHolders({ symbol: 'AAPL' })).rejects.toThrow();
    });
  });

  describe('getTools', () => {
    test('should return holders tools', () => {
      const toolList = tools.getTools();

      expect(toolList).toHaveLength(1);
      expect(toolList[0].name).toBe('get_holders');
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
