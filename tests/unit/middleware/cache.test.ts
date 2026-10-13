// cache.ts value exports are exactly: Cache, LRUCache, StaleWhileRevalidate, CacheMetrics
// (cache.ts:450). There is NO exported `CacheEntry` class: the entry shape lives in the
// internal (unexported) `CacheEntryClass`, and the public read of it is `Cache.getEntry()`,
// which returns the `CacheEntryType` plain object. The old suite imported `CacheEntry` as a
// value and put an `await` in a non-async `test()` callback (the "should invalidate on
// errors" block), which broke the whole file at parse time ("Jest encountered an unexpected
// token": the transpiled CJS kept `await` inside a synchronous arrow). Both are corrected
// here, and every timing assertion runs on Jest fake timers so the clock only moves when the
// test advances it.

import { Cache, LRUCache, StaleWhileRevalidate, CacheMetrics } from '../../../src/middleware/cache';

describe('CacheMetrics', () => {
  let metrics: CacheMetrics;

  beforeEach(() => {
    jest.useFakeTimers();
    metrics = new CacheMetrics();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('should initialize with zero counts', () => {
    expect(metrics.hits).toBe(0);
    expect(metrics.misses).toBe(0);
    expect(metrics.evictions).toBe(0);
  });

  test('should record hits', () => {
    metrics.recordHit();
    metrics.recordHit();
    expect(metrics.hits).toBe(2);
  });

  test('should record misses', () => {
    metrics.recordMiss();
    metrics.recordMiss();
    expect(metrics.misses).toBe(2);
  });

  test('should record evictions', () => {
    metrics.recordEviction();
    expect(metrics.evictions).toBe(1);
  });

  test('should calculate hit rate', () => {
    metrics.recordHit();
    metrics.recordHit();
    metrics.recordHit();
    metrics.recordMiss();
    metrics.recordMiss();

    expect(metrics.getHitRate()).toBe(0.6);
  });

  test('should return 0 hit rate when no requests', () => {
    expect(metrics.getHitRate()).toBe(0);
  });

  test('should reset metrics', () => {
    metrics.recordHit();
    metrics.recordMiss();
    metrics.recordEviction();
    metrics.reset();

    expect(metrics.hits).toBe(0);
    expect(metrics.misses).toBe(0);
    expect(metrics.evictions).toBe(0);
  });

  test('should get stats', () => {
    metrics.recordHit();
    metrics.recordMiss();
    metrics.recordEviction();

    const stats = metrics.getStats();
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(1);
    expect(stats.evictions).toBe(1);
    expect(stats.hitRate).toBe(0.5);
  });
});

describe('LRUCache', () => {
  let cache: LRUCache<number>;

  beforeEach(() => {
    jest.useFakeTimers();
    cache = new LRUCache<number>(3);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('should initialize with capacity', () => {
    expect(cache.capacity).toBe(3);
    expect(cache.size()).toBe(0);
  });

  test('should set and get values', () => {
    cache.set('key1', 1);
    cache.set('key2', 2);

    expect(cache.get('key1')).toBe(1);
    expect(cache.get('key2')).toBe(2);
  });

  test('should return null for non-existent key', () => {
    expect(cache.get('nonexistent')).toBeNull();
  });

  test('should update access order on get', () => {
    cache.set('key1', 1);
    cache.set('key2', 2);
    cache.set('key3', 3);

    cache.get('key1');
    cache.set('key4', 4);

    expect(cache.get('key1')).toBe(1);
    expect(cache.get('key2')).toBeNull();
  });

  test('should evict least recently used when full', () => {
    cache.set('key1', 1);
    cache.set('key2', 2);
    cache.set('key3', 3);
    cache.set('key4', 4);

    expect(cache.get('key1')).toBeNull();
    expect(cache.get('key2')).toBe(2);
    expect(cache.get('key3')).toBe(3);
    expect(cache.get('key4')).toBe(4);
  });

  test('should delete key', () => {
    cache.set('key1', 1);
    const result = cache.delete('key1');

    expect(result).toBe(true);
    expect(cache.get('key1')).toBeNull();
  });

  test('should return false when deleting non-existent key', () => {
    const result = cache.delete('nonexistent');
    expect(result).toBe(false);
  });

  test('should clear all entries', () => {
    cache.set('key1', 1);
    cache.set('key2', 2);
    cache.clear();

    expect(cache.size()).toBe(0);
    expect(cache.get('key1')).toBeNull();
  });

  test('should check if key exists', () => {
    cache.set('key1', 1);
    expect(cache.has('key1')).toBe(true);
    expect(cache.has('nonexistent')).toBe(false);
  });

  test('should return all keys', () => {
    cache.set('key1', 1);
    cache.set('key2', 2);
    cache.set('key3', 3);

    const keys = cache.keys();
    expect(keys).toContain('key1');
    expect(keys).toContain('key2');
    expect(keys).toContain('key3');
    expect(keys.length).toBe(3);
  });

  test('should handle duplicate sets', () => {
    cache.set('key1', 1);
    cache.set('key1', 2);

    expect(cache.get('key1')).toBe(2);
    expect(cache.size()).toBe(1);
  });
});

describe('Cache', () => {
  let cache: Cache;

  const baseConfig = {
    enabled: true,
    store: 'memory' as const,
    ttl: 60000,
    maxEntries: 10
  };

  beforeEach(() => {
    jest.useFakeTimers();
    cache = new Cache({ ...baseConfig });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('should initialize with config', () => {
    expect(cache.getConfig().maxEntries).toBe(10);
  });

  test('should set and get values', async () => {
    await cache.set('key1', 'value1');
    const result = await cache.get('key1');
    expect(result).toBe('value1');
  });

  test('should return null for non-existent key', async () => {
    const result = await cache.get('nonexistent');
    expect(result).toBeNull();
  });

  test('should respect explicit TTL', async () => {
    await cache.set('key1', 'value1', 1000);
    jest.advanceTimersByTime(500);
    expect(await cache.get('key1')).toBe('value1');

    // isExpired is age >= ttl, so exactly 1000 ms of age is already expired.
    jest.advanceTimersByTime(500);
    expect(await cache.get('key1')).toBeNull();
  });

  test('expired read through get() deletes the entry and records a miss', async () => {
    await cache.set('key1', 'value1', 1000);
    jest.advanceTimersByTime(1000);

    expect(await cache.get('key1')).toBeNull();
    expect(cache.getStats().entries).toBe(0);
    expect(cache.getStats().misses).toBe(1);
  });

  test('should delete key', async () => {
    await cache.set('key1', 'value1');
    const result = await cache.delete('key1');
    expect(result).toBe(true);

    const check = await cache.get('key1');
    expect(check).toBeNull();
  });

  test('clear empties the store and resets metrics', async () => {
    await cache.set('key1', 'value1');
    await cache.get('key1'); // records a hit
    await cache.clear();

    expect(await cache.get('key1')).toBeNull(); // records a miss after the reset
    const stats = cache.getStats();
    expect(stats.hits).toBe(0); // clear() called metrics.reset() (cache.ts:276-280)
    expect(stats.misses).toBe(1);
    expect(stats.entries).toBe(0);
  });

  test('has() returns a Promise and false for expired keys', async () => {
    await cache.set('key1', 'value1', 1000);
    await expect(cache.has('key1')).resolves.toBe(true);
    await expect(cache.has('nonexistent')).resolves.toBe(false);

    jest.advanceTimersByTime(1000);
    await expect(cache.has('key1')).resolves.toBe(false);
    // has() on an expired entry deletes it (cache.ts:286-289).
    expect(cache.getStats().entries).toBe(0);
  });

  test('should get stats', async () => {
    await cache.set('key1', 'value1');
    await cache.get('key1');
    await cache.get('key2');

    const stats = cache.getStats();
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(1);
    expect(stats.entries).toBe(1);
    expect(stats.hitRate).toBe(0.5);
    expect(stats.totalSize).toBe(JSON.stringify('value1').length);
  });

  test('should get entry details (the public shape of the internal CacheEntry)', async () => {
    const now = Date.now();
    await cache.set('key1', 'value1', 60000);
    const entry = await cache.getEntry('key1');

    expect(entry).not.toBeNull();
    expect(entry?.value).toBe('value1');
    expect(entry?.ttl).toBe(60000);
    expect(entry?.timestamp).toBeInstanceOf(Date);
    expect(entry?.timestamp.getTime()).toBe(now);
    expect(entry?.expiresAt.getTime()).toBe(now + 60000);
    // convertToCacheEntry always reports key: '' and hits: 0 (cache.ts:437-447).
    expect(entry?.key).toBe('');
    expect(entry?.hits).toBe(0);
    expect(entry?.size).toBe(JSON.stringify('value1').length);
  });

  test('getEntry() reports expired entries as null but leaves them stored', async () => {
    await cache.set('key1', 'value1', 1000);
    jest.advanceTimersByTime(1000);

    expect(await cache.getEntry('key1')).toBeNull();
    // Unlike get(), getEntry() does not delete the expired entry (cache.ts:327-329).
    expect(cache.getStats().entries).toBe(1);
  });

  test('should return null for non-existent entry', async () => {
    const entry = await cache.getEntry('nonexistent');
    expect(entry).toBeNull();
  });

  test('should get all keys', async () => {
    await cache.set('key1', 'value1');
    await cache.set('key2', 'value2');
    await cache.set('key3', 'value3');

    const keys = await cache.keys();
    expect(keys).toContain('key1');
    expect(keys).toContain('key2');
    expect(keys).toContain('key3');
  });

  test('touch refreshes the timestamp and can override ttl', async () => {
    await cache.set('key1', 'value1', 10000);
    jest.advanceTimersByTime(5000);

    const touched = await cache.touch('key1', 20000);
    expect(touched).toBe(true);

    // New expiry = touchedAt(5000) + 20000 = clock 25000.
    jest.advanceTimersByTime(10000);
    expect(await cache.get('key1')).toBe('value1');

    jest.advanceTimersByTime(10000);
    expect(await cache.get('key1')).toBeNull();
  });

  test('touch returns false for missing and expired keys', async () => {
    expect(await cache.touch('nonexistent')).toBe(false);

    await cache.set('key1', 'value1', 1000);
    jest.advanceTimersByTime(1000);
    expect(await cache.touch('key1')).toBe(false);
  });

  test('should get multiple keys', async () => {
    await cache.set('key1', 'value1');
    await cache.set('key2', 'value2');
    await cache.set('key3', 'value3');

    const results = await cache.mget(['key1', 'key2', 'key3']);
    expect(results).toEqual(['value1', 'value2', 'value3']);
  });

  test('should set multiple entries', async () => {
    await cache.mset([
      { key: 'key1', value: 'value1' },
      { key: 'key2', value: 'value2' },
      { key: 'key3', value: 'value3' }
    ]);

    expect(await cache.get('key1')).toBe('value1');
    expect(await cache.get('key2')).toBe('value2');
    expect(await cache.get('key3')).toBe('value3');
  });

  test('should delete multiple keys and count them', async () => {
    await cache.set('key1', 'value1');
    await cache.set('key2', 'value2');
    await cache.set('key3', 'value3');

    const count = await cache.mdelete(['key1', 'key3', 'missing']);
    expect(count).toBe(2);
    expect(await cache.get('key1')).toBeNull();
    expect(await cache.get('key2')).toBe('value2');
    expect(await cache.get('key3')).toBeNull();
  });

  test('should scan keys with pattern', async () => {
    await cache.set('quote:AAPL', 'value1');
    await cache.set('quote:MSFT', 'value2');
    await cache.set('historical:AAPL', 'value3');

    const results = await cache.scan('quote:*');
    expect(results).toContain('quote:AAPL');
    expect(results).toContain('quote:MSFT');
    expect(results).not.toContain('historical:AAPL');
  });

  test('should limit scan results', async () => {
    for (let i = 0; i < 10; i++) {
      await cache.set(`key${i}`, `value${i}`);
    }

    const results = await cache.scan('key*', 5);
    expect(results.length).toBe(5);
  });

  test('an invalid scan pattern rejects rather than throws synchronously', async () => {
    // scan keeps its body inside a Promise executor so `new RegExp('(')` rejects
    // (cache.ts:376-383).
    await expect(cache.scan('[')).rejects.toBeInstanceOf(Error);
  });

  test('should use documented TTL per key prefix', async () => {
    await cache.set('quote:AAPL', 'q');
    await cache.set('historical:AAPL', 'h');
    await cache.set('financial:AAPL', 'f');
    await cache.set('news:AAPL', 'n');
    await cache.set('analysis:AAPL', 'a');
    await cache.set('other:AAPL', 'o');

    expect((await cache.getEntry('quote:AAPL'))?.ttl).toBe(60000);
    expect((await cache.getEntry('historical:AAPL'))?.ttl).toBe(3600000);
    expect((await cache.getEntry('financial:AAPL'))?.ttl).toBe(86400000);
    expect((await cache.getEntry('news:AAPL'))?.ttl).toBe(300000);
    expect((await cache.getEntry('analysis:AAPL'))?.ttl).toBe(3600000);
    expect((await cache.getEntry('other:AAPL'))?.ttl).toBe(60000); // config.ttl fallback
  });

  test('PREFIX-MATCH REALITY: plural key types still match the singular token', async () => {
    // getTTLForType uses key.startsWith(token), so 'quotes:AAPL' DOES match the 'quote'
    // token (60000) and 'financials:' matches 'financial' (86400000).
    // src/middleware/AGENTS.md claims plural keys "do not match"; the code is the truth.
    await cache.set('quotes:AAPL', 'q');
    await cache.set('financials:AAPL', 'f');

    expect((await cache.getEntry('quotes:AAPL'))?.ttl).toBe(60000);
    expect((await cache.getEntry('financials:AAPL'))?.ttl).toBe(86400000);
  });

  test('stale (50% of ttl) is NOT expired: plain get still serves the value', async () => {
    await cache.set('key1', 'value1', 1000);
    jest.advanceTimersByTime(600); // past STALE_THRESHOLD 0.5, before expiry

    expect(await cache.get('key1')).toBe('value1');
  });

  test('updateConfig applies maxEntries to LRU capacity and evicts oldest', async () => {
    cache.updateConfig({ maxEntries: 2 });
    expect(cache.getConfig().maxEntries).toBe(2);

    await cache.set('a', 1);
    await cache.set('b', 2);
    await cache.set('c', 3);

    expect(cache.getStats().entries).toBe(2);
    // CacheStats does not surface the eviction counter (cache.ts:293-319) — only the effect:
    expect(await cache.get('a')).toBeNull();
    expect(await cache.get('c')).toBe(3);
  });

  test('LRU access order is respected through the Cache wrapper', async () => {
    cache.updateConfig({ maxEntries: 2 });
    await cache.set('a', 1);
    await cache.set('b', 2);
    await cache.get('a'); // touch 'a' so 'b' becomes least-recently-used
    await cache.set('c', 3);

    expect(await cache.get('b')).toBeNull();
    expect(await cache.get('a')).toBe(1);
    expect(await cache.get('c')).toBe(3);
  });

  test('getWithRevalidation serves a fresh entry without calling the revalidate fn', async () => {
    await cache.set('key1', 'fresh', 10000);
    const revalidateFn = jest.fn().mockResolvedValue('new');

    const result = await cache.getWithRevalidation('key1', revalidateFn);
    expect(result).toBe('fresh');
    expect(revalidateFn).not.toHaveBeenCalled();
  });

  test('getWithRevalidation on a stale entry returns the old value immediately and refreshes in the background', async () => {
    await cache.set('key1', 'old', 10000);
    jest.advanceTimersByTime(6000); // stale (>= 50%), not expired

    const revalidateFn = jest.fn().mockResolvedValue('new');
    const result = await cache.getWithRevalidation('key1', revalidateFn);

    expect(result).toBe('old'); // stale value served synchronously
    await jest.advanceTimersByTimeAsync(0); // flush the floating revalidation promise

    expect(revalidateFn).toHaveBeenCalledTimes(1);
    expect(await cache.get('key1')).toBe('new');
  });

  test('REALITY: a failing revalidation never rejects the read; the stored entry is served even once expired', async () => {
    // getWithRevalidation reads through StaleWhileRevalidate.get, which only checks entry
    // PRESENCE, not expiry (cache.ts:177-189). With an entry present and an always-failing
    // revalidator, the old value is served forever at read time; expiry is only enforced
    // by the regular get()/has() path. Pin that contrast.
    await cache.set('key1', 'stale-value', 10000);
    const failing = jest.fn().mockRejectedValue(new Error('upstream down'));

    jest.advanceTimersByTime(6000); // stale, not expired
    expect(await cache.getWithRevalidation('key1', failing)).toBe('stale-value');
    await jest.advanceTimersByTimeAsync(0);

    jest.advanceTimersByTime(5000); // now expired
    expect(await cache.getWithRevalidation('key1', failing)).toBe('stale-value');
    await jest.advanceTimersByTimeAsync(0);
    expect(await cache.get('key1')).toBeNull(); // get() enforces expiry and deletes
  });

  test('revalidation failure with no stored entry rejects the read', async () => {
    const failing = jest.fn().mockRejectedValue(new Error('boom'));
    await expect(cache.getWithRevalidation('missing-key', failing)).rejects.toThrow('boom');
  });

  test('QUIRK: revalidated entries keep the ttl captured at construction, not updateConfig({ttl})', async () => {
    // StaleWhileRevalidate is built with config.ttl once in the Cache constructor
    // (cache.ts:234); updateConfig({ttl}) only changes this.config, not the SWR instance.
    cache.updateConfig({ ttl: 300000 });
    const revalidateFn = jest.fn().mockResolvedValue('written');

    await cache.getWithRevalidation('key1', revalidateFn);
    const entry = await cache.getEntry('key1');
    expect(entry?.ttl).toBe(60000); // still the constructor's ttl

    jest.advanceTimersByTime(60000);
    expect(await cache.get('key1')).toBeNull();
  });

  test('warm() routes each key to fn and errors to config.onError', async () => {
    const fn = jest
      .fn()
      .mockImplementationOnce(async (key: string) => { await cache.set(key, 'value1'); })
      .mockImplementationOnce(async () => { throw new Error('warm failed'); });

    const onError = jest.fn();
    cache.updateConfig({ onError });

    await cache.warm(['key1', 'key2'], fn);

    expect(fn).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(await cache.get('key1')).toBe('value1');
    // warm() itself stores nothing: a fn that does not call set leaves a miss.
    expect(await cache.get('key2')).toBeNull();
  });

  test('invalidateOnErrors deletes keys synchronously', async () => {
    await cache.set('key1', 'value1');
    await cache.set('key2', 'value2');

    cache.invalidateOnErrors(['key1', 'key2']);

    await expect(cache.has('key1')).resolves.toBe(false);
    await expect(cache.has('key2')).resolves.toBe(false);
    expect(cache.getStats().entries).toBe(0);
  });
});

describe('StaleWhileRevalidate (direct)', () => {
  let lru: LRUCache<any>;
  let swr: StaleWhileRevalidate<string>;

  beforeEach(() => {
    jest.useFakeTimers();
    lru = new LRUCache<any>(10);
    // Real constructor is (cache, ttl) — the old suite passed one argument, leaving ttl
    // undefined so no entry was ever stale and nothing was ever revalidated.
    swr = new StaleWhileRevalidate<string>(lru as any, 10000);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('miss triggers validation and writes an entry into the shared LRU', async () => {
    const fn = jest.fn().mockResolvedValue('v1');
    const result = await swr.get('key1', fn);

    expect(result).toBe('v1');
    expect(lru.size()).toBe(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('fresh entry is returned without revalidating', async () => {
    await swr.get('key1', jest.fn().mockResolvedValue('v1'));
    const second = jest.fn().mockResolvedValue('v2');

    const result = await swr.get('key1', second);
    expect(result).toBe('v1');
    expect(second).not.toHaveBeenCalled();
  });

  test('stale entry returns old value and revalidates in the background', async () => {
    await swr.get('key1', jest.fn().mockResolvedValue('v1'));
    jest.advanceTimersByTime(6000); // stale, not expired

    const revalidate = jest.fn().mockResolvedValue('v2');
    const served = await swr.get('key1', revalidate);
    expect(served).toBe('v1');

    await jest.advanceTimersByTimeAsync(0);
    expect(revalidate).toHaveBeenCalledTimes(1);
    expect(await swr.get('key1', jest.fn().mockResolvedValue('never'))).toBe('v2');
  });

  test('concurrent validations for the same key are deduplicated', async () => {
    const fn = jest.fn().mockResolvedValue('v1');
    const [a, b] = await Promise.all([swr.get('key1', fn), swr.get('key1', fn)]);

    expect(a).toBe('v1');
    expect(b).toBe('v1');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('validation failure with no stored entry rethrows', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('boom'));
    await expect(swr.get('key1', fn)).rejects.toThrow('boom');
  });

  test('background validation failure with an unexpired stale entry keeps serving the stored value', async () => {
    await swr.get('key1', jest.fn().mockResolvedValue('keepme'));
    jest.advanceTimersByTime(6000);

    // get() fires the revalidation in the background (with .catch) and returns the stored value.
    const failing = jest.fn().mockRejectedValue(new Error('upstream'));
    const served = await swr.get('key1', failing);
    expect(served).toBe('keepme');
    await jest.advanceTimersByTimeAsync(0);
    expect(failing).toHaveBeenCalledTimes(1);
    expect(await swr.get('key1', jest.fn().mockResolvedValue('x'))).toBe('keepme');
  });

  test('expired entry is still served synchronously while validation runs in the background', async () => {
    await swr.get('key1', jest.fn().mockResolvedValue('v1'));
    jest.advanceTimersByTime(10000); // expired (age >= ttl)

    // StaleWhileRevalidate.get checks presence, not expiry, so an expired entry counts as
    // stale: the old value is returned and refresh happens in the background. Pin the shape.
    const fresh = jest.fn().mockResolvedValue('v2');
    const served = await swr.get('key1', fresh);
    expect(served).toBe('v1'); // expired value still returned synchronously
    await jest.advanceTimersByTimeAsync(0);
    expect(fresh).toHaveBeenCalledTimes(1);
    expect(lru.get('key1')?.value).toBe('v2');
  });

  test('validate() direct write uses the SWR ttl for the stored entry', async () => {
    await swr.validate('key1', jest.fn().mockResolvedValue('v1'));
    const entry = lru.get('key1');
    expect(entry?.ttl).toBe(10000);

    jest.advanceTimersByTime(10000);
    expect(entry.isExpired()).toBe(true);
  });
});
