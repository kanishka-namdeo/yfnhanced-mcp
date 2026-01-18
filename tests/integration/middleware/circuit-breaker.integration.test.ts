import { CircuitBreaker } from '../../../src/middleware/circuit-breaker';
import type { CircuitBreakerConfig } from '../../../src/types/config';

describe('Circuit Breaker Integration Tests', () => {
  let circuitBreaker: CircuitBreaker;

  const defaultConfig: CircuitBreakerConfig = {
    errorThresholdPercentage: 5,
    halfOpenMaxAttempts: 3,
    resetTimeoutMs: 60000,
    rollingCountTimeoutMs: 60000
  };

  beforeEach(() => {
    circuitBreaker = new CircuitBreaker(defaultConfig);
  });

  afterEach(() => {
    circuitBreaker.reset();
  });

  describe('Basic Circuit Breaker States', () => {
    it('should start in CLOSED state', () => {
      expect(circuitBreaker.getState()).toBe('CLOSED');
    });

    it('should remain CLOSED when all requests succeed', async () => {
      const successFn = async () => 'success';

      for (let i = 0; i < 10; i++) {
        const result = await circuitBreaker.execute(successFn);
        expect(result).toBe('success');
      }

      expect(circuitBreaker.getState()).toBe('CLOSED');
    });

    it('should transition to OPEN after exceeding error threshold', async () => {
      const failFn = async () => {
        throw new Error('Simulated failure');
      };

      for (let i = 0; i < 10; i++) {
        try {
          await circuitBreaker.execute(failFn);
        } catch (error) {
        }
      }

      expect(circuitBreaker.getState()).toBe('OPEN');
    });

    it('should transition to HALF_OPEN after reset timeout', async () => {
      const shortTimeoutConfig = {
        ...defaultConfig,
        resetTimeoutMs: 100
      };
      const cb = new CircuitBreaker(shortTimeoutConfig);

      const failFn = async () => {
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

      expect(cb.getState()).toBe('HALF_OPEN');
    });

    it('should return to CLOSED after successful HALF_OPEN attempts', async () => {
      const shortTimeoutConfig = {
        ...defaultConfig,
        resetTimeoutMs: 100,
        successThreshold: 2
      };
      const cb = new CircuitBreaker(shortTimeoutConfig);

      const failFn = async () => {
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

      const successFn = async () => 'success';

      await cb.execute(successFn);
      await cb.execute(successFn);

      expect(cb.getState()).toBe('CLOSED');
    });

    it('should return to OPEN after HALF_OPEN failures', async () => {
      const shortTimeoutConfig = {
        ...defaultConfig,
        resetTimeoutMs: 100
      };
      const cb = new CircuitBreaker(shortTimeoutConfig);

      const failFn = async () => {
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

      expect(cb.getState()).toBe('HALF_OPEN');

      try {
        await cb.execute(failFn);
      } catch (error) {
      }

      expect(cb.getState()).toBe('OPEN');
    });
  });

  describe('Error Threshold', () => {
    it('should not open circuit below error threshold', async () => {
      const failFn = async () => {
        throw new Error('Failure');
      };

      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(failFn);
        } catch (error) {
        }
      }

      expect(circuitBreaker.getState()).toBe('CLOSED');
    });

    it('should open circuit exactly at error threshold', async () => {
      const strictConfig = {
        ...defaultConfig,
        errorThresholdPercentage: 50
      };
      const cb = new CircuitBreaker(strictConfig);

      const failFn = async () => {
        throw new Error('Failure');
      };

      for (let i = 0; i < 5; i++) {
        try {
          await cb.execute(failFn);
        } catch (error) {
        }
      }

      expect(cb.getState()).toBe('OPEN');
    });

    it('should handle mixed success and failure correctly', async () => {
      const failConfig = {
        ...defaultConfig,
        errorThresholdPercentage: 50
      };
      const cb = new CircuitBreaker(failConfig);

      for (let i = 0; i < 10; i++) {
        if (i % 2 === 0) {
          try {
            await cb.execute(async () => {
              throw new Error('Failure');
            });
          } catch (error) {
          }
        } else {
          await cb.execute(async () => 'success');
        }
      }

      expect(cb.getState()).toBe('OPEN');
    });
  });

  describe('Reset Timeout', () => {
    it('should not transition to HALF_OPEN before timeout', async () => {
      const shortTimeoutConfig = {
        ...defaultConfig,
        resetTimeoutMs: 200
      };
      const cb = new CircuitBreaker(shortTimeoutConfig);

      const failFn = async () => {
        throw new Error('Failure');
      };

      for (let i = 0; i < 10; i++) {
        try {
          await cb.execute(failFn);
        } catch (error) {
        }
      }

      expect(cb.getState()).toBe('OPEN');

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(cb.getState()).toBe('OPEN');

      await new Promise(resolve => setTimeout(resolve, 150));

      expect(cb.getState()).toBe('HALF_OPEN');
    });

    it('should reset timer on new failures in HALF_OPEN', async () => {
      const shortTimeoutConfig = {
        ...defaultConfig,
        resetTimeoutMs: 100
      };
      const cb = new CircuitBreaker(shortTimeoutConfig);

      const failFn = async () => {
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

      expect(cb.getState()).toBe('HALF_OPEN');

      try {
        await cb.execute(failFn);
      } catch (error) {
      }

      expect(cb.getState()).toBe('OPEN');
    });
  });

  describe('Half-Open State Behavior', () => {
    it('should limit attempts in HALF_OPEN', async () => {
      const halfOpenConfig = {
        ...defaultConfig,
        resetTimeoutMs: 100,
        halfOpenMaxAttempts: 2
      };
      const cb = new CircuitBreaker(halfOpenConfig);

      const failFn = async () => {
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

      expect(cb.getState()).toBe('HALF_OPEN');

      await expect(cb.execute(failFn)).rejects.toThrow();
      await expect(cb.execute(failFn)).rejects.toThrow();

      expect(cb.getState()).toBe('OPEN');
    });

    it('should allow max attempts on success in HALF_OPEN', async () => {
      const halfOpenConfig = {
        ...defaultConfig,
        resetTimeoutMs: 100,
        halfOpenMaxAttempts: 2,
        successThreshold: 2
      };
      const cb = new CircuitBreaker(halfOpenConfig);

      const failFn = async () => {
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

      const successFn = async () => 'success';

      await cb.execute(successFn);
      await cb.execute(successFn);

      expect(cb.getState()).toBe('CLOSED');
    });
  });

  describe('Rolling Count Window', () => {
    it('should only count errors within rolling window', async () => {
      const rollingConfig = {
        ...defaultConfig,
        rollingCountTimeoutMs: 100
      };
      const cb = new CircuitBreaker(rollingConfig);

      const failFn = async () => {
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

      expect(cb.getState()).toBe('HALF_OPEN');
    });

    it('should slide the rolling window', async () => {
      const rollingConfig = {
        ...defaultConfig,
        rollingCountTimeoutMs: 100
      };
      const cb = new CircuitBreaker(rollingConfig);

      const failFn = async () => {
        throw new Error('Failure');
      };

      for (let i = 0; i < 5; i++) {
        try {
          await cb.execute(failFn);
        } catch (error) {
        }
      }

      expect(cb.getState()).toBe('CLOSED');

      await new Promise(resolve => setTimeout(resolve, 50));

      for (let i = 0; i < 5; i++) {
        try {
          await cb.execute(failFn);
        } catch (error) {
        }
      }

      expect(cb.getState()).toBe('CLOSED');
    });
  });

  describe('Concurrent Requests', () => {
    it('should handle concurrent requests in CLOSED state', async () => {
      const promises = [];

      for (let i = 0; i < 10; i++) {
        const promise = circuitBreaker.execute(async () => `result-${i}`);
        promises.push(promise);
      }

      const results = await Promise.all(promises);

      expect(results).toHaveLength(10);
      expect(circuitBreaker.getState()).toBe('CLOSED');
    });

    it('should handle concurrent requests when opening circuit', async () => {
      const failFn = async () => {
        throw new Error('Failure');
      };

      const promises = [];

      for (let i = 0; i < 10; i++) {
        const promise = circuitBreaker.execute(failFn);
        promises.push(promise);
      }

      await Promise.allSettled(promises);

      expect(circuitBreaker.getState()).toBe('OPEN');
    });

    it('should reject all requests when circuit is OPEN', async () => {
      const failFn = async () => {
        throw new Error('Failure');
      };

      for (let i = 0; i < 10; i++) {
        try {
          await circuitBreaker.execute(failFn);
        } catch (error) {
        }
      }

      expect(circuitBreaker.getState()).toBe('OPEN');

      const promises = [];

      for (let i = 0; i < 5; i++) {
        const promise = circuitBreaker.execute(failFn);
        promises.push(promise);
      }

      const results = await Promise.allSettled(promises);

      expect(results.every(r => r.status === 'rejected')).toBe(true);
    });
  });

  describe('Statistics and Monitoring', () => {
    it('should track total requests', async () => {
      await circuitBreaker.execute(async () => 'result');
      await circuitBreaker.execute(async () => 'result');
      await circuitBreaker.execute(async () => 'result');

      const stats = circuitBreaker.getStats();

      expect(stats.totalRequests).toBe(3);
    });

    it('should track successful requests', async () => {
      await circuitBreaker.execute(async () => 'result');
      await circuitBreaker.execute(async () => 'result');

      const stats = circuitBreaker.getStats();

      expect(stats.successfulRequests).toBe(2);
    });

    it('should track failed requests', async () => {
      for (let i = 0; i < 5; i++) {
        try {
          await circuitBreaker.execute(async () => {
            throw new Error('Failure');
          });
        } catch (error) {
        }
      }

      const stats = circuitBreaker.getStats();

      expect(stats.failedRequests).toBe(5);
    });

    it('should track last failure time', async () => {
      try {
        await circuitBreaker.execute(async () => {
          throw new Error('Failure');
        });
      } catch (error) {
      }

      const stats = circuitBreaker.getStats();

      expect(stats.lastFailureTime).toBeDefined();
      expect(typeof stats.lastFailureTime).toBe('number');
    });

    it('should calculate error percentage correctly', async () => {
      for (let i = 0; i < 10; i++) {
        try {
          await circuitBreaker.execute(async () => {
            if (i % 2 === 0) {
              throw new Error('Failure');
            }
            return 'success';
          });
        } catch (error) {
        }
      }

      const stats = circuitBreaker.getStats();

      expect(stats.errorPercentage).toBe(50);
    });
  });

  describe('Reset Functionality', () => {
    it('should reset to CLOSED state', async () => {
      const failFn = async () => {
        throw new Error('Failure');
      };

      for (let i = 0; i < 10; i++) {
        try {
          await circuitBreaker.execute(failFn);
        } catch (error) {
        }
      }

      expect(circuitBreaker.getState()).toBe('OPEN');

      circuitBreaker.reset();

      expect(circuitBreaker.getState()).toBe('CLOSED');
    });

    it('should clear statistics on reset', async () => {
      await circuitBreaker.execute(async () => 'result');

      try {
        await circuitBreaker.execute(async () => {
          throw new Error('Failure');
        });
      } catch (error) {
      }

      circuitBreaker.reset();

      const stats = circuitBreaker.getStats();

      expect(stats.totalRequests).toBe(0);
      expect(stats.successfulRequests).toBe(0);
      expect(stats.failedRequests).toBe(0);
      expect(stats.errorPercentage).toBe(0);
    });

    it('should allow requests after reset', async () => {
      const failFn = async () => {
        throw new Error('Failure');
      };

      for (let i = 0; i < 10; i++) {
        try {
          await circuitBreaker.execute(failFn);
        } catch (error) {
        }
      }

      expect(circuitBreaker.getState()).toBe('OPEN');

      circuitBreaker.reset();

      const result = await circuitBreaker.execute(async () => 'success');

      expect(result).toBe('success');
      expect(circuitBreaker.getState()).toBe('CLOSED');
    });
  });

  describe('Error Handling', ()   => {
    it('should handle different error types', async () => {
      const errorTypes = [
        new Error('Standard error'),
        new TypeError('Type error'),
        new RangeError('Range error'),
        { customError: true }
      ];

      for (const error of errorTypes) {
        try {
          await circuitBreaker.execute(async () => {
            throw error;
          });
        } catch (e) {
        }
      }

      const stats = circuitBreaker.getStats();

      expect(stats.failedRequests).toBe(4);
    });

    it('should propagate original error', async () => {
      const originalError = new Error('Original error');

      await expect(
        circuitBreaker.execute(async () => {
          throw originalError;
        })
      ).rejects.toThrow('Original error');
    });

    it('should handle async errors', async () => {
      await expect(
        circuitBreaker.execute(async () => {
          await new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Async error')), 10);
          });
        })
      ).rejects.toThrow('Async error');
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero error threshold', async () => {
      const zeroThresholdConfig = {
        ...defaultConfig,
        errorThresholdPercentage: 0
      };
      const cb = new CircuitBreaker(zeroThresholdConfig);

      await expect(
        cb.execute(async () => {
          throw new Error('Failure');
        })
      ).rejects.toThrow();

      expect(cb.getState()).toBe('OPEN');
    });

    it('should handle 100% error threshold', async () => {
      const fullThresholdConfig = {
        ...defaultConfig,
        errorThresholdPercentage: 100
      };
      const cb = new CircuitBreaker(fullThresholdConfig);

      for (let i = 0; i < 100; i++) {
        try {
          await cb.execute(async () => {
            throw new Error('Failure');
          });
        } catch (error) {
        }
      }

      expect(cb.getState()).toBe('OPEN');
    });

    it('should handle very short reset timeout', async () => {
      const shortTimeoutConfig = {
        ...defaultConfig,
        resetTimeoutMs: 10
      };
      const cb = new CircuitBreaker(shortTimeoutConfig);

      const failFn = async () => {
        throw new Error('Failure');
      };

      for (let i = 0; i < 10; i++) {
        try {
          await cb.execute(failFn);
        } catch (error) {
        }
      }

      expect(cb.getState()).toBe('OPEN');

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(cb.getState()).toBe('HALF_OPEN');
    });

    it('should handle very long reset timeout', async () => {
      const longTimeoutConfig = {
        ...defaultConfig,
        resetTimeoutMs: 100000
      };
      const cb = new CircuitBreaker(longTimeoutConfig);

      const failFn = async () => {
        throw new Error('Failure');
      };

      for (let i = 0; i < 10; i++) {
        try {
          await cb.execute(failFn);
        } catch (error) {
        }
      }

      expect(cb.getState()).toBe('OPEN');

      expect(cb.getState()).toBe('OPEN');
    });
  });
});
