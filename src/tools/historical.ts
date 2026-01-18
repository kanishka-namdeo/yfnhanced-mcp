import { z } from 'zod';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import type { HistoricalPriceResult, HistoricalPriceData } from '../types/yahoo-finance.js';
import { YahooFinanceClient } from '../services/yahoo-finance.js';
import { DataQualityReporter } from '../utils/data-completion.js';

type HistoricalPriceWithFlags = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  adjclose: number;
  volume: number;
  isGap?: boolean;
  isSplit?: boolean;
  hasNulls?: boolean;
};

type HistoricalMeta = {
  fromCache: boolean;
  dataAge: number;
  completenessScore: number;
  warnings: string[];
  integrityFlags: string[];
};

type MultiHistoricalResult = {
  symbol: string;
  status: 'success' | 'error';
  data?: HistoricalPriceWithFlags[];
  meta?: HistoricalMeta;
  error?: string;
};

const DEFAULT_CACHE_TTL_MS = 3600000;

class HistoricalDataValidator {
  validatePriceData(data: HistoricalPriceWithFlags): { isValid: boolean; flags: string[] } {
    const flags: string[] = [];
    let isValid = true;

    if (data.high < data.low) {
      flags.push('high_below_low');
      isValid = false;
    }

    if (data.close < data.low || data.close > data.high) {
      flags.push('close_out_of_range');
      isValid = false;
    }

    if (data.open < 0 || data.high < 0 || data.low < 0 || data.close < 0) {
      flags.push('negative_prices');
      isValid = false;
    }

    if (data.adjclose < 0) {
      flags.push('negative_adjclose');
      isValid = false;
    }

    if (data.volume < 0) {
      flags.push('negative_volume');
      isValid = false;
    }

    if (data.open > data.high || data.open < data.low) {
      flags.push('open_out_of_range');
    }

    if (data.close === 0 && data.volume > 0) {
      flags.push('zero_price_with_volume');
    }

    return { isValid, flags };
  }

  detectGap(current: HistoricalPriceWithFlags, previous: HistoricalPriceWithFlags): boolean {
    const currentDate = new Date(current.date);
    const previousDate = new Date(previous.date);
    const dayDiff = Math.floor((currentDate.getTime() - previousDate.getTime()) / (1000 * 60 * 60 * 24));

    const maxTradingDaysGap = 3;
    if (dayDiff > maxTradingDaysGap) {
      return true;
    }

    return false;
  }

  detectSplit(current: HistoricalPriceWithFlags, previous: HistoricalPriceWithFlags): boolean {
    const ratio = previous.close / current.close;
    const commonSplitRatios = [2, 3, 4, 5, 0.5, 0.333, 0.25, 0.2];

    for (const splitRatio of commonSplitRatios) {
      if (Math.abs(ratio - splitRatio) < 0.1) {
        return true;
      }
    }

    if (ratio > 1.5 || ratio < 0.67) {
      return true;
    }

    return false;
  }

  detectNulls(data: HistoricalPriceWithFlags): boolean {
    return data.open === 0 && data.high === 0 && data.low === 0 && data.close === 0;
  }

  calculateCompletenessScore(data: HistoricalPriceWithFlags[]): number {
    if (data.length === 0) {
      return 0;
    }

    let totalFields = 0;
    let presentFields = 0;

    for (const item of data) {
      const fields = [item.open, item.high, item.low, item.close, item.adjclose, item.volume];
      totalFields += fields.length;

      for (const field of fields) {
        if (field !== null && field !== undefined && field !== 0) {
          presentFields++;
        }
      }
    }

    return totalFields === 0 ? 0 : presentFields / totalFields;
  }
}

export class HistoricalTools {
  private server: Server;
  private client: YahooFinanceClient;
  private qualityReporter: DataQualityReporter;
  private validator: HistoricalDataValidator;
  private cache: Map<string, { data: HistoricalPriceWithFlags[]; timestamp: number }>;

  constructor(server: Server, client: YahooFinanceClient, qualityReporter: DataQualityReporter) {
    this.server = server;
    this.client = client;
    this.qualityReporter = qualityReporter;
    this.validator = new HistoricalDataValidator();
    this.cache = new Map();
    this.registerTools();
  }

  private registerTools(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'get_historical_prices',
          description: 'Get historical price data for a stock symbol',
          inputSchema: {
            type: 'object',
            properties: {
              symbol: {
                type: 'string',
                description: 'Stock symbol (e.g., AAPL, MSFT, GOOGL)',
                minLength: 1,
                maxLength: 20
              },
              startDate: {
                type: 'string',
                description: 'Start date in YYYY-MM-DD format'
              },
              endDate: {
                type: 'string',
                description: 'End date in YYYY-MM-DD format (optional)'
              },
              interval: {
                type: 'string',
                description: 'Data interval',
                enum: ['1m', '2m', '5m', '15m', '30m', '60m', '90m', '1h', '1d', '5d', '1wk', '1mo', '3mo']
              },
              validateData: {
                type: 'boolean',
                description: 'Validate data integrity'
              }
            },
            required: ['symbol', 'startDate']
          }
        },
        {
          name: 'get_historical_prices_multi',
          description: 'Get historical price data for multiple stock symbols',
          inputSchema: {
            type: 'object',
            properties: {
              symbols: {
                type: 'array',
                items: { type: 'string' },
                description: 'Array of stock symbols',
                minItems: 1,
                maxItems: 50
              },
              startDate: {
                type: 'string',
                description: 'Start date in YYYY-MM-DD format'
              },
              endDate: {
                type: 'string',
                description: 'End date in YYYY-MM-DD format (optional)'
              },
              interval: {
                type: 'string',
                description: 'Data interval',
                enum: ['1m', '2m', '5m', '15m', '30m', '60m', '90m', '1h', '1d', '5d', '1wk', '1mo', '3mo']
              }
            },
            required: ['symbols', 'startDate']
          }
        }
      ]
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      if (name === 'get_historical_prices') {
        return this.handleGetHistoricalPrices(args);
      }

      if (name === 'get_historical_prices_multi') {
        return this.handleGetHistoricalPricesMulti(args);
      }

      throw new Error(`Unknown tool: ${name}`);
    });
  }

  private async handleGetHistoricalPrices(args: unknown) {
    const input = z.object({
      symbol: z.string().min(1).max(20),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      interval: z.enum(['1m', '2m', '5m', '15m', '30m', '60m', '90m', '1h', '1d', '5d', '1wk', '1mo', '3mo']).optional(),
      validateData: z.boolean().optional()
    }).parse(args);

    const { symbol, startDate, endDate, interval = '1d', validateData = true } = input;

    const cacheKey = `historical:${symbol}:${startDate}:${endDate ?? ''}:${interval}`;

    const cached = this.cache.get(cacheKey);
    const now = Date.now();

    if (cached && (now - cached.timestamp) < DEFAULT_CACHE_TTL_MS) {
      const dataAge = now - cached.timestamp;
      const completenessScore = this.validator.calculateCompletenessScore(cached.data);
      const warnings = this.qualityReporter.generateWarnings(
        { data: cached.data },
        dataAge
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              symbol,
              data: cached.data,
              meta: {
                fromCache: true,
                dataAge,
                completenessScore,
                warnings,
                integrityFlags: []
              }
            }, null, 2)
          }
        ]
      };
    }

    const result = await this.fetchWithRetry(symbol, startDate, endDate, interval);

    if (!result.success || !result.data) {
      if (cached) {
        const dataAge = now - cached.timestamp;
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                symbol,
                data: cached.data,
                meta: {
                  fromCache: true,
                  dataAge,
                  completenessScore: this.validator.calculateCompletenessScore(cached.data),
                  warnings: ['Using stale cached data due to fetch failure'],
                  integrityFlags: ['stale_data']
                }
              }, null, 2)
            }
          ]
        };
      }

      throw new Error(result.error ?? 'Failed to fetch historical data');
    }

    const processedData = this.processHistoricalData(result.data, validateData);
    const completenessScore = this.validator.calculateCompletenessScore(processedData);
    const dataAge = 0;
    const warnings: string[] = [];

    for (const item of processedData) {
      const validation = this.validator.validatePriceData(item);
      if (validation.flags.length > 0) {
        warnings.push(`Data integrity issues on ${item.date}: ${validation.flags.join(', ')}`);
      }
    }

    this.cache.set(cacheKey, {
      data: processedData,
      timestamp: now
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            symbol,
            data: processedData,
            meta: {
              fromCache: false,
              dataAge,
              completenessScore,
              warnings,
              integrityFlags: processedData.flatMap(item => {
                const flags: string[] = [];
                if (item.isGap) {flags.push('gap_detected');}
                if (item.isSplit) {flags.push('split_detected');}
                if (item.hasNulls) {flags.push('null_values');}
                return flags;
              })
            }
          }, null, 2)
        }
      ]
    };
  }

  private async handleGetHistoricalPricesMulti(args: unknown) {
    const input = z.object({
      symbols: z.array(z.string().min(1).max(20)).min(1).max(50),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      interval: z.enum(['1m', '2m', '5m', '15m', '30m', '60m', '90m', '1h', '1d', '5d', '1wk', '1mo', '3mo']).optional()
    }).parse(args);

    const { symbols, startDate, endDate, interval = '1d' } = input;
    const results: Map<string, MultiHistoricalResult> = new Map();

    for (const symbol of symbols) {
      try {
        const singleResult = await this.handleGetHistoricalPrices({
          symbol,
          startDate,
          endDate,
          interval,
          validateData: true
        });

        const parsed = JSON.parse(singleResult.content[0].text);
        results.set(symbol, {
          symbol,
          status: 'success',
          data: parsed.data,
          meta: parsed.meta
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        results.set(symbol, {
          symbol,
          status: 'error',
          error: errorMessage
        });
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(Object.fromEntries(results), null, 2)
        }
      ]
    };
  }

  private async fetchWithRetry(
    symbol: string,
    startDate: string,
    endDate: string | undefined,
    interval: string,
    maxRetries: number = 3
  ): Promise<{ success: boolean; data?: HistoricalPriceData[]; error?: string }> {
    const intervals = [interval, '1d', '1wk'];

    for (const retryInterval of intervals) {
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          const result = await this.client.getHistoricalPrices(symbol, {
            period1: new Date(startDate),
            period2: endDate ? new Date(endDate) : new Date(),
            interval: retryInterval
          });

          const data = this.extractHistoricalData(result);
          return { success: true, data };
        } catch (error) {
          const err = error as Error;

          if (attempt === maxRetries - 1) {
            return {
              success: false,
              error: err?.message ?? `Failed to fetch data for ${symbol}`
            };
          }

          await this.sleep(Math.pow(2, attempt) * 1000);
        }
      }
    }

    return {
      success: false,
      error: `Failed to fetch historical data for ${symbol} after all retries`
    };
  }

  private extractHistoricalData(result: HistoricalPriceResult): HistoricalPriceData[] {
    const quotes = result.indicators.quote[0];
    const adjcloses = result.indicators.adjclose[0]?.adjclose ?? [];

    const data: HistoricalPriceData[] = [];

    for (let i = 0; i < result.timestamps.length; i++) {
      const timestamp = result.timestamps[i];
      const date = new Date(timestamp * 1000);

      data.push({
        date,
        open: quotes.open[i] ?? 0,
        high: quotes.high[i] ?? 0,
        low: quotes.low[i] ?? 0,
        close: quotes.close[i] ?? 0,
        adjClose: adjcloses[i] ?? quotes.close[i] ?? 0,
        volume: quotes.volume[i] ?? 0
      });
    }

    return data.sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  private processHistoricalData(
    data: HistoricalPriceData[],
    validate: boolean
  ): HistoricalPriceWithFlags[] {
    const processed: HistoricalPriceWithFlags[] = [];

    for (let i = 0; i < data.length; i++) {
      const item = data[i];
      const dateString = item.date.toISOString().split('T')[0];

      const processedItem: HistoricalPriceWithFlags = {
        date: dateString,
        open: item.open,
        high: item.high,
        low: item.low,
        close: item.close,
        adjclose: item.adjClose,
        volume: item.volume
      };

      if (validate && i > 0) {
        const previousItem = data[i - 1];
        const previousProcessed = processed[i - 1];

        processedItem.isGap = this.validator.detectGap(processedItem, previousProcessed);
        processedItem.isSplit = this.validator.detectSplit(processedItem, previousProcessed);
        processedItem.hasNulls = this.validator.detectNulls(processedItem);
      } else {
        processedItem.isGap = false;
        processedItem.isSplit = false;
        processedItem.hasNulls = this.validator.detectNulls(processedItem);
      }

      const validation = this.validator.validatePriceData(processedItem);
      if (validation.isValid === false) {
        processedItem.isGap = true;
      }

      processed.push(processedItem);
    }

    return processed;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  clearCache(): void {
    this.cache.clear();
  }

  getCacheSize(): number {
    return this.cache.size;
  }
}
