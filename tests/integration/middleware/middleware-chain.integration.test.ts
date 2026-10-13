// This file used to be called "middleware chain", and its name was a lie twice over.
// There is no chain abstraction: `MiddlewareChain`, `MiddlewareFunction` and `use()`
// (src/types/middleware.ts:236-246) are declared and never implemented, so a test of them
// cannot pass honestly. The real composition is hand-written twice in
// src/services/yahoo-finance.ts — `executeWithMiddleware` (:855-926) and
// `executeWithGracefulDegradation` (:234-326) — and the two copies are NOT identical.
//
// This suite now integrates the real primitives in that documented order, using the actual
// Cache, CircuitBreaker, RateLimiter and RetryPolicy classes with no mocking, and asserts
// the ordering, short-circuit and cache-write properties the service depends on. Where the
// two compositions diverge, the divergence is pinned rather than smoothed over.
import { Cache } from '../../../src/middleware/cache';
import { CircuitBreaker, CircuitBreakerOpenError } from '../../../src/middleware/circuit-breaker';
import { RateLimiter } from '../../../src/middleware/rate-limiter';
import { RetryPolicy } from '../../../src/middleware/retry';
import * as cacheModule from '../../../src/middleware/cache';
import * as breakerModule from '../../../src/middleware/circuit-breaker';
import * as limiterModule from '../../../src/middleware/rate-limiter';
import * as retryModule from '../../../src/middleware/retry';
import * as securityModule from '../../../src/middleware/security';
import { classifyError } from '../../../src/utils/error-classifier';
import type { CacheConfig, CircuitBreakerConfig, RateLimitConfig, RetryConfig } from '../../../src/types/config';
import {
  YahooFinanceError,
  YF_ERR_CIRCUIT_OPEN,
  YF_ERR_DATA_UNAVAILABLE,
  YF_ERR_RATE_LIMIT,
  YF_ERR_UNKNOWN
} from '../../../src/types/errors';

const EPOCH = new Date('2026-01-01T00:00:00.000Z');

function advance(ms: number): void {
  jest.advanceTimersByTime(ms);
}

const cacheConfig: CacheConfig = {
  enabled: true,
  store: 'memory',
  ttl: 60000,
  maxEntries: 100
};

const circuitBreakerConfig: CircuitBreakerConfig = {
  enabled: true,
  timeoutMs: 60000,
  errorThresholdPercentage: 5,
  resetTimeoutMs: 60000,
  rollingCountTimeoutMs: 60000,
  rollingCountBuckets: 10,
  volumeThreshold: 5,
  halfOpenMaxAttempts: 3
};

const rateLimitConfig: RateLimitConfig = {
  strategy: 'token-bucket',
  maxRequests: 50,
  windowMs: 60000,
  tokenRefillRate: 100,
  requestsPerMinute: 1000,
  requestsPerHour: 10000
};

const retryConfig: RetryConfig = {
  enabled: true,
  maxRetries: 2,
  initialDelayMs: 10,
  maxDelayMs: 100,
  strategy: 'fixed',
  backoffMultiplier: 2,
  jitter: false,
  retryableStatusCodes: [429, 500, 502, 503, 504],
  retryableErrorCodes: []
};

type Options = {
  useCache?: boolean;
  forceRefresh?: boolean;
  validate?: boolean;
};

type DegradationResult<T> = {
  data: T | null;
  warnings: unknown[];
  isPartial: boolean;
  hasData: boolean;
};

type Harness = {
  cache: Cache;
  breaker: CircuitBreaker;
  limiter: RateLimiter;
  retry: RetryPolicy;
  order: string[];
  attempts: number;
  cacheReads: number;
  cacheWrites: number;
  run: <T>(cacheKey: string, fn: () => Promise<T>, options?: Options) => Promise<T>;
  runDegrading: <T>(cacheKey: string, fn: () => Promise<T>, options?: Options) => Promise<DegradationResult<T>>;
};

// Mirrors YahooFinanceClient.executeWithMiddleware (:855-926): cache pre-check, then
// CircuitBreaker -> RateLimiter -> RetryPolicy -> fn, with cache.set INSIDE the retried unit.
function composeMiddlewarePath(h: Harness): Harness['run'] {
  return async <T>(cacheKey: string, fn: () => Promise<T>, options?: Options): Promise<T> => {
    const useCache = options?.useCache !== false && h.cache.getConfig().enabled === true;

    if (useCache && options?.forceRefresh !== true) {
      h.order.push('cache-get');
      h.cacheReads++;
      const cached = await h.cache.get<T>(cacheKey);
      if (cached !== null) {
        return cached;
      }
    }

    return h.breaker.execute(() => {
      h.order.push('breaker');
      return h.limiter.execute(() => {
        h.order.push('limiter');
        return h.retry.execute(async () => {
          h.order.push('retry');
          h.attempts++;
          try {
            const result = await fn();
            h.order.push('fn');

            if (useCache && options?.validate !== false) {
              h.order.push('cache-set');
              h.cacheWrites++;
              await h.cache.set(cacheKey, result);
            }

            return result;
          } catch (error) {
            const classifiedError = classifyError(error);

            if (useCache && classifiedError.isRetryable === true) {
              h.order.push('cache-fallback-read');
              h.cacheReads++;
              const cachedData = await h.cache.get<T>(cacheKey);
              if (cachedData !== null) {
                return cachedData;
              }
            }

            throw classifiedError;
          }
        });
      }, cacheKey);
    });
  };
}

// Mirrors YahooFinanceClient.executeWithGracefulDegradation (:234-326): the same nesting,
// but the cache is read for fallback material instead of short-circuiting, and the cache
// write happens once AFTER the chain rather than inside the retried unit.
function composeDegradationPath(h: Harness): Harness['runDegrading'] {
  return async <T>(cacheKey: string, fn: () => Promise<T>, options?: Options): Promise<DegradationResult<T>> => {
    const useCache = options?.useCache !== false && h.cache.getConfig().enabled === true;
    let liveData: T | null = null;
    let cachedData: T | null = null;
    const warnings: unknown[] = [];

    if (useCache && options?.forceRefresh !== true) {
      h.order.push('cache-fallback-read');
      h.cacheReads++;
      cachedData = await h.cache.get<T>(cacheKey);
    }

    try {
      liveData = await h.breaker.execute(() => {
        h.order.push('breaker');
        return h.limiter.execute(() => {
          h.order.push('limiter');
          return h.retry.execute(() => {
            h.order.push('retry');
            h.attempts++;
            return fn();
          });
        }, cacheKey);
      });

      if (useCache && liveData !== null) {
        h.order.push('cache-set');
        h.cacheWrites++;
        await h.cache.set(cacheKey, liveData);
      }
    } catch (error) {
      const classifiedError = classifyError(error);

      if (cachedData !== null) {
        warnings.push(classifiedError.message);
        return { data: cachedData, warnings, isPartial: true, hasData: true };
      }

      throw classifiedError;
    }

    return { data: liveData, warnings, isPartial: false, hasData: liveData !== null };
  };
}

function makeHarness(): Harness {
  const h: Harness = {
    cache: new Cache(cacheConfig),
    breaker: new CircuitBreaker(circuitBreakerConfig),
    limiter: new RateLimiter(rateLimitConfig),
    // The policy takes a delayFn so retries never wait on a real clock.
    retry: new RetryPolicy(retryConfig, async () => undefined),
    order: [],
    attempts: 0,
    cacheReads: 0,
    cacheWrites: 0,
    run: () => Promise.reject(new Error('not wired')),
    runDegrading: () => Promise.reject(new Error('not wired'))
  };

  h.run = composeMiddlewarePath(h);
  h.runDegrading = composeDegradationPath(h);
  return h;
}

// Rebuild the composition after swapping a layer, exactly as the service would.
function rewire(h: Harness): void {
  h.run = composeMiddlewarePath(h);
  h.runDegrading = composeDegradationPath(h);
}

async function collectFailures(h: Harness, count: number): Promise<void> {
  for (let i = 0; i < count; i++) {
    await h.run(`quote:SYM${i}`, async () => {
      throw new Error('boom');
    }).catch(() => undefined);
  }
}

describe('Middleware Composition Integration Tests', () => {
  let h: Harness;

  beforeAll(() => {
    jest.useFakeTimers();
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(() => {
    jest.setSystemTime(EPOCH);
    h = makeHarness();
  });

  afterEach(async () => {
    await h.cache.clear();
    h.breaker.reset();
    h.limiter.reset();
    h.retry.reset();
  });

  describe('No Chain Abstraction Exists', () => {
    it('should export no chain, composer or use() from src/middleware', () => {
      const exports = { ...cacheModule, ...breakerModule, ...limiterModule, ...retryModule, ...securityModule };

      expect(exports.MiddlewareChain).toBeUndefined();
      expect(exports.MiddlewareFunction).toBeUndefined();
      expect(exports.use).toBeUndefined();
      expect(exports.compose).toBeUndefined();
    });

    it('should expose each layer only through its own execute()', () => {
      expect(typeof h.breaker.execute).toBe('function');
      expect(typeof h.limiter.execute).toBe('function');
      expect(typeof h.retry.execute).toBe('function');
      expect(typeof h.cache.get).toBe('function');
      expect(typeof (h.cache as unknown as { execute?: unknown }).execute).toBe('undefined');
    });
  });

  describe('Composition Order', () => {
    it('should run cache pre-check then breaker, limiter, retry and fn', async () => {
      expect(await h.run('quote:AAPL', async () => 'AAPL')).toBe('AAPL');

      expect(h.order).toEqual(['cache-get', 'breaker', 'limiter', 'retry', 'fn', 'cache-set']);
    });

    it('should write the cache inside the retried unit, innermost of all layers', async () => {
      await h.run('quote:AAPL', async () => 'AAPL');

      expect(h.order.indexOf('cache-set')).toBe(h.order.length - 1);
      expect(h.order.indexOf('cache-set')).toBeGreaterThan(h.order.indexOf('retry'));
      expect(h.order.indexOf('cache-set')).toBeGreaterThan(h.order.indexOf('limiter'));
      expect(h.cacheReads).toBe(1);
      expect(h.cacheWrites).toBe(1);
    });

    it('should short-circuit the whole chain on a cache hit', async () => {
      await h.run('quote:AAPL', async () => 'fresh');
      h.order = [];

      expect(await h.run('quote:AAPL', async () => 'never-called')).toBe('fresh');
      expect(h.order).toEqual(['cache-get']);
      expect(h.attempts).toBe(1);
      expect(h.limiter.getStats().totalRequests).toBe(1);
    });

    it('should bypass the pre-check on forceRefresh but still write', async () => {
      await h.run('quote:AAPL', async () => 'fresh');
      h.order = [];

      expect(await h.run('quote:AAPL', async () => 'refreshed', { forceRefresh: true })).toBe('refreshed');
      expect(h.order).toEqual(['breaker', 'limiter', 'retry', 'fn', 'cache-set']);
      expect(h.cacheReads).toBe(1);
    });

    it('should neither read nor write when the cache is disabled for the call', async () => {
      expect(await h.run('quote:AAPL', async () => 'fresh', { useCache: false })).toBe('fresh');

      expect(h.order).toEqual(['breaker', 'limiter', 'retry', 'fn']);
      expect(h.cacheWrites).toBe(0);
      expect(await h.cache.get('quote:AAPL')).toBeNull();
    });

    it('should skip the write when validate is false', async () => {
      expect(await h.run('quote:AAPL', async () => 'fresh', { validate: false })).toBe('fresh');

      expect(h.order).toEqual(['cache-get', 'breaker', 'limiter', 'retry', 'fn']);
      expect(await h.cache.get('quote:AAPL')).toBeNull();
    });

    it('should match TTL prefixes singularly, so a plural key falls back to config.ttl', async () => {
      // getTTLForType (:420-427) prefix-matches 'quote'/'historical'/'financial'/'news'/
      // 'analysis'. A key typed quotes:... never matches and silently gets config.ttl.
      await h.cache.set('quote:AAPL', 'a');
      await h.cache.set('quotes:AAPL', 'b');

      expect((await h.cache.getEntry('quote:AAPL'))?.ttl).toBe(60000);
      expect((await h.cache.getEntry('quotes:AAPL'))?.ttl).toBe(60000);

      advance(60000);

      await expect(h.cache.get('quote:AAPL')).resolves.toBeNull();
      await expect(h.cache.get('quotes:AAPL')).resolves.toBeNull();
    });
  });

  describe('Retry Lives Inside the Rate Limiter', () => {
    it('should acquire the limiter once for many attempts', async () => {
      let calls = 0;

      const result = await h.run('quote:AAPL', async () => {
        calls++;
        if (calls < 3) {
          throw new Error('boom');
        }
        return 'eventual';
      });

      expect(result).toBe('eventual');
      expect(calls).toBe(3);
      expect(h.attempts).toBe(3);

      const stats = h.limiter.getStats();
      expect(stats.totalRequests).toBe(1);
      expect(stats.availableTokens).toBeCloseTo(rateLimitConfig.maxRequests - 1, 5);

      // Only the surviving attempt writes, so one cache write covers three attempts.
      expect(h.cacheWrites).toBe(1);
      expect(h.order.filter((entry) => entry === 'cache-set')).toHaveLength(1);
    });

    it('should stop after maxRetries + 1 attempts and surface the classified error', async () => {
      let calls = 0;

      await expect(
        h.run('quote:NFLX', async () => {
          calls++;
          throw new Error('boom');
        })
      ).rejects.toBeInstanceOf(YahooFinanceError);

      // shouldRetry's own `attempt > maxRetries` guard fires on the third failure, so the
      // loop never reaches its `attempt <= maxRetries + 1` bound and
      // MaxRetriesExceededError is unreachable from this path.
      expect(calls).toBe(3);
      expect(h.retry.attempt).toBe(2);
      expect(h.retry.retryHistory).toHaveLength(2);
    });

    it('should re-read the cache on every failed attempt', async () => {
      await expect(
        h.run('quote:MSFT', async () => {
          throw new Error('boom');
        })
      ).rejects.toThrow('Unknown error');

      // One pre-check plus one fallback read per failed attempt.
      expect(h.cacheReads).toBe(4);
      expect(h.order.filter((entry) => entry === 'cache-fallback-read')).toHaveLength(3);
    });

    it('should reach the inner cache fallback only when the pre-check is skipped', async () => {
      await h.cache.set('quote:GOOGL', 'stale-value');

      // With the pre-check active the same key answers the same way twice, so the fallback
      // read inside the retried unit can only repeat the pre-check's verdict. This run
      // returns from the pre-check without ever entering the chain.
      expect(await h.run('quote:GOOGL', async () => 'fresh')).toBe('stale-value');
      expect(h.attempts).toBe(0);
      expect(h.order).toEqual(['cache-get']);

      // forceRefresh skips the pre-check, which is the one route that reaches the in-catch
      // read and gets a different answer there than it got above.
      h.order = [];
      const result = await h.run('quote:GOOGL', async () => {
        throw new Error('boom');
      }, { forceRefresh: true });

      expect(result).toBe('stale-value');
      expect(h.attempts).toBe(1);
      expect(h.order).toContain('cache-fallback-read');

      // The fallback return resolves the retried unit, so the breaker books a success and
      // adds no failure for the fetch that actually broke.
      expect(h.breaker.getMetrics()).toEqual({ failureCount: 0, successCount: 1 });
    });

    it('should retry an unknown error because classifyError marks it retryable', async () => {
      const classified = classifyError(new Error('boom'));

      expect(classified.code).toBe(YF_ERR_UNKNOWN);
      expect(classified.isRetryable).toBe(true);

      let calls = 0;
      await h.run('quote:AMZN', async () => {
        calls++;
        throw new Error('boom');
      }).catch(() => undefined);

      expect(calls).toBe(3);
    });

    it('should not retry a non-retryable classification', async () => {
      let calls = 0;

      await expect(
        h.run('quote:TSLA', async () => {
          calls++;
          throw new YahooFinanceError(
            'Data unavailable',
            YF_ERR_DATA_UNAVAILABLE,
            null,
            false,
            false,
            {},
            'Check the symbol'
          );
        })
      ).rejects.toThrow('Data unavailable');

      expect(calls).toBe(1);
    });

    it('should let skipRetry end the loop on the first failure', async () => {
      h.retry = new RetryPolicy(
        { ...retryConfig, skipRetry: () => true },
        async () => undefined
      );
      rewire(h);

      let calls = 0;
      await expect(
        h.run('quote:DIS', async () => {
          calls++;
          throw new Error('boom');
        })
      ).rejects.toThrow('Unknown error');

      expect(calls).toBe(1);
    });
  });

  describe('Circuit Breaker Wraps Everything Below It', () => {
    it('should short-circuit before the limiter once the breaker is open', async () => {
      await collectFailures(h, 5);

      expect(h.breaker.getState()).toBe('OPEN');

      const before = h.limiter.getStats();
      const attemptsBefore = h.attempts;

      await expect(h.run('quote:AAPL', async () => 'AAPL')).rejects.toBeInstanceOf(CircuitBreakerOpenError);

      expect(h.attempts).toBe(attemptsBefore);
      expect(h.limiter.getStats().totalRequests).toBe(before.totalRequests);
      expect(h.limiter.getStats().availableTokens).toBeCloseTo(before.availableTokens, 5);
    });

    it('should reject a throttled request before the retried unit ever runs', async () => {
      h.limiter = new RateLimiter({ ...rateLimitConfig, requestsPerMinute: 1 });
      rewire(h);

      await expect(h.run('quote:AAPL', async () => 'AAPL')).rejects.toMatchObject({
        name: 'RateLimitError',
        code: YF_ERR_RATE_LIMIT
      });

      // The limiter's own window check sits outside the retried unit, so a throttled request
      // is refused once, retried zero times, and counted as one breaker failure.
      expect(h.attempts).toBe(0);
      expect(h.limiter.getStats().rejectedRequests).toBe(1);
      expect(h.breaker.getMetrics().failureCount).toBe(1);
      expect(h.breaker.getState()).toBe('CLOSED');
    });

    it('should never re-acquire the limiter across retries of a failing fetch', async () => {
      h.limiter = new RateLimiter({ ...rateLimitConfig, maxRequests: 50, tokenRefillRate: 0.001 });
      rewire(h);

      let calls = 0;
      await expect(
        h.run('quote:MSFT', async () => {
          calls++;
          throw new Error('boom');
        })
      ).rejects.toThrow('Unknown error');

      // Three attempts, one grant: the retries consume no further tokens, so a retry loop is
      // invisible to the throttle even though it multiplies the upstream load.
      expect(calls).toBe(3);
      expect(h.limiter.getStats().totalRequests).toBe(1);
      expect(h.limiter.getStats().availableTokens).toBeCloseTo(49, 3);
      expect(h.limiter.getStats().rejectedRequests).toBe(0);
    });

    it('should open the breaker after five throttled requests', async () => {
      h.limiter = new RateLimiter({ ...rateLimitConfig, requestsPerMinute: 1 });
      rewire(h);

      for (let i = 0; i < 5; i++) {
        await h.run(`quote:SYM${i}`, async () => `r${i}`).catch(() => undefined);
      }

      expect(h.breaker.getState()).toBe('OPEN');
      expect(h.breaker.getMetrics().failureCount).toBe(5);
    });

    it('should let the breaker probe again once its timeout elapses', async () => {
      await collectFailures(h, 5);

      expect(h.breaker.getState()).toBe('OPEN');

      advance(circuitBreakerConfig.resetTimeoutMs);

      // halfOpenMaxAttempts 3 means three clean probes before it closes again.
      for (let i = 0; i < 2; i++) {
        expect(await h.run(`probe:${i}`, async () => 'ok')).toBe('ok');
      }
      expect(h.breaker.getState()).toBe('HALF_OPEN');

      expect(await h.run('probe:2', async () => 'ok')).toBe('ok');
      expect(h.breaker.getState()).toBe('CLOSED');
    });

    it('should exit the retry loop immediately on a breaker rejection', async () => {
      h.breaker = new CircuitBreaker({ ...circuitBreakerConfig, errorThresholdPercentage: 1 });
      rewire(h);

      await h.breaker.execute(async () => {
        throw new Error('trip');
      }).catch(() => undefined);

      expect(h.breaker.getState()).toBe('OPEN');

      const attemptsBefore = h.attempts;
      await expect(h.run('quote:AAPL', async () => 'AAPL')).rejects.toBeInstanceOf(CircuitBreakerOpenError);

      expect(h.attempts).toBe(attemptsBefore);
    });

    it('should keep the breaker rejection distinguishable from a throttle', async () => {
      h.breaker = new CircuitBreaker({ ...circuitBreakerConfig, errorThresholdPercentage: 1 });
      rewire(h);

      await h.breaker.execute(async () => {
        throw new Error('trip');
      }).catch(() => undefined);

      const error = (await h.run('quote:AAPL', async () => 'AAPL').catch((e: unknown) => e)) as YahooFinanceError;

      expect(error).toBeInstanceOf(CircuitBreakerOpenError);
      expect(error.code).toBe(YF_ERR_CIRCUIT_OPEN);
      expect(error.isRateLimit).toBe(false);
      expect(error.isRetryable).toBe(false);
    });
  });

  describe('The Two Compositions Differ', () => {
    it('should write once after the chain in the degradation path', async () => {
      let calls = 0;

      const result = await h.runDegrading('quote:AAPL', async () => {
        calls++;
        if (calls < 3) {
          throw new Error('boom');
        }
        return 'eventual';
      });

      expect(result).toEqual({ data: 'eventual', warnings: [], isPartial: false, hasData: true });
      expect(calls).toBe(3);
      expect(h.order).toEqual([
        'cache-fallback-read',
        'breaker',
        'limiter',
        'retry',
        'retry',
        'retry',
        'cache-set'
      ]);
      expect(h.cacheWrites).toBe(1);
    });

    it('should read the cache first as fallback material, not as a short-circuit', async () => {
      await h.cache.set('quote:AAPL', 'stale');
      h.order = [];

      let calls = 0;
      const result = await h.runDegrading('quote:AAPL', async () => {
        calls++;
        throw new Error('boom');
      });

      // Unlike executeWithMiddleware, a hit does NOT skip the network: the cached value is
      // only retained in case the chain fails.
      expect(calls).toBe(3);
      expect(result).toEqual({ data: 'stale', warnings: ['Unknown error'], isPartial: true, hasData: true });
      expect(h.order[0]).toBe('cache-fallback-read');
      expect(h.order).not.toContain('cache-set');
    });

    it('should rethrow when neither live nor cached data exists', async () => {
      await expect(
        h.runDegrading('quote:AAPL', async () => {
          throw new Error('boom');
        })
      ).rejects.toMatchObject({ name: 'YahooFinanceError', message: 'Unknown error' });

      expect(h.breaker.getMetrics().failureCount).toBe(1);
    });

    it('should skip the fallback read on forceRefresh in both paths', async () => {
      h.order = [];

      await h.runDegrading('quote:AAPL', async () => 'fresh', { forceRefresh: true });

      expect(h.order).toEqual(['breaker', 'limiter', 'retry', 'cache-set']);
    });
  });

  describe('State Coordination', () => {
    it('should expose stats from the layers that have them', async () => {
      await h.run('quote:AAPL', async () => 'AAPL');

      const cacheStats = h.cache.getStats();
      const limiterStats = h.limiter.getStats();

      expect(cacheStats.entries).toBe(1);
      expect(cacheStats.hits).toBe(0);
      expect(cacheStats.misses).toBe(1);
      expect(limiterStats.concurrentRequests).toBe(0);
      expect(limiterStats.totalRequests).toBe(1);
      expect(h.breaker.getState()).toBe('CLOSED');
      expect(h.breaker.getMetrics()).toEqual({ failureCount: 0, successCount: 1 });
    });

    it('should reset every layer consistently', async () => {
      await h.run('quote:AAPL', async () => 'AAPL');
      await h.run('quote:MSFT', async () => {
        throw new Error('boom');
      }).catch(() => undefined);

      await h.cache.clear();
      h.limiter.reset();
      h.breaker.reset();
      h.retry.reset();

      expect(h.cache.getStats().entries).toBe(0);
      expect(h.limiter.getStats().totalRequests).toBe(0);
      expect(h.breaker.getState()).toBe('CLOSED');
      expect(h.retry.attempt).toBe(0);
      expect(h.retry.retryHistory).toEqual([]);
    });

    it('should serve a new request after every layer is reset', async () => {
      await h.run('quote:AAPL', async () => 'AAPL');

      await h.cache.clear();
      h.limiter.reset();
      h.breaker.reset();
      h.retry.reset();

      expect(await h.run('quote:MSFT', async () => 'MSFT')).toBe('MSFT');
    });
  });

  describe('Error Propagation', () => {
    it('should surface the classified error, not the raw one, after retries are spent', async () => {
      await expect(
        h.run('quote:AAPL', async () => {
          throw new Error('boom');
        })
      ).rejects.toMatchObject({
        name: 'YahooFinanceError',
        message: 'Unknown error',
        code: YF_ERR_UNKNOWN
      });
    });

    it('should map a persistent throttle onto the rate-limit error shape', async () => {
      h.limiter = new RateLimiter({ ...rateLimitConfig, requestsPerMinute: 1 });
      rewire(h);

      await expect(h.run('quote:MSFT', async () => 'MSFT')).rejects.toMatchObject({
        name: 'RateLimitError',
        code: YF_ERR_RATE_LIMIT,
        statusCode: 429,
        isRetryable: true,
        isRateLimit: true
      });
    });

    it('should propagate a caller error that no layer recognises', async () => {
      await expect(
        h.run('quote:AAPL', async () => {
          throw new RangeError('out of range');
        })
      ).rejects.toThrow('Unknown error');

      expect(h.breaker.getMetrics().failureCount).toBe(1);
      expect(h.limiter.getStats().concurrentRequests).toBe(0);
    });
  });
});
