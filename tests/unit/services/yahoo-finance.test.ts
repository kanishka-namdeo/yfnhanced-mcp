import { YahooFinanceClient } from '../../../src/services/yahoo-finance';

describe('YahooFinanceClient', () => {
  let client: YahooFinanceClient;

  beforeEach(() => {
    jest.useFakeTimers();
    client = new YahooFinanceClient({
      serverInfo: {
        name: 'Test Server',
        version: '1.0.0',
        protocolVersion: '1.0'
      },
      capabilities: {},
      transport: 'stdio',
      rateLimit: {
        strategy: 'token-bucket',
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
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('should initialize with config', () => {
    expect(client).toBeInstanceOf(YahooFinanceClient);
    expect(client.isInitialized()).toBe(false);
  });

  test('should initialize on call', async () => {
    await client.initialize();
    expect(client.isInitialized()).toBe(true);
  });

  test('should not reinitialize if already initialized', async () => {
    await client.initialize();
    const initSpy = jest.spyOn(client as any, 'warmCache');
    await client.initialize();
    expect(initSpy).not.toHaveBeenCalled();
  });

  test('should shutdown successfully', async () => {
    await client.initialize();
    await client.shutdown();
    expect(client.isInitialized()).toBe(false);
  });

  test('should validate quote data', () => {
    const mockData = {
      price: {
        regularMarketPrice: 150.5,
        regularMarketChange: 2.5,
        regularMarketChangePercent: 1.69,
        regularMarketPreviousClose: 148,
        regularMarketVolume: 50000000
      }
    };

    const result = client['validateQuote'](mockData);
    expect(result).toBeDefined();
    expect(result.price?.regularMarketPrice).toBe(150.5);
  });

  test('should throw error for invalid quote', () => {
    const mockData = null;
    expect(() => client['validateQuote'](mockData)).toThrow();
  });

  test('should validate historical data', () => {
    const mockData = {
      meta: { currency: 'USD', symbol: 'AAPL' },
      indicators: { quote: [0] },
      timestamp: [1234567890]
    };

    const result = client['validateHistorical'](mockData);
    expect(result).toBeDefined();
    expect(result.meta).toBeDefined();
    expect(result.indicators).toBeDefined();
  });

  test('should throw error for invalid historical data', () => {
    const mockData = { meta: null, indicators: null };
    expect(() => client['validateHistorical'](mockData)).toThrow();
  });

  test('should validate financials data', () => {
    const mockData = {
      balanceSheetHistory: { quarterly: [], annual: [] },
      incomeStatementHistory: { quarterly: [], annual: [] }
    };

    const result = client['validateFinancials'](mockData);
    expect(result).toBeDefined();
  });

  test('should throw error for invalid financials data', () => {
    const mockData = null;
    expect(() => client['validateFinancials'](mockData)).toThrow();
  });

  test('should validate earnings data', () => {
    const mockData = {
      earningsChart: { quarterly: [] },
      earnings: { currentQuarterEstimate: 2.5 }
    };

    const result = client['validateEarnings'](mockData);
    expect(result).toBeDefined();
  });

  test('should validate analysis data', () => {
    const mockData = {
      earningsTrend: { trend: [] },
      industryTrend: { trend: [] }
    };

    const result = client['validateAnalysis'](mockData);
    expect(result).toBeDefined();
  });

  test('should validate news data', () => {
    const mockData = {
      news: [
        {
          uuid: '123',
          title: 'Test News',
          providerPublishTime: 1234567890
        }
      ]
    };

    const result = client['validateNews'](mockData);
    expect(result).toBeDefined();
  });

  test('should validate options data', () => {
    const mockData = {
      optionChain: { result: [] }
    };

    const result = client['validateOptions'](mockData);
    expect(result).toBeDefined();
  });

  test('should validate summary profile data', () => {
    const mockData = {
      assetProfile: {
        address1: 'One Apple Park Way',
        city: 'Cupertino',
        state: 'CA'
      }
    };

    const result = client['validateSummaryProfile'](mockData);
    expect(result).toBeDefined();
  });

  test('should validate crypto quote data', () => {
    const mockData = {
      regularMarketPrice: 50000,
      regularMarketVolume: 1000000000
    };

    const result = client['validateCryptoQuote'](mockData);
    expect(result).toBeDefined();
  });

  test('should validate forex quote data', () => {
    const mockData = {
      regularMarketPrice: 1.08,
      regularMarketVolume: 1000000
    };

    const result = client['validateForexQuote'](mockData);
    expect(result).toBeDefined();
  });

  test('should validate trending data', () => {
    const mockData = {
      quotes: [
        { symbol: 'AAPL', name: 'Apple Inc.' }
      ]
    };

    const result = client['validateTrending'](mockData);
    expect(result).toBeDefined();
  });

  test('should validate screener data', () => {
    const mockData = {
      finance: {
        result: [
          { symbol: 'AAPL', name: 'Apple Inc.' }
        ]
      }
    };

    const result = client['validateScreener'](mockData);
    expect(result).toBeDefined();
  });

  test('should detect API changes', () => {
    const mockData = { unexpectedField: 'value' };
    const hasChanged = client['detectAPIChanges'](mockData);
    expect(hasChanged).toBe(true);
  });

  test('should not detect API changes for known structure', () => {
    const mockData = {
      price: { regularMarketPrice: 150 },
      meta: { currency: 'USD' }
    };
    const hasChanged = client['detectAPIChanges'](mockData);
    expect(hasChanged).toBe(false);
  });

  test('should handle API change', () => {
    const mockData = { price: 150 };
    expect(() => client['handleAPIChange']('quote', mockData)).toThrow();
  });

  test('should try alternative endpoint', async () => {
    const result = await client['tryAlternativeEndpoint']('AAPL', 'quote');
    expect(result).toBeDefined();
  });

  test('should get fallback data', () => {
    client['fallbackCache'].set('fallback:AAPL', { price: 150 });
    const result = client['getFallbackData']('AAPL');
    expect(result).toEqual({ price: 150 });
  });

  test('should return null for non-existent fallback data', () => {
    const result = client['getFallbackData']('NONEXISTENT');
    expect(result).toBeNull();
  });

  test('should combine live and cached data', () => {
    const liveData = { price: 150, volume: null };
    const cachedData = { price: 148, volume: 50000000 };

    const result = client['combineWithCache'](liveData, cachedData);
    expect(result.price).toBe(150);
    expect(result.volume).toBe(50000000);
  });

  test('should return live data when cache is null', () => {
    const liveData = { price: 150, volume: 50000000 };
    const result = client['combineWithCache'](liveData, null);
    expect(result).toEqual(liveData);
  });

  test('should return cached data when live is null', () => {
    const cachedData = { price: 150, volume: 50000000 };
    const result = client['combineWithCache'](null, cachedData);
    expect(result).toEqual(cachedData);
  });

  test('should get stats', () => {
    const stats = client.getStats();
    expect(stats).toHaveProperty('rateLimiter');
    expect(stats).toHaveProperty('circuitBreaker');
    expect(stats).toHaveProperty('cache');
  });

  test('should get rate limiter stats', () => {
    const stats = client.getStats().rateLimiter;
    expect(stats).toHaveProperty('tokens');
    expect(stats).toHaveProperty('concurrentRequests');
    expect(stats).toHaveProperty('minuteCount');
    expect(stats).toHaveProperty('hourCount');
  });

  test('should get circuit breaker stats', () => {
    const stats = client.getStats().circuitBreaker;
    expect(stats).toHaveProperty('state');
    expect(stats).toHaveProperty('failureCount');
    expect(stats).toHaveProperty('successCount');
  });

  test('should get cache stats', () => {
    const stats = client.getStats().cache;
    expect(stats).toHaveProperty('hits');
    expect(stats).toHaveProperty('misses');
    expect(stats).toHaveProperty('hitRate');
  });

  test('should handle missing quote fields gracefully', () => {
    const mockData = {
      price: {
        regularMarketPrice: 150,
        regularMarketChange: null
      }
    };

    const result = client['validateQuote'](mockData);
    expect(result.price?.regularMarketChange).toBeNull();
  });
});
