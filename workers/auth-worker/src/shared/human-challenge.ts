import { AUTH_CONSTANTS } from '../features/auth/constant';
import { getIdentifierOtpVerifyFailCount } from './otp-abuse-monitor';
import {
  CaptchaRequiredError,
  getTurnstileSiteKey,
  InvalidCaptchaError,
  isTurnstileEnabled,
  verifyTurnstileToken,
} from './turnstile';

export type HumanChallengeScope = 'preauth' | 'session';

const CAPTCHA_OK_KEY = {
  preauth: 'CaptchaOk:preauth:',
  session: 'CaptchaOk:session:',
} as const;

type CaptchaSatisfiedRecord = { ip?: string };

function captchaOkKey(scope: HumanChallengeScope, sessionId: string): string | null {
  const id = sessionId.trim();
  if (!id) return null;
  return `${CAPTCHA_OK_KEY[scope]}${id}`;
}

function parseSatisfiedRecord(raw: string): CaptchaSatisfiedRecord | null {
  if (raw === '1') return {};
  try {
    return JSON.parse(raw) as CaptchaSatisfiedRecord;
  } catch {
    return null;
  }
}

/** True when KV entry exists and optional IP still matches the satisfied request. */
export async function isCaptchaSatisfied(
  env: Env,
  scope: HumanChallengeScope,
  sessionId: string,
  remoteIp?: string,
): Promise<boolean> {
  const key = captchaOkKey(scope, sessionId);
  if (!key || !env.NONCE_KV) return false;

  const raw = await env.NONCE_KV.get(key);
  if (!raw) return false;

  const record = parseSatisfiedRecord(raw);
  if (!record) return false;

  const storedIp = record.ip?.trim();
  const currentIp = remoteIp?.trim();
  if (storedIp && currentIp && storedIp !== currentIp) {
    await env.NONCE_KV.delete(key);
    return false;
  }

  return true;
}

export async function markCaptchaSatisfied(
  env: Env,
  scope: HumanChallengeScope,
  sessionId: string,
  remoteIp?: string,
): Promise<void> {
  const key = captchaOkKey(scope, sessionId);
  if (!key || !env.NONCE_KV) return;

  const payload: CaptchaSatisfiedRecord = {};
  const ip = remoteIp?.trim();
  if (ip) payload.ip = ip;

  await env.NONCE_KV.put(key, JSON.stringify(payload), {
    expirationTtl: AUTH_CONSTANTS.CAPTCHA_SATISFIED_TTL_SEC,
  });
}

export async function clearCaptchaSatisfied(
  env: Env,
  scope: HumanChallengeScope,
  sessionId: string,
): Promise<void> {
  const key = captchaOkKey(scope, sessionId);
  if (!key || !env.NONCE_KV) return;
  await env.NONCE_KV.delete(key);
}

/** Drop satisfaction after repeated verify failures (bot / guessing). */
export async function invalidateCaptchaSatisfactionOnVerifyFailure(
  env: Env,
  scope: HumanChallengeScope,
  sessionId: string,
  failureCount: number,
): Promise<void> {
  if (!sessionId.trim()) return;
  if (failureCount < AUTH_CONSTANTS.CAPTCHA_CLEAR_AFTER_OTP_VERIFY_FAILS) return;
  await clearCaptchaSatisfied(env, scope, sessionId);
}

export type HumanChallengeReason = 'otp_request' | 'backup_recover';

function hasOtpRequestAbuseSignals(
  failCount: number,
  otpRequestsThisHour: number,
): boolean {
  return (
    failCount >= AUTH_CONSTANTS.OTP_CAPTCHA_REQUIRED_AFTER_IDENTIFIER_FAILS ||
    otpRequestsThisHour >= AUTH_CONSTANTS.OTP_REQUEST_CAPTCHA_AFTER_HOURLY - 1
  );
}

async function canSkipWithCaptchaSatisfaction(
  env: Env,
  options: {
    scope: HumanChallengeScope;
    sessionId: string;
    ip: string;
    identifier: string;
    otpRequestsThisHour?: number;
    reason: HumanChallengeReason;
  },
): Promise<boolean> {
  if (!(await isCaptchaSatisfied(env, options.scope, options.sessionId, options.ip))) {
    return false;
  }

  if (options.reason === 'backup_recover') {
    return true;
  }

  const failCount = await getIdentifierOtpVerifyFailCount(env, options.identifier);
  const requests = options.otpRequestsThisHour ?? 0;
  return !hasOtpRequestAbuseSignals(failCount, requests);
}

export async function shouldRequireHumanChallenge(
  env: Env,
  options: {
    identifier: string;
    otpRequestsThisHour?: number;
    reason: HumanChallengeReason;
  },
): Promise<boolean> {
  const enabled = await isTurnstileEnabled(env);
  if (!enabled) return false;

  if (options.reason === 'backup_recover') {
    return true;
  }

  const failCount = await getIdentifierOtpVerifyFailCount(env, options.identifier);
  const requests = options.otpRequestsThisHour ?? 0;
  return hasOtpRequestAbuseSignals(failCount, requests);
}

/**
 * Risk-based Turnstile: verify once per scope+session (KV TTL), then skip until expiry or invalidation.
 */
export async function assertHumanChallenge(
  env: Env,
  options: {
    scope: HumanChallengeScope;
    sessionId: string;
    identifier: string;
    ip: string;
    turnstileToken?: string;
    otpRequestsThisHour?: number;
    reason: HumanChallengeReason;
  },
): Promise<void> {
  const enabled = await isTurnstileEnabled(env);
  if (!enabled) return;

  const { scope, sessionId, ip, turnstileToken } = options;

  const required = await shouldRequireHumanChallenge(env, {
    identifier: options.identifier,
    otpRequestsThisHour: options.otpRequestsThisHour,
    reason: options.reason,
  });
  if (!required) return;

  if (
    await canSkipWithCaptchaSatisfaction(env, {
      scope,
      sessionId,
      ip,
      identifier: options.identifier,
      otpRequestsThisHour: options.otpRequestsThisHour,
      reason: options.reason,
    })
  ) {
    return;
  }

  const siteKey = getTurnstileSiteKey(env);
  if (!turnstileToken?.trim()) {
    throw new CaptchaRequiredError(siteKey);
  }

  const ok = await verifyTurnstileToken(env, turnstileToken, ip);
  if (!ok) {
    throw new InvalidCaptchaError(siteKey);
  }

  await markCaptchaSatisfied(env, scope, sessionId, ip);
}
