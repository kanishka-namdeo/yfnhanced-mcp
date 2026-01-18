import * as z from 'zod';

export const NewsInputSchema = z.object({
  symbol: z.string().min(1).max(20),
  limit: z.number().int().min(1).max(50).optional(),
  startDate: z.string().optional(),
  requireRelatedTickers: z.boolean().optional()
});

export const NewsItemSchema = z.object({
  uuid: z.string(),
  title: z.string(),
  publisher: z.string(),
  link: z.string(),
  providerPublishTime: z.number(),
  type: z.string(),
  publishDate: z.string(),
  urlValid: z.boolean(),
  relatedTickers: z.array(z.string())
});

export const NewsMetaSchema = z.object({
  fromCache: z.boolean(),
  dataAge: z.number().nonnegative(),
  completenessScore: z.number().min(0).max(1),
  warnings: z.array(z.string()),
  dataSource: z.string(),
  lastUpdated: z.string(),
  oldestArticleAge: z.number().nullable(),
  newestArticleAge: z.number().nullable()
});

export const NewsOutputSchema = z.object({
  symbol: z.string(),
  news: z.array(NewsItemSchema),
  count: z.number().int().nonnegative(),
  meta: NewsMetaSchema
});
