import { timingSafeEqualHex } from '../../shared/timing-safe';

export const SENSITIVE_SMS_STEP_UP_KV_PREFIX = 'SensitiveSmsStepUp:';

export type SensitiveSmsStepUpOtpRecord = {
  otpHash: string;
  /** @deprecated Legacy KV rows — verify only until TTL expires */
  otp?: string;
};

function normalizeStepUpOtpCode(otp: string): string {
  return otp.replace(/\D/g, '').slice(0, 6);
}

export function sensitiveSmsStepUpKvKey(identifier: string): string {
  return `${SENSITIVE_SMS_STEP_UP_KV_PREFIX}${identifier.trim().toLowerCase()}`;
}

export async function hashSensitiveSmsStepUpOtp(
  identifier: string,
  otp: string,
  pepper: string,
): Promise<string> {
  const normalized = normalizeStepUpOtpCode(otp);
  const normId = identifier.trim().toLowerCase();
  const data = `sms-step-up|${normId}|${normalized}|${pepper}`;
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function verifySensitiveSmsStepUpOtp(
  identifier: string,
  otp: string,
  stored: Pick<SensitiveSmsStepUpOtpRecord, 'otpHash' | 'otp'>,
  pepper: string,
): Promise<boolean> {
  const normalized = normalizeStepUpOtpCode(otp);
  if (normalized.length !== 6) return false;

  if (stored.otpHash) {
    const expected = await hashSensitiveSmsStepUpOtp(identifier, normalized, pepper);
    return timingSafeEqualHex(expected, stored.otpHash);
  }

  if (stored.otp) {
    return normalized === normalizeStepUpOtpCode(stored.otp);
  }

  return false;
}
