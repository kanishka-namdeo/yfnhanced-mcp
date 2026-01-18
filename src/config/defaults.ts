export interface RateLimitConfig {
  requestsPerMinute: number;
  requestsPerHour: number;
  burstLimit: number;
  backoffMultiplier: number;
  maxBackoffSeconds: number;
  retryCount: number;
  circuitBreakerThreshold: number;
  circuitBreakerResetMs: number;
}

export interface CacheConfig {
  ttlQuotes: number;
  ttlHistorical: number;
  ttlFinancials: number;
  ttlNews: number;
  ttlAnalysis: number;
  maxCacheSize: number;
  cacheStrategy: 'lru' | 'lfu' | 'fifo';
}

export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  jitter: boolean;
  jitterFactor: number;
  retryableStatusCodes: number[];
  retryableErrors: string[];
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  successThreshold: number;
  timeout: number;
  monitoringWindow: number;
}

export interface QueueConfig {
  maxConcurrent: number;
  maxQueueSize: number;
  priorityLevels: number;
  queueTimeout: number;
  batchWindow: number;
}

export interface DataCompletionConfig {
  enableFallback: boolean;
  fallbackPriority: string[];
  fillMissingFields: boolean;
  validateCompleteness: boolean;
}

export interface LoggingConfig {
  level: 'debug' | 'info' | 'warn' | 'error';
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
}

export interface NetworkConfig {
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
}

export interface YahooFinanceConfig {
  apiKey?: string;
  apiSecret?: string;
  baseUrl: string;
  timeoutMs: number;
  userAgent?: string;
  maxConcurrentRequests: number;
  requestQueueSize: number;
  validateResponses: boolean;
  strictMode: boolean;
}

export interface ServerInfoConfig {
  name: string;
  version: string;
  protocolVersion: string;
  [key: string]: unknown;
}

export interface CapabilitiesConfig {
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
}

export interface AppConfig {
  rateLimit: RateLimitConfig;
  cache: CacheConfig;
  retry: RetryConfig;
  circuitBreaker: CircuitBreakerConfig;
  queue: QueueConfig;
  dataCompletion: DataCompletionConfig;
  logging: LoggingConfig;
  network: NetworkConfig;
  yahooFinance: YahooFinanceConfig;
  serverInfo: ServerInfoConfig;
  capabilities: CapabilitiesConfig;
}

export const defaultRateLimitConfig: RateLimitConfig = {
  requestsPerMinute: 60,
  requestsPerHour: 1500,
  burstLimit: 5,
  backoffMultiplier: 2,
  maxBackoffSeconds: 300,
  retryCount: 3,
  circuitBreakerThreshold: 5,
  circuitBreakerResetMs: 60000
};

export const defaultCacheConfig: CacheConfig = {
  ttlQuotes: 60000,
  ttlHistorical: 3600000,
  ttlFinancials: 86400000,
  ttlNews: 300000,
  ttlAnalysis: 3600000,
  maxCacheSize: 1000,
  cacheStrategy: 'lru'
};

export const defaultRetryConfig: RetryConfig = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 30000,
  jitter: true,
  jitterFactor: 0.1,
  retryableStatusCodes: [429, 500, 502, 503, 504],
  retryableErrors: ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND']
};

export const defaultCircuitBreakerConfig: CircuitBreakerConfig = {
  failureThreshold: 5,
  successThreshold: 2,
  timeout: 60000,
  monitoringWindow: 60000
};

export const defaultQueueConfig: QueueConfig = {
  maxConcurrent: 5,
  maxQueueSize: 100,
  priorityLevels: 3,
  queueTimeout: 30000,
  batchWindow: 100
};

export const defaultDataCompletionConfig: DataCompletionConfig = {
  enableFallback: true,
  fallbackPriority: ['cache', 'alternative'],
  fillMissingFields: true,
  validateCompleteness: true
};

export const defaultLoggingConfig: LoggingConfig = {
  level: 'info',
  format: 'json',
  destination: 'console'
};

export const defaultNetworkConfig: NetworkConfig = {
  timeoutMs: 30000,
  keepAlive: true,
  keepAliveMsecs: 1000,
  maxSockets: 50,
  maxFreeSockets: 10,
  scheduling: 'fifo',
  maxRedirects: 5,
  followRedirects: true
};

export const defaultYahooFinanceConfig: YahooFinanceConfig = {
  baseUrl: 'https://query1.finance.yahoo.com',
  timeoutMs: 10000,
  maxConcurrentRequests: 5,
  requestQueueSize: 100,
  validateResponses: true,
  strictMode: false
};

export const defaultServerInfoConfig: ServerInfoConfig = {
  name: 'y-finance-mcp-server',
  version: '1.0.0',
  protocolVersion: '1.0'
};

export const defaultCapabilitiesConfig: CapabilitiesConfig = {
  tools: {},
  resources: {},
  prompts: {}
};

export const defaultConfig: AppConfig = {
  rateLimit: defaultRateLimitConfig,
  cache: defaultCacheConfig,
  retry: defaultRetryConfig,
  circuitBreaker: defaultCircuitBreakerConfig,
  queue: defaultQueueConfig,
  dataCompletion: defaultDataCompletionConfig,
  logging: defaultLoggingConfig,
  network: defaultNetworkConfig,
  yahooFinance: defaultYahooFinanceConfig,
  serverInfo: defaultServerInfoConfig,
  capabilities: defaultCapabilitiesConfig
};
