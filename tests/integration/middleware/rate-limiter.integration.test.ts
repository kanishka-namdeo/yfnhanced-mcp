import {
  RateLimiter,
  RateLimitError,
  TokenBucket,
  RateLimitTracker,
  AdaptiveThrottling
} from '../../../src/middleware/rate-limiter';
import { YahooFinanceError, YF_ERR_RATE_LIMIT } from '../../../src/types/errors';
import type { RateLimitConfig } from '../../../src/types/config';

// Every elapsed-time behaviour in this file is fake-timer driven. The limiter reads
// Date.now() for the token refill and for the fixed calendar windows, so the clock is
// pinned to a timestamp that is an exact minute AND hour boundary before each test.
const EPOCH = new Date('2026-01-01T00:00:00.000Z');

// Moves the shared clock forward. Call this from the test body only.
function flush(ms: number): Promise<void> {
  return jest.advanceTimersByTimeAsync(ms);
}

// Schedules a timer inside a rate-limited function; the test body drives it with flush().
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeConfig(overrides: Partial<RateLimitConfig> = {}): RateLimitConfig {
  return {
    strategy: 'token-bucket',
    maxRequests: 10,
    // windowMs is declared by RateLimitConfig and never read by RateLimiter.
    windowMs: 60000,
    tokenRefillRate: 1,
    // Deliberately above maxRequests so the calendar window is not the binding constraint
    // in the tests that only care about tokens or concurrency.
    requestsPerMinute: 100,
    requestsPerHour: 1000,
    ...overrides
  };
}

async function expectRejected(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('Expected the limiter to reject, but it resolved');
}

// RateLimitError must re-assert its own prototype because the YahooFinanceError base constructor
// ends with `Object.setPrototypeOf(this, YahooFinanceError.prototype)` (src/types/errors.ts:79).
// It did not until 2026-10-13, so every RateLimitError failed `instanceof RateLimitError`; these
// assertions now pin the restored chain.
function expectRateLimitError(error: unknown): RateLimitError {
  expect(error).toBeInstanceOf(YahooFinanceError);
  expect(error).toBeInstanceOf(RateLimitError);

  const rateError = error as RateLimitError;
  expect(rateError.name).toBe('RateLimitError');
  expect(rateError.code).toBe(YF_ERR_RATE_LIMIT);
  return rateError;
}

describe('Rate Limiter Integration Tests', () => {
  let rateLimiter: RateLimiter;

  beforeAll(() => {
    jest.useFakeTimers();
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(() => {
    jest.setSystemTime(EPOCH);
    rateLimiter = new RateLimiter(makeConfig());
  });

  afterEach(() => {
    rateLimiter.reset();
  });

  describe('Basic Rate Limiting', () => {
    it('should allow requests within the token budget', async () => {
      for (let i = 0; i < 5; i++) {
        await rateLimiter.acquire();
        rateLimiter.release();
      }

      expect(rateLimiter.getStats().availableTokens).toBeCloseTo(5, 5);
    });

    it('should reject, not queue, once the bucket is exhausted', async () => {
      const rl = new RateLimiter(makeConfig({ maxRequests: 2 }));

      await rl.acquire();
      rl.release();
      await rl.acquire();
      rl.release();

      const error = await expectRejected(rl.acquire());

      expectRateLimitError(error);
      expect(rl.getStats().queueLength).toBe(0);
      expect(rl.getStats().rejectedRequests).toBe(1);
    });

    it('should execute function within rate limit', async () => {
      let callCount = 0;
      const fn = async (): Promise<string> => {
        callCount++;
        return `result-${callCount}`;
      };

      expect(await rateLimiter.execute(fn, 'test-endpoint')).toBe('result-1');
      expect(callCount).toBe(1);
    });

    it('should release the concurrency slot after execution', async () => {
      await rateLimiter.execute(async () => 'result', 'test-endpoint');

      expect(rateLimiter.getStats().concurrentRequests).toBe(0);
      expect(rateLimiter.getStats().totalRequests).toBe(1);
    });

    it('should fold an omitted and an empty endpoint onto the same "default" key', async () => {
      await rateLimiter.execute(async () => 'a');
      await rateLimiter.execute(async () => 'b', '');

      expect(rateLimiter.getStats().totalRequests).toBe(2);

      const strict = new RateLimiter(makeConfig({ maxRequests: 10, requestsPerMinute: 2 }));
      await strict.execute(async () => 'a');
      await expectRejected(strict.execute(async () => 'b', ''));

      expect(strict.getStats().rejectedRequests).toBe(1);
    });
  });

  describe('Per-Endpoint Rate Limiting', () => {
    it('should keep one calendar window per endpoint', async () => {
      const rl = new RateLimiter(makeConfig({ maxRequests: 50, requestsPerMinute: 2 }));

      await rl.execute(async () => 'result1', 'endpoint-1');
      await expectRejected(rl.execute(async () => 'result2', 'endpoint-1'));

      // endpoint-2 owns a fresh tracker, so it is admitted while endpoint-1 is refused.
      expect(await rl.execute(async () => 'result3', 'endpoint-2')).toBe('result3');
      expect(rl.getStats().rejectedRequests).toBe(1);
    });

    it('should share one token bucket across all endpoints', async () => {
      const rl = new RateLimiter(makeConfig({ maxRequests: 1 }));

      await rl.execute(async () => 'result1', 'endpoint-1');

      // The bucket is global: endpoint-2 is refused even though its own tracker is empty.
      const error = await expectRejected(rl.execute(async () => 'result2', 'endpoint-2'));

      expectRateLimitError(error);
      expect((error as RateLimitError).message).toBe('Rate limit exceeded');
    });

    it('should handle multiple concurrent endpoints', async () => {
      const pending = Array.from({ length: 5 }, (_unused, i) =>
        rateLimiter.execute(async () => `result-${i}`, `endpoint-${i % 2}`)
      );

      const results = await Promise.all(pending);

      expect(results).toHaveLength(5);
      expect(rateLimiter.getStats().concurrentRequests).toBe(0);
    });

    it('should enforce the per-endpoint concurrency ceiling only between staggered calls', async () => {
      const rl = new RateLimiter(makeConfig({ maxRequests: 2, tokenRefillRate: 100 }));

      const first = rl.execute(async () => {
        await delay(500);
        return 'a';
      }, 'ep');
      await flush(1);

      const second = rl.execute(async () => {
        await delay(500);
        return 'b';
      }, 'ep');
      await flush(1);

      // execute() reads endpointConcurrent before it increments it, so a third call that
      // starts in the same tick as the first two is admitted; a call that starts after
      // they have registered is rejected outright, never queued.
      const error = await expectRejected(rl.execute(async () => 'c', 'ep'));

      expectRateLimitError(error);
      expect(rl.getStats().queueLength).toBe(0);

      await flush(1000);
      expect(await Promise.all([first, second])).toEqual(['a', 'b']);
    });
  });

  describe('Token Refill', () => {
    it('should refill tokens continuously at one token per second', async () => {
      const rl = new RateLimiter(makeConfig({ maxRequests: 2 }));

      await rl.execute(async () => 'result1', 'test-endpoint');
      await rl.execute(async () => 'result2', 'test-endpoint');

      await expectRejected(rl.execute(async () => 'result3', 'test-endpoint'));

      // refillRate is tokens per SECOND, so 100 ms buys 0.1 tokens, not one.
      await flush(100);
      await expectRejected(rl.execute(async () => 'result3', 'test-endpoint'));

      await flush(900);
      expect(await rl.execute(async () => 'result3', 'test-endpoint')).toBe('result3');
    });

    it('should respect a slow refill rate', async () => {
      const rl = new RateLimiter(makeConfig({ maxRequests: 2, tokenRefillRate: 0.1 }));

      await rl.execute(async () => 'result1', 'test-endpoint');
      await rl.execute(async () => 'result2', 'test-endpoint');

      await expectRejected(rl.execute(async () => 'result3', 'test-endpoint'));

      // One token at 0.1/s takes 10 s.
      await flush(9000);
      await expectRejected(rl.execute(async () => 'result3', 'test-endpoint'));

      await flush(1100);
      expect(await rl.execute(async () => 'result3', 'test-endpoint')).toBe('result3');
    });

    it('should never refill above capacity', async () => {
      const rl = new RateLimiter(makeConfig({ maxRequests: 3, tokenRefillRate: 100 }));

      await rl.execute(async () => 'a', 'test-endpoint');
      expect(rl.getStats().availableTokens).toBeCloseTo(2, 5);

      await flush(60000);
      expect(rl.getStats().availableTokens).toBe(3);
    });

    it('should report the wait time in seconds through retryAfter', async () => {
      const rl = new RateLimiter(makeConfig({ maxRequests: 1, tokenRefillRate: 0.5 }));

      await rl.execute(async () => 'a', 'test-endpoint');

      const error = (await expectRejected(
        rl.execute(async () => 'b', 'test-endpoint')
      )) as RateLimitError;

      // One token at 0.5/s is 2000 ms; retryAfter is Math.ceil(waitTimeMs / 1000).
      expect(error.retryAfter).toBe(2);
    });

    it('should treat a zero refill rate as unset and refill at one token per second', async () => {
      const rl = new RateLimiter(makeConfig({ maxRequests: 4, tokenRefillRate: 0 }));

      for (let i = 0; i < 4; i++) {
        await rl.acquire();
        rl.release();
      }

      await expectRejected(rl.acquire());

      // orFallback(value, 1) keeps 0 and NaN falling through exactly as `||` did, so the
      // limiter is not deadlocked by tokenRefillRate: 0.
      await flush(1000);
      expect(rl.getStats().availableTokens).toBeGreaterThanOrEqual(1);
      await expect(rl.acquire()).resolves.toBeUndefined();
    });
  });

  describe('Time Window Rate Limiting', () => {
    it('should enforce the per-minute window one request early', async () => {
      const rl = new RateLimiter(makeConfig({ maxRequests: 100, requestsPerMinute: 3 }));

      await rl.execute(async () => 'r1', 'test-endpoint');
      await rl.execute(async () => 'r2', 'test-endpoint');

      // trackRequest() runs before isExceeded(), and isExceeded() uses >=, so a budget of 3
      // admits only 2 requests per calendar minute.
      const error = await expectRejected(rl.execute(async () => 'r3', 'test-endpoint'));

      expectRateLimitError(error);
      expect((error as RateLimitError).retryAfter).toBe(60);
    });

    it('should enforce the per-hour window through the same tracker', async () => {
      const rl = new RateLimiter(
        makeConfig({ maxRequests: 100, requestsPerMinute: 100, requestsPerHour: 2 })
      );

      await rl.execute(async () => 'r1', 'test-endpoint');
      await expectRejected(rl.execute(async () => 'r2', 'test-endpoint'));

      // getStats reports the limiter-wide tracker, which only counts admitted requests.
      expect(rl.getStats().minuteCount).toBe(1);
      expect(rl.getStats().hourCount).toBe(1);
    });

    it('should reset the minute counter at the calendar minute boundary', async () => {
      const rl = new RateLimiter(makeConfig({ maxRequests: 100, requestsPerMinute: 2 }));

      await rl.execute(async () => 'r1', 'test-endpoint');
      await expectRejected(rl.execute(async () => 'r2', 'test-endpoint'));

      // A fixed calendar window: the clock has to cross into the next minute, and 60000 ms
      // from a pinned boundary always does.
      await flush(60000);

      expect(await rl.execute(async () => 'r3', 'test-endpoint')).toBe('r3');
    });

    it('should reset the hour counter at the calendar hour boundary', async () => {
      const rl = new RateLimiter(
        makeConfig({ maxRequests: 100, requestsPerMinute: 100, requestsPerHour: 2 })
      );

      await rl.execute(async () => 'r1', 'test-endpoint');
      await expectRejected(rl.execute(async () => 'r2', 'test-endpoint'));

      await flush(3600000);

      expect(rl.getStats().hourCount).toBe(0);
      expect(await rl.execute(async () => 'r3', 'test-endpoint')).toBe('r3');
    });

    it('should ignore a timeWindowMs option because the windows are hardcoded', async () => {
      const rl = new RateLimiter(
        { ...makeConfig({ maxRequests: 100, requestsPerMinute: 2 }), timeWindowMs: 100 } as RateLimitConfig
      );

      await rl.execute(async () => 'r1', 'test-endpoint');
      await expectRejected(rl.execute(async () => 'r2', 'test-endpoint'));

      // The old suite expected 100 ms to clear the window; nothing reads timeWindowMs and
      // the minute granularity is fixed at 60000 ms.
      await flush(150);
      await expectRejected(rl.execute(async () => 'r3', 'test-endpoint'));
    });
  });

  describe('Concurrent Request Handling', () => {
    it('should handle concurrent requests up to the bucket capacity', async () => {
      const pending = Array.from({ length: 10 }, (_unused, i) =>
        rateLimiter.execute(async () => `result-${i}`, 'test-endpoint')
      );

      const results = await Promise.all(pending);

      expect(results).toHaveLength(10);
      expect(results.every((r, i) => r === `result-${i}`)).toBe(true);
    });

    it('should queue on global concurrency in FIFO order', async () => {
      const rl = new RateLimiter(makeConfig({ maxRequests: 2, tokenRefillRate: 100 }));
      const order: string[] = [];

      const make = (label: string, ms: number) => async (): Promise<string> => {
        order.push(`start-${label}`);
        await delay(ms);
        order.push(`end-${label}`);
        return label;
      };

      // Distinct endpoint keys so the per-endpoint ceiling does not fire and the third
      // request reaches the global concurrency gate, which is the only gate that queues.
      const pending = Promise.all([
        rl.execute(make('a', 150), 'ep-a'),
        rl.execute(make('b', 150), 'ep-b'),
        rl.execute(make('c', 10), 'ep-c')
      ]);

      await flush(2000);
      const results = await pending;

      expect(results).toEqual(['a', 'b', 'c']);
      expect(order.slice(0, 2)).toEqual(['start-a', 'start-b']);
      expect(order.indexOf('start-c')).toBeGreaterThan(order.indexOf('end-b'));
      expect(rl.getStats().concurrentRequests).toBe(0);
    });

    it('should track concurrent request count', async () => {
      let maxConcurrent = 0;

      const pending = Promise.all(
        Array.from({ length: 5 }, () =>
          rateLimiter.execute(async () => {
            const stats = rateLimiter.getStats();
            if (stats.concurrentRequests > maxConcurrent) {
              maxConcurrent = stats.concurrentRequests;
            }
            await delay(50);
            return 'result';
          }, 'test-endpoint')
        )
      );

      await flush(1000);
      await pending;

      expect(maxConcurrent).toBe(5);
      expect(rateLimiter.getStats().concurrentRequests).toBe(0);
    });

    it('should release the slot on error', async () => {
      await expect(
        rateLimiter.execute(async () => {
          throw new Error('Test error');
        }, 'test-endpoint')
      ).rejects.toThrow('Test error');

      expect(rateLimiter.getStats().concurrentRequests).toBe(0);
    });

    it('should handle partial failures in concurrent requests', async () => {
      const pending = Promise.allSettled(
        Array.from({ length: 9 }, (_unused, i) =>
          rateLimiter.execute(async () => {
            if (i % 3 === 0) {
              throw new Error('Failure');
            }
            return `result-${i}`;
          }, 'test-endpoint')
        )
      );

      const results = await pending;

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(6);
      expect(results.filter((r) => r.status === 'rejected')).toHaveLength(3);
      expect(rateLimiter.getStats().concurrentRequests).toBe(0);
    });
  });

  describe('Adaptive Throttling and Predictive Rejection', () => {
    it('should reject before exhaustion once headers report low remaining', async () => {
      rateLimiter.updateFromHeaders(
        new Headers({ 'x-ratelimit-limit': '10', 'x-ratelimit-remaining': '1' })
      );

      // usageRatio = 1 - 1/10 = 0.9 > 0.7, so acquire() throws without touching the bucket.
      const error = await expectRejected(rateLimiter.execute(async () => 'x', 'test-endpoint'));

      expectRateLimitError(error);
      expect((error as RateLimitError).message).toBe('Predictive rate limit triggered to avoid hard limit');
      expect(rateLimiter.getStats().availableTokens).toBeCloseTo(10, 5);
    });

    it('should clamp the adaptive limit between its floor and ceiling', () => {
      const throttle = new AdaptiveThrottling(100, 25, 100);

      throttle.adjustLimits(new Headers({ 'x-ratelimit-remaining': '1' }));

      expect(throttle.getCurrentLimit()).toBe(90);
      expect(throttle.consecutiveFailures).toBe(1);

      for (let i = 0; i < 20; i++) {
        throttle.adjustLimits(new Headers({ 'x-ratelimit-remaining': '1' }));
      }

      expect(throttle.getCurrentLimit()).toBe(25);

      throttle.reset();
      expect(throttle.getCurrentLimit()).toBe(100);
    });

    it('should honour retry-after in the backoff suggestion', () => {
      const throttle = new AdaptiveThrottling(100, 25, 100);

      throttle.adjustLimits(new Headers({ 'retry-after': '7' }));

      expect(throttle.getRetryAfter()).toBe(7);

      // One retry-after is only one consecutive failure, and predictThrottle() needs two
      // because no x-ratelimit-remaining header was reported to lower the usage ratio.
      expect(throttle.predictThrottle()).toBe(false);

      throttle.adjustLimits(new Headers({ 'retry-after': '7' }));
      expect(throttle.predictThrottle()).toBe(true);
    });

    it('should raise the limit only after five consecutive successes', () => {
      const throttle = new AdaptiveThrottling(100, 25, 100);

      throttle.adjustLimits(new Headers({ 'x-ratelimit-remaining': '1' }));
      const lowered = throttle.getCurrentLimit();

      for (let i = 0; i < 4; i++) {
        throttle.adjustLimits(new Headers({ 'x-ratelimit-remaining': '90' }));
      }
      expect(throttle.getCurrentLimit()).toBe(lowered);

      throttle.adjustLimits(new Headers({ 'x-ratelimit-remaining': '90' }));
      expect(throttle.getCurrentLimit()).toBeGreaterThan(lowered);
    });

    it('should start its floor at a quarter of maxRequests', () => {
      const rl = new RateLimiter(makeConfig({ maxRequests: 40 }));

      expect(rl.getStats().currentLimit).toBe(40);

      rl.updateFromHeaders(new Headers({ 'x-ratelimit-remaining': '0' }));
      for (let i = 0; i < 30; i++) {
        rl.updateFromHeaders(new Headers({ 'x-ratelimit-remaining': '0' }));
      }

      expect(rl.getStats().currentLimit).toBe(10);
    });

    it('should poison the limiter after two rate-limit failures', async () => {
      const rl = new RateLimiter(makeConfig({ maxRequests: 50, tokenRefillRate: 50 }));

      for (let i = 0; i < 2; i++) {
        await expectRejected(
          rl.execute(async () => {
            throw new Error('HTTP 429 too many requests');
          }, 'test-endpoint')
        );
      }

      // execute() bumps adaptiveThrottling.consecutiveFailures, and predictThrottle() treats
      // two of them as a throttle signal, so healthy requests are now refused.
      expect(rl.predictiveThrottle()).toBe(true);
      await expectRejected(rl.execute(async () => 'fine', 'test-endpoint'));

      rl.reset();
      expect(rl.predictiveThrottle()).toBe(false);
      expect(await rl.execute(async () => 'fine', 'test-endpoint')).toBe('fine');
    });

    it('should serve a cached value instead of throwing on a 429', async () => {
      const store = new Map<string, unknown>();
      rateLimiter.setCache({
        get: async (key: string) => store.get(key) ?? null,
        set: async (key: string, value: unknown) => {
          store.set(key, value);
        }
      });
      store.set('rate_limited_test-endpoint', 'stale-but-useful');

      const result = await rateLimiter.execute(async () => {
        throw new Error('rate limit hit');
      }, 'test-endpoint');

      expect(result).toBe('stale-but-useful');
    });

    it('should report rate limiting through isRateLimited', async () => {
      expect(rateLimiter.isRateLimited()).toBe(false);

      const rl = new RateLimiter(makeConfig({ maxRequests: 1 }));
      await rl.acquire();

      expect(rl.isRateLimited()).toBe(true);

      rl.release();
      await expectRejected(rl.acquire());
      expect(rl.getStats().concurrentRequests).toBe(0);
      expect(rl.isRateLimited()).toBe(true);
    });
  });

  describe('Statistics and Monitoring', () => {
    it('should track total requests made', async () => {
      for (let i = 0; i < 5; i++) {
        await rateLimiter.execute(async () => 'result', 'test-endpoint');
      }

      expect(rateLimiter.getStats().totalRequests).toBe(5);
    });

    it('should track rejected requests', async () => {
      const rl = new RateLimiter(makeConfig({ maxRequests: 1 }));

      await rl.execute(async () => 'result', 'test-endpoint');

      for (let i = 0; i < 3; i++) {
        await expectRejected(rl.execute(async () => 'result', 'test-endpoint'));
      }

      expect(rl.getStats().rejectedRequests).toBe(3);
    });

    it('should count a window rejection that never reached the bucket', async () => {
      const rl = new RateLimiter(makeConfig({ maxRequests: 100, requestsPerMinute: 1 }));

      // A per-minute budget of 1 admits nothing, because the counter is incremented first.
      await expectRejected(rl.execute(async () => 'a', 'test-endpoint'));

      expect(rl.getStats().rejectedRequests).toBe(1);
      expect(rl.getStats().totalRequests).toBe(0);
      expect(rl.getStats().availableTokens).toBe(100);
    });

    it('should expose exactly the documented stats keys', async () => {
      await rateLimiter.execute(async () => 'result', 'test-endpoint');

      const stats = rateLimiter.getStats();

      expect(Object.keys(stats).sort()).toEqual([
        'availableTokens',
        'concurrentRequests',
        'currentLimit',
        'hourCount',
        'isRateLimited',
        'minuteCount',
        'queueLength',
        'rejectedRequests',
        'tokens',
        'totalRequests'
      ]);
      expect(stats.tokens).toBe(stats.availableTokens);
    });
  });

  describe('Reset and Configuration', () => {
    it('should reset limiter state', async () => {
      await rateLimiter.execute(async () => 'result', 'test-endpoint');
      await rateLimiter.execute(async () => 'result', 'test-endpoint');

      rateLimiter.reset();

      const stats = rateLimiter.getStats();
      expect(stats.totalRequests).toBe(0);
      expect(stats.rejectedRequests).toBe(0);
      expect(stats.concurrentRequests).toBe(0);
      expect(stats.availableTokens).toBe(10);
      expect(stats.minuteCount).toBe(0);
    });

    it('should allow requests after reset', async () => {
      const rl = new RateLimiter(makeConfig({ maxRequests: 1 }));

      await rl.execute(async () => 'result', 'test-endpoint');
      await expectRejected(rl.execute(async () => 'result', 'test-endpoint'));

      rl.reset();

      expect(await rl.execute(async () => 'result', 'test-endpoint')).toBe('result');
    });

    it('should resize the bucket on updateConfig but ignore a non-usable size', async () => {
      rateLimiter.updateConfig({ maxRequests: 20 });

      expect(rateLimiter.getStats().availableTokens).toBe(10);

      rateLimiter.updateConfig({ maxRequests: 5 });
      expect(rateLimiter.getStats().availableTokens).toBeLessThanOrEqual(5);

      // A 0 or NaN maxRequests lands in the config but leaves the live bucket untouched.
      rateLimiter.updateConfig({ maxRequests: 0 });
      expect(rateLimiter.getConfig().maxRequests).toBe(0);
      expect(rateLimiter.getStats().availableTokens).toBeLessThanOrEqual(5);
    });

    it('should let setBurstLimit override max concurrency', async () => {
      const rl = new RateLimiter(makeConfig({ maxRequests: 50, tokenRefillRate: 50 }));

      rl.setBurstLimit(1);

      const pending = Promise.all([
        rl.execute(async () => {
          await delay(30);
          return 'a';
        }, 'ep-a'),
        rl.execute(async () => 'b', 'ep-b')
      ]);

      await flush(1000);

      expect(await pending).toEqual(['a', 'b']);
      expect(rl.getStats().queueLength).toBe(0);
    });
  });

  describe('Error Contract', () => {
    it('should raise RateLimitError with the documented YahooFinanceError shape', async () => {
      const rl = new RateLimiter(makeConfig({ maxRequests: 1 }));

      await rl.acquire();
      rl.release();

      const error = (await expectRejected(rl.acquire())) as RateLimitError;

      expectRateLimitError(error);
      expect(error).toBeInstanceOf(YahooFinanceError);
      expect(error.name).toBe('RateLimitError');
      expect(error.code).toBe(YF_ERR_RATE_LIMIT);
      expect(error.statusCode).toBe(429);
      expect(error.isRetryable).toBe(true);
      expect(error.isRateLimit).toBe(true);
      expect(error.suggestedAction).toBe('Wait and retry with exponential backoff');
      expect(error.context).toMatchObject({ retryAfter: 1, limit: 1 });
    });

    it('should re-raise a non-rate-limit error untouched', async () => {
      await expect(
        rateLimiter.execute(async () => {
          throw new TypeError('boom');
        }, 'test-endpoint')
      ).rejects.toBeInstanceOf(TypeError);
    });

    it('should translate a 429 with no cached value into RateLimitError', async () => {
      const error = (await expectRejected(
        rateLimiter.execute(async () => {
          throw new Error('HTTP 429');
        }, 'test-endpoint')
      )) as RateLimitError;

      expectRateLimitError(error);
      expect(error.message).toBe('Rate limit exceeded, falling back to cached data');
      expect(error.retryAfter).toBe(60);
    });
  });

  describe('Building Blocks', () => {
    it('should compute token wait time from the deficit and refill rate', () => {
      const bucket = new TokenBucket(2, 4);

      expect(bucket.getTokens()).toBe(4);
      expect(bucket.waitForTokens(4)).toBe(0);
      expect(bucket.consume(4)).toBe(true);
      expect(bucket.consume(1)).toBe(false);
      // One token short at 2 tokens/second is 500 ms.
      expect(bucket.waitForTokens(1)).toBe(500);
    });

    it('should keep per-minute and per-hour counts in the tracker', () => {
      const tracker = new RateLimitTracker(2, 5);

      tracker.trackRequest('ep');
      expect(tracker.getMinuteCount()).toBe(1);
      expect(tracker.getHourCount()).toBe(1);
      expect(tracker.isExceeded()).toBe(false);
      expect(tracker.getRemaining()).toEqual({ minute: 1, hour: 4 });

      tracker.trackRequest('ep');
      expect(tracker.isExceeded()).toBe(true);
      expect(tracker.getRemaining()).toEqual({ minute: 0, hour: 3 });

      tracker.reset();
      expect(tracker.getMinuteCount()).toBe(0);
    });

    it('should roll the minute bucket while the hour bucket keeps accumulating', async () => {
      const tracker = new RateLimitTracker(2, 2);

      tracker.trackRequest('ep');
      await flush(120000);
      tracker.trackRequest('ep');

      expect(tracker.getMinuteCount()).toBe(1);
      expect(tracker.getHourCount()).toBe(2);
    });

    it('should refuse everything below its own floor in the bucket', () => {
      const bucket = new TokenBucket(1, 0);

      expect(bucket.consume(1)).toBe(false);
      expect(bucket.waitForTokens(1)).toBe(1000);
    });
  });

  describe('Edge Cases', () => {
    it('should reject every request when maxRequests is 0', async () => {
      const rl = new RateLimiter(makeConfig({ maxRequests: 0 }));

      // capacity 0 means the bucket can never grant; maxConcurrent falls back to 10.
      const error = await expectRejected(rl.execute(async () => 'result', 'test-endpoint'));

      expectRateLimitError(error);
      expect(rl.getStats().availableTokens).toBe(0);
    });

    it('should handle very high max requests', async () => {
      const rl = new RateLimiter(
        makeConfig({ maxRequests: 10000, requestsPerMinute: 10000, requestsPerHour: 100000 })
      );

      const pending = Promise.all(
        Array.from({ length: 100 }, (_unused, i) => rl.execute(async () => `result-${i}`, 'test-endpoint'))
      );

      const results = await pending;

      expect(results).toHaveLength(100);
      expect(results[99]).toBe('result-99');
    });

    it('should handle very fast sequential requests', async () => {
      const rl = new RateLimiter(makeConfig({ maxRequests: 10 }));

      const pending = Promise.all(
        Array.from({ length: 10 }, (_unused, i) => rl.execute(async () => `result-${i}`, 'test-endpoint'))
      );

      const results = await pending;

      expect(results).toHaveLength(10);
      expect(rl.getStats().availableTokens).toBeCloseTo(0, 5);
    });

    it('should not time out long requests', async () => {
      const started = rateLimiter.execute(async () => {
        await delay(10000);
        return 'result';
      }, 'test-endpoint');

      await flush(10000);

      expect(await started).toBe('result');
    });

    it('should leave no slot behind after a slow request', async () => {
      const started = rateLimiter.execute(async () => {
        await delay(100);
        return 'result';
      }, 'test-endpoint');

      await flush(100);
      await started;

      expect(rateLimiter.getStats().concurrentRequests).toBe(0);
    });
  });
});
