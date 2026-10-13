import { CircuitBreaker, CircuitBreakerOpenError } from '../../../src/middleware/circuit-breaker';
import type { CircuitBreakerConfig } from '../../../src/types/config';
import { YahooFinanceError, YF_ERR_CIRCUIT_OPEN } from '../../../src/types/errors';

// Elapsed-time transitions are driven by fake timers so no test depends on wall clock.
// The breaker only reads Date.now(); jest.advanceTimersByTime moves the mocked clock.
function advance(ms: number): void {
  jest.advanceTimersByTime(ms);
}

const succeed = async (): Promise<string> => 'ok';

const failWith = (message = 'Simulated failure') => async (): Promise<never> => {
  throw new Error(message);
};

async function expectRejected(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('Expected the breaker to reject, but it resolved');
}

async function recordFailures(cb: CircuitBreaker, count: number): Promise<void> {
  for (let i = 0; i < count; i++) {
    await expectRejected(cb.execute(failWith()));
  }
}

function makeConfig(overrides: Partial<CircuitBreakerConfig> = {}): CircuitBreakerConfig {
  return {
    enabled: true,
    timeoutMs: 60000,
    // CircuitBreaker reads errorThresholdPercentage as failureThreshold, halfOpenMaxAttempts
    // as successThreshold, resetTimeoutMs as timeoutMs and rollingCountTimeoutMs as
    // monitoringWindowMs. The names describe a percentage breaker; none of that exists.
    errorThresholdPercentage: 5,
    resetTimeoutMs: 60000,
    rollingCountTimeoutMs: 60000,
    rollingCountBuckets: 10,
    volumeThreshold: 5,
    halfOpenMaxAttempts: 3,
    ...overrides
  };
}

describe('Circuit Breaker Integration Tests', () => {
  let circuitBreaker: CircuitBreaker;

  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(() => {
    circuitBreaker = new CircuitBreaker(makeConfig());
  });

  afterEach(() => {
    circuitBreaker.reset();
  });

  describe('Basic Circuit Breaker States', () => {
    it('should start in CLOSED state', () => {
      expect(circuitBreaker.getState()).toBe('CLOSED');
      expect(circuitBreaker.isOpen()).toBe(false);
    });

    it('should only ever report the three uppercase state literals', async () => {
      const cb = new CircuitBreaker(makeConfig({ errorThresholdPercentage: 1, resetTimeoutMs: 100 }));
      const seen = new Set<string>();

      seen.add(cb.getState());
      await expectRejected(cb.execute(failWith()));
      seen.add(cb.getState());
      advance(100);
      seen.add(cb.getState());

      // src/types/config.ts:69 types a lowercase 'closed' | 'open' | 'half-open' union, and
      // types/middleware.ts:125 spells it 'half-open'; the runtime values are neither.
      expect([...seen].sort()).toEqual(['CLOSED', 'HALF_OPEN', 'OPEN']);
      cb.reset();
    });

    it('should remain CLOSED when all requests succeed', async () => {
      for (let i = 0; i < 10; i++) {
        expect(await circuitBreaker.execute(succeed)).toBe('ok');
      }

      expect(circuitBreaker.getState()).toBe('CLOSED');
      expect(circuitBreaker.getMetrics().failureCount).toBe(0);
    });

    it('should transition to OPEN once failures reach the threshold', async () => {
      await recordFailures(circuitBreaker, 10);

      expect(circuitBreaker.getState()).toBe('OPEN');
    });

    it('should treat errorThresholdPercentage as a failure count, not a percentage', async () => {
      const cb = new CircuitBreaker(makeConfig({ errorThresholdPercentage: 50 }));

      await recordFailures(cb, 10);

      // 50 is read as `failureThreshold = 50`, so ten failures leave it CLOSED.
      expect(cb.getState()).toBe('CLOSED');
      expect(cb.getMetrics().failureCount).toBe(10);

      await recordFailures(cb, 40);
      expect(cb.getState()).toBe('OPEN');
      cb.reset();
    });

    it('should open at exactly the configured failure threshold', async () => {
      const cb = new CircuitBreaker(makeConfig({ errorThresholdPercentage: 5 }));

      await recordFailures(cb, 4);
      expect(cb.getState()).toBe('CLOSED');
      expect(cb.getMetrics().failureCount).toBe(4);

      await expectRejected(cb.execute(failWith()));
      expect(cb.getState()).toBe('OPEN');
      expect(cb.getMetrics().failureCount).toBe(5);
      cb.reset();
    });

    it('should ignore volumeThreshold because no volume gate is implemented', async () => {
      const cb = new CircuitBreaker(makeConfig({ errorThresholdPercentage: 1, volumeThreshold: 1000 }));

      await expectRejected(cb.execute(failWith()));

      expect(cb.getState()).toBe('OPEN');
      cb.reset();
    });

    it('should keep mixed successes from masking failures in the window', async () => {
      const cb = new CircuitBreaker(makeConfig({ errorThresholdPercentage: 3 }));

      // Successes never remove records from failureWindow, so the failures keep
      // accumulating across an alternating mix.
      await expectRejected(cb.execute(failWith()));
      await cb.execute(succeed);
      await expectRejected(cb.execute(failWith()));
      await cb.execute(succeed);

      expect(cb.getState()).toBe('CLOSED');
      expect(cb.getMetrics().failureCount).toBe(2);

      await expectRejected(cb.execute(failWith()));
      expect(cb.getState()).toBe('OPEN');
      cb.reset();
    });
  });

  describe('Reset Timeout', () => {
    it('should not transition to HALF_OPEN before the timeout elapses', async () => {
      const cb = new CircuitBreaker(makeConfig({ resetTimeoutMs: 200 }));

      await recordFailures(cb, 10);
      expect(cb.getState()).toBe('OPEN');

      advance(199);
      expect(cb.getState()).toBe('OPEN');

      advance(1);
      expect(cb.getState()).toBe('HALF_OPEN');
      cb.reset();
    });

    it('should transition to HALF_OPEN lazily from execute rather than from a timer', async () => {
      const cb = new CircuitBreaker(makeConfig({ resetTimeoutMs: 100 }));

      await recordFailures(cb, 10);
      expect(cb.isOpen()).toBe(true);

      // isOpen() reads getState(), which is the transition point; calling it consumes the
      // OPEN verdict, so it cannot report OPEN once the window has passed.
      advance(100);
      expect(cb.isOpen()).toBe(false);
      expect(cb.getState()).toBe('HALF_OPEN');

      const executed = await cb.execute(succeed);
      expect(executed).toBe('ok');
      cb.reset();
    });

    it('should re-arm the timeout when it reopens from HALF_OPEN', async () => {
      const cb = new CircuitBreaker(makeConfig({ resetTimeoutMs: 100 }));

      await recordFailures(cb, 10);
      advance(100);
      expect(cb.getState()).toBe('HALF_OPEN');

      await expectRejected(cb.execute(failWith()));
      expect(cb.getState()).toBe('OPEN');

      advance(99);
      expect(cb.getState()).toBe('OPEN');

      advance(1);
      expect(cb.getState()).toBe('HALF_OPEN');
      cb.reset();
    });

    it('should fall back to the inline 60s timeout when resetTimeoutMs is 0', async () => {
      const cb = new CircuitBreaker(makeConfig({ resetTimeoutMs: 0, rollingCountTimeoutMs: 60000 }));

      await recordFailures(cb, 10);
      expect(cb.getState()).toBe('OPEN');

      // `config.resetTimeoutMs || 60000` cannot express "reopen immediately".
      advance(1000);
      expect(cb.getState()).toBe('OPEN');
      expect(cb.getConfig().timeoutMs).toBe(60000);
      cb.reset();
    });

    it('should handle a very long reset timeout without transitioning', async () => {
      const cb = new CircuitBreaker(makeConfig({ resetTimeoutMs: 100000 }));

      await recordFailures(cb, 10);

      expect(cb.getState()).toBe('OPEN');
      advance(99999);
      expect(cb.getState()).toBe('OPEN');
      advance(1);
      expect(cb.getState()).toBe('HALF_OPEN');
      cb.reset();
    });
  });

  describe('Half-Open State Behavior', () => {
    it('should return to CLOSED after successThreshold half-open successes', async () => {
      const cb = new CircuitBreaker(makeConfig({ resetTimeoutMs: 100, halfOpenMaxAttempts: 2 }));

      await recordFailures(cb, 10);
      advance(100);
      expect(cb.getState()).toBe('HALF_OPEN');

      await cb.execute(succeed);
      expect(cb.getState()).toBe('HALF_OPEN');

      await cb.execute(succeed);
      expect(cb.getState()).toBe('CLOSED');
      expect(cb.getMetrics()).toEqual({ failureCount: 0, successCount: 0 });
      cb.reset();
    });

    it('should return to OPEN after any single half-open failure', async () => {
      const cb = new CircuitBreaker(makeConfig({ resetTimeoutMs: 100, halfOpenMaxAttempts: 3 }));

      await recordFailures(cb, 10);
      advance(100);
      expect(cb.getState()).toBe('HALF_OPEN');

      await cb.execute(succeed);
      await cb.execute(succeed);
      expect(cb.getState()).toBe('HALF_OPEN');

      await expectRejected(cb.execute(failWith()));

      expect(cb.getState()).toBe('OPEN');
      // transitionTo('OPEN') zeroes successCount, so the two banked probes are lost.
      expect(cb.getMetrics().successCount).toBe(0);
      cb.reset();
    });

    it('should ignore a successThreshold key because the class reads halfOpenMaxAttempts', async () => {
      const cb = new CircuitBreaker(
        makeConfig({ resetTimeoutMs: 100, halfOpenMaxAttempts: 3, successThreshold: 1 } as CircuitBreakerConfig)
      );

      await recordFailures(cb, 10);
      advance(100);

      await cb.execute(succeed);
      expect(cb.getState()).toBe('HALF_OPEN');

      await cb.execute(succeed);
      await cb.execute(succeed);
      expect(cb.getState()).toBe('CLOSED');
      expect(cb.getConfig().successThreshold).toBe(3);
      cb.reset();
    });

    it('should not count the rejection thrown while OPEN as a half-open probe', async () => {
      const cb = new CircuitBreaker(makeConfig({ resetTimeoutMs: 100 }));

      await recordFailures(cb, 5);
      const beforeFailures = cb.getMetrics().failureCount;

      await expectRejected(cb.execute(succeed));
      expect(cb.getMetrics().failureCount).toBe(beforeFailures);
      cb.reset();
    });
  });

  describe('Rolling Count Window', () => {
    it('should only count failures inside monitoringWindowMs', async () => {
      const cb = new CircuitBreaker(makeConfig({ errorThresholdPercentage: 5, rollingCountTimeoutMs: 1000 }));

      await recordFailures(cb, 4);
      expect(cb.getMetrics().failureCount).toBe(4);

      advance(1001);

      // cleanupFailureWindow recomputes failureCount from the surviving records.
      await expectRejected(cb.execute(failWith()));
      expect(cb.getMetrics().failureCount).toBe(1);
      expect(cb.getState()).toBe('CLOSED');

      await recordFailures(cb, 4);
      expect(cb.getState()).toBe('OPEN');
      cb.reset();
    });

    it('should slide the window so an equal split never reaches the threshold', async () => {
      const cb = new CircuitBreaker(makeConfig({ errorThresholdPercentage: 5, rollingCountTimeoutMs: 1000 }));

      for (let round = 0; round < 4; round++) {
        await recordFailures(cb, 4);
        expect(cb.getState()).toBe('CLOSED');
        advance(1000);
      }

      expect(cb.getState()).toBe('CLOSED');
      cb.reset();
    });

    it('should not let the monitoring window reopen an OPEN circuit', async () => {
      const cb = new CircuitBreaker(
        makeConfig({ rollingCountTimeoutMs: 100, resetTimeoutMs: 60000, errorThresholdPercentage: 5 })
      );

      await recordFailures(cb, 5);

      expect(cb.getState()).toBe('OPEN');
      expect(cb.getMetrics().failureCount).toBe(5);

      advance(150);

      // The old suite asserted HALF_OPEN here. The gate is timeoutMs, not the monitoring
      // window, and nothing prunes the window while OPEN rejects before cleanup runs.
      expect(cb.getState()).toBe('OPEN');
      expect(cb.getMetrics().failureCount).toBe(5);

      advance(59850);
      expect(cb.getState()).toBe('HALF_OPEN');
      expect(cb.getMetrics().failureCount).toBe(0);
      cb.reset();
    });
  });

  describe('Concurrent Requests', () => {
    it('should handle concurrent requests in CLOSED state', async () => {
      const promises = Array.from({ length: 10 }, (_unused, i) =>
        circuitBreaker.execute(async () => `result-${i}`)
      );

      const results = await Promise.all(promises);

      expect(results).toHaveLength(10);
      expect(circuitBreaker.getState()).toBe('CLOSED');
    });

    it('should open the circuit from concurrent failures', async () => {
      const promises = Array.from({ length: 10 }, () => circuitBreaker.execute(failWith()));

      await Promise.allSettled(promises);

      expect(circuitBreaker.getState()).toBe('OPEN');
    });

    it('should reject every request while the circuit is OPEN', async () => {
      await recordFailures(circuitBreaker, 5);

      const results = await Promise.allSettled(
        Array.from({ length: 5 }, () => circuitBreaker.execute(succeed))
      );

      expect(results.every((r) => r.status === 'rejected')).toBe(true);
      expect(
        results.every((r) => r.status === 'rejected' && r.reason instanceof CircuitBreakerOpenError)
      ).toBe(true);
    });

    it('should allow one probe per half-open success budget without a volume gate', async () => {
      const cb = new CircuitBreaker(makeConfig({ resetTimeoutMs: 100, halfOpenMaxAttempts: 3 }));

      await recordFailures(cb, 5);
      advance(100);

      const probes = await Promise.allSettled(Array.from({ length: 3 }, () => cb.execute(succeed)));

      expect(probes.every((p) => p.status === 'fulfilled')).toBe(true);
      // Three concurrent probes all land in HALF_OPEN, so the third closes the circuit.
      expect(cb.getState()).toBe('CLOSED');
      cb.reset();
    });
  });

  describe('Statistics and Monitoring', () => {
    it('should track failure and success counts through getMetrics', async () => {
      await circuitBreaker.execute(succeed);
      await circuitBreaker.execute(succeed);
      expect(circuitBreaker.getMetrics()).toEqual({ failureCount: 0, successCount: 2 });

      await expectRejected(circuitBreaker.execute(failWith()));
      expect(circuitBreaker.getMetrics().failureCount).toBe(1);
    });

    it('should expose only failure and success counts', () => {
      // There is no getStats(), no totalRequests, no errorPercentage and no lastFailureTime
      // on CircuitBreaker; lastFailureTime is private and never returned.
      expect(typeof (circuitBreaker as unknown as { getStats?: unknown }).getStats).toBe('undefined');
      expect(Object.keys(circuitBreaker.getMetrics()).sort()).toEqual(['failureCount', 'successCount']);
    });

    it('should count every failure while below the threshold', async () => {
      const cb = new CircuitBreaker(makeConfig({ errorThresholdPercentage: 6 }));

      for (let i = 0; i < 5; i++) {
        await expectRejected(cb.execute(failWith()));
      }

      expect(cb.getMetrics().failureCount).toBe(5);
      expect(cb.getState()).toBe('CLOSED');
      cb.reset();
    });

    it('should expose the resolved internal config', () => {
      const config = circuitBreaker.getConfig();

      expect(config).toEqual({
        failureThreshold: 5,
        successThreshold: 3,
        timeoutMs: 60000,
        monitoringWindowMs: 60000,
        fallback: undefined,
        onOpen: undefined,
        onHalfOpen: undefined,
        onClose: undefined
      });
    });

    it('should apply updateConfig to the next transition', async () => {
      circuitBreaker.updateConfig({ failureThreshold: 1 });

      await expectRejected(circuitBreaker.execute(failWith()));

      expect(circuitBreaker.getState()).toBe('OPEN');
      expect(circuitBreaker.getConfig().failureThreshold).toBe(1);
    });

    it('should return a copy from getConfig so callers cannot mutate state', () => {
      const config = circuitBreaker.getConfig();
      config.failureThreshold = 999;

      expect(circuitBreaker.getConfig().failureThreshold).toBe(5);
    });
  });

  describe('Reset Functionality', () => {
    it('should reset to CLOSED state', async () => {
      await recordFailures(circuitBreaker, 10);
      expect(circuitBreaker.getState()).toBe('OPEN');

      circuitBreaker.reset();

      expect(circuitBreaker.getState()).toBe('CLOSED');
      expect(circuitBreaker.isOpen()).toBe(false);
    });

    it('should clear both counters on reset', async () => {
      await circuitBreaker.execute(succeed);
      await expectRejected(circuitBreaker.execute(failWith()));

      circuitBreaker.reset();

      expect(circuitBreaker.getMetrics()).toEqual({ failureCount: 0, successCount: 0 });
    });

    it('should restart the reset timeout so a reset cannot be used as a free probe', async () => {
      const cb = new CircuitBreaker(makeConfig({ resetTimeoutMs: 100 }));

      await recordFailures(cb, 5);
      advance(50);

      cb.reset();
      expect(cb.getState()).toBe('CLOSED');

      await recordFailures(cb, 5);
      expect(cb.getState()).toBe('OPEN');

      advance(99);
      expect(cb.getState()).toBe('OPEN');
      advance(1);
      expect(cb.getState()).toBe('HALF_OPEN');
      cb.reset();
    });

    it('should allow requests after reset', async () => {
      await recordFailures(circuitBreaker, 10);

      circuitBreaker.reset();

      expect(await circuitBreaker.execute(succeed)).toBe('ok');
      expect(circuitBreaker.getState()).toBe('CLOSED');
    });
  });

  describe('Error Handling', () => {
    it('should propagate the original error', async () => {
      const originalError = new Error('Original error');

      await expect(
        circuitBreaker.execute(async () => {
          throw originalError;
        })
      ).rejects.toBe(originalError);
    });

    it('should record non-Error throwables as failures', async () => {
      const cb = new CircuitBreaker(makeConfig({ errorThresholdPercentage: 4 }));
      const thrown = [{ customError: true }, 'a string', 42, null];

      for (const value of thrown) {
        await expectRejected(cb.execute(async () => {
          throw value;
        }));
      }

      expect(cb.getMetrics().failureCount).toBe(4);
      expect(cb.getState()).toBe('OPEN');
      cb.reset();
    });

    it('should propagate an asynchronously raised error', async () => {
      await expect(
        circuitBreaker.execute(async () => {
          await Promise.resolve();
          throw new Error('Async error');
        })
      ).rejects.toThrow('Async error');
    });

    it('should route an open circuit to a CircuitBreakerOpenError with the documented contract', async () => {
      await recordFailures(circuitBreaker, 5);

      const error = (await expectRejected(circuitBreaker.execute(succeed))) as CircuitBreakerOpenError;

      expect(error).toBeInstanceOf(CircuitBreakerOpenError);
      expect(error).toBeInstanceOf(YahooFinanceError);
      expect(error.name).toBe('CircuitBreakerOpenError');
      expect(error.code).toBe(YF_ERR_CIRCUIT_OPEN);
      expect(error.statusCode).toBeNull();
      expect(error.message).toBe('Circuit breaker is open');
      expect(error.suggestedAction).toBe('Wait for circuit breaker to reset before retrying');
    });

    it('should mark the open-circuit error non-retryable so the retry layer exits immediately', async () => {
      await recordFailures(circuitBreaker, 5);

      const error = (await expectRejected(circuitBreaker.execute(succeed))) as CircuitBreakerOpenError;

      expect(error.isRetryable).toBe(false);
      expect(error.isRateLimit).toBe(false);
    });

    it('should serve the fallback value while still recording the failure', async () => {
      const cb = new CircuitBreaker(
        makeConfig({
          errorThresholdPercentage: 5,
          fallback: (error: Error) => `fallback for ${error.message}`
        })
      );

      const result = await cb.execute(failWith('boom'));

      expect(result).toBe('fallback for boom');
      expect(cb.getMetrics().failureCount).toBe(1);
      expect(cb.getState()).toBe('CLOSED');

      // Each later failure still reaches recordFailure, so the fallback masks the error
      // without masking the trip.
      for (let i = 0; i < 4; i++) {
        expect(await cb.execute(failWith())).toBe('fallback for Simulated failure');
      }

      expect(cb.getState()).toBe('OPEN');
      await expect(cb.execute(succeed)).rejects.toBeInstanceOf(CircuitBreakerOpenError);
      cb.reset();
    });

    it('should not apply the fallback once the circuit is open', async () => {
      const cb = new CircuitBreaker(makeConfig({ errorThresholdPercentage: 1, fallback: () => 'fallback' }));

      expect(await cb.execute(failWith())).toBe('fallback');

      await expect(cb.execute(succeed)).rejects.toBeInstanceOf(CircuitBreakerOpenError);
      cb.reset();
    });

    it('should fire the state callbacks in transition order', async () => {
      const events: string[] = [];
      const cb = new CircuitBreaker(
        makeConfig({
          errorThresholdPercentage: 1,
          halfOpenMaxAttempts: 1,
          resetTimeoutMs: 100,
          onOpen: () => events.push('open'),
          onHalfOpen: () => events.push('half-open'),
          onClose: () => events.push('close')
        })
      );

      await expectRejected(cb.execute(failWith()));
      advance(100);
      await cb.execute(succeed);

      expect(events).toEqual(['open', 'half-open', 'close']);
      cb.reset();
    });
  });

  describe('Inline Defaults', () => {
    it('should fall back to 5 / 3 / 60000 / 60000 for an empty config', () => {
      const cb = new CircuitBreaker({} as CircuitBreakerConfig);

      expect(cb.getConfig()).toMatchObject({
        failureThreshold: 5,
        successThreshold: 3,
        timeoutMs: 60000,
        monitoringWindowMs: 60000
      });
    });

    it('should fall back when zero-valued thresholds are configured', () => {
      const cb = new CircuitBreaker(
        makeConfig({ errorThresholdPercentage: 0, halfOpenMaxAttempts: 0, rollingCountTimeoutMs: 0 })
      );

      // Every default uses `||`, so 0 is indistinguishable from unset.
      expect(cb.getConfig()).toMatchObject({
        failureThreshold: 5,
        successThreshold: 3,
        monitoringWindowMs: 60000
      });
    });

    it('should not implement forceOpen, forceClose, isClosed or isHalfOpen', () => {
      const optional = circuitBreaker as unknown as Record<string, unknown>;

      // CircuitBreakerInterface in src/types/middleware.ts declares all four; none exists.
      expect(optional.forceOpen).toBeUndefined();
      expect(optional.forceClose).toBeUndefined();
      expect(optional.isClosed).toBeUndefined();
      expect(typeof optional.isOpen).toBe('function');
    });
  });
});
