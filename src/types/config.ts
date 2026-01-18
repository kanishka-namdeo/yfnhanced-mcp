

export type RateLimitStrategy = 'fixed-window' | 'sliding-window' | 'token-bucket';

export type RateLimitConfig = {
  strategy: RateLimitStrategy;
  maxRequests: number;
  windowMs: number;
  tokenRefillRate?: number;
  skipFailedRequests?: boolean;
  skipSuccessfulRequests?: boolean;
  keyGenerator?: (request: unknown) => string;
  handler?: (request: unknown, response: unknown) => void;
  onLimitReached?: (request: unknown, response: unknown, options: unknown) => void;
};

export type CacheStore = 'memory' | 'redis' | 'file';

export type CacheConfig = {
  enabled: boolean;
  store: CacheStore;
  ttl: number;
  maxEntries: number;
  checkPeriod?: number;
  redis?: {
    host: string;
    port: number;
    password?: string;
    db?: number;
    keyPrefix?: string;
  };
  file?: {
    cacheDir: string;
    path: string;
  };
  keyPrefix?: string;
  staleWhileRevalidate?: number;
  cacheControl?: boolean;
  noCache?: boolean;
  skipCache?: (request: unknown) => boolean;
  isCacheable?: (request: unknown) => boolean;
  serialize?: (value: unknown) => string;
  deserialize?: (value: string) => unknown;
  onHit?: (key: string, value: unknown) => void;
  onMiss?: (key: string) => void;
  onError?: (error: Error) => void;
};

export type RetryStrategy = 'exponential' | 'linear' | 'fixed';

export type RetryConfig = {
  enabled: boolean;
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  retryDelayMs?: number;
  strategy: RetryStrategy;
  backoffMultiplier: number;
  jitter: boolean;
  retryableStatusCodes: number[];
  retryableErrorCodes: string[];
  skipRetry?: (error: Error) => boolean;
  onRetry?: (error: Error, attempt: number) => void;
  onGiveUp?: (error: Error, attempt: number) => void;
};

export type CircuitBreakerState = 'closed' | 'open' | 'half-open';

export type CircuitBreakerConfig = {
  enabled: boolean;
  timeoutMs: number;
  errorThresholdPercentage: number;
  resetTimeoutMs: number;
  rollingCountBuckets: number;
  rollingCountTimeoutMs: number;
  volumeThreshold: number;
  halfOpenMaxAttempts: number;
  fallback?: (error: Error) => unknown;
  onOpen?: () => void;
  onHalfOpen?: () => void;
  onClose?: () => void;
  onError?: (error: Error, state: CircuitBreakerState) => void;
  onRequestRejected?: () => void;
};

export type QueueStrategy = 'fifo' | 'lifo' | 'priority';

export type QueueConfig = {
  enabled: boolean;
  maxSize: number;
  strategy: QueueStrategy;
  concurrency: number;
  timeoutMs: number;
  processingTimeoutMs: number;
  retryQueue?: boolean;
  maxRetries?: number;
  onFull?: (request: unknown) => void;
  onEmpty?: () => void;
  onAdd?: (item: unknown) => void;
  onProcess?: (item: unknown) => void;
  onComplete?: (item: unknown, result: unknown) => void;
  onError?: (item: unknown, error: Error) => void;
  priority?: (item: unknown) => number;
};

export type DataCompletionLevel = 'strict' | 'moderate' | 'lenient';

export type DataCompletionConfig = {
  enabled: boolean;
  level: DataCompletionLevel;
  requiredFields: string[];
  preferredFields: string[];
  allowPartial: boolean;
  fallbackToCache: boolean;
  validationRules?: Array<(data: unknown) => boolean>;
  onIncomplete?: (missingFields: string[], data: unknown) => void;
  onValidationFailure?: (data: unknown, errors: string[]) => void;
  retryOnIncomplete?: boolean;
  maxIncompleteRetries?: number;
};

export type LoggingLevel = 'debug' | 'info' | 'warn' | 'error';

export type LoggingConfig = {
  level: LoggingLevel;
  format: 'json' | 'text';
  destination: 'console' | 'file' | 'both';
  filePath?: string;
  maxSize?: number;
  maxFiles?: number;
  includeTimestamp?: boolean;
  includeLevel?: boolean;
  includeContext?: boolean;
  prettyPrint?: boolean;
  colorize?: boolean;
};

export type NetworkConfig = {
  timeoutMs: number;
  keepAlive: boolean;
  keepAliveMsecs: number;
  maxSockets: number;
  maxFreeSockets: number;
  scheduling: 'fifo' | 'lifo';
  proxy?: {
    host: string;
    port: number;
    protocol?: 'http' | 'https';
    auth?: {
      username: string;
      password: string;
    };
  };
  maxRedirects: number;
  followRedirects: boolean;
  httpAgent?: {
    keepAlive: boolean;
    maxSockets: number;
  };
  httpsAgent?: {
    keepAlive: boolean;
    maxSockets: number;
  };
};

export type YahooFinanceConfig = {
  apiKey?: string;
  apiSecret?: string;
  baseUrl: string;
  timeoutMs: number;
  userAgent?: string;
  maxConcurrentRequests: number;
  requestQueueSize: number;
  validateResponses: boolean;
  strictMode: boolean;
};

export type MCPServerConfig = {
  serverInfo: {
    name: string;
    version: string;
    protocolVersion: string;
    [key: string]: unknown;
  };
  capabilities: {
    tools: {
      listChanged?: boolean;
    };
    resources?: {
      subscribe?: boolean;
      listChanged?: boolean;
    };
    prompts?: {
      listChanged?: boolean;
    };
    logging?: {
      level?: 'debug' | 'info' | 'notice' | 'warning' | 'error' | 'critical' | 'alert' | 'emergency';
    };
  };
  transport: 'stdio' | 'sse';
  port?: number;
  host?: string;
  rateLimit: RateLimitConfig;
  cache: CacheConfig;
  retry: RetryConfig;
  circuitBreaker: CircuitBreakerConfig;
  queue: QueueConfig;
  dataCompletion: DataCompletionConfig;
  logging: LoggingConfig;
  network: NetworkConfig;
  yahooFinance: YahooFinanceConfig;
  [key: string]: unknown;
};


