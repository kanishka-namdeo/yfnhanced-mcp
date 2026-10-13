import type { CacheStats, CacheInterface, CacheEntry as CacheEntryType } from '../types/middleware.js';
import type { CacheConfig } from '../types/config.js';

const DEFAULT_TTL = {
  quotes: 60000,
  historical: 3600000,
  financials: 86400000,
  news: 300000,
  analysis: 3600000
};

const STALE_THRESHOLD = 0.5;

class CacheEntryClass<T> {
  value: T;
  timestamp: number;
  ttl: number;

  constructor(value: T, ttl: number) {
    this.value = value;
    this.timestamp = Date.now();
    this.ttl = ttl;
  }

  isExpired(): boolean {
    return this.getAge() >= this.ttl;
  }

  isStale(): boolean {
    return this.getAge() >= this.ttl * STALE_THRESHOLD;
  }

  getAge(): number {
    return Date.now() - this.timestamp;
  }

  getExpiresAt(): number {
    return this.timestamp + this.ttl;
  }

  getRemainingTTL(): number {
    return Math.max(0, this.ttl - this.getAge());
  }
}

class LRUCache<T> {
  capacity: number;
  entries: Map<string, T>;
  order: string[];

  constructor(capacity: number) {
    this.capacity = capacity;
    this.entries = new Map();
    this.order = [];
  }

  get(key: string): T | null {
    const entry = this.entries.get(key);
    if (entry === undefined) {
      return null;
    }

    this.updateAccessOrder(key);
    return entry;
  }

  set(key: string, value: T): void {
    if (this.entries.has(key)) {
      this.entries.set(key, value);
      this.updateAccessOrder(key);
    } else {
      if (this.entries.size >= this.capacity) {
        this.evict();
      }
      this.entries.set(key, value);
      this.order.push(key);
    }
  }

  evict(): void {
    if (this.order.length === 0) {return;}
    const lruKey = this.order.shift();
    if (lruKey !== undefined) {
      this.entries.delete(lruKey);
    }
  }

  delete(key: string): boolean {
    const index = this.order.indexOf(key);
    if (index !== -1) {
      this.order.splice(index, 1);
    }
    return this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
    this.order = [];
  }

  has(key: string): boolean {
    return this.entries.has(key);
  }

  size(): number {
    return this.entries.size;
  }

  keys(): string[] {
    return Array.from(this.entries.keys());
  }

  public updateAccessOrder(key: string): void {
    const index = this.order.indexOf(key);
    if (index !== -1) {
      this.order.splice(index, 1);
    }
    this.order.push(key);
  }
}

class CacheMetrics {
  hits: number;
  misses: number;
  evictions: number;

  constructor() {
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
  }

  recordHit(): void {
    this.hits++;
  }

  recordMiss(): void {
    this.misses++;
  }

  recordEviction(): void {
    this.evictions++;
  }

  getHitRate(): number {
    const total = this.hits + this.misses;
    return total === 0 ? 0 : this.hits / total;
  }

  reset(): void {
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
  }

  getStats(): { hits: number; misses: number; evictions: number; hitRate: number } {
    return {
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
      hitRate: this.getHitRate()
    };
  }
}

class StaleWhileRevalidate<T> {
  private cache: LRUCache<CacheEntryClass<T>>;
  private pendingValidations: Map<string, Promise<T>>;
  private ttl: number;

  constructor(cache: LRUCache<CacheEntryClass<T>>, ttl: number) {
    this.cache = cache;
    this.pendingValidations = new Map();
    this.ttl = ttl;
  }

  get(key: string, revalidateFn: () => Promise<T>): Promise<T> {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return this.validate(key, revalidateFn);
    }

    if (entry.isStale()) {
      this.validate(key, revalidateFn).catch(() => {});
    }

    return Promise.resolve(entry.value);
  }

  async validate(key: string, fn: () => Promise<T>): Promise<T> {
    const pending = this.pendingValidations.get(key);
    if (pending !== undefined) {
      return pending;
    }

    const promise = this.executeValidation(key, fn);
    this.pendingValidations.set(key, promise);
    
    try {
      const result = await promise;
      return result;
    } finally {
      this.pendingValidations.delete(key);
    }
  }

  private async executeValidation(key: string, fn: () => Promise<T>): Promise<T> {
    try {
      const value = await fn();
      this.cache.set(key, new CacheEntryClass(value, this.ttl));
      return value;
    } catch (error) {
      const entry = this.cache.get(key);
      if (entry && !entry.isExpired()) {
        return entry.value;
      }
      throw error;
    }
  }
}

export class Cache implements CacheInterface {
  private lruCache: LRUCache<CacheEntryClass<unknown>>;
  private metrics: CacheMetrics;
  private config: CacheConfig;
  private staleWhileRevalidate: StaleWhileRevalidate<unknown>;
  private ttlMap: Map<string, number>;

  constructor(config: CacheConfig) {
    this.config = config;
    this.lruCache = new LRUCache(config.maxEntries);
    this.metrics = new CacheMetrics();
    this.staleWhileRevalidate = new StaleWhileRevalidate(this.lruCache, config.ttl);
    this.ttlMap = new Map();
    this.initializeTTLMap();
  }

  get<T>(key: string): Promise<T | null> {
    const entry = this.lruCache.get(key);
    if (!entry) {
      this.metrics.recordMiss();
      return Promise.resolve(null);
    }

    if (entry.isExpired()) {
      this.lruCache.delete(key);
      this.metrics.recordMiss();
      return Promise.resolve(null);
    }

    this.metrics.recordHit();
    return Promise.resolve(entry.value as T);
  }

  set<T>(key: string, value: T, ttl?: number): Promise<void> {
    const effectiveTTL = ttl ?? this.getTTLForType(key);
    const entry = new CacheEntryClass(value, effectiveTTL);
    
    if (this.lruCache.has(key)) {
      this.lruCache.set(key, entry);
    } else {
      if (this.lruCache.size() >= this.lruCache.capacity) {
        this.lruCache.evict();
        this.metrics.recordEviction();
      }
      this.lruCache.set(key, entry);
    }
    return Promise.resolve();
  }

  delete(key: string): Promise<boolean> {
    return Promise.resolve(this.lruCache.delete(key));
  }

  clear(): Promise<void> {
    this.lruCache.clear();
    this.metrics.reset();
    return Promise.resolve();
  }

  has(key: string): Promise<boolean> {
    const entry = this.lruCache.get(key);
    if (!entry) {return Promise.resolve(false);}
    
    if (entry.isExpired()) {
      this.lruCache.delete(key);
      return Promise.resolve(false);
    }
    return Promise.resolve(true);
  }

  getStats(): CacheStats {
    const metrics = this.metrics.getStats();
    const entries = Array.from(this.lruCache.entries.values());
    const totalSize = entries.reduce((sum, entry) => {
      return sum + JSON.stringify(entry.value).length;
    }, 0);

    let oldestEntry: CacheEntryType | undefined;
    let newestEntry: CacheEntryType | undefined;

    if (entries.length > 0) {
      const sortedEntries = [...entries].sort((a, b) => a.timestamp - b.timestamp);
      oldestEntry = this.convertToCacheEntry(sortedEntries[0]);
      newestEntry = this.convertToCacheEntry(sortedEntries[sortedEntries.length - 1]);
    }

    return {
      hits: metrics.hits,
      misses: metrics.misses,
      hitRate: metrics.hitRate,
      entries: this.lruCache.size(),
      totalSize,
      keys: this.lruCache.keys(),
      oldestEntry,
      newestEntry
    };
  }

  getEntry<T>(key: string): Promise<CacheEntryType<T> | null> {
    const entry = this.lruCache.get(key);
    if (!entry) {
      return Promise.resolve(null);
    }

    if (entry.isExpired()) {
      return Promise.resolve(null);
    }

    return Promise.resolve(this.convertToCacheEntry<T>(entry));
  }

  keys(): Promise<string[]> {
    return Promise.resolve(this.lruCache.keys());
  }

  touch(key: string, ttl?: number): Promise<boolean> {
    const entry = this.lruCache.get(key);
    if (!entry) {
      return Promise.resolve(false);
    }

    if (entry.isExpired()) {
      return Promise.resolve(false);
    }

    entry.timestamp = Date.now();
    if (ttl !== undefined) {
      entry.ttl = ttl;
    }

    this.lruCache.updateAccessOrder(key);
    return Promise.resolve(true);
  }

  mget<T>(keys: string[]): Promise<(T | null)[]> {
    return Promise.all(keys.map(key => this.get<T>(key)));
  }

  async mset<T>(entries: Array<{ key: string; value: T; ttl?: number }>): Promise<void> {
    await Promise.all(entries.map(entry => this.set(entry.key, entry.value, entry.ttl)));
  }

  async mdelete(keys: string[]): Promise<number> {
    let count = 0;
    for (const key of keys) {
      if (await this.delete(key)) {
        count++;
      }
    }
    return count;
  }

  // Executor keeps the body synchronous and an invalid RegExp pattern rejecting, as `async` did.
  scan(pattern: string, count?: number): Promise<string[]> {
    return new Promise<string[]>((resolve) => {
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      const allKeys = this.lruCache.keys();
      const filtered = allKeys.filter(key => regex.test(key));
      resolve(count !== undefined && count !== 0 && !Number.isNaN(count) ? filtered.slice(0, count) : filtered);
    });
  }

  getConfig(): CacheConfig {
    return { ...this.config };
  }

  updateConfig(config: Partial<CacheConfig>): void {
    this.config = { ...this.config, ...config };
    if (config.maxEntries !== undefined) {
      this.lruCache.capacity = config.maxEntries;
    }
  }

  async getWithRevalidation<T>(key: string, revalidateFn: () => Promise<T>): Promise<T> {
    const result = await this.staleWhileRevalidate.get(key, revalidateFn);
    return result as T;
  }

  async warm(keys: string[], fn: (key: string) => Promise<void>): Promise<void> {
    const batchSize = Math.ceil(keys.length / 10);
    
    for (let i = 0; i < keys.length; i += batchSize) {
      const batch = keys.slice(i, i + batchSize);
      await Promise.all(batch.map(key => 
        fn(key).catch(error => {
          this.config.onError?.(error as Error);
        })
      ));
    }
  }

  invalidateOnErrors(keys: string[]): void {
    keys.forEach(key => {
      this.lruCache.delete(key);
    });
  }

  private getTTLForType(key: string): number {
    for (const [type, ttl] of this.ttlMap) {
      if (key.startsWith(type)) {
        return ttl;
      }
    }
    return this.config.ttl;
  }

  private initializeTTLMap(): void {
    this.ttlMap.set('quote', DEFAULT_TTL.quotes);
    this.ttlMap.set('historical', DEFAULT_TTL.historical);
    this.ttlMap.set('financial', DEFAULT_TTL.financials);
    this.ttlMap.set('news', DEFAULT_TTL.news);
    this.ttlMap.set('analysis', DEFAULT_TTL.analysis);
  }

  private convertToCacheEntry<T>(entry: CacheEntryClass<unknown>): CacheEntryType<T> {
    return {
      key: '',
      value: entry.value as T,
      timestamp: new Date(entry.timestamp),
      ttl: entry.ttl,
      expiresAt: new Date(entry.getExpiresAt()),
      hits: 0,
      size: JSON.stringify(entry.value).length
    };
  }
}

export { LRUCache, StaleWhileRevalidate, CacheMetrics };
