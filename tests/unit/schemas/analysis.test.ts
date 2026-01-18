import { AnalysisInputSchema, RecommendationTrendSchema, TargetPriceSchema, CurrentRatingsSchema, AnalysisDataSchema, AnalysisMetaSchema, AnalysisOutputSchema } from '../../../src/schemas/analysis';

describe('AnalysisInputSchema', () => {
  test('should validate valid analysis input', () => {
    const input = { symbol: 'AAPL' };
    const result = AnalysisInputSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  test('should validate input with includeExpired', () => {
    const input = {
      symbol: 'AAPL',
      includeExpired: true
    };
    const result = AnalysisInputSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  test('should reject missing symbol', () => {
    const input = {};
    const result = AnalysisInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  test('should reject empty symbol', () => {
    const input = { symbol: '' };
    const result = AnalysisInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  test('should reject symbol longer than 20 characters', () => {
    const input = { symbol: 'VERYLONGSYMBOLTHATISTOOLONG' };
    const result = AnalysisInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  test('should accept boolean includeExpired', () => {
    const input = {
      symbol: 'AAPL',
      includeExpired: false
    };
    const result = AnalysisInputSchema.safeParse(input);
    expect(result.success).toBe(true);
  });
});

describe('RecommendationTrendSchema', () => {
  test('should validate recommendation trend with all fields', () => {
    const trend = {
      period: '0m',
      strongBuy: 15,
      buy: 8,
      hold: 5,
      sell: 1,
      strongSell: 0,
      total: 29,
      recommendation: 'strong_buy'
    };
    const result = RecommendationTrendSchema.safeParse(trend);
    expect(result.success).toBe(true);
  });

  test('should validate trend with required fields', () => {
    const trend = {
      period: '0m',
      strongBuy: 15,
      buy: 8,
      hold: 5,
      sell: 1,
      strongSell: 0,
      total: 29,
      recommendation: 'strong_buy'
    };
    const result = RecommendationTrendSchema.safeParse(trend);
    expect(result.success).toBe(true);
  });

  test('should reject missing period', () => {
    const trend = {
      strongBuy: 15,
      buy: 8,
      hold: 5,
      sell: 1,
      strongSell: 0,
      total: 29,
      recommendation: 'strong_buy'
    };
    const result = RecommendationTrendSchema.safeParse(trend);
    expect(result.success).toBe(false);
  });

  test('should reject negative values', () => {
    const trend = {
      period: '0m',
      strongBuy: -1,
      buy: 8,
      hold: 5,
      sell: 1,
      strongSell: 0,
      total: 29,
      recommendation: 'strong_buy'
    };
    const result = RecommendationTrendSchema.safeParse(trend);
    expect(result.success).toBe(false);
  });

  test('should accept zero values', () => {
    const trend = {
      period: '0m',
      strongBuy: 0,
      buy: 0,
      hold: 0,
      sell: 0,
      strongSell: 0,
      total: 0,
      recommendation: 'neutral'
    };
    const result = RecommendationTrendSchema.safeParse(trend);
    expect(result.success).toBe(true);
  });

  test('should accept valid recommendation values', () => {
    const recommendations = ['strong_buy', 'buy', 'hold', 'sell', 'strong_sell', 'neutral'];
    recommendations.forEach(rec => {
      const trend = {
        period: '0m',
        strongBuy: 5,
        buy: 5,
        hold: 5,
        sell: 5,
        strongSell: 5,
        total: 25,
        recommendation: rec
      };
      const result = RecommendationTrendSchema.safeParse(trend);
      expect(result.success).toBe(true);
    });
  });

  test('should reject invalid recommendation', () => {
    const trend = {
      period: '0m',
      strongBuy: 15,
      buy: 8,
      hold: 5,
      sell: 1,
      strongSell: 0,
      total: 29,
      recommendation: 'invalid'
    };
    const result = RecommendationTrendSchema.safeParse(trend);
    expect(result.success).toBe(false);
  });
});

describe('TargetPriceSchema', () => {
  test('should validate target price with all fields', () => {
    const target = {
      targetHigh: 200,
      targetLow: 150,
      targetMean: 175,
      targetMedian: 178,
      numberOfAnalysts: 30
    };
    const result = TargetPriceSchema.safeParse(target);
    expect(result.success).toBe(true);
  });

  test('should validate target price with required fields', () => {
    const target = {
      targetHigh: 200,
      targetLow: 150,
      targetMean: 175,
      targetMedian: 178,
      numberOfAnalysts: 30
    };
    const result = TargetPriceSchema.safeParse(target);
    expect(result.success).toBe(true);
  });

  test('should accept null values', () => {
    const target = {
      targetHigh: null,
      targetLow: null,
      targetMean: null,
      targetMedian: null,
      numberOfAnalysts: 0
    };
    const result = TargetPriceSchema.safeParse(target);
    expect(result.success).toBe(true);
  });

  test('should reject negative numberOfAnalysts', () => {
    const target = {
      targetHigh: 200,
      targetLow: 150,
      targetMean: 175,
      targetMedian: 178,
      numberOfAnalysts: -1
    };
    const result = TargetPriceSchema.safeParse(target);
    expect(result.success).toBe(false);
  });

  test('should accept zero numberOfAnalysts', () => {
    const target = {
      targetHigh: null,
      targetLow: null,
      targetMean: null,
      targetMedian: null,
      numberOfAnalysts: 0
    };
    const result = TargetPriceSchema.safeParse(target);
    expect(result.success).toBe(true);
  });

  test('should accept negative target values', () => {
    const target = {
      targetHigh: 200,
      targetLow: -50,
      targetMean: 175,
      targetMedian: 178,
      numberOfAnalysts: 30
    };
    const result = TargetPriceSchema.safeParse(target);
    expect(result.success).toBe(true);
  });

  test('should accept zero target values', () => {
    const target = {
      targetHigh: 0,
      targetLow: 0,
      targetMean: 0,
      targetMedian: 0,
      numberOfAnalysts: 30
    };
    const result = TargetPriceSchema.safeParse(target);
    expect(result.success).toBe(true);
  });
});

describe('CurrentRatingsSchema', () => {
  test('should validate current ratings with all fields', () => {
    const ratings = {
      strongBuy: 15,
      buy: 8,
      hold: 5,
      sell: 1,
      strongSell: 0,
      total: 29,
      recommendation: 'strong_buy'
    };
    const result = CurrentRatingsSchema.safeParse(ratings);
    expect(result.success).toBe(true);
  });

  test('should validate ratings with required fields', () => {
    const ratings = {
      strongBuy: 15,
      buy: 8,
      hold: 5,
      sell: 1,
      strongSell: 0,
      total: 29,
      recommendation: 'strong_buy'
    };
    const result = CurrentRatingsSchema.safeParse(ratings);
    expect(result.success).toBe(true);
  });

  test('should reject negative values', () => {
    const ratings = {
      strongBuy: -1,
      buy: 8,
      hold: 5,
      sell: 1,
      strongSell: 0,
      total: 29,
      recommendation: 'strong_buy'
    };
    const result = CurrentRatingsSchema.safeParse(ratings);
    expect(result.success).toBe(false);
  });

  test('should accept zero values', () => {
    const ratings = {
      strongBuy: 0,
      buy: 0,
      hold: 0,
      sell: 0,
      strongSell: 0,
      total: 0,
      recommendation: 'neutral'
    };
    const result = CurrentRatingsSchema.safeParse(ratings);
    expect(result.success).toBe(true);
  });

  test('should accept valid recommendation values', () => {
    const recommendations = ['strong_buy', 'buy', 'hold', 'sell', 'strong_sell', 'neutral'];
    recommendations.forEach(rec => {
      const ratings = {
        strongBuy: 5,
        buy: 5,
        hold: 5,
        sell: 5,
        strongSell: 5,
        total: 25,
        recommendation: rec
      };
      const result = CurrentRatingsSchema.safeParse(ratings);
      expect(result.success).toBe(true);
    });
  });

  test('should reject invalid recommendation', () => {
    const ratings = {
      strongBuy: 15,
      buy: 8,
      hold: 5,
      sell: 1,
      strongSell: 0,
      total: 29,
      recommendation: 'invalid'
    };
    const result = CurrentRatingsSchema.safeParse(ratings);
    expect(result.success).toBe(false);
  });
});

describe('AnalysisDataSchema', () => {
  test('should validate analysis data with all fields', () => {
    const data = {
      currentRatings: {
        strongBuy: 15,
        buy: 8,
        hold: 5,
        sell: 1,
        strongSell: 0,
        total: 29,
        recommendation: 'strong_buy'
      },
      targetPrice: {
        targetHigh: 200,
        targetLow: 150,
        targetMean: 175,
        targetMedian: 178,
        numberOfAnalysts: 30
      },
      recommendationTrend: [
        {
          period: '0m',
          strongBuy: 15,
          buy: 8,
          hold: 5,
          sell: 1,
          strongSell: 0,
          total: 29,
          recommendation: 'strong_buy'
        }
      ],
      earningsTrends: []
    };
    const result = AnalysisDataSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  test('should reject missing currentRatings', () => {
    const data = {
      targetPrice: {
        targetHigh: 200,
        targetLow: 150,
        targetMean: 175,
        targetMedian: 178,
        numberOfAnalysts: 30
      },
      recommendationTrend: [],
      earningsTrends: []
    };
    const result = AnalysisDataSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  test('should reject missing targetPrice', () => {
    const data = {
      currentRatings: {
        strongBuy: 15,
        buy: 8,
        hold: 5,
        sell: 1,
        strongSell: 0,
        total: 29,
        recommendation: 'strong_buy'
      },
      recommendationTrend: [],
      earningsTrends: []
    };
    const result = AnalysisDataSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  test('should reject missing recommendationTrend', () => {
    const data = {
      currentRatings: {
        strongBuy: 15,
        buy: 8,
        hold: 5,
        sell: 1,
        strongSell: 0,
        total: 29,
        recommendation: 'strong_buy'
      },
      targetPrice: {
        targetHigh: 200,
        targetLow: 150,
        targetMean: 175,
        targetMedian: 178,
        numberOfAnalysts: 30
      },
      earningsTrends: []
    };
    const result = AnalysisDataSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  test('should accept empty recommendationTrend array', () => {
    const data = {
      currentRatings: {
        strongBuy: 15,
        buy: 8,
        hold: 5,
        sell: 1,
        strongSell: 0,
        total: 29,
        recommendation: 'strong_buy'
      },
      targetPrice: {
        targetHigh: 200,
        targetLow: 150,
        targetMean: 175,
        targetMedian: 178,
        numberOfAnalysts: 30
      },
      recommendationTrend: [],
      earningsTrends: []
    };
    const result = AnalysisDataSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  test('should accept empty earningsTrends array', () => {
    const data = {
      currentRatings: {
        strongBuy: 15,
        buy: 8,
        hold: 5,
        sell: 1,
        strongSell: 0,
        total: 29,
        recommendation: 'strong_buy'
      },
      targetPrice: {
        targetHigh: 200,
        targetLow: 150,
        targetMean: 175,
        targetMedian: 178,
        numberOfAnalysts: 30
      },
      recommendationTrend: [],
      earningsTrends: []
    };
    const result = AnalysisDataSchema.safeParse(data);
    expect(result.success).toBe(true);
  });
});

describe('AnalysisMetaSchema', () => {
  test('should validate meta with all fields', () => {
    const meta = {
      fromCache: true,
      dataAge: 300000,
      completenessScore: 0.95,
      warnings: []
    };
    const result = AnalysisMetaSchema.safeParse(meta);
    expect(result.success).toBe(true);
  });

  test('should validate meta with required fields', () => {
    const meta = {
      fromCache: false,
      dataAge: 0,
      completenessScore: 1,
      warnings: []
    };
    const result = AnalysisMetaSchema.safeParse(meta);
    expect(result.success).toBe(true);
  });

  test('should reject negative dataAge', () => {
    const meta = {
      fromCache: false,
      dataAge: -1,
      completenessScore: 1,
      warnings: []
    };
    const result = AnalysisMetaSchema.safeParse(meta);
    expect(result.success).toBe(false);
  });

  test('should reject completenessScore less than 0', () => {
    const meta = {
      fromCache: false,
      dataAge: 0,
      completenessScore: -0.1,
      warnings: []
    };
    const result = AnalysisMetaSchema.safeParse(meta);
    expect(result.success).toBe(false);
  });

  test('should reject completenessScore greater than 1', () => {
    const meta = {
      fromCache: false,
      dataAge: 0,
      completenessScore: 1.1,
      warnings: []
    };
    const result = AnalysisMetaSchema.safeParse(meta);
    expect(result.success).toBe(false);
  });

  test('should accept empty warnings array', () => {
    const meta = {
      fromCache: false,
      dataAge: 0,
      completenessScore: 1,
      warnings: []
    };
    const result = AnalysisMetaSchema.safeParse(meta);
    expect(result.success).toBe(true);
  });
});

describe('AnalysisOutputSchema', () => {
  test('should validate complete analysis output', () => {
    const output = {
      symbol: 'AAPL',
      analysis: {
        currentRatings: {
          strongBuy: 15,
          buy: 8,
          hold: 5,
          sell: 1,
          strongSell: 0,
          total: 29,
          recommendation: 'strong_buy'
        },
        targetPrice: {
          targetHigh: 200,
          targetLow: 150,
          targetMean: 175,
          targetMedian: 178,
          numberOfAnalysts: 30
        },
        recommendationTrend: [],
        earningsTrends: []
      },
      meta: {
        fromCache: false,
        dataAge: 0,
        completenessScore: 1,
        warnings: []
      }
    };
    const result = AnalysisOutputSchema.safeParse(output);
    expect(result.success).toBe(true);
  });

  test('should reject missing symbol', () => {
    const output = {
      analysis: {
        currentRatings: {
          strongBuy: 15,
          buy: 8,
          hold: 5,
          sell: 1,
          strongSell: 0,
          total: 29,
          recommendation: 'strong_buy'
        },
        targetPrice: {
          targetHigh: 200,
          targetLow: 150,
          targetMean: 175,
          targetMedian: 178,
          numberOfAnalysts: 30
        },
        recommendationTrend: [],
        earningsTrends: []
      },
      meta: {
        fromCache: false,
        dataAge: 0,
        completenessScore: 1,
        warnings: []
      }
    };
    const result = AnalysisOutputSchema.safeParse(output);
    expect(result.success).toBe(false);
  });

  test('should reject missing analysis', () => {
    const output = {
      symbol: 'AAPL',
      meta: {
        fromCache: false,
        dataAge: 0,
        completenessScore: 1,
        warnings: []
      }
    };
    const result = AnalysisOutputSchema.safeParse(output);
    expect(result.success).toBe(false);
  });

  test('should reject missing meta', () => {
    const output = {
      symbol: 'AAPL',
      analysis: {
        currentRatings: {
          strongBuy: 15,
          buy: 8,
          hold: 5,
          sell: 1,
          strongSell: 0,
          total: 29,
          recommendation: 'strong_buy'
        },
        targetPrice: {
          targetHigh: 200,
          targetLow: 150,
          targetMean: 175,
          targetMedian: 178,
          numberOfAnalysts: 30
        },
        recommendationTrend: [],
        earningsTrends: []
      }
    };
    const result = AnalysisOutputSchema.safeParse(output);
    expect(result.success).toBe(false);
  });
});
