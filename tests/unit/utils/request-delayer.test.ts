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

// Residual branches: the object form of the RequestDelayer constructor (never used in src/, and
// never exercised here before), adaptiveDelay's three-way pacing, cancel()'s already-cancelled
// guard, and DelayStrategy's mid-band adaptive case plus its unreachable switch default.
// `src/utils/request-delayer.ts` has no production importer — this coverage documents the module
// as it behaves, it does not imply the server uses it.
describe('RequestDelayer constructor — object form', () => {
  test('a full object is taken verbatim', () => {
    const subject = new RequestDelayer({ minDelay: 500, maxDelay: 9000, adaptive: true });
    expect(subject.getDelay()).toBe(500);
    subject.setDelay(100000);
    expect(subject.getDelay()).toBe(9000);
    subject.setDelay(1);
    expect(subject.getDelay()).toBe(500);
  });

  test('an empty object yields min 1000, max 30000 and a mid-range current delay of 15000', () => {
    const subject = new RequestDelayer({});
    expect(subject.getDelay()).toBe(15000);
    subject.setDelay(1);
    expect(subject.getDelay()).toBe(1000);
    subject.setDelay(1e9);
    expect(subject.getDelay()).toBe(30000);
  });

  test('maxDelay alone halves the ceiling into currentDelay', () => {
    const subject = new RequestDelayer({ maxDelay: 8000 });
    expect(subject.getDelay()).toBe(4000);
    subject.setDelay(1);
    expect(subject.getDelay()).toBe(1000);
    subject.setDelay(1e9);
    expect(subject.getDelay()).toBe(8000);
  });

  test('minDelay alone short-circuits currentDelay and defaults maxDelay to 30000', () => {
    const subject = new RequestDelayer({ minDelay: 700 });
    expect(subject.getDelay()).toBe(700);
    subject.setDelay(1e9);
    expect(subject.getDelay()).toBe(30000);
  });

  test('nullish explicit fields fall through the ?? defaults', () => {
    const subject = new RequestDelayer({ minDelay: undefined, maxDelay: undefined, adaptive: undefined });
    expect(subject.getDelay()).toBe(15000);
  });

  test('a truthy non-object and an explicit null both land on the hard-coded default branch', () => {
    for (const input of ['abc', true, 0, null, undefined] as never[]) {
      const subject = new RequestDelayer(input as number | Partial<RequestDelayerConfig> | null);
      expect(subject.getDelay()).toBe(input === 0 ? 0 : 1000);
    }
  });
});

describe('RequestDelayer.adaptiveDelay', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  const adaptive = (): RequestDelayer =>
    new RequestDelayer({ minDelay: 1000, maxDelay: 30000, adaptive: true });

  test('a non-adaptive instance just delays at the current value and changes nothing', async () => {
    const subject = new RequestDelayer({ minDelay: 1000, maxDelay: 30000 });
    const pending = subject.adaptiveDelay(0.1);
    expect(subject.getDelay()).toBe(1000);
    jest.advanceTimersByTime(1000);
    await expect(pending).resolves.toBeUndefined();
    expect(subject.getDelay()).toBe(1000);
    expect(subject.getDelayCount()).toBe(1);
  });

  test('an explicit adaptive:false takes the same plain-delay path', async () => {
    // `delay.adaptive ?? false` reads the left operand here, and the guard at :122 still holds.
    const subject = new RequestDelayer({ minDelay: 1000, maxDelay: 2000, adaptive: false });
    const pending = subject.adaptiveDelay(0.1);
    expect(subject.getDelay()).toBe(1000);
    jest.advanceTimersByTime(1000);
    await expect(pending).resolves.toBeUndefined();
    expect(subject.getAverageDelay()).toBe(1000);
  });

  test('a success rate below 0.5 multiplies the delay by 1.5', async () => {
    const subject = adaptive();
    const pending = subject.adaptiveDelay(0.4);
    expect(subject.getDelay()).toBe(1500);
    jest.advanceTimersByTime(1500);
    await pending;
    expect(subject.getAverageDelay()).toBe(1500);
  });

  test('a success rate above 0.9 multiplies the delay by 0.8, but never below minDelay', async () => {
    const subject = new RequestDelayer({ minDelay: 1000, maxDelay: 30000, adaptive: true });
    subject.setDelay(4000);
    const pending = subject.adaptiveDelay(0.95);
    expect(subject.getDelay()).toBe(3200);
    jest.advanceTimersByTime(3200);
    await pending;
    expect(subject.getAverageDelay()).toBe(3200);

    // At the floor the speed-up is a no-op: currentDelay starts equal to minDelay.
    const floored = adaptive();
    const second = floored.adaptiveDelay(1);
    expect(floored.getDelay()).toBe(1000);
    jest.advanceTimersByTime(1000);
    await second;
  });

  test('the 0.5 band is inclusive on both edges, so 0.5 and 0.9 pace nothing', async () => {
    const low = adaptive();
    const atHalf = low.adaptiveDelay(0.5);
    expect(low.getDelay()).toBe(1000);
    jest.advanceTimersByTime(1000);
    await atHalf;

    const high = adaptive();
    const atNine = high.adaptiveDelay(0.9);
    expect(high.getDelay()).toBe(1000);
    jest.advanceTimersByTime(1000);
    await atNine;
  });

  test('the multiplier is clamped to maxDelay on the way up and minDelay on the way down', async () => {
    const ceiling = new RequestDelayer({ minDelay: 1000, maxDelay: 2000, adaptive: true });
    ceiling.setDelay(1800);
    const up = ceiling.adaptiveDelay(0.1);
    expect(ceiling.getDelay()).toBe(2000);
    jest.advanceTimersByTime(2000);
    await up;

    const floor = new RequestDelayer({ minDelay: 900, maxDelay: 30000, adaptive: true });
    floor.setDelay(1000);
    const down = floor.adaptiveDelay(1);
    expect(floor.getDelay()).toBe(900);
    jest.advanceTimersByTime(900);
    await down;
  });

  test('repeated low success rates compound until the ceiling', async () => {
    const subject = new RequestDelayer({ minDelay: 1000, maxDelay: 3000, adaptive: true });
    for (const expected of [1500, 2250, 3000, 3000]) {
      const pending = subject.adaptiveDelay(0.2);
      expect(subject.getDelay()).toBe(expected);
      jest.advanceTimersByTime(expected);
      await pending;
    }
  });
});

describe('RequestDelayer.cancel guards', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  test('a second cancel() returns at the isCancelled guard without re-rejecting', async () => {
    const subject = new RequestDelayer(5000);
    const pending = subject.delay();
    subject.cancel();
    expect(() => subject.cancel()).not.toThrow();
    jest.advanceTimersByTime(0);
    await expect(pending).rejects.toThrow('Delay cancelled');
    expect(subject.getDelayCount()).toBe(0);
    expect(subject.getAverageDelay()).toBe(0);
  });

  test('cancel() with nothing in flight is inert', () => {
    const subject = new RequestDelayer(1000);
    expect(() => subject.cancel()).not.toThrow();
    expect(subject.getDelayCount()).toBe(0);
    // A later delay still works, so the guard left no state behind.
    const pending = subject.delay(10);
    jest.advanceTimersByTime(10);
    expect(subject.getDelay()).toBe(1000);
    return expect(pending).resolves.toBeUndefined();
  });

  test('cancel() after the delay already resolved rejects nothing and keeps the count', async () => {
    const subject = new RequestDelayer(100);
    const pending = subject.delay();
    jest.advanceTimersByTime(100);
    await pending;
    expect(() => subject.cancel()).not.toThrow();
    expect(subject.getDelayCount()).toBe(1);
    expect(subject.getAverageDelay()).toBe(100);
  });
});

describe('DelayStrategy residual branches', () => {
  test('the adaptive band between 0.5 and 0.9 returns the untouched baseDelay', () => {
    const strategy = createDelayStrategy('adaptive', 1000);
    strategy.recordSuccess();
    strategy.recordFailure();
    expect(strategy.getSuccessRate()).toBe(0.5);
    expect(strategy.calculateDelay(3)).toBe(1000);
  });

  test('an unrecognised type reaches the switch default and returns baseDelay', () => {
    // createDelayStrategy rejects unknown types, so only the class itself exposes the default.
    const strategy = new DelayStrategy({ type: 'sine' as never, baseDelay: 1234 });
    expect(strategy.calculateDelay(1)).toBe(1234);
    expect(strategy.getType()).toBe('sine');
  });

  test('the constructor-normalized fallbacks make the in-loop ?? guards unreachable', () => {
    const strategy = createDelayStrategy('exponential', 1000);
    const config = strategy.getConfig();
    expect(config.multiplier).toBe(2);
    expect(config.increment).toBe(1000);
    expect(config.maxDelay).toBe(30000);
    expect(config.minDelay).toBe(100);
    expect(config.jitter).toBe(false);
  });

  test('a linear strategy with an explicit increment of 0 keeps it instead of falling back', () => {
    const strategy = new DelayStrategy({ type: 'linear', baseDelay: 500, increment: 0 });
    expect(strategy.getConfig().increment).toBe(0);
    expect(strategy.calculateDelay(4)).toBe(500);
  });

  test('a linear strategy without an increment borrows the multiplier, then baseDelay', () => {
    expect(new DelayStrategy({ type: 'linear', baseDelay: 300, multiplier: 7 }).calculateDelay(2))
      .toBe(307);
    expect(new DelayStrategy({ type: 'linear', baseDelay: 300 }).calculateDelay(2)).toBe(600);
  });
});

// The single `activeDelayPromise` / `cancelDelay` / `isCancelled` triple is instance state, so two
// overlapping delay() calls share one cancellation flag. These two tests are the only way to reach
// the "already cancelled" legs of the timer callback guard (:78) and the accounting guard (:105),
// and they document what a caller loses when it overlaps them.
describe('RequestDelayer is not reentrant', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  test('cancel() reaches only the newest delay; the earlier timer fires against a cancelled flag and never settles', async () => {
    const subject = new RequestDelayer(1000);

    const first = subject.delay(1000);
    let firstSettled = false;
    first.then(
      () => { firstSettled = true; },
      () => { firstSettled = true; }
    );

    const second = subject.delay(4000); // overwrites activeDelayPromise and cancelDelay
    subject.cancel();                   // cancels the second closure only

    jest.advanceTimersByTime(4000);     // the first timer fires, but isCancelled is already true
    await expect(second).rejects.toThrow('Delay cancelled');

    expect(firstSettled).toBe(false);
    expect(subject.getDelayCount()).toBe(0);
    expect(subject.getAverageDelay()).toBe(0);
  });

  test('a delay that already resolved is un-counted when a later cancel() lands before its continuation runs', async () => {
    const subject = new RequestDelayer(1000);

    const first = subject.delay(1000);
    jest.advanceTimersByTime(1000);     // resolves; the await continuation is queued as a microtask
    const second = subject.delay(5000); // resets isCancelled to false
    subject.cancel();                   // sets it true again, before first resumes
    jest.advanceTimersByTime(0);        // the cancellation reject is itself on a 0 ms timer

    const outcomes = await Promise.allSettled([first, second]);
    expect(outcomes[0]!.status).toBe('fulfilled');
    expect(outcomes[1]!.status).toBe('rejected');
    // DEFECT: delay() completed for the caller, yet the accounting guard skipped the increment,
    // so the average delay reports nothing was ever paced.
    expect(subject.getDelayCount()).toBe(0);
    expect(subject.getAverageDelay()).toBe(0);
  });
});
