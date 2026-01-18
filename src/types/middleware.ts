import type { RateLimitConfig, CacheConfig, RetryConfig, CircuitBreakerConfig, QueueConfig } from './config.js';
import type { YahooFinanceError } from './errors.js';

export type { RateLimitConfig, CacheConfig, RetryConfig, CircuitBreakerConfig, QueueConfig };

export type RequestInfo = {
  id: string;
  timestamp: Date;
  method: string;
  path: string;
  headers: Record<string, string>;
  body: unknown;
  query: Record<string, string>;
  ip?: string;
  userAgent?: string;
  [key: string]: unknown;
};

export type ResponseInfo = {
  statusCode: number;
  headers: Record<string, string>;
  body: unknown;
  durationMs: number;
  [key: string]: unknown;
};

export type MiddlewareContext = {
  request: RequestInfo;
  response?: ResponseInfo;
  metadata: Record<string, unknown>;
  startTime: Date;
  [key: string]: unknown;
};

export type RateLimitResult = {
  limit: number;
  remaining: number;
  reset: Date;
  retryAfter?: number;
  exceeded: boolean;
};

export type RateLimiterInterface = {
  hit(key: string, points?: number): Promise<RateLimitResult>;
  consume(key: string, points?: number): Promise<RateLimitResult>;
  check(key: string): Promise<boolean>;
  getRemaining(key: string): Promise<number>;
  reset(key: string): Promise<void>;
  resetAll(): Promise<void>;
  getConfig(): RateLimitConfig;
  updateConfig(config: Partial<RateLimitConfig>): void;
};

export type CacheEntry<T = unknown> = {
  key: string;
  value: T;
  timestamp: Date;
  ttl: number;
  expiresAt: Date;
  hits: number;
  size: number;
  metadata?: Record<string, unknown>;
};

export type CacheStats = {
  hits: number;
  misses: number;
  hitRate: number;
  entries: number;
  totalSize: number;
  keys: string[];
  oldestEntry?: CacheEntry;
  newestEntry?: CacheEntry;
};

export type CacheInterface<T = unknown> = {
  get(key: string): Promise<T | null>;
  set(key: string, value: T, ttl?: number): Promise<void>;
  delete(key: string): Promise<boolean>;
  has(key: string): Promise<boolean>;
  clear(): Promise<void>;
  keys(): Promise<string[]>;
  getStats(): CacheStats;
  getEntry(key: string): Promise<CacheEntry<T> | null>;
  touch(key: string, ttl?: number): Promise<boolean>;
  mget(keys: string[]): Promise<(T | null)[]>;
  mset(entries: Array<{ key: string; value: T; ttl?: number }>): Promise<void>;
  mdelete(keys: string[]): Promise<number>;
  scan(pattern: string, count?: number): Promise<string[]>;
  getConfig(): CacheConfig;
  updateConfig(config: Partial<CacheConfig>): void;
};

export type RetryAttempt = {
  attempt: number;
  delayMs: number;
  error: Error;
  timestamp: Date;
  [key: string]: unknown;
};

export type RetryResult<T = unknown> = {
  success: boolean;
  result?: T;
  error?: Error;
  attempts: number;
  totalDurationMs: number;
  attemptsHistory: RetryAttempt[];
  [key: string]: unknown;
};

export type RetryPolicyInterface<T = unknown> = {
  execute(fn: () => Promise<T>): Promise<RetryResult<T>>;
  executeWithRetry(fn: () => Promise<T>, maxRetries?: number): Promise<T>;
  shouldRetry(error: Error, attempt: number): boolean;
  calculateDelay(attempt: number): number;
  getConfig(): RetryConfig;
  updateConfig(config: Partial<RetryConfig>): void;
  reset(): void;
};

export type CircuitBreakerStateInfo = {
  state: 'closed' | 'open' | 'half-open';
  stateStartTime: Date;
  failureCount: number;
  successCount: number;
  lastFailureTime?: Date;
  lastSuccessTime?: Date;
  nextAttemptTime?: Date;
};

export type CircuitBreakerMetrics = {
  failureRate: number;
  successRate: number;
  totalRequests: number;
  totalFailures: number;
  totalSuccesses: number;
  rollingFailureCount: number;
  rollingSuccessCount: number;
  rollingWindowStart: Date;
};

export type CircuitBreakerInterface<T = unknown> = {
  execute(fn: () => Promise<T>): Promise<T>;
  getState(): CircuitBreakerStateInfo;
  getMetrics(): CircuitBreakerMetrics;
  isOpen(): boolean;
  isClosed(): boolean;
  isHalfOpen(): boolean;
  forceOpen(): void;
  forceClose(): void;
  reset(): void;
  recordSuccess(): void;
  recordFailure(): void;
  getConfig(): CircuitBreakerConfig;
  updateConfig(config: Partial<CircuitBreakerConfig>): void;
};

export type QueueItem<T = unknown> = {
  id: string;
  data: T;
  priority: number;
  addedAt: Date;
  attempts: number;
  maxAttempts: number;
  timeoutMs: number;
  metadata?: Record<string, unknown>;
};

export type QueueStats = {
  size: number;
  processing: number;
  completed: number;
  failed: number;
  totalProcessed: number;
  avgProcessingTimeMs: number;
  maxProcessingTimeMs: number;
  minProcessingTimeMs: number;
};

export type QueueInterface<T = unknown> = {
  add(item: T, priority?: number): Promise<string>;
  addMultiple(items: T[]): Promise<string[]>;
  get(): Promise<QueueItem<T> | null>;
  process(handler: (item: T) => Promise<unknown>): Promise<void>;
  peek(): Promise<QueueItem<T> | null>;
  remove(id: string): Promise<boolean>;
  clear(): Promise<void>;
  pause(): void;
  resume(): void;
  isPaused(): boolean;
  getSize(): number;
  getStats(): QueueStats;
  getConfig(): QueueConfig;
  updateConfig(config: Partial<QueueConfig>): void;
};

export type DataQualityIssue = {
  field: string;
  issue: 'missing' | 'null' | 'invalid' | 'out-of-range' | 'type-mismatch';
  severity: 'error' | 'warning' | 'info';
  value?: unknown;
  expectedType?: string;
  expectedRange?: { min: number; max: number };
  message: string;
};

export type DataQualityReport = {
  isValid: boolean;
  completeness: number;
  score: number;
  issues: DataQualityIssue[];
  missingFields: string[];
  invalidFields: string[];
  warnings: string[];
  metadata: {
    timestamp: Date;
    dataSize: number;
    checkedFields: string[];
    validationTimeMs: number;
  };
};

export type DataQualityInterface = {
  validate(data: unknown, schema?: unknown): Promise<DataQualityReport>;
  checkCompleteness(data: unknown, requiredFields: string[]): Promise<number>;
  checkDataTypes(data: unknown, schema: unknown): Promise<DataQualityReport>;
  sanitize<T>(data: unknown): Promise<T>;
  enrich<T>(data: T, fallbackData: Partial<T>): Promise<T>;
  getQualityReport(data: unknown): DataQualityReport;
  generateReport(issues: DataQualityIssue[]): DataQualityReport;
};

export type MiddlewareFunction<T = unknown> = (
  context: MiddlewareContext,
  next: () => Promise<T>
) => Promise<T>;

export type MiddlewareChain = {
  use(middleware: MiddlewareFunction): void;
  execute(context: MiddlewareContext): Promise<unknown>;
  clear(): void;
  getMiddlewares(): MiddlewareFunction[];
};

export type ErrorHandler<T = unknown> = (
  error: Error | YahooFinanceError,
  context: MiddlewareContext
) => Promise<T>;

export type ErrorHandlingConfig = {
  logErrors: boolean;
  exposeErrors: boolean;
  defaultStatusCode: number;
  defaultMessage: string;
  errorMapper?: Record<string, { statusCode: number; message: string }>;
  onHandle?: (error: Error, context: MiddlewareContext) => void;
};

export type LoggerInterface = {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, error?: Error, meta?: Record<string, unknown>): void;
  child(meta: Record<string, unknown>): LoggerInterface;
  setLevel(level: 'debug' | 'info' | 'warn' | 'error'): void;
  getLevel(): string;
};

export type MetricsCollector = {
  incrementCounter(name: string, value?: number, tags?: Record<string, string>): void;
  recordGauge(name: string, value: number, tags?: Record<string, string>): void;
  recordTiming(name: string, value: number, tags?: Record<string, string>): void;
  recordHistogram(name: string, value: number, tags?: Record<string, string>): void;
  flush(): Promise<void>;
  reset(): void;
  getMetrics(): Record<string, unknown>;
};

export type TelemetryConfig = {
  enabled: boolean;
  serviceName: string;
  serviceVersion: string;
  environment: string;
  sampleRate: number;
  endpoint?: string;
  headers?: Record<string, string>;
  maxQueueSize: number;
  flushIntervalMs: number;
  timeoutMs: number;
  onError?: (error: Error) => void;
};

export type TelemetryInterface = {
  trackEvent(name: string, properties?: Record<string, unknown>): void;
  trackException(error: Error, properties?: Record<string, unknown>): void;
  trackMetric(name: string, value: number, properties?: Record<string, unknown>): void;
  trackDependency(name: string, command: string, durationMs: number, success: boolean): void;
  trackTrace(message: string, severity?: 'verbose' | 'information' | 'warning' | 'error' | 'critical'): void;
  flush(): Promise<void>;
  isEnabled(): boolean;
};

export type HealthCheckResult = {
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: Array<{
    name: string;
    status: 'pass' | 'fail' | 'warn';
    message?: string;
    durationMs: number;
    metadata?: Record<string, unknown>;
  }>;
  durationMs: number;
  timestamp: Date;
  version: string;
};

export type HealthCheckInterface = {
  check(): Promise<HealthCheckResult>;
  registerCheck(name: string, check: () => Promise<boolean>, timeoutMs?: number): void;
  unregisterCheck(name: string): void;
  getChecks(): string[];
  getStatus(): 'healthy' | 'degraded' | 'unhealthy';
};
