import { createLogger } from './logger';
import { AUTH_CONSTANTS } from '../features/auth/constant';
import { validationUtils } from '../features/auth/utils';

const log = createLogger('auth-worker', 'otp-abuse');

const IDENTIFIER_FAIL_PREFIX = 'OtpIdentifierVerifyFails:';

function identifierFailKey(identifier: string): string {
  return `${IDENTIFIER_FAIL_PREFIX}${validationUtils.normalizeIdentifier(identifier.trim())}`;
}

/** Cross-session verify failures for one identifier (brute force signal). */
export async function recordIdentifierOtpVerifyFailure(env: Env, identifier: string): Promise<number> {
  const key = identifierFailKey(identifier);
  const raw = await env.NONCE_KV.get(key);
  let count = 1;
  if (raw) {
    try {
      count = ((JSON.parse(raw) as { count?: number }).count ?? 0) + 1;
    } catch {
      count = 1;
    }
  }

  await env.NONCE_KV.put(key, JSON.stringify({ count }), {
    expirationTtl: 60 * 60,
  });

  if (count >= AUTH_CONSTANTS.OTP_IDENTIFIER_VERIFY_FAIL_ALERT) {
    log.warn('otp.identifier_verify_abuse', {
      identifier: validationUtils.normalizeIdentifier(identifier),
      failCount: count,
    });
  }

  return count;
}

export async function clearIdentifierOtpVerifyFailures(env: Env, identifier: string): Promise<void> {
  await env.NONCE_KV.delete(identifierFailKey(identifier));
}

export async function getIdentifierOtpVerifyFailCount(env: Env, identifier: string): Promise<number> {
  const raw = await env.NONCE_KV.get(identifierFailKey(identifier));
  if (!raw) return 0;
  try {
    return (JSON.parse(raw) as { count?: number }).count ?? 0;
  } catch {
    return 0;
  }
}

export async function isIdentifierOtpAbuseBlocked(
  env: Env,
  identifier: string,
): Promise<{ blocked: false } | { blocked: true; retryAfter: number }> {
  const count = await getIdentifierOtpVerifyFailCount(env, identifier);
  if (count < AUTH_CONSTANTS.OTP_IDENTIFIER_VERIFY_FAIL_BLOCK) {
    return { blocked: false };
  }

  return { blocked: true, retryAfter: AUTH_CONSTANTS.OTP_EXPIRY };
}
