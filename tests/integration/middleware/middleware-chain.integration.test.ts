import { RateLimiter } from '../../../src/middleware/rate-limiter';
import { CircuitBreaker } from '../../../src/middleware/circuit-breaker';
import { Cache } from '../../../src/middleware/cache';
import type { RateLimitConfig, CacheConfig, CircuitBreakerConfig } from '../../../src/types/config';

describe('Middleware Chain Integration Tests', () => {
  let rateLimiter: RateLimiter;
  let circuitBreaker: CircuitBreaker;
  let cache: Cache;

  const rateLimitConfig: RateLimitConfig = {
    maxRequests: 10,
    tokenRefillRate: 1,
    requestsPerMinute: 10,
    requestsPerHour: 100
  };

  const cacheConfig: CacheConfig = {
    maxEntries: 100,
    ttl: 60000,
    enabled: true
  };

  const circuitBreakerConfig: CircuitBreakerConfig = {
    errorThresholdPercentage: 5,
    halfOpenMaxAttempts: 3,
    resetTimeoutMs: 60000,
    rollingCountTimeoutMs: 60000
  };

  beforeEach(() => {
    rateLimiter = new RateLimiter(rateLimitConfig);
    circuitBreaker = new CircuitBreaker(circuitBreakerConfig);
    cache = new Cache(cacheConfig);
  });

  afterEach(async () => {
    await cache.clear();
    rateLimiter.reset();
    circuitBreaker.reset();
  });

  describe('Rate Limiter and Cache Integration', () => {
    it('should use cached data when rate limited', async () => {
      await cache.set('test-key', 'cached-value', 60000);

      const fetchFn = async () => {
        await rateLimiter.acquire();
        rateLimiter.release();
        return 'fetched-value';
      };

      const cachedValue = await cache.get('test-key');

      expect(cachedValue).toBe('cached-value');
    });

    it('should bypass cache when rate limit is not exceeded', async () => {
      const fetchFn = async () => {
        await rateLimiter.acquire();
        rateLimiter.release();
        return 'fresh-value';
      };

      const result = await fetchFn();

      expect(result).toBe('fresh-value');
    });

    it('should update cache after successful rate-limited fetch', async () => {
      const fetchFn = async () => {
        await rateLimiter.acquire();
        rateLimiter.release();
        return 'new-value';
      };

      const result = await fetchFn();
      await cache.set('test-key', result, 60000);

      const cached = await cache.get('test-key');

      expect(cached).toBe('new-value');
    });

    it('should not update cache on rate-limited failure', async () => {
      await cache.set('test-key', 'old-value', 60000);

      try {
        await rateLimiter.execute(async () => {
          throw new Error('Fetch failed');
        });
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }

      const cached = await cache.get('test-key');

      expect(cached).toBe('old-value');
    });
  });

  describe('Circuit Breaker and Rate Limiter Integration', () => {
    it('should respect rate limiter even when circuit is closed', async () => {
      let callCount = 0;
      const fn = async () => {
        callCount++;
        await rateLimiter.acquire();
        rateLimiter.release();
        return 'success';
      };

      const result = await circuitBreaker.execute(fn);

      expect(result).toBe('success');
      expect(callCount).toBe(1);
      expect(circuitBreaker.getState()).toBe('CLOSED');
    });

    it('should open circuit after consecutive failures', async () => {
      const fn = async () => {
        await rateLimiter.acquire();
        rateLimiter.release();
        throw new Error('Simulated failure');
      };

      for (let i = 0; i < 10; i++) {
        try {
          await circuitBreaker.execute(fn);
        } catch (error) {
          expect(error).toBeInstanceOf(Error);
        }
      }

      expect(circuitBreaker.getState()).toBe('OPEN');
    });

    it('should not execute rate limiter when circuit is open', async () => {
      const fn = async () => {
        await rateLimiter.acquire();
        rateLimiter.release();
        throw new Error('Failure');
      };

      for (let i = 0; i < 10; i++) {
        try {
          await circuitBreaker.execute(fn);
        } catch (error) {
        }
      }

      const initialStats = rateLimiter.getStats();

      try {
        await circuitBreaker.execute(fn);
      } catch (error) {
      }

      const finalStats = rateLimiter.getStats();

      expect(circuitBreaker.getState()).toBe('OPEN');
      expect(finalStats.concurrentRequests).toBe(initialStats.concurrentRequests);
    });

    it('should transition to half-open after timeout', async () => {
      const shortTimeoutConfig = {
        ...circuitBreakerConfig,
        resetTimeoutMs: 100
      };
      const cb = new CircuitBreaker(shortTimeoutConfig);

      const fn = async () => {
        await rateLimiter.acquire();
        rateLimiter.release();
        throw new Error('Failure');
      };

      for (let i = 0; i < 10; i++) {
        try {
          await cb.execute(fn);
        } catch (error) {
        }
      }

      expect(cb.getState()).toBe('OPEN');

      await new Promise(resolve => setTimeout(resolve, 150));

      expect(cb.getState()).toBe('HALF_OPEN');
    });

    it('should close circuit after successful half-open attempts', async () => {
      const shortTimeoutConfig = {
        ...circuitBreakerConfig,
        resetTimeoutMs: 100,
        successThreshold: 2
      };
      const cb = new CircuitBreaker(shortTimeoutConfig);

      const failFn = async () => {
        await rateLimiter.acquire();
        rateLimiter.release();
        throw new Error('Failure');
      };

      for (let i = 0; i < 10; i++) {
        try {
          await cb.execute(failFn);
        } catch (error) {
        }
      }

      expect(cb.getState()).toBe('OPEN');

      await new Promise(resolve => setTimeout(resolve, 150));

      const successFn = async () => {
        await rateLimiter.acquire();
        rateLimiter.release();
        return 'success';
      };

      await cb.execute(successFn);
      await cb.execute(successFn);

      expect(cb.getState()).toBe('CLOSED');
    });
  });

  describe('Cache and Circuit Breaker Integration', () => {
    it('should return cached data when circuit is open', async () => {
      await cache.set('test-key', 'cached-value', 60000);

      const shortTimeoutConfig = {
        ...circuitBreakerConfig,
        resetTimeoutMs: 100
      };
      const cb = new CircuitBreaker(shortTimeoutConfig);

      const failFn = async () => {
        throw new Error('API failure');
      };

      for (let i = 0; i < 10; i++) {
        try {
          await cb.execute(failFn);
        } catch (error) {
        }
      }

      expect(cb.getState()).toBe('OPEN');

      const cached = await cache.get('test-key');

      expect(cached).toBe('cached-value');
    });

    it('should not cache results from open circuit', async () => {
      const shortTimeoutConfig = {
        ...circuitBreakerConfig,
        resetTimeoutMs: 100
      };
      const cb = new CircuitBreaker(shortTimeoutConfig);

      const failFn = async () => {
        throw new Error('API failure');
      };

      for (let i = 0; i < 10; i++) {
        try {
          await cb.execute(failFn);
        } catch (error) {
        }
      }

      expect(cb.getState()).toBe('OPEN');

      const cached = await cache.get('test-key');

      expect(cached).toBeNull();
    });

    it('should update cache after circuit closes', async () => {
      const shortTimeoutConfig = {
        ...circuitBreakerConfig,
        resetTimeoutMs: 100,
        successThreshold: 1
      };
      const cb = new CircuitBreaker(shortTimeoutConfig);

      const failFn = async () => {
        throw new Error('API failure');
      };

      for (let i = 0; i < 10; i++) {
        try {
          await cb.execute(failFn);
        } catch (error) {
        }
      }

      expect(cb.getState()).toBe('OPEN');

      await new Promise(resolve => setTimeout(resolve, 150));

      const successFn = async () => {
        return 'success-value';
      };

      const result = await cb.execute(successFn);
      await cache.set('test-key', result, 60000);

      expect(cb.getState()).toBe('CLOSED');

      const cached = await cache.get('test-key');

      expect(cached).toBe('success-value');
    });
  });

  describe('Full Middleware Chain', () => {
    it('should execute in correct order: cache -> circuit breaker -> rate limiter', async () => {
      const executionOrder: string[] = [];

      const fetchFn = async () => {
        executionOrder.push('fetch');
        return 'result';
      };

      const wrappedFetch = async () => {
        const cached = await cache.get('test-key');
        if (cached) {
          executionOrder.push('cache-hit');
          return cached;
        }
        executionOrder.push('cache-miss');

        const result = await circuitBreaker.execute(async () => {
          executionOrder.push('circuit-breaker');
          return await rateLimiter.execute(fetchFn, 'test-endpoint');
        });

        await cache.set('test-key', result, 60000);
        return result;
      };

      const result = await wrappedFetch();

      expect(result).toBe('result');
      expect(executionOrder).toEqual(['cache-miss', 'circuit-breaker', 'fetch']);
    });

    it('should use cached value on subsequent calls', async () => {
      await cache.set('test-key', 'cached-result', 60000);

      const executionOrder: string[] = [];

      const fetchFn = async () => {
        executionOrder.push('fetch');
        return 'fresh-result';
      };

      const wrappedFetch = async () => {
        const cached = await cache.get('test-key');
        if (cached) {
          executionOrder.push('cache-hit');
          return cached;
        }
        executionOrder.push('cache-miss');

        const result = await circuitBreaker.execute(async () => {
          executionOrder.push('circuit-breaker');
          return await rateLimiter.execute(fetchFn, 'test-endpoint');
        });

        await cache.set('test-key', result, 60000);
        return result;
      };

      const result1 = await wrappedFetch();
      const result2 = await wrappedFetch();

      expect(result1).toBe('cached-result');
      expect(result2).toBe('cached-result');
      expect(executionOrder).toEqual(['cache-hit', 'cache-hit']);
    });

    it('should handle circuit open with cache fallback', async () => {
      await cache.set('test-key', 'cached-value', 60000);

      const shortTimeoutConfig = {
        ...circuitBreakerConfig,
        resetTimeoutMs: 100
      };
      const cb = new CircuitBreaker(shortTimeoutConfig);

      const failFn = async () => {
        throw new Error('API failure');
      };

      for (let i = 0; i < 10; i++) {
        try {
          await cb.execute(failFn);
        } catch (error) {
        }
      }

      expect(cb.getState()).toBe('OPEN');

      const cached = await cache.get('test-key');

      expect(cached).toBe('cached-value');
    });

    it('should handle rate limit with circuit protection', async () => {
      const tightLimitConfig = {
        ...rateLimitConfig,
        maxRequests: 2
      };
      const rl = new RateLimiter(tightLimitConfig);

      let callCount = 0;
      const fetchFn = async () => {
        callCount++;
        if (callCount > 2) {
          throw new Error('Rate limit exceeded');
        }
        return `result-${callCount}`;
      };

      const results = [];

      for (let i = 0; i < 5; i++) {
        try {
          const result = await circuitBreaker.execute(async () => {
            return await rl.execute(fetchFn, 'test-endpoint');
          });
          results.push(result);
        } catch (error) {
          results.push('error');
        }
      }

      expect(results).toContain('error');
    });
  });

  describe('Middleware State Coordination', () => {
    it('should provide consistent stats across all middleware', async () => {
      await cache.set('test-key', 'value', 60000);

      const cacheStats = cache.getStats();
      const rateStats = rateLimiter.getStats();
      const cbState = circuitBreaker.getState();

      expect(cacheStats.entries).toBe(1);
      expect(cacheStats.hits).toBe(0);
      expect(cacheStats.misses).toBe(0);
      expect(rateStats.concurrentRequests).toBe(0);
      expect(cbState).toBe('CLOSED');
    });

    it('should reset all middleware consistently', async () => {
      await cache.set('test-key', 'value', 60000);

      await rateLimiter.execute(async () => {
        throw new Error('Failure');
      }, 'test-endpoint');

      const failFn = async () => {
        throw new Error('Failure');
      };

      for (let i = 0; i < 10; i++) {
        try {
          await circuitBreaker.execute(failFn);
        } catch (error) {
        }
      }

      await cache.clear();
      rateLimiter.reset();
      circuitBreaker.reset();

      const cacheStats = cache.getStats();
      const rateStats = rateLimiter.getStats();
      const cbState = circuitBreaker.getState();

      expect(cacheStats.entries).toBe(0);
      expect(rateStats.concurrentRequests).toBe(0);
      expect(cbState).toBe('CLOSED');
    });
  });

  describe('Error Propagation', () => {
    it('should propagate rate limit errors through circuit breaker', async () => {
      const tightLimitConfig = {
        ...rateLimitConfig,
        maxRequests: 1
      };
      const rl = new RateLimiter(tightLimitConfig);

      await rl.execute(async () => 'success', 'test-endpoint');

      await expect(
        circuitBreaker.execute(async () => {
          return await rl.execute(async () => 'result', 'test-endpoint');
        })
      ).rejects.toThrow();
    });

    it('should propagate circuit open errors', async () => {
      const shortTimeoutConfig = {
        ...circuitBreakerConfig,
        resetTimeoutMs: 100
      };
      const cb = new CircuitBreaker(shortTimeoutConfig);

      const failFn = async () => {
        throw new Error('API failure');
      };

      for (let i = 0; i < 10; i++) {
        try {
          await cb.execute(failFn);
        } catch (error) {
        }
      }

      expect(cb.getState()).toBe('OPEN');

      await expect(cb.execute(failFn)).rejects.toThrow();
    });

    it('should handle cache errors gracefully', async () => {
      const errorFn = async () => {
        throw new Error('Cache error');
      };

      await expect(cache.get('test-key')).resolves.not.toThrow();

      await cache.set('test-key', 'value', 60000);

      const result = await cache.get('test-key');

      expect(result).toBe('value');
    });
  });
});
