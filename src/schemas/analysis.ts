import * as z from "zod";

export const AnalysisInputSchema = z.object({
  symbol: z.string().min(1).max(20),
  includeExpired: z.boolean().optional()
});

export const RecommendationTrendSchema = z.object({
  period: z.string(),
  strongBuy: z.number().int().nonnegative(),
  buy: z.number().int().nonnegative(),
  hold: z.number().int().nonnegative(),
  sell: z.number().int().nonnegative(),
  strongSell: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  recommendation: z.enum(['strong_buy', 'buy', 'hold', 'sell', 'strong_sell', 'neutral'])
});

export const TargetPriceSchema = z.object({
  targetHigh: z.number().nullable(),
  targetLow: z.number().nullable(),
  targetMean: z.number().nullable(),
  targetMedian: z.number().nullable(),
  numberOfAnalysts: z.number().int().nonnegative()
});

export const CurrentRatingsSchema = z.object({
  strongBuy: z.number().int().nonnegative(),
  buy: z.number().int().nonnegative(),
  hold: z.number().int().nonnegative(),
  sell: z.number().int().nonnegative(),
  strongSell: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  recommendation: z.enum(['strong_buy', 'buy', 'hold', 'sell', 'strong_sell', 'neutral'])
});

export const AnalysisDataSchema = z.object({
  currentRatings: CurrentRatingsSchema,
  targetPrice: TargetPriceSchema,
  recommendationTrend: z.array(RecommendationTrendSchema),
  earningsTrends: z.array(z.any())
});

export const AnalysisMetaSchema = z.object({
  fromCache: z.boolean(),
  dataAge: z.number().nonnegative(),
  completenessScore: z.number().min(0).max(1),
  warnings: z.array(z.string())
});

export const AnalysisOutputSchema = z.object({
  symbol: z.string(),
  analysis: AnalysisDataSchema,
  meta: AnalysisMetaSchema
});
