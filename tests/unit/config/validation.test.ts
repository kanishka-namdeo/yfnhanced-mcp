import { validateConfig, validateYahooFinanceConfig, validateRateLimitConfig, validateCacheConfig, validateRetryConfig, validateCircuitBreakerConfig, validateQueueConfig, validateDataCompletionConfig, validateLoggingConfig, validateNetworkConfig } from '../../../src/config/validation';

describe('validateConfig', () => {
  test('should validate valid config', () => {
    const config = {
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
      }
    };

    const result = validateConfig(config);
    expect(result.success).toBe(true);
  });

  test('should reject invalid config', () => {
    const config = {
      serverInfo: null,
      transport: 'invalid'
    };

    const result = validateConfig(config);
    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
  });

  test('should require serverInfo', () => {
    const config = {
      transport: 'stdio'
    };

    const result = validateConfig(config);
    expect(result.success).toBe(false);
  });

  test('should require transport', () => {
    const config = {
      serverInfo: { name: 'Test', version: '1.0.0' }
    };

    const result = validateConfig(config);
    expect(result.success).toBe(false);
  });

  test('should accept valid transport types', () => {
    const transports = ['stdio', 'sse', 'http'];
    transports.forEach(transport => {
      const config = {
        serverInfo: { name: 'Test', version: '1.0.0', protocolVersion: '1.0' },
        capabilities: {},
        transport
      };
      const result = validateConfig(config);
      expect(result.success).toBe(true);
    });
  });

  test('should reject invalid transport type', () => {
    const config = {
      serverInfo: { name: 'Test', version: '1.0.0', protocolVersion: '1.0' },
      capabilities: {},
      transport: 'invalid'
    };

    const result = validateConfig(config);
    expect(result.success).toBe(false);
  });

  test('should validate optional config sections', () => {
    const config = {
      serverInfo: { name: 'Test', version: '1.0.0', protocolVersion: '1.0' },
      capabilities: {},
      transport: 'stdio'
    };

    const result = validateConfig(config);
    expect(result.success).toBe(true);
  });

  test('should return validation errors', () => {
    const config = {
      serverInfo: null,
      transport: 'invalid',
      rateLimit: null
    };

    const result = validateConfig(config);
    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe('validateYahooFinanceConfig', () => {
  test('should validate valid Yahoo Finance config', () => {
    const config = {
      baseUrl: 'https://query1.finance.yahoo.com',
      timeoutMs: 30000,
      userAgent: 'Mozilla/5.0',
      maxConcurrentRequests: 5,
      requestQueueSize: 100,
      validateResponses: true,
      strictMode: false
    };

    const result = validateYahooFinanceConfig(config);
    expect(result.success).toBe(true);
  });

  test('should reject invalid baseUrl', () => {
    const config = {
      baseUrl: 'not-a-url'
    };

    const result = validateYahooFinanceConfig(config);
    expect(result.success).toBe(false);
  });

  test('should reject negative timeout', () => {
    const config = {
      timeoutMs: -1000
    };

    const result = validateYahooFinanceConfig(config);
    expect(result.success).toBe(false);
  });

  test('should reject zero maxConcurrentRequests', () => {
    const config = {
      maxConcurrentRequests: 0
    };

    const result = validateYahooFinanceConfig(config);
    expect(result.success).toBe(false);
  });

  test('should reject negative requestQueueSize', () => {
    const config = {
      requestQueueSize: -10
    };

    const result = validateYahooFinanceConfig(config);
    expect(result.success).toBe(false);
  });
});

describe('validateRateLimitConfig', () => {
  test('should validate valid rate limit config', () => {
    const config = {
      strategy: 'token-bucket',
      maxRequests: 10,
      windowMs: 60000,
      tokenRefillRate: 1
    };

    const result = validateRateLimitConfig(config);
    expect(result.success).toBe(true);
  });

  test('should reject invalid strategy', () => {
    const config = {
      strategy: 'invalid'
    };

    const result = validateRateLimitConfig(config);
    expect(result.success).toBe(false);
  });

  test('should reject negative maxRequests', () => {
    const config = {
      maxRequests: -10
    };

    const result = validateRateLimitConfig(config);
    expect(result.success).toBe(false);
  });

  test('should reject zero maxRequests', () => {
    const config = {
      maxRequests: 0
    };

    const result = validateRateLimitConfig(config);
    expect(result.success).toBe(false);
  });

  test('should reject negative windowMs', () => {
    const config = {
      windowMs: -1000
    };

    const result = validateRateLimitConfig(config);
    expect(result.success).toBe(false);
  });

  test('should reject negative tokenRefillRate', () => {
    const config = {
      tokenRefillRate: -1
    };

    const result = validateRateLimitConfig(config);
    expect(result.success).toBe(false);
  });

  test('should accept token-bucket strategy', () => {
    const config = {
      strategy: 'token-bucket',
      maxRequests: 10,
      windowMs: 60000,
      tokenRefillRate: 1
    };

    const result = validateRateLimitConfig(config);
    expect(result.success).toBe(true);
  });

  test('should accept fixed-window strategy', () => {
    const config = {
      strategy: 'fixed-window',
      maxRequests: 10,
      windowMs: 60000
    };

    const result = validateRateLimitConfig(config);
    expect(result.success).toBe(true);
  });

  test('should accept sliding-window strategy', () => {
    const config = {
      strategy: 'sliding-window',
      maxRequests: 10,
      windowMs: 60000
    };

    const result = validateRateLimitConfig(config);
    expect(result.success).toBe(true);
  });
});

describe('validateCacheConfig', () => {
  test('should validate valid cache config', () => {
    const config = {
      enabled: true,
      store: 'memory',
      ttl: 60000,
      maxEntries: 100
    };

    const result = validateCacheConfig(config);
    expect(result.success).toBe(true);
  });

  test('should reject invalid store type', () => {
    const config = {
      store: 'invalid'
    };

    const result = validateCacheConfig(config);
    expect(result.success).toBe(false);
  });

  test('should reject negative ttl', () => {
    const config = {
      ttl: -1000
    };

    const result = validateCacheConfig(config);
    expect(result.success).toBe(false);
  });

  test('should reject negative maxEntries', () => {
    const config = {
      maxEntries: -10
    };

    const result = validateCacheConfig(config);
    expect(result.success).toBe(false);
  });

  test('should reject zero maxEntries', () => {
    const config = {
      maxEntries: 0
    };

    const result = validateCacheConfig(config);
    expect(result.success).toBe(false);
  });

  test('should accept memory store', () => {
    const config = {
      store: 'memory'
    };

    const result = validateCacheConfig(config);
    expect(result.success).toBe(true);
  });

  test('should accept redis store', () => {
    const config = {
      store: 'redis',
      host: 'localhost',
      port: 6379
    };

    const result = validateCacheConfig(config);
    expect(result.success).toBe(true);
  });

  test('should reject redis without host', () => {
    const config = {
      store: 'redis',
      port: 6379
    };

    const result = validateCacheConfig(config);
    expect(result.success).toBe(false);
  });
});

describe('validateRetryConfig', () => {
  test('should validate valid retry config', () => {
    const config = {
      enabled: true,
      maxRetries: 3,
      initialDelayMs: 1000,
      maxDelayMs: 10000,
      strategy: 'exponential',
      backoffMultiplier: 2,
      jitter: false,
      retryableStatusCodes: [429, 500],
      retryableErrorCodes: ['ECONNRESET']
    };

    const result = validateRetryConfig(config);
    expect(result.success).toBe(true);
  });

  test('should reject negative maxRetries', () => {
    const config = {
      maxRetries: -1
    };

    const result = validateRetryConfig(config);
    expect(result.success).toBe(false);
  });

  test('should reject negative initialDelayMs', () => {
    const config = {
      initialDelayMs: -1000
    };

    const result = validateRetryConfig(config);
    expect(result.success).toBe(false);
  });

  test('should reject maxDelayMs less than initialDelayMs', () => {
    const config = {
      initialDelayMs: 10000,
      maxDelayMs: 5000
    };

    const result = validateRetryConfig(config);
    expect(result.success).toBe(false);
  });

  test('should reject invalid strategy', () => {
    const config = {
      strategy: 'invalid'
    };

    const result = validateRetryConfig(config);
    expect(result.success).toBe(false);
  });

  test('should reject negative backoffMultiplier', () => {
    const config = {
      backoffMultiplier: -1
    };

    const result = validateRetryConfig(config);
    expect(result.success).toBe(false);
  });

  test('should accept exponential strategy', () => {
    const config = {
      strategy: 'exponential',
      maxRetries: 3,
      initialDelayMs: 1000
    };

    const result = validateRetryConfig(config);
    expect(result.success).toBe(true);
  });

  test('should accept linear strategy', () => {
    const config = {
      strategy: 'linear',
      maxRetries: 3,
      initialDelayMs: 1000
    };

    const result = validateRetryConfig(config);
    expect(result.success).toBe(true);
  });

  test('should accept fixed strategy', () => {
    const config = {
      strategy: 'fixed',
      maxRetries: 3,
      retryDelayMs: 2000
    };

    const result = validateRetryConfig(config);
    expect(result.success).toBe(true);
  });
});

describe('validateCircuitBreakerConfig', () => {
  test('should validate valid circuit breaker config', () => {
    const config = {
      enabled: true,
      timeoutMs: 60000,
      errorThresholdPercentage: 5,
      resetTimeoutMs: 60000,
      rollingCountBuckets: 60,
      rollingCountTimeoutMs: 60000,
      volumeThreshold: 5,
      halfOpenMaxAttempts: 3
    };

    const result = validateCircuitBreakerConfig(config);
    expect(result.success).toBe(true);
  });

  test('should reject negative timeoutMs', () => {
    const config = {
      timeoutMs: -1000
    };

    const result = validateCircuitBreakerConfig(config);
    expect(result.success).toBe(false);
  });

  test('should reject errorThresholdPercentage out of range', () => {
    const config = {
      errorThresholdPercentage: 150
    };

    const result = validateCircuitBreakerConfig(config);
    expect(result.success).toBe(false);
  });

  test('should reject negative errorThresholdPercentage', () => {
    const config = {
      errorThresholdPercentage: -10
    };

    const result = validateCircuitBreakerConfig(config);
    expect(result.success).toBe(false);
  });

  test('should reject negative resetTimeoutMs', () => {
    const config = {
      resetTimeoutMs: -1000
    };

    const result = validateCircuitBreakerConfig(config);
    expect(result.success).toBe(false);
  });

  test('should reject zero rollingCountBuckets', () => {
    const config = {
      rollingCountBuckets: 0
    };

    const result = validateCircuitBreakerConfig(config);
    expect(result.success).toBe(false);
  });

  test('should reject negative volumeThreshold', () => {
    const config = {
      volumeThreshold: -5
    };

    const result = validateCircuitBreakerConfig(config);
    expect(result.success).toBe(false);
  });

  test('should reject zero halfOpenMaxAttempts', () => {
    const config = {
      halfOpenMaxAttempts: 0
    };

    const result = validateCircuitBreakerConfig(config);
    expect(result.success).toBe(false);
  });
});

describe('validateQueueConfig', () => {
  test('should validate valid queue config', () => {
    const config = {
      enabled: true,
      maxSize: 100,
      strategy: 'fifo',
      concurrency: 5,
      timeoutMs: 30000,
      processingTimeoutMs: 60000
    };

    const result = validateQueueConfig(config);
    expect(result.success).toBe(true);
  });

  test('should reject invalid strategy', () => {
    const config = {
      strategy: 'invalid'
    };

    const result = validateQueueConfig(config);
    expect(result.success).toBe(false);
  });

  test('should reject negative maxSize', () => {
    const config = {
      maxSize: -10
    };

    const result = validateQueueConfig(config);
    expect(result.success).toBe(false);
  });

  test('should reject zero maxSize', () => {
    const config = {
      maxSize: 0
    };

    const result = validateQueueConfig(config);
    expect(result.success).toBe(false);
  });

  test('should reject negative concurrency', () => {
    const config = {
      concurrency: -5
    };

    const result = validateQueueConfig(config);
    expect(result.success).toBe(false);
  });

  test('should reject zero concurrency', () => {
    const config = {
      concurrency: 0
    };

    const result = validateQueueConfig(config);
    expect(result.success).toBe(false);
  });

  test('should reject negative timeoutMs', () => {
    const config = {
      timeoutMs: -1000
    };

    const result = validateQueueConfig(config);
    expect(result.success).toBe(false);
  });

  test('should reject negative processingTimeoutMs', () => {
    const config = {
      processingTimeoutMs: -1000
    };

    const result = validateQueueConfig(config);
    expect(result.success).toBe(false);
  });

  test('should accept fifo strategy', () => {
    const config = {
      strategy: 'fifo',
      maxSize: 100,
      concurrency: 5
    };

    const result = validateQueueConfig(config);
    expect(result.success).toBe(true);
  });

  test('should accept lifo strategy', () => {
    const config = {
      strategy: 'lifo',
      maxSize: 100,
      concurrency: 5
    };

    const result = validateQueueConfig(config);
    expect(result.success).toBe(true);
  });

  test('should accept priority strategy', () => {
    const config = {
      strategy: 'priority',
      maxSize: 100,
      concurrency: 5
    };

    const result = validateQueueConfig(config);
    expect(result.success).toBe(true);
  });
});

describe('validateDataCompletionConfig', () => {
  test('should validate valid data completion config', () => {
    const config = {
      enabled: true,
      level: 'moderate',
      requiredFields: ['price', 'volume'],
      preferredFields: ['marketCap', 'pe'],
      allowPartial: true,
      fallbackToCache: true
    };

    const result = validateDataCompletionConfig(config);
    expect(result.success).toBe(true);
  });

  test('should reject invalid level', () => {
    const config = {
      level: 'invalid'
    };

    const result = validateDataCompletionConfig(config);
    expect(result.success).toBe(false);
  });

  test('should accept none level', () => {
    const config = {
      level: 'none'
    };

    const result = validateDataCompletionConfig(config);
    expect(result.success).toBe(true);
  });

  test('should accept minimal level', () => {
    const config = {
      level: 'minimal'
    };

    const result = validateDataCompletionConfig(config);
    expect(result.success).toBe(true);
  });

  test('should accept moderate level', () => {
    const config = {
      level: 'moderate'
    };

    const result = validateDataCompletionConfig(config);
    expect(result.success).toBe(true);
  });

  test('should accept complete level', () => {
    const config = {
      level: 'complete'
    };

    const result = validateDataCompletionConfig(config);
    expect(result.success).toBe(true);
  });
});

describe('validateLoggingConfig', () => {
  test('should validate valid logging config', () => {
    const config = {
      level: 'info',
      format: 'text',
      destination: 'console'
    };

    const result = validateLoggingConfig(config);
    expect(result.success).toBe(true);
  });

  test('should reject invalid level', () => {
    const config = {
      level: 'invalid'
    };

    const result = validateLoggingConfig(config);
    expect(result.success).toBe(false);
  });

  test('should reject invalid format', () => {
    const config = {
      format: 'invalid'
    };

    const result = validateLoggingConfig(config);
    expect(result.success).toBe(false);
  });

  test('should reject invalid destination', () => {
    const config = {
      destination: 'invalid'
    };

    const result = validateLoggingConfig(config);
    expect(result.success).toBe(false);
  });

  test('should accept debug level', () => {
    const config = {
      level: 'debug'
    };

    const result = validateLoggingConfig(config);
    expect(result.success).toBe(true);
  });

  test('should accept info level', () => {
    const config = {
      level: 'info'
    };

    const result = validateLoggingConfig(config);
    expect(result.success).toBe(true);
  });

  test('should accept warn level', () => {
    const config = {
      level: 'warn'
    };

    const result = validateLoggingConfig(config);
    expect(result.success).toBe(true);
  });

  test('should accept error level', () => {
    const config = {
      level: 'error'
    };

    const result = validateLoggingConfig(config);
    expect(result.success).toBe(true);
  });

  test('should accept text format', () => {
    const config = {
      format: 'text'
    };

    const result = validateLoggingConfig(config);
    expect(result.success).toBe(true);
  });

  test('should accept json format', () => {
    const config = {
      format: 'json'
    };

    const result = validateLoggingConfig(config);
    expect(result.success).toBe(true);
  });

  test('should accept console destination', () => {
    const config = {
      destination: 'console'
    };

    const result = validateLoggingConfig(config);
    expect(result.success).toBe(true);
  });

  test('should accept file destination', () => {
    const config = {
      destination: 'file',
      filePath: 'app.log'
    };

    const result = validateLoggingConfig(config);
    expect(result.success).toBe(true);
  });
});

describe('validateNetworkConfig', () => {
  test('should validate valid network config', () => {
    const config = {
      timeoutMs: 30000,
      keepAlive: true,
      keepAliveMsecs: 1000,
      maxSockets: 10,
      maxFreeSockets: 5,
      scheduling: 'fifo',
      maxRedirects: 5,
      followRedirects: true
    };

    const result = validateNetworkConfig(config);
    expect(result.success).toBe(true);
  });

  test('should reject negative timeoutMs', () => {
    const config = {
      timeoutMs: -1000
    };

    const result = validateNetworkConfig(config);
    expect(result.success).toBe(false);
  });

  test('should reject negative keepAliveMsecs', () => {
    const config = {
      keepAliveMsecs: -1000
    };

    const result = validateNetworkConfig(config);
    expect(result.success).toBe(false);
  });

  test('should reject zero maxSockets', () => {
    const config = {
      maxSockets: 0
    };

    const result = validateNetworkConfig(config);
    expect(result.success).toBe(false);
  });

  test('should reject negative maxSockets', () => {
    const config = {
      maxSockets: -10
    };

    const result = validateNetworkConfig(config);
    expect(result.success).toBe(false);
  });

  test('should reject negative maxFreeSockets', () => {
    const config = {
      maxFreeSockets: -5
    };

    const result = validateNetworkConfig(config);
    expect(result.success).toBe(false);
  });

  test('should reject invalid scheduling', () => {
    const config = {
      scheduling: 'invalid'
    };

    const result = validateNetworkConfig(config);
    expect(result.success).toBe(false);
  });

  test('should reject negative maxRedirects', () => {
    const config = {
      maxRedirects: -1
    };

    const result = validateNetworkConfig(config);
    expect(result.success).toBe(false);
  });

  test('should accept fifo scheduling', () => {
    const config = {
      scheduling: 'fifo'
    };

    const result = validateNetworkConfig(config);
    expect(result.success).toBe(true);
  });

  test('should accept lifo scheduling', () => {
    const config = {
      scheduling: 'lifo'
    };

    const result = validateNetworkConfig(config);
    expect(result.success).toBe(true);
  });
});
