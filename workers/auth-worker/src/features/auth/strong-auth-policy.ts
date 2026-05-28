import { Context } from 'hono';
import { createAccountAuthenticatorApplication, createAccountSmsApplication } from '../account/application';
import { createPasskeyAuthApplication } from '../account/passkey';

const STRONG_AUTH_SETUP_UNLOCK_PREFIX = 'StrongAuthSetupUnlock:';
export const STRONG_AUTH_SETUP_UNLOCK_TTL_SEC = 15 * 60; // 15 minutes
const SENSITIVE_ACTION_UNLOCK_PREFIX = 'SensitiveActionUnlock:';
export const SENSITIVE_ACTION_UNLOCK_TTL_SEC = 5 * 60; // 5 minutes
export type StepUpMethod =
  | 'passkey'
  | 'authenticator'
  | 'sms'
  | 'wallet_reauth'
  | 'facebook_oauth'
  | 'otp_email';

function isWalletIdentifier(identifier: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(identifier);
}

function isFacebookOAuthIdentifier(identifier: string): boolean {
  return identifier.startsWith('fb_') && identifier.endsWith('@oauth.user');
}

export function strongAuthSetupUnlockKey(identifier: string): string {
  return `${STRONG_AUTH_SETUP_UNLOCK_PREFIX}${identifier}`;
}

export async function isStrongAuthSetupUnlocked(
  kv: KVNamespace,
  identifier: string,
): Promise<boolean> {
  const key = strongAuthSetupUnlockKey(identifier);
  return (await kv.get(key)) !== null;
}

export async function markStrongAuthSetupUnlocked(
  kv: KVNamespace,
  identifier: string,
): Promise<void> {
  const key = strongAuthSetupUnlockKey(identifier);
  await kv.put(key, '1', { expirationTtl: STRONG_AUTH_SETUP_UNLOCK_TTL_SEC });
}

function sensitiveActionUnlockKey(identifier: string, method: StepUpMethod): string {
  return `${SENSITIVE_ACTION_UNLOCK_PREFIX}${identifier}:${method}`;
}

export async function isSensitiveActionUnlocked(
  kv: KVNamespace,
  identifier: string,
  method: StepUpMethod,
): Promise<boolean> {
  const key = sensitiveActionUnlockKey(identifier, method);
  return (await kv.get(key)) !== null;
}

export async function markSensitiveActionUnlocked(
  kv: KVNamespace,
  identifier: string,
  method: StepUpMethod,
): Promise<void> {
  const key = sensitiveActionUnlockKey(identifier, method);
  await kv.put(key, '1', { expirationTtl: SENSITIVE_ACTION_UNLOCK_TTL_SEC });
}

/** Account có số dư hoặc đã nạp tier — cần TOTP, SMS 2FA hoặc passkey trước khi dùng dashboard. */
export function userHasProtectedAssets(user: Record<string, unknown>): boolean {
  const wb = Number(user.walletBalance ?? user.wallet_balance ?? 0) || 0;
  if (wb > 0) return true;
  const topUp = Number(user.monthlyTopUpVnd ?? user.monthly_top_up_vnd ?? 0) || 0;
  return topUp > 0;
}

export async function userHasStrongSecondFactor(
  c: Context,
  bindingName: string,
  identifier: string,
): Promise<boolean> {
  const authenticatorApp = createAccountAuthenticatorApplication(c, bindingName);
  const smsApp = createAccountSmsApplication(c, bindingName);
  const [totpStatus, smsStatus] = await Promise.all([
    authenticatorApp.getAuthenticatorStatusUseCase(identifier),
    smsApp.getSmsStatusUseCase(identifier),
  ]);
  if (totpStatus.enabled || smsStatus.enabled) return true;

  const passkeyApp = createPasskeyAuthApplication(c, bindingName, {
    rpName: 'Unitoken',
    getOrigin: () => c.env.FRONTEND_URL || '',
  });
  const passkeyStatus = await passkeyApp.getPasskeyAuthStatusUseCase(identifier);
  return passkeyStatus.enabled;
}

export async function resolvePreferredStepUpMethod(
  c: Context,
  bindingName: string,
  identifier: string,
): Promise<StepUpMethod> {
  const normalized = identifier.trim();
  if (!normalized) return 'otp_email';

  const passkeyApp = createPasskeyAuthApplication(c, bindingName, {
    rpName: 'Unitoken',
    getOrigin: () => c.env.FRONTEND_URL || '',
  });
  const passkeyStatus = await passkeyApp.getPasskeyAuthStatusUseCase(normalized);
  if (passkeyStatus.enabled) return 'passkey';

  const authenticatorApp = createAccountAuthenticatorApplication(c, bindingName);
  const totpStatus = await authenticatorApp.getAuthenticatorStatusUseCase(normalized);
  if (totpStatus.enabled) return 'authenticator';

  const smsApp = createAccountSmsApplication(c, bindingName);
  const smsStatus = await smsApp.getSmsStatusUseCase(normalized);
  if (smsStatus.enabled) return 'sms';

  if (isWalletIdentifier(normalized)) return 'wallet_reauth';
  if (isFacebookOAuthIdentifier(normalized)) return 'facebook_oauth';

  return 'otp_email';
}

/** Đăng nhập được; API dashboard (trừ setup 2FA) bị chặn cho đến khi bật 2FA. */
export async function requiresStrongAuthSetup(
  c: Context,
  bindingName: string,
  user: Record<string, unknown>,
): Promise<boolean> {
  if (!userHasProtectedAssets(user)) return false;
  const identifier = String(user.identifier ?? '').trim();
  if (!identifier) return false;
  return !(await userHasStrongSecondFactor(c, bindingName, identifier));
}
