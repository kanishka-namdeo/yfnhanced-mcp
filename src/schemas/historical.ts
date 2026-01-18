import * as z from "zod";

export const HistoricalInputSchema = z.object({
  symbol: z.string().min(1).max(20),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  interval: z.enum(["1m", "2m", "5m", "15m", "30m", "60m", "90m", "1h", "1d", "5d", "1wk", "1mo", "3mo"]).optional(),
  validateData: z.boolean().optional()
});

export const HistoricalPriceSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  open: z.number().nonnegative(),
  high: z.number().nonnegative(),
  low: z.number().nonnegative(),
  close: z.number().nonnegative(),
  adjclose: z.number().nonnegative(),
  volume: z.number().int().nonnegative(),
  isGap: z.boolean().optional(),
  isSplit: z.boolean().optional(),
  hasNulls: z.boolean().optional()
});

export const HistoricalOutputSchema = z.object({
  symbol: z.string().min(1).max(20),
  data: z.array(HistoricalPriceSchema),
  meta: z.object({
    fromCache: z.boolean(),
    dataAge: z.number().nonnegative(),
    completenessScore: z.number().min(0).max(1),
    warnings: z.array(z.string()),
    integrityFlags: z.array(z.string())
  })
});
