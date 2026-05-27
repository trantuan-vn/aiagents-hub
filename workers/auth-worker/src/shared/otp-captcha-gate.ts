import { AUTH_CONSTANTS } from '../features/auth/constant';
import { assertTurnstileToken, isTurnstileEnabled } from './turnstile';
import { getIdentifierOtpVerifyFailCount } from './otp-abuse-monitor';

/**
 * Turnstile required when configured AND (production OR abuse signals OR heavy OTP request volume).
 */
export async function assertOtpRequestCaptcha(
  env: Env,
  identifier: string,
  ip: string,
  turnstileToken: string | undefined,
  options?: { otpRequestsThisHour?: number },
): Promise<void> {
  const enabled = await isTurnstileEnabled(env);
  if (!enabled) return;

  const failCount = await getIdentifierOtpVerifyFailCount(env, identifier);
  const requests = options?.otpRequestsThisHour ?? 0;
  const abuseSignals =
    failCount >= AUTH_CONSTANTS.OTP_CAPTCHA_REQUIRED_AFTER_IDENTIFIER_FAILS ||
    requests >= AUTH_CONSTANTS.OTP_REQUEST_CAPTCHA_AFTER_HOURLY;

  const requireCaptcha =
    env.ENVIRONMENT === 'production' || abuseSignals;

  if (!requireCaptcha) return;

  await assertTurnstileToken(env, turnstileToken, ip);
}
