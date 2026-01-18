import type {
  QuoteResult,
  HistoricalPriceResult,
  FinancialStatementResult,
  PriceData
} from '../types/yahoo-finance.js';
import type { DataCompletionConfig } from '../types/config.js';
import { YahooFinanceError, YF_ERR_DATA_INCOMPLETE } from '../types/errors.js';

interface YahooFinanceClient {
  getQuoteSummary(symbol: string, modules: string[]): Promise<Record<string, unknown>>;
  getChart(symbol: string, interval: string, range: string): Promise<HistoricalPriceResult>;
  getQuote(symbol: string): Promise<{ quoteResponse: { result: Array<{ regularMarketPrice: number; regularMarketVolume: number; marketCap: number }> } }>;
}

interface DataQualityReporter {
  reportDataQuality(symbol: string, dataType: string, quality: 'high' | 'medium' | 'low', metadata: Record<string, unknown>): void;
  reportMissingFields(symbol: string, dataType: string, missingFields: string[]): void;
  reportAggregationSource(symbol: string, dataType: string, source: string): void;
}

type DataSource = 'primary' | 'secondary' | 'tertiary' | 'cached';

interface SourcePriority {
  sources: DataSource[];
  fallbackEnabled: boolean;
}

type SourceData = Record<string, Record<string, unknown>>;

export class DataAggregator {
  private yahooClient: YahooFinanceClient;
  private config: DataCompletionConfig;
  private qualityReporter: DataQualityReporter;
  private cache: Map<string, { data: unknown; timestamp: number }>;
  private readonly CACHE_TTL_MS = 300000;

  constructor(yahooClient: YahooFinanceClient, config: DataCompletionConfig) {
    this.yahooClient = yahooClient;
    this.config = config;
    this.qualityReporter = this.createDefaultQualityReporter();
    this.cache = new Map();
  }

  private createDefaultQualityReporter(): DataQualityReporter {
    return {
      reportDataQuality: (_symbol: string, _dataType: string, _quality: 'high' | 'medium' | 'low', _metadata: Record<string, unknown>) => {},
      reportMissingFields: (_symbol: string, _dataType: string, _missingFields: string[]) => {},
      reportAggregationSource: (_symbol: string, _dataType: string, _source: string) => {}
    };
  }

  setQualityReporter(reporter: DataQualityReporter): void {
    this.qualityReporter = reporter;
  }

  async aggregateQuoteData(symbol: string, sources: string[]): Promise<QuoteResult> {
    const priority = this.getSourcePriority(sources);
    const sourceData: SourceData = {};

    try {
      const primaryData = await this.tryPrimaryThenFallback(
        symbol,
        () => this.yahooClient.getQuoteSummary(symbol, ['defaultKeyStatistics', 'summaryDetail', 'financialData', 'price']),
        [
          () => this.yahooClient.getChart(symbol, '1d', '5d'),
          () => this.yahooClient.getQuote(symbol)
        ]
      );

      sourceData.primary = primaryData as Record<string, unknown>;
      this.qualityReporter.reportAggregationSource(symbol, 'quote', 'primary');
    } catch (error) {
      const cachedData = await this.tryCachedData(symbol);
      if (cachedData) {
        sourceData.cached = cachedData as Record<string, unknown>;
        this.qualityReporter.reportAggregationSource(symbol, 'quote', 'cached');
      } else {
        throw error;
      }
    }

    const aggregated = this.completeMissingFields(sourceData.primary || sourceData.cached || {}, sourceData);
    const quoteResult = this.transformToQuoteResult(aggregated);

    this.validateAndReportQuality(symbol, 'quote', quoteResult);

    return quoteResult;
  }

  async aggregateHistoricalData(symbol: string, sources: string[]): Promise<HistoricalPriceResult> {
    const sourceData: SourceData = {};

    try {
      const primaryData = await this.tryPrimaryThenFallback(
        symbol,
        () => this.yahooClient.getChart(symbol, '1d', '1mo'),
        [
          () => this.yahooClient.getChart(symbol, '1wk', '1mo'),
          () => this.yahooClient.getQuoteSummary(symbol, ['price'])
        ]
      );

      sourceData.primary = primaryData as Record<string, unknown>;
      this.qualityReporter.reportAggregationSource(symbol, 'historical', 'primary');
    } catch (error) {
      const cachedData = await this.tryCachedData(symbol);
      if (cachedData) {
        sourceData.cached = cachedData as Record<string, unknown>;
        this.qualityReporter.reportAggregationSource(symbol, 'historical', 'cached');
      } else {
        throw error;
      }
    }

    const aggregated = this.completeMissingFields(sourceData.primary || sourceData.cached || {}, sourceData);
    const historicalResult = aggregated as HistoricalPriceResult;

    this.validateAndReportQuality(symbol, 'historical', historicalResult);

    return historicalResult;
  }

  async aggregateFinancialData(symbol: string, sources: string[]): Promise<FinancialStatementResult> {
    const sourceData: SourceData = {};

    try {
      const primaryData = await this.tryPrimaryThenFallback(
        symbol,
        () => this.yahooClient.getQuoteSummary(symbol, ['incomeStatementHistory', 'balanceSheetHistory', 'cashflowStatementHistory']),
        [
          () => this.yahooClient.getQuoteSummary(symbol, ['incomeStatementHistoryQuarterly', 'balanceSheetHistoryQuarterly', 'cashflowStatementHistoryQuarterly']),
          () => this.yahooClient.getQuoteSummary(symbol, ['defaultKeyStatistics'])
        ]
      );

      sourceData.primary = primaryData as Record<string, unknown>;
      this.qualityReporter.reportAggregationSource(symbol, 'financial', 'primary');
    } catch (error) {
      const cachedData = await this.tryCachedData(symbol);
      if (cachedData) {
        sourceData.cached = cachedData as Record<string, unknown>;
        this.qualityReporter.reportAggregationSource(symbol, 'financial', 'cached');
      } else {
        throw error;
      }
    }

    const aggregated = this.completeMissingFields(sourceData.primary || sourceData.cached || {}, sourceData);
    const financialResult = this.transformToFinancialResult(aggregated);

    this.validateAndReportQuality(symbol, 'financial', financialResult);

    return financialResult;
  }

  completeMissingFields(data: Record<string, unknown>, sources: SourceData): Record<string, unknown> {
    if (!this.config.enabled) {
      return data;
    }

    const completed = this.fillMissingFields(data, sources);

    if (this.config.level === 'strict') {
      this.validateStrictCompletion(completed);
    }

    return completed;
  }

  verifyDataConsistency(data1: Record<string, unknown>, data2: Record<string, unknown>): boolean {
    const keys = Object.keys(data1);

    for (const key of keys) {
      const value1 = data1[key];
      const value2 = data2[key];

      if (value1 === undefined || value2 === undefined) {
        continue;
      }

      if (typeof value1 === 'number' && typeof value2 === 'number') {
        if (key.toLowerCase().includes('price')) {
          if (!this.verifyPriceData(value1, value2, 0.01)) {
            return false;
          }
        } else if (key.toLowerCase().includes('volume')) {
          if (!this.verifyVolumeData(value1, value2, 0.05)) {
            return false;
          }
        } else if (key.toLowerCase().includes('time') || key.toLowerCase().includes('date')) {
          if (!this.verifyTimestampData(value1, value2, 60000)) {
            return false;
          }
        } else {
          if (Math.abs(value1 - value2) / Math.abs(value1) > 0.01) {
            return false;
          }
        }
      } else if (value1 !== value2) {
        return false;
      }
    }

    return true;
  }

  selectBestSource(sources: SourceData, priority: string[]): Record<string, unknown> {
    for (const sourceName of priority) {
      if (sources[sourceName]) {
        return sources[sourceName];
      }
    }

    return Object.values(sources)[0] || {};
  }

  private getSourcePriority(sources: string[]): SourcePriority {
    const priority: DataSource[] = [];

    if (sources.includes('primary')) {
      priority.push('primary');
    }
    if (sources.includes('secondary')) {
      priority.push('secondary');
    }
    if (sources.includes('tertiary')) {
      priority.push('tertiary');
    }
    if (sources.includes('cached')) {
      priority.push('cached');
    }

    return {
      sources: priority.length > 0 ? priority : ['primary', 'secondary', 'tertiary', 'cached'],
      fallbackEnabled: this.config.fallbackToCache
    };
  }

  async tryPrimaryThenFallback(
    symbol: string,
    primaryFn: () => Promise<unknown>,
    fallbackFns: Array<() => Promise<unknown>>
  ): Promise<unknown> {
    try {
      return await this.tryWithRetry(symbol, primaryFn, 3);
    } catch (primaryError) {
      if (fallbackFns.length === 0) {
        throw primaryError;
      }

      for (const fallbackFn of fallbackFns) {
        try {
          return await this.tryWithRetry(symbol, fallbackFn, 2);
        } catch (fallbackError) {
          continue;
        }
      }

      throw primaryError;
    }
  }

  async tryWithRetry(symbol: string, fn: () => Promise<unknown>, maxRetries: number): Promise<unknown> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await fn();
        this.cacheResult(symbol, result);
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 1000;
          await this.sleep(delay);
        }
      }
    }

    throw lastError;
  }

  async tryCachedData(symbol: string): Promise<unknown | null> {
    if (!this.config.fallbackToCache) {
      return null;
    }

    const cached = this.cache.get(symbol);
    if (!cached) {
      return null;
    }

    const age = Date.now() - cached.timestamp;
    if (age > this.CACHE_TTL_MS) {
      this.cache.delete(symbol);
      return null;
    }

    return cached.data;
  }

  private fillMissingFields(target: Record<string, unknown>, sources: SourceData): Record<string, unknown> {
    const result = { ...target };
    const missingFields = this.identifyMissingFields(result);

    for (const field of missingFields) {
      for (const [sourceName, sourceData] of Object.entries(sources)) {
        if (sourceData[field] !== undefined && sourceData[field] !== null) {
          result[field] = sourceData[field];
          break;
        }
      }
    }

    return result;
  }

  private mergeData(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
    const result = { ...target };

    for (const [key, value] of Object.entries(source)) {
      if (target[key] === undefined || target[key] === null) {
        result[key] = value;
      }
    }

    return result;
  }

  private prioritizeFields(fields: string[], priority: string[]): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    const prioritized = [...priority].filter((p) => fields.includes(p));
    const remaining = fields.filter((f) => !priority.includes(f));

    [...prioritized, ...remaining].forEach((field) => {
      result[field] = fields.indexOf(field);
    });

    return result;
  }

  verifyPriceData(price1: number, price2: number, tolerance: number): boolean {
    const diff = Math.abs(price1 - price2);
    const avg = (Math.abs(price1) + Math.abs(price2)) / 2;
    return avg === 0 ? diff === 0 : diff / avg <= tolerance;
  }

  verifyVolumeData(volume1: number, volume2: number, tolerance: number): boolean {
    if (volume1 === 0 && volume2 === 0) {
      return true;
    }
    const diff = Math.abs(volume1 - volume2);
    const avg = (Math.abs(volume1) + Math.abs(volume2)) / 2;
    return avg === 0 ? diff === 0 : diff / avg <= tolerance;
  }

  verifyTimestampData(timestamp1: number, timestamp2: number, tolerance: number): boolean {
    return Math.abs(timestamp1 - timestamp2) <= tolerance;
  }

  private identifyMissingFields(data: Record<string, unknown>): string[] {
    const missing: string[] = [];

    for (const field of this.config.requiredFields) {
      if (data[field] === undefined || data[field] === null) {
        missing.push(field);
      }
    }

    return missing;
  }

  private validateStrictCompletion(data: Record<string, unknown>): void {
    const missingFields = this.identifyMissingFields(data);

    if (missingFields.length > 0) {
      this.qualityReporter.reportMissingFields('unknown', 'unknown', missingFields);

      if (!this.config.allowPartial) {
        throw new YahooFinanceError(
          `Required fields missing: ${missingFields.join(', ')}`,
          YF_ERR_DATA_INCOMPLETE,
          null,
          false,
          false,
          { missingFields },
          'Use a different data source or enable partial results'
        );
      }

      if (this.config.onIncomplete) {
        this.config.onIncomplete(missingFields, data);
      }
    }
  }

  private validateAndReportQuality(symbol: string, dataType: string, data: Record<string, unknown>): void {
    const quality = this.assessDataQuality(data);
    this.qualityReporter.reportDataQuality(symbol, dataType, quality, { completeness: this.calculateCompleteness(data) });
  }

  private assessDataQuality(data: Record<string, unknown>): 'high' | 'medium' | 'low' {
    const completeness = this.calculateCompleteness(data);

    if (completeness >= 0.9) {
      return 'high';
    } else if (completeness >= 0.7) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  private calculateCompleteness(data: Record<string, unknown>): number {
    if (this.config.requiredFields.length === 0) {
      return 1;
    }

    const presentFields = this.config.requiredFields.filter((field) => data[field] !== undefined && data[field] !== null);
    return presentFields.length / this.config.requiredFields.length;
  }

  private transformToQuoteResult(data: Record<string, unknown>): QuoteResult {
    const priceData: PriceData = {
      regularMarketPrice: this.extractNumber(data, 'regularMarketPrice'),
      regularMarketChange: this.extractNumber(data, 'regularMarketChange'),
      regularMarketChangePercent: this.extractNumber(data, 'regularMarketChangePercent'),
      regularMarketPreviousClose: this.extractNumber(data, 'regularMarketPreviousClose'),
      regularMarketOpen: this.extractNumber(data, 'regularMarketOpen'),
      regularMarketDayHigh: this.extractNumber(data, 'regularMarketDayHigh'),
      regularMarketDayLow: this.extractNumber(data, 'regularMarketDayLow'),
      regularMarketVolume: this.extractNumber(data, 'regularMarketVolume'),
      marketCap: this.extractNumber(data, 'marketCap'),
      fiftyTwoWeekHigh: this.extractNumber(data, 'fiftyTwoWeekHigh'),
      fiftyTwoWeekLow: this.extractNumber(data, 'fiftyTwoWeekLow'),
      averageDailyVolume3Month: this.extractNumber(data, 'averageDailyVolume3Month'),
      averageDailyVolume10Day: this.extractNumber(data, 'averageDailyVolume10Day'),
      currency: this.extractString(data, 'currency'),
      marketState: this.extractString(data, 'marketState'),
      quoteType: this.extractString(data, 'quoteType'),
      symbol: this.extractString(data, 'symbol') || '',
      shortName: this.extractString(data, 'shortName'),
      longName: this.extractString(data, 'longName'),
      exchange: this.extractString(data, 'exchange'),
      exchangeTimezoneName: this.extractString(data, 'exchangeTimezoneName'),
      exchangeTimezoneShortName: this.extractString(data, 'exchangeTimezoneShortName'),
      gmtOffSetMilliseconds: this.extractNumber(data, 'gmtOffSetMilliseconds'),
      preMarketPrice: this.extractNumber(data, 'preMarketPrice'),
      preMarketChange: this.extractNumber(data, 'preMarketChange'),
      preMarketChangePercent: this.extractNumber(data, 'preMarketChangePercent'),
      preMarketTime: this.extractNumber(data, 'preMarketTime'),
      postMarketPrice: this.extractNumber(data, 'postMarketPrice'),
      postMarketChange: this.extractNumber(data, 'postMarketChange'),
      postMarketChangePercent: this.extractNumber(data, 'postMarketChangePercent'),
      postMarketTime: this.extractNumber(data, 'postMarketTime')
    };

    return {
      price: priceData
    };
  }

  private transformToFinancialResult(data: Record<string, unknown>): FinancialStatementResult {
    return {
      incomeStatementHistory: {
        maxAge: 0,
        quarterly: [],
        annual: []
      },
      balanceSheetHistory: {
        maxAge: 0,
        quarterly: [],
        annual: []
      },
      cashflowStatementHistory: {
        maxAge: 0,
        quarterly: [],
        annual: []
      },
      incomeStatementHistoryQuarterly: {
        maxAge: 0,
        quarterly: [],
        annual: []
      },
      balanceSheetHistoryQuarterly: {
        maxAge: 0,
        quarterly: [],
        annual: []
      },
      cashflowStatementHistoryQuarterly: {
        maxAge: 0,
        quarterly: [],
        annual: []
      }
    };
  }

  private extractNumber(data: Record<string, unknown>, key: string): number | null {
    const value = data[key];
    if (typeof value === 'number') {
      return value;
    }
    if (typeof value === 'string') {
      const parsed = parseFloat(value);
      return isNaN(parsed) ? null : parsed;
    }
    if (typeof value === 'object' && value !== null && 'raw' in value) {
      const raw = (value as { raw: unknown }).raw;
      return typeof raw === 'number' ? raw : null;
    }
    return null;
  }

  private extractString(data: Record<string, unknown>, key: string): string | null {
    const value = data[key];
    if (typeof value === 'string') {
      return value;
    }
    return null;
  }

  private cacheResult(symbol: string, data: unknown): void {
    this.cache.set(symbol, {
      data,
      timestamp: Date.now()
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  clearCache(): void {
    this.cache.clear();
  }

  getCacheSize(): number {
    return this.cache.size;
  }

  getCacheEntries(): Array<{ symbol: string; timestamp: number }> {
    return Array.from(this.cache.entries()).map(([symbol, entry]) => ({
      symbol,
      timestamp: entry.timestamp
    }));
  }
}
