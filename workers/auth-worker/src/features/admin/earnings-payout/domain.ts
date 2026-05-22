import { z } from 'zod';

/** Admin record: monthly payout to a user for commission + workflow earnings. */
export const EarningsPayoutSchema = z.object({
  /** Unique key: `${period}|${recipientUserId}` */
  payoutKey: z.string().min(1).max(120),
  /** YYYY-MM */
  period: z.string().regex(/^\d{4}-\d{2}$/),
  recipientUserId: z.string().min(1),
  recipientIdentifier: z.string().min(1),
  commissionAmountVnd: z.number().min(0).default(0),
  workflowRoyaltyAmountVnd: z.number().min(0).default(0),
  totalAmountVnd: z.number().min(0),
  status: z.enum(['pending', 'paid']).default('pending'),
  paidAt: z.string().datetime().optional(),
  paymentNote: z.string().max(500).optional(),
});

export type EarningsPayout = z.infer<typeof EarningsPayoutSchema>;

export const GeneratePayoutQrSchema = z.object({
  recipientUserId: z.string().min(1),
});
