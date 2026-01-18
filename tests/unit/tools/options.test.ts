import { OptionsTools } from '../../../src/tools/options';
import { YahooFinanceClient } from '../../../src/services/yahoo-finance';

describe('OptionsTools', () => {
  let tools: OptionsTools;
  let mockClient: jest.Mocked<YahooFinanceClient>;

  beforeEach(() => {
    mockClient = {
      getOptions: jest.fn()
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

    tools = new OptionsTools(mockClient, config);
  });

  describe('getOptions', () => {
    test('should get options successfully', async () => {
      const mockOptions = {
        expirationDates: ['2024-02-16', '2024-03-15'],
        optionChain: {
          result: [
            {
              expirationDate: '2024-02-16',
              date: 1708089600,
              hasMiniOptions: false,
              calls: [
                {
                  contractSymbol: 'AAPL240216C00150000',
                  strike: 150,
                  lastPrice: 5.25,
                  change: 0.50,
                  percentChange: 10.53,
                  volume: 1000,
                  openInterest: 5000,
                  bid: 5.00,
                  ask: 5.50,
                  impliedVolatility: 0.25,
                  inTheMoney: true,
                  contractSize: 100,
                  currency: 'USD'
                }
              ],
              puts: []
            }
          ]
        }
      };

      mockClient.getOptions.mockResolvedValue(mockOptions);

      const result = await tools.getOptions({ symbol: 'AAPL' });

      expect(result).toHaveProperty('symbol', 'AAPL');
      expect(result).toHaveProperty('options');
      expect(result).toHaveProperty('expirationDates');
      expect(result).toHaveProperty('meta');
    });

    test('should get options with expiration date', async () => {
      const mockOptions = {
        expirationDates: ['2024-02-16', '2024-03-15'],
        optionChain: {
          result: [
            {
              expirationDate: '2024-02-16',
              date: 1708089600,
              hasMiniOptions: false,
              calls: [],
              puts: []
            }
          ]
        }
      };

      mockClient.getOptions.mockResolvedValue(mockOptions);

      const result = await tools.getOptions({ symbol: 'AAPL', expiration: '2024-02-16' });

      expect(result).toHaveProperty('symbol', 'AAPL');
    });

    test('should get options with optionsType', async () => {
      const mockOptions = {
        expirationDates: ['2024-02-16'],
        optionChain: {
          result: [
            {
              expirationDate: '2024-02-16',
              date: 1708089600,
              hasMiniOptions: false,
              calls: [],
              puts: []
            }
          ]
        }
      };

      mockClient.getOptions.mockResolvedValue(mockOptions);

      const result = await tools.getOptions({ symbol: 'AAPL', optionsType: 'calls' });

      expect(result).toHaveProperty('symbol', 'AAPL');
    });

    test('should get options with includeGreeks', async () => {
      const mockOptions = {
        expirationDates: ['2024-02-16'],
        optionChain: {
          result: [
            {
              expirationDate: '2024-02-16',
              date: 1708089600,
              hasMiniOptions: false,
              calls: [],
              puts: []
            }
          ]
        }
      };

      mockClient.getOptions.mockResolvedValue(mockOptions);

      const result = await tools.getOptions({ symbol: 'AAPL', includeGreeks: true });

      expect(result).toHaveProperty('symbol', 'AAPL');
    });

    test('should handle empty options', async () => {
      const mockOptions = {
        expirationDates: [],
        optionChain: { result: [] }
      };

      mockClient.getOptions.mockResolvedValue(mockOptions);

      const result = await tools.getOptions({ symbol: 'AAPL' });

      expect(result.expirationDates).toHaveLength(0);
    });

    test('should handle client error', async () => {
      mockClient.getOptions.mockRejectedValue(new Error('Network error'));

      await expect(tools.getOptions({ symbol: 'AAPL' })).rejects.toThrow();
    });
  });

  describe('getTools', () => {
    test('should return options tools', () => {
      const toolList = tools.getTools();

      expect(toolList).toHaveLength(1);
      expect(toolList[0].name).toBe('get_options');
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
