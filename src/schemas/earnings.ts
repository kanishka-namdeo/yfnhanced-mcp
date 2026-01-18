import * as z from "zod";

export const EarningsInputSchema = z.object({
  symbol: z.string().min(1).max(20),
  limit: z.number().int().min(1).max(20).optional(),
  includeEstimates: z.boolean().optional()
});

export const EarningsQuarterlySchema = z.object({
  date: z.string(),
  estimate: z.number().nullable(),
  actual: z.number().nullable(),
  surprisePercent: z.number().nullable(),
  surpriseDirection: z.enum(['positive', 'negative', 'neutral', 'null']).nullable(),
  timing: z.enum(['before', 'after', 'during', 'unknown'])
});

export const EarningsDataSchema = z.object({
  earningsDate: z.string().nullable(),
  currentQuarterEstimate: z.number().nullable(),
  currentQuarterEstimateDate: z.string().nullable(),
  currentQuarterEstimateYearAgo: z.number().nullable(),
  quarterly: z.array(EarningsQuarterlySchema),
  trends: z.array(z.any())
});

export const EarningsMetaSchema = z.object({
  fromCache: z.boolean(),
  dataAge: z.number().nonnegative(),
  completenessScore: z.number().min(0).max(1),
  warnings: z.array(z.string())
});

export const EarningsOutputSchema = z.object({
  symbol: z.string(),
  earnings: EarningsDataSchema,
  meta: EarningsMetaSchema
});
