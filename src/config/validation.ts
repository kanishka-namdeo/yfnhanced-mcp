import { z } from 'zod';

export const RateLimitConfigSchema = z.object({
  requestsPerMinute: z.number().int().positive(),
  requestsPerHour: z.number().int().positive(),
  burstLimit: z.number().int().positive(),
  backoffMultiplier: z.number().positive(),
  maxBackoffSeconds: z.number().int().positive(),
  retryCount: z.number().int().nonnegative(),
  circuitBreakerThreshold: z.number().int().positive(),
  circuitBreakerResetMs: z.number().int().positive()
});

export const CacheConfigSchema = z.object({
  ttlQuotes: z.number().int().nonnegative(),
  ttlHistorical: z.number().int().nonnegative(),
  ttlFinancials: z.number().int().nonnegative(),
  ttlNews: z.number().int().nonnegative(),
  ttlAnalysis: z.number().int().nonnegative(),
  maxCacheSize: z.number().int().positive(),
  cacheStrategy: z.enum(['lru', 'lfu', 'fifo'])
});

export const RetryConfigSchema = z.object({
  maxRetries: z.number().int().nonnegative(),
  baseDelay: z.number().int().nonnegative(),
  maxDelay: z.number().int().positive(),
  jitter: z.boolean(),
  jitterFactor: z.number().min(0).max(1),
  retryableStatusCodes: z.array(z.number().int().positive()),
  retryableErrors: z.array(z.string())
});

export const CircuitBreakerConfigSchema = z.object({
  failureThreshold: z.number().int().positive(),
  successThreshold: z.number().int().positive(),
  timeout: z.number().int().positive(),
  monitoringWindow: z.number().int().positive()
});

export const QueueConfigSchema = z.object({
  maxConcurrent: z.number().int().positive(),
  maxQueueSize: z.number().int().positive(),
  priorityLevels: z.number().int().positive(),
  queueTimeout: z.number().int().nonnegative(),
  batchWindow: z.number().int().nonnegative()
});

export const DataCompletionConfigSchema = z.object({
  enableFallback: z.boolean(),
  fallbackPriority: z.array(z.string()),
  fillMissingFields: z.boolean(),
  validateCompleteness: z.boolean()
});

export const LoggingConfigSchema = z.object({
  level: z.enum(['debug', 'info', 'warn', 'error']),
  format: z.enum(['json', 'text']),
  destination: z.enum(['console', 'file', 'both']),
  filePath: z.string().optional(),
  maxSize: z.number().int().positive().optional(),
  maxFiles: z.number().int().positive().optional(),
  includeTimestamp: z.boolean().optional(),
  includeLevel: z.boolean().optional(),
  includeContext: z.boolean().optional(),
  prettyPrint: z.boolean().optional(),
  colorize: z.boolean().optional()
});

export const NetworkConfigSchema = z.object({
  timeoutMs: z.number().int().positive(),
  keepAlive: z.boolean(),
  keepAliveMsecs: z.number().int().positive(),
  maxSockets: z.number().int().positive(),
  maxFreeSockets: z.number().int().positive(),
  scheduling: z.enum(['fifo', 'lifo']),
  proxy: z.object({
    host: z.string(),
    port: z.number().int().positive(),
    protocol: z.enum(['http', 'https']).optional(),
    auth: z.object({
      username: z.string(),
      password: z.string()
    }).optional()
  }).optional(),
  maxRedirects: z.number().int().positive(),
  followRedirects: z.boolean(),
  httpAgent: z.object({
    keepAlive: z.boolean(),
    maxSockets: z.number().int().positive()
  }).optional(),
  httpsAgent: z.object({
    keepAlive: z.boolean(),
    maxSockets: z.number().int().positive()
  }).optional()
});

export const YahooFinanceConfigSchema = z.object({
  apiKey: z.string().optional(),
  apiSecret: z.string().optional(),
  baseUrl: z.string(),
  timeoutMs: z.number().int().positive(),
  userAgent: z.string().optional(),
  maxConcurrentRequests: z.number().int().positive(),
  requestQueueSize: z.number().int().positive(),
  validateResponses: z.boolean(),
  strictMode: z.boolean()
});

export const ServerInfoConfigSchema = z.object({
  name: z.string(),
  version: z.string(),
  protocolVersion: z.string()
});

export const CapabilitiesConfigSchema = z.object({
  tools: z.object({
    listChanged: z.boolean().optional()
  }),
  resources: z.object({
    subscribe: z.boolean().optional(),
    listChanged: z.boolean().optional()
  }).optional(),
  prompts: z.object({
    listChanged: z.boolean().optional()
  }).optional(),
  logging: z.object({
    level: z.enum(['debug', 'info', 'notice', 'warning', 'error', 'critical', 'alert', 'emergency']).optional()
  }).optional()
});

export const AppConfigSchema = z.object({
  rateLimit: RateLimitConfigSchema,
  cache: CacheConfigSchema,
  retry: RetryConfigSchema,
  circuitBreaker: CircuitBreakerConfigSchema,
  queue: QueueConfigSchema,
  dataCompletion: DataCompletionConfigSchema,
  logging: LoggingConfigSchema,
  network: NetworkConfigSchema,
  yahooFinance: YahooFinanceConfigSchema,
  serverInfo: ServerInfoConfigSchema,
  capabilities: CapabilitiesConfigSchema
});
