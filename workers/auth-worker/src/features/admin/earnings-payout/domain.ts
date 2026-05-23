import { z } from 'zod';

/** Map legacy VND amount columns into USD fields for rows created before the USD migration. */
export function normalizeLegacyEarningsPayoutAmounts(
  row: Record<string, unknown>,
): Record<string, unknown> {
  const parsed = { ...row };
  if (parsed.commissionAmountUsd == null && parsed.commissionAmountVnd != null) {
    parsed.commissionAmountUsd = parsed.commissionAmountVnd;
  }
  if (parsed.workflowRoyaltyAmountUsd == null && parsed.workflowRoyaltyAmountVnd != null) {
    parsed.workflowRoyaltyAmountUsd = parsed.workflowRoyaltyAmountVnd;
  }
  if (parsed.totalAmountUsd == null && parsed.totalAmountVnd != null) {
    parsed.totalAmountUsd = parsed.totalAmountVnd;
  }
  return parsed;
}

/** Admin record: monthly payout to a user for commission + workflow earnings. */
export const EarningsPayoutSchema = z.object({
  /** Unique key: `${period}|${recipientUserId}` */
  payoutKey: z.string().min(1).max(120),
  /** YYYY-MM */
  period: z.string().regex(/^\d{4}-\d{2}$/),
  recipientUserId: z.string().min(1),
  recipientIdentifier: z.string().min(1),
  /** Legacy columns on admin DO SQLite rows (pre-USD migration). */
  commissionAmountVnd: z.number().min(0).optional(),
  workflowRoyaltyAmountVnd: z.number().min(0).optional(),
  totalAmountVnd: z.number().min(0).optional(),
  commissionAmountUsd: z.number().min(0).default(0),
  workflowRoyaltyAmountUsd: z.number().min(0).default(0),
  totalAmountUsd: z.number().min(0),
  status: z.enum(['pending', 'paid']).default('pending'),
  paidAt: z.string().datetime().optional(),
  paymentNote: z.string().max(500).optional(),
});

export type EarningsPayout = z.infer<typeof EarningsPayoutSchema>;

export const GeneratePayoutQrSchema = z.object({
  recipientUserId: z.string().min(1),
});
