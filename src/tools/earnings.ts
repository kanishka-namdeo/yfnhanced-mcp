import { z } from 'zod';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import type { EarningsResult, EarningsChart, EarningsTrend } from '../types/yahoo-finance.js';
import { YahooFinanceClient } from '../services/yahoo-finance.js';
import { DataQualityReporter } from '../utils/data-completion.js';

const EARNINGS_CACHE_TTL_MS = 3600000;

type EarningsQuarterly = {
  date: string;
  estimate: number | null;
  actual: number | null;
  surprisePercent: number | null;
  surpriseDirection: 'positive' | 'negative' | 'neutral' | null;
  timing: 'before' | 'after' | 'during' | 'unknown';
};

type EarningsData = {
  earningsDate: string | null;
  currentQuarterEstimate: number | null;
  currentQuarterEstimateDate: string | null;
  currentQuarterEstimateYearAgo: number | null;
  quarterly: EarningsQuarterly[];
  trends: EarningsTrend[];
};

type EarningsOutput = {
  symbol: string;
  earnings: EarningsData;
  meta: {
    fromCache: boolean;
    dataAge: number;
    completenessScore: number;
    warnings: string[];
  };
};

export class EarningsTools {
  private client: YahooFinanceClient;
  private qualityReporter: DataQualityReporter;
  private cache: Map<string, { data: EarningsOutput; timestamp: number }>;

  constructor(client: YahooFinanceClient) {
    this.client = client;
    this.qualityReporter = new DataQualityReporter(EARNINGS_CACHE_TTL_MS);
    this.cache = new Map();
  }

  registerTools(server: Server): void {
    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'get_earnings',
          description: 'Fetch earnings data for a stock symbol including historical earnings, estimates, and surprise analysis',
          inputSchema: {
            type: 'object',
            properties: {
              symbol: {
                type: 'string',
                description: 'Stock symbol (e.g., AAPL, MSFT, GOOGL)',
                minLength: 1,
                maxLength: 20
              },
              limit: {
                type: 'number',
                description: 'Maximum number of historical earnings quarters to return (default: 12)',
                minimum: 1,
                maximum: 20
              },
              includeEstimates: {
                type: 'boolean',
                description: 'Include earnings estimates in the response (default: true)'
              }
            },
            required: ['symbol']
          }
        }
      ]
    }));

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      if (name === 'get_earnings') {
        return await this.getEarnings(args);
      }

      throw new Error(`Unknown tool: ${name}`);
    });
  }

  public async getEarnings(args: unknown) {
    const input = z.object({
      symbol: z.string().min(1).max(20),
      limit: z.number().int().min(1).max(20).optional().default(12),
      includeEstimates: z.boolean().optional().default(true)
    }).parse(args);

    const { symbol, limit, includeEstimates } = input;
    const cacheKey = `earnings:${symbol}:${limit}:${includeEstimates}`;
    const now = Date.now();

    const cached = this.cache.get(cacheKey);
    if (cached && (now - cached.timestamp) < EARNINGS_CACHE_TTL_MS) {
      const dataAge = now - cached.timestamp;
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              symbol,
              earnings: cached.data.earnings,
              meta: {
                fromCache: true,
                dataAge,
                completenessScore: cached.data.meta.completenessScore,
                warnings: [...cached.data.meta.warnings, 'Data from cache']
              }
            }, null, 2)
          }
        ]
      };
    }

    try {
      const earningsResult = await this.client.getEarnings(symbol);
      const earningsData = this.processEarningsData(earningsResult, limit, includeEstimates);
      const flatData = this.flattenEarningsData(earningsData);
      const completenessScore = this.qualityReporter.calculateCompleteness(flatData);
      const warnings = this.generateEarningsWarnings(earningsData, completenessScore);

      const output: EarningsOutput = {
        symbol,
        earnings: earningsData,
        meta: {
          fromCache: false,
          dataAge: 0,
          completenessScore,
          warnings
        }
      };

      this.cache.set(cacheKey, {
        data: output,
        timestamp: now
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(output, null, 2)
          }
        ]
      };
    } catch (error) {
      if (cached) {
        const dataAge = now - cached.timestamp;
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                symbol,
                earnings: cached.data.earnings,
                meta: {
                  fromCache: true,
                  dataAge,
                  completenessScore: cached.data.meta.completenessScore,
                  warnings: [...cached.data.meta.warnings, 'Using stale cached data due to fetch failure']
                }
              }, null, 2)
            }
          ]
        };
      }
      throw error;
    }
  }

  private processEarningsData(result: EarningsResult, limit: number, includeEstimates: boolean): EarningsData {
    const chart = result.earningsChart;
    const trends = result.earningsTrend ?? [];

    let earningsDate: string | null = null;
    let currentQuarterEstimate: number | null = null;
    let currentQuarterEstimateDate: string | null = null;
    let currentQuarterEstimateYearAgo: number | null = null;

    if (chart?.earningsDate?.date) {
      earningsDate = chart.earningsDate.date;
    }

    if (chart?.currentQuarterEstimate !== undefined && chart?.currentQuarterEstimate !== null) {
      currentQuarterEstimate = chart.currentQuarterEstimate;
    }

    if (chart?.currentQuarterEstimateDate?.fmt) {
      currentQuarterEstimateDate = chart.currentQuarterEstimateDate.fmt;
    }

    if (chart?.currentQuarterEstimateYearAgo !== undefined && chart?.currentQuarterEstimateYearAgo !== null) {
      currentQuarterEstimateYearAgo = chart.currentQuarterEstimateYearAgo;
    }

    const quarterly: EarningsQuarterly[] = [];
    const quarterlyData = chart?.quarterly ?? [];

    const count = Math.min(limit, quarterlyData.length);
    for (let i = 0; i < count; i++) {
      const q = quarterlyData[i];
      const estimate = includeEstimates ? (q.estimate ?? null) : null;
      const actual = q.actual ?? null;

      const surprisePercent = this.calculateSurprisePercent(actual, estimate);
      const surpriseDirection = this.determineSurpriseDirection(surprisePercent);
      const timing = this.detectAnnouncementTiming(q.date);

      quarterly.push({
        date: q.date,
        estimate,
        actual,
        surprisePercent,
        surpriseDirection,
        timing
      });
    }

    return {
      earningsDate,
      currentQuarterEstimate,
      currentQuarterEstimateDate,
      currentQuarterEstimateYearAgo,
      quarterly,
      trends
    };
  }

  private calculateSurprisePercent(actual: number | null, estimate: number | null): number | null {
    if (actual === null || estimate === null || estimate === 0) {
      return null;
    }
    return ((actual - estimate) / estimate) * 100;
  }

  private determineSurpriseDirection(surprisePercent: number | null): 'positive' | 'negative' | 'neutral' | null {
    if (surprisePercent === null) {
      return null;
    }
    if (surprisePercent > 0.1) {
      return 'positive';
    }
    if (surprisePercent < -0.1) {
      return 'negative';
    }
    return 'neutral';
  }

  private detectAnnouncementTiming(dateString: string): 'before' | 'after' | 'during' | 'unknown' {
    if (!dateString) {
      return 'unknown';
    }

    try {
      const date = new Date(dateString);
      const hours = date.getUTCHours();
      const minutes = date.getUTCMinutes();
      const timeInMinutes = hours * 60 + minutes;

      const marketOpen = 570;
      const marketClose = 960;

      if (timeInMinutes < marketOpen) {
        return 'before';
      }
      if (timeInMinutes > marketClose) {
        return 'after';
      }
      return 'during';
    } catch {
      return 'unknown';
    }
  }

  private flattenEarningsData(data: EarningsData): Record<string, unknown> {
    const flat: Record<string, unknown> = {};

    flat['earningsDate'] = data.earningsDate;
    flat['currentQuarterEstimate'] = data.currentQuarterEstimate;
    flat['currentQuarterEstimateDate'] = data.currentQuarterEstimateDate;
    flat['currentQuarterEstimateYearAgo'] = data.currentQuarterEstimateYearAgo;

    for (let i = 0; i < data.quarterly.length; i++) {
      const q = data.quarterly[i];
      flat[`quarterly_${i}_date`] = q.date;
      flat[`quarterly_${i}_estimate`] = q.estimate;
      flat[`quarterly_${i}_actual`] = q.actual;
      flat[`quarterly_${i}_surprisePercent`] = q.surprisePercent;
      flat[`quarterly_${i}_surpriseDirection`] = q.surpriseDirection;
      flat[`quarterly_${i}_timing`] = q.timing;
    }

    for (let i = 0; i < data.trends.length; i++) {
      const t = data.trends[i];
      flat[`trend_${i}_period`] = t.period;
      flat[`trend_${i}_growth`] = t.growth;
      if (t.earningsEstimate) {
        flat[`trend_${i}_epsEstimate`] = t.earningsEstimate.avg;
        flat[`trend_${i}_epsAnalysts`] = t.earningsEstimate.numberOfAnalysts;
      }
    }

    return flat;
  }

  private generateEarningsWarnings(data: EarningsData, completenessScore: number): string[] {
    const warnings: string[] = [];

    if (completenessScore < 0.5) {
      warnings.push('Low data completeness (<50%)');
    } else if (completenessScore < 0.8) {
      warnings.push('Partial data available (<80% completeness)');
    }

    if (!data.earningsDate) {
      warnings.push('Earnings date not available');
    }

    if (data.currentQuarterEstimate === null) {
      warnings.push('Current quarter estimate not available');
    }

    if (data.quarterly.length === 0) {
      warnings.push('No historical earnings data available');
    }

    const nullEstimates = data.quarterly.filter(q => q.estimate === null).length;
    if (nullEstimates > data.quarterly.length / 2) {
      warnings.push('Most earnings estimates are missing');
    }

    const nullActuals = data.quarterly.filter(q => q.actual === null).length;
    if (nullActuals > data.quarterly.length / 2) {
      warnings.push('Most actual earnings values are missing');
    }

    if (data.trends.length === 0) {
      warnings.push('Earnings trend data not available');
    }

    return warnings;
  }

  clearCache(): void {
    this.cache.clear();
  }

  getCacheSize(): number {
    return this.cache.size;
  }
}
