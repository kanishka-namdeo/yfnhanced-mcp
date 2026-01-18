import { getDefaultConfig, getServerInfoDefaults, getCapabilitiesDefaults, getTransportDefaults, getRateLimitDefaults, getCacheDefaults, getRetryDefaults, getCircuitBreakerDefaults, getQueueDefaults, getDataCompletionDefaults, getLoggingDefaults, getNetworkDefaults, getYahooFinanceDefaults } from '../../../src/config/defaults';

describe('getDefaultConfig', () => {
  test('should return default config', () => {
    const config = getDefaultConfig();
    expect(config).toBeDefined();
    expect(config).toHaveProperty('serverInfo');
    expect(config).toHaveProperty('capabilities');
    expect(config).toHaveProperty('transport');
  });

  test('should have valid serverInfo', () => {
    const config = getDefaultConfig();
    expect(config.serverInfo).toHaveProperty('name');
    expect(config.serverInfo).toHaveProperty('version');
    expect(config.serverInfo).toHaveProperty('protocolVersion');
  });

  test('should have valid transport', () => {
    const config = getDefaultConfig();
    expect(['stdio', 'sse', 'http']).toContain(config.transport);
  });

  test('should have valid rateLimit', () => {
    const config = getDefaultConfig();
    expect(config.rateLimit).toBeDefined();
    expect(config.rateLimit).toHaveProperty('strategy');
    expect(config.rateLimit).toHaveProperty('maxRequests');
    expect(config.rateLimit).toHaveProperty('windowMs');
  });

  test('should have valid cache', () => {
    const config = getDefaultConfig();
    expect(config.cache).toBeDefined();
    expect(config.cache).toHaveProperty('enabled');
    expect(config.cache).toHaveProperty('store');
    expect(config.cache).toHaveProperty('ttl');
  });

  test('should have valid retry', () => {
    const config = getDefaultConfig();
    expect(config.retry).toBeDefined();
    expect(config.retry).toHaveProperty('enabled');
    expect(config.retry).toHaveProperty('maxRetries');
    expect(config.retry).toHaveProperty('strategy');
  });

  test('should have valid circuitBreaker', () => {
    const config = getDefaultConfig();
    expect(config.circuitBreaker).toBeDefined();
    expect(config.circuitBreaker).toHaveProperty('enabled');
    expect(config.circuitBreaker).toHaveProperty('timeoutMs');
    expect(config.circuitBreaker).toHaveProperty('errorThresholdPercentage');
  });

  test('should have valid queue', () => {
    const config = getDefaultConfig();
    expect(config.queue).toBeDefined();
    expect(config.queue).toHaveProperty('enabled');
    expect(config.queue).toHaveProperty('maxSize');
    expect(config.queue).toHaveProperty('strategy');
  });

  test('should have valid dataCompletion', () => {
    const config = getDefaultConfig();
    expect(config.dataCompletion).toBeDefined();
    expect(config.dataCompletion).toHaveProperty('enabled');
    expect(config.dataCompletion).toHaveProperty('level');
    expect(config.dataCompletion).toHaveProperty('allowPartial');
  });

  test('should have valid logging', () => {
    const config = getDefaultConfig();
    expect(config.logging).toBeDefined();
    expect(config.logging).toHaveProperty('level');
    expect(config.logging).toHaveProperty('format');
    expect(config.logging).toHaveProperty('destination');
  });

  test('should have valid network', () => {
    const config = getDefaultConfig();
    expect(config.network).toBeDefined();
    expect(config.network).toHaveProperty('timeoutMs');
    expect(config.network).toHaveProperty('keepAlive');
    expect(config.network).toHaveProperty('maxSockets');
  });

  test('should have valid yahooFinance', () => {
    const config = getDefaultConfig();
    expect(config.yahooFinance).toBeDefined();
    expect(config.yahooFinance).toHaveProperty('baseUrl');
    expect(config.yahooFinance).toHaveProperty('timeoutMs');
    expect(config.yahooFinance).toHaveProperty('userAgent');
  });

  test('should have valid capabilities', () => {
    const config = getDefaultConfig();
    expect(config.capabilities).toBeDefined();
    expect(Array.isArray(config.capabilities)).toBe(true);
  });
});

describe('getServerInfoDefaults', () => {
  test('should return server info defaults', () => {
    const defaults = getServerInfoDefaults();
    expect(defaults).toBeDefined();
    expect(defaults).toHaveProperty('name');
    expect(defaults).toHaveProperty('version');
    expect(defaults).toHaveProperty('protocolVersion');
  });

  test('should have valid name', () => {
    const defaults = getServerInfoDefaults();
    expect(typeof defaults.name).toBe('string');
    expect(defaults.name.length).toBeGreaterThan(0);
  });

  test('should have valid version', () => {
    const defaults = getServerInfoDefaults();
    expect(typeof defaults.version).toBe('string');
    expect(defaults.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  test('should have valid protocolVersion', () => {
    const defaults = getServerInfoDefaults();
    expect(typeof defaults.protocolVersion).toBe('string');
    expect(defaults.protocolVersion).toMatch(/^\d+\.\d+$/);
  });
});

describe('getCapabilitiesDefaults', () => {
  test('should return capabilities defaults', () => {
    const defaults = getCapabilitiesDefaults();
    expect(defaults).toBeDefined();
    expect(Array.isArray(defaults)).toBe(true);
  });

  test('should return empty array by default', () => {
    const defaults = getCapabilitiesDefaults();
    expect(defaults.length).toBe(0);
  });
});

describe('getTransportDefaults', () => {
  test('should return transport defaults', () => {
    const defaults = getTransportDefaults();
    expect(defaults).toBeDefined();
  });

  test('should return stdio as default', () => {
    const defaults = getTransportDefaults();
    expect(defaults).toBe('stdio');
  });
});

describe('getRateLimitDefaults', () => {
  test('should return rate limit defaults', () => {
    const defaults = getRateLimitDefaults();
    expect(defaults).toBeDefined();
    expect(defaults).toHaveProperty('strategy');
    expect(defaults).toHaveProperty('maxRequests');
    expect(defaults).toHaveProperty('windowMs');
    expect(defaults).toHaveProperty('tokenRefillRate');
  });

  test('should have valid strategy', () => {
    const defaults = getRateLimitDefaults();
    expect(['token-bucket', 'fixed-window', 'sliding-window']).toContain(defaults.strategy);
  });

  test('should have positive maxRequests', () => {
    const defaults = getRateLimitDefaults();
    expect(defaults.maxRequests).toBeGreaterThan(0);
  });

  test('should have positive windowMs', () => {
    const defaults = getRateLimitDefaults();
    expect(defaults.windowMs).toBeGreaterThan(0);
  });

  test('should have positive tokenRefillRate', () => {
    const defaults = getRateLimitDefaults();
    expect(defaults.tokenRefillRate).toBeGreaterThan(0);
  });
});

describe('getCacheDefaults', () => {
  test('should return cache defaults', () => {
    const defaults = getCacheDefaults();
    expect(defaults).toBeDefined();
    expect(defaults).toHaveProperty('enabled');
    expect(defaults).toHaveProperty('store');
    expect(defaults).toHaveProperty('ttl');
    expect(defaults).toHaveProperty('maxEntries');
  });

  test('should have valid store', () => {
    const defaults = getCacheDefaults();
    expect(['memory', 'redis']).toContain(defaults.store);
  });

  test('should have positive ttl', () => {
    const defaults = getCacheDefaults();
    expect(defaults.ttl).toBeGreaterThan(0);
  });

  test('should have positive maxEntries', () => {
    const defaults = getCacheDefaults();
    expect(defaults.maxEntries).toBeGreaterThan(0);
  });

  test('should be enabled by default', () => {
    const defaults = getCacheDefaults();
    expect(defaults.enabled).toBe(true);
  });
});

describe('getRetryDefaults', () => {
  test('should return retry defaults', () => {
    const defaults = getRetryDefaults();
    expect(defaults).toBeDefined();
    expect(defaults).toHaveProperty('enabled');
    expect(defaults).toHaveProperty('maxRetries');
    expect(defaults).toHaveProperty('initialDelayMs');
    expect(defaults).toHaveProperty('maxDelayMs');
    expect(defaults).toHaveProperty('strategy');
    expect(defaults).toHaveProperty('backoffMultiplier');
    expect(defaults).toHaveProperty('jitter');
  });

  test('should have valid strategy', () => {
    const defaults = getRetryDefaults();
    expect(['exponential', 'linear', 'fixed']).toContain(defaults.strategy);
  });

  test('should have positive maxRetries', () => {
    const defaults = getRetryDefaults();
    expect(defaults.maxRetries).toBeGreaterThanOrEqual(0);
  });

  test('should have positive initialDelayMs', () => {
    const defaults = getRetryDefaults();
    expect(defaults.initialDelayMs).toBeGreaterThan(0);
  });

  test('should have maxDelayMs >= initialDelayMs', () => {
    const defaults = getRetryDefaults();
    expect(defaults.maxDelayMs).toBeGreaterThanOrEqual(defaults.initialDelayMs);
  });

  test('should have positive backoffMultiplier', () => {
    const defaults = getRetryDefaults();
    expect(defaults.backoffMultiplier).toBeGreaterThan(0);
  });

  test('should have jitter boolean', () => {
    const defaults = getRetryDefaults();
    expect(typeof defaults.jitter).toBe('boolean');
  });

  test('should be enabled by default', () => {
    const defaults = getRetryDefaults();
    expect(defaults.enabled).toBe(true);
  });
});

describe('getCircuitBreakerDefaults', () => {
  test('should return circuit breaker defaults', () => {
    const defaults = getCircuitBreakerDefaults();
    expect(defaults).toBeDefined();
    expect(defaults).toHaveProperty('enabled');
    expect(defaults).toHaveProperty('timeoutMs');
    expect(defaults).toHaveProperty('errorThresholdPercentage');
    expect(defaults).toHaveProperty('resetTimeoutMs');
    expect(defaults).toHaveProperty('rollingCountBuckets');
    expect(defaults).toHaveProperty('rollingCountTimeoutMs');
    expect(defaults).toHaveProperty('volumeThreshold');
    expect(defaults).toHaveProperty('halfOpenMaxAttempts');
  });

  test('should have positive timeoutMs', () => {
    const defaults = getCircuitBreakerDefaults();
    expect(defaults.timeoutMs).toBeGreaterThan(0);
  });

  test('should have valid errorThresholdPercentage', () => {
    const defaults = getCircuitBreakerDefaults();
    expect(defaults.errorThresholdPercentage).toBeGreaterThanOrEqual(0);
    expect(defaults.errorThresholdPercentage).toBeLessThanOrEqual(100);
  });

  test('should have positive resetTimeoutMs', () => {
    const defaults = getCircuitBreakerDefaults();
    expect(defaults.resetTimeoutMs).toBeGreaterThan(0);
  });

  test('should have positive rollingCountBuckets', () => {
    const defaults = getCircuitBreakerDefaults();
    expect(defaults.rollingCountBuckets).toBeGreaterThan(0);
  });

  test('should have positive rollingCountTimeoutMs', () => {
    const defaults = getCircuitBreakerDefaults();
    expect(defaults.rollingCountTimeoutMs).toBeGreaterThan(0);
  });

  test('should have positive volumeThreshold', () => {
    const defaults = getCircuitBreakerDefaults();
    expect(defaults.volumeThreshold).toBeGreaterThanOrEqual(0);
  });

  test('should have positive halfOpenMaxAttempts', () => {
    const defaults = getCircuitBreakerDefaults();
    expect(defaults.halfOpenMaxAttempts).toBeGreaterThan(0);
  });

  test('should be enabled by default', () => {
    const defaults = getCircuitBreakerDefaults();
    expect(defaults.enabled).toBe(true);
  });
});

describe('getQueueDefaults', () => {
  test('should return queue defaults', () => {
    const defaults = getQueueDefaults();
    expect(defaults).toBeDefined();
    expect(defaults).toHaveProperty('enabled');
    expect(defaults).toHaveProperty('maxSize');
    expect(defaults).toHaveProperty('strategy');
    expect(defaults).toHaveProperty('concurrency');
    expect(defaults).toHaveProperty('timeoutMs');
    expect(defaults).toHaveProperty('processingTimeoutMs');
  });

  test('should have valid strategy', () => {
    const defaults = getQueueDefaults();
    expect(['fifo', 'lifo', 'priority']).toContain(defaults.strategy);
  });

  test('should have positive maxSize', () => {
    const defaults = getQueueDefaults();
    expect(defaults.maxSize).toBeGreaterThan(0);
  });

  test('should have positive concurrency', () => {
    const defaults = getQueueDefaults();
    expect(defaults.concurrency).toBeGreaterThan(0);
  });

  test('should have positive timeoutMs', () => {
    const defaults = getQueueDefaults();
    expect(defaults.timeoutMs).toBeGreaterThan(0);
  });

  test('should have positive processingTimeoutMs', () => {
    const defaults = getQueueDefaults();
    expect(defaults.processingTimeoutMs).toBeGreaterThan(0);
  });

  test('should be enabled by default', () => {
    const defaults = getQueueDefaults();
    expect(defaults.enabled).toBe(true);
  });
});

describe('getDataCompletionDefaults', () => {
  test('should return data completion defaults', () => {
    const defaults = getDataCompletionDefaults();
    expect(defaults).toBeDefined();
    expect(defaults).toHaveProperty('enabled');
    expect(defaults).toHaveProperty('level');
    expect(defaults).toHaveProperty('requiredFields');
    expect(defaults).toHaveProperty('preferredFields');
    expect(defaults).toHaveProperty('allowPartial');
    expect(defaults).toHaveProperty('fallbackToCache');
  });

  test('should have valid level', () => {
    const defaults = getDataCompletionDefaults();
    expect(['none', 'minimal', 'moderate', 'complete']).toContain(defaults.level);
  });

  test('should have arrays for fields', () => {
    const defaults = getDataCompletionDefaults();
    expect(Array.isArray(defaults.requiredFields)).toBe(true);
    expect(Array.isArray(defaults.preferredFields)).toBe(true);
  });

  test('should have allowPartial boolean', () => {
    const defaults = getDataCompletionDefaults();
    expect(typeof defaults.allowPartial).toBe('boolean');
  });

  test('should have fallbackToCache boolean', () => {
    const defaults = getDataCompletionDefaults();
    expect(typeof defaults.fallbackToCache).toBe('boolean');
  });

  test('should be enabled by default', () => {
    const defaults = getDataCompletionDefaults();
    expect(defaults.enabled).toBe(true);
  });
});

describe('getLoggingDefaults', () => {
  test('should return logging defaults', () => {
    const defaults = getLoggingDefaults();
    expect(defaults).toBeDefined();
    expect(defaults).toHaveProperty('level');
    expect(defaults).toHaveProperty('format');
    expect(defaults).toHaveProperty('destination');
  });

  test('should have valid level', () => {
    const defaults = getLoggingDefaults();
    expect(['debug', 'info', 'warn', 'error']).toContain(defaults.level);
  });

  test('should have valid format', () => {
    const defaults = getLoggingDefaults();
    expect(['text', 'json']).toContain(defaults.format);
  });

  test('should have valid destination', () => {
    const defaults = getLoggingDefaults();
    expect(['console', 'file']).toContain(defaults.destination);
  });
});

describe('getNetworkDefaults', () => {
  test('should return network defaults', () => {
    const defaults = getNetworkDefaults();
    expect(defaults).toBeDefined();
    expect(defaults).toHaveProperty('timeoutMs');
    expect(defaults).toHaveProperty('keepAlive');
    expect(defaults).toHaveProperty('keepAliveMsecs');
    expect(defaults).toHaveProperty('maxSockets');
    expect(defaults).toHaveProperty('maxFreeSockets');
    expect(defaults).toHaveProperty('scheduling');
    expect(defaults).toHaveProperty('maxRedirects');
    expect(defaults).toHaveProperty('followRedirects');
  });

  test('should have positive timeoutMs', () => {
    const defaults = getNetworkDefaults();
    expect(defaults.timeoutMs).toBeGreaterThan(0);
  });

  test('should have keepAlive boolean', () => {
    const defaults = getNetworkDefaults();
    expect(typeof defaults.keepAlive).toBe('boolean');
  });

  test('should have positive keepAliveMsecs', () => {
    const defaults = getNetworkDefaults();
    expect(defaults.keepAliveMsecs).toBeGreaterThan(0);
  });

  test('should have positive maxSockets', () => {
    const defaults = getNetworkDefaults();
    expect(defaults.maxSockets).toBeGreaterThan(0);
  });

  test('should have positive maxFreeSockets', () => {
    const defaults = getNetworkDefaults();
    expect(defaults.maxFreeSockets).toBeGreaterThanOrEqual(0);
  });

  test('should have valid scheduling', () => {
    const defaults = getNetworkDefaults();
    expect(['fifo', 'lifo']).toContain(defaults.scheduling);
  });

  test('should have positive maxRedirects', () => {
    const defaults = getNetworkDefaults();
    expect(defaults.maxRedirects).toBeGreaterThanOrEqual(0);
  });

  test('should have followRedirects boolean', () => {
    const defaults = getNetworkDefaults();
    expect(typeof defaults.followRedirects).toBe('boolean');
  });
});

describe('getYahooFinanceDefaults', () => {
  test('should return Yahoo Finance defaults', () => {
    const defaults = getYahooFinanceDefaults();
    expect(defaults).toBeDefined();
    expect(defaults).toHaveProperty('baseUrl');
    expect(defaults).toHaveProperty('timeoutMs');
    expect(defaults).toHaveProperty('userAgent');
    expect(defaults).toHaveProperty('maxConcurrentRequests');
    expect(defaults).toHaveProperty('requestQueueSize');
    expect(defaults).toHaveProperty('validateResponses');
    expect(defaults).toHaveProperty('strictMode');
  });

  test('should have valid baseUrl', () => {
    const defaults = getYahooFinanceDefaults();
    expect(typeof defaults.baseUrl).toBe('string');
    expect(defaults.baseUrl).toMatch(/^https?:\/\//);
  });

  test('should have positive timeoutMs', () => {
    const defaults = getYahooFinanceDefaults();
    expect(defaults.timeoutMs).toBeGreaterThan(0);
  });

  test('should have valid userAgent', () => {
    const defaults = getYahooFinanceDefaults();
    expect(typeof defaults.userAgent).toBe('string');
    expect(defaults.userAgent.length).toBeGreaterThan(0);
  });

  test('should have positive maxConcurrentRequests', () => {
    const defaults = getYahooFinanceDefaults();
    expect(defaults.maxConcurrentRequests).toBeGreaterThan(0);
  });

  test('should have positive requestQueueSize', () => {
    const defaults = getYahooFinanceDefaults();
    expect(defaults.requestQueueSize).toBeGreaterThan(0);
  });

  test('should have validateResponses boolean', () => {
    const defaults = getYahooFinanceDefaults();
    expect(typeof defaults.validateResponses).toBe('boolean');
  });

  test('should have strictMode boolean', () => {
    const defaults = getYahooFinanceDefaults();
    expect(typeof defaults.strictMode).toBe('boolean');
  });
});
