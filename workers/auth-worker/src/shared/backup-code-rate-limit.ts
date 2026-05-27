import { AUTH_CONSTANTS, ERROR_MESSAGES } from '../features/auth/constant';
import { validationUtils } from '../features/auth/utils';
import { OtpRateLimitError } from './otp-rate-limit';

const RECOVER_ATTEMPTS_PREFIX = 'BackupCodeRecoverAttempts:';
const RECOVER_HOUR_PREFIX = 'BackupCodeRecoverHour:';

type HourlyBucket = { count: number; windowStart: number };

function normalizeIdentifier(identifier: string): string {
  return validationUtils.normalizeIdentifier(identifier.trim());
}

async function checkHourlyCap(
  env: Env,
  key: string,
  max: number,
): Promise<{ allowed: true } | { allowed: false; retryAfter: number }> {
  const now = Date.now();
  const windowMs = 60 * 60 * 1000;
  const raw = await env.NONCE_KV.get(key);
  let bucket: HourlyBucket = { count: 0, windowStart: now };

  if (raw) {
    try {
      bucket = JSON.parse(raw) as HourlyBucket;
    } catch {
      bucket = { count: 0, windowStart: now };
    }
  }

  if (now - bucket.windowStart > windowMs) {
    bucket = { count: 0, windowStart: now };
  }

  if (bucket.count >= max) {
    const retryAfter = Math.max(1, Math.ceil((bucket.windowStart + windowMs - now) / 1000));
    return { allowed: false, retryAfter };
  }

  return { allowed: true };
}

async function incrementHourlyCap(env: Env, key: string): Promise<void> {
  const now = Date.now();
  const windowMs = 60 * 60 * 1000;
  const raw = await env.NONCE_KV.get(key);
  let bucket: HourlyBucket = { count: 0, windowStart: now };

  if (raw) {
    try {
      bucket = JSON.parse(raw) as HourlyBucket;
    } catch {
      bucket = { count: 0, windowStart: now };
    }
  }

  if (now - bucket.windowStart > windowMs) {
    bucket = { count: 1, windowStart: now };
  } else {
    bucket.count += 1;
  }

  await env.NONCE_KV.put(key, JSON.stringify(bucket), { expirationTtl: 2 * 60 * 60 });
}

export async function checkBackupCodeRecoverAllowed(
  env: Env,
  identifier: string,
): Promise<{ allowed: true } | { allowed: false; retryAfter: number }> {
  const normId = normalizeIdentifier(identifier);
  const attemptsKey = `${RECOVER_ATTEMPTS_PREFIX}${normId}`;
  const raw = await env.NONCE_KV.get(attemptsKey);
  if (raw) {
    let count = 0;
    try {
      count = (JSON.parse(raw) as { count?: number }).count ?? 0;
    } catch {
      count = 0;
    }
    if (count >= AUTH_CONSTANTS.BACKUP_CODE_RECOVER_MAX_ATTEMPTS) {
      return { allowed: false, retryAfter: AUTH_CONSTANTS.OTP_EXPIRY };
    }
  }

  return checkHourlyCap(
    env,
    `${RECOVER_HOUR_PREFIX}${normId}`,
    AUTH_CONSTANTS.BACKUP_CODE_RECOVER_MAX_PER_IDENTIFIER_HOUR,
  );
}

export async function recordBackupCodeRecoverFailure(env: Env, identifier: string): Promise<void> {
  const normId = normalizeIdentifier(identifier);
  const attemptsKey = `${RECOVER_ATTEMPTS_PREFIX}${normId}`;
  const raw = await env.NONCE_KV.get(attemptsKey);
  let count = 1;
  if (raw) {
    try {
      count = ((JSON.parse(raw) as { count?: number }).count ?? 0) + 1;
    } catch {
      count = 1;
    }
  }

  await env.NONCE_KV.put(attemptsKey, JSON.stringify({ count }), {
    expirationTtl: AUTH_CONSTANTS.OTP_EXPIRY,
  });

  await incrementHourlyCap(env, `${RECOVER_HOUR_PREFIX}${normId}`);
}

export async function clearBackupCodeRecoverAttempts(env: Env, identifier: string): Promise<void> {
  await env.NONCE_KV.delete(`${RECOVER_ATTEMPTS_PREFIX}${normalizeIdentifier(identifier)}`);
}

export async function assertBackupCodeRecoverAllowed(env: Env, identifier: string): Promise<void> {
  const allowed = await checkBackupCodeRecoverAllowed(env, identifier);
  if (!allowed.allowed) {
    throw new OtpRateLimitError(allowed.retryAfter, ERROR_MESSAGES.AUTH.RATE_LIMIT_EXCEEDED);
  }
}
