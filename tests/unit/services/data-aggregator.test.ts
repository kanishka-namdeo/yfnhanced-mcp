import { DataAggregator, FallbackStrategy } from '../../../src/services/data-aggregator';
import { DataQualityReport } from '../../../src/utils/data-completion';

describe('DataAggregator', () => {
  let aggregator: DataAggregator;

  beforeEach(() => {
    jest.useFakeTimers();
    aggregator = new DataAggregator({
      strategy: 'parallel',
      timeoutMs: 5000,
      retryAttempts: 2,
      fallbackEnabled: true,
      cacheEnabled: true,
      qualityThreshold: 0.8
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('should initialize with config', () => {
    expect(aggregator.getConfig().strategy).toBe('parallel');
    expect(aggregator.getConfig().timeoutMs).toBe(5000);
  });

  test('should aggregate data successfully', async () => {
    const sources = [
      jest.fn().mockResolvedValue({ price: 150, volume: 50000000 }),
      jest.fn().mockResolvedValue({ marketCap: 2500000000000 })
    ];

    const result = await aggregator.aggregate(sources);
    expect(result.price).toBe(150);
    expect(result.volume).toBe(50000000);
    expect(result.marketCap).toBe(2500000000000);
  });

  test('should use sequential strategy', async () => {
    aggregator.updateConfig({ strategy: 'sequential' });

    const sources = [
      jest.fn().mockResolvedValue({ price: 150 }),
      jest.fn().mockResolvedValue({ volume: 50000000 })
    ];

    const result = await aggregator.aggregate(sources);
    expect(result.price).toBe(150);
    expect(result.volume).toBe(50000000);
  });

  test('should use fallback on primary source failure', async () => {
    aggregator.updateConfig({
      fallbackStrategy: FallbackStrategy.SECONDARY_ONLY
    });

    const sources = [
      jest.fn().mockRejectedValue(new Error('primary failed')),
      jest.fn().mockResolvedValue({ price: 150, volume: 50000000 })
    ];

    const result = await aggregator.aggregate(sources);
    expect(result.price).toBe(150);
    expect(result.volume).toBe(50000000);
  });

  test('should use cascade fallback strategy', async () => {
    aggregator.updateConfig({
      fallbackStrategy: FallbackStrategy.CASCADE
    });

    const sources = [
      jest.fn().mockRejectedValue(new Error('primary failed')),
      jest.fn().mockRejectedValue(new Error('secondary failed')),
      jest.fn().mockResolvedValue({ price: 150 })
    ];

    const result = await aggregator.aggregate(sources);
    expect(result.price).toBe(150);
  });

  test('should use parallel fallback strategy', async () => {
    aggregator.updateConfig({
      fallbackStrategy: FallbackStrategy.PARALLEL
    });

    const sources = [
      jest.fn().mockRejectedValue(new Error('primary failed')),
      jest.fn().mockResolvedValue({ price: 150 }),
      jest.fn().mockResolvedValue({ volume: 50000000 })
    ];

    const result = await aggregator.aggregate(sources);
    expect(result.price).toBe(150);
    expect(result.volume).toBe(50000000);
  });

  test('should throw error when all sources fail', async () => {
    const sources = [
      jest.fn().mockRejectedValue(new Error('failed1')),
      jest.fn().mockRejectedValue(new Error('failed2'))
    ];

    await expect(aggregator.aggregate(sources)).rejects.toThrow();
  });

  test('should respect timeout', async () => {
    const sources = [
      jest.fn().mockImplementation(() => new Promise(resolve => setTimeout(() => resolve({ price: 150 }), 10000)))
    ];

    await expect(aggregator.aggregate(sources)).rejects.toThrow();
  });

  test('should retry failed sources', async () => {
    aggregator.updateConfig({ retryAttempts: 3 });

    const sources = [
      jest.fn()
        .mockRejectedValueOnce(new Error('failed'))
        .mockRejectedValueOnce(new Error('failed'))
        .mockResolvedValue({ price: 150 })
    ];

    const result = await aggregator.aggregate(sources);
    expect(result.price).toBe(150);
  });

  test('should use cached data when available', async () => {
    aggregator.updateConfig({ cacheEnabled: true });

    const mockCache = new Map();
    mockCache.set('cache-key', { price: 150, volume: 50000000 });
    aggregator['cache'] = mockCache;

    const sources = [
      jest.fn().mockRejectedValue(new Error('failed'))
    ];

    const result = await aggregator.aggregate(sources, { cacheKey: 'cache-key' });
    expect(result.price).toBe(150);
    expect(result.volume).toBe(50000000);
  });

  test('should merge data from multiple sources', async () => {
    const sources = [
      jest.fn().mockResolvedValue({ price: 150, volume: 50000000 }),
      jest.fn().mockResolvedValue({ price: 151, marketCap: 2500000000000 }),
      jest.fn().mockResolvedValue({ pe: 28.5, dividendYield: 0.5 })
    ];

    const result = await aggregator.aggregate(sources);
    expect(result.price).toBe(151);
    expect(result.volume).toBe(50000000);
    expect(result.marketCap).toBe(2500000000000);
    expect(result.pe).toBe(28.5);
    expect(result.dividendYield).toBe(0.5);
  });

  test('should handle conflicting data', async () => {
    const sources = [
      jest.fn().mockResolvedValue({ price: 150 }),
      jest.fn().mockResolvedValue({ price: 151 }),
      jest.fn().mockResolvedValue({ price: 149 })
    ];

    const result = await aggregator.aggregate(sources);
    expect(result.price).toBeDefined();
  });

  test('should generate quality report', async () => {
    const sources = [
      jest.fn().mockResolvedValue({ price: 150, volume: 50000000 })
    ];

    await aggregator.aggregate(sources, {
      requiredFields: ['price', 'volume', 'marketCap']
    });

    const report = aggregator.getQualityReport();
    expect(report).toHaveProperty('completeness');
    expect(report).toHaveProperty('fields');
  });

  test('should throw error if quality threshold not met', async () => {
    aggregator.updateConfig({ qualityThreshold: 0.9 });

    const sources = [
      jest.fn().mockResolvedValue({ price: 150 })
    ];

    await expect(
      aggregator.aggregate(sources, {
        requiredFields: ['price', 'volume', 'marketCap', 'pe']
      })
    ).rejects.toThrow();
  });

  test('should handle partial data', async () => {
    aggregator.updateConfig({ allowPartial: true });

    const sources = [
      jest.fn().mockResolvedValue({ price: 150, volume: null })
    ];

    const result = await aggregator.aggregate(sources);
    expect(result.price).toBe(150);
    expect(result.volume).toBeNull();
  });

  test('should validate aggregated data', async () => {
    const sources = [
      jest.fn().mockResolvedValue({ price: 150, volume: 50000000 })
    ];

    const result = await aggregator.aggregate(sources, {
      validate: (data: any) => data.price > 100
    });

    expect(result.price).toBe(150);
  });

  test('should throw error on validation failure', async () => {
    const sources = [
      jest.fn().mockResolvedValue({ price: 50, volume: 50000000 })
    ];

    await expect(
      aggregator.aggregate(sources, {
        validate: (data: any) => data.price > 100
      })
    ).rejects.toThrow();
  });

  test('should get stats', async () => {
    const sources = [
      jest.fn().mockResolvedValue({ price: 150 }),
      jest.fn().mockRejectedValue(new Error('failed'))
    ];

    await aggregator.aggregate(sources);

    const stats = aggregator.getStats();
    expect(stats).toHaveProperty('totalRequests');
    expect(stats).toHaveProperty('successfulRequests');
    expect(stats).toHaveProperty('failedRequests');
    expect(stats).toHaveProperty('fallbacksUsed');
    expect(stats).toHaveProperty('cacheHits');
  });

  test('should reset stats', async () => {
    const sources = [jest.fn().mockResolvedValue({ price: 150 })];
    await aggregator.aggregate(sources);

    aggregator.resetStats();
    const stats = aggregator.getStats();
    expect(stats.totalRequests).toBe(0);
  });

  test('should get quality report', async () => {
    const sources = [jest.fn().mockResolvedValue({ price: 150 })];
    await aggregator.aggregate(sources);

    const report = aggregator.getQualityReport();
    expect(report).toBeInstanceOf(DataQualityReport);
  });

  test('should get cache stats', () => {
    const stats = aggregator.getCacheStats();
    expect(stats).toHaveProperty('hits');
    expect(stats).toHaveProperty('misses');
    expect(stats).toHaveProperty('hitRate');
  });

  test('should clear cache', () => {
    aggregator['cache'].set('key', { data: 'value' });
    aggregator.clearCache();
    expect(aggregator['cache'].size).toBe(0);
  });

  test('should warm cache', async () => {
    const warmFn = jest.fn().mockResolvedValue({ price: 150 });
    await aggregator.warmCache(['AAPL', 'MSFT'], warmFn);

    expect(warmFn).toHaveBeenCalledTimes(2);
  });

  test('should handle errors during warm cache', async () => {
    const warmFn = jest.fn()
      .mockResolvedValueOnce({ price: 150 })
      .mockRejectedValueOnce(new Error('failed'))
      .mockResolvedValueOnce({ price: 200 });

    const onError = jest.fn();
    await aggregator.warmCache(['AAPL', 'MSFT', 'GOOGL'], warmFn, onError);

    expect(onError).toHaveBeenCalled();
  });

  test('should use custom merge strategy', async () => {
    const customMerge = jest.fn().mockReturnValue({ custom: 'result' });
    const sources = [
      jest.fn().mockResolvedValue({ price: 150 }),
      jest.fn().mockResolvedValue({ volume: 50000000 })
    ];

    const result = await aggregator.aggregate(sources, { mergeStrategy: customMerge });
    expect(result).toEqual({ custom: 'result' });
    expect(customMerge).toHaveBeenCalled();
  });

  test('should handle empty sources array', async () => {
    const result = await aggregator.aggregate([]);
    expect(result).toEqual({});
  });

  test('should handle single source', async () => {
    const sources = [jest.fn().mockResolvedValue({ price: 150 })];
    const result = await aggregator.aggregate(sources);
    expect(result.price).toBe(150);
  });

  test('should update config', () => {
    aggregator.updateConfig({ timeoutMs: 10000 });
    expect(aggregator.getConfig().timeoutMs).toBe(10000);
  });

  test('should get config', () => {
    const config = aggregator.getConfig();
    expect(config).toHaveProperty('strategy');
    expect(config).toHaveProperty('timeoutMs');
    expect(config).toHaveProperty('retryAttempts');
  });
});

describe('FallbackStrategy', () => {
  test('should have secondary only strategy', () => {
    expect(FallbackStrategy.SECONDARY_ONLY).toBe('secondary-only');
  });

  test('should have cascade strategy', () => {
    expect(FallbackStrategy.CASCADE).toBe('cascade');
  });

  test('should have parallel strategy', () => {
    expect(FallbackStrategy.PARALLEL).toBe('parallel');
  });

  test('should have cache first strategy', () => {
    expect(FallbackStrategy.CACHE_FIRST).toBe('cache-first');
  });
});
