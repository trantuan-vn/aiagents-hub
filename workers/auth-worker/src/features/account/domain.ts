import { z } from 'zod';

// One row per user (userScoped) for TOTP and SMS 2FA; pending until verified
// Use .nullish() so DB nulls pass validation (optional() only allows undefined)
export const UserMfaSchema = z.object({
  totpSecret: z.string().nullish(),
  enabledAt: z.string().datetime().nullish(),
  pendingSecret: z.string().nullish(),
  pendingAt: z.string().datetime().nullish(),
  // SMS 2FA: store only hash of phone (no PII), pending until OTP verified
  phoneHash: z.string().nullish(),
  smsEnabledAt: z.string().datetime().nullish(),
  pendingPhoneHash: z.string().nullish(),
  pendingPhoneAt: z.string().datetime().nullish(),
});
export type UserMfa = z.infer<typeof UserMfaSchema>;

// Session list item (for account session management)
export interface SessionListItem {
  id: number;
  hashSessionId: string;
  type: string;
  ipAddress?: string;
  userAgent?: string;
  expiresAt: string;
  isActive: boolean;
  isCurrent?: boolean;
}

// Authenticator (TOTP) domain
export const VerifyAuthenticatorSchema = z.object({
  code: z.string().length(6, 'Code must be 6 digits').regex(/^\d{6}$/, 'Code must be 6 digits'),
});
export type VerifyAuthenticatorInput = z.infer<typeof VerifyAuthenticatorSchema>;

export const DisableAuthenticatorSchema = z.object({
  code: z.string().length(6, 'Code must be 6 digits').regex(/^\d{6}$/, 'Code must be 6 digits'),
});
export type DisableAuthenticatorInput = z.infer<typeof DisableAuthenticatorSchema>;

export interface AuthenticatorStatus {
  enabled: boolean;
  enabledAt?: string;
}

export interface AuthenticatorSetupResult {
  secret: string;
  qrCodeUrl: string;
  backupCodes?: string[];
}

export interface IAuthenticatorRepository {
  getStatus(): Promise<AuthenticatorStatus>;
  getSecret(): Promise<string | null>;
  getPendingSecret(): Promise<string | null>;
  setPendingSecret(secret: string): Promise<void>;
  setSecret(secret: string): Promise<void>;
  clearSecret(): Promise<void>;
  confirmPendingAsEnabled(): Promise<void>;
}

// SMS 2FA domain
export interface SmsStatus {
  enabled: boolean;
  enabledAt?: string;
}

export const RequestSmsSchema = z.object({
  phone: z.string().min(10, 'Invalid phone').max(20),
});
export type RequestSmsInput = z.infer<typeof RequestSmsSchema>;

export const VerifySmsSchema = z.object({
  code: z.string().length(6, 'Code must be 6 digits').regex(/^\d{6}$/, 'Code must be 6 digits'),
});
export type VerifySmsInput = z.infer<typeof VerifySmsSchema>;

export const DisableSmsSchema = z.object({
  code: z.string().length(6, 'Code must be 6 digits').regex(/^\d{6}$/, 'Code must be 6 digits'),
});
export type DisableSmsInput = z.infer<typeof DisableSmsSchema>;

export interface ISmsRepository {
  getSmsStatus(): Promise<SmsStatus>;
  getPhoneHash(): Promise<string | null>;
  getPendingPhoneHash(): Promise<string | null>;
  setPendingPhoneHash(phoneHash: string): Promise<void>;
  confirmPendingSmsAsEnabled(): Promise<void>;
  clearSms(): Promise<void>;
}
