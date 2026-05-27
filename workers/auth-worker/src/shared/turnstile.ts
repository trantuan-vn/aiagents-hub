import { ERROR_MESSAGES } from '../features/auth/constant';

type TurnstileEnv = Pick<Env, 'TURNSTILE_SECRET_KEY' | 'TURNSTILE_SITE_KEY'>;

type SiteverifyResponse = {
  success: boolean;
  'error-codes'?: string[];
};

/** Cloudflare Turnstile site keys start with 0x4 (production) or 1x0 (test). */
const TURNSTILE_SITE_KEY_RE = /^0x4[A-Za-z0-9_-]{20,}$|^1x0[A-Za-z0-9_-]{20,}$/;

export function isValidTurnstileSiteKey(siteKey: string | null | undefined): boolean {
  const key = (siteKey ?? '').trim();
  return TURNSTILE_SITE_KEY_RE.test(key);
}

export async function getTurnstileSecret(env: TurnstileEnv): Promise<string | null> {
  const raw = await env.TURNSTILE_SECRET_KEY.get();
  const trimmed = raw?.trim();
  return trimmed || null;
}

export function getTurnstileSiteKey(env: TurnstileEnv): string | null {
  const key = (env.TURNSTILE_SITE_KEY ?? '').trim();
  return isValidTurnstileSiteKey(key) ? key : null;
}

export async function isTurnstileEnabled(env: TurnstileEnv): Promise<boolean> {
  const secret = await getTurnstileSecret(env);
  const siteKey = getTurnstileSiteKey(env);
  return secret !== null && siteKey !== null;
}

export async function verifyTurnstileToken(
  env: TurnstileEnv,
  token: string,
  remoteIp?: string,
): Promise<boolean> {
  const secret = await getTurnstileSecret(env);
  if (!secret) return true;

  const trimmed = token?.trim();
  if (!trimmed) return false;

  const body: Record<string, string> = {
    secret,
    response: trimmed,
  };
  if (remoteIp?.trim()) {
    body.remoteip = remoteIp.trim();
  }

  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) return false;

  let data: SiteverifyResponse;
  try {
    data = (await response.json()) as SiteverifyResponse;
  } catch {
    return false;
  }

  return data.success === true;
}

export class CaptchaRequiredError extends Error {
  readonly siteKey: string | null;

  constructor(siteKey: string | null) {
    super(ERROR_MESSAGES.AUTH.CAPTCHA_REQUIRED);
    this.name = 'CaptchaRequiredError';
    this.siteKey = siteKey;
  }
}

export class InvalidCaptchaError extends Error {
  readonly siteKey: string | null;

  constructor(siteKey: string | null) {
    super(ERROR_MESSAGES.AUTH.INVALID_CAPTCHA);
    this.name = 'InvalidCaptchaError';
    this.siteKey = siteKey;
  }
}

/** When Turnstile is configured, require a valid token (production gate for OTP / recovery). */
export async function assertTurnstileToken(
  env: TurnstileEnv,
  token: string | undefined,
  remoteIp?: string,
): Promise<void> {
  const enabled = await isTurnstileEnabled(env);
  if (!enabled) return;

  const siteKey = getTurnstileSiteKey(env);
  if (!token?.trim()) {
    throw new CaptchaRequiredError(siteKey);
  }

  const ok = await verifyTurnstileToken(env, token, remoteIp);
  if (!ok) {
    throw new InvalidCaptchaError(siteKey);
  }
}
