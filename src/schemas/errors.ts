import * as z from "zod";

export const ErrorDetailSchema = z.object({
  symbol: z.string().min(1),
  error: z.string().min(1),
  code: z.string().min(1)
});

export const ErrorOutputSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  statusCode: z.number().int().min(100).max(599).optional(),
  isRetryable: z.boolean(),
  isRateLimit: z.boolean(),
  context: z.record(z.string(), z.unknown()).optional(),
  suggestedAction: z.string().min(1)
});
