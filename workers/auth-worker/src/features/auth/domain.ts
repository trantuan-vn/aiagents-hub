import { z } from 'zod';
import { SiweMessage } from 'siwe';

// I. JWT Types
export interface JwtPayload {
  sub: string;
  identifier: string;
  exp: number;
  iat: number;
  type: string;
}

// II. OTP Schemas
export const OTPRequestSchema = z.object({
  identifier: z.string().min(1, 'Identifier is required'),
  language: z.enum(['vi', 'en']).optional(),
  /** Referral code from ref= param - links new user to referrer */
  ref: z.string().min(1).max(64).optional(),
});

export const OTPVerificationSchema = z.object({
  identifier: z.string().min(1, 'Identifier is required'),
  otp: z.string().length(6, 'OTP must be 6 digits'),
  /** Referral code - must match ref from OTP request if provided */
  ref: z.string().min(1).max(64).optional(),
});

export const TotpVerifySchema = z.object({
  code: z
    .string()
    .min(1, 'Code is required')
    .transform((s) => s.replace(/\D/g, '').slice(0, 6))
    .refine((s) => s.length === 6, 'Code must be 6 digits'),
});

export const SmsVerifyLoginSchema = z.object({
  code: z.string().length(6, 'Code must be 6 digits').regex(/^\d{6}$/, 'Code must be 6 digits'),
});

export const BackupCodeVerifySchema = z.object({
  code: z
    .string()
    .min(1, 'Backup code is required')
    .transform((s) => s.replace(/\s/g, '').replace(/-/g, '').toUpperCase())
    .refine((s) => /^[0-9A-F]{16}$/.test(s), 'Backup code must be 16 hex characters (e.g. XXXXXXXX-XXXXXXXX)'),
});

export const BackupCodeRecoverSchema = z.object({
  identifier: z.string().min(1, 'Identifier is required'),
  code: z
    .string()
    .min(1, 'Backup code is required')
    .transform((s) => s.replace(/\s/g, '').replace(/-/g, '').toUpperCase())
    .refine((s) => /^[0-9A-F]{16}$/.test(s), 'Backup code must be 16 hex characters (e.g. XXXXXXXX-XXXXXXXX)'),
});

export type OTPRequest = z.infer<typeof OTPRequestSchema>;
export type OTPVerification = z.infer<typeof OTPVerificationSchema>;
export type TotpVerify = z.infer<typeof TotpVerifySchema>;
export type SmsVerifyLogin = z.infer<typeof SmsVerifyLoginSchema>;
export type BackupCodeVerify = z.infer<typeof BackupCodeVerifySchema>;
export type BackupCodeRecover = z.infer<typeof BackupCodeRecoverSchema>;

// III. Wallet Schemas
export const SIWEAuthSchema = z.object({
  message: z.string().min(1, 'Message is required'),
  signature: z.string().min(1, 'Signature is required'),
});

export type SIWEAuth = z.infer<typeof SIWEAuthSchema>;

// IV. OAuth Schemas and Types
export const OAuthConfigSchema = z.object({
  clientId: z.string(),
  clientSecret: z.string(),
  tokenEndpoint: z.string().url(),
  userInfoEndpoint: z.string().url(),
  redirectUri: z.string().url(),
});

export const OAuthCallbackSchema = z.object({
  code: z.string(),
  state: z.string().optional(),
  error: z.string().optional(),
  error_description: z.string().optional(),
});

export const OAuthTokenResponseSchema = z.object({
  access_token: z.string(),
  token_type: z.string(),
  expires_in: z.number().optional(),
  refresh_token: z.string().optional(),
  id_token: z.string().optional(),
  scope: z.string().optional(),
});

// Provider-specific user info schemas
export const GoogleUserInfoSchema = z.object({
  sub: z.string(),
  email: z.string().email(),
  email_verified: z.boolean(),
  name: z.string().optional(),
  picture: z.string().optional(),
});

export const AppleUserInfoSchema = z.object({
  sub: z.string(),
  email: z.string().email(),
  email_verified: z.boolean().optional(),
});

export const FacebookUserInfoSchema = z.object({
  id: z.string(),
  email: z.string().email().optional(),
  name: z.string().optional(),
});

export const GitHubUserInfoSchema = z.object({
  id: z.number(),
  email: z.string().email().nullable().optional(),
  login: z.string(),
  name: z.string().optional(),
  avatar_url: z.string().optional(),
});

export const TwitterUserInfoSchema = z.object({
  data: z.object({
    id: z.string(),
    name: z.string(),
    username: z.string(),
  }),
});

export const OAuthProviderDataSchema = z.object({
  id: z.string(),
  accessToken: z.string(),
  refreshToken: z.string().optional(),
  expiresAt: z.number().optional(),
  profile: z.record(z.any()).optional(),
});

// OAuth Type Exports
export type OAuthProvider = "google" | "apple" | "facebook" | "github" | "twitter";
export type OAuthConfig = z.infer<typeof OAuthConfigSchema>;
export type OAuthProviderData = z.infer<typeof OAuthProviderDataSchema>;
export type OAuthCallback = z.infer<typeof OAuthCallbackSchema>;
export type OAuthTokenResponse = z.infer<typeof OAuthTokenResponseSchema>;
export type GoogleUserInfo = z.infer<typeof GoogleUserInfoSchema>;
export type AppleUserInfo = z.infer<typeof AppleUserInfoSchema>;
export type FacebookUserInfo = z.infer<typeof FacebookUserInfoSchema>;
export type GitHubUserInfo = z.infer<typeof GitHubUserInfoSchema>;
export type TwitterUserInfo = z.infer<typeof TwitterUserInfoSchema>;

// V. User Schemas
export const BaseUserSchema = z.object({
  identifier: z.string(),
  role: z.enum(['member', 'admin']).default('member'),
});

export const UserSchema = BaseUserSchema.extend({
  address: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  privateKey: z.string().optional(),
  mnemonicPhrase: z.string().optional(),
  /** USD balance after successful top-ups (VND payments converted at daily rate); usage deducts in USD */
  walletBalance: z.preprocess(
    (v) => (v === undefined || v === null || v === "" ? 0 : Number(v)),
    z.number().min(0),
  ).optional(),
  /** Membership tier from monthly top-up volume (VND). */
  membershipTier: z.enum(['member', 'silver', 'gold', 'diamond']).default('member').optional(),
  /** YYYY-MM period for `monthlyTopUpVnd` accumulation. */
  tierPeriodYm: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  /** Cumulative successful top-up VND in `tierPeriodYm`. */
  monthlyTopUpVnd: z.preprocess(
    (v) => (v === undefined || v === null || v === "" ? 0 : Number(v)),
    z.number().min(0),
  ).optional(),
  /** Currency for commission & workflow earnings bank payout (VietQR when VND) */
  earningsPayoutCurrency: z.enum(['VND', 'USD']).default('VND').optional(),
  /** Identifier of the referrer (user who owns the referral link) */
  referrerId: z.string().optional(),
  /** Unique referral code for this user's referral link (e.g. ABC12XYZ) */
  referralCode: z.string().min(6).max(32).optional(),
});

export type BaseUser = z.infer<typeof BaseUserSchema>;
export type User = z.infer<typeof UserSchema>;

// VI. Session Schemas
export const SessionSchema = z.object({
  hashSessionId: z.string(),
  type: z.enum(['otp', 'siwe', 'oauth', 'passkey']),
  expiresAt: z.string().datetime(),
  ipAddress: z.string().ip().optional(),
  userAgent: z.string().optional(),
  /** ISO 3166-1 Alpha 2 country code from Cloudflare cf.country */
  country: z.string().max(2).optional(),
  /** Client device UUID (X-Client-Device-Id) — nhận diện thiết bị ổn định hơn IP/UA */
  deviceId: z.string().max(64).optional(),
  isActive: z.preprocess(
    (val) => {
      // Chuyển đổi các giá trị thành boolean
      if (val === 1 || val === '1' || val === 'true') return true;
      if (val === 0 || val === '0' || val === 'false') return false;
      // Giữ nguyên nếu đã là boolean hoặc undefined/null
      return val;
    },
    z.boolean().default(true)
  ),
});

export type Session = z.infer<typeof SessionSchema>;

// VII. Repository Interfaces
export interface IUserRepository {
  get(): Promise<any>;
  save(user: any): Promise<any>;
  delete(): Promise<void>;
}

export interface ISessionRepository {
  create(sessionData: Session): Promise<any>;
  findById(sessionId: string): Promise<any>;
  existsByHashSessionId(sessionId: string): Promise<boolean>;
  listAll(limit?: number): Promise<Session[]>;
  update(sessionId: string, sessionData: Partial<Session>): Promise<void>;
  delete(sessionId: string): Promise<void>;
  deactivateAllUserSessions(identifier: string): Promise<string[]>;
}

// VIII. Service Interfaces
export interface IOTPService {
  generateOTP(sessionId: string): Promise<string>;
  verifyOTP(otp: string, sessionId: string): Promise<boolean>;
  sendEmailOTP(email: string, otp: string, language?: 'vi' | 'en'): Promise<void>;
  sendSmsOTP(phone: string, otp: string): Promise<void>;
  sendNewSessionNotification(email: string, ipAddress: string, userAgent: string, language?: 'vi' | 'en'): Promise<void>;
}

export interface IWalletService {
  generateNonceAndStore(sessionId: string): Promise<string>;
  verifySignature(sessionId: string, message: string, signature: string, expectedDomain?: string, expectedOrigin?: string): Promise<SiweMessage>;
}

export interface IOAuthService {
  generateState(sessionId: string): Promise<string>;
  exchangeOAuthCode(provider: string, state: string, code: string): Promise<{ tokenData: OAuthTokenResponse; sessionId: string }>;
  getUserInfoFromProvider(provider: string, accessToken: string): Promise<any>;
}

export interface IKvService {
  saveNonce(sessionId: string, nonce: string, expirationTtlSec?: number): Promise<void>;
  validateNonce(sessionId: string, nonce: string): Promise<boolean>;
}

// IX. Response Types
export interface AuthResponse {
  ok: boolean;
  token?: string;
  refreshToken?: string;
  user?: User;
  error?: string;
}

export interface OTPResponse {
  ok: boolean;
  message?: string;
  error?: string;
}

export interface WalletResponse {
  ok: boolean;
  nonce?: string;
  user?: User;
  error?: string;
}