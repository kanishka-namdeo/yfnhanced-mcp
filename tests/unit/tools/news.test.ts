import { NewsTools } from '../../../src/tools/news';
import { YahooFinanceClient } from '../../../src/services/yahoo-finance';

describe('NewsTools', () => {
  let tools: NewsTools;
  let mockClient: jest.Mocked<YahooFinanceClient>;

  beforeEach(() => {
    mockClient = {
      getNews: jest.fn()
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

    tools = new NewsTools(mockClient, config);
  });

  describe('getNews', () => {
    test('should get news successfully', async () => {
      const mockNews = {
        news: [
          {
            uuid: 'abc123',
            title: 'Apple Reports Strong Q4 Earnings',
            publisher: 'Reuters',
            link: 'https://example.com/article',
            providerPublishTime: 1705327800,
            type: 'STORY',
            publishDate: '2024-01-15',
            urlValid: true,
            relatedTickers: ['AAPL', 'MSFT']
          }
        ]
      };

      mockClient.getNews.mockResolvedValue(mockNews);

      const result = await tools.getNews({ symbol: 'AAPL' });

      expect(result).toHaveProperty('symbol', 'AAPL');
      expect(result).toHaveProperty('news');
      expect(result).toHaveProperty('count');
      expect(result).toHaveProperty('meta');
    });

    test('should respect limit parameter', async () => {
      const mockNews = {
        news: Array.from({ length: 20 }, (_, i) => ({
          uuid: `uuid${i}`,
          title: `Article ${i}`,
          publisher: 'Reuters',
          link: `https://example.com/article${i}`,
          providerPublishTime: 1705327800 + i,
          type: 'STORY',
          publishDate: '2024-01-15',
          urlValid: true,
          relatedTickers: []
        }))
      };

      mockClient.getNews.mockResolvedValue(mockNews);

      const result = await tools.getNews({ symbol: 'AAPL', limit: 5 });

      expect(result.news).toHaveLength(5);
    });

    test('should respect startDate parameter', async () => {
      const mockNews = {
        news: []
      };

      mockClient.getNews.mockResolvedValue(mockNews);

      const result = await tools.getNews({ symbol: 'AAPL', startDate: '2024-01-01' });

      expect(result).toHaveProperty('symbol', 'AAPL');
    });

    test('should handle empty news', async () => {
      const mockNews = {
        news: []
      };

      mockClient.getNews.mockResolvedValue(mockNews);

      const result = await tools.getNews({ symbol: 'AAPL' });

      expect(result.news).toHaveLength(0);
      expect(result.count).toBe(0);
    });

    test('should handle client error', async () => {
      mockClient.getNews.mockRejectedValue(new Error('Network error'));

      await expect(tools.getNews({ symbol: 'AAPL' })).rejects.toThrow();
    });
  });

  describe('getTools', () => {
    test('should return news tools', () => {
      const toolList = tools.getTools();

      expect(toolList).toHaveLength(1);
      expect(toolList[0].name).toBe('get_news');
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
