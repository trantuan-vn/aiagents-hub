import { z } from 'zod';

/** Bank account for receiving commission & workflow earnings (VietQR payout). */
export const PayoutBeneficiarySchema = z.object({
  accountNo: z.string().min(8).max(20),
  accountName: z.string().min(1).max(100),
  /** Bank BIN (e.g. 970422 for MB) */
  acqId: z.string().min(6).max(10),
  bankName: z.string().max(100).optional(),
});

export type PayoutBeneficiary = z.infer<typeof PayoutBeneficiarySchema>;

export const PayoutBeneficiaryUpsertSchema = PayoutBeneficiarySchema;
