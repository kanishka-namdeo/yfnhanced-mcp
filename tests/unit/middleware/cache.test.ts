import { Cache, CacheEntry, LRUCache, StaleWhileRevalidate, CacheMetrics } from '../../../src/middleware/cache';

describe('CacheMetrics', () => {
  let metrics: CacheMetrics;

  beforeEach(() => {
    metrics = new CacheMetrics();
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
    cache = new LRUCache<number>(3);
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

describe('CacheEntry', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('should create entry with value and TTL', () => {
    const entry = new CacheEntry('test', 60000);
    expect(entry.value).toBe('test');
    expect(entry.ttl).toBe(60000);
  });

  test('should calculate age', () => {
    jest.setSystemTime(1000);
    const entry = new CacheEntry('test', 60000);
    jest.setSystemTime(6000);

    expect(entry.getAge()).toBe(5000);
  });

  test('should check if expired', () => {
    const entry = new CacheEntry('test', 1000);
    jest.setSystemTime(500);
    expect(entry.isExpired()).toBe(false);

    jest.setSystemTime(2000);
    expect(entry.isExpired()).toBe(true);
  });

  test('should check if stale', () => {
    const entry = new CacheEntry('test', 10000);
    jest.setSystemTime(1000);
    expect(entry.isStale()).toBe(false);

    jest.setSystemTime(6000);
    expect(entry.isStale()).toBe(true);
  });

  test('should get expires at timestamp', () => {
    jest.setSystemTime(1000);
    const entry = new CacheEntry('test', 5000);
    expect(entry.getExpiresAt()).toBe(6000);
  });

  test('should get remaining TTL', () => {
    jest.setSystemTime(1000);
    const entry = new CacheEntry('test', 10000);
    expect(entry.getRemainingTTL()).toBe(9000);

    jest.setSystemTime(5000);
    expect(entry.getRemainingTTL()).toBe(5000);
  });

  test('should return 0 remaining TTL when expired', () => {
    const entry = new CacheEntry('test', 1000);
    jest.setSystemTime(2000);
    expect(entry.getRemainingTTL()).toBe(0);
  });
});

describe('StaleWhileRevalidate', () => {
  let lruCache: LRUCache<{ value: string; timestamp: number; ttl: number }>;
  let swr: StaleWhileRevalidate<{ value: string }>;

  beforeEach(() => {
    lruCache = new LRUCache(10);
    swr = new StaleWhileRevalidate(lruCache);
  });

  test('should return value from cache when fresh', async () => {
    const entry = { value: 'test', timestamp: Date.now(), ttl: 60000 };
    lruCache.entries.set('key1', entry);

    const result = await swr.get('key1', () => Promise.resolve({ value: 'new' }));
    expect(result.value).toBe('test');
  });

  test('should revalidate when stale', async () => {
    const entry = { value: 'old', timestamp: Date.now() - 50000, ttl: 100000 };
    lruCache.entries.set('key1', entry);

    const revalidateFn = jest.fn().mockResolvedValue({ value: 'new' });
    await swr.get('key1', revalidateFn);

    await new Promise(resolve => setTimeout(resolve, 100));
    expect(revalidateFn).toHaveBeenCalled();
  });

  test('should validate when expired', async () => {
    const entry = { value: 'old', timestamp: Date.now() - 120000, ttl: 60000 };
    lruCache.entries.set('key1', entry);

    const revalidateFn = jest.fn().mockResolvedValue({ value: 'new' });
    const result = await swr.get('key1', revalidateFn);

    expect(result.value).toBe('new');
    expect(revalidateFn).toHaveBeenCalled();
  });

  test('should handle concurrent validations', async () => {
    const revalidateFn = jest.fn().mockResolvedValue({ value: 'new' });
    const promises = [
      swr.get('key1', revalidateFn),
      swr.get('key1', revalidateFn)
    ];

    await Promise.all(promises);
    expect(revalidateFn).toHaveBeenCalledTimes(1);
  });

  test('should return stale value on validation failure', async () => {
    const entry = { value: 'stale', timestamp: Date.now() - 80000, ttl: 100000 };
    lruCache.entries.set('key1', entry);

    const revalidateFn = jest.fn().mockRejectedValue(new Error('failed'));
    const result = await swr.get('key1', revalidateFn);

    expect(result.value).toBe('stale');
  });
});

describe('Cache', () => {
  let cache: Cache;

  beforeEach(() => {
    jest.useFakeTimers();
    cache = new Cache({
      enabled: true,
      store: 'memory',
      ttl: 60000,
      maxEntries: 10
    });
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

  test('should respect TTL', async () => {
    await cache.set('key1', 'value1', 1000);
    jest.setSystemTime(500);
    let result = await cache.get('key1');
    expect(result).toBe('value1');

    jest.setSystemTime(2000);
    result = await cache.get('key1');
    expect(result).toBeNull();
  });

  test('should delete key', async () => {
    await cache.set('key1', 'value1');
    const result = await cache.delete('key1');
    expect(result).toBe(true);

    const check = await cache.get('key1');
    expect(check).toBeNull();
  });

  test('should clear all entries', async () => {
    await cache.set('key1', 'value1');
    await cache.set('key2', 'value2');
    await cache.clear();

    expect(await cache.get('key1')).toBeNull();
    expect(await cache.get('key2')).toBeNull();
  });

  test('should check if key exists', async () => {
    await cache.set('key1', 'value1');
    expect(cache.has('key1')).toBe(true);
    expect(cache.has('nonexistent')).toBe(false);
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
  });

  test('should get entry details', async () => {
    await cache.set('key1', 'value1', 60000);
    const entry = await cache.getEntry('key1');

    expect(entry).not.toBeNull();
    expect(entry?.value).toBe('value1');
    expect(entry).toHaveProperty('timestamp');
    expect(entry).toHaveProperty('ttl');
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

  test('should touch entry to refresh TTL', async () => {
    await cache.set('key1', 'value1', 10000);
    jest.setSystemTime(5000);

    const touched = await cache.touch('key1', 20000);
    expect(touched).toBe(true);

    jest.setSystemTime(15000);
    let result = await cache.get('key1');
    expect(result).toBe('value1');

    jest.setSystemTime(30000);
    result = await cache.get('key1');
    expect(result).toBeNull();
  });

  test('should return false when touching non-existent key', async () => {
    const touched = await cache.touch('nonexistent');
    expect(touched).toBe(false);
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

  test('should delete multiple keys', async () => {
    await cache.set('key1', 'value1');
    await cache.set('key2', 'value2');
    await cache.set('key3', 'value3');

    const count = await cache.mdelete(['key1', 'key3']);
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

  test('should get with revalidation', async () => {
    await cache.set('key1', 'old');
    const revalidateFn = jest.fn().mockResolvedValue('new');

    const result = await cache.getWithRevalidation('key1', revalidateFn);
    expect(result).toBe('new');
    expect(revalidateFn).toHaveBeenCalled();
  });

  test('should warm cache with keys', async () => {
    const fn = jest.fn().mockResolvedValue('value');
    await cache.warm(['key1', 'key2', 'key3'], fn);

    expect(fn).toHaveBeenCalledTimes(3);
    expect(await cache.get('key1')).toBe('value');
  });

  test('should handle errors during warm', async () => {
    const fn = jest.fn()
      .mockResolvedValueOnce('value1')
      .mockRejectedValueOnce(new Error('failed'))
      .mockResolvedValueOnce('value3');

    const onError = jest.fn();
    cache.updateConfig({ onError });

    await cache.warm(['key1', 'key2', 'key3'], fn);

    expect(onError).toHaveBeenCalled();
    expect(await cache.get('key1')).toBe('value1');
  });

  test('should invalidate on errors', () => {
    await cache.set('key1', 'value1');
    await cache.set('key2', 'value2');

    cache.invalidateOnErrors(['key1', 'key2']);

    expect(cache.has('key1')).toBe(false);
    expect(cache.has('key2')).toBe(false);
  });

  test('should update config', () => {
    cache.updateConfig({ maxEntries: 20 });
    expect(cache.getConfig().maxEntries).toBe(20);
  });

  test('should use different TTL for different key types', async () => {
    await cache.set('quote:AAPL', 'quote', 1000);
    await cache.set('historical:AAPL', 'historical', 5000);

    jest.setSystemTime(2000);
    expect(await cache.get('quote:AAPL')).toBeNull();
    expect(await cache.get('historical:AAPL')).toBe('historical');
  });
});
