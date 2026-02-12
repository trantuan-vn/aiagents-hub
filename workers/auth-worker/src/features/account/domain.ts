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

// Passkey (WebAuthn) domain – secure, phishing-resistant auth
export const PasskeyCredentialSchema = z.object({
  credentialId: z.string(), // base64url – unique per authenticator
  publicKey: z.string(), // base64url – for signature verification
  counter: z.number().int().min(0),
  deviceType: z.string().optional(), // e.g. "singleDevice" | "multiDevice"
  transports: z.string().optional(), // JSON array of transport hints
});
export type PasskeyCredentialRow = z.infer<typeof PasskeyCredentialSchema>;

export interface PasskeyStatus {
  enabled: boolean;
  credentialCount: number;
}

export interface PasskeyCredentialListItem {
  id: number;
  credentialId: string;
  deviceType?: string;
  createdAt?: string;
}

export interface IPasskeyRepository {
  getStatus(): Promise<PasskeyStatus>;
  listCredentials(): Promise<PasskeyCredentialListItem[]>;
  getCredentialByCredentialId(credentialId: string): Promise<{ id: number; publicKey: string; counter: number } | null>;
  saveCredential(data: { credentialId: string; publicKey: string; counter: number; deviceType?: string; transports?: string }): Promise<void>;
  deleteCredential(credentialId: string): Promise<void>;
}

// Backup codes – single-use recovery codes, hashed storage only
export const BackupCodeSchema = z.object({
  codeHash: z.string(), // SHA-256 hex of normalized code
  usedAt: z.string().datetime().nullish(), // when consumed (null = unused)
});
export type BackupCodeRow = z.infer<typeof BackupCodeSchema>;

export interface BackupCodeStatus {
  enabled: boolean;
  remainingCount: number;
}

export interface IBackupCodeRepository {
  getStatus(): Promise<BackupCodeStatus>;
  countUnused(): Promise<number>;
  addCodes(hashes: string[]): Promise<void>;
  consumeCode(normalizedCode: string): Promise<boolean>; // returns true if found and consumed
  deleteAll(): Promise<void>;
}

// eKYC – identity verification status (no PII stored, status only)
export const UserEkycSchema = z.object({
  status: z.enum(['not_started', 'document_submitted', 'document_verified', 'face_submitted', 'face_verified', 'verified']).default('not_started'),
  documentVerifiedAt: z.string().datetime().nullish(),
  faceVerifiedAt: z.string().datetime().nullish(),
  updatedAt: z.string().datetime().nullish(),
});
export type UserEkycRow = z.infer<typeof UserEkycSchema>;

export interface EkycStatus {
  status: 'not_started' | 'document_submitted' | 'document_verified' | 'face_submitted' | 'face_verified' | 'verified';
  documentVerifiedAt?: string;
  faceVerifiedAt?: string;
  updatedAt?: string;
}

export interface IEkycRepository {
  getStatus(): Promise<EkycStatus>;
  setDocumentSubmitted(): Promise<void>;
  setDocumentVerified(): Promise<void>;
  setFaceSubmitted(): Promise<void>;
  setFaceVerified(): Promise<void>;
  setVerified(): Promise<void>;
  reset(): Promise<void>;
}

// DID (Decentralized Identity) – did:ethr for EVM wallet ownership
export const UserDidSchema = z.object({
  did: z.string(), // e.g. did:ethr:1:0x...
  method: z.string().default('ethr'),
  chainId: z.number().int().optional(),
  addressHash: z.string(), // SHA-256 hash of address for privacy
  linkedAt: z.string().datetime(),
});
export type UserDidRow = z.infer<typeof UserDidSchema>;

export interface DidStatus {
  enabled: boolean;
  did?: string;
  method?: string;
  linkedAt?: string;
}

export interface IDidRepository {
  getStatus(): Promise<DidStatus>;
  getByAddressHash(addressHash: string): Promise<{ did: string; method: string; linkedAt: string } | null>;
  save(data: { did: string; method: string; chainId?: number; addressHash: string }): Promise<void>;
  delete(): Promise<void>;
}
