import YahooFinance from 'yahoo-finance2';
import type { MCPServerConfig } from '../types/config.js';
import type {
  QuoteResult,
  HistoricalPriceResult,
  FinancialStatementResult,
  EarningsResult,
  AnalysisResult,
  NewsResult,
  OptionsResult,
  SummaryProfileResult,
  CryptoQuoteResult,
  ForexQuoteResult,
  TrendingResult,
  ScreenerResult,
  PriceData
} from '../types/yahoo-finance.js';
import { YahooFinanceError, YF_ERR_API_CHANGED, YF_ERR_DATA_INCOMPLETE, YF_ERR_DATA_UNAVAILABLE } from '../types/errors.js';
import { RateLimiter } from '../middleware/rate-limiter.js';
import { CircuitBreaker } from '../middleware/circuit-breaker.js';
import { Cache } from '../middleware/cache.js';
import { RetryPolicy } from '../middleware/retry.js';
import { classifyError } from '../utils/error-classifier.js';

/* eslint-disable require-await */

type YahooFinanceOptions = {
  validate?: boolean;
  useCache?: boolean;
  forceRefresh?: boolean;
  timeout?: number;
};

type GetQuoteOptions = YahooFinanceOptions & {
  fields?: string[];
};

type GetHistoricalOptions = YahooFinanceOptions & {
  period1?: string | Date;
  period2?: string | Date;
  interval?: string;
};

type GetFinancialsOptions = YahooFinanceOptions & {
  period?: string;
};

type GetEarningsOptions = YahooFinanceOptions;

type GetAnalysisOptions = YahooFinanceOptions;

type GetNewsOptions = YahooFinanceOptions & {
  count?: number;
};

type GetOptionsOptions = YahooFinanceOptions;

type GetSummaryOptions = YahooFinanceOptions;

type GetCryptoOptions = YahooFinanceOptions;

type GetForexOptions = YahooFinanceOptions;

type GetTrendingOptions = YahooFinanceOptions;

type ScreenerFilters = {
  field?: string;
  operator?: string;
  value?: string | number;
};

type GetScreenerOptions = YahooFinanceOptions & {
  filters?: ScreenerFilters[];
  count?: number;
  offset?: number;
};

type AlternativeEndpoint = {
  url: string;
  method: 'GET' | 'POST';
  headers?: Record<string, string>;
};

export class YahooFinanceClient {
  private config: MCPServerConfig;
  private rateLimiter: RateLimiter;
  private circuitBreaker: CircuitBreaker;
  private cache: Cache;
  private retryPolicy: RetryPolicy;
  private errorClassifier: typeof classifyError;
  private alternativeEndpoints: Map<string, AlternativeEndpoint[]>;
  private fallbackCache: Map<string, unknown>;
  private initialized: boolean;
  private yahooFinanceInstance: InstanceType<typeof YahooFinance>;

  constructor(config: MCPServerConfig) {
    this.config = config;
    this.rateLimiter = new RateLimiter(config.rateLimit);
    this.circuitBreaker = new CircuitBreaker(config.circuitBreaker);
    this.cache = new Cache(config.cache);
    this.retryPolicy = new RetryPolicy(config.retry);
    this.errorClassifier = classifyError;
    this.alternativeEndpoints = new Map();
    this.fallbackCache = new Map();
    this.initialized = false;
    this.yahooFinanceInstance = new YahooFinance();

    this.rateLimiter.setCache({
      get: (key) => this.cache.get(key),
      set: (key, value, ttl) => this.cache.set(key, value, ttl)
    });
    this.initializeAlternativeEndpoints();
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    await this.cache.warm(['quote:AAPL', 'quote:MSFT', 'quote:GOOGL'], async (key) => {
      const symbol = key.split(':')[1];
      try {
        const result = await this.yahooFinanceInstance.quote(symbol);
        await this.cache.set(key, result, 60000);
      } catch {
      }
    });

    this.initialized = true;
  }

  async shutdown(): Promise<void> {
    await this.cache.clear();
    this.rateLimiter.reset();
    this.circuitBreaker.reset();
    this.retryPolicy.reset();
    this.fallbackCache.clear();
    this.initialized = false;
  }

  getQuote(symbol: string, options?: GetQuoteOptions): Promise<QuoteResult> {
    return this.executeWithMiddleware(
      `quote:${symbol}`,
      async () => {
        const result = await this.yahooFinanceInstance.quote(symbol, options?.fields ? { fields: options.fields } : undefined);
        const validated = this.validateQuote(result);
        return validated;
      },
      options
    );
  }

  async getQuotes(symbols: string[], options?: GetQuoteOptions): Promise<Record<string, QuoteResult>> {
    const results: Record<string, QuoteResult> = {};
    const errors: Record<string, Error> = {};

    for (const symbol of symbols) {
      try {
        results[symbol] = await this.getQuote(symbol, options);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        errors[symbol] = err;
      }
    }

    if (Object.keys(errors).length > 0 && Object.keys(results).length === 0) {
      throw new YahooFinanceError(
        `Failed to fetch all quotes: ${Object.keys(errors).join(', ')}`,
        YF_ERR_DATA_UNAVAILABLE,
        null,
        false,
        false,
        { errors },
        'Retry individually or check symbol validity'
      );
    }

    return results;
  }

  getHistoricalPrices(symbol: string, options?: GetHistoricalOptions): Promise<HistoricalPriceResult> {
    return this.executeWithMiddleware(
      `historical:${symbol}`,
      async () => {
        const result = await this.yahooFinanceInstance.historical(symbol, {
          period1: options?.period1 ?? '1970-01-01',
          period2: options?.period2,
          interval: options?.interval as "1d" | "1wk" | "1mo" | undefined
        });
        const validated = this.validateHistorical(result);
        return validated;
      },
      options
    );
  }

  getFinancials(
    symbol: string,
    type: 'balance-sheet' | 'income-statement' | 'cash-flow',
    options?: GetFinancialsOptions
  ): Promise<FinancialStatementResult> {
    return this.executeWithMiddleware(
      `financials:${symbol}:${type}`,
      async () => {
        let result: unknown;

        switch (type) {
          case 'balance-sheet':
            result = await this.yahooFinanceInstance.quoteSummary(symbol, { modules: ['balanceSheetHistory'] });
            break;
          case 'income-statement':
            result = await this.yahooFinanceInstance.quoteSummary(symbol, { modules: ['incomeStatementHistory'] });
            break;
          case 'cash-flow':
            result = await this.yahooFinanceInstance.quoteSummary(symbol, { modules: ['cashflowStatementHistory'] });
            break;
        }

        const validated = this.validateFinancials(result);
        return validated;
      },
      options
    );
  }

  getEarnings(symbol: string, options?: GetEarningsOptions): Promise<EarningsResult> {
    return this.executeWithMiddleware(
      `earnings:${symbol}`,
      async () => {
        const result = await this.yahooFinanceInstance.quoteSummary(symbol, { modules: ['earnings'] });
        const validated = this.validateEarnings(result);
        return validated;
      },
      options
    );
  }

  getAnalysis(symbol: string, options?: GetAnalysisOptions): Promise<AnalysisResult> {
    return this.executeWithMiddleware(
      `analysis:${symbol}`,
      async () => {
        const result = await this.yahooFinanceInstance.quoteSummary(symbol, { modules: ['earningsTrend', 'industryTrend'] });
        const validated = this.validateAnalysis(result);
        return validated;
      },
      options
    );
  }

  getNews(symbol: string, options?: GetNewsOptions): Promise<NewsResult> {
    return this.executeWithMiddleware(
      `news:${symbol}`,
      async () => {
        const result = await this.yahooFinanceInstance.quoteSummary(symbol, {
          modules: ['news' as unknown as never]
        });
        const validated = this.validateNews(result);
        return validated;
      },
      options
    );
  }

  getOptions(symbol: string, options?: GetOptionsOptions): Promise<OptionsResult> {
    return this.executeWithMiddleware(
      `options:${symbol}`,
      async () => {
        const result = await this.yahooFinanceInstance.quoteSummary(symbol, {
          modules: ['optionChain' as unknown as never]
        });
        const validated = this.validateOptions(result);
        return validated;
      },
      options
    );
  }

  getSummaryProfile(symbol: string, options?: GetSummaryOptions): Promise<SummaryProfileResult> {
    return this.executeWithMiddleware(
      `summary:${symbol}`,
      async () => {
        const result = await this.yahooFinanceInstance.quoteSummary(symbol, { modules: ['assetProfile'] });
        const validated = this.validateSummaryProfile(result);
        return validated;
      },
      options
    );
  }

  async getCryptoQuote(symbols: string[], options?: GetCryptoOptions): Promise<Record<string, CryptoQuoteResult>> {
    const results: Record<string, CryptoQuoteResult> = {};
    const errors: Record<string, Error> = {};

    for (const symbol of symbols) {
      try {
        results[symbol] = await this.executeWithMiddleware(
          `crypto:${symbol}`,
          async () => {
            const result = await this.yahooFinanceInstance.quote(symbol);
            const validated = this.validateCryptoQuote(result);
            return validated;
          },
          options
        );
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        errors[symbol] = err;
      }
    }

    if (Object.keys(errors).length > 0 && Object.keys(results).length === 0) {
      throw new YahooFinanceError(
        `Failed to fetch all crypto quotes: ${Object.keys(errors).join(', ')}`,
        YF_ERR_DATA_UNAVAILABLE,
        null,
        false,
        false,
        { errors },
        'Retry individually or check symbol validity'
      );
    }

    return results;
  }

  async getForexQuote(pairs: string[], options?: GetForexOptions): Promise<Record<string, ForexQuoteResult>> {
    const results: Record<string, ForexQuoteResult> = {};
    const errors: Record<string, Error> = {};

    for (const pair of pairs) {
      try {
        results[pair] = await this.executeWithMiddleware(
          `forex:${pair}`,
          async () => {
            const result = await this.yahooFinanceInstance.quote(pair);
            const validated = this.validateForexQuote(result);
            return validated;
          },
          options
        );
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        errors[pair] = err;
      }
    }

    if (Object.keys(errors).length > 0 && Object.keys(results).length === 0) {
      throw new YahooFinanceError(
        `Failed to fetch all forex quotes: ${Object.keys(errors).join(', ')}`,
        YF_ERR_DATA_UNAVAILABLE,
        null,
        false,
        false,
        { errors },
        'Retry individually or check pair validity'
      );
    }

    return results;
  }

  getTrending(options?: GetTrendingOptions): Promise<TrendingResult> {
    return this.executeWithMiddleware(
      'trending',
      async () => {
        const result = await this.yahooFinanceInstance.trendingSymbols('US');
        const validated = this.validateTrending(result);
        return validated;
      },
      options
    );
  }

  screener(filters?: ScreenerFilters[], options?: GetScreenerOptions): Promise<ScreenerResult> {
    return this.executeWithMiddleware(
      `screener:${JSON.stringify(filters)}`,
      async () => {
        const result = await this.yahooFinanceInstance.screener({
          scrIds: 'most_actives',
          ...filters?.[0],
          count: options?.count
        });
        const validated = this.validateScreener(result);
        return validated;
      },
      options
    );
  }

  private async executeWithMiddleware<T>(
    cacheKey: string,
    fn: () => Promise<T>,
    options?: YahooFinanceOptions
  ): Promise<T> {
    const useCache = options?.useCache !== false && this.config.cache.enabled;

    if (useCache && options?.forceRefresh !== true) {
      const cached = await this.cache.get<T>(cacheKey);
      if (cached !== null) {
        return cached;
      }
    }

    return this.circuitBreaker.execute(async () => {
      return this.rateLimiter.execute(async () => {
        return this.retryPolicy.execute(async () => {
          try {
            const result = await fn();

            if (useCache && options?.validate !== false) {
              await this.cache.set(cacheKey, result);
            }

            return result;
          } catch (error) {
            const classifiedError = this.errorClassifier(error);

            if (useCache && classifiedError.isRetryable === true) {
              const fallbackData = this.getFallbackData(cacheKey);
              if (fallbackData !== null) {
                return fallbackData as T;
              }
            }

            throw classifiedError;
          }
        });
      }, cacheKey);
    });
  }

  validateQuote(result: unknown): QuoteResult {
    if (result === null || typeof result !== 'object') {
      throw new YahooFinanceError(
        'Invalid quote result: not an object',
        YF_ERR_API_CHANGED,
        null,
        false,
        false,
        { result },
        'Check API response structure'
      );
    }

    const quote = result as Partial<QuoteResult>;
    const required: Array<keyof PriceData> = [
      'regularMarketPrice',
      'regularMarketChange',
      'regularMarketChangePercent',
      'regularMarketPreviousClose',
      'regularMarketVolume'
    ];

    if (quote.price === undefined) {
      quote.price = {} as PriceData;
    }

    for (const field of required) {
      if ((quote.price as Record<string, unknown>)[field] === undefined) {
        (quote.price as Record<string, unknown>)[field] = null;
      }
    }

    if (this.detectAPIChanges(quote)) {
      this.handleAPIChange('quote', quote);
    }

    return quote as QuoteResult;
  }

  validateHistorical(result: unknown): HistoricalPriceResult {
    if (result === null || typeof result !== 'object') {
      throw new YahooFinanceError(
        'Invalid historical result: not an object',
        YF_ERR_API_CHANGED,
        null,
        false,
        false,
        { result },
        'Check API response structure'
      );
    }

    const historical = result as Partial<HistoricalPriceResult>;

    if (historical.meta === undefined || historical.indicators === undefined) {
      throw new YahooFinanceError(
        'Invalid historical result: missing meta or indicators',
        YF_ERR_DATA_INCOMPLETE,
        null,
        false,
        false,
        { result: historical },
        'Data may be incomplete or API structure changed'
      );
    }

    if (this.detectAPIChanges(historical)) {
      this.handleAPIChange('historical', historical);
    }

    return historical as HistoricalPriceResult;
  }

  validateFinancials(result: unknown): FinancialStatementResult {
    if (result === null || typeof result !== 'object') {
      throw new YahooFinanceError(
        'Invalid financials result: not an object',
        YF_ERR_API_CHANGED,
        null,
        false,
        false,
        { result },
        'Check API response structure'
      );
    }

    const financials = result as Partial<FinancialStatementResult>;

    if (this.detectAPIChanges(financials)) {
      this.handleAPIChange('financials', financials);
    }

    return financials as FinancialStatementResult;
  }

  validateEarnings(result: unknown): EarningsResult {
    if (result === null || typeof result !== 'object') {
      throw new YahooFinanceError(
        'Invalid earnings result: not an object',
        YF_ERR_API_CHANGED,
        null,
        false,
        false,
        { result },
        'Check API response structure'
      );
    }

    return result as EarningsResult;
  }

  validateAnalysis(result: unknown): AnalysisResult {
    if (result === null || typeof result !== 'object') {
      throw new YahooFinanceError(
        'Invalid analysis result: not an object',
        YF_ERR_API_CHANGED,
        null,
        false,
        false,
        { result },
        'Check API response structure'
      );
    }

    return result as AnalysisResult;
  }

  validateNews(result: unknown): NewsResult {
    if (result === null || typeof result !== 'object') {
      throw new YahooFinanceError(
        'Invalid news result: not an object',
        YF_ERR_API_CHANGED,
        null,
        false,
        false,
        { result },
        'Check API response structure'
      );
    }

    return result as NewsResult;
  }

  validateOptions(result: unknown): OptionsResult {
    if (result === null || typeof result !== 'object') {
      throw new YahooFinanceError(
        'Invalid options result: not an object',
        YF_ERR_API_CHANGED,
        null,
        false,
        false,
        { result },
        'Check API response structure'
      );
    }

    return result as OptionsResult;
  }

  validateSummaryProfile(result: unknown): SummaryProfileResult {
    if (result === null || typeof result !== 'object') {
      throw new YahooFinanceError(
        'Invalid summary profile result: not an object',
        YF_ERR_API_CHANGED,
        null,
        false,
        false,
        { result },
        'Check API response structure'
      );
    }

    return result as SummaryProfileResult;
  }

  validateCryptoQuote(result: unknown): CryptoQuoteResult {
    if (result === null || typeof result !== 'object') {
      throw new YahooFinanceError(
        'Invalid crypto quote result: not an object',
        YF_ERR_API_CHANGED,
        null,
        false,
        false,
        { result },
        'Check API response structure'
      );
    }

    return result as CryptoQuoteResult;
  }

  validateForexQuote(result: unknown): ForexQuoteResult {
    if (result === null || typeof result !== 'object') {
      throw new YahooFinanceError(
        'Invalid forex quote result: not an object',
        YF_ERR_API_CHANGED,
        null,
        false,
        false,
        { result },
        'Check API response structure'
      );
    }

    return result as ForexQuoteResult;
  }

  validateTrending(result: unknown): TrendingResult {
    if (result === null || typeof result !== 'object') {
      throw new YahooFinanceError(
        'Invalid trending result: not an object',
        YF_ERR_API_CHANGED,
        null,
        false,
        false,
        { result },
        'Check API response structure'
      );
    }

    return result as TrendingResult;
  }

  validateScreener(result: unknown): ScreenerResult {
    if (result === null || typeof result !== 'object') {
      throw new YahooFinanceError(
        'Invalid screener result: not an object',
        YF_ERR_API_CHANGED,
        null,
        false,
        false,
        { result },
        'Check API response structure'
      );
    }

    return result as ScreenerResult;
  }

  detectAPIChanges(result: unknown): boolean {
    if (result === null || typeof result !== 'object') {
      return true;
    }

    const obj = result as Record<string, unknown>;

    const knownStructures = {
      quote: ['price', 'meta'],
      historical: ['meta', 'indicators'],
      financials: ['balanceSheetHistory', 'incomeStatementHistory', 'cashflowStatementHistory']
    };

    for (const keys of Object.values(knownStructures)) {
      if (keys.some(key => key in obj)) {
        const missing = keys.filter(key => !(key in obj));
        if (missing.length > 0) {
          return true;
        }
      }
    }

    return false;
  }

  handleAPIChange(endpoint: string, result: unknown): void {
    const fallbackKey = `api_change:${endpoint}:${Date.now()}`;
    this.fallbackCache.set(fallbackKey, result);

    throw new YahooFinanceError(
      `API structure changed for endpoint: ${endpoint}`,
      YF_ERR_API_CHANGED,
      null,
      false,
      false,
      { endpoint, result, fallbackKey },
      'Update data extraction logic to match new API structure'
    );
  }

  async tryAlternativeEndpoint(symbol: string, endpoint: string): Promise<unknown> {
    const alternatives = this.alternativeEndpoints.get(endpoint);

    if (alternatives === undefined || alternatives.length === 0) {
      return null;
    }

    for (const alt of alternatives) {
      try {
        const response = await fetch(alt.url, {
          method: alt.method,
          headers: alt.headers ?? {}
        });

        if (response.ok === true) {
          const data = await response.json();
          return data;
        }
      } catch {
        continue;
      }
    }

    return null;
  }

  getFallbackData(symbol: string): unknown | null {
    const fallbackKey = `fallback:${symbol}`;
    return this.fallbackCache.get(fallbackKey) ?? null;
  }

  combineWithCache(liveData: unknown, cachedData: unknown): unknown {
    if (liveData === null && cachedData !== null) {
      return cachedData;
    }

    if (liveData !== null && cachedData === null) {
      return liveData;
    }

    if (liveData !== null && cachedData !== null && typeof liveData === 'object' && typeof cachedData === 'object') {
      const combined = { ...cachedData };

      for (const key of Object.keys(liveData)) {
        const liveValue = (liveData as Record<string, unknown>)[key];
        const cachedValue = (cachedData as Record<string, unknown>)[key];

        if (liveValue !== undefined && liveValue !== null) {
          (combined as Record<string, unknown>)[key] = liveValue;
        } else if (cachedValue !== undefined && cachedValue !== null) {
          (combined as Record<string, unknown>)[key] = cachedValue;
        }
      }

      return combined;
    }

    return liveData ?? cachedData;
  }

  private initializeAlternativeEndpoints(): void {
    const userAgent = this.config.yahooFinance.userAgent ?? 'Mozilla/5.0';

    this.alternativeEndpoints.set('quote', [
      {
        url: 'https://query1.finance.yahoo.com/v8/finance/chart/',
        method: 'GET',
        headers: {
          'User-Agent': userAgent
        }
      }
    ]);

    this.alternativeEndpoints.set('historical', [
      {
        url: 'https://query1.finance.yahoo.com/v8/finance/chart/',
        method: 'GET',
        headers: {
          'User-Agent': userAgent
        }
      }
    ]);
  }

  getStats(): {
    rateLimiter: ReturnType<RateLimiter['getStats']>;
    circuitBreaker: { state: string; failureCount: number; successCount: number };
    cache: ReturnType<Cache['getStats']>;
  } {
    const circuitBreakerState = this.circuitBreaker.getState();

    return {
      rateLimiter: this.rateLimiter.getStats(),
      circuitBreaker: {
        state: String(circuitBreakerState),
        failureCount: this.circuitBreaker.getMetrics().failureCount,
        successCount: this.circuitBreaker.getMetrics().successCount
      },
      cache: this.cache.getStats()
    };
  }

  isInitialized(): boolean {
    return this.initialized;
  }
}
