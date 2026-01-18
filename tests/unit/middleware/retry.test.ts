import { RetryPolicy, MaxRetriesExceededError, createRetryPolicy, retry } from '../../../src/middleware/retry';

describe('RetryPolicy', () => {
  let retryPolicy: RetryPolicy;

  beforeEach(() => {
    jest.useFakeTimers();
    retryPolicy = new RetryPolicy({
      enabled: true,
      maxRetries: 3,
      initialDelayMs: 1000,
      maxDelayMs: 10000,
      strategy: 'exponential',
      backoffMultiplier: 2,
      jitter: false,
      retryableStatusCodes: [429, 500, 502, 503, 504],
      retryableErrorCodes: ['ECONNRESET', 'ETIMEDOUT']
    }, (ms) => {
      jest.advanceTimersByTime(ms);
      return Promise.resolve();
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('should initialize with config', () => {
    const config = retryPolicy.getConfig();
    expect(config.maxRetries).toBe(3);
    expect(config.initialDelayMs).toBe(1000);
    expect(config.strategy).toBe('exponential');
  });

  test('should execute function successfully on first attempt', async () => {
    const fn = jest.fn().mockResolvedValue('success');
    const result = await retryPolicy.execute(fn);
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('should retry on retryable error', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValue('success');

    const promise = retryPolicy.execute(fn);
    jest.runAllTimers();
    await expect(promise).resolves.toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  test('should not retry on non-retryable error', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('symbol not found'));
    await expect(retryPolicy.execute(fn)).rejects.toThrow('symbol not found');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('should throw MaxRetriesExceededError after max retries', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('ECONNRESET'));
    const promise = retryPolicy.execute(fn);
    jest.runAllTimers();
    await expect(promise).rejects.toThrow(MaxRetriesExceededError);
    expect(fn).toHaveBeenCalledTimes(4);
  });

  test('should use exponential backoff strategy', () => {
    const delay1 = retryPolicy.calculateDelay(1);
    const delay2 = retryPolicy.calculateDelay(2);
    const delay3 = retryPolicy.calculateDelay(3);

    expect(delay1).toBe(1000);
    expect(delay2).toBe(2000);
    expect(delay3).toBe(4000);
  });

  test('should use linear backoff strategy', () => {
    retryPolicy.updateConfig({ strategy: 'linear' });

    const delay1 = retryPolicy.calculateDelay(1);
    const delay2 = retryPolicy.calculateDelay(2);
    const delay3 = retryPolicy.calculateDelay(3);

    expect(delay1).toBe(1000);
    expect(delay2).toBe(2000);
    expect(delay3).toBe(3000);
  });

  test('should use fixed delay strategy', () => {
    retryPolicy.updateConfig({ strategy: 'fixed', retryDelayMs: 2000 });

    const delay1 = retryPolicy.calculateDelay(1);
    const delay2 = retryPolicy.calculateDelay(2);
    const delay3 = retryPolicy.calculateDelay(3);

    expect(delay1).toBe(2000);
    expect(delay2).toBe(2000);
    expect(delay3).toBe(2000);
  });

  test('should not exceed max delay', () => {
    retryPolicy.updateConfig({ maxDelayMs: 3000 });
    const delay = retryPolicy.calculateDelay(10);
    expect(delay).toBeLessThanOrEqual(3000);
  });

  test('should add jitter when enabled', () => {
    retryPolicy.updateConfig({ jitter: true });
    const baseDelay = 1000;
    const delay = retryPolicy.calculateDelay(1);
    expect(delay).toBeGreaterThanOrEqual(baseDelay * 0.9);
    expect(delay).toBeLessThanOrEqual(baseDelay * 1.1);
  });

  test('should not add jitter when disabled', () => {
    retryPolicy.updateConfig({ jitter: false });
    const delay = retryPolicy.calculateDelay(1);
    expect(delay).toBe(1000);
  });

  test('should call onRetry callback', async () => {
    const onRetry = jest.fn();
    retryPolicy.updateConfig({ onRetry });

    const fn = jest.fn()
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValue('success');

    const promise = retryPolicy.execute(fn);
    jest.runAllTimers();
    await promise;

    expect(onRetry).toHaveBeenCalled();
  });

  test('should call onGiveUp callback', async () => {
    const onGiveUp = jest.fn();
    retryPolicy.updateConfig({ onGiveUp });

    const fn = jest.fn().mockRejectedValue(new Error('ECONNRESET'));
    const promise = retryPolicy.execute(fn);
    jest.runAllTimers();
    await promise.catch(() => {});

    expect(onGiveUp).toHaveBeenCalled();
  });

  test('should respect skipRetry callback', async () => {
    const skipRetry = jest.fn().mockReturnValue(true);
    retryPolicy.updateConfig({ skipRetry });

    const fn = jest.fn().mockRejectedValue(new Error('ECONNRESET'));
    await expect(retryPolicy.execute(fn)).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('should reset state', () => {
    retryPolicy['attempt'] = 5;
    retryPolicy['lastError'] = new Error('test');
    retryPolicy.reset();
    expect(retryPolicy['attempt']).toBe(0);
    expect(retryPolicy['lastError']).toBeNull();
  });

  test('should get config', () => {
    const config = retryPolicy.getConfig();
    expect(config).toHaveProperty('maxRetries');
    expect(config).toHaveProperty('initialDelayMs');
    expect(config).toHaveProperty('strategy');
  });

  test('should update config', () => {
    retryPolicy.updateConfig({ maxRetries: 5 });
    expect(retryPolicy.getConfig().maxRetries).toBe(5);
  });

  test('should handle retryable status codes', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce({ statusCode: 429 })
      .mockResolvedValue('success');

    const promise = retryPolicy.execute(fn);
    jest.runAllTimers();
    await expect(promise).resolves.toBe('success');
  });

  test('should handle retryable error codes', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce({ code: 'ETIMEDOUT' })
      .mockResolvedValue('success');

    const promise = retryPolicy.execute(fn);
    jest.runAllTimers();
    await expect(promise).resolves.toBe('success');
  });

  test('should track retry history', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValue('success');

    const promise = retryPolicy.execute(fn);
    jest.runAllTimers();
    await promise;

    expect(retryPolicy['retryHistory'].length).toBe(2);
    expect(retryPolicy['retryHistory'][0]).toHaveProperty('attempt');
    expect(retryPolicy['retryHistory'][0]).toHaveProperty('delayMs');
    expect(retryPolicy['retryHistory'][0]).toHaveProperty('error');
    expect(retryPolicy['retryHistory'][0]).toHaveProperty('timestamp');
  });

  test('should execute with retry context', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValue('success');

    const context = { operation: 'test' };
    const promise = retryPolicy.execute(fn, context);
    jest.runAllTimers();
    await promise;

    expect(retryPolicy['retryHistory'][0].context).toEqual(context);
  });

  test('should respect maxRetries in shouldRetry', () => {
    expect(retryPolicy.shouldRetry(new Error('test'), 4)).toBe(false);
    expect(retryPolicy.shouldRetry(new Error('test'), 3)).toBe(true);
  });

  test('should calculate delay correctly for different strategies', () => {
    retryPolicy.updateConfig({ strategy: 'exponential', initialDelayMs: 500, backoffMultiplier: 3 });
    expect(retryPolicy.calculateDelay(1)).toBe(500);
    expect(retryPolicy.calculateDelay(2)).toBe(1500);
    expect(retryPolicy.calculateDelay(3)).toBe(4500);

    retryPolicy.updateConfig({ strategy: 'linear', initialDelayMs: 500 });
    expect(retryPolicy.calculateDelay(1)).toBe(500);
    expect(retryPolicy.calculateDelay(2)).toBe(1000);
    expect(retryPolicy.calculateDelay(3)).toBe(1500);
  });
});

describe('createRetryPolicy', () => {
  test('should create retry policy instance', () => {
    const config = {
      enabled: true,
      maxRetries: 3,
      initialDelayMs: 1000,
      maxDelayMs: 10000,
      strategy: 'exponential' as const,
      backoffMultiplier: 2,
      jitter: false,
      retryableStatusCodes: [429, 500],
      retryableErrorCodes: ['ECONNRESET']
    };
    const policy = createRetryPolicy(config);
    expect(policy).toBeInstanceOf(RetryPolicy);
    expect(policy.getConfig()).toEqual(config);
  });
});

describe('retry', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('should execute function with retry', async () => {
    const fn = jest.fn().mockResolvedValue('success');
    const config = {
      enabled: true,
      maxRetries: 3,
      initialDelayMs: 1000,
      maxDelayMs: 10000,
      strategy: 'exponential' as const,
      backoffMultiplier: 2,
      jitter: false,
      retryableStatusCodes: [429, 500],
      retryableErrorCodes: ['ECONNRESET']
    };

    const result = await retry(fn, config);
    expect(result).toBe('success');
  });

  test('should retry on failure', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValue('success');

    const config = {
      enabled: true,
      maxRetries: 3,
      initialDelayMs: 1000,
      maxDelayMs: 10000,
      strategy: 'exponential' as const,
      backoffMultiplier: 2,
      jitter: false,
      retryableStatusCodes: [429, 500],
      retryableErrorCodes: ['ECONNRESET']
    };

    const promise = retry(fn, config, undefined, async (ms) => {
      await new Promise((resolve) => {
        setTimeout(() => {
          jest.advanceTimersByTime(ms);
          resolve();
        }, 0);
        jest.advanceTimersByTime(0);
      });
    });
    
    const result = await promise;

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  }, 100000);
});

describe('MaxRetriesExceededError', () => {
  test('should create error with correct properties', () => {
    const error = new MaxRetriesExceededError(
      'Max retries exceeded',
      5,
      [{ attempt: 1, delayMs: 1000, error: new Error('test'), timestamp: new Date() }]
    );

    expect(error.message).toBe('Max retries exceeded');
    expect(error.attempts).toBe(5);
    expect(error.retryHistory).toHaveLength(1);
    expect(error.name).toBe('MaxRetriesExceededError');
  });

  test('should include error code', () => {
    const error = new MaxRetriesExceededError('Max retries exceeded', 5, []);
    expect(error.code).toBe('YF_ERR_MAX_RETRIES_EXCEEDED');
  });

  test('should be instance of Error', () => {
    const error = new MaxRetriesExceededError('Max retries exceeded', 5, []);
    expect(error).toBeInstanceOf(Error);
  });
});
