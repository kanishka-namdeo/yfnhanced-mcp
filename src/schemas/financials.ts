import * as z from "zod";

export const FinancialsInputSchema = z.object({
  symbol: z.string().min(1).max(20),
  frequency: z.enum(["annual", "quarterly"]).optional(),
  limit: z.number().int().min(1).max(20).optional()
});

export const FinancialStatementSchema = z.object({
  period: z.string(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  balanceSheet: z.record(z.string(), z.number().nullable()).optional(),
  incomeStatement: z.record(z.string(), z.number().nullable()).optional(),
  cashFlowStatement: z.record(z.string(), z.number().nullable()).optional(),
  fieldAvailability: z.record(z.string(), z.boolean()).optional()
});

export const FinancialsOutputSchema = z.object({
  symbol: z.string().min(1).max(20),
  statements: z.array(FinancialStatementSchema),
  meta: z.object({
    fromCache: z.boolean(),
    dataAge: z.number().nonnegative(),
    completenessScore: z.number().min(0).max(1),
    warnings: z.array(z.string()),
    recency: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
  })
});
