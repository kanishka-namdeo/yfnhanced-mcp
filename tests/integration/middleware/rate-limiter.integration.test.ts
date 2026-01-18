import { RateLimiter } from '../../../src/middleware/rate-limiter';
import type { RateLimitConfig } from '../../../src/types/config';

describe('Rate Limiter Integration Tests', () => {
  let rateLimiter: RateLimiter;

  const defaultConfig: RateLimitConfig = {
    maxRequests: 10,
    tokenRefillRate: 1,
    requestsPerMinute: 10,
    requestsPerHour: 100
  };

  beforeEach(() => {
    rateLimiter = new RateLimiter(defaultConfig);
  });

  afterEach(() => {
    rateLimiter.reset();
  });

  describe('Basic Rate Limiting', () => {
    it('should allow requests within limit', async () => {
      const results = [];

      for (let i = 0; i < 5; i++) {
        await rateLimiter.acquire();
        rateLimiter.release();
        results.push('success');
      }

      expect(results).toHaveLength(5);
      expect(results.every(r => r === 'success')).toBe(true);
    });

    it('should block requests exceeding limit', async () => {
      const tightLimitConfig = {
        ...defaultConfig,
        maxRequests: 2
      };
      const rl = new RateLimiter(tightLimitConfig);

      await rl.acquire();
      rl.release();
      await rl.acquire();
      rl.release();

      await expect(rl.acquire()).rejects.toThrow('Rate limit exceeded');
    });

    it('should execute function within rate limit', async () => {
      let callCount = 0;
      const fn = async () => {
        callCount++;
        return `result-${callCount}`;
      };

      const result = await rateLimiter.execute(fn, 'test-endpoint');

      expect(result).toBe('result-1');
      expect(callCount).toBe(1);
    });

    it('should release tokens after execution', async () => {
      await rateLimiter.execute(async () => 'result', 'test-endpoint');

      const stats = rateLimiter.getStats();

      expect(stats.concurrentRequests).toBe(0);
    });
  });

  describe('Per-Endpoint Rate Limiting', () => {
    it('should track requests per endpoint separately', async () => {
      await rateLimiter.execute(async () => 'result1', 'endpoint-1');
      await rateLimiter.execute(async () => 'result2', 'endpoint-2');

      const stats = rateLimiter.getStats();

      expect(stats.concurrentRequests).toBe(0);
    });

    it('should apply rate limit to each endpoint independently', async () => {
      const tightLimitConfig = {
        ...defaultConfig,
        maxRequests: 1
      };
      const rl = new RateLimiter(tightLimitConfig);

      await rl.execute(async () => 'result1', 'endpoint-1');
      await rl.execute(async () => 'result2', 'endpoint-2');

      await expect(rl.execute(async () => 'result3', 'endpoint-1')).rejects.toThrow();
      await expect(rl.execute(async () => 'result3', 'endpoint-2')).rejects.toThrow();
    });

    it('should handle multiple concurrent endpoints', async () => {
      const promises = [];

      for (let i = 0; i < 5; i++) {
        const promise = rateLimiter.execute(
          async () => `result-${i}`,
          `endpoint-${i % 2}`
        );
        promises.push(promise);
      }

      const results = await Promise.all(promises);

      expect(results).toHaveLength(5);
    });
  });

  describe('Token Refill', () => {
    it('should refill tokens over time', async () => {
      const fastRefillConfig = {
        ...defaultConfig,
        maxRequests: 2,
        tokenRefillRate: 1
      };
      const rl = new RateLimiter(fastRefillConfig);

      await rl.execute(async () => 'result1', 'test-endpoint');
      await rl.execute(async () => 'result2', 'test-endpoint');

      await expect(rl.execute(async () => 'result3', 'test-endpoint')).rejects.toThrow();

      await new Promise(resolve => setTimeout(resolve, 100));

      await expect(rl.execute(async () => 'result3', 'test-endpoint')).resolves.toBe('result3');
    });

    it('should respect refill rate', async () => {
      const fastRefillConfig = {
        ...defaultConfig,
        maxRequests: 2,
        tokenRefillRate: 0.1
      };
      const rl = new RateLimiter(fastRefillConfig);

      await rl.execute(async () => 'result1', 'test-endpoint');
      await rl.execute(async () => 'result2', 'test-endpoint');

      await expect(rl.execute(async () => 'result3', 'test-endpoint')).rejects.toThrow();

      await new Promise(resolve => setTimeout(resolve, 50));

      await expect(rl.execute(async () => 'result3', 'test-endpoint')).rejects.toThrow();

      await new Promise(resolve => setTimeout(resolve, 100));

      await expect(rl.execute(async () => 'result3', 'test-endpoint')).resolves.toBe('result3');
    });
  });

  describe('Time Window Rate Limiting', () => {
    it('should enforce requests per minute limit', async () => {
      const config: RateLimitConfig = {
        ...defaultConfig,
        maxRequests: 100,
        requestsPerMinute: 2
      };
      const rl = new RateLimiter(config);

      await rl.execute(async () => 'result1', 'test-endpoint');
      await rl.execute(async () => 'result2', 'test-endpoint');

      await expect(rl.execute(async () => 'result3', 'test-endpoint')).rejects.toThrow();
    });

    it('should enforce requests per hour limit', async () => {
      const config: RateLimitConfig = {
        ...defaultConfig,
        maxRequests: 100,
        requestsPerHour: 2
      };
      const rl = new RateLimiter(config);

      await rl.execute(async () => 'result1', 'test-endpoint');
      await rl.execute(async () => 'result2', 'test-endpoint');

      await expect(rl.execute(async () => 'result3', 'test-endpoint')).rejects.toThrow();
    });

    it('should reset time window counters after expiration', async () => {
      const config: RateLimitConfig = {
        ...defaultConfig,
        maxRequests: 100,
        requestsPerMinute: 2,
        requestsPerHour: 2
      };
      const rl = new RateLimiter(config);

      await rl.execute(async () => 'result1', 'test-endpoint');
      await rl.execute(async () => 'result2', 'test-endpoint');

      await expect(rl.execute(async () => 'result3', 'test-endpoint')).rejects.toThrow();

      const minuteResetConfig = {
        ...config,
        timeWindowMs: 100
      };
      const rl2 = new RateLimiter(minuteResetConfig);

      await rl2.execute(async () => 'result1', 'test-endpoint');
      await rl2.execute(async () => 'result2', 'test-endpoint');

      await new Promise(resolve => setTimeout(resolve, 150));

      await expect(rl2.execute(async () => 'result3', 'test-endpoint')).resolves.toBe('result3');
    });
  });

  describe('Concurrent Request Handling', () => {
    it('should handle concurrent requests correctly', async () => {
      const promises = [];

      for (let i = 0; i < 10; i++) {
        const promise = rateLimiter.execute(async () => `result-${i}`, 'test-endpoint');
        promises.push(promise);
      }

      const results = await Promise.all(promises);

      expect(results).toHaveLength(10);
      expect(results.every((r, i) => r === `result-${i}`)).toBe(true);
    });

    it('should track concurrent request count', async () => {
      let maxConcurrent = 0;
      const promises = [];

      for (let i = 0; i < 5; i++) {
        const promise = rateLimiter.execute(async () => {
          const stats = rateLimiter.getStats();
          if (stats.concurrentRequests > maxConcurrent) {
            maxConcurrent = stats.concurrentRequests;
          }
          await new Promise(resolve => setTimeout(resolve, 50));
          return 'result';
        }, 'test-endpoint');
        promises.push(promise);
      }

      await Promise.all(promises);

      expect(maxConcurrent).toBeGreaterThan(0);
      expect(maxConcurrent).toBeLessThanOrEqual(10);
    });

    it('should release tokens on error', async () => {
      await expect(
        rateLimiter.execute(async () => {
          throw new Error('Test error');
        }, 'test-endpoint')
      ).rejects.toThrow();

      const stats = rateLimiter.getStats();

      expect(stats.concurrentRequests).toBe(0);
    });

    it('should handle partial failures in concurrent requests', async () => {
      const promises = [];

      for (let i = 0; i < 10; i++) {
        const promise = rateLimiter.execute(async () => {
          if (i % 3 === 0) {
            throw new Error('Failure');
          }
          return `result-${i}`;
        }, 'test-endpoint');
        promises.push(promise);
      }

      const results = await Promise.allSettled(promises);

      const successCount = results.filter(r => r.status === 'fulfilled').length;
      const failureCount = results.filter(r => r.status === 'rejected').length;

      expect(successCount).toBeGreaterThan(0);
      expect(failureCount).toBeGreaterThan(0);
    });
  });

  describe('Statistics and Monitoring', () => {
    it('should track total requests made', async () => {
      for (let i = 0; i < 5; i++) {
        await rateLimiter.execute(async () => 'result', 'test-endpoint');
      }

      const stats = rateLimiter.getStats();

      expect(stats.totalRequests).toBe(5);
    });

    it('should track rejected requests', async () => {
      const tightLimitConfig = {
        ...defaultConfig,
        maxRequests: 1
      };
      const rl = new RateLimiter(tightLimitConfig);

      await rl.execute(async () => 'result', 'test-endpoint');

      for (let i = 0; i < 3; i++) {
        try {
          await rl.execute(async () => 'result', 'test-endpoint');
        } catch (error) {
        }
      }

      const stats = rl.getStats();

      expect(stats.rejectedRequests).toBe(3);
    });

    it('should track available tokens', async () => {
      await rateLimiter.execute(async () => 'result', 'test-endpoint');

      const stats = rateLimiter.getStats();

      expect(stats.availableTokens).toBeGreaterThanOrEqual(0);
      expect(stats.availableTokens).toBeLessThanOrEqual(defaultConfig.maxRequests);
    });

    it('should provide comprehensive stats', async () => {
      await rateLimiter.execute(async () => 'result', 'test-endpoint');

      const stats = rateLimiter.getStats();

      expect(stats).toHaveProperty('totalRequests');
      expect(stats).toHaveProperty('rejectedRequests');
      expect(stats).toHaveProperty('concurrentRequests');
      expect(stats).toHaveProperty('availableTokens');
    });
  });

  describe('Reset and Cleanup', () => {
    it('should reset rate limiter state', async () => {
      await rateLimiter.execute(async () => 'result', 'test-endpoint');
      await rateLimiter.execute(async () => 'result', 'test-endpoint');

      rateLimiter.reset();

      const stats = rateLimiter.getStats();

      expect(stats.totalRequests).toBe(0);
      expect(stats.rejectedRequests).toBe(0);
      expect(stats.concurrentRequests).toBe(0);
      expect(stats.availableTokens).toBe(defaultConfig.maxRequests);
    });

    it('should allow requests after reset', async () => {
      const tightLimitConfig = {
        ...defaultConfig,
        maxRequests: 1
      };
      const rl = new RateLimiter(tightLimitConfig);

      await rl.execute(async () => 'result', 'test-endpoint');
      await expect(rl.execute(async () => 'result', 'test-endpoint')).rejects.toThrow();

      rl.reset();

      await expect(rl.execute(async () => 'result', 'test-endpoint')).resolves.toBe('result');
    });
  });

  describe('Error Handling', () => {
    it('should handle function errors correctly', async () => {
      await expect(
        rateLimiter.execute(async () => {
          throw new Error('Function error');
        }, 'test-endpoint')
      ).rejects.toThrow('Function error');
    });

    it('should release tokens even on error', async () => {
      try {
        await rateLimiter.execute(async () => {
          throw new Error('Error');
        }, 'test-endpoint');
      } catch (error) {
      }

      const stats = rateLimiter.getStats();

      expect(stats.concurrentRequests).toBe(0);
    });

    it('should handle timeout errors', async () => {
      await expect(
        rateLimiter.execute(async () => {
          await new Promise(resolve => setTimeout(resolve, 10000));
          return 'result';
        }, 'test-endpoint')
      ).resolves.toBe('result');
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero max requests', async () => {
      const zeroLimitConfig = {
        ...defaultConfig,
        maxRequests: 0
      };
      const rl = new RateLimiter(zeroLimitConfig);

      await expect(rl.execute(async () => 'result', 'test-endpoint')).rejects.toThrow();
    });

    it('should handle very high max requests', async () => {
      const highLimitConfig = {
        ...defaultConfig,
        maxRequests: 10000
      };
      const rl = new RateLimiter(highLimitConfig);

      const promises = [];

      for (let i = 0; i < 100; i++) {
        const promise = rl.execute(async () => `result-${i}`, 'test-endpoint');
        promises.push(promise);
      }

      const results = await Promise.all(promises);

      expect(results).toHaveLength(100);
    });

    it('should handle very fast sequential requests', async () => {
      const promises = [];

      for (let i = 0; i < 10; i++) {
        const promise = rateLimiter.execute(async () => `result-${i}`, 'test-endpoint');
        promises.push(promise);
      }

      const startTime = Date.now();
      const results = await Promise.all(promises);
      const endTime = Date.now();

      expect(results).toHaveLength(10);
      expect(endTime - startTime).toBeLessThan(1000);
    });

    it('should handle very slow requests', async () => {
      await rateLimiter.execute(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return 'result';
      }, 'test-endpoint');

      const stats = rateLimiter.getStats();

      expect(stats.concurrentRequests).toBe(0);
    });
  });
});
