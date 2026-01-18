import { z } from 'zod';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import type { AnalysisResult, AnalystRecommendation, EarningsTrend } from '../types/yahoo-finance.js';
import { YahooFinanceClient } from '../services/yahoo-finance.js';
import { DataQualityReporter } from '../utils/data-completion.js';

const ANALYSIS_CACHE_TTL_MS = 3600000;

type RecommendationTrend = {
  period: string;
  strongBuy: number;
  buy: number;
  hold: number;
  sell: number;
  strongSell: number;
  total: number;
  recommendation: 'strong_buy' | 'buy' | 'hold' | 'sell' | 'strong_sell' | 'neutral';
};

type TargetPrice = {
  targetHigh: number | null;
  targetLow: number | null;
  targetMean: number | null;
  targetMedian: number | null;
  numberOfAnalysts: number;
};

type AnalysisData = {
  currentRatings: {
    strongBuy: number;
    buy: number;
    hold: number;
    sell: number;
    strongSell: number;
    total: number;
    recommendation: 'strong_buy' | 'buy' | 'hold' | 'sell' | 'strong_sell' | 'neutral';
  };
  targetPrice: TargetPrice;
  recommendationTrend: RecommendationTrend[];
  earningsTrends: EarningsTrend[];
};

type AnalysisOutput = {
  symbol: string;
  analysis: AnalysisData;
  meta: {
    fromCache: boolean;
    dataAge: number;
    completenessScore: number;
    warnings: string[];
  };
};

export class AnalysisTools {
  private client: YahooFinanceClient;
  private qualityReporter: DataQualityReporter;
  private cache: Map<string, { data: AnalysisOutput; timestamp: number }>;

  constructor(client: YahooFinanceClient) {
    this.client = client;
    this.qualityReporter = new DataQualityReporter(ANALYSIS_CACHE_TTL_MS);
    this.cache = new Map();
  }

  registerTools(server: Server): void {
    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'get_analysis',
          description: 'Fetch analyst recommendations, target prices, and trend analysis for a stock symbol',
          inputSchema: {
            type: 'object',
            properties: {
              symbol: {
                type: 'string',
                description: 'Stock symbol (e.g., AAPL, MSFT, GOOGL)',
                minLength: 1,
                maxLength: 20
              },
              includeExpired: {
                type: 'boolean',
                description: 'Include expired analyst recommendations in trend history (default: false)'
              }
            },
            required: ['symbol']
          }
        }
      ]
    }));

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      if (name === 'get_analysis') {
        return await this.getAnalysis(args);
      }

      throw new Error(`Unknown tool: ${name}`);
    });
  }

  public async getAnalysis(args: unknown) {
    const input = z.object({
      symbol: z.string().min(1).max(20),
      includeExpired: z.boolean().optional().default(false)
    }).parse(args);

    const { symbol, includeExpired } = input;
    const cacheKey = `analysis:${symbol}:${includeExpired}`;
    const now = Date.now();

    const cached = this.cache.get(cacheKey);
    if (cached && (now - cached.timestamp) < ANALYSIS_CACHE_TTL_MS) {
      const dataAge = now - cached.timestamp;
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              symbol,
              analysis: cached.data.analysis,
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
      const analysisResult = await this.client.getAnalysis(symbol);
      const analysisData = this.processAnalysisData(analysisResult, includeExpired);
      const flatData = this.flattenAnalysisData(analysisData);
      const completenessScore = this.qualityReporter.calculateCompleteness(flatData);
      const warnings = this.generateAnalysisWarnings(analysisData, completenessScore);

      const output: AnalysisOutput = {
        symbol,
        analysis: analysisData,
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
                analysis: cached.data.analysis,
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

  private processAnalysisData(result: AnalysisResult, includeExpired: boolean): AnalysisData {
    const opinion = result.analystOpinion;
    const trendData = result.recommendationTrend;
    const earningsTrends = result.earningsTrend ?? [];

    const currentRatings = this.extractCurrentRatings(opinion);
    const targetPrice = this.extractTargetPrice(opinion);
    const recommendationTrend = this.processRecommendationTrend(trendData, includeExpired);

    return {
      currentRatings,
      targetPrice,
      recommendationTrend,
      earningsTrends
    };
  }

  private extractCurrentRatings(opinion: AnalysisResult['analystOpinion']): AnalysisData['currentRatings'] {
    const ratings = {
      strongBuy: 0,
      buy: 0,
      hold: 0,
      sell: 0,
      strongSell: 0,
      total: 0,
      recommendation: 'neutral' as const
    };

    if (opinion?.currentRatings) {
      ratings.strongBuy = opinion.currentRatings.strongBuy ?? 0;
      ratings.buy = opinion.currentRatings.buy ?? 0;
      ratings.hold = opinion.currentRatings.hold ?? 0;
      ratings.sell = opinion.currentRatings.sell ?? 0;
      ratings.strongSell = opinion.currentRatings.strongSell ?? 0;
      ratings.total = ratings.strongBuy + ratings.buy + ratings.hold + ratings.sell + ratings.strongSell;
    }

    return ratings;
  }

  private determineRecommendation(ratings: AnalysisData['currentRatings']): 'strong_buy' | 'buy' | 'hold' | 'sell' | 'strong_sell' | 'neutral' {
    if (ratings.total === 0) {
      return 'neutral';
    }

    const buyScore = ratings.strongBuy * 2 + ratings.buy;
    const sellScore = ratings.strongSell * 2 + ratings.sell;
    const netScore = buyScore - sellScore;
    const totalWeighted = ratings.strongBuy * 2 + ratings.buy + ratings.hold + ratings.sell + ratings.strongSell * 2;

    if (totalWeighted === 0) {
      return 'neutral';
    }

    const normalizedScore = netScore / totalWeighted;

    if (normalizedScore > 0.4) {
      return 'strong_buy';
    }
    if (normalizedScore > 0.1) {
      return 'buy';
    }
    if (normalizedScore < -0.4) {
      return 'strong_sell';
    }
    if (normalizedScore < -0.1) {
      return 'sell';
    }
    return 'hold';
  }

  private extractTargetPrice(opinion: AnalysisResult['analystOpinion']): TargetPrice {
    return {
      targetHigh: opinion?.targetPrice ?? null,
      targetLow: opinion?.targetPrice ?? null,
      targetMean: opinion?.targetPrice ?? null,
      targetMedian: opinion?.targetPrice ?? null,
      numberOfAnalysts: 0
    };
  }

  private processRecommendationTrend(trendData: AnalysisResult['recommendationTrend'], includeExpired: boolean): RecommendationTrend[] {
    if (!trendData?.trend) {
      return [];
    }

    return trendData.trend
      .filter(trend => includeExpired || this.isTrendValid(trend))
      .map(trend => {
        const total = trend.strongBuy + trend.buy + trend.hold + trend.sell + trend.strongSell;
        return {
          period: trend.period,
          strongBuy: trend.strongBuy,
          buy: trend.buy,
          hold: trend.hold,
          sell: trend.sell,
          strongSell: trend.strongSell,
          total,
          recommendation: this.determineTrendRecommendation(trend)
        };
      });
  }

  private isTrendValid(trend: AnalystRecommendation): boolean {
    const total = trend.strongBuy + trend.buy + trend.hold + trend.sell + trend.strongSell;
    return total > 0;
  }

  private determineTrendRecommendation(trend: AnalystRecommendation): 'strong_buy' | 'buy' | 'hold' | 'sell' | 'strong_sell' | 'neutral' {
    const total = trend.strongBuy + trend.buy + trend.hold + trend.sell + trend.strongSell;

    if (total === 0) {
      return 'neutral';
    }

    const buyScore = trend.strongBuy * 2 + trend.buy;
    const sellScore = trend.strongSell * 2 + trend.sell;
    const netScore = buyScore - sellScore;
    const totalWeighted = trend.strongBuy * 2 + trend.buy + trend.hold + trend.sell + trend.strongSell * 2;

    if (totalWeighted === 0) {
      return 'neutral';
    }

    const normalizedScore = netScore / totalWeighted;

    if (normalizedScore > 0.4) {
      return 'strong_buy';
    }
    if (normalizedScore > 0.1) {
      return 'buy';
    }
    if (normalizedScore < -0.4) {
      return 'strong_sell';
    }
    if (normalizedScore < -0.1) {
      return 'sell';
    }
    return 'hold';
  }

  private flattenAnalysisData(data: AnalysisData): Record<string, unknown> {
    const flat: Record<string, unknown> = {};

    flat['strongBuy'] = data.currentRatings.strongBuy;
    flat['buy'] = data.currentRatings.buy;
    flat['hold'] = data.currentRatings.hold;
    flat['sell'] = data.currentRatings.sell;
    flat['strongSell'] = data.currentRatings.strongSell;
    flat['totalAnalysts'] = data.currentRatings.total;
    flat['recommendation'] = data.currentRatings.recommendation;

    flat['targetPrice'] = data.targetPrice.targetMean;
    flat['targetHigh'] = data.targetPrice.targetHigh;
    flat['targetLow'] = data.targetPrice.targetLow;
    flat['targetMedian'] = data.targetPrice.targetMedian;
    flat['targetAnalysts'] = data.targetPrice.numberOfAnalysts;

    for (let i = 0; i < data.recommendationTrend.length; i++) {
      const t = data.recommendationTrend[i];
      flat[`trend_${i}_period`] = t.period;
      flat[`trend_${i}_strongBuy`] = t.strongBuy;
      flat[`trend_${i}_buy`] = t.buy;
      flat[`trend_${i}_hold`] = t.hold;
      flat[`trend_${i}_sell`] = t.sell;
      flat[`trend_${i}_strongSell`] = t.strongSell;
      flat[`trend_${i}_total`] = t.total;
      flat[`trend_${i}_recommendation`] = t.recommendation;
    }

    for (let i = 0; i < data.earningsTrends.length; i++) {
      const t = data.earningsTrends[i];
      flat[`earningsTrend_${i}_period`] = t.period;
      flat[`earningsTrend_${i}_growth`] = t.growth;
      if (t.earningsEstimate) {
        flat[`earningsTrend_${i}_estimate`] = t.earningsEstimate.avg;
        flat[`earningsTrend_${i}_analysts`] = t.earningsEstimate.numberOfAnalysts;
      }
    }

    return flat;
  }

  private generateAnalysisWarnings(data: AnalysisData, completenessScore: number): string[] {
    const warnings: string[] = [];

    if (completenessScore < 0.5) {
      warnings.push('Low data completeness (<50%)');
    } else if (completenessScore < 0.8) {
      warnings.push('Partial data available (<80% completeness)');
    }

    if (data.currentRatings.total === 0) {
      warnings.push('No analyst ratings available');
    }

    if (data.targetPrice.targetMean === null) {
      warnings.push('Target price not available');
    }

    if (data.recommendationTrend.length === 0) {
      warnings.push('Recommendation trend history not available');
    }

    if (data.earningsTrends.length === 0) {
      warnings.push('Earnings trend data not available');
    }

    if (data.currentRatings.total > 0 && data.targetPrice.numberOfAnalysts === 0) {
      warnings.push('Analyst count for target price not reported');
    }

    const recentTrends = data.recommendationTrend.slice(0, 3);
    const allZeroTrends = recentTrends.every(t => t.total === 0);
    if (allZeroTrends && data.recommendationTrend.length > 0) {
      warnings.push('Recent recommendation trends show no analyst data');
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
