import {
  AppConfigSchema,
  RateLimitConfigSchema,
  CacheConfigSchema,
  RetryConfigSchema,
  CircuitBreakerConfigSchema,
  QueueConfigSchema,
  DataCompletionConfigSchema,
  LoggingConfigSchema,
  NetworkConfigSchema,
  YahooFinanceConfigSchema,
  SecurityConfigSchema,
  ServerInfoConfigSchema,
  CapabilitiesConfigSchema
} from '../../../src/config/validation';
import {
  defaultConfig,
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
  defaultCapabilitiesConfig
} from '../../../src/config/defaults';
import { loadConfig } from '../../../src/config/index';
import * as fs from 'fs';

jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn()
}));

// `src/config/validation.ts` exports zod schemas, not `validate*` functions.
// A schema is fatal on bad input: `.parse` throws, `.safeParse` returns
// `{ success: false, error }`. There is no `{ success, errors }` shape.
// Every schema requires its full section and uses no `.strict()`, so unknown
// keys are stripped rather than rejected.

describe('AppConfigSchema (aggregate)', () => {
  test('accepts the real defaultConfig end to end', () => {
    expect(AppConfigSchema.safeParse(defaultConfig).success).toBe(true);
  });

  test('reports issues on the failure branch, not a { success, errors } shape', () => {
    const { security: _omitted, ...rest } = defaultConfig;
    const result = AppConfigSchema.safeParse(rest);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.length).toBeGreaterThan(0);
    }
  });

  test('strips unknown top-level keys rather than rejecting them', () => {
    const input = { ...defaultConfig, transport: 'stdio', bogus: 123 };
    const result = AppConfigSchema.parse(input);
    expect(result).not.toHaveProperty('transport');
    expect(result).not.toHaveProperty('bogus');
    expect(result.rateLimit.requestsPerMinute).toBe(60);
  });

  test('rejects a missing section', () => {
    expect(() => AppConfigSchema.parse({ ...defaultConfig, security: undefined })).toThrow();
  });
});

describe('RateLimitConfigSchema', () => {
  test('accepts the default rate-limit section', () => {
    expect(RateLimitConfigSchema.safeParse(defaultRateLimitConfig).success).toBe(true);
  });

  test('rejects a non-positive requestsPerMinute', () => {
    expect(() => RateLimitConfigSchema.parse({ ...defaultRateLimitConfig, requestsPerMinute: 0 })).toThrow();
    expect(() => RateLimitConfigSchema.parse({ ...defaultRateLimitConfig, requestsPerMinute: -10 })).toThrow();
  });

  test('allows retryCount to be zero but not negative', () => {
    expect(RateLimitConfigSchema.safeParse({ ...defaultRateLimitConfig, retryCount: 0 }).success).toBe(true);
    expect(() => RateLimitConfigSchema.parse({ ...defaultRateLimitConfig, retryCount: -1 })).toThrow();
  });

  test('backoffMultiplier is a positive number (may be fractional) but zero fails', () => {
    expect(RateLimitConfigSchema.safeParse({ ...defaultRateLimitConfig, backoffMultiplier: 1.5 }).success).toBe(true);
    expect(() => RateLimitConfigSchema.parse({ ...defaultRateLimitConfig, backoffMultiplier: 0 })).toThrow();
  });
});

describe('CacheConfigSchema', () => {
  test('accepts the default cache section', () => {
    expect(CacheConfigSchema.safeParse(defaultCacheConfig).success).toBe(true);
  });

  test('cacheStrategy enum accepts lru/lfu/fifo and rejects others', () => {
    expect(CacheConfigSchema.safeParse({ ...defaultCacheConfig, cacheStrategy: 'lfu' }).success).toBe(true);
    expect(CacheConfigSchema.safeParse({ ...defaultCacheConfig, cacheStrategy: 'fifo' }).success).toBe(true);
    expect(() => CacheConfigSchema.parse({ ...defaultCacheConfig, cacheStrategy: 'priority' })).toThrow();
    expect(() => CacheConfigSchema.parse({ ...defaultCacheConfig, cacheStrategy: 'invalid' })).toThrow();
  });

  test('ttl fields are non-negative integers (zero allowed) but maxCacheSize is positive', () => {
    expect(CacheConfigSchema.safeParse({ ...defaultCacheConfig, ttlQuotes: 0 }).success).toBe(true);
    expect(() => CacheConfigSchema.parse({ ...defaultCacheConfig, ttlQuotes: -1000 })).toThrow();
    expect(() => CacheConfigSchema.parse({ ...defaultCacheConfig, maxCacheSize: 0 })).toThrow();
  });
});

describe('RetryConfigSchema', () => {
  test('accepts the default retry section', () => {
    expect(RetryConfigSchema.safeParse(defaultRetryConfig).success).toBe(true);
  });

  test('jitterFactor is bounded to 0..1', () => {
    expect(RetryConfigSchema.safeParse({ ...defaultRetryConfig, jitterFactor: 1 }).success).toBe(true);
    expect(() => RetryConfigSchema.parse({ ...defaultRetryConfig, jitterFactor: 2 })).toThrow();
    expect(() => RetryConfigSchema.parse({ ...defaultRetryConfig, jitterFactor: -0.1 })).toThrow();
  });

  test('retryableStatusCodes requires numbers: a comma-split env string array fails', () => {
    // Documents `YF_MCP_RETRY_STATUS_CODES=429,500`, which parseEnvVar turns into
    // ['429','500']; z.array(z.number()) rejects it.
    expect(() => RetryConfigSchema.parse({ ...defaultRetryConfig, retryableStatusCodes: ['429', '500'] })).toThrow();
    expect(() => RetryConfigSchema.parse({ ...defaultRetryConfig, retryableStatusCodes: [0] })).toThrow();
    expect(RetryConfigSchema.safeParse({ ...defaultRetryConfig, retryableStatusCodes: [429, 500] }).success).toBe(true);
  });

  test('maxRetries and baseDelay are non-negative, maxDelay is positive', () => {
    expect(RetryConfigSchema.safeParse({ ...defaultRetryConfig, maxRetries: 0 }).success).toBe(true);
    expect(() => RetryConfigSchema.parse({ ...defaultRetryConfig, maxRetries: -1 })).toThrow();
    expect(() => RetryConfigSchema.parse({ ...defaultRetryConfig, maxDelay: 0 })).toThrow();
  });
});

describe('CircuitBreakerConfigSchema', () => {
  test('accepts the default circuit-breaker section', () => {
    expect(CircuitBreakerConfigSchema.safeParse(defaultCircuitBreakerConfig).success).toBe(true);
  });

  test('failure/success thresholds and timeouts must be positive integers', () => {
    expect(() => CircuitBreakerConfigSchema.parse({ ...defaultCircuitBreakerConfig, failureThreshold: 0 })).toThrow();
    expect(() => CircuitBreakerConfigSchema.parse({ ...defaultCircuitBreakerConfig, successThreshold: 0 })).toThrow();
    expect(() => CircuitBreakerConfigSchema.parse({ ...defaultCircuitBreakerConfig, timeout: -1000 })).toThrow();
  });
});

describe('QueueConfigSchema', () => {
  test('accepts the default queue section', () => {
    expect(QueueConfigSchema.safeParse(defaultQueueConfig).success).toBe(true);
  });

  test('maxConcurrent, maxQueueSize and priorityLevels must be positive', () => {
    expect(() => QueueConfigSchema.parse({ ...defaultQueueConfig, maxConcurrent: 0 })).toThrow();
    expect(() => QueueConfigSchema.parse({ ...defaultQueueConfig, maxQueueSize: -10 })).toThrow();
    expect(() => QueueConfigSchema.parse({ ...defaultQueueConfig, priorityLevels: 0 })).toThrow();
  });

  test('queueTimeout is non-negative (zero allowed)', () => {
    expect(QueueConfigSchema.safeParse({ ...defaultQueueConfig, queueTimeout: 0 }).success).toBe(true);
    expect(() => QueueConfigSchema.parse({ ...defaultQueueConfig, queueTimeout: -1 })).toThrow();
  });
});

describe('DataCompletionConfigSchema', () => {
  test('accepts the default data-completion section', () => {
    expect(DataCompletionConfigSchema.safeParse(defaultDataCompletionConfig).success).toBe(true);
  });

  test('flags are booleans and fallbackPriority is an array of strings', () => {
    expect(() => DataCompletionConfigSchema.parse({ ...defaultDataCompletionConfig, enableFallback: 'yes' })).toThrow();
    expect(() => DataCompletionConfigSchema.parse({ ...defaultDataCompletionConfig, fallbackPriority: ['cache', 123] })).toThrow();
    expect(DataCompletionConfigSchema.safeParse({ ...defaultDataCompletionConfig, fallbackPriority: ['cache', 'alternative'] }).success).toBe(true);
  });
});

describe('LoggingConfigSchema', () => {
  test('accepts the default logging section', () => {
    expect(LoggingConfigSchema.safeParse(defaultLoggingConfig).success).toBe(true);
  });

  test('level/format/destination enums reject unknown values', () => {
    expect(() => LoggingConfigSchema.parse({ ...defaultLoggingConfig, level: 'silent' })).toThrow();
    expect(() => LoggingConfigSchema.parse({ ...defaultLoggingConfig, format: 'yaml' })).toThrow();
    expect(() => LoggingConfigSchema.parse({ ...defaultLoggingConfig, destination: 'invalid' })).toThrow();
  });

  test('destination "both" is accepted and extra logging fields are optional', () => {
    expect(LoggingConfigSchema.safeParse({ ...defaultLoggingConfig, destination: 'both' }).success).toBe(true);
    expect(LoggingConfigSchema.safeParse({ ...defaultLoggingConfig, destination: 'file', filePath: 'app.log', maxSize: 0 }).success).toBe(false);
  });
});

describe('NetworkConfigSchema', () => {
  test('accepts the default network section', () => {
    expect(NetworkConfigSchema.safeParse(defaultNetworkConfig).success).toBe(true);
  });

  test('socket and timeout fields require positive integers', () => {
    expect(() => NetworkConfigSchema.parse({ ...defaultNetworkConfig, timeoutMs: -1000 })).toThrow();
    expect(() => NetworkConfigSchema.parse({ ...defaultNetworkConfig, maxSockets: 0 })).toThrow();
    // Documents the real constraint: maxFreeSockets is positive, so 0 is rejected.
    expect(() => NetworkConfigSchema.parse({ ...defaultNetworkConfig, maxFreeSockets: 0 })).toThrow();
  });

  test('scheduling enum and proxy nesting are validated', () => {
    expect(() => NetworkConfigSchema.parse({ ...defaultNetworkConfig, scheduling: 'invalid' })).toThrow();
    expect(NetworkConfigSchema.safeParse({ ...defaultNetworkConfig, proxy: { host: 'h', port: 8080 } }).success).toBe(true);
    expect(NetworkConfigSchema.safeParse({ ...defaultNetworkConfig, proxy: { host: 'h', port: 0 } }).success).toBe(false);
  });
});

describe('YahooFinanceConfigSchema', () => {
  test('accepts the default Yahoo Finance section', () => {
    expect(YahooFinanceConfigSchema.safeParse(defaultYahooFinanceConfig).success).toBe(true);
  });

  test('baseUrl is NOT validated as a URL (plain z.string), so an arbitrary string passes', () => {
    expect(YahooFinanceConfigSchema.safeParse({ ...defaultYahooFinanceConfig, baseUrl: 'not-a-url' }).success).toBe(true);
  });

  test('timeout/queue fields require positive integers', () => {
    expect(() => YahooFinanceConfigSchema.parse({ ...defaultYahooFinanceConfig, timeoutMs: 0 })).toThrow();
    expect(() => YahooFinanceConfigSchema.parse({ ...defaultYahooFinanceConfig, maxConcurrentRequests: 0 })).toThrow();
    expect(() => YahooFinanceConfigSchema.parse({ ...defaultYahooFinanceConfig, requestQueueSize: -10 })).toThrow();
  });

  test('apiKey/apiSecret/userAgent are optional (default omits them)', () => {
    expect(YahooFinanceConfigSchema.safeParse({ ...defaultYahooFinanceConfig, userAgent: 'Mozilla/5.0' }).success).toBe(true);
  });
});

describe('SecurityConfigSchema', () => {
  test('accepts the default security section', () => {
    expect(SecurityConfigSchema.safeParse(defaultSecurityConfig).success).toBe(true);
  });

  test('allowedOrigins requires URL strings (empty array is valid)', () => {
    expect(SecurityConfigSchema.safeParse({ ...defaultSecurityConfig, allowedOrigins: [] }).success).toBe(true);
    expect(SecurityConfigSchema.safeParse({ ...defaultSecurityConfig, allowedOrigins: ['http://localhost:3000'] }).success).toBe(true);
    expect(() => SecurityConfigSchema.parse({ ...defaultSecurityConfig, allowedOrigins: ['not-a-url'] })).toThrow();
  });

  test('maxSymbolsPerRequest is a positive integer', () => {
    expect(() => SecurityConfigSchema.parse({ ...defaultSecurityConfig, maxSymbolsPerRequest: 0 })).toThrow();
  });
});

describe('ServerInfoConfigSchema', () => {
  test('accepts the default server-info section including the empty version', () => {
    expect(ServerInfoConfigSchema.safeParse(defaultServerInfoConfig).success).toBe(true);
  });

  test('version is a plain string, so the empty default passes (entrypoint injects the real one)', () => {
    expect(ServerInfoConfigSchema.safeParse({ ...defaultServerInfoConfig, version: '' }).success).toBe(true);
  });

  test('name and version are required strings', () => {
    const { name: _omitted, ...rest } = defaultServerInfoConfig;
    expect(ServerInfoConfigSchema.safeParse(rest).success).toBe(false);
    expect(() => ServerInfoConfigSchema.parse({ ...defaultServerInfoConfig, version: 2 as unknown as string })).toThrow();
  });
});

describe('CapabilitiesConfigSchema', () => {
  test('accepts the default capabilities section', () => {
    expect(CapabilitiesConfigSchema.safeParse(defaultCapabilitiesConfig).success).toBe(true);
  });

  test('requires the tools key', () => {
    expect(CapabilitiesConfigSchema.safeParse({}).success).toBe(false);
    expect(CapabilitiesConfigSchema.safeParse({ tools: {} }).success).toBe(true);
  });

  test('tools.listChanged must be a boolean when present', () => {
    expect(CapabilitiesConfigSchema.safeParse({ tools: { listChanged: 'yes' } }).success).toBe(false);
    expect(CapabilitiesConfigSchema.safeParse({ tools: { listChanged: true } }).success).toBe(true);
  });
});

describe('loadConfig (env wins over file, validation is fatal)', () => {
  const existsSyncMock = fs.existsSync as unknown as jest.Mock;
  const readFileSyncMock = fs.readFileSync as unknown as jest.Mock;

  beforeEach(() => {
    delete process.env.YF_MCP_RETRY_STATUS_CODES;
    delete process.env.YF_MCP_CONFIG_PATH;
    existsSyncMock.mockReset().mockReturnValue(false);
    readFileSyncMock.mockReset();
  });

  afterEach(() => {
    delete process.env.YF_MCP_RETRY_STATUS_CODES;
    delete process.env.YF_MCP_CONFIG_PATH;
  });

  test('with no env overrides it returns the defaults, version still empty', () => {
    const result = loadConfig({ sources: ['env'] });
    expect(result.rateLimit.requestsPerMinute).toBe(60);
    expect(result.cache.maxCacheSize).toBe(1000);
    expect(result.serverInfo.version).toBe('');
  });

  test('validation is fatal when an env var yields a string array', () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    process.env.YF_MCP_RETRY_STATUS_CODES = '429,500';
    expect(() => loadConfig({ sources: ['env'] })).toThrow();
    expect(errorSpy).toHaveBeenCalledWith('Configuration validation failed:', expect.anything());
    errorSpy.mockRestore();
  });

  test('the config file is inert: a JSON file value is overwritten by the env/default pass', () => {
    existsSyncMock.mockReturnValue(true);
    readFileSyncMock.mockReturnValue(
      JSON.stringify({ rateLimit: { requestsPerMinute: 999 }, serverInfo: { name: 'FROM-FILE' } })
    );
    const result = loadConfig();
    expect(result.rateLimit.requestsPerMinute).toBe(60);
    expect(result.serverInfo.name).toBe('y-finance-mcp-server');
  });

  test('a file value only takes effect when env is excluded from sources', () => {
    existsSyncMock.mockReturnValue(true);
    readFileSyncMock.mockReturnValue(JSON.stringify({ rateLimit: { requestsPerMinute: 999 } }));
    const result = loadConfig({ sources: ['file'] });
    expect(result.rateLimit.requestsPerMinute).toBe(999);
  });

  test('a missing config file is not an error', () => {
    existsSyncMock.mockReturnValue(false);
    expect(() => loadConfig({ sources: ['file'] })).not.toThrow();
    expect(loadConfig({ sources: ['file'] }).cache.maxCacheSize).toBe(1000);
  });

  test('a YAML file never reaches the effective config under default precedence', () => {
    // Deterministic across module systems: whether js-yaml parses the file (the
    // CommonJS Jest harness, where `require('js-yaml')` resolves) or the require
    // throws and loadFromFile warns + returns null (production ESM, where `require`
    // is undefined), the env pass overwrites every file value. So requestsPerMinute
    // stays at the default 60 either way. The documented "console.warn + null"
    // degrade branch itself is unreachable under ts-jest's CommonJS transpile.
    existsSyncMock.mockReturnValue(true);
    readFileSyncMock.mockReturnValue('rateLimit:\n  requestsPerMinute: 777\n');
    const result = loadConfig({ configPath: 'test-config.yaml' });
    expect(result.rateLimit.requestsPerMinute).toBe(60);
  });
});
