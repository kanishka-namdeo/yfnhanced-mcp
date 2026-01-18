import { RequestDelayer, createDelayStrategy, DelayStrategy } from '../../../src/utils/request-delayer';

describe('RequestDelayer', () => {
  let delayer: RequestDelayer;

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('should initialize with default delay', () => {
    delayer = new RequestDelayer();
    expect(delayer.getDelay()).toBe(1000);
  });

  test('should initialize with custom delay', () => {
    delayer = new RequestDelayer(2000);
    expect(delayer.getDelay()).toBe(2000);
  });

  test('should delay for configured duration', async () => {
    delayer = new RequestDelayer(1000);
    const promise = delayer.delay();

    jest.advanceTimersByTime(500);
    await expect(Promise.race([promise, Promise.resolve('not-resolved')])).resolves.toBe('not-resolved');

    jest.advanceTimersByTime(500);
    await expect(promise).resolves.toBeUndefined();
  });

  test('should handle zero delay', async () => {
    delayer = new RequestDelayer(0);
    const promise = delayer.delay();
    jest.advanceTimersByTime(0);
    await expect(promise).resolves.toBeUndefined();
  });

  test('should update delay', () => {
    delayer = new RequestDelayer(1000);
    delayer.setDelay(2000);
    expect(delayer.getDelay()).toBe(2000);
  });

  test('should get current delay', () => {
    delayer = new RequestDelayer(1500);
    expect(delayer.getDelay()).toBe(1500);
  });

  test('should track delay count', async () => {
    delayer = new RequestDelayer(1000);
    expect(delayer.getDelayCount()).toBe(0);

    const promise = delayer.delay();
    jest.advanceTimersByTime(1000);
    await promise;
    expect(delayer.getDelayCount()).toBe(1);
  });

  test('should reset delay count', () => {
    delayer = new RequestDelayer(1000);
    delayer.delay();
    delayer.delay();
    delayer.reset();
    expect(delayer.getDelayCount()).toBe(0);
  });

  test('should calculate average delay', async () => {
    delayer = new RequestDelayer(1000);
    const promise1 = delayer.delay();
    jest.advanceTimersByTime(1000);
    await promise1;
    delayer.setDelay(2000);
    const promise2 = delayer.delay();
    jest.advanceTimersByTime(2000);
    await promise2;

    expect(delayer.getAverageDelay()).toBe(1500);
  });

  test('should return 0 average when no delays', () => {
    delayer = new RequestDelayer(1000);
    expect(delayer.getAverageDelay()).toBe(0);
  });

  test('should get stats', async () => {
    delayer = new RequestDelayer(1000);
    const promise1 = delayer.delay();
    jest.advanceTimersByTime(1000);
    await promise1;
    delayer.setDelay(2000);
    const promise2 = delayer.delay();
    jest.advanceTimersByTime(2000);
    await promise2;

    const stats = delayer.getStats();
    expect(stats.currentDelay).toBe(2000);
    expect(stats.delayCount).toBe(2);
    expect(stats.averageDelay).toBe(1500);
  });

  test('should handle multiple delays', async () => {
    delayer = new RequestDelayer(100);
    const delays = [];

    for (let i = 0; i < 5; i++) {
      delays.push(delayer.delay());
    }

    jest.advanceTimersByTime(500);
    await Promise.all(delays);

    expect(delayer.getDelayCount()).toBe(5);
  });

  test('should support cancellation', async () => {
    delayer = new RequestDelayer(5000);
    const promise = delayer.delay();
    delayer.cancel();
    jest.advanceTimersByTime(0);

    await expect(promise).rejects.toThrow('Delay cancelled');
  });

  test('should reset on cancellation', async () => {
    delayer = new RequestDelayer(1000);
    delayer.delay();
    delayer.cancel();

    expect(delayer.getDelayCount()).toBe(0);
  });
});

describe('createDelayStrategy', () => {
  test('should create fixed delay strategy', () => {
    const strategy = createDelayStrategy('fixed', 1000);
    expect(strategy).toBeInstanceOf(DelayStrategy);
  });

  test('should create exponential delay strategy', () => {
    const strategy = createDelayStrategy('exponential', 1000);
    expect(strategy).toBeInstanceOf(DelayStrategy);
  });

  test('should create linear delay strategy', () => {
    const strategy = createDelayStrategy('linear', 1000);
    expect(strategy).toBeInstanceOf(DelayStrategy);
  });

  test('should create adaptive delay strategy', () => {
    const strategy = createDelayStrategy('adaptive', 1000);
    expect(strategy).toBeInstanceOf(DelayStrategy);
  });

  test('should use default delay if not provided', () => {
    const strategy = createDelayStrategy('fixed');
    expect(strategy).toBeInstanceOf(DelayStrategy);
  });

  test('should throw error for invalid strategy', () => {
    expect(() => createDelayStrategy('invalid' as any)).toThrow();
  });
});

describe('DelayStrategy', () => {
  let strategy: DelayStrategy;

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('fixed strategy should return constant delay', () => {
    strategy = createDelayStrategy('fixed', 1000);
    expect(strategy.calculateDelay(1)).toBe(1000);
    expect(strategy.calculateDelay(5)).toBe(1000);
  });

  test('exponential strategy should increase delay', () => {
    strategy = createDelayStrategy('exponential', 1000);
    expect(strategy.calculateDelay(1)).toBe(1000);
    expect(strategy.calculateDelay(2)).toBe(2000);
    expect(strategy.calculateDelay(3)).toBe(4000);
  });

  test('exponential strategy should use custom multiplier', () => {
    strategy = createDelayStrategy('exponential', 1000, 3);
    expect(strategy.calculateDelay(1)).toBe(1000);
    expect(strategy.calculateDelay(2)).toBe(3000);
    expect(strategy.calculateDelay(3)).toBe(9000);
  });

  test('linear strategy should increase delay linearly', () => {
    strategy = createDelayStrategy('linear', 1000);
    expect(strategy.calculateDelay(1)).toBe(1000);
    expect(strategy.calculateDelay(2)).toBe(2000);
    expect(strategy.calculateDelay(3)).toBe(3000);
  });

  test('linear strategy should use custom increment', () => {
    strategy = createDelayStrategy('linear', 1000, 500);
    expect(strategy.calculateDelay(1)).toBe(1000);
    expect(strategy.calculateDelay(2)).toBe(1500);
    expect(strategy.calculateDelay(3)).toBe(2000);
  });

  test('adaptive strategy should adjust based on success', () => {
    strategy = createDelayStrategy('adaptive', 1000);
    expect(strategy.calculateDelay(1)).toBe(1000);

    strategy.recordSuccess();
    expect(strategy.calculateDelay(2)).toBeLessThan(1000);
  });

  test('adaptive strategy should increase on failure', () => {
    strategy = createDelayStrategy('adaptive', 1000);
    expect(strategy.calculateDelay(1)).toBe(1000);

    strategy.recordFailure();
    expect(strategy.calculateDelay(2)).toBeGreaterThan(1000);
  });

  test('should respect max delay', () => {
    strategy = createDelayStrategy('exponential', 1000, 2, 3000);
    expect(strategy.calculateDelay(10)).toBe(3000);
  });

  test('should respect min delay', () => {
    strategy = createDelayStrategy('adaptive', 1000);
    strategy.recordSuccess();
    strategy.recordSuccess();
    strategy.recordSuccess();
    expect(strategy.calculateDelay(1)).toBeGreaterThanOrEqual(100);
  });

  test('should reset strategy state', () => {
    strategy = createDelayStrategy('adaptive', 1000);
    strategy.recordFailure();
    strategy.recordFailure();
    strategy.reset();
    expect(strategy.calculateDelay(1)).toBe(1000);
  });

  test('should get strategy type', () => {
    strategy = createDelayStrategy('fixed', 1000);
    expect(strategy.getType()).toBe('fixed');

    strategy = createDelayStrategy('exponential', 1000);
    expect(strategy.getType()).toBe('exponential');

    strategy = createDelayStrategy('linear', 1000);
    expect(strategy.getType()).toBe('linear');

    strategy = createDelayStrategy('adaptive', 1000);
    expect(strategy.getType()).toBe('adaptive');
  });

  test('should get strategy config', () => {
    strategy = createDelayStrategy('exponential', 1000, 2, 5000, 100);
    const config = strategy.getConfig();
    expect(config.type).toBe('exponential');
    expect(config.baseDelay).toBe(1000);
    expect(config.multiplier).toBe(2);
    expect(config.maxDelay).toBe(5000);
    expect(config.minDelay).toBe(100);
  });

  test('should handle jitter', () => {
    strategy = createDelayStrategy('exponential', 1000, 2, 5000, 100, true);
    const delay1 = strategy.calculateDelay(1);
    const delay2 = strategy.calculateDelay(1);
    expect(delay1).not.toBe(delay2);
  });

  test('should not use jitter when disabled', () => {
    strategy = createDelayStrategy('exponential', 1000, 2, 5000, 100, false);
    const delay1 = strategy.calculateDelay(1);
    const delay2 = strategy.calculateDelay(1);
    expect(delay1).toBe(delay2);
  });

  test('adaptive strategy should track success rate', () => {
    strategy = createDelayStrategy('adaptive', 1000);
    strategy.recordSuccess();
    strategy.recordSuccess();
    strategy.recordFailure();

    expect(strategy.getSuccessRate()).toBeCloseTo(0.667, 3);
  });

  test('adaptive strategy should return 0 success rate initially', () => {
    strategy = createDelayStrategy('adaptive', 1000);
    expect(strategy.getSuccessRate()).toBe(0);
  });

  test('should delay using strategy', async () => {
    strategy = createDelayStrategy('fixed', 1000);
    const promise = strategy.delay();

    jest.advanceTimersByTime(500);
    await expect(Promise.race([promise, Promise.resolve('not-resolved')])).resolves.toBe('not-resolved');

    jest.advanceTimersByTime(500);
    await expect(promise).resolves.toBeUndefined();
  });

  test('should handle zero attempt', () => {
    strategy = createDelayStrategy('exponential', 1000);
    expect(strategy.calculateDelay(0)).toBe(1000);
  });

  test('should handle negative attempt', () => {
    strategy = createDelayStrategy('exponential', 1000);
    expect(strategy.calculateDelay(-1)).toBe(1000);
  });
});
