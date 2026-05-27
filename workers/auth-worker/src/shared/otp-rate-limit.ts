import { AUTH_CONSTANTS, ERROR_MESSAGES } from '../features/auth/constant';

const OTP_VERIFY_ATTEMPTS_PREFIX = 'OtpVerifyAttempts:';
const OTP_REQUEST_ID_PREFIX = 'OtpRequestId:';
const OTP_REQUEST_IP_HOUR_PREFIX = 'OtpRequestIpHour:';
const OTP_REQUEST_ID_HOUR_PREFIX = 'OtpRequestIdHour:';

/** Thrown for OTP verify/request rate limits (includes retryAfter for 429 responses). */
export class OtpRateLimitError extends Error {
  readonly retryAfter: number;

  constructor(retryAfter: number, message = ERROR_MESSAGES.AUTH.RATE_LIMIT_EXCEEDED) {
    super(message);
    this.name = 'OtpRateLimitError';
    this.retryAfter = retryAfter;
  }
}

function otpVerifyAttemptsKey(sessionId: string): string {
  return `${OTP_VERIFY_ATTEMPTS_PREFIX}${sessionId}`;
}

function normalizeRequestIdentifier(identifier: string): string {
  return identifier.trim().toLowerCase();
}

export async function clearOtpVerifyAttempts(env: Env, sessionId: string): Promise<void> {
  await env.NONCE_KV.delete(otpVerifyAttemptsKey(sessionId));
}

export async function checkOtpVerifyBlocked(
  env: Env,
  sessionId: string,
): Promise<{ blocked: false } | { blocked: true; retryAfter: number }> {
  const raw = await env.NONCE_KV.get(otpVerifyAttemptsKey(sessionId));
  if (!raw) return { blocked: false };

  let count = 0;
  try {
    count = (JSON.parse(raw) as { count?: number }).count ?? 0;
  } catch {
    return { blocked: false };
  }

  if (count < AUTH_CONSTANTS.OTP_VERIFY_MAX_ATTEMPTS) {
    return { blocked: false };
  }

  return { blocked: true, retryAfter: AUTH_CONSTANTS.OTP_EXPIRY };
}

export async function recordOtpVerifyFailure(env: Env, sessionId: string): Promise<void> {
  const key = otpVerifyAttemptsKey(sessionId);
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
    expirationTtl: AUTH_CONSTANTS.OTP_EXPIRY,
  });
}

type HourlyBucket = { count: number; windowStart: number };

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

  await env.NONCE_KV.put(key, JSON.stringify(bucket), {
    expirationTtl: 2 * 60 * 60,
  });
}

export async function checkOtpRequestAllowed(
  env: Env,
  ip: string,
  identifier: string,
): Promise<{ allowed: true } | { allowed: false; retryAfter: number }> {
  const normId = normalizeRequestIdentifier(identifier);
  const now = Date.now();
  const cooldownMs = AUTH_CONSTANTS.OTP_REQUEST_COOLDOWN_SEC * 1000;

  const idCooldownKey = `${OTP_REQUEST_ID_PREFIX}${normId}`;
  const idCooldownRaw = await env.NONCE_KV.get(idCooldownKey);
  if (idCooldownRaw) {
    try {
      const { lastAt } = JSON.parse(idCooldownRaw) as { lastAt: number };
      const elapsed = now - lastAt;
      if (elapsed < cooldownMs) {
        return {
          allowed: false,
          retryAfter: Math.max(1, Math.ceil((cooldownMs - elapsed) / 1000)),
        };
      }
    } catch {
      /* ignore corrupt KV */
    }
  }

  const idHourly = await checkHourlyCap(
    env,
    `${OTP_REQUEST_ID_HOUR_PREFIX}${normId}`,
    AUTH_CONSTANTS.OTP_REQUEST_MAX_PER_IDENTIFIER_HOUR,
  );
  if (!idHourly.allowed) {
    return idHourly;
  }

  if (ip) {
    const ipHourly = await checkHourlyCap(
      env,
      `${OTP_REQUEST_IP_HOUR_PREFIX}${ip}`,
      AUTH_CONSTANTS.OTP_REQUEST_MAX_PER_IP_HOUR,
    );
    if (!ipHourly.allowed) {
      return ipHourly;
    }
  }

  return { allowed: true };
}

export async function recordOtpRequest(env: Env, ip: string, identifier: string): Promise<void> {
  const normId = normalizeRequestIdentifier(identifier);
  const now = Date.now();

  await env.NONCE_KV.put(
    `${OTP_REQUEST_ID_PREFIX}${normId}`,
    JSON.stringify({ lastAt: now }),
    { expirationTtl: AUTH_CONSTANTS.OTP_REQUEST_COOLDOWN_SEC + 10 },
  );

  await incrementHourlyCap(env, `${OTP_REQUEST_ID_HOUR_PREFIX}${normId}`);

  if (ip) {
    await incrementHourlyCap(env, `${OTP_REQUEST_IP_HOUR_PREFIX}${ip}`);
  }
}
