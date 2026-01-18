import { CircuitBreaker, CircuitBreakerOpenError } from '../../../src/middleware/circuit-breaker';

describe('CircuitBreaker', () => {
  let circuitBreaker: CircuitBreaker;

  beforeEach(() => {
    jest.useFakeTimers();
    circuitBreaker = new CircuitBreaker({
      errorThresholdPercentage: 5,
      halfOpenMaxAttempts: 3,
      resetTimeoutMs: 60000,
      rollingCountTimeoutMs: 60000
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('should initialize in CLOSED state', () => {
    expect(circuitBreaker.getState()).toBe('CLOSED');
    expect(circuitBreaker.isOpen()).toBe(false);
  });

  test('should execute function successfully', async () => {
    const fn = jest.fn().mockResolvedValue('success');
    const result = await circuitBreaker.execute(fn);
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('should record success and stay CLOSED', async () => {
    const fn = jest.fn().mockResolvedValue('success');
    await circuitBreaker.execute(fn);
    circuitBreaker.recordSuccess();
    expect(circuitBreaker.getState()).toBe('CLOSED');
  });

  test('should open circuit after threshold failures', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('failure'));
    const config = circuitBreaker.getConfig();

    for (let i = 0; i < config.failureThreshold; i++) {
      try {
        await circuitBreaker.execute(fn);
      } catch {
      }
    }

    expect(circuitBreaker.isOpen()).toBe(true);
  });

  test('should throw CircuitBreakerOpenError when OPEN', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('failure'));
    const config = circuitBreaker.getConfig();

    for (let i = 0; i < config.failureThreshold; i++) {
      try {
        await circuitBreaker.execute(fn);
      } catch {
      }
    }

    await expect(circuitBreaker.execute(fn)).rejects.toThrow(CircuitBreakerOpenError);
  });

  test('should transition to HALF_OPEN after timeout', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('failure'));
    const config = circuitBreaker.getConfig();

    for (let i = 0; i < config.failureThreshold; i++) {
      try {
        await circuitBreaker.execute(fn);
      } catch {
      }
    }

    jest.advanceTimersByTime(config.timeoutMs + 1000);
    expect(circuitBreaker.getState()).toBe('HALF_OPEN');
  });

  test('should close circuit after success threshold in HALF_OPEN', async () => {
    const successFn = jest.fn().mockResolvedValue('success');
    const failFn = jest.fn().mockRejectedValue(new Error('failure'));
    const config = circuitBreaker.getConfig();

    for (let i = 0; i < config.failureThreshold; i++) {
      try {
        await circuitBreaker.execute(failFn);
      } catch {
      }
    }

    jest.advanceTimersByTime(config.timeoutMs + 1000);

    for (let i = 0; i < config.successThreshold; i++) {
      await circuitBreaker.execute(successFn);
    }

    expect(circuitBreaker.getState()).toBe('CLOSED');
  });

  test('should reopen circuit on failure in HALF_OPEN', async () => {
    const successFn = jest.fn().mockResolvedValue('success');
    const failFn = jest.fn().mockRejectedValue(new Error('failure'));
    const config = circuitBreaker.getConfig();

    for (let i = 0; i < config.failureThreshold; i++) {
      try {
        await circuitBreaker.execute(failFn);
      } catch {
      }
    }

    jest.advanceTimersByTime(config.timeoutMs + 1000);
    await circuitBreaker.execute(successFn);

    await expect(circuitBreaker.execute(failFn)).rejects.toThrow();
    expect(circuitBreaker.isOpen()).toBe(true);
  });

  test('should record failure', () => {
    circuitBreaker.recordFailure();
    expect(circuitBreaker['failureCount']).toBe(1);
  });

  test('should reset to CLOSED state', () => {
    circuitBreaker.recordFailure();
    circuitBreaker.recordFailure();
    circuitBreaker.recordSuccess();
    circuitBreaker.reset();
    expect(circuitBreaker.getState()).toBe('CLOSED');
    expect(circuitBreaker['failureCount']).toBe(0);
    expect(circuitBreaker['successCount']).toBe(0);
  });

  test('should get config', () => {
    const config = circuitBreaker.getConfig();
    expect(config).toHaveProperty('failureThreshold');
    expect(config).toHaveProperty('successThreshold');
    expect(config).toHaveProperty('timeoutMs');
    expect(config).toHaveProperty('monitoringWindowMs');
  });

  test('should update config', () => {
    circuitBreaker.updateConfig({ failureThreshold: 10 });
    expect(circuitBreaker.getConfig().failureThreshold).toBe(10);
  });

  test('should call fallback when configured', async () => {
    const fallbackFn = jest.fn().mockReturnValue('fallback');
    circuitBreaker.updateConfig({ fallback: fallbackFn });

    const fn = jest.fn().mockRejectedValue(new Error('failure'));
    const result = await circuitBreaker.execute(fn);
    expect(result).toBe('fallback');
    expect(fallbackFn).toHaveBeenCalled();
  });

  test('should call onOpen callback when opening', async () => {
    const onOpen = jest.fn();
    circuitBreaker.updateConfig({ onOpen });

    const fn = jest.fn().mockRejectedValue(new Error('failure'));
    const config = circuitBreaker.getConfig();

    for (let i = 0; i < config.failureThreshold; i++) {
      try {
        await circuitBreaker.execute(fn);
      } catch {
      }
    }

    expect(onOpen).toHaveBeenCalled();
  });

  test('should call onHalfOpen callback when transitioning', async () => {
    const onHalfOpen = jest.fn();
    circuitBreaker.updateConfig({ onHalfOpen });

    const fn = jest.fn().mockRejectedValue(new Error('failure'));
    const config = circuitBreaker.getConfig();

    for (let i = 0; i < config.failureThreshold; i++) {
      try {
        await circuitBreaker.execute(fn);
      } catch {
      }
    }

    jest.advanceTimersByTime(config.timeoutMs + 1000);
    circuitBreaker.getState();
    expect(onHalfOpen).toHaveBeenCalled();
  });

  test('should call onClose callback when closing', async () => {
    const onClose = jest.fn();
    circuitBreaker.updateConfig({ onClose });

    const successFn = jest.fn().mockResolvedValue('success');
    const failFn = jest.fn().mockRejectedValue(new Error('failure'));
    const config = circuitBreaker.getConfig();

    for (let i = 0; i < config.failureThreshold; i++) {
      try {
        await circuitBreaker.execute(failFn);
      } catch {
      }
    }

    jest.advanceTimersByTime(config.timeoutMs + 1000);

    for (let i = 0; i < config.successThreshold; i++) {
      await circuitBreaker.execute(successFn);
    }

    expect(onClose).toHaveBeenCalled();
  });

  test('should cleanup failure window on execute', async () => {
    const fn = jest.fn().mockResolvedValue('success');
    const now = Date.now();
    jest.setSystemTime(now);

    circuitBreaker['failureWindow'].push({ timestamp: now - 120000 });

    await circuitBreaker.execute(fn);
    expect(circuitBreaker['failureWindow'].length).toBe(0);
  });

  test('should handle multiple rapid failures', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('failure'));
    const config = circuitBreaker.getConfig();

    for (let i = 0; i < config.failureThreshold; i++) {
      try {
        await circuitBreaker.execute(fn);
      } catch {
      }
    }

    expect(circuitBreaker.isOpen()).toBe(true);
    expect(fn).toHaveBeenCalledTimes(config.failureThreshold);
  });

  test('should recover after reset timeout', async () => {
    const failFn = jest.fn().mockRejectedValue(new Error('failure'));
    const successFn = jest.fn().mockResolvedValue('success');
    const config = circuitBreaker.getConfig();

    for (let i = 0; i < config.failureThreshold; i++) {
      try {
        await circuitBreaker.execute(failFn);
      } catch {
      }
    }

    jest.advanceTimersByTime(config.timeoutMs + 1000);

    await expect(circuitBreaker.execute(successFn)).resolves.toBe('success');
    expect(circuitBreaker.getState()).toBe('HALF_OPEN');
  });
});

describe('CircuitBreakerOpenError', () => {
  test('should create error with default message', () => {
    const error = new CircuitBreakerOpenError();
    expect(error.message).toBe('Circuit breaker is open');
    expect(error.name).toBe('CircuitBreakerOpenError');
  });

  test('should create error with custom message', () => {
    const error = new CircuitBreakerOpenError('Custom error message');
    expect(error.message).toBe('Custom error message');
  });

  test('should be instance of Error', () => {
    const error = new CircuitBreakerOpenError();
    expect(error).toBeInstanceOf(Error);
  });

  test('should have correct error code', () => {
    const error = new CircuitBreakerOpenError();
    expect(error.code).toBe('YF_ERR_CIRCUIT_OPEN');
  });
});
