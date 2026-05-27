import { timingSafeEqualHex, timingSafeEqualString } from '../../shared/timing-safe';

export const PENDING_SMS_LOGIN_TTL_SEC = 300;

export type PendingSmsLoginRecord = {
  identifier: string;
  otpHash?: string;
  /** @deprecated Legacy KV rows — verify only until TTL expires */
  otp?: string;
  deviceId?: string;
};

export function pendingSmsLoginKvKey(sessionId: string): string {
  return `PendingSmsLogin:${sessionId}`;
}

function normalizeSmsCode(code: string): string {
  return code.replace(/\D/g, '').slice(0, 6);
}

async function getOtpPepper(env: Env): Promise<string> {
  const secret = await env.ENCRYPTION_SECRET.get();
  if (!secret) {
    throw new Error('ENCRYPTION_SECRET is not defined in environment variables');
  }
  return secret;
}

export async function hashPendingSmsLoginOtp(
  sessionId: string,
  otp: string,
  pepper: string,
): Promise<string> {
  const normalized = normalizeSmsCode(otp);
  const data = `${sessionId}|${normalized}|${pepper}`;
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function verifyPendingSmsLoginCode(
  sessionId: string,
  code: string,
  stored: Pick<PendingSmsLoginRecord, 'otpHash' | 'otp'>,
  pepper: string,
): Promise<boolean> {
  const normalized = normalizeSmsCode(code);
  if (normalized.length !== 6) return false;

  if (stored.otpHash) {
    const expected = await hashPendingSmsLoginOtp(sessionId, normalized, pepper);
    return timingSafeEqualHex(expected, stored.otpHash);
  }

  if (stored.otp) {
    return timingSafeEqualString(normalized, normalizeSmsCode(stored.otp));
  }

  return false;
}

export function parsePendingSmsLogin(raw: string): PendingSmsLoginRecord {
  return JSON.parse(raw) as PendingSmsLoginRecord;
}

export async function storePendingSmsLogin(
  env: Env,
  sessionId: string,
  identifier: string,
  otp: string,
  deviceId?: string | null,
): Promise<void> {
  const pepper = await getOtpPepper(env);
  const otpHash = await hashPendingSmsLoginOtp(sessionId, otp, pepper);
  const payload: PendingSmsLoginRecord = {
    identifier,
    otpHash,
    ...(deviceId ? { deviceId } : {}),
  };
  await env.NONCE_KV.put(pendingSmsLoginKvKey(sessionId), JSON.stringify(payload), {
    expirationTtl: PENDING_SMS_LOGIN_TTL_SEC,
  });
}
