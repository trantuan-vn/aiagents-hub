import { AUTH_CONSTANTS, ERROR_MESSAGES } from '../features/auth/constant';
import { validationUtils } from '../features/auth/utils';
import { OtpRateLimitError } from './otp-rate-limit';

const STEP_UP_VERIFY_ATTEMPTS_PREFIX = 'StepUpVerifyAttempts:';

function stepUpVerifyAttemptsKey(identifier: string): string {
  const normId = validationUtils.normalizeIdentifier(identifier.trim());
  return `${STEP_UP_VERIFY_ATTEMPTS_PREFIX}${normId}`;
}

export async function clearStepUpVerifyAttempts(env: Env, identifier: string): Promise<void> {
  await env.NONCE_KV.delete(stepUpVerifyAttemptsKey(identifier));
}

export async function checkStepUpVerifyBlocked(
  env: Env,
  identifier: string,
): Promise<{ blocked: false } | { blocked: true; retryAfter: number }> {
  const raw = await env.NONCE_KV.get(stepUpVerifyAttemptsKey(identifier));
  if (!raw) return { blocked: false };

  let count = 0;
  try {
    count = (JSON.parse(raw) as { count?: number }).count ?? 0;
  } catch {
    return { blocked: false };
  }

  if (count < AUTH_CONSTANTS.STEP_UP_VERIFY_MAX_ATTEMPTS) {
    return { blocked: false };
  }

  return { blocked: true, retryAfter: AUTH_CONSTANTS.STEP_UP_SMS_OTP_TTL_SEC };
}

export async function recordStepUpVerifyFailure(
  env: Env,
  identifier: string,
  sessionId?: string,
): Promise<number> {
  const key = stepUpVerifyAttemptsKey(identifier);
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
    expirationTtl: AUTH_CONSTANTS.STEP_UP_SMS_OTP_TTL_SEC,
  });

  if (sessionId?.trim()) {
    const { invalidateCaptchaSatisfactionOnVerifyFailure } = await import('./human-challenge');
    await invalidateCaptchaSatisfactionOnVerifyFailure(env, 'session', sessionId, count);
  }

  return count;
}

export async function assertStepUpVerifyNotBlocked(env: Env, identifier: string): Promise<void> {
  const blocked = await checkStepUpVerifyBlocked(env, identifier);
  if (blocked.blocked) {
    throw new OtpRateLimitError(blocked.retryAfter, ERROR_MESSAGES.AUTH.RATE_LIMIT_EXCEEDED);
  }
}

/** Record a failed step-up verify and throw rate-limit or generic invalid error. */
export async function failStepUpVerify(
  env: Env,
  identifier: string,
  sessionId?: string,
  message = 'Invalid verification code',
): Promise<never> {
  await recordStepUpVerifyFailure(env, identifier, sessionId);
  const afterFail = await checkStepUpVerifyBlocked(env, identifier);
  if (afterFail.blocked) {
    throw new OtpRateLimitError(afterFail.retryAfter, ERROR_MESSAGES.AUTH.RATE_LIMIT_EXCEEDED);
  }
  throw new Error(message);
}
