import { RetryPolicy, MaxRetriesExceededError, createRetryPolicy, retry } from '../../../src/middleware/retry';
import { CircuitBreakerOpenError } from '../../../src/middleware/circuit-breaker';
import { YahooFinanceError } from '../../../src/types/errors';

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

  // src/middleware/AGENTS.md: CircuitBreakerOpenError carries isRetryable = false
  // (circuit-breaker.ts:16), classifyError passes any YahooFinanceError through untouched
  // (error-classifier.ts:30-31), and shouldRetry bails on !isRetryable (retry.ts:129). So an
  // open breaker short-circuits retry entirely: one attempt, no backoff scheduled, original
  // error identity preserved for the service layer.
  test('an open circuit breaker short-circuits retry with zero backoff scheduled', async () => {
    const delayFn = jest.fn().mockResolvedValue(undefined);
    const policy = new RetryPolicy({
      enabled: true,
      maxRetries: 3,
      initialDelayMs: 1000,
      maxDelayMs: 10000,
      strategy: 'exponential',
      backoffMultiplier: 2,
      jitter: false,
      retryableStatusCodes: [429, 500],
      retryableErrorCodes: ['ECONNRESET']
    }, delayFn);
    const onRetry = jest.fn();
    policy.updateConfig({ onRetry });

    const breakerError = new CircuitBreakerOpenError();
    expect(breakerError).toBeInstanceOf(YahooFinanceError);
    expect(breakerError.isRetryable).toBe(false);
    expect(breakerError.code).toBe('YF_ERR_CIRCUIT_OPEN');
    expect(policy.shouldRetry(breakerError, 1)).toBe(false);

    const fn = jest.fn().mockRejectedValue(breakerError);
    await expect(policy.execute(fn)).rejects.toBe(breakerError);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(delayFn).not.toHaveBeenCalled();
    expect(onRetry).not.toHaveBeenCalled();
  });

  // DEFECT (src/middleware/retry.ts:50-58, :75-81): the MaxRetriesExceededError paths are
  // unreachable for maxRetries >= 0. shouldRetry() returns false as soon as attempt + 1 >
  // maxRetries (retry.ts:119), so executeWithRetry throws the *classified* error at
  // attempt === maxRetries; the wrapper at :50 then sees attempt (=== maxRetries) as NOT
  // > maxRetries and rethrows it. Exhaustion therefore surfaces as the classified
  // YahooFinanceError after maxRetries + 1 calls, never as MaxRetriesExceededError.
  test('retry exhaustion throws the classified error, not MaxRetriesExceededError', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('ECONNRESET'));
    const promise = retryPolicy.execute(fn);
    jest.runAllTimers();
    // 'ECONNRESET' matches no classifier keyword, so classifyError returns YF_ERR_UNKNOWN.
    await expect(promise).rejects.toMatchObject({ code: 'YF_ERR_UNKNOWN' });
    await promise.catch((error: unknown) => {
      expect(error).not.toBeInstanceOf(MaxRetriesExceededError);
    });
    expect(fn).toHaveBeenCalledTimes(4); // maxRetries + 1 attempts, not the + 2 the loop bound suggests
  });

  // The only reachable construction of MaxRetriesExceededError from execute():
  // maxRetries < 0 makes `attempt > maxRetries` true on the very first failure (retry.ts:75).
  test('MaxRetriesExceededError is thrown only when maxRetries < 0', async () => {
    const negativePolicy = new RetryPolicy({
      enabled: true,
      maxRetries: -1,
      initialDelayMs: 1000,
      maxDelayMs: 10000,
      strategy: 'exponential',
      backoffMultiplier: 2,
      jitter: false,
      retryableStatusCodes: [429, 500],
      retryableErrorCodes: ['ECONNRESET']
    }, (ms) => {
      jest.advanceTimersByTime(ms);
      return Promise.resolve();
    });

    const fn = jest.fn().mockRejectedValue(new Error('ECONNRESET'));
    const promise = negativePolicy.execute(fn);
    jest.runAllTimers();
    await expect(promise).rejects.toBeInstanceOf(MaxRetriesExceededError);
    expect(fn).toHaveBeenCalledTimes(1);
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

  // Real jitter is +/-25% with a 100 ms floor (retry.ts:189-196), so the assertion window
  // must match the implementation, and Math.random must be pinned to be deterministic.
  test('should add jitter when enabled', () => {
    retryPolicy.updateConfig({ jitter: true });
    const randomSpy = jest.spyOn(Math, 'random');

    try {
      randomSpy.mockReturnValue(0.5); // zero-offset point of (rand * 2 - 1)
      expect(retryPolicy.calculateDelay(1)).toBe(1000);

      randomSpy.mockReturnValue(1); // +25%
      expect(retryPolicy.calculateDelay(1)).toBe(1250);

      randomSpy.mockReturnValue(0); // -25%
      expect(retryPolicy.calculateDelay(1)).toBe(750);
    } finally {
      randomSpy.mockRestore();
    }
  });

  test('jitter never drops the delay below the 100 ms floor', () => {
    retryPolicy.updateConfig({ jitter: true, initialDelayMs: 100, strategy: 'fixed', retryDelayMs: 100 });
    const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0); // -25% would be 75
    try {
      expect(retryPolicy.calculateDelay(1)).toBe(100);
    } finally {
      randomSpy.mockRestore();
    }
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

  test('should retry on failure, paced through the injected delay function', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValue('success');

    // RetryPolicy honours a caller-supplied delayFn (retry.ts:243-245), so the backoff is
    // observed as an argument and applied to the fake clock instead of slept on.
    const delayFn = jest.fn().mockImplementation((ms: number) => {
      jest.advanceTimersByTime(ms);
      return Promise.resolve();
    });

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

    await expect(retry(fn, config, undefined, delayFn)).resolves.toBe('success');

    expect(fn).toHaveBeenCalledTimes(2);
    expect(delayFn).toHaveBeenCalledWith(1000); // initialDelayMs * 2^(1-1)
  });

  test('the module-level retry() helper also surfaces exhaustion as the classified error', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('timeout waiting for upstream'));
    const delayFn = jest.fn().mockImplementation((ms: number) => {
      jest.advanceTimersByTime(ms);
      return Promise.resolve();
    });

    const config = {
      enabled: true,
      maxRetries: 2,
      initialDelayMs: 1000,
      maxDelayMs: 10000,
      strategy: 'exponential' as const,
      backoffMultiplier: 2,
      jitter: false,
      retryableStatusCodes: [429, 500],
      retryableErrorCodes: ['ECONNRESET']
    };

    await expect(retry(fn, config, undefined, delayFn)).rejects.toMatchObject({
      code: 'YF_ERR_TIMEOUT'
    });
    expect(fn).toHaveBeenCalledTimes(3); // maxRetries + 1 attempts
    expect(delayFn.mock.calls.map((call) => call[0])).toEqual([1000, 2000]);
  });
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

// Residual branches in src/middleware/retry.ts: the unreachable loop tail (:111-115), the
// error-code leg of shouldRetry (:139), the switch default (:170), the `fixed` fallback leg
// (:168), and every per-error multiplier arm of calculateDelayForError (:207, :216, :221).
describe('RetryPolicy residual branches', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const base = {
    enabled: true,
    maxRetries: 3,
    initialDelayMs: 1000,
    maxDelayMs: 10000,
    strategy: 'exponential' as const,
    backoffMultiplier: 2,
    jitter: false,
    retryableStatusCodes: [429, 500, 502, 503, 504]
  };

  const yfError = (overrides: {
    code?: string;
    statusCode?: number | null;
    isRetryable?: boolean;
    isRateLimit?: boolean;
    context?: Record<string, unknown>;
  } = {}): YahooFinanceError =>
    new YahooFinanceError(
      'shaped failure',
      (overrides.code ?? 'YF_ERR_SERVER') as never,
      overrides.statusCode === undefined ? 500 : overrides.statusCode,
      overrides.isRetryable ?? true,
      overrides.isRateLimit ?? false,
      overrides.context ?? {},
      'inspect the upstream response'
    );

  test('DEFECT: a non-numeric maxRetries runs zero attempts and throws a bare Error, not a YahooFinanceError', async () => {
    for (const maxRetries of [NaN, undefined] as never[]) {
      const onGiveUp = jest.fn();
      const policy = new RetryPolicy({ ...base, maxRetries, onGiveUp });
      const fn = jest.fn().mockResolvedValue('never-called');

      const error = await policy.execute(fn).catch((caught: unknown) => caught);

      expect(fn).not.toHaveBeenCalled();
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe('Retry failed without error');
      // execute()'s guard is `attempt > maxRetries`, which is false against NaN, so the typed
      // MaxRetriesExceededError wrapper is skipped and no `code` reaches the caller.
      expect(error).not.toBeInstanceOf(MaxRetriesExceededError);
      expect(error).not.toBeInstanceOf(YahooFinanceError);
      // :111 short-circuits on a null lastError, so onGiveUp never fires for this failure mode.
      expect(onGiveUp).not.toHaveBeenCalled();
    }
  });

  test('shouldRetry returns true on the raw error-code leg before touching the message', () => {
    const policy = new RetryPolicy(base);
    const reset = yfError({ code: 'ECONNRESET', statusCode: null });
    expect(policy.shouldRetry(reset, 1)).toBe(true);
    // A non-string code fails the typeof guard and falls through to the message/default legs.
    expect(policy.shouldRetry(yfError({ code: 7 as never, statusCode: null }), 1)).toBe(true);
    // And the leg itself is skipped when the error carries no `code` property at all.
    expect(policy.shouldRetry(yfError({ statusCode: null }), 1)).toBe(true);
  });

  test('an unknown strategy reaches the switch default and returns initialDelayMs', () => {
    const policy = new RetryPolicy({ ...base, strategy: 'sine' as never });
    expect(policy.calculateDelay(1)).toBe(1000);
    expect(policy.calculateDelay(9)).toBe(1000);
  });

  test('fixed strategy: an absent retryDelayMs falls back to initialDelayMs', () => {
    const policy = new RetryPolicy({ ...base, strategy: 'fixed' as never });
    expect(policy.calculateDelay(1)).toBe(1000);
    expect(policy.calculateDelay(4)).toBe(1000);
    expect(new RetryPolicy({ ...base, strategy: 'fixed' as never, retryDelayMs: 0 }).calculateDelay(2))
      .toBe(1000);
    expect(
      new RetryPolicy({ ...base, strategy: 'fixed' as never, retryDelayMs: NaN }).calculateDelay(2)
    ).toBe(1000);
    expect(new RetryPolicy({ ...base, strategy: 'fixed' as never, retryDelayMs: 250 }).calculateDelay(2))
      .toBe(250);
  });

  test('a rate-limit error with a numeric retryAfter wins over the exponential base', () => {
    const policy = new RetryPolicy(base);
    expect(policy.calculateDelayForError(yfError({ isRateLimit: true, statusCode: 429, context: { retryAfter: 5 } }), 1))
      .toBe(5000);
    // Base delay above retryAfter keeps the base.
    expect(policy.calculateDelayForError(yfError({ isRateLimit: true, statusCode: 429, context: { retryAfter: 0.25 } }), 4))
      .toBe(8000);
  });

  test('DEFECT: a string retryAfter is truthy but fails the typeof guard and silently drops the header', () => {
    const policy = new RetryPolicy(base);
    // retryAfter '5' (a header arrives as a string) is truthy, so the right operand is evaluated,
    // fails the typeof check, and the caller gets the doubled backoff instead of 5 s.
    expect(policy.calculateDelayForError(yfError({ isRateLimit: true, statusCode: 429, context: { retryAfter: '5' } }), 1))
      .toBe(2000);
    expect(policy.calculateDelayForError(yfError({ isRateLimit: true, statusCode: 429, context: {} }), 1))
      .toBe(2000);
  });

  test('a cookie error halves the base delay', () => {
    const policy = new RetryPolicy(base);
    expect(policy.calculateDelayForError(yfError({ code: 'YF_ERR_COOKIE_ERROR', statusCode: 401 }), 1))
      .toBe(500);
    // The halving is capped by maxDelayMs like every other multiplier.
    expect(
      new RetryPolicy({ ...base, initialDelayMs: 9000 }).calculateDelayForError(
        yfError({ code: 'YF_ERR_COOKIE_ERROR', statusCode: 401 }),
        1
      )
    ).toBe(4500);
  });

  test('502/503/504 scale by 1.5 while any other status falls through to the base delay', () => {
    const policy = new RetryPolicy(base);
    for (const status of [502, 503, 504]) {
      expect(policy.calculateDelayForError(yfError({ statusCode: status }), 1)).toBe(1500);
    }
    // 500 evaluates the includes() leg and returns the untouched base.
    expect(policy.calculateDelayForError(yfError({ statusCode: 500 }), 1)).toBe(1000);
    // A null status short-circuits on the left operand.
    expect(policy.calculateDelayForError(yfError({ statusCode: null }), 1)).toBe(1000);
  });

  test('without a delayFn the policy waits on the module setTimeout', async () => {
    const policy = new RetryPolicy(base);
    const fn = jest.fn()
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValue('recovered');

    const pending = policy.execute(fn);
    await jest.advanceTimersByTimeAsync(1000);
    await expect(pending).resolves.toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
