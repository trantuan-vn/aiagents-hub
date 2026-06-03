import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';  
import {
  handleError,
  parseBody,
  getIPAndUserAgent,
  getClientIp,
  getClientIpAndUserAgentForSession,
  getClientDeviceIdFromRequest,
  generateSecureSessionId,
  getIdFromName,
  executeUtils,
} from '../../shared/utils';
import { recordIpAuthFailure } from '../../shared/ip-rate-limit';
import { OtpRateLimitError } from '../../shared/otp-rate-limit';
import {
  assertStepUpVerifyNotBlocked,
  clearStepUpVerifyAttempts,
  failStepUpVerify,
} from '../../shared/step-up-verify-rate-limit';
import {
  hashSensitiveSmsStepUpOtp,
  sensitiveSmsStepUpKvKey,
  verifySensitiveSmsStepUpOtp,
  type SensitiveSmsStepUpOtpRecord,
} from './sensitive-sms-step-up-otp';
import { isCaptchaSatisfied } from '../../shared/human-challenge';
import { CaptchaRequiredError, InvalidCaptchaError, getTurnstileSiteKey, isTurnstileEnabled } from '../../shared/turnstile';
import { applyCorsHeadersIfAllowed } from '../../shared/cors-headers';
import { assertAllowedFrontendOrigin } from '../../shared/frontend-origin';
import { AUTH_CONSTANTS, ERROR_MESSAGES, PASSKEY_STATUS_MIN_RESPONSE_MS } from './constant';
import {
  consumePendingLoginDevice,
  normalizeDeviceId,
  storePendingLoginDevice,
} from './device-trust';
import { UserDO } from '../ws/infrastructure/UserDO';
import { requireAuth } from './authMiddleware';
import { createApplicationService } from './application';
import { 
  OTPRequestSchema, 
  OTPVerificationSchema, 
  TotpVerifySchema,
  SmsVerifyLoginSchema,
  BackupCodeVerifySchema,
  BackupCodeRecoverSchema,
  OAuthCallbackSchema, 
  SIWEAuthSchema 
} from './domain';
// SIWEAuthSchema also used for DID link/unlink
import { cookieUtils, oauthUtils, markPreAuthSessionTrusted, validationUtils } from './utils';
import { markStrongAuthSetupUnlocked, requiresStrongAuthSetup } from './strong-auth-policy';
import {
  markSensitiveActionUnlocked,
  resolvePreferredStepUpMethod,
  type StepUpMethod,
} from './strong-auth-policy';
import { createAccountAuthenticatorApplication, createAccountSmsApplication } from '../account/application';
import { createAccountPasskeyApplication, createPasskeyAuthApplication } from '../account/passkey';
import { createAccountBackupCodeApplication } from '../account/backup-codes';
import { createAccountEkycApplication } from '../account/ekyc';
import { createAccountDidApplication } from '../account/did';
import {
  VerifyAuthenticatorSchema,
  DisableAuthenticatorSchema,
  RequestSmsSchema,
  VerifySmsSchema,
  DisableSmsSchema,
} from '../account/domain';
import { createDocumentAIService } from '../member/ekyc/application';
import { EKYC_SERVICES } from '../member/ekyc/constant';
import { processFormData, processDocumentFormData, processFaceFormData, mergeImages, hashIdentifier, saveToEkycR2, getFromEkycR2 } from '../member/ekyc/utils';
import { createOTPService } from './infrastructure';
import { createWalletService } from './infrastructure';
import { createAuthenticatorRepository, createSmsRepository } from '../account/infrastructure';
import { verifyTotpCode } from '../account/totp';
import { decryptField } from '../../shared/field-encryption';

export function createAuthRoutes(bindingName: string) {
  const app = new Hono<{ Bindings: Env }>();
  const STEP_UP_FACEBOOK_PENDING_PREFIX = 'StepUpFacebookPending:';
  /** Keep SIWE statement fixed and ASCII for deterministic step-up audit. */
  const STEP_UP_SIWE_STATEMENT = 'Step-up for sensitive action authorization.';

  const resolveLoginDeviceId = async (
    c: { env: Env },
    request: Request,
    sessionId: string,
  ): Promise<string | undefined> => {
    const fromRequest = normalizeDeviceId(getClientDeviceIdFromRequest(request));
    if (fromRequest) return fromRequest;
    if (c.env.NONCE_KV) {
      return (await consumePendingLoginDevice(c.env.NONCE_KV, sessionId)) ?? undefined;
    }
    return undefined;
  };

  /** Giữ preAuthSessionId để retry OTP/2FA cùng session KV (nonce, PendingTotp, …). */
  const shouldPreservePreAuthSessionOnError = (e: unknown): boolean => {
    if (e instanceof OtpRateLimitError) return true;
    if (e instanceof CaptchaRequiredError || e instanceof InvalidCaptchaError) return true;
    const msg = e instanceof Error ? e.message : String(e);
    return msg === ERROR_MESSAGES.AUTH.INVALID_OTP;
  };

  const captchaErrorResponse = (c: any, e: CaptchaRequiredError | InvalidCaptchaError) => {
    applyCorsHeadersIfAllowed(c);
    return c.json(
      {
        error: e.message,
        requiresCaptcha: true,
        siteKey: e.siteKey ?? getTurnstileSiteKey(c.env),
      },
      400,
    );
  };

  const generateSixDigits = (): string => {
    const buf = new Uint8Array(6);
    crypto.getRandomValues(buf);
    let out = '';
    for (let i = 0; i < 6; i += 1) out += String(buf[i] % 10);
    return out;
  };

  const resolveOtpStepUpIdentifier = (user: Record<string, unknown>, fallbackIdentifier: string): string => {
    const email = String(user.email ?? '').trim();
    if (validationUtils.isValidEmail(email)) return email;

    const phone = String(user.phone ?? '').trim();
    if (validationUtils.isValidPhone(phone)) return phone;

    const fallback = fallbackIdentifier.trim();
    if (validationUtils.isValidEmail(fallback) || validationUtils.isValidPhone(fallback)) {
      return fallback;
    }
    return '';
  };

  // Helper function để xử lý route chung
  const createRouteHandler = (
    handler: Function,
    errorMessage: string,
    optionsOrRequireOriginCheck:
      | boolean
      | {
          requireOriginCheck?: boolean;
          clearAuthCookiesOnError?: boolean;
          usePreAuthSession?: boolean;
          recordIpAuthFailureOnError?: boolean;
        } = false,
  ) => {
    const options =
      typeof optionsOrRequireOriginCheck === 'boolean'
        ? { requireOriginCheck: optionsOrRequireOriginCheck }
        : optionsOrRequireOriginCheck;
    const requireOriginCheck = options.requireOriginCheck ?? false;
    const clearAuthCookiesOnError = options.clearAuthCookiesOnError ?? true;
    const usePreAuthSession = options.usePreAuthSession ?? true;
    const recordIpAuthFailureOnError = options.recordIpAuthFailureOnError ?? true;

    return async (c: any) => {
      try {
        if (requireOriginCheck) {
          assertAllowedFrontendOrigin(
            c.req.header('origin'),
            c.req.header('referer'),
            c.env.FRONTEND_URL,
          );
        }

        const request = c.req.raw;
        const { ipAddress, userAgent } = getClientIpAndUserAgentForSession(request, c.env);
        if (!ipAddress || !userAgent) {
          throw new Error('Missing IP address or user agent');
        }
        const country = (request as Request & { cf?: { country?: string } }).cf?.country ?? 'XX';
        let sessionId: string;
        if (usePreAuthSession) {
          const encryptSecret = await c.env.ENCRYPTION_SECRET.get();
          if (!encryptSecret) {
            throw new Error('ENCRYPTION_SECRET is not defined in environment variables');
          }
          sessionId = await cookieUtils.getOrCreatePreAuthSessionId(c, ipAddress, userAgent, encryptSecret);
          const deviceId = await resolveLoginDeviceId(c, request, sessionId);
          if (deviceId && c.env.NONCE_KV) {
            await storePendingLoginDevice(c.env.NONCE_KV, sessionId, deviceId);
          }
          c.set('loginDeviceId', deviceId);
        } else {
          sessionId = getCookie(c, 'sessionId') ?? '';
          c.set('loginDeviceId', undefined);
        }
        return await handler(c, sessionId, ipAddress, userAgent, country);
      } catch (e) {
        if (e instanceof OtpRateLimitError) {
          applyCorsHeadersIfAllowed(c);
          return c.json(
            { error: e.message, retryAfter: e.retryAfter },
            429,
          );
        }
        if (e instanceof CaptchaRequiredError || e instanceof InvalidCaptchaError) {
          return captchaErrorResponse(c, e);
        }

        const ip = getClientIp(c);
        const errMsg = e instanceof Error ? e.message : String(e);
        const isRateLimited = errMsg === ERROR_MESSAGES.AUTH.RATE_LIMIT_EXCEEDED;
        if (recordIpAuthFailureOnError && ip && !isRateLimited) {
          await recordIpAuthFailure(c.env, ip);
        }
        const { errorResponse, status } = await handleError(c, e, errorMessage);
        if (clearAuthCookiesOnError && !shouldPreservePreAuthSessionOnError(e)) {
          cookieUtils.clearAuthCookies(c);
        }
        return c.json(errorResponse, status);
      }
    };
  };

  // I. OAUTH Routes
  app.get('/oauth/:provider/url', createRouteHandler(async (c: any, sessionId: string, ipAddress: string, userAgent: string) => {
    const provider = c.req.param('provider') as any;
    
    if (!['google', 'apple', 'facebook', 'github', 'twitter'].includes(provider)) {
      throw new Error(`Unsupported OAuth provider: ${provider}`);
    }

    // Store referral code from URL so it's available when user returns from OAuth
    const ref = c.req.query('ref');
    if (ref && c.env.NONCE_KV) {
      const { storePendingRef } = await import('../member/referral/utils');
      await storePendingRef(c.env.NONCE_KV, sessionId, ref);
    }

    const applicationService = createApplicationService(c, bindingName);
    const authUrl = await applicationService.getAuthUrlUseCase(provider, sessionId);

    return c.json({ url: authUrl });
  }, "Failed to get OAuth URL"));

  app.get('/oauth/:provider/callback', createRouteHandler(async (c: any, sessionId: string, ipAddress: string, userAgent: string, country?: string) => {
    const provider = c.req.param('provider') as any;
    
    if (!['google', 'apple', 'facebook', 'github', 'twitter'].includes(provider)) {
      throw new Error(`Unsupported OAuth provider: ${provider}`);
    }

    // Check for OAuth errors
    const error = c.req.query('error');
    if (error) {
      throw new Error(`OAuth error: ${error}`);
    }
    
    const queryParams = c.req.query();
    if (!queryParams.code || !queryParams.state) {
      throw new Error('Missing OAuth code or state');
    }
    const { code, state } = OAuthCallbackSchema.parse(c.req.query());

    if (!code || !state) {
      throw new Error('Missing OAuth code or state');
    }    

    const applicationService = createApplicationService(c, bindingName);

    // Exchange code for tokens and connect user (sessionId lấy từ state, không dùng cookie)
    const { userInfo: validatedUserInfo, sessionId: oauthSessionId } = await applicationService.exchangeOAuthCodeUseCase(provider, state, code);
    const identifier = oauthUtils.normalizeOAuthIdentifier(provider, validatedUserInfo);
    const pendingStepUpRaw =
      provider === 'facebook'
        ? await c.env.NONCE_KV.get(`${STEP_UP_FACEBOOK_PENDING_PREFIX}${oauthSessionId}`)
        : null;
    if (pendingStepUpRaw) {
      let pendingStepUp: { identifier?: string; returnTo?: string } | null = null;
      try {
        pendingStepUp = JSON.parse(pendingStepUpRaw) as { identifier?: string; returnTo?: string };
      } catch {
        pendingStepUp = null;
      }
      await c.env.NONCE_KV.delete(`${STEP_UP_FACEBOOK_PENDING_PREFIX}${oauthSessionId}`);
      const pendingIdentifier = String(pendingStepUp?.identifier ?? '').trim();
      if (!pendingIdentifier) throw new Error('Facebook step-up session expired');
      const expected = validationUtils.normalizeIdentifier(pendingIdentifier);
      const actual = validationUtils.normalizeIdentifier(identifier);
      if (expected !== actual) throw new Error('Facebook account mismatch for step-up');
      await markSensitiveActionUnlocked(c.env.NONCE_KV, pendingIdentifier, 'facebook_oauth');
      const rawReturnTo = String(pendingStepUp?.returnTo ?? '').trim();
      const safeReturnTo = rawReturnTo.startsWith('/dashboard') ? rawReturnTo : '/dashboard';
      return c.redirect(
        `${c.env.FRONTEND_URL}/dashboard/step-up?returnTo=${encodeURIComponent(
          safeReturnTo,
        )}&stepUpOauth=success`,
      );
    }

    // Get referral code stored when user clicked OAuth (from link with ref=)
    let ref: string | undefined;
    if (c.env.NONCE_KV) {
      const { getPendingRef } = await import('../member/referral/utils');
      ref =
        (await getPendingRef(c.env.NONCE_KV, oauthSessionId)) ??
        (await getPendingRef(c.env.NONCE_KV, sessionId)) ??
        undefined;
    }

    // OAuth callback có thể quay về mà cookie preAuthSessionId bị lệch/mất.
    // Ưu tiên deviceId đã resolve từ request hiện tại; nếu thiếu thì thử lấy theo oauthSessionId (state).
    let loginDeviceId = c.get('loginDeviceId') as string | undefined;
    if (!loginDeviceId && c.env.NONCE_KV) {
      loginDeviceId = (await consumePendingLoginDevice(c.env.NONCE_KV, oauthSessionId)) ?? undefined;
    }

    const result = await applicationService.connectOAuthUseCase(
      oauthSessionId,
      identifier,
      ipAddress,
      userAgent,
      country,
      ref,
      loginDeviceId,
    );

    if ('requiresTotp' in result && result.requiresTotp) {
      // Đồng bộ cookie với sessionId từ OAuth state (PendingTotp/PendingSms dùng oauthSessionId).
      if (c.env.NONCE_KV) await markPreAuthSessionTrusted(c.env.NONCE_KV, oauthSessionId);
      cookieUtils.setCookieWithOption(c, 'preAuthSessionId', oauthSessionId, cookieUtils.PRE_AUTH_SESSION_TTL);
      return c.redirect(`${c.env.FRONTEND_URL}/auth/v3/login?requiresTotp=1`);
    }
    if ('requiresSms' in result && result.requiresSms) {
      if (c.env.NONCE_KV) await markPreAuthSessionTrusted(c.env.NONCE_KV, oauthSessionId);
      cookieUtils.setCookieWithOption(c, 'preAuthSessionId', oauthSessionId, cookieUtils.PRE_AUTH_SESSION_TTL);
      return c.redirect(`${c.env.FRONTEND_URL}/auth/v3/login?requiresSms=1`);
    }

    const { sessionId: newSessionId } = result as { sessionId: string };
    await cookieUtils.setSessionCookieWithConfig(c, newSessionId);
    return c.redirect(`${c.env.FRONTEND_URL}/dashboard`);
  }, "OAuth callback failed"));

  app.get('/captcha/config', createRouteHandler(async (c: any) => {
    const enabled = await isTurnstileEnabled(c.env);
    const preAuthSessionId = getCookie(c, 'preAuthSessionId') ?? '';
    const authSessionId = getCookie(c, 'sessionId') ?? '';
    const satisfiedPreauth =
      enabled && preAuthSessionId
        ? await isCaptchaSatisfied(c.env, 'preauth', preAuthSessionId)
        : false;
    const satisfiedSession =
      enabled && authSessionId
        ? await isCaptchaSatisfied(c.env, 'session', authSessionId)
        : false;
    const scope = c.req.query('scope');
    const satisfied =
      scope === 'session' ? satisfiedSession : scope === 'preauth' ? satisfiedPreauth : satisfiedPreauth;
    return c.json({
      enabled,
      siteKey: enabled ? getTurnstileSiteKey(c.env) : null,
      satisfied,
      satisfiedPreauth,
      satisfiedSession,
    });
  }, 'Failed to load captcha config'));

  // II. OTP Routes
  app.post('/otp/request', createRouteHandler(async (c: any, sessionId: string, ipAddress: string, userAgent: string) => {
    const body = await parseBody(c, OTPRequestSchema);
    let { identifier, language, ref, turnstileToken } = body;

    // When user is locked (has balance but no 2FA yet), OTP re-verify must target the logged-in identifier.
    const user = c.get('user') as Record<string, unknown> | undefined;
    const locked = user ? await requiresStrongAuthSetup(c, bindingName, user) : false;
    if (locked) {
      const lockedIdentifier = String(user?.identifier ?? '').trim();
      const reqNorm = validationUtils.normalizeIdentifier(identifier);
      const lockedNorm = validationUtils.normalizeIdentifier(lockedIdentifier);
      if (!lockedIdentifier || reqNorm !== lockedNorm) {
        throw new Error('Invalid identifier');
      }
      identifier = lockedIdentifier;
    }

    if (ref && c.env.NONCE_KV) {
      const { storePendingRef } = await import('../member/referral/utils');
      await storePendingRef(c.env.NONCE_KV, sessionId, ref);
    }

    const applicationService = createApplicationService(c, bindingName);
    await applicationService.getRequestOtpUseCase(
      identifier,
      sessionId,
      ipAddress,
      language,
      turnstileToken,
      'preauth',
    );

    return c.json({ ok: true });
  }, "OTP request failed", true));

  app.post('/otp/verify', createRouteHandler(async (c: any, sessionId: string, ipAddress: string, userAgent: string, country?: string) => {
    const body = await parseBody(c, OTPVerificationSchema);
    let { identifier, otp } = body;
    const user = c.get('user') as Record<string, unknown> | undefined;
    const locked = user ? await requiresStrongAuthSetup(c, bindingName, user) : false;
    let lockedIdentifier: string | undefined;
    if (locked) {
      lockedIdentifier = String(user?.identifier ?? '').trim();
      const reqNorm = validationUtils.normalizeIdentifier(identifier);
      const lockedNorm = validationUtils.normalizeIdentifier(lockedIdentifier ?? '');
      if (!lockedIdentifier || reqNorm !== lockedNorm) {
        throw new Error('Invalid identifier');
      }
      identifier = lockedIdentifier;
    }

    let ref = body.ref;
    if (!ref && c.env.NONCE_KV) {
      const { getPendingRef } = await import('../member/referral/utils');
      ref = await getPendingRef(c.env.NONCE_KV, sessionId) ?? undefined;
    }

    const applicationService = createApplicationService(c, bindingName);
    const result = await applicationService.verifyOtpUseCase(
      identifier,
      sessionId,
      otp,
      ipAddress,
      userAgent,
      country,
      ref,
      c.get('loginDeviceId') as string | undefined,
    );

    if ('requiresTotp' in result && result.requiresTotp) {
      cookieUtils.setCookieWithOption(c, 'preAuthSessionId', sessionId, cookieUtils.PRE_AUTH_SESSION_TTL);
      return c.json({ requiresTotp: true });
    }
    if ('requiresSms' in result && result.requiresSms) {
      cookieUtils.setCookieWithOption(c, 'preAuthSessionId', sessionId, cookieUtils.PRE_AUTH_SESSION_TTL);
      return c.json({ requiresSms: true });
    }

    const { sessionId: newSessionId } = result as { sessionId: string };
    await cookieUtils.setSessionCookieWithConfig(c, newSessionId);

    // Unlock strong-auth setup for this identifier (short TTL).
    if (locked && c.env.NONCE_KV && lockedIdentifier) {
      await markStrongAuthSetupUnlocked(c.env.NONCE_KV, lockedIdentifier);
    }
    if (user && c.env.NONCE_KV) {
      const authIdentifier = String(user.identifier ?? '').trim();
      const reqNorm = validationUtils.normalizeIdentifier(identifier);
      const authNorm = validationUtils.normalizeIdentifier(authIdentifier);
      if (authIdentifier && reqNorm === authNorm) {
        await markSensitiveActionUnlocked(c.env.NONCE_KV, authIdentifier, 'otp_email');
      }
    }

    return c.json({ ok: true });
  }, "OTP verification failed", true));

  // IIc. Sensitive-action step-up (passkey > authenticator > sms > otp email)
  app.post(
    '/step-up/request',
    createRouteHandler(
      async (c: any, sessionId: string) => {
        const user = requireAuth(c);
        const identifier = String(user.identifier ?? '').trim();
        if (!identifier) throw new Error('Invalid user identifier');
        const body = (await c.req.json().catch(() => ({}))) as {
          turnstileToken?: string;
          returnTo?: string;
        };
        const requiredMethod = await resolvePreferredStepUpMethod(c, bindingName, identifier);

        if (requiredMethod === 'passkey') {
          const origin = c.req.header('origin') || c.env.FRONTEND_URL;
          if (!origin) throw new Error('Origin required');
          const passkeyAuthApp = createPasskeyAuthApplication(c, bindingName, {
            rpName: 'Unitoken',
            getOrigin: () => c.req.header('origin') || c.env.FRONTEND_URL || '',
          });
          const { options, challengeKey } =
            await passkeyAuthApp.getAuthenticationOptionsUseCase(identifier, origin);
          return c.json({ requiredMethod, options, challengeKey });
        }

        if (requiredMethod === 'sms') {
          const userDO = getIdFromName(c, identifier, bindingName) as DurableObjectStub<UserDO>;
          const smsRepo = createSmsRepository(userDO);
          const encryptedPhone = await smsRepo.getSmsPhoneEncrypted();
          if (!encryptedPhone) throw new Error('SMS second factor is not available');
          const secret = await c.env.ENCRYPTION_SECRET.get();
          if (!secret) throw new Error('ENCRYPTION_SECRET is not defined in environment variables');
          const phone = await decryptField(encryptedPhone, secret);
          if (!phone) throw new Error('SMS phone is unavailable');

          const otp = generateSixDigits();
          await createOTPService(c.env).sendSmsOTP(
            phone.startsWith('+') ? phone : `+${phone}`,
            otp,
            AUTH_CONSTANTS.STEP_UP_SMS_OTP_TTL_SEC,
          );
          const otpHash = await hashSensitiveSmsStepUpOtp(identifier, otp, secret);
          const normId = validationUtils.normalizeIdentifier(identifier);
          await clearStepUpVerifyAttempts(c.env, normId);
          await c.env.NONCE_KV.put(
            sensitiveSmsStepUpKvKey(normId),
            JSON.stringify({ otpHash } satisfies SensitiveSmsStepUpOtpRecord),
            { expirationTtl: AUTH_CONSTANTS.STEP_UP_SMS_OTP_TTL_SEC },
          );
        }

        if (requiredMethod === 'otp_email') {
          if (!sessionId) throw new Error('sessionId not found');
          const otpIdentifier = resolveOtpStepUpIdentifier(user, identifier);
          if (!otpIdentifier) {
            throw new Error('OTP verification is unavailable for this account');
          }
          const appService = createApplicationService(c, bindingName);
          await appService.getRequestOtpUseCase(
            otpIdentifier,
            sessionId,
            getClientIp(c),
            'en',
            typeof body.turnstileToken === 'string' ? body.turnstileToken : undefined,
            'session',
          );
        }

        if (requiredMethod === 'wallet_reauth') {
          if (!sessionId) throw new Error('sessionId not found');
          const nonce = await createWalletService(c.env).generateNonceAndStore(sessionId);
          return c.json({ requiredMethod, nonce });
        }

        if (requiredMethod === 'facebook_oauth') {
          if (!sessionId) throw new Error('sessionId not found');
          const appService = createApplicationService(c, bindingName);
          const authUrl = await appService.getAuthUrlUseCase('facebook', sessionId);
          const rawReturnTo = String(body.returnTo ?? '').trim();
          const safeReturnTo = rawReturnTo.startsWith('/dashboard') ? rawReturnTo : '/dashboard';
          await c.env.NONCE_KV.put(
            `${STEP_UP_FACEBOOK_PENDING_PREFIX}${sessionId}`,
            JSON.stringify({ identifier, returnTo: safeReturnTo }),
            { expirationTtl: 10 * 60 },
          );
          return c.json({ requiredMethod, authUrl });
        }

        return c.json({ requiredMethod, ok: true });
      },
      'Failed to request step-up',
      {
        requireOriginCheck: true,
        usePreAuthSession: false,
        clearAuthCookiesOnError: false,
      },
    ),
  );

  app.post(
    '/step-up/verify',
    createRouteHandler(
      async (c: any, sessionId: string) => {
        const user = requireAuth(c);
        const identifier = String(user.identifier ?? '').trim();
        if (!identifier) throw new Error('Invalid user identifier');
        const normId = validationUtils.normalizeIdentifier(identifier);
        await assertStepUpVerifyNotBlocked(c.env, normId);
        const requiredMethod = await resolvePreferredStepUpMethod(c, bindingName, identifier);
        const body = (await c.req.json().catch(() => ({}))) as {
          method?: StepUpMethod;
          code?: string;
          challengeKey?: string;
          response?: unknown;
          message?: string;
          signature?: string;
        };
        if (!body.method || body.method !== requiredMethod) {
          return c.json({ error: 'Step-up method mismatch', requiredMethod }, 400);
        }

        if (requiredMethod === 'passkey') {
          const origin = c.req.header('origin') || c.env.FRONTEND_URL;
          if (!origin) throw new Error('Origin required');
          if (!body.response || !body.challengeKey) throw new Error('response and challengeKey required');
          const passkeyAuthApp = createPasskeyAuthApplication(c, bindingName, {
            rpName: 'Unitoken',
            getOrigin: () => c.req.header('origin') || c.env.FRONTEND_URL || '',
          });
          const result = await passkeyAuthApp.verifyAuthenticationUseCase(
            body.response,
            identifier,
            body.challengeKey,
            origin,
          );
          if (result.identifier !== identifier) {
            await failStepUpVerify(c.env, normId, sessionId, 'Passkey verification user mismatch');
          }
        } else if (requiredMethod === 'authenticator') {
          const code = String(body.code ?? '').trim();
          if (!/^\d{6}$/.test(code)) {
            await failStepUpVerify(c.env, normId, sessionId, 'Code must be 6 digits');
          }
          const userDO = getIdFromName(c, identifier, bindingName) as DurableObjectStub<UserDO>;
          const authRepo = createAuthenticatorRepository(userDO);
          const secret = await authRepo.getSecret();
          if (!secret) throw new Error('Authenticator is not enabled');
          const valid = await verifyTotpCode(secret, code);
          if (!valid) {
            await failStepUpVerify(c.env, normId, sessionId);
          }
        } else if (requiredMethod === 'sms') {
          const code = String(body.code ?? '').trim();
          if (!/^\d{6}$/.test(code)) {
            await failStepUpVerify(c.env, normId, sessionId, 'Code must be 6 digits');
          }
          const kvKey = sensitiveSmsStepUpKvKey(normId);
          const raw = await c.env.NONCE_KV.get(kvKey);
          if (!raw) throw new Error('SMS verification session expired');
          let stored: SensitiveSmsStepUpOtpRecord | null = null;
          try {
            stored = JSON.parse(raw) as SensitiveSmsStepUpOtpRecord;
          } catch {
            stored = null;
          }
          if (!stored || (!stored.otpHash && !stored.otp)) {
            await failStepUpVerify(c.env, normId, sessionId, 'SMS verification session expired');
          }
          const pepper = await c.env.ENCRYPTION_SECRET.get();
          if (!pepper) throw new Error('ENCRYPTION_SECRET is not defined in environment variables');
          const valid = await verifySensitiveSmsStepUpOtp(normId, code, stored!, pepper);
          if (!valid) {
            await failStepUpVerify(c.env, normId, sessionId);
          }
          await c.env.NONCE_KV.delete(kvKey);
        } else if (requiredMethod === 'wallet_reauth') {
          if (!sessionId) throw new Error('sessionId not found');
          const message = String(body.message ?? '').trim();
          const signature = String(body.signature ?? '').trim();
          if (!message || !signature) throw new Error('message and signature required');
          const fields = await createWalletService(c.env).verifySignature(
            sessionId,
            message,
            signature,
            c.env.SIWE_DOMAIN,
            c.env.FRONTEND_URL,
          );
          if (String(fields.statement ?? '').trim() !== STEP_UP_SIWE_STATEMENT) {
            await failStepUpVerify(c.env, normId, sessionId, 'Invalid step-up SIWE statement');
          }
          const signedAddress = String(fields.address ?? '').toLowerCase();
          const userAddress = String(user.address ?? '').toLowerCase();
          const userIdentifier = String(user.identifier ?? '').toLowerCase();
          if (signedAddress !== userAddress && signedAddress !== userIdentifier) {
            await failStepUpVerify(c.env, normId, sessionId, 'Wallet mismatch for step-up');
          }
        } else if (requiredMethod === 'facebook_oauth') {
          throw new Error('Continue with Facebook to verify this step-up method');
        } else {
          if (!sessionId) throw new Error('sessionId not found');
          const code = String(body.code ?? '').trim();
          if (!/^\d{6}$/.test(code)) {
            await failStepUpVerify(c.env, normId, sessionId, 'Code must be 6 digits');
          }
          const otpIdentifier = resolveOtpStepUpIdentifier(user, identifier);
          if (!otpIdentifier) {
            throw new Error('OTP verification is unavailable for this account');
          }
          const isValid = await createOTPService(c.env).verifyOTP(code, sessionId, otpIdentifier);
          if (!isValid) {
            await failStepUpVerify(c.env, normId, sessionId, ERROR_MESSAGES.AUTH.INVALID_OTP);
          }
        }

        await clearStepUpVerifyAttempts(c.env, normId);
        await markSensitiveActionUnlocked(c.env.NONCE_KV, identifier, requiredMethod);
        return c.json({ ok: true, method: requiredMethod });
      },
      'Failed to verify step-up',
      {
        requireOriginCheck: true,
        usePreAuthSession: false,
        clearAuthCookiesOnError: false,
      },
    ),
  );

  app.post('/totp/verify', createRouteHandler(async (c: any, sessionId: string, ipAddress: string, userAgent: string, country?: string) => {
    const { code } = await parseBody(c, TotpVerifySchema);
    const applicationService = createApplicationService(c, bindingName);
    const { sessionId: newSessionId } = await applicationService.verifyTotpLoginUseCase(
      sessionId,
      code,
      ipAddress,
      userAgent,
      country,
      c.get('loginDeviceId') as string | undefined,
    );
    await cookieUtils.setSessionCookieWithConfig(c, newSessionId);
    return c.json({ ok: true });
  }, "TOTP verification failed", true));

  app.post('/sms/verify-login', createRouteHandler(async (c: any, sessionId: string, ipAddress: string, userAgent: string, country?: string) => {
    const { code } = await parseBody(c, SmsVerifyLoginSchema);
    const applicationService = createApplicationService(c, bindingName);
    const { sessionId: newSessionId } = await applicationService.verifySmsLoginUseCase(
      sessionId,
      code,
      ipAddress,
      userAgent,
      country,
      c.get('loginDeviceId') as string | undefined,
    );
    await cookieUtils.setSessionCookieWithConfig(c, newSessionId);
    return c.json({ ok: true });
  }, "SMS verification failed", true));

  app.post('/backup-code/verify', createRouteHandler(async (c: any, sessionId: string, ipAddress: string, userAgent: string, country?: string) => {
    const { code } = await parseBody(c, BackupCodeVerifySchema);
    const applicationService = createApplicationService(c, bindingName);
    const { sessionId: newSessionId } = await applicationService.verifyBackupCodeLoginUseCase(
      sessionId,
      code,
      ipAddress,
      userAgent,
      country,
      c.get('loginDeviceId') as string | undefined,
    );
    await cookieUtils.setSessionCookieWithConfig(c, newSessionId);
    return c.json({ ok: true });
  }, "Backup code verification failed", true));

  app.post('/backup-code/recover', createRouteHandler(async (c: any, sessionId: string, ipAddress: string, userAgent: string, country?: string) => {
    const { identifier, code, turnstileToken } = await parseBody(c, BackupCodeRecoverSchema);
    const applicationService = createApplicationService(c, bindingName);
    const { sessionId: newSessionId } = await applicationService.recoverWithBackupCodeUseCase(
      identifier,
      code,
      sessionId,
      ipAddress,
      userAgent,
      country,
      c.get('loginDeviceId') as string | undefined,
      turnstileToken,
    );
    await cookieUtils.setSessionCookieWithConfig(c, newSessionId);
    return c.json({ ok: true });
  }, "Backup code recovery failed", true));

  // IIb. Passkey Auth (login) – public, no auth required
  const getPasskeyAuthApp = (ctx: any) =>
    createPasskeyAuthApplication(ctx, bindingName, {
      rpName: 'Unitoken',
      getOrigin: () => ctx.req.header('origin') || ctx.env.FRONTEND_URL || '',
    });

  app.get('/passkey/auth/status', createRouteHandler(async (c: any) => {
    const started = Date.now();
    const identifier = c.req.query('identifier');
    const respond = async (enabled: boolean) => {
      const elapsed = Date.now() - started;
      if (elapsed < PASSKEY_STATUS_MIN_RESPONSE_MS) {
        await new Promise((r) => setTimeout(r, PASSKEY_STATUS_MIN_RESPONSE_MS - elapsed));
      }
      return c.json({ enabled });
    };

    if (!identifier || typeof identifier !== 'string') {
      return respond(false);
    }

    const trimmed = identifier.trim();
    const wellFormed =
      validationUtils.isValidEmail(trimmed) || validationUtils.isValidPhone(trimmed);
    if (!wellFormed) {
      return respond(false);
    }

    // Không lộ account có passkey: mọi identifier hợp lệ đều được thử WebAuthn phía client.
    return respond(true);
  }, "Passkey status failed", true));

  app.post('/passkey/auth/options', createRouteHandler(async (c: any) => {
    const origin = c.req.header('origin') || c.env.FRONTEND_URL;
    if (!origin) throw new Error('Origin required');
    const body = (await c.req.json().catch(() => ({}))) as { identifier?: string };
    const identifier = typeof body.identifier === 'string' ? body.identifier.trim() || undefined : undefined;
    const appService = getPasskeyAuthApp(c);
    const result = await appService.getAuthenticationOptionsUseCase(identifier, origin);
    return c.json(result);
  }, "Passkey auth options failed", true));

  app.post('/passkey/auth/verify', createRouteHandler(async (c: any, sessionId: string, ipAddress: string, userAgent: string, country?: string) => {
    const origin = c.req.header('origin') || c.env.FRONTEND_URL;
    if (!origin) throw new Error('Origin required');
    const body = (await c.req.json()) as { response: unknown; identifier?: string; challengeKey?: string };
    if (!body?.response || !body?.challengeKey) throw new Error('response and challengeKey required');
    const appService = getPasskeyAuthApp(c);
    const applicationService = createApplicationService(c, bindingName);
    const { identifier, credentialId } = await appService.verifyAuthenticationUseCase(
      body.response,
      typeof body.identifier === 'string' ? body.identifier.trim() || undefined : undefined,
      body.challengeKey,
      origin
    );
    const result = await applicationService.connectPasskeyUseCase(
      sessionId,
      identifier,
      ipAddress,
      userAgent,
      country,
      c.get('loginDeviceId') as string | undefined,
      credentialId,
    );

    if ('requiresTotp' in result && result.requiresTotp) {
      cookieUtils.setCookieWithOption(c, 'preAuthSessionId', sessionId, cookieUtils.PRE_AUTH_SESSION_TTL);
      return c.json({ requiresTotp: true });
    }
    if ('requiresSms' in result && result.requiresSms) {
      cookieUtils.setCookieWithOption(c, 'preAuthSessionId', sessionId, cookieUtils.PRE_AUTH_SESSION_TTL);
      return c.json({ requiresSms: true });
    }

    const { sessionId: newSessionId } = result as { sessionId: string };
    await cookieUtils.setSessionCookieWithConfig(c, newSessionId);
    return c.json({ ok: true });
  }, "Passkey auth verify failed", true));

  // III. Wallet Routes
  app.get('/wallet/nonce', createRouteHandler(async (c: any, sessionId: string, ipAddress: string, userAgent: string) => {
    // Store referral code from URL so it's available when user completes wallet sign
    const ref = c.req.query('ref');
    if (ref && c.env.NONCE_KV) {
      const { storePendingRef } = await import('../member/referral/utils');
      await storePendingRef(c.env.NONCE_KV, sessionId, ref);
    }

    const applicationService = createApplicationService(c, bindingName);
    const nonce = await applicationService.generateNonceUseCase(sessionId);

    cookieUtils.setCookieWithOption(c, 'preAuthSessionId', sessionId, cookieUtils.PRE_AUTH_SESSION_TTL);
    return c.json({ nonce });
  }, "Nonce request failed", true));

  app.post('/wallet/connect', createRouteHandler(async (c: any, sessionId: string, ipAddress: string, userAgent: string, country?: string) => {
    const { message, signature } = await parseBody(c, SIWEAuthSchema);
    const effectiveSessionId = sessionId;

    const applicationService = createApplicationService(c, bindingName);
    const fields = await applicationService.verifySignatureUseCase(effectiveSessionId, message, signature);
    const address = fields.address.toLowerCase();

    // Get referral code stored when user requested nonce (from link with ref=)
    let ref: string | undefined;
    if (c.env.NONCE_KV) {
      const { getPendingRef } = await import('../member/referral/utils');
      ref = (await getPendingRef(c.env.NONCE_KV, effectiveSessionId)) ?? undefined;
    }

    const result = await applicationService.connectWalletUseCase(
      effectiveSessionId,
      address,
      ipAddress,
      userAgent,
      country,
      ref,
      c.get('loginDeviceId') as string | undefined,
    );

    if ('requiresTotp' in result && result.requiresTotp) {
      // Đồng bộ cookie để totp/verify dùng đúng sessionId (phòng popup/iframe có cookie khác)
      cookieUtils.setCookieWithOption(c, 'preAuthSessionId', effectiveSessionId, cookieUtils.PRE_AUTH_SESSION_TTL);
      return c.json({ requiresTotp: true });
    }
    if ('requiresSms' in result && result.requiresSms) {
      cookieUtils.setCookieWithOption(c, 'preAuthSessionId', effectiveSessionId, cookieUtils.PRE_AUTH_SESSION_TTL);
      return c.json({ requiresSms: true });
    }

    const { sessionId: newSessionId } = result as { sessionId: string };
    await cookieUtils.setSessionCookieWithConfig(c, newSessionId);
    return c.json({ ok: true });
  }, "Wallet connection failed", true));

  // IV. Profile Routes
  app.post('/profile/logout', async (c) => {
    try {
      const sessionId = getCookie(c, 'sessionId');
      if (!sessionId) throw new Error('Session not found');
      
      const user = requireAuth(c);
      const applicationService = createApplicationService(c, bindingName);
      await applicationService.logoutUseCase(user.identifier, sessionId);
      
      cookieUtils.clearAuthCookies(c);
      return c.json({ ok: true });
    } catch (e) {
      const { errorResponse } = await handleError(c, e, "Logout failed");
      return c.json(errorResponse, 401);
    }
  });

  app.post('/profile/logoutAll', async (c) => {
    try {
      const sessionId = getCookie(c, 'sessionId');
      if (!sessionId) throw new Error('Session not found');
      
      const user = requireAuth(c);
      const applicationService = createApplicationService(c, bindingName);
      await applicationService.logoutAllUseCase(user.identifier);
      
      cookieUtils.clearAuthCookies(c);
      return c.json({ ok: true });
    } catch (e) {
      const { errorResponse } = await handleError(c, e, "Logout failed");
      return c.json(errorResponse, 401);
    }
  });

  app.patch('/profile/payout-preferences', async (c) => {
    try {
      const user = requireAuth(c);
      const body = await c.req.json();
      const currency = body?.earningsPayoutCurrency === 'USD' ? 'USD' : 'VND';
      const userDO = getIdFromName(c, user.identifier, bindingName) as DurableObjectStub<UserDO>;
      const users = await executeUtils.executeDynamicAction(userDO, 'select', {}, 'users');
      const u = Array.isArray(users) ? users[0] : users;
      if (!u?.id) throw new Error('User not found');
      await executeUtils.executeDynamicAction(
        userDO,
        'update',
        { id: u.id, earningsPayoutCurrency: currency, queueStatus: 'pending' },
        'users',
      );
      return c.json({ earningsPayoutCurrency: currency });
    } catch (e) {
      const { errorResponse } = await handleError(c, e, 'Failed to update payout preferences');
      return c.json(errorResponse, 401);
    }
  });

  app.get('/profile/me', async (c) => {
    try {
      const user = requireAuth(c);
      const wb = user.walletBalance ?? user.wallet_balance;
      const walletBalance = typeof wb === "number" && !Number.isNaN(wb) ? wb : Number(wb) || 0;
      const rawCurrency = user.earningsPayoutCurrency ?? user.earnings_payout_currency;
      const earningsPayoutCurrency = rawCurrency === 'USD' ? 'USD' : 'VND';
      const membershipTier = user.membershipTier ?? user.membership_tier ?? 'member';
      const needsStrongAuthSetup = await requiresStrongAuthSetup(c, bindingName, user);
      return c.json({
        id: user.id,
        identifier: user.identifier,
        address: user.address,
        role: user.role || "member",
        membershipTier,
        monthlyTopUpVnd: Number(user.monthlyTopUpVnd ?? user.monthly_top_up_vnd ?? 0) || 0,
        tierPeriodYm: user.tierPeriodYm ?? user.tier_period_ym ?? null,
        walletBalance: Math.max(0, walletBalance),
        walletCurrency: 'USD',
        earningsPayoutCurrency,
        requiresStrongAuthSetup: needsStrongAuthSetup,
      });
    } catch (e) {
      const { errorResponse } = await handleError(c, e, "Get user info failed");
      return c.json(errorResponse, 401);
    }
  });

  // V. Session management (list & revoke)
  app.get('/sessions', async (c) => {
    try {
      const user = requireAuth(c);
      const sessionId = getCookie(c, 'sessionId');
      const applicationService = createApplicationService(c, bindingName);
      const result = await applicationService.listSessionsUseCase(user.identifier, sessionId ?? undefined);
      return c.json(result.sessions);
    } catch (e) {
      const { errorResponse, status } = await handleError(c, e, 'Failed to list sessions');
      return c.json(errorResponse, status);
    }
  });

  app.post('/sessions/:sessionId/revoke', async (c) => {
    try {
      const user = requireAuth(c);
      const sessionId = c.req.param('sessionId');
      if (!sessionId) throw new Error('Session ID required');
      const applicationService = createApplicationService(c, bindingName);
      await applicationService.revokeSessionUseCase(user.identifier, sessionId);
      return c.json({ ok: true });
    } catch (e) {
      const { errorResponse, status } = await handleError(c, e, 'Failed to revoke session');
      return c.json(errorResponse, status);
    }
  });

  // VI. Authenticator (TOTP) – requires auth
  app.get('/authenticator/status', async (c) => {
    try {
      const user = requireAuth(c);
      const appService = createAccountAuthenticatorApplication(c, bindingName);
      const status = await appService.getAuthenticatorStatusUseCase(user.identifier);
      return c.json(status);
    } catch (e) {
      const { errorResponse, status } = await handleError(c, e, 'Failed to get authenticator status');
      return c.json(errorResponse, status);
    }
  });

  app.post('/authenticator/setup', async (c) => {
    try {
      const user = requireAuth(c);
      const body = await c.req.json().catch(() => ({}));
      const issuer = typeof body.issuer === 'string' ? body.issuer : 'Unitoken';
      const accountName = typeof body.accountName === 'string' ? body.accountName : user.identifier;
      const appService = createAccountAuthenticatorApplication(c, bindingName);
      const result = await appService.setupAuthenticatorUseCase(user.identifier, issuer, accountName);
      return c.json(result);
    } catch (e) {
      const { errorResponse, status } = await handleError(c, e, 'Failed to setup authenticator');
      return c.json(errorResponse, status);
    }
  });

  app.post('/authenticator/verify', async (c) => {
    try {
      const user = requireAuth(c);
      const input = await parseBody(c, VerifyAuthenticatorSchema);
      const appService = createAccountAuthenticatorApplication(c, bindingName);
      await appService.verifyAuthenticatorUseCase(user.identifier, input);
      return c.json({ ok: true });
    } catch (e) {
      const { errorResponse, status } = await handleError(c, e, 'Failed to verify authenticator');
      return c.json(errorResponse, status);
    }
  });

  app.post('/authenticator/disable', async (c) => {
    try {
      const user = requireAuth(c);
      const input = await parseBody(c, DisableAuthenticatorSchema);
      const appService = createAccountAuthenticatorApplication(c, bindingName);
      await appService.disableAuthenticatorUseCase(user.identifier, input);
      return c.json({ ok: true });
    } catch (e) {
      const { errorResponse, status } = await handleError(c, e, 'Failed to disable authenticator');
      return c.json(errorResponse, status);
    }
  });

  // VII. SMS 2FA – requires auth
  app.get('/sms/status', async (c) => {
    try {
      const user = requireAuth(c);
      const appService = createAccountSmsApplication(c, bindingName);
      const status = await appService.getSmsStatusUseCase(user.identifier);
      return c.json(status);
    } catch (e) {
      const { errorResponse, status } = await handleError(c, e, 'Failed to get SMS status');
      return c.json(errorResponse, status);
    }
  });
 
  app.post('/sms/request', async (c) => {
    try {
      const user = requireAuth(c);
      const input = await parseBody(c, RequestSmsSchema);
      const appService = createAccountSmsApplication(c, bindingName);
      await appService.requestSmsUseCase(user.identifier, input);
      return c.json({ ok: true });
    } catch (e) {
      const { errorResponse, status } = await handleError(c, e, 'Failed to request SMS code');
      return c.json(errorResponse, status);
    }
  });

  app.post('/sms/verify', async (c) => {
    try {
      const user = requireAuth(c);
      const input = await parseBody(c, VerifySmsSchema);
      const appService = createAccountSmsApplication(c, bindingName);
      await appService.verifySmsUseCase(user.identifier, input);
      return c.json({ ok: true });
    } catch (e) {
      const { errorResponse, status } = await handleError(c, e, 'Failed to verify SMS code');
      return c.json(errorResponse, status);
    }
  });

  app.post('/sms/disable', async (c) => {
    try {
      const user = requireAuth(c);
      const input = await parseBody(c, DisableSmsSchema);
      const appService = createAccountSmsApplication(c, bindingName);
      await appService.disableSmsUseCase(user.identifier, input);
      return c.json({ ok: true });
    } catch (e) {
      const { errorResponse, status } = await handleError(c, e, 'Failed to disable SMS');
      return c.json(errorResponse, status);
    }
  });

  // VIII. Passkey (WebAuthn) – requires auth, origin check for security
  const getPasskeyApp = (ctx: any) =>
    createAccountPasskeyApplication(ctx, bindingName, {
      rpName: 'Unitoken',
      getOrigin: () => ctx.req.header('origin') || ctx.env.FRONTEND_URL || '',
    });

  app.get('/passkey/status', async (c) => {
    try {
      const user = requireAuth(c);
      const appService = getPasskeyApp(c);
      const status = await appService.getPasskeyStatusUseCase(user.identifier);
      return c.json(status);
    } catch (e) {
      const { errorResponse, status } = await handleError(c, e, 'Failed to get passkey status');
      return c.json(errorResponse, status);
    }
  });

  app.post('/passkey/registration/options', async (c) => {
    try {
      const user = requireAuth(c);
      const origin = c.req.header('origin') || c.env.FRONTEND_URL;
      if (!origin) throw new Error('Origin required');
      const body = await c.req.json().catch(() => ({}));
      const userName = typeof body.userName === 'string' ? body.userName : user.identifier;
      const appService = getPasskeyApp(c);
      const result = await appService.getRegistrationOptionsUseCase(user.identifier, userName, origin);
      return c.json(result);
    } catch (e) {
      const { errorResponse, status } = await handleError(c, e, 'Failed to get passkey registration options');
      return c.json(errorResponse, status);
    }
  });

  app.post('/passkey/registration/verify', async (c) => {
    try {
      const user = requireAuth(c);
      const origin = c.req.header('origin') || c.env.FRONTEND_URL;
      if (!origin) throw new Error('Origin required');
      const body = await c.req.json() as { response: unknown; challengeKey?: string };
      if (!body?.response || !body?.challengeKey) throw new Error('response and challengeKey required');
      const appService = getPasskeyApp(c);
      const deviceId = normalizeDeviceId(getClientDeviceIdFromRequest(c.req.raw));
      await appService.verifyRegistrationUseCase(
        user.identifier,
        { response: body.response as any, challengeKey: body.challengeKey },
        origin,
        deviceId,
      );
      return c.json({ ok: true });
    } catch (e) {
      const { errorResponse, status } = await handleError(c, e, 'Failed to verify passkey registration');
      return c.json(errorResponse, status);
    }
  });

  app.get('/passkey/credentials', async (c) => {
    try {
      const user = requireAuth(c);
      const appService = getPasskeyApp(c);
      const list = await appService.listCredentialsUseCase(user.identifier);
      return c.json(list);
    } catch (e) {
      const { errorResponse, status } = await handleError(c, e, 'Failed to list passkey credentials');
      return c.json(errorResponse, status);
    }
  });

  app.delete('/passkey/credentials/:credentialId', async (c) => {
    try {
      const user = requireAuth(c);
      const credentialId = c.req.param('credentialId');
      if (!credentialId) throw new Error('credentialId required');
      const appService = getPasskeyApp(c);
      await appService.removeCredentialUseCase(user.identifier, credentialId);
      return c.json({ ok: true });
    } catch (e) {
      const { errorResponse, status } = await handleError(c, e, 'Failed to remove passkey');
      return c.json(errorResponse, status);
    }
  });

  // IX. Backup codes – status, generate, regenerate (replace existing)
  const getBackupCodesApp = (ctx: any) => createAccountBackupCodeApplication(ctx, bindingName);

  app.get('/backup-codes/status', async (c) => {
    try {
      const user = requireAuth(c);
      const appService = getBackupCodesApp(c);
      const status = await appService.getStatusUseCase(user.identifier);
      return c.json(status);
    } catch (e) {
      const { errorResponse, status } = await handleError(c, e, 'Failed to get backup codes status');
      return c.json(errorResponse, status);
    }
  });

  app.post('/backup-codes/generate', async (c) => {
    try {
      const user = requireAuth(c);
      const body = (await c.req.json().catch(() => ({}))) as { replaceExisting?: boolean };
      const replaceExisting = Boolean(body.replaceExisting);
      const appService = getBackupCodesApp(c);
      const result = await appService.generateUseCase(user.identifier, replaceExisting);
      return c.json(result);
    } catch (e) {
      const { errorResponse, status } = await handleError(c, e, 'Failed to generate backup codes');
      return c.json(errorResponse, status);
    }
  });

  // X. eKYC – identity verification (dashboard auth, no API token)
  const getEkycApp = (ctx: any) => createAccountEkycApplication(ctx, bindingName);
  const getEkycAI = (ctx: any) => createDocumentAIService(ctx, bindingName);

  app.get('/ekyc/status', async (c) => {
    try {
      const user = requireAuth(c);
      const appService = getEkycApp(c);
      const status = await appService.getStatusUseCase(user.identifier);
      return c.json(status);
    } catch (e) {
      const { errorResponse, status } = await handleError(c, e, 'Failed to get eKYC status');
      return c.json(errorResponse, status);
    }
  });

  app.post('/ekyc/remove', async (c) => {
    try {
      const user = requireAuth(c);
      const appService = getEkycApp(c);
      await appService.resetUseCase(user.identifier);
      return c.json({ success: true });
    } catch (e) {
      const { errorResponse, status } = await handleError(c, e, 'Failed to remove eKYC');
      return c.json(errorResponse, status);
    }
  });

  app.post('/ekyc/recognize-document', async (c) => {
    try {
      const user = requireAuth(c);
      const { ipAddress, userAgent } = getIPAndUserAgent(c.req.raw);
      if (!ipAddress || !userAgent) throw new Error('Missing IP or user agent');
      const { docType, images } = await processDocumentFormData(c);
      const aiService = getEkycAI(c);
      const ekycApp = getEkycApp(c);
      const userPrefix = await hashIdentifier(user.identifier);

      const docTypes = docType === 'passport' ? ['passport'] : ['cccd_front', 'cccd_back'];
      const extractedParts: Record<string, unknown>[] = [];
      const r2Keys: { front: string; back?: string } = { front: '' };

      for (let i = 0; i < images.length; i++) {
        const img = images[i];
        const dt = docTypes[i];
        const result = await aiService.recognizeDocumentUseCase(user.identifier, {
          endpoint: EKYC_SERVICES.DOCUMENT.RECOGNIZE.path,
          image: img,
          docType: dt,
          ipAddress,
          userAgent,
        });
        extractedParts.push(result.extractedData);

        const suffix = docType === 'passport' ? 'passport.jpg' : dt === 'cccd_front' ? 'front.jpg' : 'back.jpg';
        const key = await saveToEkycR2(c.env as any, userPrefix, `doc-${suffix}`, img);
        if (i === 0) r2Keys.front = key;
        else (r2Keys as any).back = key;
      }

      const mergedData = Object.assign({}, ...extractedParts);
      const avgConfidence = extractedParts.length > 0
        ? extractedParts.reduce((sum, p) => sum + (Number((p as any)?.confidence_score) || 0.7), 0) / extractedParts.length
        : 0.7;

      await ekycApp.saveDocumentDataUseCase(user.identifier, {
        docType,
        docExtractedData: JSON.stringify(mergedData),
        docFrontKey: r2Keys.front,
        docBackKey: r2Keys.back,
      });
      if (avgConfidence >= 0.7) {
        await ekycApp.setDocumentVerifiedUseCase(user.identifier);
      } else {
        await ekycApp.setDocumentSubmittedUseCase(user.identifier);
      }

      return c.json({
        documentType: docType,
        extractedData: mergedData,
        confidence: avgConfidence,
        processingTime: Date.now(),
      });
    } catch (e) {
      const { errorResponse, status } = await handleError(c, e, 'Document recognition failed');
      return c.json(errorResponse, status);
    }
  });

  app.post('/ekyc/face-search', async (c) => {
    try {
      const user = requireAuth(c);
      const { ipAddress, userAgent } = getIPAndUserAgent(c.req.raw);
      if (!ipAddress || !userAgent) throw new Error('Missing IP or user agent');
      const { image } = await processFormData(c);
      const aiService = getEkycAI(c);
      const result = await aiService.faceSearchUseCase(user.identifier, {
        endpoint: EKYC_SERVICES.FACE.SEARCH.path,
        image,
        ipAddress,
        userAgent,
      });
      return c.json(result);
    } catch (e) {
      const { errorResponse, status } = await handleError(c, e, 'Face search failed');
      return c.json(errorResponse, status);
    }
  });

  app.post('/ekyc/face-verify', async (c) => {
    try {
      const user = requireAuth(c);
      const { ipAddress, userAgent } = getIPAndUserAgent(c.req.raw);
      if (!ipAddress || !userAgent) throw new Error('Missing IP or user agent');
      const { image, image2 } = await processFormData(c);
      if (!image2) throw new Error('Missing second image for verification');

      let docImage: File;
      if (image) {
        docImage = image;
      } else {
        const ekycApp = getEkycApp(c);
        const { docFrontKey } = await ekycApp.getDocumentKeysUseCase(user.identifier);
        if (!docFrontKey) throw new Error('No document on file. Complete document step first.');
        const buf = await getFromEkycR2(c.env as any, docFrontKey);
        if (!buf) throw new Error('Document image not found');
        docImage = new File([buf], 'doc.jpg', { type: 'image/jpeg' });
      }

      const mergedImage = await mergeImages(docImage, image2, c.env as any);
      const aiService = getEkycAI(c);
      const result = await aiService.faceVerifyUseCase(user.identifier, {
        endpoint: EKYC_SERVICES.FACE.VERIFY.path,
        image: mergedImage,
        image2: null,
        ipAddress,
        userAgent,
      });
      const ekycApp = getEkycApp(c);
      if (result.isMatch && result.confidence >= 0.75) {
        await ekycApp.setFaceVerifiedUseCase(user.identifier);
        await ekycApp.setVerifiedUseCase(user.identifier);
      } else {
        await ekycApp.setFaceSubmittedUseCase(user.identifier);
      }
      return c.json(result);
    } catch (e) {
      const { errorResponse, status } = await handleError(c, e, 'Face verification failed');
      return c.json(errorResponse, status);
    }
  });

  app.post('/ekyc/face-verify-test', async (c) => {
    try {
      const user = requireAuth(c);
      const { ipAddress, userAgent } = getIPAndUserAgent(c.req.raw);
      if (!ipAddress || !userAgent) throw new Error('Missing IP or user agent');
      const { image } = await processFormData(c);
      if (!image) throw new Error('Missing selfie image for verification test');

      const ekycApp = getEkycApp(c);
      const { docFrontKey } = await ekycApp.getDocumentKeysUseCase(user.identifier);
      if (!docFrontKey) throw new Error('No document on file. Complete eKYC first.');

      const buf = await getFromEkycR2(c.env as any, docFrontKey);
      if (!buf) throw new Error('Document image not found');
      const docImage = new File([buf], 'doc.jpg', { type: 'image/jpeg' });

      const mergedImage = await mergeImages(docImage, image, c.env as any);
      const aiService = getEkycAI(c);
      const result = await aiService.faceVerifyUseCase(user.identifier, {
        endpoint: EKYC_SERVICES.FACE.VERIFY.path,
        image: mergedImage,
        image2: null,
        ipAddress,
        userAgent,
      });
      return c.json(result);
    } catch (e) {
      const { errorResponse, status } = await handleError(c, e, 'Face verification test failed');
      return c.json(errorResponse, status);
    }
  });

  app.post('/ekyc/face-submit', async (c) => {
    try {
      const user = requireAuth(c);
      const { ipAddress, userAgent } = getIPAndUserAgent(c.req.raw);
      if (!ipAddress || !userAgent) throw new Error('Missing IP or user agent');
      const faceData = await processFaceFormData(c);
      const ekycApp = getEkycApp(c);
      const { docFrontKey } = await ekycApp.getDocumentKeysUseCase(user.identifier);
      if (!docFrontKey) throw new Error('Complete document step first');

      const firstFrame = faceData.type === 'video' ? faceData.frame : faceData.type === 'images' ? faceData.files[0] : faceData.file;
      const aiService = getEkycAI(c);

      const livenessResult = await aiService.livenessDetectionUseCase(user.identifier, {
        endpoint: EKYC_SERVICES.FACE.LIVENESS.path,
        image: firstFrame,
        isVideo: faceData.type === 'video',
        ipAddress,
        userAgent,
      });
      if (!livenessResult.isLive || livenessResult.confidence < 0.7) {
        return c.json({ error: 'Liveness check failed', ...livenessResult }, 400);
      }

      const userPrefix = await hashIdentifier(user.identifier);
      let faceMediaKey: string;
      if (faceData.type === 'video') {
        faceMediaKey = await saveToEkycR2(c.env as any, userPrefix, 'face-clip.webm', faceData.file);
      } else if (faceData.type === 'images') {
        faceMediaKey = await saveToEkycR2(c.env as any, userPrefix, 'face-1.jpg', firstFrame);
        for (let i = 1; i < faceData.files.length; i++) {
          await saveToEkycR2(c.env as any, userPrefix, `face-${i + 1}.jpg`, faceData.files[i]);
        }
      } else {
        faceMediaKey = await saveToEkycR2(c.env as any, userPrefix, 'face.jpg', faceData.file);
      }

      await ekycApp.saveFaceMediaKeyUseCase(user.identifier, faceMediaKey);

      const docBuf = await getFromEkycR2(c.env as any, docFrontKey);
      if (!docBuf) throw new Error('Document image not found');
      const docImage = new File([docBuf], 'doc.jpg', { type: 'image/jpeg' });
      const mergedImage = await mergeImages(docImage, firstFrame, c.env as any);

      const verifyResult = await aiService.faceVerifyUseCase(user.identifier, {
        endpoint: EKYC_SERVICES.FACE.VERIFY.path,
        image: mergedImage,
        image2: null,
        ipAddress,
        userAgent,
      });

      if (verifyResult.isMatch && verifyResult.confidence >= 0.75) {
        await ekycApp.setFaceVerifiedUseCase(user.identifier);
        await ekycApp.setVerifiedUseCase(user.identifier);
      } else {
        await ekycApp.setFaceSubmittedUseCase(user.identifier);
      }

      return c.json({ ...verifyResult, liveness: livenessResult });
    } catch (e) {
      const { errorResponse, status } = await handleError(c, e, 'Face submit failed');
      return c.json(errorResponse, status);
    }
  });

  app.post('/ekyc/face-liveness', async (c) => {
    try {
      const user = requireAuth(c);
      const { ipAddress, userAgent } = getIPAndUserAgent(c.req.raw);
      if (!ipAddress || !userAgent) throw new Error('Missing IP or user agent');
      const { image, isVideo } = await processFormData(c);
      const aiService = getEkycAI(c);
      const result = await aiService.livenessDetectionUseCase(user.identifier, {
        endpoint: EKYC_SERVICES.FACE.LIVENESS.path,
        image,
        isVideo,
        ipAddress,
        userAgent,
      });
      const ekycApp = getEkycApp(c);
      if (result.isLive && result.confidence >= 0.7) {
        await ekycApp.setFaceVerifiedUseCase(user.identifier);
        await ekycApp.setVerifiedUseCase(user.identifier);
      } else {
        await ekycApp.setFaceSubmittedUseCase(user.identifier);
      }
      return c.json(result);
    } catch (e) {
      const { errorResponse, status } = await handleError(c, e, 'Liveness detection failed');
      return c.json(errorResponse, status);
    }
  });

  // XI. DID (Decentralized Identity) – did:ethr for EVM wallet
  const getDidApp = (ctx: any) => createAccountDidApplication(ctx, bindingName);

  app.get('/did/status', async (c) => {
    try {
      const user = requireAuth(c);
      const appService = getDidApp(c);
      const status = await appService.getDidStatusUseCase(user.identifier);
      return c.json(status);
    } catch (e) {
      const { errorResponse, status } = await handleError(c, e, 'Failed to get DID status');
      return c.json(errorResponse, status);
    }
  });

  app.get('/did/nonce', async (c) => {
    try {
      const user = requireAuth(c);
      const sessionId = generateSecureSessionId();
      cookieUtils.setDidChallengeId(c, sessionId);
      const appService = getDidApp(c);
      const nonce = await appService.getDidNonceUseCase(sessionId);
      return c.json({ nonce });
    } catch (e) {
      const { errorResponse, status } = await handleError(c, e, 'Failed to get DID nonce');
      return c.json(errorResponse, status);
    }
  });

  app.post('/did/link', async (c) => {
    try {
      const user = requireAuth(c);
      const sessionId = cookieUtils.getDidChallengeId(c);
      if (!sessionId) throw new Error('DID challenge not found. Call /did/nonce first.');
      const { message, signature } = await parseBody(c, SIWEAuthSchema);
      const appService = getDidApp(c);
      const result = await appService.linkDidUseCase(user.identifier, sessionId, message, signature);
      cookieUtils.clearDidChallengeId(c);
      return c.json(result);
    } catch (e) {
      const { errorResponse, status } = await handleError(c, e, 'Failed to link DID');
      return c.json(errorResponse, status);
    }
  });

  app.get('/did/unlink/nonce', async (c) => {
    try {
      const user = requireAuth(c);
      const sessionId = generateSecureSessionId();
      cookieUtils.setDidChallengeId(c, sessionId);
      const appService = getDidApp(c);
      const nonce = await appService.getDidUnlinkNonceUseCase(sessionId);
      return c.json({ nonce });
    } catch (e) {
      const { errorResponse, status } = await handleError(c, e, 'Failed to get DID unlink nonce');
      return c.json(errorResponse, status);
    }
  });

  app.post('/did/unlink', async (c) => {
    try {
      const user = requireAuth(c);
      const sessionId = cookieUtils.getDidChallengeId(c);
      if (!sessionId) throw new Error('DID challenge not found. Call /did/unlink/nonce first.');
      const { message, signature } = await parseBody(c, SIWEAuthSchema);
      const appService = getDidApp(c);
      await appService.unlinkDidUseCase(user.identifier, sessionId, message, signature);
      cookieUtils.clearDidChallengeId(c);
      return c.json({ ok: true });
    } catch (e) {
      const { errorResponse, status } = await handleError(c, e, 'Failed to unlink DID');
      return c.json(errorResponse, status);
    }
  });

  return app;
}