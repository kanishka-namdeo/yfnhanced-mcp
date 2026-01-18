import { z } from 'zod';
import type { QuoteResult, PriceData } from '../types/yahoo-finance.js';
import { YahooFinanceClient } from '../services/yahoo-finance.js';
import { DataQualityReporter } from '../utils/data-completion.js';
import { YahooFinanceError, YF_ERR_RATE_LIMIT } from '../types/errors.js';

const BATCH_SIZE = 10;
const DELAYED_DATA_THRESHOLD_MS = 15 * 60 * 1000;
const REALTIME_DATA_THRESHOLD_MS = 5 * 60 * 1000;

export const GetQuoteInputSchema = z.object({
  symbols: z.array(z.string().min(1).max(10)).min(1).max(100),
  fields: z.array(z.string()).optional(),
  forceRefresh: z.boolean().optional(),
  timeout: z.number().int().min(100).max(60000).optional()
});

export type GetQuoteInput = z.infer<typeof GetQuoteInputSchema>;

export const QuoteResultDataSchema = z.object({
  regularMarketPrice: z.number().optional(),
  regularMarketChange: z.number().optional(),
  regularMarketChangePercent: z.number().optional(),
  regularMarketPreviousClose: z.number().optional(),
  regularMarketOpen: z.number().optional(),
  regularMarketDayRange: z.object({
    low: z.number(),
    high: z.number()
  }).optional(),
  fiftyTwoWeekRange: z.object({
    low: z.number(),
    high: z.number()
  }).optional(),
  regularMarketVolume: z.number().int().nonnegative().optional(),
  averageVolume: z.number().int().nonnegative().optional(),
  averageVolume10days: z.number().int().nonnegative().optional(),
  marketCap: z.number().nonnegative().optional(),
  trailingPE: z.number().optional(),
  forwardPE: z.number().optional(),
  trailingEPS: z.number().optional(),
  forwardEPS: z.number().optional(),
  dividendRate: z.number().nonnegative().optional(),
  dividendYield: z.number().nonnegative().optional(),
  exDividendDate: z.string().optional(),
  beta: z.number().optional(),
  sharesOutstanding: z.number().int().nonnegative().optional(),
  averageTrueRange: z.number().nonnegative().optional()
});

export const QuoteMetaSchema = z.object({
  fromCache: z.boolean(),
  dataAge: z.number().nonnegative(),
  completenessScore: z.number().min(0).max(1),
  warnings: z.array(z.string())
});

export type QuoteMeta = z.infer<typeof QuoteMetaSchema>;

export const QuoteResultSchema = z.object({
  data: QuoteResultDataSchema,
  meta: QuoteMetaSchema
});

export type QuoteResultData = z.infer<typeof QuoteResultSchema>;

export const GetQuoteOutputSchema = z.object({
  results: z.record(z.string(), QuoteResultSchema),
  summary: z.object({
    totalRequested: z.number().int().nonnegative(),
    totalReturned: z.number().int().nonnegative(),
    fromCache: z.number().int().nonnegative(),
    rateLimited: z.boolean(),
    errors: z.array(z.object({
      symbol: z.string(),
      error: z.string()
    }))
  })
});

export type GetQuoteOutput = z.infer<typeof GetQuoteOutputSchema>;

export const GetQuoteSummaryInputSchema = z.object({
  symbol: z.string().min(1),
  modules: z.array(z.string()).optional(),
  retryOnFailure: z.boolean().optional()
});

export type GetQuoteSummaryInput = z.infer<typeof GetQuoteSummaryInputSchema>;

export const GetQuoteSummaryOutputSchema = z.object({
  symbol: z.string(),
  modules: z.array(z.string()),
  completenessPercentage: z.number().min(0).max(100),
  missingFields: z.array(z.string()),
  data: z.record(z.string(), z.unknown()),
  metadata: z.object({
    lastSuccessfulUpdate: z.number().nullable(),
    dataAge: z.number().nonnegative(),
    sourceReliability: z.enum(['high', 'medium', 'low']),
    warnings: z.array(z.string()),
    recommendation: z.string()
  }),
  alternativeModules: z.array(z.object({
    modules: z.array(z.string()),
    success: z.boolean(),
    fieldsProvided: z.array(z.string())
  })).optional()
});

export type GetQuoteSummaryOutput = z.infer<typeof GetQuoteSummaryOutputSchema>;

export class QuoteTools {
  private yahooClient: YahooFinanceClient;
  private qualityReporter: DataQualityReporter;

  constructor(yahooClient: YahooFinanceClient, qualityReporter: DataQualityReporter) {
    this.yahooClient = yahooClient;
    this.qualityReporter = qualityReporter;
  }

  async getQuote(input: GetQuoteInput): Promise<GetQuoteOutput> {
    const { symbols, fields, forceRefresh = false, timeout } = input;
    const results: Record<string, QuoteResultData> = {};
    const errors: Array<{ symbol: string; error: string }> = [];
    let fromCacheCount = 0;
    let rateLimited = false;

    const batches = this.createBatches(symbols, BATCH_SIZE);

    for (const batch of batches) {
      const batchResults = await this.processBatch(batch, fields, forceRefresh, timeout);

      for (const [symbol, result] of Object.entries(batchResults)) {
        if ('error' in result) {
          errors.push({ symbol, error: result.error });
        } else {
          results[symbol] = result;
          if (results[symbol].meta.fromCache === true) {
            fromCacheCount++;
          }
        }
      }

      if (this.isRateLimited(batchResults)) {
        rateLimited = true;
      }

      if (batches.indexOf(batch) < batches.length - 1) {
        await this.delay(200);
      }
    }

    return {
      results,
      summary: {
        totalRequested: symbols.length,
        totalReturned: Object.keys(results).length,
        fromCache: fromCacheCount,
        rateLimited,
        errors
      }
    };
  }

  private async processBatch(
    symbols: string[],
    fields?: string[],
    forceRefresh?: boolean,
    timeout?: number
  ): Promise<Record<string, { error: string } | QuoteResultData>> {
    const batchResults: Record<string, { error: string } | QuoteResultData> = {};

    for (const symbol of symbols) {
      try {
        const result = await this.fetchSingleQuote(symbol, fields, forceRefresh, timeout);
        batchResults[symbol] = result;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        batchResults[symbol] = { error: errorMessage };
      }
    }

    return batchResults;
  }

  private async fetchSingleQuote(
    symbol: string,
    fields?: string[],
    forceRefresh?: boolean,
    timeout?: number
  ): Promise<QuoteResultData> {
    const cacheKey = `quote:${symbol}`;
    const options: { fields?: string[]; forceRefresh?: boolean; timeout?: number; useCache?: boolean } = {
      fields,
      forceRefresh,
      timeout,
      useCache: !forceRefresh
    };

    let quoteResult: QuoteResult;
    let fromCache = false;

    try {
      quoteResult = await this.yahooClient.getQuote(symbol, options);
    } catch (error) {
      if (error instanceof YahooFinanceError && error.isRateLimit === true) {
        const cachedResult = await this.getFromCache<QuoteResult>(cacheKey);
        if (cachedResult !== null) {
          quoteResult = cachedResult;
          fromCache = true;
        } else {
          throw error;
        }
      } else {
        throw error;
      }
    }

    const dataAge = this.extractDataAge(quoteResult);
    const flatData = this.flattenQuoteData(quoteResult);
    const completenessScore = this.qualityReporter.calculateCompleteness(flatData) / 100;
    const warnings = this.generateQualityWarnings(quoteResult, dataAge, completenessScore);

    const filteredData = fields ? this.filterFields(flatData, fields) : flatData;

    const data = {
      regularMarketPrice: this.extractNumber(filteredData, 'regularMarketPrice'),
      regularMarketChange: this.extractNumber(filteredData, 'regularMarketChange'),
      regularMarketChangePercent: this.extractNumber(filteredData, 'regularMarketChangePercent'),
      regularMarketPreviousClose: this.extractNumber(filteredData, 'regularMarketPreviousClose'),
      regularMarketOpen: this.extractNumber(filteredData, 'regularMarketOpen'),
      regularMarketDayRange: this.extractDayRange(filteredData),
      fiftyTwoWeekRange: this.extractFiftyTwoWeekRange(filteredData),
      regularMarketVolume: this.extractNumber(filteredData, 'regularMarketVolume'),
      averageVolume: this.extractNumber(filteredData, 'averageDailyVolume3Month'),
      averageVolume10days: this.extractNumber(filteredData, 'averageDailyVolume10Day'),
      marketCap: this.extractNumber(filteredData, 'marketCap'),
      trailingPE: this.extractNumber(filteredData, 'trailingPE'),
      forwardPE: this.extractNumber(filteredData, 'forwardPE'),
      trailingEPS: this.extractNumber(filteredData, 'trailingEps'),
      forwardEPS: this.extractNumber(filteredData, 'forwardEps'),
      dividendRate: this.extractNumber(filteredData, 'dividendRate'),
      dividendYield: this.extractNumber(filteredData, 'dividendYield'),
      exDividendDate: this.extractString(filteredData, 'exDividendDate'),
      beta: this.extractNumber(filteredData, 'beta'),
      sharesOutstanding: this.extractNumber(filteredData, 'sharesOutstanding'),
      averageTrueRange: this.extractNumber(filteredData, 'averageTrueRange')
    };

    return {
      data,
      meta: {
        fromCache,
        dataAge,
        completenessScore,
        warnings
      }
    };
  }

  async getQuoteSummary(input: GetQuoteSummaryInput): Promise<GetQuoteSummaryOutput> {
    const { symbol, modules, retryOnFailure = false } = input;
    const defaultModules = ['defaultKeyStatistics', 'summaryDetail', 'financialData', 'price'];
    const requestedModules = modules ?? defaultModules;

    let data: Record<string, unknown> = {};
    let success = false;
    let lastSuccessfulUpdate: number | null = null;
    const alternativeModules: Array<{ modules: string[]; success: boolean; fieldsProvided: string[] }> = [];

    try {
      data = await this.fetchQuoteSummary(symbol, requestedModules);
      success = true;
      lastSuccessfulUpdate = Date.now();
    } catch (error) {
      if (retryOnFailure === true) {
        const alternatives = this.getAlternativeModuleCombinations(requestedModules);

        for (const altModules of alternatives) {
          try {
            const altData = await this.fetchQuoteSummary(symbol, altModules);
            if (!success) {
              data = altData;
              success = true;
              lastSuccessfulUpdate = Date.now();
            }
            alternativeModules.push({
              modules: altModules,
              success: true,
              fieldsProvided: Object.keys(altData)
            });
          } catch {
            alternativeModules.push({
              modules: altModules,
              success: false,
              fieldsProvided: []
            });
          }
        }
      }

      if (!success) {
        throw error;
      }
    }

    const flatData = this.flattenSummaryData(data);
    const completenessScore = this.qualityReporter.calculateCompleteness(flatData);
    const completenessPercentage = Math.round(completenessScore);
    const missingFields = this.identifyMissingFields(flatData);
    const dataAge = this.calculateDataAge(flatData);

    const qualityReport = this.qualityReporter.generateQualityReport(
      flatData,
      Object.keys(flatData),
      lastSuccessfulUpdate ?? undefined
    );

    return {
      symbol,
      modules: requestedModules,
      completenessPercentage,
      missingFields,
      data: flatData,
      metadata: {
        lastSuccessfulUpdate,
        dataAge,
        sourceReliability: qualityReport.sourceReliability,
        warnings: qualityReport.warnings,
        recommendation: qualityReport.recommendation
      },
      alternativeModules: alternativeModules.length > 0 ? alternativeModules : undefined
    };
  }

  private async fetchQuoteSummary(symbol: string, modules: string[]): Promise<Record<string, unknown>> {
    try {
      const result = await this.yahooClient.getSummaryProfile(symbol, { validate: true });
      return this.extractSummaryModules(result, modules);
    } catch {
      const quote = await this.yahooClient.getQuote(symbol);
      return this.convertQuoteToSummary(quote);
    }
  }

  private extractSummaryModules(result: unknown, modules: string[]): Record<string, unknown> {
    const data: Record<string, unknown> = {};

    if (result === null || typeof result !== 'object') {
      return data;
    }

    const obj = result as Record<string, unknown>;

    for (const module of modules) {
      if (module in obj) {
        data[module] = obj[module];
      }
    }

    return data;
  }

  private convertQuoteToSummary(quote: QuoteResult): Record<string, unknown> {
    const data: Record<string, unknown> = {};
    const price = quote.price ?? {};

    const fieldMappings: Record<string, string> = {
      regularMarketPrice: 'regularMarketPrice',
      marketCap: 'marketCap',
      regularMarketVolume: 'regularMarketVolume',
      fiftyTwoWeekHigh: 'fiftyTwoWeekHigh',
      fiftyTwoWeekLow: 'fiftyTwoWeekLow',
      averageDailyVolume3Month: 'averageDailyVolume3Month',
      averageDailyVolume10Day: 'averageDailyVolume10Day',
      beta: 'beta'
    };

    for (const [targetField, sourceField] of Object.entries(fieldMappings)) {
      const value = price[sourceField as keyof PriceData];
      if (value !== null && value !== undefined) {
        data[targetField] = value;
      }
    }

    return data;
  }

  private getAlternativeModuleCombinations(modules: string[]): string[][] {
    const alternatives: string[][] = [];
    const essentialModules = ['summaryDetail', 'defaultKeyStatistics'];
    
    alternatives.push(essentialModules);
    
    for (const module of modules) {
      if (!essentialModules.includes(module)) {
        alternatives.push([module]);
      }
    }

    alternatives.push(['price', 'summaryDetail']);
    alternatives.push(['financialData', 'defaultKeyStatistics']);

    return alternatives;
  }

  private flattenQuoteData(quote: QuoteResult): Record<string, unknown> {
    const flat: Record<string, unknown> = {};
    const price = quote.price ?? {};

    for (const [key, value] of Object.entries(price)) {
      flat[key] = value;
    }

    if (quote.meta) {
      flat['currency'] = quote.meta.currency;
      flat['exchangeName'] = quote.meta.exchangeName;
      flat['instrumentType'] = quote.meta.instrumentType;
      flat['regularMarketTime'] = quote.meta.regularMarketTime;
      flat['timezone'] = quote.meta.timezone;
    }

    return flat;
  }

  private flattenSummaryData(data: Record<string, unknown>): Record<string, unknown> {
    const flat: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(data)) {
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        const nested = value as Record<string, unknown>;
        for (const [nestedKey, nestedValue] of Object.entries(nested)) {
          flat[`${key}.${nestedKey}`] = nestedValue;
        }
      } else {
        flat[key] = value;
      }
    }

    return flat;
  }

  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  private isRateLimited(results: Record<string, unknown>): boolean {
    return Object.values(results).some((result) => {
      if (typeof result === 'object' && result !== null && 'error' in result) {
        const error = (result as { error: string }).error;
        return error.includes(YF_ERR_RATE_LIMIT) || error.includes('rate limit');
      }
      return false;
    });
  }

  private extractDataAge(quote: QuoteResult): number {
    const timestamp = quote.meta?.regularMarketTime;
    if (timestamp !== undefined && timestamp > 0) {
      return Date.now() - timestamp;
    }
    return 0;
  }

  private generateQualityWarnings(quote: QuoteResult, dataAge: number, completenessScore: number): string[] {
    const warnings: string[] = [];

    if (dataAge > DELAYED_DATA_THRESHOLD_MS) {
      warnings.push('Data is delayed (15+ minutes)');
    } else if (dataAge > REALTIME_DATA_THRESHOLD_MS) {
      warnings.push('Data may not be real-time (5+ minutes old)');
    }

    if (completenessScore < 0.5) {
      warnings.push('Low data completeness (<50%)');
    } else if (completenessScore < 0.8) {
      warnings.push('Partial data available (<80% completeness)');
    }

    const price = quote.price;
    if (price) {
      if (price.regularMarketPrice === null || price.regularMarketPrice === undefined) {
        warnings.push('Missing current price');
      }
      if (price.regularMarketVolume === null || price.regularMarketVolume === undefined) {
        warnings.push('Missing volume data');
      }
    }

    return warnings;
  }

  private filterFields(data: Record<string, unknown>, fields: string[]): Record<string, unknown> {
    const filtered: Record<string, unknown> = {};
    for (const field of fields) {
      if (field in data) {
        filtered[field] = data[field];
      }
    }
    return filtered;
  }

  private extractNumber(data: Record<string, unknown>, key: string): number | undefined {
    const value = data[key];
    if (typeof value === 'number') {
      return value;
    }
    if (typeof value === 'object' && value !== null) {
      const obj = value as Record<string, unknown>;
      if ('raw' in obj && typeof obj.raw === 'number') {
        return obj.raw;
      }
    }
    return undefined;
  }

  private extractString(data: Record<string, unknown>, key: string): string | undefined {
    const value = data[key];
    if (typeof value === 'string') {
      return value;
    }
    return undefined;
  }

  private extractDayRange(data: Record<string, unknown>): { low: number; high: number } | undefined {
    const low = this.extractNumber(data, 'regularMarketDayLow');
    const high = this.extractNumber(data, 'regularMarketDayHigh');
    
    if (low !== undefined && high !== undefined) {
      return { low, high };
    }
    return undefined;
  }

  private extractFiftyTwoWeekRange(data: Record<string, unknown>): { low: number; high: number } | undefined {
    const low = this.extractNumber(data, 'fiftyTwoWeekLow');
    const high = this.extractNumber(data, 'fiftyTwoWeekHigh');
    
    if (low !== undefined && high !== undefined) {
      return { low, high };
    }
    return undefined;
  }

  private async getFromCache<T>(key: string): Promise<T | null> {
    const cache = this.yahooClient as unknown as { cache?: { get<T>(key: string): T | null } };
    if (cache.cache && typeof cache.cache.get === 'function') {
      return cache.cache.get<T>(key);
    }
    return null;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private identifyMissingFields(data: Record<string, unknown>): string[] {
    const expectedFields = [
      'regularMarketPrice',
      'regularMarketChange',
      'regularMarketChangePercent',
      'regularMarketVolume',
      'marketCap'
    ];
    
    return expectedFields.filter((field) => {
      const value = data[field];
      return value === null || value === undefined;
    });
  }

  private calculateDataAge(data: Record<string, unknown>): number {
    const timestamp = this.extractNumber(data, 'regularMarketTime');
    if (timestamp !== undefined && timestamp > 0) {
      return Date.now() - timestamp;
    }
    return 0;
  }
}
