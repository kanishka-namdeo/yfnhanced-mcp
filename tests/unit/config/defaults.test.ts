import {
  defaultRateLimitConfig,
  defaultCacheConfig,
  defaultRetryConfig,
  defaultCircuitBreakerConfig,
  defaultQueueConfig,
  defaultDataCompletionConfig,
  defaultLoggingConfig,
  defaultNetworkConfig,
  defaultYahooFinanceConfig,
  defaultSecurityConfig,
  defaultServerInfoConfig,
  defaultCapabilitiesConfig,
  defaultConfig
} from '../../../src/config/defaults';

// `src/config/defaults.ts` exports plain consts, not factory functions.
// There is no `getDefaultConfig` and no `get*Defaults()`; `defaultConfig` is the
// aggregate and each section is its own exported `default*Config` const.

describe('defaultConfig aggregate', () => {
  test('exposes exactly the twelve documented sections', () => {
    expect(Object.keys(defaultConfig).sort()).toEqual([
      'cache',
      'capabilities',
      'circuitBreaker',
      'dataCompletion',
      'logging',
      'network',
      'queue',
      'rateLimit',
      'retry',
      'security',
      'serverInfo',
      'yahooFinance'
    ]);
  });

  test('has no transport key (transport is hardcoded in the server entrypoint)', () => {
    expect(defaultConfig).not.toHaveProperty('transport');
  });

  test('composes the per-section default consts by reference', () => {
    expect(defaultConfig.rateLimit).toBe(defaultRateLimitConfig);
    expect(defaultConfig.cache).toBe(defaultCacheConfig);
    expect(defaultConfig.retry).toBe(defaultRetryConfig);
    expect(defaultConfig.circuitBreaker).toBe(defaultCircuitBreakerConfig);
    expect(defaultConfig.queue).toBe(defaultQueueConfig);
    expect(defaultConfig.dataCompletion).toBe(defaultDataCompletionConfig);
    expect(defaultConfig.logging).toBe(defaultLoggingConfig);
    expect(defaultConfig.network).toBe(defaultNetworkConfig);
    expect(defaultConfig.yahooFinance).toBe(defaultYahooFinanceConfig);
    expect(defaultConfig.serverInfo).toBe(defaultServerInfoConfig);
    expect(defaultConfig.capabilities).toBe(defaultCapabilitiesConfig);
    expect(defaultConfig.security).toBe(defaultSecurityConfig);
  });

  test('serverInfo and capabilities are objects, not arrays', () => {
    expect(Array.isArray(defaultConfig.capabilities)).toBe(false);
    expect(Array.isArray(defaultConfig.serverInfo)).toBe(false);
    expect(typeof defaultConfig.serverInfo).toBe('object');
  });
});

describe('defaultRateLimitConfig', () => {
  test('carries the documented numeric defaults', () => {
    expect(defaultRateLimitConfig.requestsPerMinute).toBe(60);
    expect(defaultRateLimitConfig.requestsPerHour).toBe(1500);
    expect(defaultRateLimitConfig.burstLimit).toBe(5);
    expect(defaultRateLimitConfig.backoffMultiplier).toBe(2);
    expect(defaultRateLimitConfig.maxBackoffSeconds).toBe(300);
    expect(defaultRateLimitConfig.retryCount).toBe(3);
    expect(defaultRateLimitConfig.circuitBreakerThreshold).toBe(5);
    expect(defaultRateLimitConfig.circuitBreakerResetMs).toBe(60000);
  });

  test('has no strategy/windowMs/maxRequests fields (imagined API)', () => {
    expect(defaultRateLimitConfig).not.toHaveProperty('strategy');
    expect(defaultRateLimitConfig).not.toHaveProperty('maxRequests');
    expect(defaultRateLimitConfig).not.toHaveProperty('windowMs');
  });
});

describe('defaultCacheConfig', () => {
  test('carries per-domain TTLs in milliseconds plus size and strategy', () => {
    expect(defaultCacheConfig.ttlQuotes).toBe(60000);
    expect(defaultCacheConfig.ttlHistorical).toBe(3600000);
    expect(defaultCacheConfig.ttlFinancials).toBe(86400000);
    expect(defaultCacheConfig.ttlNews).toBe(300000);
    expect(defaultCacheConfig.ttlAnalysis).toBe(3600000);
    expect(defaultCacheConfig.maxCacheSize).toBe(1000);
    expect(defaultCacheConfig.cacheStrategy).toBe('lru');
  });

  test('cacheStrategy is one of lru/lfu/fifo', () => {
    expect(['lru', 'lfu', 'fifo']).toContain(defaultCacheConfig.cacheStrategy);
  });

  test('has no enabled/store/ttl/maxEntries fields (imagined API)', () => {
    expect(defaultCacheConfig).not.toHaveProperty('enabled');
    expect(defaultCacheConfig).not.toHaveProperty('store');
    expect(defaultCacheConfig).not.toHaveProperty('ttl');
    expect(defaultCacheConfig).not.toHaveProperty('maxEntries');
  });
});

describe('defaultRetryConfig', () => {
  test('carries the documented retry defaults', () => {
    expect(defaultRetryConfig.maxRetries).toBe(3);
    expect(defaultRetryConfig.baseDelay).toBe(1000);
    expect(defaultRetryConfig.maxDelay).toBe(30000);
    expect(defaultRetryConfig.jitter).toBe(true);
    expect(defaultRetryConfig.jitterFactor).toBe(0.1);
  });

  test('retryableStatusCodes and retryableErrors are the real arrays', () => {
    expect(defaultRetryConfig.retryableStatusCodes).toEqual([429, 500, 502, 503, 504]);
    expect(defaultRetryConfig.retryableErrors).toEqual(['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND']);
  });

  test('maxDelay is at least baseDelay', () => {
    expect(defaultRetryConfig.maxDelay).toBeGreaterThanOrEqual(defaultRetryConfig.baseDelay);
  });

  test('jitterFactor sits within the schema 0..1 bounds', () => {
    expect(defaultRetryConfig.jitterFactor).toBeGreaterThanOrEqual(0);
    expect(defaultRetryConfig.jitterFactor).toBeLessThanOrEqual(1);
  });

  test('has no enabled/strategy/initialDelayMs fields (imagined API)', () => {
    expect(defaultRetryConfig).not.toHaveProperty('enabled');
    expect(defaultRetryConfig).not.toHaveProperty('strategy');
    expect(defaultRetryConfig).not.toHaveProperty('initialDelayMs');
  });
});

describe('defaultCircuitBreakerConfig', () => {
  test('carries the real four-field shape', () => {
    expect(defaultCircuitBreakerConfig.failureThreshold).toBe(5);
    expect(defaultCircuitBreakerConfig.successThreshold).toBe(2);
    expect(defaultCircuitBreakerConfig.timeout).toBe(60000);
    expect(defaultCircuitBreakerConfig.monitoringWindow).toBe(60000);
  });

  test('has no errorThresholdPercentage/resetTimeoutMs/volumeThreshold fields (imagined API)', () => {
    expect(defaultCircuitBreakerConfig).not.toHaveProperty('errorThresholdPercentage');
    expect(defaultCircuitBreakerConfig).not.toHaveProperty('resetTimeoutMs');
    expect(defaultCircuitBreakerConfig).not.toHaveProperty('volumeThreshold');
    expect(defaultCircuitBreakerConfig).not.toHaveProperty('halfOpenMaxAttempts');
    expect(defaultCircuitBreakerConfig).not.toHaveProperty('enabled');
  });
});

describe('defaultQueueConfig', () => {
  test('carries the real queue defaults', () => {
    expect(defaultQueueConfig.maxConcurrent).toBe(5);
    expect(defaultQueueConfig.maxQueueSize).toBe(100);
    expect(defaultQueueConfig.priorityLevels).toBe(3);
    expect(defaultQueueConfig.queueTimeout).toBe(30000);
    expect(defaultQueueConfig.batchWindow).toBe(100);
  });

  test('has no enabled/strategy/concurrency/timeoutMs fields (imagined API)', () => {
    expect(defaultQueueConfig).not.toHaveProperty('enabled');
    expect(defaultQueueConfig).not.toHaveProperty('strategy');
    expect(defaultQueueConfig).not.toHaveProperty('concurrency');
    expect(defaultQueueConfig).not.toHaveProperty('maxSize');
  });
});

describe('defaultDataCompletionConfig', () => {
  test('carries the real data-completion defaults', () => {
    expect(defaultDataCompletionConfig.enableFallback).toBe(true);
    expect(defaultDataCompletionConfig.fallbackPriority).toEqual(['cache', 'alternative']);
    expect(defaultDataCompletionConfig.fillMissingFields).toBe(true);
    expect(defaultDataCompletionConfig.validateCompleteness).toBe(true);
  });

  test('has no enabled/level/allowPartial/fallbackToCache fields (imagined API)', () => {
    expect(defaultDataCompletionConfig).not.toHaveProperty('enabled');
    expect(defaultDataCompletionConfig).not.toHaveProperty('level');
    expect(defaultDataCompletionConfig).not.toHaveProperty('allowPartial');
    expect(defaultDataCompletionConfig).not.toHaveProperty('requiredFields');
  });
});

describe('defaultLoggingConfig', () => {
  test('carries the minimal logging defaults', () => {
    expect(defaultLoggingConfig.level).toBe('info');
    expect(defaultLoggingConfig.format).toBe('json');
    expect(defaultLoggingConfig.destination).toBe('console');
  });

  test('level/format/destination are within their schema enums', () => {
    expect(['debug', 'info', 'warn', 'error']).toContain(defaultLoggingConfig.level);
    expect(['json', 'text']).toContain(defaultLoggingConfig.format);
    expect(['console', 'file', 'both']).toContain(defaultLoggingConfig.destination);
  });
});

describe('defaultNetworkConfig', () => {
  test('carries the real network defaults', () => {
    expect(defaultNetworkConfig.timeoutMs).toBe(30000);
    expect(defaultNetworkConfig.keepAlive).toBe(true);
    expect(defaultNetworkConfig.keepAliveMsecs).toBe(1000);
    expect(defaultNetworkConfig.maxSockets).toBe(50);
    expect(defaultNetworkConfig.maxFreeSockets).toBe(10);
    expect(defaultNetworkConfig.scheduling).toBe('fifo');
    expect(defaultNetworkConfig.maxRedirects).toBe(5);
    expect(defaultNetworkConfig.followRedirects).toBe(true);
  });

  test('scheduling is fifo/lifo', () => {
    expect(['fifo', 'lifo']).toContain(defaultNetworkConfig.scheduling);
  });

  test('has no proxy/httpAgent/httpsAgent by default (optional)', () => {
    expect(defaultNetworkConfig).not.toHaveProperty('proxy');
    expect(defaultNetworkConfig).not.toHaveProperty('httpAgent');
    expect(defaultNetworkConfig).not.toHaveProperty('httpsAgent');
  });
});

describe('defaultYahooFinanceConfig', () => {
  test('carries the real Yahoo Finance defaults', () => {
    expect(defaultYahooFinanceConfig.baseUrl).toBe('https://query1.finance.yahoo.com');
    expect(defaultYahooFinanceConfig.timeoutMs).toBe(10000);
    expect(defaultYahooFinanceConfig.maxConcurrentRequests).toBe(5);
    expect(defaultYahooFinanceConfig.requestQueueSize).toBe(100);
    expect(defaultYahooFinanceConfig.validateResponses).toBe(true);
    expect(defaultYahooFinanceConfig.strictMode).toBe(false);
  });

  test('baseUrl is a real https URL string', () => {
    expect(defaultYahooFinanceConfig.baseUrl).toMatch(/^https:\/\//);
  });

  test('userAgent/apiKey/apiSecret are absent from the default (only an unused alt endpoint reads userAgent)', () => {
    expect(defaultYahooFinanceConfig).not.toHaveProperty('userAgent');
    expect(defaultYahooFinanceConfig).not.toHaveProperty('apiKey');
    expect(defaultYahooFinanceConfig).not.toHaveProperty('apiSecret');
  });
});

describe('defaultServerInfoConfig', () => {
  test('name is the server identity', () => {
    expect(defaultServerInfoConfig.name).toBe('y-finance-mcp-server');
  });

  test('version is the empty string by design (the entrypoint injects the real package version)', () => {
    expect(defaultServerInfoConfig.version).toBe('');
  });

  test('raw default version carries no semver', () => {
    expect(defaultServerInfoConfig.version).not.toMatch(/^\d+\.\d+\.\d+$/);
  });

  test('protocolVersion is a dotted string', () => {
    expect(defaultServerInfoConfig.protocolVersion).toBe('1.0');
  });
});

describe('defaultCapabilitiesConfig', () => {
  test('is an object with tools/resources/prompts (not an array)', () => {
    expect(Array.isArray(defaultCapabilitiesConfig)).toBe(false);
    expect(defaultCapabilitiesConfig).toHaveProperty('tools');
    expect(defaultCapabilitiesConfig).toHaveProperty('resources');
    expect(defaultCapabilitiesConfig).toHaveProperty('prompts');
  });

  test('sub-capabilities default to empty objects', () => {
    expect(defaultCapabilitiesConfig.tools).toEqual({});
    expect(defaultCapabilitiesConfig.resources).toEqual({});
    expect(defaultCapabilitiesConfig.prompts).toEqual({});
  });
});

describe('defaultSecurityConfig', () => {
  test('enables the security surface and matches the schema limits', () => {
    expect(defaultSecurityConfig.enabled).toBe(true);
    expect(defaultSecurityConfig.enableInputValidation).toBe(true);
    expect(defaultSecurityConfig.maxSymbolsPerRequest).toBe(50);
    expect(defaultSecurityConfig.maxStringLength).toBe(1000);
    expect(defaultSecurityConfig.allowedOrigins).toEqual([]);
  });

  test('allowedOrigins defaults to an empty array', () => {
    expect(Array.isArray(defaultSecurityConfig.allowedOrigins)).toBe(true);
    expect(defaultSecurityConfig.allowedOrigins.length).toBe(0);
  });
});
