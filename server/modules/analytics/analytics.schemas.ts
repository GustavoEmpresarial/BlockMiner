import { z } from 'zod';

export const analyticsPeriodEnum = z.enum(['day', 'week', 'month', 'year', 'all']);

export const analyticsQuerySchema = z
  .object({
    period: analyticsPeriodEnum.default('month'),
    userId: z
      .union([z.string(), z.number()])
      .optional()
      .transform((val) => {
        if (val === undefined || val === null || val === '') return undefined;
        const n = Number(val);
        return Number.isSafeInteger(n) && n > 0 ? n : NaN;
      })
      .refine((val) => val === undefined || (!Number.isNaN(val) && val > 0 && val <= 2_147_483_647), {
        message: 'userId must be a positive 32-bit integer',
      }),
  })
  .strict();

export const executiveQuerySchema = z
  .object({
    period: analyticsPeriodEnum.default('month'),
  })
  .strict();

export type AnalyticsQueryInput = z.infer<typeof analyticsQuerySchema>;
export type ExecutiveQueryInput = z.infer<typeof executiveQuerySchema>;
