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

/** PayPal account for USD earnings payout (PayPal Payouts API). */
export const PaypalPayoutBeneficiarySchema = z.object({
  paypalEmail: z.string().email().max(254),
});

export type PaypalPayoutBeneficiary = z.infer<typeof PaypalPayoutBeneficiarySchema>;

export const PaypalPayoutBeneficiaryUpsertSchema = PaypalPayoutBeneficiarySchema;

/** Persisted row: sensitive fields encrypted (see payout/crypto.ts). */
export const PayoutBeneficiaryRecordSchema = z.object({
  accountNoEncrypted: z.string().nullish(),
  accountNameEncrypted: z.string().nullish(),
  /** Legacy plaintext — cleared after migration on read/upsert */
  accountNo: z.string().nullish(),
  accountName: z.string().nullish(),
  acqId: z.string().min(6).max(10).nullish(),
  bankName: z.string().max(100).nullish(),
  paypalEmailEncrypted: z.string().nullish(),
  /** Legacy plaintext — cleared after migration on read/upsert */
  paypalEmail: z.string().nullish(),
});

export type PayoutBeneficiaryRecord = z.infer<typeof PayoutBeneficiaryRecordSchema>;
