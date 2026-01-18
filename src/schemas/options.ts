import * as z from 'zod';

export const OptionsInputSchema = z.object({
  symbol: z.string().min(1).max(20),
  date: z.string().optional(),
  expiration: z.string().optional(),
  optionsType: z.enum(['calls', 'puts', 'both']).optional(),
  includeGreeks: z.boolean().optional()
});

export const OptionContractSchema = z.object({
  contractSymbol: z.string(),
  strike: z.number(),
  lastPrice: z.number().nullable(),
  change: z.number().nullable(),
  percentChange: z.number().nullable(),
  volume: z.number().int().nonnegative(),
  openInterest: z.number().int().nonnegative(),
  bid: z.number().nullable(),
  ask: z.number().nullable(),
  impliedVolatility: z.number().nullable(),
  inTheMoney: z.boolean(),
  contractSize: z.number().int().nonnegative(),
  currency: z.string(),
  delta: z.number().nullable(),
  gamma: z.number().nullable(),
  theta: z.number().nullable(),
  vega: z.number().nullable()
});

export const OptionsExpirationSchema = z.object({
  expirationDate: z.string(),
  date: z.number(),
  hasMiniOptions: z.boolean(),
  calls: z.array(OptionContractSchema),
  puts: z.array(OptionContractSchema)
});

export const OptionsMetaSchema = z.object({
  fromCache: z.boolean(),
  dataAge: z.number().nonnegative(),
  completenessScore: z.number().min(0).max(1),
  warnings: z.array(z.string()),
  dataSource: z.string(),
  lastUpdated: z.string(),
  availableExpirations: z.array(z.string()),
  requestedExpiration: z.string().nullable(),
  fallbackExpiration: z.boolean(),
  ivCalculationMethod: z.string()
});

export const OptionsOutputSchema = z.object({
  symbol: z.string(),
  options: OptionsExpirationSchema,
  expirationDates: z.array(z.string()),
  meta: OptionsMetaSchema
});
