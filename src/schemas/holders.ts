import * as z from 'zod';

export const HoldersInputSchema = z.object({
  symbol: z.string().min(1).max(20),
  includeChangeHistory: z.boolean().optional()
});

export const HolderResultSchema = z.object({
  holderName: z.string(),
  holderType: z.enum(['company', 'individual', 'institution']),
  relation: z.enum(['direct', 'indirect']),
  lastReported: z.string(),
  positionDirect: z.number().nullable(),
  positionDirectDate: z.string().nullable(),
  positionIndirect: z.number().nullable(),
  positionIndirectDate: z.string().nullable(),
  position: z.number().nullable(),
  changeHistory: z.array(z.object({
    date: z.string(),
    shares: z.number(),
    change: z.number(),
    changePercent: z.number()
  })).optional()
});

export const MajorHoldersBreakdownSchema = z.object({
  insidersPercentHeld: z.number(),
  institutionsPercentHeld: z.number(),
  institutionsFloatPercentHeld: z.number(),
  institutionsCount: z.number()
});

export const HoldersMetaSchema = z.object({
  fromCache: z.boolean(),
  dataAge: z.number().nonnegative(),
  completenessScore: z.number().min(0).max(1),
  warnings: z.array(z.string()),
  dataSource: z.string(),
  lastUpdated: z.string()
});

export const HoldersOutputSchema = z.object({
  symbol: z.string(),
  majorHoldersBreakdown: MajorHoldersBreakdownSchema,
  institutionalHolders: z.array(HolderResultSchema),
  fundHolders: z.array(HolderResultSchema),
  insiderHolders: z.array(HolderResultSchema),
  directHolders: z.array(HolderResultSchema),
  meta: HoldersMetaSchema
});
