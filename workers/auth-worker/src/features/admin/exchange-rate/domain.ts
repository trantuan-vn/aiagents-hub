import { z } from 'zod';

/** Daily USD/VND rate — one row per calendar day (admin-managed). */
export const ExchangeRateSchema = z.object({
  /** YYYY-MM-DD — unique per day */
  rateDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** VND per 1 USD */
  usdVndRate: z.number().min(1).max(10000000),
});

export type ExchangeRate = z.infer<typeof ExchangeRateSchema>;

export const UpsertExchangeRateSchema = ExchangeRateSchema;

export const DEFAULT_USD_VND_RATE = 26000;
