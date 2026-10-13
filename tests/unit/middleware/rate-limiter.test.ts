// Determinism notes (this suite was flaky under parallel load before):
// - The limiter is time-based: continuous token refill reads Date.now(), and concurrency
//   queueing runs on a 100 ms setInterval (rate-limiter.ts:466-479). Real-clock sleeps and
//   ms-quantized refills lose under worker contention.
// - Every test now pins the clock with jest.useFakeTimers() + jest.setSystemTime(base);
//   time only moves via explicit jest.advanceTimersByTime/…Async. Tokens therefore refill by
//   exact amounts and interval ticks fire on command.
// - Queue-based tests drain the FIFO queue to completion so the 100 ms interval is
//   clearInterval'd (jest.getTimerCount() === 0 is asserted), and afterEach drops the fake
//   clock regardless, so nothing can keep the event loop alive.

import {
  TokenBucket,
  RateLimitTracker,
  AdaptiveThrottling,
  RateLimiter,
  RateLimitError
} from '../../../src/middleware/rate-limiter';
import { YahooFinanceError, YF_ERR_RATE_LIMIT } from '../../../src/types/errors';

const BASE_TIME = new Date('2026-01-01T00:00:00.000Z');

function pinnedRateLimiter(overrides: Record<string, unknown> = {}): RateLimiter {
  return new RateLimiter({
    strategy: 'token-bucket',
    maxRequests: 10,
    windowMs: 60000,
    tokenRefillRate: 1,
    ...overrides
  } as any);
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(BASE_TIME);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('TokenBucket', () => {
  test('should initialize full at capacity with the given refill rate', () => {
    const bucket = new TokenBucket(10, 100);
    expect(bucket.capacity).toBe(100);
    expect(bucket.refillRate).toBe(10);
    expect(bucket.tokens).toBe(100);
    expect(bucket.lastRefill).toBe(BASE_TIME.getTime());
  });

  test('should consume tokens when available (no clock movement, no refill noise)', () => {
    const bucket = new TokenBucket(10, 100);
    const result = bucket.consume(50);
    expect(result).toBe(true);
    // Old version asserted tokens === 50 against the real clock: any ms elapsed between
    // construction and consume refilled a fractional token and the equality flipped.
    expect(bucket.tokens).toBe(50);
  });

  test('should not consume tokens when insufficient', () => {
    const bucket = new TokenBucket(10, 100);
    bucket.tokens = 30;
    const result = bucket.consume(50);
    expect(result).toBe(false);
    expect(bucket.tokens).toBe(30); // failed consume does not spend
  });

  test('refills continuously at refillRate per second', () => {
    const bucket = new TokenBucket(10, 100);
    bucket.tokens = 0;
    jest.advanceTimersByTime(1000);
    bucket.refill();
    expect(bucket.tokens).toBe(10);

    jest.advanceTimersByTime(500); // 0.5 s * 10 = 5 tokens
    bucket.refill();
    expect(bucket.tokens).toBeCloseTo(15, 10);
  });

  test('should not exceed capacity when refilling', () => {
    const bucket = new TokenBucket(100, 100);
    bucket.tokens = 90;
    jest.advanceTimersByTime(2000);
    bucket.refill();
    expect(bucket.tokens).toBe(100);
  });

  test('getTokens refills before reporting', () => {
    const bucket = new TokenBucket(10, 100);
    bucket.tokens = 0;
    jest.advanceTimersByTime(1000);
    expect(bucket.getTokens()).toBe(10);
  });

  test('waitForTokens returns the exact milliseconds needed for the deficit', () => {
    const bucket = new TokenBucket(10, 100);
    bucket.tokens = 10;
    // deficit 10 tokens / 10 per second = 1000 ms. (The old test asked for 20 tokens while
    // holding 90, which actually needs no wait and returned 0.)
    expect(bucket.waitForTokens(20)).toBe(1000);
  });

  test('should return 0 wait time when tokens are available', () => {
    const bucket = new TokenBucket(10, 100);
    expect(bucket.waitForTokens(50)).toBe(0);
  });
});

describe('RateLimitTracker', () => {
  test('should initialize with limits', () => {
    const tracker = new RateLimitTracker(60, 3600);
    expect(tracker.perMinuteLimit).toBe(60);
    expect(tracker.perHourLimit).toBe(3600);
  });

  test('should track requests in fixed calendar windows', () => {
    const tracker = new RateLimitTracker(60, 3600);
    tracker.trackRequest('test');
    expect(tracker.getMinuteCount()).toBe(1);
    expect(tracker.getHourCount()).toBe(1);

    jest.advanceTimersByTime(30000); // still the same calendar minute
    tracker.trackRequest('test');
    expect(tracker.getMinuteCount()).toBe(2);
  });

  test('isExceeded is >= against the per-minute limit', () => {
    const tracker = new RateLimitTracker(5, 3600);
    for (let i = 0; i < 4; i++) {
      tracker.trackRequest('test');
    }
    expect(tracker.isExceeded()).toBe(false);
    tracker.trackRequest('test'); // count 5 >= 5
    expect(tracker.isExceeded()).toBe(true);
  });

  test('should calculate remaining requests, floored at 0', () => {
    const tracker = new RateLimitTracker(60, 3600);
    tracker.trackRequest('test');
    let remaining = tracker.getRemaining();
    expect(remaining.minute).toBe(59);
    expect(remaining.hour).toBe(3599);

    for (let i = 0; i < 60; i++) {
      tracker.trackRequest('test');
    }
    remaining = tracker.getRemaining();
    expect(remaining.minute).toBe(0); // Math.max(0, ...)
  });

  test('cleanup drops windows older than the previous one', () => {
    const tracker = new RateLimitTracker(60, 3600);
    tracker.trackRequest('test');

    jest.advanceTimersByTime(120000); // two calendar minutes later
    tracker.trackRequest('test2');

    expect(tracker.getMinuteCount()).toBe(1);
    expect(tracker.minuteWindow.size).toBe(1); // minute M pruned: cleanup keeps >= current - 1
    jest.advanceTimersByTime(120000);
    tracker.trackRequest('test3');
    expect(tracker.minuteWindow.size).toBe(1);
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

  test('should adjust limits based on the x-ratelimit-limit header', () => {
    const throttling = new AdaptiveThrottling(100, 25, 100);
    const headers = new Headers();
    headers.set('x-ratelimit-limit', '50');
    throttling.adjustLimits(headers);
    expect(throttling.getCurrentLimit()).toBe(50);
  });

  test('header limits are clamped to [minLimit, maxLimit]', () => {
    const throttling = new AdaptiveThrottling(100, 25, 100);
    const low = new Headers();
    low.set('x-ratelimit-limit', '5');
    throttling.adjustLimits(low);
    expect(throttling.getCurrentLimit()).toBe(25);

    const high = new Headers();
    high.set('x-ratelimit-limit', '500');
    throttling.adjustLimits(high);
    expect(throttling.getCurrentLimit()).toBe(100);
  });

  test('should predict throttling based on usage ratio', () => {
    const throttling = new AdaptiveThrottling(100, 25, 100);
    throttling.responseHeaders.set('x-ratelimit-remaining', '10');
    // usage 1 - 10/100 = 0.9 > 0.8
    expect(throttling.predictThrottle()).toBe(true);
  });

  test('fresh throttling does not predict a throttle', () => {
    const throttling = new AdaptiveThrottling(100, 25, 100);
    // getRemaining() falls back to currentLimit → usage 0, no failures
    expect(throttling.predictThrottle()).toBe(false);
  });

  test('two consecutive failures alone trigger the prediction', () => {
    const throttling = new AdaptiveThrottling(100, 25, 100);
    throttling.consecutiveFailures = 2;
    expect(throttling.predictThrottle()).toBe(true);
  });

  test('should decrease limit on low remaining tokens (10% step)', () => {
    const throttling = new AdaptiveThrottling(100, 25, 100);
    const headers = new Headers();
    headers.set('x-ratelimit-remaining', '5'); // 5 < 100 * 0.2
    throttling.adjustLimits(headers);
    expect(throttling.getCurrentLimit()).toBe(90); // floor(100 * 0.9)
    expect(throttling.consecutiveFailures).toBe(1);
  });

  test('should increase limit only after 5 accumulated successes inside adjustLimits', () => {
    const throttling = new AdaptiveThrottling(100, 25, 200);
    const headers = new Headers();
    headers.set('x-ratelimit-limit', '100');
    headers.set('x-ratelimit-remaining', '90'); // healthy (>= 20% of 100)

    throttling.adjustLimits(headers);
    throttling.adjustLimits(headers);
    throttling.adjustLimits(headers);
    throttling.adjustLimits(headers);
    expect(throttling.getCurrentLimit()).toBe(100); // 4 successes: no increase yet
    throttling.adjustLimits(headers);
    expect(throttling.getCurrentLimit()).toBe(110); // 5th: floor(100 * 1.1)
  });

  test('increaseLimit is applied directly as well', () => {
    const throttling = new AdaptiveThrottling(100, 25, 200);
    throttling.increaseLimit();
    expect(throttling.getCurrentLimit()).toBe(110);
  });

  test('should get remaining tokens from header, else currentLimit', () => {
    const throttling = new AdaptiveThrottling(100, 25, 100);
    expect(throttling.getRemaining()).toBe(100);
    throttling.responseHeaders.set('x-ratelimit-remaining', '50');
    expect(throttling.getRemaining()).toBe(50);
  });

  test('should get retry after duration and treat retry-after as a failure', () => {
    const throttling = new AdaptiveThrottling(100, 25, 100);
    expect(throttling.getRetryAfter()).toBeUndefined();

    const headers = new Headers();
    headers.set('retry-after', '60');
    throttling.adjustLimits(headers);
    expect(throttling.getRetryAfter()).toBe(60);
    expect(throttling.getCurrentLimit()).toBe(90); // retry-after forces decreaseLimit
    expect(throttling.consecutiveFailures).toBe(1);
  });

  test('should reset to maxLimit and clear state', () => {
    const throttling = new AdaptiveThrottling(100, 25, 100);
    throttling.currentLimit = 50;
    throttling.consecutiveSuccesses = 3;
    throttling.reset();
    // reset() restores maxLimit, NOT the constructor's initial limit (they differ if a
    // header previously lowered currentLimit; here maxLimit === 100).
    expect(throttling.getCurrentLimit()).toBe(100);
    expect(throttling.consecutiveSuccesses).toBe(0);
    expect(throttling.responseHeaders.size).toBe(0);
  });
});

describe('RateLimiter construction and defaults', () => {
  test('should initialize with config', () => {
    const limiter = pinnedRateLimiter();
    expect(limiter.getConfig().maxRequests).toBe(10);
  });

  test('documented defaults: capacity = maxRequests, refill 1, burst 5, maxConcurrent = maxRequests, adaptive floor 25%', () => {
    const limiter = new RateLimiter({
      strategy: 'token-bucket',
      maxRequests: 10,
      windowMs: 60000
    } as any);

    const internal = limiter as any;
    expect(internal.tokenBucket.capacity).toBe(10);
    expect(internal.tokenBucket.refillRate).toBe(1); // orFallback(undefined -> 1)
    expect(internal.burstLimit).toBe(5);
    expect(internal.maxConcurrent).toBe(10);
    expect(internal.adaptiveThrottling.minLimit).toBe(2); // floor(10 * 0.25)
    expect(internal.tracker.perMinuteLimit).toBe(10);
    expect(internal.tracker.perHourLimit).toBe(600);
  });

  test('orFallback quirk: tokenRefillRate 0 (or NaN) falls through to 1, it does not mean "no refill"', () => {
    const zero = pinnedRateLimiter({ tokenRefillRate: 0 });
    expect((zero as any).tokenBucket.refillRate).toBe(1);
    const nan = pinnedRateLimiter({ tokenRefillRate: NaN });
    expect((nan as any).tokenBucket.refillRate).toBe(1);
  });

  test('orFallback quirk: maxConcurrent also uses bare || so maxRequests 0 yields 10', () => {
    const limiter = new RateLimiter({
      strategy: 'token-bucket',
      maxRequests: 0,
      windowMs: 60000
    } as any);
    expect((limiter as any).maxConcurrent).toBe(10);
  });
});

describe('RateLimiter acquire/release', () => {
  test('should acquire token when available and track concurrency', async () => {
    const limiter = pinnedRateLimiter();
    await expect(limiter.acquire()).resolves.not.toThrow();

    const stats = limiter.getStats();
    expect(stats.concurrentRequests).toBe(1);
    expect(stats.tokens).toBe(9);
    expect(stats.availableTokens).toBe(9);
  });

  test('should release acquired slots', async () => {
    const limiter = pinnedRateLimiter();
    await limiter.acquire();
    expect(limiter.getStats().concurrentRequests).toBe(1);
    limiter.release();
    expect(limiter.getStats().concurrentRequests).toBe(0);
  });

  test('release without a matching acquire goes NEGATIVE (no clamp in src)', () => {
    const limiter = pinnedRateLimiter();
    limiter.release();
    expect((limiter as any).concurrentRequests).toBe(-1);
  });

  test('token exhaustion THROWS RateLimitError — it never queues (documented policy)', async () => {
    const limiter = pinnedRateLimiter();
    for (let i = 0; i < 10; i++) {
      await limiter.acquire();
      limiter.release();
    }

    // DEFECT (src/types/errors.ts:79): YahooFinanceError's constructor hardcodes
    // Object.setPrototypeOf(this, YahooFinanceError.prototype), and RateLimitError never
    // restores its own prototype after super(), so `instanceof RateLimitError` is false —
    // identity must be asserted through name/code instead.
    await expect(limiter.acquire()).rejects.toMatchObject({
      name: 'RateLimitError',
      code: YF_ERR_RATE_LIMIT
    });
    const stats = limiter.getStats();
    expect(stats.queueLength).toBe(0); // threw instead of queueing
    expect(stats.rejectedRequests).toBe(1);
  });

  test('exhaustion error carries deterministic retryAfter/limit/remaining at a pinned clock', async () => {
    const limiter = pinnedRateLimiter();
    let thrown: RateLimitError | undefined;
    for (let i = 0; i < 11; i++) {
      try {
        await limiter.acquire();
        limiter.release();
      } catch (error) {
        thrown = error as RateLimitError;
      }
    }

    expect(thrown).toBeDefined();
    expect(thrown?.message).toBe('Rate limit exceeded');
    // deficit of 1 token at 1 token/s → waitForTokens = 1000 ms → ceil(1000/1000) = 1 s.
    expect(thrown?.retryAfter).toBe(1);
    expect(thrown?.limit).toBe(10); // adaptive currentLimit (never adjusted)
    expect(thrown?.remaining).toBe(10); // adaptive getRemaining falls back to currentLimit
  });

  test('continuous refill restores service exactly after the deficit period', async () => {
    const limiter = pinnedRateLimiter();
    for (let i = 0; i < 10; i++) {
      await limiter.acquire();
      limiter.release();
    }

    // Half-second steps keep the refill arithmetic binary-exact (0.5 + 0.5 === 1), which a
    // 999/1 split would not be. At 1 token/s one token exists only at the full second.
    jest.advanceTimersByTime(500); // 0.5 tokens — still short of 1
    await expect(limiter.acquire()).rejects.toMatchObject({ name: 'RateLimitError' });

    jest.advanceTimersByTime(500); // exactly 1 token now
    await limiter.acquire();
    limiter.release();
    expect(limiter.getStats().tokens).toBe(0);
  });

  test('predictive throttle above 70% usage throws before tokens are spent', async () => {
    const limiter = pinnedRateLimiter();
    (limiter as any).adaptiveThrottling.responseHeaders.set('x-ratelimit-remaining', '1');
    // usage 1 - 1/10 = 0.9 > 0.7

    await expect(limiter.acquire()).rejects.toThrow(
      'Predictive rate limit triggered to avoid hard limit'
    );
    // token bucket untouched: the throw happens before consume()
    expect(limiter.getStats().tokens).toBe(10);
    expect(limiter.getStats().rejectedRequests).toBe(1);
  });

  test('concurrency saturation queues FIFO on the 100 ms interval — the ONLY queueing path', async () => {
    const limiter = pinnedRateLimiter();
    limiter.setBurstLimit(1); // maxConcurrent = 1
    await limiter.acquire(); // occupies the single slot

    const order: number[] = [];
    const p2 = limiter.acquire().then(async () => {
      order.push(2);
      limiter.release();
      await p3Settled;
    });
    const p3 = limiter.acquire().then(() => {
      order.push(3);
      limiter.release();
    });
    const p3Settled = p3;

    expect(limiter.getStats().queueLength).toBe(2);

    await jest.advanceTimersByTimeAsync(100); // slot still busy → nothing dequeues
    expect(limiter.getStats().queueLength).toBe(2);
    expect(order).toEqual([]);

    limiter.release(); // free the slot; the running interval dequeues on its next tick
    await jest.advanceTimersByTimeAsync(100);
    expect(order).toEqual([2]);

    // #2's continuation refilled the slot via release() inside its .then, so #3 needs one
    // more free window.
    await jest.advanceTimersByTimeAsync(100);
    await p2;
    await p3;
    expect(order).toEqual([2, 3]); // strict FIFO

    // Teardown proof: when the queue drained, processQueue clearInterval'd the 100 ms
    // interval — no timer survives to keep the process (or this worker) alive.
    expect(limiter.getStats().queueLength).toBe(0);
    expect(jest.getTimerCount()).toBe(0);
  });
});

describe('RateLimiter execute', () => {
  test('should execute function with rate limiting and record traffic', async () => {
    const limiter = pinnedRateLimiter();
    const fn = jest.fn().mockResolvedValue('result');
    const result = await limiter.execute(fn);

    expect(result).toBe('result');
    expect(fn).toHaveBeenCalled();
    const stats = limiter.getStats();
    expect(stats.totalRequests).toBe(1);
    expect(stats.minuteCount).toBe(1);
    expect(stats.concurrentRequests).toBe(0); // released in finally
  });

  test('per-endpoint fixed minute window: the 10th call in one window rejects with retryAfter 60', async () => {
    const limiter = pinnedRateLimiter();
    const fn = jest.fn().mockResolvedValue('ok');

    for (let i = 0; i < 9; i++) {
      await expect(limiter.execute(fn)).resolves.toBe('ok');
    }
    // endpoint tracker counts BEFORE acquiring: 10th track → 10 >= 10 → exceeded.
    await expect(limiter.execute(fn)).rejects.toThrow('Rate limit exceeded');
    expect(fn).toHaveBeenCalledTimes(9);

    jest.advanceTimersByTime(60001); // roll past the calendar minute boundary
    await expect(limiter.execute(fn)).resolves.toBe('ok');
  });

  test('per-endpoint CONCURRENCY cap queues nothing and throws immediately (retryAfter 1)', async () => {
    const limiter = pinnedRateLimiter();
    limiter.setBurstLimit(50); // lift global concurrency out of the way
    // Raise the endpoint window so the concurrency check (not the minute check) trips first.
    // The endpoint tracker is built lazily on the first execute, so update before executing.
    limiter.updateConfig({ requestsPerMinute: 10000, requestsPerHour: 100000 });

    const resolvers: Array<(value: string) => void> = [];
    const slow = () => new Promise<string>((resolve) => { resolvers.push(resolve); });

    const running: Array<Promise<string>> = [];
    for (let i = 0; i < 10; i++) {
      running.push(limiter.execute(slow));
    }
    await jest.advanceTimersByTimeAsync(0); // let every execute reach its fn await

    // 10 in flight = config.maxRequests; the 11th trips the endpoint concurrency guard.
    await expect(limiter.execute(slow)).rejects.toMatchObject({
      name: 'RateLimitError',
      retryAfter: 1
    });

    resolvers.forEach((resolve) => resolve('done'));
    const all = await Promise.all(running);
    expect(all).toEqual(Array(10).fill('done'));
    expect(limiter.getStats().concurrentRequests).toBe(0);
  });

  test('a 429 failure returns cached rate_limited_<endpoint> data when the attached cache has it', async () => {
    const limiter = pinnedRateLimiter();
    const cacheMock = {
      get: jest.fn().mockResolvedValue('cached-value'),
      set: jest.fn()
    };
    limiter.setCache(cacheMock);

    const result = await limiter.execute(
      () => Promise.reject(new Error('HTTP 429: too many requests')),
      'quote:AAPL'
    );

    expect(result).toBe('cached-value');
    expect(cacheMock.get).toHaveBeenCalledWith('rate_limited_quote:AAPL');
  });

  test('a 429 with no cached value throws RateLimitError instead', async () => {
    const limiter = pinnedRateLimiter();
    limiter.setCache({ get: jest.fn().mockResolvedValue(null), set: jest.fn() });

    await expect(
      limiter.execute(() => Promise.reject(new Error('rate limit hit')))
    ).rejects.toThrow('Rate limit exceeded, falling back to cached data');
  });

  test('non-429 errors pass through untouched', async () => {
    const limiter = pinnedRateLimiter();
    const boom = new Error('disk exploded');
    await expect(limiter.execute(() => Promise.reject(boom))).rejects.toBe(boom);
    expect(limiter.getStats().concurrentRequests).toBe(0);
  });

  test('predictive throttle also blocks execute', async () => {
    const limiter = pinnedRateLimiter();
    (limiter as any).adaptiveThrottling.responseHeaders.set('x-ratelimit-remaining', '2');
    await expect(limiter.execute(jest.fn().mockResolvedValue('x'))).rejects.toThrow(
      'Predictive rate limit triggered to avoid hard limit'
    );
  });
});

describe('RateLimiter stats, config, reset', () => {
  test('isRateLimited: false fresh, true once tokens deplete', async () => {
    const limiter = pinnedRateLimiter();
    expect(limiter.isRateLimited()).toBe(false);

    for (let i = 0; i < 10; i++) {
      await limiter.acquire();
      limiter.release();
    }
    expect(limiter.isRateLimited()).toBe(true); // tokenBucket.getTokens() <= 0
  });

  test('getBackoffDuration is 0 with tokens in the bucket and ~1 s when dry', async () => {
    const limiter = pinnedRateLimiter();
    expect(limiter.getBackoffDuration()).toBe(0);

    for (let i = 0; i < 10; i++) {
      await limiter.acquire();
      limiter.release();
    }
    expect(limiter.getBackoffDuration()).toBe(1);
  });

  test('updateFromHeaders feeds the adaptive throttling, clamped to the config ceiling', () => {
    const limiter = pinnedRateLimiter();
    // AdaptiveThrottling is built with maxLimit === config.maxRequests (rate-limiter.ts:291-295),
    // so a header limit of 50 clamps back down to 10 — headers can only LOWER the limit here.
    const up = new Headers();
    up.set('x-ratelimit-limit', '50');
    limiter.updateFromHeaders(up);
    expect(limiter.getStats().currentLimit).toBe(10);

    const down = new Headers();
    down.set('x-ratelimit-limit', '5');
    limiter.updateFromHeaders(down);
    expect(limiter.getStats().currentLimit).toBe(5);
  });

  test('getStats exposes the full documented shape', () => {
    const limiter = pinnedRateLimiter();
    expect(limiter.getStats()).toEqual(
      expect.objectContaining({
        tokens: 10,
        concurrentRequests: 0,
        minuteCount: 0,
        hourCount: 0,
        currentLimit: 10,
        queueLength: 0,
        isRateLimited: false,
        totalRequests: 0,
        rejectedRequests: 0,
        availableTokens: 10
      })
    );
  });

  test('reset clears counters, trackers, and endpoint windows', async () => {
    const limiter = pinnedRateLimiter();
    const fn = jest.fn().mockResolvedValue('ok');
    for (let i = 0; i < 10; i++) {
      await limiter.execute(fn).catch(() => undefined); // 9 pass, 10th hits minute window
    }
    expect(limiter.getStats().rejectedRequests).toBeGreaterThan(0);

    limiter.reset();
    const stats = limiter.getStats();
    expect(stats.concurrentRequests).toBe(0);
    expect(stats.queueLength).toBe(0);
    expect(stats.rejectedRequests).toBe(0);
    expect(stats.totalRequests).toBe(0);
    expect(stats.minuteCount).toBe(0);

    await expect(limiter.execute(fn)).resolves.toBe('ok'); // endpoint windows cleared too
  });

  test('DEFECT: reset() abandons queued waiters — their promises never settle', async () => {
    const limiter = pinnedRateLimiter();
    limiter.setBurstLimit(1);
    await limiter.acquire();
    const pending = limiter.acquire(); // queued on the 100 ms interval

    let settled = false;
    pending.then(
      () => { settled = true; },
      () => { settled = true; }
    );

    limiter.reset(); // replaces this.queue (rate-limiter.ts:528) and drops the resolve fn
    expect(limiter.getStats().queueLength).toBe(0);

    // The orphaned interval only clears itself on the NEXT tick when it sees the (new, empty)
    // queue — it is not stopped synchronously by reset().
    await jest.advanceTimersByTimeAsync(150);
    expect(settled).toBe(false); // the waiter can never settle from src
    expect(jest.getTimerCount()).toBe(0);
  });

  test('getConfig returns a copy', () => {
    const limiter = pinnedRateLimiter();
    const config = limiter.getConfig() as any;
    config.maxRequests = 999;
    expect(limiter.getConfig().maxRequests).toBe(10);
  });

  test('updateConfig({maxRequests}) resizes the bucket but RESETS refillRate to the partial value or 1', () => {
    const limiter = pinnedRateLimiter({ tokenRefillRate: 5 });
    expect((limiter as any).tokenBucket.refillRate).toBe(5);

    limiter.updateConfig({ maxRequests: 20 });
    expect(limiter.getConfig().maxRequests).toBe(20);
    expect((limiter as any).tokenBucket.capacity).toBe(20);
    // QUIRK (rate-limiter.ts:538-544): refillRate is recomputed from the PARTIAL config,
    // so omitting tokenRefillRate silently collapses it from 5 back to the default 1.
    expect((limiter as any).tokenBucket.refillRate).toBe(1);

    limiter.updateConfig({ tokenRefillRate: 3 }); // maxRequests not a usable number in this
    // partial → capacity/refill untouched branch, but merged config now carries refill 3...
    // the merge does update this.config, yet refillRate is only recomputed when
    // isUsableNumber(config.maxRequests). Confirm the untouched-but-merged state:
    expect(limiter.getConfig().tokenRefillRate).toBe(3);
    expect((limiter as any).tokenBucket.refillRate).toBe(1); // still stale after this path
  });

  test('setCache stores the adapter by identity', () => {
    const limiter = pinnedRateLimiter();
    const mockCache = { get: jest.fn(), set: jest.fn() };
    limiter.setCache(mockCache);
    expect((limiter as any).cache).toBe(mockCache);
  });

  test('setBurstLimit rewrites both burstLimit and maxConcurrent', () => {
    const limiter = pinnedRateLimiter();
    limiter.setBurstLimit(3);
    expect((limiter as any).burstLimit).toBe(3);
    expect((limiter as any).maxConcurrent).toBe(3);
  });
});

describe('RateLimitError', () => {
  test('should create error with correct properties', () => {
    const reset = new Date(BASE_TIME.getTime() + 5000);
    const error = new RateLimitError('Rate limit exceeded', 60, 100, 40, reset);
    expect(error.message).toBe('Rate limit exceeded');
    expect(error.retryAfter).toBe(60);
    expect(error.limit).toBe(100);
    expect(error.remaining).toBe(40);
    expect(error.reset).toBe(reset);
    expect(error.name).toBe('RateLimitError');
    expect(error.code).toBe(YF_ERR_RATE_LIMIT);
    expect(error.statusCode).toBe(429);
    expect(error.isRetryable).toBe(true);
    expect(error.isRateLimit).toBe(true);
    expect(error).toBeInstanceOf(YahooFinanceError);
  });

  test('should create error with optional parameters', () => {
    const error = new RateLimitError('Rate limit exceeded');
    expect(error.retryAfter).toBeUndefined();
    expect(error.limit).toBeUndefined();
    expect(error.remaining).toBeUndefined();
    expect(error.reset).toBeUndefined();
  });

  test('timestamp is the pinned clock at construction', () => {
    const error = new RateLimitError('Rate limit exceeded');
    expect(error.timestamp.getTime()).toBe(BASE_TIME.getTime());
  });

  test('keeps its own prototype so instanceof RateLimitError holds', () => {
    // errors.ts:79 does Object.setPrototypeOf(this, YahooFinanceError.prototype) inside the BASE
    // constructor, so a subclass must restore its own prototype afterwards — CircuitBreakerOpenError
    // and MaxRetriesExceededError do; RateLimitError only started to on 2026-10-13, and without it
    // every `e instanceof RateLimitError` guard in the wild was silently false.
    const error = new RateLimitError('Rate limit exceeded');
    expect(error).toBeInstanceOf(YahooFinanceError);
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(RateLimitError);
    expect(error.constructor.name).toBe('RateLimitError');
    expect(error.name).toBe('RateLimitError');
    expect(error.code).toBe(YF_ERR_RATE_LIMIT);
  });

  test('suggestedAction and context are the base-class contract', () => {
    const reset = new Date(BASE_TIME.getTime() + 60000);
    const error = new RateLimitError('Rate limit exceeded', 30, 10, 2, reset);
    expect(error.suggestedAction).toBe('Wait and retry with exponential backoff');
    expect(error.context).toEqual({ retryAfter: 30, limit: 10, remaining: 2, reset });
    expect(error.timestamp.getTime()).toBe(BASE_TIME.getTime());
    expect(Object.keys(error.toJSON())).toEqual([
      'name', 'message', 'code', 'statusCode', 'isRetryable', 'isRateLimit',
      'context', 'timestamp', 'suggestedAction', 'warnings', 'hasPartialData'
    ]);
  });
});

// Residual branches: the hour half of RateLimitTracker.cleanup (:147-151) was never pruned
// because no test advanced a full two hours, both legs of tryGetFromCache's missing/throwing
// cache (:483, :489) were stepped over by tests that always attach a working cache, and the
// `?? 0` recovery legs of the per-endpoint counters (:360, :395, :421) only appear when reset()
// clears the map under an in-flight request.
describe('RateLimiter residual branches', () => {
  test('cleanup prunes an hour window that is older than the previous calendar hour', () => {
    const tracker = new RateLimitTracker(60, 3600);
    tracker.trackRequest('test');
    expect(tracker.hourWindow.size).toBe(1);

    // Exactly one calendar hour later the old bucket is still "previous hour" and survives.
    jest.advanceTimersByTime(3600000);
    tracker.trackRequest('test');
    expect(tracker.hourWindow.size).toBe(2);

    // Two hours on, the first bucket is older than currentHour - 1 and is deleted.
    jest.advanceTimersByTime(3600000);
    tracker.trackRequest('test');
    expect(tracker.hourWindow.size).toBe(2);
    expect(tracker.getHourCount()).toBe(1);
  });

  test('a 429 with no cache attached goes straight to the RateLimitError', async () => {
    const limiter = pinnedRateLimiter();

    await expect(
      limiter.execute(() => Promise.reject(new Error('HTTP 429: too many requests')), 'quote:AAPL')
    ).rejects.toThrow('Rate limit exceeded, falling back to cached data');
  });

  test('a 429 whose cache read rejects is treated as a miss, not surfaced', async () => {
    const limiter = pinnedRateLimiter();
    limiter.setCache({
      get: jest.fn().mockRejectedValue(new Error('cache down')),
      set: jest.fn()
    });

    await expect(
      limiter.execute(() => Promise.reject(new Error('rate limit hit')), 'quote:AAPL')
    ).rejects.toThrow('Rate limit exceeded, falling back to cached data');
  });

  test('DEFECT: reset() under an in-flight request drives the endpoint counter to -1', async () => {
    const limiter = pinnedRateLimiter();
    limiter.updateConfig({ requestsPerMinute: 10000, requestsPerHour: 100000 });

    let release!: (value: string) => void;
    const pending = limiter.execute(
      () => new Promise<string>((resolve) => { release = resolve; }),
      'quote:AAPL'
    );
    await jest.advanceTimersByTimeAsync(0);
    expect((limiter as any).endpointConcurrent.get('quote:AAPL')).toBe(1);

    limiter.reset();
    release('done');
    await expect(pending).resolves.toBe('done');

    // The finally block re-reads a cleared map: `(get ?? 0) - 1` recreates the key at -1, so the
    // next execute for that endpoint skips its init and starts one slot under budget. The global
    // counter released into the same reset goes negative for the same reason.
    expect((limiter as any).endpointConcurrent.get('quote:AAPL')).toBe(-1);
    expect(limiter.getStats().concurrentRequests).toBe(-1);
    expect(jest.getTimerCount()).toBe(0);
  });
});
