import * as z from "zod";

export const QuoteInputSchema = z.object({
  symbols: z.array(z.string().min(1).max(10)).min(1).max(100),
  fields: z.array(z.string()).optional(),
  forceRefresh: z.boolean().optional(),
  timeout: z.number().int().min(100).max(60000).optional()
});

export const QuoteResultSchema = z.object({
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

export const QuoteOutputSchema = z.object({
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
