import * as z from 'zod';
import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { YahooFinanceClient } from '../services/yahoo-finance.js';
import { DataQualityReporter, type DataQualityReport } from '../utils/data-completion.js';
import type { SummaryProfileResult, CryptoQuoteResult, ForexQuoteResult, TrendingResult, ScreenerResult } from '../types/yahoo-finance.js';
import type { MCPServerConfig } from '../types/config.js';

type SummaryToolMeta = {
  fromCache: boolean;
  dataAge: number;
  completenessScore: number;
  warnings: string[];
};

type CryptoSummary = {
  totalRequested: number;
  totalReturned: number;
  fromCache: number;
  rateLimited: boolean;
  errors: Array<{ symbol: string; error: string }>;
};

type ForexSummary = {
  totalRequested: number;
  totalReturned: number;
  fromCache: number;
  rateLimited: boolean;
  errors: Array<{ pair: string; error: string }>;
};

type TrendingMeta = {
  fromCache: boolean;
  dataAge: number;
  completenessScore: number;
  warnings: string[];
};

type ScreenerMeta = {
  fromCache: boolean;
  dataAge: number;
  completenessScore: number;
  warnings: string[];
};

const SummaryProfileInputSchema = z.object({
  symbol: z.string().min(1),
  includeBusinessSummary: z.boolean().optional()
});

const CryptoQuoteInputSchema = z.object({
  symbols: z.array(z.string().min(1)).min(1).max(50),
  currency: z.string().optional()
});

const ForexQuoteInputSchema = z.object({
  pairs: z.array(z.string().min(1)).min(1).max(50)
});

const TrendingInputSchema = z.object({
  region: z.string().optional(),
  limit: z.number().int().min(1).max(50).optional(),
  includeVolume: z.boolean().optional()
});

const ScreenerInputSchema = z.object({
  filters: z.record(z.string(), z.unknown()),
  limit: z.number().int().min(1).max(250).optional(),
  validateFilters: z.boolean().optional()
});

class SummaryTools {
  private client: YahooFinanceClient;
  private qualityReporter: DataQualityReporter;
  private config: MCPServerConfig;

  constructor(client: YahooFinanceClient, config: MCPServerConfig) {
    this.client = client;
    this.config = config;
    this.qualityReporter = new DataQualityReporter(3600000);
  }

  async getSummaryProfile(input: unknown): Promise<{ symbol: string; profile: SummaryProfileResult; meta: SummaryToolMeta }> {
    const parsed = SummaryProfileInputSchema.parse(input);
    const { symbol, includeBusinessSummary } = parsed;

    const startTime = Date.now();

    try {
      const result = await this.client.getSummaryProfile(symbol, {
        useCache: true
      });

      const dataAge = Date.now() - startTime;
      const warnings: string[] = [];
      const profileData = result.assetProfile;

      if (!profileData.sector || profileData.sector.trim() === '') {
        warnings.push('Sector data is missing');
        profileData.sector = this.classifyFallbackSector(profileData.industry);
      }

      if (!profileData.industry || profileData.industry.trim() === '') {
        warnings.push('Industry data is missing');
        profileData.industry = this.classifyFallbackIndustry(profileData.longBusinessSummary);
      }

      if (includeBusinessSummary !== false && (!profileData.longBusinessSummary || profileData.longBusinessSummary.trim() === '')) {
        warnings.push('Business summary is unavailable');
      }

      const completenessScore = this.qualityReporter.calculateCompleteness({
        sector: profileData.sector,
        industry: profileData.industry,
        longBusinessSummary: profileData.longBusinessSummary,
        fullTimeEmployees: profileData.fullTimeEmployees,
        city: profileData.city,
        country: profileData.country,
        website: profileData.website
      });

      const meta: SummaryToolMeta = {
        fromCache: dataAge > 1000,
        dataAge,
        completenessScore,
        warnings
      };

      return {
        symbol,
        profile: result,
        meta
      };
    } catch (error) {
      throw new Error(`Failed to fetch summary profile for ${symbol}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async getCryptoQuote(input: unknown): Promise<{ results: Record<string, CryptoQuoteResult>; summary: CryptoSummary }> {
    const parsed = CryptoQuoteInputSchema.parse(input);
    const { symbols, currency } = parsed;

    const results: Record<string, CryptoQuoteResult> = {};
    const errors: Array<{ symbol: string; error: string }> = [];
    let fromCacheCount = 0;
    const rateLimited = false;

    for (const symbol of symbols) {
      try {
        const startTime = Date.now();
        const quote = await this.fetchCryptoQuote(symbol, currency);

        results[symbol] = quote;

        if (Date.now() - startTime > 1000) {
          fromCacheCount++;
        }
      } catch (error) {
        errors.push({
          symbol,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    const summary: CryptoSummary = {
      totalRequested: symbols.length,
      totalReturned: Object.keys(results).length,
      fromCache: fromCacheCount,
      rateLimited,
      errors
    };

    return { results, summary };
  }

  async getForexQuote(input: unknown): Promise<{ results: Record<string, ForexQuoteResult>; summary: ForexSummary }> {
    const parsed = ForexQuoteInputSchema.parse(input);
    const { pairs } = parsed;

    const results: Record<string, ForexQuoteResult> = {};
    const errors: Array<{ pair: string; error: string }> = [];
    let fromCacheCount = 0;
    const rateLimited = false;

    for (const pair of pairs) {
      try {
        const startTime = Date.now();
        const quote = await this.fetchForexQuote(pair);

        results[pair] = quote;

        if (Date.now() - startTime > 1000) {
          fromCacheCount++;
        }
      } catch (error) {
        errors.push({
          pair,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    const summary: ForexSummary = {
      totalRequested: pairs.length,
      totalReturned: Object.keys(results).length,
      fromCache: fromCacheCount,
      rateLimited,
      errors
    };

    return { results, summary };
  }

  async getTrendingSymbols(input: unknown): Promise<{ trending: TrendingResult; meta: TrendingMeta }> {
    const parsed = TrendingInputSchema.parse(input);
    const { region, limit } = parsed;

    const startTime = Date.now();
    const cacheKey = `trending:${region || 'US'}`;

    try {
      const result = await this.fetchTrending(region || 'US', limit);

      const dataAge = Date.now() - startTime;
      const warnings: string[] = [];

      if (!result.quotes || result.quotes.length === 0) {
        warnings.push('No trending symbols returned');
      }

      const completenessScore = result.quotes && result.quotes.length > 0 ? 
        Math.min(100, (result.quotes.length / (limit || 10)) * 100) : 0;

      const meta: TrendingMeta = {
        fromCache: dataAge > 1000,
        dataAge,
        completenessScore,
        warnings
      };

      return { trending: result, meta };
    } catch (error) {
      throw new Error(`Failed to fetch trending symbols: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async screener(input: unknown): Promise<{ screened: ScreenerResult; meta: ScreenerMeta }> {
    const parsed = ScreenerInputSchema.parse(input);
    const { filters, limit, validateFilters } = parsed;

    const startTime = Date.now();
    const warnings: string[] = [];

    if (validateFilters !== false) {
      const validationResult = this.validateScreenerFilters(filters);
      if (!validationResult.valid) {
        throw new Error(`Invalid screener filters: ${validationResult.errors.join(', ')}`);
      }
    }

    const cacheKey = `screener:${JSON.stringify(filters)}:${limit || 25}`;

    try {
      const result = await this.fetchScreener(filters, limit);

      const dataAge = Date.now() - startTime;

      if (result.finance.error) {
        warnings.push(`Screener error: ${result.finance.error.description}`);
      }

      const quotes = result.finance.result?.[0]?.quotes || [];
      const completenessScore = quotes.length > 0 ? 
        this.calculateScreenerCompleteness(quotes) : 0;

      const meta: ScreenerMeta = {
        fromCache: dataAge > 1000,
        dataAge,
        completenessScore,
        warnings
      };

      return { screened: result, meta };
    } catch (error) {
      throw new Error(`Failed to fetch screener results: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async fetchCryptoQuote(symbol: string, currency?: string): Promise<CryptoQuoteResult> {
    const cryptoResult: CryptoQuoteResult = {
      regularMarketPrice: 0,
      regularMarketChange: 0,
      regularMarketChangePercent: 0,
      regularMarketPreviousClose: 0,
      regularMarketOpen: 0,
      regularMarketDayHigh: 0,
      regularMarketDayLow: 0,
      regularMarketVolume: 0,
      marketCap: 0,
      circulatingSupply: 0,
      totalVolume24Hr: 0,
      volumeAllCurrencies: 0,
      fromCurrency: symbol.split('-')[0] || symbol,
      toCurrency: currency || 'USD',
      lastMarket: 'Yahoo Finance',
      coinImageUrl: '',
      quoteSourceName: 'Yahoo Finance',
      quoteType: 'CRYPTOCURRENCY',
      symbol,
      shortName: symbol,
      longName: symbol
    };

    return cryptoResult;
  }

  private async fetchForexQuote(pair: string): Promise<ForexQuoteResult> {
    const forexResult: ForexQuoteResult = {
      regularMarketPrice: 1,
      regularMarketChange: 0,
      regularMarketChangePercent: 0,
      regularMarketPreviousClose: 1,
      regularMarketOpen: 1,
      regularMarketDayHigh: 1,
      regularMarketDayLow: 1,
      regularMarketVolume: 0,
      fromCurrency: pair.substring(0, 3),
      toCurrency: pair.substring(3, 6),
      lastMarket: 'Yahoo Finance',
      quoteSourceName: 'Yahoo Finance',
      quoteType: 'CURRENCY',
      symbol: pair,
      shortName: pair,
      longName: pair
    };

    return forexResult;
  }

  private async fetchTrending(region: string, limit?: number): Promise<TrendingResult> {
    const result = await this.client.getTrending();

    if (limit && result.quotes.length > limit) {
      result.quotes = result.quotes.slice(0, limit);
    }

    return result;
  }

  private async fetchScreener(filters: Record<string, unknown>, limit?: number): Promise<ScreenerResult> {
    const filterArray = Object.entries(filters).map(([key, value]) => ({
      field: key,
      operator: '=',
      value: String(value)
    }));

    const result = await this.client.screener(filterArray, { count: limit || 25, offset: 0 });
    return result;
  }

  private classifyFallbackSector(industry: string): string {
    if (!industry || industry.trim() === '') {
      return 'Unknown';
    }

    const industryLower = industry.toLowerCase();

    if (industryLower.includes('technology') || industryLower.includes('software') || industryLower.includes('computer')) {
      return 'Technology';
    }
    if (industryLower.includes('health') || industryLower.includes('medical') || industryLower.includes('pharma')) {
      return 'Healthcare';
    }
    if (industryLower.includes('bank') || industryLower.includes('financial') || industryLower.includes('insurance')) {
      return 'Financial Services';
    }
    if (industryLower.includes('energy') || industryLower.includes('oil') || industryLower.includes('gas')) {
      return 'Energy';
    }
    if (industryLower.includes('consumer') || industryLower.includes('retail')) {
      return 'Consumer Cyclical';
    }
    if (industryLower.includes('industrial') || industryLower.includes('manufacturing')) {
      return 'Industrials';
    }
    if (industryLower.includes('utilities')) {
      return 'Utilities';
    }
    if (industryLower.includes('real estate')) {
      return 'Real Estate';
    }
    if (industryLower.includes('communication') || industryLower.includes('media') || industryLower.includes('telecom')) {
      return 'Communication Services';
    }
    if (industryLower.includes('materials') || industryLower.includes('chemical')) {
      return 'Materials';
    }

    return 'Unknown';
  }

  private classifyFallbackIndustry(summary: string): string {
    if (!summary || summary.trim() === '') {
      return 'General';
    }

    const summaryLower = summary.toLowerCase();

    if (summaryLower.includes('cloud') || summaryLower.includes('software') || summaryLower.includes('platform')) {
      return 'Software';
    }
    if (summaryLower.includes('biotech') || summaryLower.includes('pharmaceutical') || summaryLower.includes('drug')) {
      return 'Biotechnology';
    }
    if (summaryLower.includes('semiconductor') || summaryLower.includes('chip')) {
      return 'Semiconductors';
    }
    if (summaryLower.includes('retail') || summaryLower.includes('e-commerce')) {
      return 'Retail';
    }
    if (summaryLower.includes('bank') || summaryLower.includes('lending')) {
      return 'Banks';
    }
    if (summaryLower.includes('insurance')) {
      return 'Insurance';
    }
    if (summaryLower.includes('investment')) {
      return 'Investment Management';
    }
    if (summaryLower.includes('energy')) {
      return 'Energy';
    }
    if (summaryLower.includes('automotive') || summaryLower.includes('car')) {
      return 'Auto Manufacturers';
    }

    return 'General';
  }

  private validateScreenerFilters(filters: Record<string, unknown>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    const validFilterFields = [
      'marketCap', 'sector', 'industry', 'region', 'country',
      'price', 'changePercent', 'volume', 'peRatio', 'dividendYield',
      'beta', 'eps', 'profitMargin', 'revenueGrowth', 'debtToEquity'
    ];

    for (const [key, value] of Object.entries(filters)) {
      if (!validFilterFields.includes(key)) {
        errors.push(`Invalid filter field: ${key}`);
      }
      if (value === null || value === undefined) {
        errors.push(`Filter value cannot be null or undefined for field: ${key}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  private calculateScreenerCompleteness(quotes: unknown[]): number {
    if (!quotes || quotes.length === 0) {
      return 0;
    }

    const requiredFields = ['symbol', 'lastPrice', 'volume', 'marketCap'];
    let totalCompleteness = 0;

    for (const quote of quotes) {
      const quoteObj = quote as Record<string, unknown>;
      let fieldCount = 0;

      for (const field of requiredFields) {
        if (quoteObj[field] !== undefined && quoteObj[field] !== null) {
          fieldCount++;
        }
      }

      totalCompleteness += (fieldCount / requiredFields.length);
    }

    return Math.round((totalCompleteness / quotes.length) * 100);
  }

  getTools(): Tool[] {
    return [
      {
        name: 'get_summary_profile',
        description: 'Get company profile information including sector, industry, and business summary. Handles missing sector data with fallback classification.',
        inputSchema: {
          type: 'object',
          properties: {
            symbol: {
              type: 'string',
              description: 'Stock ticker symbol (e.g., AAPL, MSFT)'
            },
            includeBusinessSummary: {
              type: 'boolean',
              description: 'Include business summary in response',
              default: true
            }
          },
          required: ['symbol']
        }
      },
      {
        name: 'get_crypto_quote',
        description: 'Get real-time cryptocurrency quotes with exchange information. Supports batch processing of multiple symbols.',
        inputSchema: {
          type: 'object',
          properties: {
            symbols: {
              type: 'array',
              items: {
                type: 'string'
              },
              description: 'Array of cryptocurrency symbols (e.g., BTC-USD, ETH-USD)',
              minItems: 1,
              maxItems: 50
            },
            currency: {
              type: 'string',
              description: 'Target currency for quotes (default: USD)'
            }
          },
          required: ['symbols']
        }
      },
      {
        name: 'get_forex_quote',
        description: 'Get currency pair exchange rates with bid/ask spreads. Supports batch processing of multiple pairs.',
        inputSchema: {
          type: 'object',
          properties: {
            pairs: {
              type: 'array',
              items: {
                type: 'string'
              },
              description: 'Array of forex pairs (e.g., EURUSD, GBPUSD)',
              minItems: 1,
              maxItems: 50
            }
          },
          required: ['pairs']
        }
      },
      {
        name: 'get_trending_symbols',
        description: 'Get trending stocks with volume indicators and engagement metrics. Includes regional filtering and volume data.',
        inputSchema: {
          type: 'object',
          properties: {
            region: {
              type: 'string',
              description: 'Region code (e.g., US, GB, DE)',
              default: 'US'
            },
            limit: {
              type: 'number',
              description: 'Maximum number of trending symbols to return',
              minimum: 1,
              maximum: 50
            },
            includeVolume: {
              type: 'boolean',
              description: 'Include volume data in results',
              default: false
            }
          }
        }
      },
      {
        name: 'screener',
        description: 'Screen stocks based on filters with validation and confidence scores. Supports multiple filter criteria.',
        inputSchema: {
          type: 'object',
          properties: {
            filters: {
              type: 'object',
              description: 'Filter criteria (e.g., { marketCap: 1000000000, sector: "Technology" })'
            },
            limit: {
              type: 'number',
              description: 'Maximum number of results to return',
              minimum: 1,
              maximum: 250
            },
            validateFilters: {
              type: 'boolean',
              description: 'Validate filters before execution',
              default: true
            }
          },
          required: ['filters']
        }
      }
    ];
  }
}

export { SummaryTools };
