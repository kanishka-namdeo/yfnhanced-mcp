import { TokenBucket, RateLimitTracker, AdaptiveThrottling, RateLimiter, RateLimitError } from '../../../src/middleware/rate-limiter';

describe('TokenBucket', () => {
  test('should initialize with correct capacity and refill rate', () => {
    const bucket = new TokenBucket(10, 100);
    expect(bucket.capacity).toBe(100);
    expect(bucket.refillRate).toBe(10);
    expect(bucket.tokens).toBe(100);
  });

  test('should consume tokens when available', () => {
    const bucket = new TokenBucket(10, 100);
    const result = bucket.consume(50);
    expect(result).toBe(true);
    expect(bucket.tokens).toBe(50);
  });

  test('should not consume tokens when insufficient', () => {
    const bucket = new TokenBucket(10, 100);
    bucket.tokens = 30;
    const result = bucket.consume(50);
    expect(result).toBe(false);
    expect(bucket.tokens).toBe(30);
  });

  test('should refill tokens over time', () => {
    const bucket = new TokenBucket(100, 100);
    bucket.tokens = 0;
    bucket.refillRate = 10;
    jest.spyOn(Date, 'now').mockReturnValueOnce(bucket.lastRefill + 1000);
    bucket.refill();
    expect(bucket.tokens).toBe(10);
  });

  test('should not exceed capacity when refilling', () => {
    const bucket = new TokenBucket(100, 100);
    bucket.tokens = 90;
    jest.spyOn(Date, 'now').mockReturnValueOnce(bucket.lastRefill + 2000);
    bucket.refill();
    expect(bucket.tokens).toBe(100);
  });

  test('should get current tokens count', () => {
    const bucket = new TokenBucket(10, 100);
    bucket.tokens = 75;
    expect(bucket.getTokens()).toBe(75);
  });

  test('should calculate wait time for tokens', () => {
    const bucket = new TokenBucket(10, 100);
    bucket.tokens = 90;
    const waitTime = bucket.waitForTokens(20);
    expect(waitTime).toBe(1000);
  });

  test('should return 0 wait time when tokens are available', () => {
    const bucket = new TokenBucket(10, 100);
    const waitTime = bucket.waitForTokens(50);
    expect(waitTime).toBe(0);
  });
});

describe('RateLimitTracker', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('should initialize with limits', () => {
    const tracker = new RateLimitTracker(60, 3600);
    expect(tracker.perMinuteLimit).toBe(60);
    expect(tracker.perHourLimit).toBe(3600);
  });

  test('should track requests correctly', () => {
    const tracker = new RateLimitTracker(60, 3600);
    tracker.trackRequest('test');
    expect(tracker.getMinuteCount()).toBe(1);
    expect(tracker.getHourCount()).toBe(1);
  });

  test('should detect when limits are exceeded', () => {
    const tracker = new RateLimitTracker(5, 3600);
    for (let i = 0; i < 5; i++) {
      tracker.trackRequest('test');
    }
    expect(tracker.isExceeded()).toBe(true);
  });

  test('should calculate remaining requests', () => {
    const tracker = new RateLimitTracker(60, 3600);
    tracker.trackRequest('test');
    const remaining = tracker.getRemaining();
    expect(remaining.minute).toBe(59);
    expect(remaining.hour).toBe(3599);
  });

  test('should cleanup old entries', () => {
    const tracker = new RateLimitTracker(60, 3600);
    const now = Date.now();
    jest.setSystemTime(now);
    tracker.trackRequest('test');

    jest.setSystemTime(now + 120000);
    tracker.trackRequest('test2');

    expect(tracker.getMinuteCount()).toBe(1);
  });

  test('should reset tracker', () => {
    const tracker = new RateLimitTracker(60, 3600);
    tracker.trackRequest('test');
    tracker.reset();
    expect(tracker.getMinuteCount()).toBe(0);
    expect(tracker.getHourCount()).toBe(0);
  });
});

describe('AdaptiveThrottling', () => {
  test('should initialize with limits', () => {
    const throttling = new AdaptiveThrottling(100, 25, 100);
    expect(throttling.currentLimit).toBe(100);
    expect(throttling.minLimit).toBe(25);
    expect(throttling.maxLimit).toBe(100);
  });

  test('should adjust limits based on response headers', () => {
    const throttling = new AdaptiveThrottling(100, 25, 100);
    const headers = new Headers();
    headers.set('x-ratelimit-limit', '50');
    throttling.adjustLimits(headers);
    expect(throttling.getCurrentLimit()).toBe(50);
  });

  test('should predict throttling based on usage ratio', () => {
    const throttling = new AdaptiveThrottling(100, 25, 100);
    throttling.responseHeaders.set('x-ratelimit-remaining', '10');
    const shouldThrottle = throttling.predictThrottle();
    expect(shouldThrottle).toBe(true);
  });

  test('should decrease limit on low remaining tokens', () => {
    const throttling = new AdaptiveThrottling(100, 25, 100);
    const headers = new Headers();
    headers.set('x-ratelimit-remaining', '5');
    throttling.adjustLimits(headers);
    expect(throttling.getCurrentLimit()).toBeLessThan(100);
  });

  test('should increase limit after consecutive successes', () => {
    const throttling = new AdaptiveThrottling(100, 25, 200);
    throttling.consecutiveSuccesses = 5;
    throttling.increaseLimit();
    expect(throttling.getCurrentLimit()).toBeGreaterThan(100);
  });

  test('should get remaining tokens', () => {
    const throttling = new AdaptiveThrottling(100, 25, 100);
    throttling.responseHeaders.set('x-ratelimit-remaining', '50');
    expect(throttling.getRemaining()).toBe(50);
  });

  test('should get retry after duration', () => {
    const throttling = new AdaptiveThrottling(100, 25, 100);
    const headers = new Headers();
    headers.set('retry-after', '60');
    throttling.adjustLimits(headers);
    expect(throttling.getRetryAfter()).toBe(60);
  });

  test('should reset to initial state', () => {
    const throttling = new AdaptiveThrottling(100, 25, 100);
    throttling.currentLimit = 50;
    throttling.consecutiveSuccesses = 3;
    throttling.reset();
    expect(throttling.getCurrentLimit()).toBe(100);
    expect(throttling.consecutiveSuccesses).toBe(0);
  });
});

describe('RateLimiter', () => {
  let rateLimiter: RateLimiter;

  beforeEach(() => {
    rateLimiter = new RateLimiter({
      strategy: 'token-bucket',
      maxRequests: 10,
      windowMs: 60000,
      tokenRefillRate: 1
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('should initialize with config', () => {
    expect(rateLimiter['config'].maxRequests).toBe(10);
  });

  test('should acquire token when available', async () => {
    await expect(rateLimiter.acquire()).resolves.not.toThrow();
  });

  test('should throw RateLimitError when tokens exhausted', async () => {
    for (let i = 0; i < 10; i++) {
      await rateLimiter.acquire();
    }
    await expect(rateLimiter.acquire()).rejects.toThrow(RateLimitError);
  });

  test('should release acquired tokens', async () => {
    await rateLimiter.acquire();
    expect(rateLimiter['concurrentRequests']).toBe(1);
    rateLimiter.release();
    expect(rateLimiter['concurrentRequests']).toBe(0);
  });

  test('should execute function with rate limiting', async () => {
    const fn = jest.fn().mockResolvedValue('result');
    const result = await rateLimiter.execute(fn);
    expect(result).toBe('result');
    expect(fn).toHaveBeenCalled();
  });

  test('should check if rate limited', () => {
    const isLimited = rateLimiter.isRateLimited();
    expect(typeof isLimited).toBe('boolean');
  });

  test('should get backoff duration', () => {
    const duration = rateLimiter.getBackoffDuration();
    expect(typeof duration).toBe('number');
    expect(duration).toBeGreaterThanOrEqual(0);
  });

  test('should update from response headers', () => {
    const headers = new Headers();
    headers.set('x-ratelimit-remaining', '5');
    expect(() => rateLimiter.updateFromHeaders(headers)).not.toThrow();
  });

  test('should get stats', () => {
    const stats = rateLimiter.getStats();
    expect(stats).toHaveProperty('tokens');
    expect(stats).toHaveProperty('concurrentRequests');
    expect(stats).toHaveProperty('minuteCount');
    expect(stats).toHaveProperty('hourCount');
    expect(stats).toHaveProperty('currentLimit');
    expect(stats).toHaveProperty('queueLength');
    expect(stats).toHaveProperty('isRateLimited');
  });

  test('should reset state', () => {
    rateLimiter.reset();
    const stats = rateLimiter.getStats();
    expect(stats.concurrentRequests).toBe(0);
    expect(stats.queueLength).toBe(0);
  });

  test('should get config', () => {
    const config = rateLimiter.getConfig();
    expect(config).toHaveProperty('maxRequests');
  });

  test('should update config', () => {
    rateLimiter.updateConfig({ maxRequests: 20 });
    expect(rateLimiter.getConfig().maxRequests).toBe(20);
  });

  test('should set cache', () => {
    const mockCache = {
      get: jest.fn(),
      set: jest.fn()
    };
    rateLimiter.setCache(mockCache);
    expect(rateLimiter['cache']).toBe(mockCache);
  });

  test('should set burst limit', () => {
    rateLimiter.setBurstLimit(10);
    expect(rateLimiter['maxConcurrent']).toBe(10);
  });

  test('should handle predictive throttling', () => {
    rateLimiter['adaptiveThrottling'].responseHeaders.set('x-ratelimit-remaining', '1');
    expect(rateLimiter.predictiveThrottle()).toBe(true);
  });
});

describe('RateLimitError', () => {
  test('should create error with correct properties', () => {
    const error = new RateLimitError('Rate limit exceeded', 60, 100, 40);
    expect(error.message).toBe('Rate limit exceeded');
    expect(error.retryAfter).toBe(60);
    expect(error.limit).toBe(100);
    expect(error.remaining).toBe(40);
    expect(error.name).toBe('RateLimitError');
  });

  test('should create error with optional parameters', () => {
    const error = new RateLimitError('Rate limit exceeded');
    expect(error.retryAfter).toBeUndefined();
    expect(error.limit).toBeUndefined();
    expect(error.remaining).toBeUndefined();
  });

  test('should include timestamp', () => {
    const before = Date.now();
    const error = new RateLimitError('Rate limit exceeded');
    const after = Date.now();
    expect(error.timestamp.getTime()).toBeGreaterThanOrEqual(before);
    expect(error.timestamp.getTime()).toBeLessThanOrEqual(after);
  });
});
