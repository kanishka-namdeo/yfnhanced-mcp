import { YahooFinanceError, YF_ERR_RATE_LIMIT } from '../types/errors.js';
import type { RateLimitConfig } from '../types/config.js';

export class RateLimitError extends YahooFinanceError {
  retryAfter?: number;
  limit?: number;
  remaining?: number;
  reset?: Date;

  constructor(
    message: string,
    retryAfter?: number,
    limit?: number,
    remaining?: number,
    reset?: Date
  ) {
    super(
      message,
      YF_ERR_RATE_LIMIT,
      429,
      true,
      true,
      { retryAfter, limit, remaining, reset },
      'Wait and retry with exponential backoff'
    );
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
    this.limit = limit;
    this.remaining = remaining;
    this.reset = reset;
  }
}

export class TokenBucket {
  refillRate: number;
  capacity: number;
  tokens: number;
  lastRefill: number;

  constructor(refillRate: number, capacity: number) {
    this.refillRate = refillRate;
    this.capacity = capacity;
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }

  refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    const tokensToAdd = elapsed * this.refillRate;
    this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }

  consume(tokens: number): boolean {
    this.refill();
    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return true;
    }
    return false;
  }

  getTokens(): number {
    this.refill();
    return this.tokens;
  }

  waitForTokens(tokens: number): number {
    this.refill();
    if (this.tokens >= tokens) {
      return 0;
    }
    const needed = tokens - this.tokens;
    return (needed / this.refillRate) * 1000;
  }
}

export class RateLimitTracker {
  minuteWindow: Map<number, number>;
  hourWindow: Map<number, number>;
  perMinuteLimit: number;
  perHourLimit: number;

  constructor(perMinuteLimit: number, perHourLimit: number) {
    this.minuteWindow = new Map();
    this.hourWindow = new Map();
    this.perMinuteLimit = perMinuteLimit;
    this.perHourLimit = perHourLimit;
  }

  trackRequest(endpoint: string): void {
    const now = Date.now();
    const currentMinute = Math.floor(now / 60000);
    const currentHour = Math.floor(now / 3600000);

    this.minuteWindow.set(currentMinute, (this.minuteWindow.get(currentMinute) || 0) + 1);
    this.hourWindow.set(currentHour, (this.hourWindow.get(currentHour) || 0) + 1);

    this.cleanup();
  }

  getMinuteCount(): number {
    const now = Date.now();
    const currentMinute = Math.floor(now / 60000);
    return this.minuteWindow.get(currentMinute) || 0;
  }

  getHourCount(): number {
    const now = Date.now();
    const currentHour = Math.floor(now / 3600000);
    return this.hourWindow.get(currentHour) || 0;
  }

  isExceeded(): boolean {
    return this.getMinuteCount() >= this.perMinuteLimit || this.getHourCount() >= this.perHourLimit;
  }

  getRemaining(): { minute: number; hour: number } {
    return {
      minute: Math.max(0, this.perMinuteLimit - this.getMinuteCount()),
      hour: Math.max(0, this.perHourLimit - this.getHourCount())
    };
  }

  cleanup(): void {
    const now = Date.now();
    const currentMinute = Math.floor(now / 60000);
    const currentHour = Math.floor(now / 3600000);

    for (const [minute] of this.minuteWindow) {
      if (minute < currentMinute - 1) {
        this.minuteWindow.delete(minute);
      }
    }

    for (const [hour] of this.hourWindow) {
      if (hour < currentHour - 1) {
        this.hourWindow.delete(hour);
      }
    }
  }

  reset(): void {
    this.minuteWindow.clear();
    this.hourWindow.clear();
  }
}

export class AdaptiveThrottling {
  currentLimit: number;
  minLimit: number;
  maxLimit: number;
  adjustmentFactor: number;
  consecutiveSuccesses: number;
  consecutiveFailures: number;
  responseHeaders: Map<string, string>;

  constructor(initialLimit: number, minLimit: number, maxLimit: number) {
    this.currentLimit = initialLimit;
    this.minLimit = minLimit;
    this.maxLimit = maxLimit;
    this.adjustmentFactor = 0.1;
    this.consecutiveSuccesses = 0;
    this.consecutiveFailures = 0;
    this.responseHeaders = new Map();
  }

  adjustLimits(responseHeaders: Headers): void {
    const rateLimitLimit = responseHeaders.get('x-ratelimit-limit');
    const rateLimitRemaining = responseHeaders.get('x-ratelimit-remaining');
    const rateLimitReset = responseHeaders.get('x-ratelimit-reset');
    const retryAfter = responseHeaders.get('retry-after');

    if (rateLimitLimit) {
      const limit = parseInt(rateLimitLimit, 10);
      if (!isNaN(limit)) {
        this.currentLimit = Math.max(this.minLimit, Math.min(this.maxLimit, limit));
      }
    }

    if (rateLimitRemaining) {
      const remaining = parseInt(rateLimitRemaining, 10);
      if (!isNaN(remaining)) {
        this.responseHeaders.set('x-ratelimit-remaining', rateLimitRemaining);
        if (remaining < this.currentLimit * 0.2) {
          this.consecutiveFailures++;
          this.consecutiveSuccesses = 0;
          this.decreaseLimit();
        } else {
          this.consecutiveSuccesses++;
          this.consecutiveFailures = 0;
          if (this.consecutiveSuccesses >= 5) {
            this.increaseLimit();
          }
        }
      }
    }

    if (retryAfter) {
      const retrySeconds = parseInt(retryAfter, 10);
      if (!isNaN(retrySeconds)) {
        this.responseHeaders.set('retry-after', retryAfter);
        this.consecutiveFailures++;
        this.consecutiveSuccesses = 0;
        this.decreaseLimit();
      }
    }

    this.responseHeaders.set('x-ratelimit-limit', String(this.currentLimit));
  }

  predictThrottle(): boolean {
    const remaining = this.getRemaining();
    const usageRatio = 1 - (remaining / this.currentLimit);
    return usageRatio > 0.8 || this.consecutiveFailures >= 2;
  }

  getCurrentLimit(): number {
    return this.currentLimit;
  }

  getRemaining(): number {
    const remainingHeader = this.responseHeaders.get('x-ratelimit-remaining');
    if (remainingHeader) {
      return parseInt(remainingHeader, 10);
    }
    return this.currentLimit;
  }

  getRetryAfter(): number | undefined {
    const retryAfter = this.responseHeaders.get('retry-after');
    if (retryAfter) {
      return parseInt(retryAfter, 10);
    }
    return undefined;
  }

  decreaseLimit(): void {
    const newLimit = Math.floor(this.currentLimit * (1 - this.adjustmentFactor));
    this.currentLimit = Math.max(this.minLimit, newLimit);
  }

  increaseLimit(): void {
    const newLimit = Math.floor(this.currentLimit * (1 + this.adjustmentFactor));
    this.currentLimit = Math.min(this.maxLimit, newLimit);
  }

  reset(): void {
    this.currentLimit = this.maxLimit;
    this.consecutiveSuccesses = 0;
    this.consecutiveFailures = 0;
    this.responseHeaders.clear();
  }
}

export class RateLimiter {
  private tokenBucket: TokenBucket;
  private tracker: RateLimitTracker;
  private adaptiveThrottling: AdaptiveThrottling;
  private endpointLimits: Map<string, RateLimitTracker>;
  private endpointConcurrent: Map<string, number>;
  private burstLimit: number;
  private concurrentRequests: number;
  private maxConcurrent: number;
  private queue: Array<() => void>;
  private isProcessingQueue: boolean;
  private config: RateLimitConfig;
  private cache?: { get: (key: string) => Promise<unknown>; set: (key: string, value: unknown, ttl?: number) => Promise<void> };
  private rejectedRequests: number;
  private totalRequests: number;
  private delayFn?: (ms: number) => Promise<void>;

  constructor(config: RateLimitConfig) {
    this.config = config;
    const refillRate = config.tokenRefillRate || 1;
    const capacity = config.maxRequests;
    this.tokenBucket = new TokenBucket(refillRate, capacity);
    this.tracker = new RateLimitTracker(
      config.maxRequests,
      config.maxRequests * 60
    );
    this.adaptiveThrottling = new AdaptiveThrottling(
      config.maxRequests,
      Math.floor(config.maxRequests * 0.25),
      config.maxRequests
    );
    this.endpointLimits = new Map();
    this.endpointConcurrent = new Map();
    this.burstLimit = 5;
    this.concurrentRequests = 0;
    this.maxConcurrent = config.maxRequests || 10;
    this.queue = [];
    this.isProcessingQueue = false;
    this.rejectedRequests = 0;
    this.totalRequests = 0;
  }

  setCache(cache: { get: (key: string) => Promise<unknown>; set: (key: string, value: unknown, ttl?: number) => Promise<void> }): void {
    this.cache = cache;
  }

  setBurstLimit(limit: number): void {
    this.burstLimit = limit;
    this.maxConcurrent = limit;
  }

  async acquire(): Promise<void> {
    if (this.concurrentRequests >= this.maxConcurrent) {
      await this.waitForSlot();
    }

    if (this.predictiveThrottle()) {
      this.rejectedRequests++;
      throw new RateLimitError(
        'Predictive rate limit triggered to avoid hard limit',
        this.getBackoffDuration(),
        this.adaptiveThrottling.getCurrentLimit(),
        this.adaptiveThrottling.getRemaining()
      );
    }

    if (!this.tokenBucket.consume(1)) {
      const waitTime = this.tokenBucket.waitForTokens(1);
      this.rejectedRequests++;
      throw new RateLimitError(
        'Rate limit exceeded',
        Math.ceil(waitTime / 1000),
        this.adaptiveThrottling.getCurrentLimit(),
        this.adaptiveThrottling.getRemaining()
      );
    }

    this.concurrentRequests++;
  }

  release(): void {
    this.concurrentRequests--;
    this.processQueue();
  }

  async execute<T>(fn: () => Promise<T>, endpoint?: string): Promise<T> {
    const endpointKey = endpoint || 'default';
    
    // Initialize endpoint concurrent counter
    if (!this.endpointConcurrent.has(endpointKey)) {
      this.endpointConcurrent.set(endpointKey, 0);
    }
    
    // Check per-endpoint concurrent limit
    const currentEndpointConcurrent = this.endpointConcurrent.get(endpointKey) || 0;
    if (currentEndpointConcurrent >= this.config.maxRequests) {
      this.rejectedRequests++;
      throw new RateLimitError(
        'Rate limit exceeded',
        1,
        this.config.maxRequests,
        this.config.maxRequests - currentEndpointConcurrent
      );
    }
    
    // Initialize endpoint tracker
    let endpointTracker = this.endpointLimits.get(endpointKey);
    if (!endpointTracker) {
      endpointTracker = new RateLimitTracker(
        this.config.requestsPerMinute || this.config.maxRequests,
        this.config.requestsPerHour || this.config.maxRequests * 60
      );
      this.endpointLimits.set(endpointKey, endpointTracker);
    }

    // Check time window limits before executing
    endpointTracker.trackRequest(endpointKey);
    if (endpointTracker.isExceeded()) {
      this.rejectedRequests++;
      throw new RateLimitError(
        'Rate limit exceeded',
        60,
        this.config.maxRequests,
        endpointTracker.getRemaining().minute
      );
    }

    await this.acquire();
    this.totalRequests++;
    this.endpointConcurrent.set(endpointKey, (this.endpointConcurrent.get(endpointKey) || 0) + 1);
    this.tracker.trackRequest(endpointKey);

    try {
      const result = await fn();
      this.adaptiveThrottling.consecutiveSuccesses++;
      return result;
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('429') || error.message.includes('rate limit')) {
          const cachedData = await this.tryGetFromCache(endpointKey);
          if (cachedData !== null) {
            return cachedData as T;
          }
          this.adaptiveThrottling.consecutiveFailures++;
          throw new RateLimitError(
            'Rate limit exceeded, falling back to cached data',
            60,
            this.adaptiveThrottling.getCurrentLimit(),
            this.adaptiveThrottling.getRemaining()
          );
        }
      }
      throw error;
    } finally {
      this.release();
      this.endpointConcurrent.set(endpointKey, (this.endpointConcurrent.get(endpointKey) || 0) - 1);
    }
  }

  isRateLimited(): boolean {
    return (
      this.tracker.isExceeded() ||
      this.concurrentRequests >= this.maxConcurrent ||
      this.tokenBucket.getTokens() <= 0 ||
      this.predictiveThrottle()
    );
  }

  getBackoffDuration(): number {
    const waitTime = this.tokenBucket.waitForTokens(1);
    const adaptiveBackoff = this.adaptiveThrottling.getRetryAfter() || 0;
    return Math.max(Math.ceil(waitTime / 1000), adaptiveBackoff);
  }

  predictiveThrottle(): boolean {
    const remaining = this.adaptiveThrottling.getRemaining();
    const currentLimit = this.adaptiveThrottling.getCurrentLimit();
    const usageRatio = 1 - (remaining / currentLimit);
    return usageRatio > 0.7 || this.adaptiveThrottling.predictThrottle();
  }

  updateFromHeaders(headers: Headers): void {
    this.adaptiveThrottling.adjustLimits(headers);
  }

  private async waitForSlot(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
      if (!this.isProcessingQueue) {
        this.processQueue();
      }
    });
  }

  private processQueue(): void {
    if (this.isProcessingQueue || this.queue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    const interval = setInterval(() => {
      if (this.concurrentRequests < this.maxConcurrent) {
        const next = this.queue.shift();
        if (next) {
          next();
        }
      }

      if (this.queue.length === 0) {
        clearInterval(interval);
        this.isProcessingQueue = false;
      }
    }, 100);
  }

  private async tryGetFromCache(key: string): Promise<unknown | null> {
    if (!this.cache) {
      return null;
    }
    try {
      return await this.cache.get(`rate_limited_${key}`);
    } catch {
      return null;
    }
  }

  getStats(): {
    tokens: number;
    concurrentRequests: number;
    minuteCount: number;
    hourCount: number;
    currentLimit: number;
    queueLength: number;
    isRateLimited: boolean;
    totalRequests: number;
    rejectedRequests: number;
    availableTokens: number;
  } {
    return {
      tokens: this.tokenBucket.getTokens(),
      concurrentRequests: this.concurrentRequests,
      minuteCount: this.tracker.getMinuteCount(),
      hourCount: this.tracker.getHourCount(),
      currentLimit: this.adaptiveThrottling.getCurrentLimit(),
      queueLength: this.queue.length,
      isRateLimited: this.isRateLimited(),
      totalRequests: this.totalRequests,
      rejectedRequests: this.rejectedRequests,
      availableTokens: this.tokenBucket.getTokens()
    };
  }

  reset(): void {
    this.tokenBucket = new TokenBucket(
      this.config.tokenRefillRate || 1,
      this.config.maxRequests
    );
    this.tracker.reset();
    this.adaptiveThrottling.reset();
    this.endpointLimits.clear();
    this.endpointConcurrent.clear();
    this.concurrentRequests = 0;
    this.queue = [];
    this.isProcessingQueue = false;
    this.rejectedRequests = 0;
    this.totalRequests = 0;
  }

  getConfig(): RateLimitConfig {
    return { ...this.config };
  }

  updateConfig(config: Partial<RateLimitConfig>): void {
    this.config = { ...this.config, ...config };
    if (config.maxRequests) {
      this.tokenBucket.capacity = config.maxRequests;
      this.tokenBucket.refillRate = config.tokenRefillRate || 1;
    }
  }
}
