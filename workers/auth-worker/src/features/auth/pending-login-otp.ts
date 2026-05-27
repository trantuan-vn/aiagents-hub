import { timingSafeEqualHex, timingSafeEqualString } from '../../shared/timing-safe';

export type PendingLoginOtpRecord = {
  identifier: string;
  otpHash?: string;
  /** @deprecated Legacy KV rows — verify only until TTL expires */
  nonce?: string;
};

function normalizeLoginOtpCode(otp: string): string {
  return otp.replace(/\D/g, '').slice(0, 6);
}

export async function hashPendingLoginOtp(
  sessionId: string,
  identifier: string,
  otp: string,
  pepper: string,
): Promise<string> {
  const normalized = normalizeLoginOtpCode(otp);
  const normId = identifier.trim().toLowerCase();
  const data = `${sessionId}|${normId}|${normalized}|${pepper}`;
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function verifyPendingLoginOtp(
  sessionId: string,
  identifier: string,
  otp: string,
  stored: Pick<PendingLoginOtpRecord, 'otpHash' | 'nonce'>,
  pepper: string,
): Promise<boolean> {
  const normalized = normalizeLoginOtpCode(otp);
  if (normalized.length !== 6) return false;

  if (stored.otpHash) {
    const expected = await hashPendingLoginOtp(sessionId, identifier, normalized, pepper);
    return timingSafeEqualHex(expected, stored.otpHash);
  }

  if (stored.nonce) {
    return timingSafeEqualString(normalized, normalizeLoginOtpCode(stored.nonce));
  }

  return false;
}
