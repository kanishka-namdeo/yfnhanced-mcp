import { FinancialsTools } from '../../../src/tools/financials';
import { YahooFinanceClient } from '../../../src/services/yahoo-finance';

describe('FinancialsTools', () => {
  let tools: FinancialsTools;
  let mockClient: jest.Mocked<YahooFinanceClient>;

  beforeEach(() => {
    mockClient = {
      getFinancials: jest.fn()
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

    tools = new FinancialsTools(mockClient, config);
  });

  describe('getFinancials', () => {
    test('should get income statement successfully', async () => {
      const mockFinancials = {
        balanceSheetHistory: { quarterly: [], annual: [] },
        incomeStatementHistory: {
          quarterly: [{ symbol: 'AAPL', date: '2024-01-15', data: { totalRevenue: 394328000000 } }],
          annual: []
        },
        cashflowStatementHistory: { quarterly: [], annual: [] }
      };

      mockClient.getFinancials.mockResolvedValue(mockFinancials);

      const result = await tools.getFinancials({
        symbol: 'AAPL',
        statementType: 'income-statement',
        periodType: 'quarterly'
      });

      expect(result).toHaveProperty('symbol', 'AAPL');
      expect(result).toHaveProperty('statementType', 'income-statement');
      expect(result).toHaveProperty('periodType', 'quarterly');
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('meta');
    });

    test('should get balance sheet successfully', async () => {
      const mockFinancials = {
        balanceSheetHistory: {
          quarterly: [{ symbol: 'AAPL', date: '2024-01-15', data: {} }],
          annual: []
        },
        incomeStatementHistory: { quarterly: [], annual: [] },
        cashflowStatementHistory: { quarterly: [], annual: [] }
      };

      mockClient.getFinancials.mockResolvedValue(mockFinancials);

      const result = await tools.getFinancials({
        symbol: 'AAPL',
        statementType: 'balance-sheet',
        periodType: 'quarterly'
      });

      expect(result).toHaveProperty('symbol', 'AAPL');
      expect(result).toHaveProperty('statementType', 'balance-sheet');
    });

    test('should get cash flow successfully', async () => {
      const mockFinancials = {
        balanceSheetHistory: { quarterly: [], annual: [] },
        incomeStatementHistory: { quarterly: [], annual: [] },
        cashflowStatementHistory: {
          quarterly: [{ symbol: 'AAPL', date: '2024-01-15', data: {} }],
          annual: []
        }
      };

      mockClient.getFinancials.mockResolvedValue(mockFinancials);

      const result = await tools.getFinancials({
        symbol: 'AAPL',
        statementType: 'cash-flow',
        periodType: 'quarterly'
      });

      expect(result).toHaveProperty('symbol', 'AAPL');
      expect(result).toHaveProperty('statementType', 'cash-flow');
    });

    test('should respect count parameter', async () => {
      const mockFinancials = {
        balanceSheetHistory: { quarterly: [], annual: [] },
        incomeStatementHistory: {
          quarterly: [
            { symbol: 'AAPL', date: '2024-01-15', data: {} },
            { symbol: 'AAPL', date: '2023-10-15', data: {} },
            { symbol: 'AAPL', date: '2023-07-15', data: {} }
          ],
          annual: []
        },
        cashflowStatementHistory: { quarterly: [], annual: [] }
      };

      mockClient.getFinancials.mockResolvedValue(mockFinancials);

      const result = await tools.getFinancials({
        symbol: 'AAPL',
        statementType: 'income-statement',
        periodType: 'quarterly',
        count: 2
      });

      expect(result.data.statements).toHaveLength(2);
    });

    test('should handle client error', async () => {
      mockClient.getFinancials.mockRejectedValue(new Error('Network error'));

      await expect(
        tools.getFinancials({
          symbol: 'AAPL',
          statementType: 'income-statement',
          periodType: 'quarterly'
        })
      ).rejects.toThrow();
    });
  });

  describe('getTools', () => {
    test('should return financials tools', () => {
      const toolList = tools.getTools();

      expect(toolList).toHaveLength(1);
      expect(toolList[0].name).toBe('get_financials');
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
