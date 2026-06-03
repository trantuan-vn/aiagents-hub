import { Context } from 'hono';
import { createLogger } from '../../shared/logger';
import { getIdFromName, getSessionIdHash } from '../../shared/utils';
import { isAdminIdentifier } from '../../shared/admin-config';
import { UserDO } from '../ws/infrastructure/UserDO';
import { SiweMessage } from 'siwe';

import { OAuthProvider, Session } from './domain';
import { decryptField } from '../../shared/field-encryption';
import {
  assertBackupCodeRecoverAllowed,
  checkBackupCodeRecoverAllowed,
  clearBackupCodeRecoverAttempts,
  recordBackupCodeRecoverFailure,
} from '../../shared/backup-code-rate-limit';
import { 
  validationUtils, 
  walletUtils, 
  oauthUtils,
} from './utils';
import { createOAuthService, createRepository, createOTPService, createWalletService } from './infrastructure';
import {
  checkOtpRequestAllowed,
  checkOtpVerifyBlocked,
  clearOtpVerifyAttempts,
  getOtpRequestCountThisHour,
  OtpRateLimitError,
  recordOtpRequest,
  recordOtpVerifyFailure,
} from '../../shared/otp-rate-limit';
import {
  assertHumanChallenge,
  clearCaptchaSatisfied,
  type HumanChallengeScope,
} from '../../shared/human-challenge';
import { clearIdentifierOtpVerifyFailures } from '../../shared/otp-abuse-monitor';
import { createPasskeyAuthApplication } from '../account/passkey';
import { createAccountAuthenticatorApplication } from '../account/application';
import { createAuthenticatorRepository, createBackupCodeRepository } from '../account/infrastructure';
import { normalizeBackupCodeInput } from '../account/backup-codes';
import { verifyTotpCode } from '../account/totp';
import { AUTH_CONSTANTS, ERROR_MESSAGES } from './constant';
import { createVersionApplicationService } from '../admin/version/application';
import { getAuthExpiryFromConfig } from '../admin/system-config/get-auth-expiry';
import { createWebsocketApplicationService } from '../ws/application';
import { generateReferralCode, resolveReferrerByCode, storeReferralCode } from '../member/referral/utils';
import {
  applyEnabledSecondFactorStepUp,
  bindPasskeyDeviceId,
  decideNewSessionEmail,
  evaluateNovelDeviceStepUp,
  forgetKnownDeviceIfUnused,
  KNOWN_DEVICE_KV_PREFIX,
  markKnownDevice,
  normalizeDeviceId,
  parsePendingAuth,
  resolvePasskeyLoginDeviceId,
} from './device-trust';
import {
  ipFingerprintsMatch,
  normalizeIpFingerprint,
  normalizeLoginCountry,
  normalizeUaFingerprint,
  uaFingerprintsMatch,
} from './session-fingerprint';
import {
  parsePendingSmsLogin,
  pendingSmsLoginKvKey,
  storePendingSmsLogin,
  verifyPendingSmsLoginCode,
} from './pending-sms-login';

interface IApplicationService {
  // I. OAUTH
  getAuthUrlUseCase(provider: OAuthProvider, sessionId: string): Promise<string>;
  exchangeOAuthCodeUseCase(provider: string, state: string, code: string): Promise<{ userInfo: any; sessionId: string }>;
  connectOAuthUseCase(sessionId: string, identifier: string, ipAddress: string, userAgent: string, country?: string, ref?: string, deviceId?: string): Promise<{ sessionId: string } | { requiresTotp: true } | { requiresSms: true }>;
  
  // II. EMAIL/PHONE
  getRequestOtpUseCase(
    identifier: string,
    sessionId: string,
    ipAddress: string,
    language?: 'vi' | 'en',
    turnstileToken?: string,
    captchaScope?: HumanChallengeScope,
  ): Promise<void>;
  verifyOtpUseCase(identifier: string, sessionId: string, otp: string, ipAddress: string, userAgent: string, country?: string, ref?: string, deviceId?: string): Promise<{ sessionId: string } | { requiresTotp: true } | { requiresSms: true }>;
  verifyTotpLoginUseCase(sessionId: string, code: string, ipAddress: string, userAgent: string, country?: string, deviceId?: string): Promise<{ sessionId: string }>;
  verifySmsLoginUseCase(sessionId: string, code: string, ipAddress: string, userAgent: string, country?: string, deviceId?: string): Promise<{ sessionId: string }>;
  verifyBackupCodeLoginUseCase(sessionId: string, code: string, ipAddress: string, userAgent: string, country?: string, deviceId?: string): Promise<{ sessionId: string }>;
  recoverWithBackupCodeUseCase(identifier: string, code: string, sessionId: string, ipAddress: string, userAgent: string, country?: string, deviceId?: string, turnstileToken?: string): Promise<{ sessionId: string }>;

  // III. WALLET
  generateNonceUseCase(sessionId: string): Promise<string>;
  verifySignatureUseCase(sessionId: string, message: string, signature: string): Promise<SiweMessage>;
  connectWalletUseCase(sessionId: string, address: string, ipAddress: string, userAgent: string, country?: string, ref?: string, deviceId?: string): Promise<{ sessionId: string } | { requiresTotp: true } | { requiresSms: true }>;

  // IIIb. PASSKEY (login)
  connectPasskeyUseCase(sessionId: string, identifier: string, ipAddress: string, userAgent: string, country?: string, deviceId?: string, passkeyCredentialId?: string): Promise<{ sessionId: string } | { requiresTotp: true } | { requiresSms: true }>;
  
  // IV. Common
  logoutUseCase(identifier: string, sessionId: string): Promise<void>;
  /** Revoke session by sessionId only (dùng khi middleware catch lỗi, chưa có identifier). Lấy identifier từ KV nếu còn. */
  revokeSessionBySessionIdUseCase(sessionId: string): Promise<void>;
  logoutAllUseCase(identifier: string): Promise<void>;
  listSessionsUseCase(identifier: string, currentSessionId?: string): Promise<{ sessions: Array<{ id: number; hashSessionId: string; type: string; ipAddress?: string; userAgent?: string; deviceId?: string; country?: string; expiresAt: string; isActive: boolean; isCurrent?: boolean }> }>;
  revokeSessionUseCase(identifier: string, sessionId: string): Promise<void>;
  verifySessionUseCase(
    sessionId: string,
    clientIp?: string,
    clientUserAgent?: string,
    clientCountry?: string,
  ): Promise<{ ok: boolean; user: any }>;
}

const log = createLogger('auth-worker', 'auth');

async function decryptStoredPhone(encrypted: string, secret: string): Promise<string | null> {
  try {
    return await decryptField(encrypted, secret);
  } catch {
    return null;
  }
}

export function createApplicationService(c: Context, bindingName: string): IApplicationService {
  const getRepository = (identifier: string) => {
    const userDO = getIdFromName(c, identifier, bindingName) as DurableObjectStub<UserDO>;
    if (!userDO) throw new Error(ERROR_MESSAGES.AUTH.USER_NOT_FOUND);
    return createRepository(userDO);
  };

  const SESSION_LOOKUP_PREFIX = 'SessionLookup:';
  const REPLAY_TELEMETRY_PREFIX = 'ReplayTelemetry:';

  const createUserSession = async (
    repository: any,
    user: any,
    type: 'otp' | 'siwe' | 'oauth' | 'passkey',
    ipAddress: string,
    userAgent: string,
    country?: string,
    deviceId?: string | null,
  ) => {
    const encryptSecret = await c.env.ENCRYPTION_SECRET.get();
    if (!encryptSecret) {
      throw new Error('ENCRYPTION_SECRET is not defined in environment variables');
    }
    const expiry = await getAuthExpiryFromConfig(c.env);
    const sessionId = getSessionIdHash(ipAddress, userAgent, `${encryptSecret}|${user.identifier}`);
    const sessionExisted = await repository.sessions.existsByHashSessionId(sessionId);
    const normalizedDeviceId = normalizeDeviceId(deviceId);
    const activeSessionsBeforeCreate = await repository.sessions.listAll(50);

    const sessionData: Session = {
      hashSessionId: sessionId,
      type,
      expiresAt: new Date(Date.now() + expiry.sessionExpiry * 1000).toISOString(),
      ipAddress,
      userAgent,
      country: normalizeLoginCountry(country) ?? undefined,
      deviceId: normalizedDeviceId ?? undefined,
      isActive: true,
    };
    await repository.sessions.create(sessionData);

    // KV: sessionId -> identifier để resolve user khi validate
    await c.env.NONCE_KV.put(
      `${SESSION_LOOKUP_PREFIX}${sessionId}`,
      user.identifier,
      { expirationTtl: expiry.sessionExpiry }
    );

    const versionApp = createVersionApplicationService(c, bindingName);
    await versionApp.upgradeVersion(user.identifier);

    const emailDecision = await decideNewSessionEmail(
      c.env.NONCE_KV,
      user.identifier,
      sessionExisted,
      normalizedDeviceId,
      ipAddress,
      userAgent,
      country,
      activeSessionsBeforeCreate,
    );

    const userEmail =
      user.email || (validationUtils.isValidEmail(user.identifier) ? user.identifier : null);

    if (emailDecision.send && userEmail) {
      try {
        await createOTPService(c.env).sendNewSessionNotification(userEmail, ipAddress, userAgent);
        if (emailDecision.cooldownKey) {
          await c.env.NONCE_KV.put(emailDecision.cooldownKey, '1', {
            expirationTtl: AUTH_CONSTANTS.NEW_SESSION_EMAIL_COOLDOWN_SEC,
          });
        }
      } catch (e) {
        log.warn('session.new_device_email_failed', {
          identifier: user.identifier,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    await markKnownDevice(c.env.NONCE_KV, user.identifier, normalizedDeviceId);

    log.info('session.created', {
      identifier: user.identifier,
      type,
      sessionExisted,
      newDeviceEmailSent: emailDecision.send && !!userEmail,
    });

    return { sessionId };
  };

  const getOrCreateUser = async (repository: any, identifier: string, additionalData: any = {}, refCode?: string): Promise<{ user: any; isNewUser: boolean }> => {
    const encryptSecret= await c.env.ENCRYPTION_SECRET.get();
    if (!encryptSecret) {
      throw new Error("ENCRYPTION_SECRET is not defined in environment variables");
    }

    const existingUser = await repository.users.get();

    if (existingUser) {
      // Ensure existing users have referralCode (backfill)
      if (!existingUser.referralCode && c.env.NONCE_KV) {
        const code = generateReferralCode();
        await repository.users.save({ ...existingUser, referralCode: code });
        await storeReferralCode(c.env.NONCE_KV, code, existingUser.identifier);
        existingUser.referralCode = code;
      }
      return { user: existingUser, isNewUser: false };
    }

    // Resolve referrer from ref code (only for new users)
    let referrerId: string | undefined;
    if (refCode && refCode.trim() && c.env.NONCE_KV) {
      referrerId = await resolveReferrerByCode(c.env.NONCE_KV, refCode) ?? undefined;
      if (!referrerId) {
        log.warn('user.referral_code_unknown', { refCode: refCode.trim().toUpperCase() });
      }
    }

    const referralCode = generateReferralCode();

    const baseUser = {
      identifier: validationUtils.normalizeIdentifier(identifier),
      role: isAdminIdentifier(c.env, identifier) ? 'admin' : 'member',
      referralCode,
      ...(referrerId && { referrerId }),
      ...additionalData
    };

    // Generate wallet for new users (except wallet connections)
    if (!additionalData.address) {
      const wallet = await walletUtils.generateWallet(encryptSecret);
      Object.assign(baseUser, {
        address: wallet.address,
        privateKey: wallet.privateKey,
        mnemonicPhrase: wallet.mnemonicPhrase,
      });
    }

    // Set email/phone based on identifier type
    if (validationUtils.isValidEmail(identifier)) {
      Object.assign(baseUser, { email: identifier });
    } else if (validationUtils.isValidPhone(identifier)) {
      Object.assign(baseUser, { phone: identifier });
    }
    const user = await repository.users.save(baseUser);

    // Index referral code in KV for lookup
    if (c.env.NONCE_KV) {
      await storeReferralCode(c.env.NONCE_KV, referralCode, user.identifier);
    }

    log.info('user.created', {
      identifier: user.identifier,
      hasReferrer: !!referrerId,
      role: baseUser.role,
    });

    return { user, isNewUser: true };
  };

  return {
    // I. OAUTH
    async getAuthUrlUseCase(provider: OAuthProvider, sessionId: string): Promise<string> {
      const oauthService = createOAuthService(c.env);      
      const state = await oauthService.generateState(sessionId);

      const config = await oauthUtils.getOAuthConfig(provider, c.env);
      const params = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: config.redirectUri,
        response_type: 'code',
        scope: oauthUtils.getOAuthScopes(provider),
        state,
      });

      const endpoints: Record<OAuthProvider, string> = {
        google: `https://accounts.google.com/o/oauth2/v2/auth?${params}`,
        apple: `https://appleid.apple.com/auth/authorize?${params}`,
        facebook: `https://www.facebook.com/v18.0/dialog/oauth?${params}`,
        github: `https://github.com/login/oauth/authorize?${params}`,
        twitter: `https://x.com/i/oauth2/authorize?${params}`
      };

      return endpoints[provider];
    },

    async exchangeOAuthCodeUseCase(provider: string, state: string, code: string): Promise<{ userInfo: any; sessionId: string }> {
      const oauthService = createOAuthService(c.env);
      const { tokenData, sessionId } = await oauthService.exchangeOAuthCode(provider, state, code);
      const userInfo = await oauthService.getUserInfoFromProvider(provider, tokenData.access_token);
      return { userInfo, sessionId };
    },

    async connectOAuthUseCase(sessionId: string, identifier: string, ipAddress: string, userAgent: string, country?: string, ref?: string, deviceId?: string): Promise<{ sessionId: string } | { requiresTotp: true } | { requiresSms: true }> {
      const repository = getRepository(identifier);
      const { user, isNewUser } = await getOrCreateUser(repository, identifier, {}, ref);
      const normalizedId = validationUtils.normalizeIdentifier(identifier);
      const dForPending = normalizeDeviceId(deviceId);

      const account2fa = await applyEnabledSecondFactorStepUp(
        c, bindingName, identifier, sessionId, dForPending,
      );
      if (account2fa) {
        log.info('auth.oauth_step_up', {
          method: 'requiresTotp' in account2fa ? 'totp' : 'sms',
          identifier: normalizedId,
          isNewUser,
        });
        return account2fa;
      }

      const stepUp = await evaluateNovelDeviceStepUp(c, bindingName, repository, normalizedId, sessionId, dForPending);
      if (stepUp) return stepUp;

      const result = await createUserSession(repository, user, 'oauth', ipAddress, userAgent, country, dForPending);
      // Notification gửi khi WS connect (đúng flow: login → token → client connect WS → gửi notification)
      if (isNewUser) {
        const wsApp = createWebsocketApplicationService(c, bindingName);
        await wsApp.storePendingFirstLoginNotificationUseCase(identifier);
      }
      return result;
    },

    // II. EMAIL/PHONE
    async getRequestOtpUseCase(
      identifier: string,
      sessionId: string,
      ipAddress: string,
      language?: 'vi' | 'en',
      turnstileToken?: string,
      captchaScope: HumanChallengeScope = 'preauth',
    ): Promise<void> {
      const hourlyCount = await getOtpRequestCountThisHour(c.env, identifier);
      await assertHumanChallenge(c.env, {
        scope: captchaScope,
        sessionId,
        identifier,
        ip: ipAddress,
        turnstileToken,
        otpRequestsThisHour: hourlyCount,
        reason: 'otp_request',
      });

      const allowed = await checkOtpRequestAllowed(c.env, ipAddress, identifier);
      if (!allowed.allowed) {
        throw new OtpRateLimitError(allowed.retryAfter);
      }

      const nIdentifier = validationUtils.normalizeIdentifier(identifier);
      const otpService = createOTPService(c.env);
      const otp = await otpService.generateOTP(sessionId, nIdentifier);

      if (validationUtils.isValidEmail(nIdentifier)) {
        await otpService.sendEmailOTP(nIdentifier, otp, language);
      } else if (validationUtils.isValidPhone(nIdentifier)) {
        await otpService.sendSmsOTP(nIdentifier, otp);
      } else {
        throw new Error('Invalid identifier');
      }

      await recordOtpRequest(c.env, ipAddress, identifier);
    },

    async verifyOtpUseCase(identifier: string, sessionId: string, otp: string, ipAddress: string, userAgent: string, country?: string, ref?: string, deviceId?: string): Promise<{ sessionId: string } | { requiresTotp: true } | { requiresSms: true }> {
      const normalizedId = validationUtils.normalizeIdentifier(identifier);
      const otpService = createOTPService(c.env);
      const isValid = await otpService.verifyOTP(otp, sessionId, normalizedId);
      if (!isValid) {
        throw new Error(ERROR_MESSAGES.AUTH.INVALID_OTP);
      }
      await clearIdentifierOtpVerifyFailures(c.env, normalizedId);

      const repository = getRepository(normalizedId);
      const { user, isNewUser } = await getOrCreateUser(repository, normalizedId, {}, ref);
      const dForPending = normalizeDeviceId(deviceId);

      const account2fa = await applyEnabledSecondFactorStepUp(
        c, bindingName, normalizedId, sessionId, dForPending,
      );
      if (account2fa) return account2fa;

      const stepUp = await evaluateNovelDeviceStepUp(c, bindingName, repository, normalizedId, sessionId, dForPending);
      if (stepUp) return stepUp;

      const result = await createUserSession(repository, user, 'otp', ipAddress, userAgent, country, dForPending);
      if (isNewUser) {
        const wsApp = createWebsocketApplicationService(c, bindingName);
        await wsApp.storePendingFirstLoginNotificationUseCase(normalizedId);
      }
      return result;
    },

    async verifyTotpLoginUseCase(sessionId: string, code: string, ipAddress: string, userAgent: string, country?: string, deviceId?: string): Promise<{ sessionId: string }> {
      const blocked = await checkOtpVerifyBlocked(c.env, sessionId);
      if (blocked.blocked) {
        throw new OtpRateLimitError(blocked.retryAfter);
      }

      const pendingRaw = await c.env.NONCE_KV.get(`PendingTotp:${sessionId}`);
      const pending = parsePendingAuth(pendingRaw);
      if (!pending) {
        throw new Error(ERROR_MESSAGES.AUTH.TOTP_SESSION_EXPIRED);
      }
      const { identifier } = pending;
      const resolvedDeviceId = normalizeDeviceId(deviceId) ?? pending.deviceId ?? null;

      const authenticatorApp = createAccountAuthenticatorApplication(c, bindingName);
      const totpStatus = await authenticatorApp.getAuthenticatorStatusUseCase(identifier);
      if (!totpStatus.enabled) throw new Error('TOTP not enabled');

      const userDO = getIdFromName(c, identifier, bindingName) as DurableObjectStub<UserDO>;
      const authRepo = createAuthenticatorRepository(userDO);
      const secret = await authRepo.getSecret();
      if (!secret) throw new Error('TOTP not configured');
      const trimmedCode = code.replace(/\D/g, '').slice(0, 6);
      const valid = await verifyTotpCode(secret, trimmedCode);
      if (!valid) {
        await recordOtpVerifyFailure(c.env, sessionId, identifier);
        const afterFail = await checkOtpVerifyBlocked(c.env, sessionId);
        if (afterFail.blocked) {
          throw new OtpRateLimitError(afterFail.retryAfter);
        }
        throw new Error(ERROR_MESSAGES.AUTH.INVALID_OTP);
      }

      await clearOtpVerifyAttempts(c.env, sessionId);
      await clearIdentifierOtpVerifyFailures(c.env, identifier);
      await c.env.NONCE_KV.delete(`PendingTotp:${sessionId}`);

      const repository = getRepository(identifier);
      const user = await repository.users.get();
      if (!user) throw new Error(ERROR_MESSAGES.AUTH.USER_NOT_FOUND);
      return await createUserSession(repository, user, 'otp', ipAddress, userAgent, country, resolvedDeviceId);
    },

    async verifySmsLoginUseCase(sessionId: string, code: string, ipAddress: string, userAgent: string, country?: string, deviceId?: string): Promise<{ sessionId: string }> {
      const blocked = await checkOtpVerifyBlocked(c.env, sessionId);
      if (blocked.blocked) {
        throw new OtpRateLimitError(blocked.retryAfter);
      }

      const raw = await c.env.NONCE_KV.get(pendingSmsLoginKvKey(sessionId));
      if (!raw) {
        throw new Error(ERROR_MESSAGES.AUTH.SMS_SESSION_EXPIRED);
      }

      const parsed = parsePendingSmsLogin(raw);
      const encryptSecret = await c.env.ENCRYPTION_SECRET.get();
      if (!encryptSecret) {
        throw new Error('ENCRYPTION_SECRET is not defined in environment variables');
      }
      const valid = await verifyPendingSmsLoginCode(sessionId, code, parsed, encryptSecret);
      if (!valid) {
        await recordOtpVerifyFailure(c.env, sessionId, parsed.identifier);
        const afterFail = await checkOtpVerifyBlocked(c.env, sessionId);
        if (afterFail.blocked) {
          throw new OtpRateLimitError(afterFail.retryAfter);
        }
        throw new Error(ERROR_MESSAGES.AUTH.INVALID_OTP);
      }
      const resolvedDeviceId = normalizeDeviceId(deviceId) ?? normalizeDeviceId(parsed.deviceId) ?? null;

      await c.env.NONCE_KV.delete(pendingSmsLoginKvKey(sessionId));
      await clearOtpVerifyAttempts(c.env, sessionId);
      await clearIdentifierOtpVerifyFailures(c.env, parsed.identifier);

      const repository = getRepository(parsed.identifier);
      const user = await repository.users.get();
      if (!user) throw new Error(ERROR_MESSAGES.AUTH.USER_NOT_FOUND);
      return await createUserSession(repository, user, 'otp', ipAddress, userAgent, country, resolvedDeviceId);
    },

    async verifyBackupCodeLoginUseCase(sessionId: string, code: string, ipAddress: string, userAgent: string, country?: string, deviceId?: string): Promise<{ sessionId: string }> {
      const blocked = await checkOtpVerifyBlocked(c.env, sessionId);
      if (blocked.blocked) {
        throw new OtpRateLimitError(blocked.retryAfter);
      }

      let pending = parsePendingAuth(await c.env.NONCE_KV.get(`PendingTotp:${sessionId}`));
      if (!pending) {
        const raw = await c.env.NONCE_KV.get(pendingSmsLoginKvKey(sessionId));
        if (!raw) {
          throw new Error(ERROR_MESSAGES.AUTH.TWO_FA_SESSION_EXPIRED);
        }
        const parsed = parsePendingSmsLogin(raw);
        pending = { identifier: parsed.identifier, deviceId: normalizeDeviceId(parsed.deviceId) ?? undefined };
      }
      const { identifier } = pending;
      const resolvedDeviceId = normalizeDeviceId(deviceId) ?? pending.deviceId ?? null;

      const userDO = getIdFromName(c, identifier, bindingName) as DurableObjectStub<UserDO>;
      const backupRepo = createBackupCodeRepository(userDO);
      const normalized = normalizeBackupCodeInput(code);
      const consumed = await backupRepo.consumeCode(normalized);
      if (!consumed) {
        await recordOtpVerifyFailure(c.env, sessionId, identifier);
        const afterFail = await checkOtpVerifyBlocked(c.env, sessionId);
        if (afterFail.blocked) {
          throw new OtpRateLimitError(afterFail.retryAfter);
        }
        throw new Error(ERROR_MESSAGES.AUTH.INVALID_OTP);
      }

      await clearOtpVerifyAttempts(c.env, sessionId);
      await clearIdentifierOtpVerifyFailures(c.env, identifier);
      await c.env.NONCE_KV.delete(`PendingTotp:${sessionId}`);
      await c.env.NONCE_KV.delete(pendingSmsLoginKvKey(sessionId));

      const repository = getRepository(identifier);
      const user = await repository.users.get();
      if (!user) throw new Error(ERROR_MESSAGES.AUTH.USER_NOT_FOUND);
      return await createUserSession(repository, user, 'otp', ipAddress, userAgent, country, resolvedDeviceId);
    },

    async recoverWithBackupCodeUseCase(
      identifier: string,
      code: string,
      sessionId: string,
      ipAddress: string,
      userAgent: string,
      country?: string,
      deviceId?: string,
      turnstileToken?: string,
    ): Promise<{ sessionId: string }> {
      const nIdentifier = validationUtils.normalizeIdentifier(identifier);
      await assertHumanChallenge(c.env, {
        scope: 'preauth',
        sessionId,
        identifier: nIdentifier,
        ip: ipAddress,
        turnstileToken,
        reason: 'backup_recover',
      });
      await assertBackupCodeRecoverAllowed(c.env, nIdentifier);

      const repository = getRepository(nIdentifier);
      const user = await repository.users.get();
      if (!user) {
        await recordBackupCodeRecoverFailure(c.env, nIdentifier);
        throw new Error(ERROR_MESSAGES.AUTH.INVALID_OTP);
      }

      const userDO = getIdFromName(c, nIdentifier, bindingName) as DurableObjectStub<UserDO>;
      const backupRepo = createBackupCodeRepository(userDO);
      const normalized = normalizeBackupCodeInput(code);
      const consumed = await backupRepo.consumeCode(normalized);
      if (!consumed) {
        await recordBackupCodeRecoverFailure(c.env, nIdentifier);
        const allowed = await checkBackupCodeRecoverAllowed(c.env, nIdentifier);
        if (!allowed.allowed) {
          throw new OtpRateLimitError(allowed.retryAfter);
        }
        throw new Error(ERROR_MESSAGES.AUTH.INVALID_OTP);
      }

      await clearBackupCodeRecoverAttempts(c.env, nIdentifier);
      return await createUserSession(repository, user, 'otp', ipAddress, userAgent, country, normalizeDeviceId(deviceId));
    },

    // III. WALLET
    async generateNonceUseCase(sessionId: string): Promise<string> {
      const walletService = createWalletService(c.env);      
      return await walletService.generateNonceAndStore(sessionId);
    },

    async verifySignatureUseCase(sessionId: string, message: string, signature: string): Promise<SiweMessage> {
      const walletService = createWalletService(c.env);      
      return await walletService.verifySignature(sessionId, message, signature, c.env.SIWE_DOMAIN, c.env.FRONTEND_URL);
    },

    async connectWalletUseCase(sessionId: string, address: string, ipAddress: string, userAgent: string, country?: string, ref?: string, deviceId?: string): Promise<{ sessionId: string } | { requiresTotp: true } | { requiresSms: true }> {
      const repository = getRepository(address);
      const { user, isNewUser } = await getOrCreateUser(repository, address, { address }, ref);
      const normalizedAddr = validationUtils.normalizeIdentifier(address);
      const dForPending = normalizeDeviceId(deviceId);

      const account2fa = await applyEnabledSecondFactorStepUp(
        c, bindingName, address, sessionId, dForPending,
      );
      if (account2fa) return account2fa;

      const stepUp = await evaluateNovelDeviceStepUp(c, bindingName, repository, normalizedAddr, sessionId, dForPending);
      if (stepUp) return stepUp;

      const result = await createUserSession(repository, user, 'siwe', ipAddress, userAgent, country, dForPending);
      if (isNewUser) {
        const wsApp = createWebsocketApplicationService(c, bindingName);
        await wsApp.storePendingFirstLoginNotificationUseCase(address);
      }
      return result;
    },

    async connectPasskeyUseCase(
      sessionId: string,
      identifier: string,
      ipAddress: string,
      userAgent: string,
      country?: string,
      deviceId?: string,
      passkeyCredentialId?: string,
    ): Promise<{ sessionId: string } | { requiresTotp: true } | { requiresSms: true }> {
      const repository = getRepository(identifier);
      const user = await repository.users.get();
      if (!user) throw new Error(ERROR_MESSAGES.AUTH.USER_NOT_FOUND);
      const normalizedId = validationUtils.normalizeIdentifier(identifier);

      let dForPending = normalizeDeviceId(deviceId);
      if (passkeyCredentialId && c.env.NONCE_KV) {
        dForPending = await resolvePasskeyLoginDeviceId(
          c.env.NONCE_KV,
          normalizedId,
          passkeyCredentialId,
          deviceId,
        );
      }

      // Passkey verify already proves possession + device unlock; no TOTP/SMS or novel-device step-up.

      if (passkeyCredentialId && dForPending && c.env.NONCE_KV) {
        await bindPasskeyDeviceId(c.env.NONCE_KV, normalizedId, passkeyCredentialId, dForPending);
      }

      return await createUserSession(repository, user, 'passkey', ipAddress, userAgent, country, dForPending);
    },

    // IV. Common
    async revokeSessionBySessionIdUseCase(sessionId: string): Promise<void> {
      const identifier = await c.env.NONCE_KV.get(`${SESSION_LOOKUP_PREFIX}${sessionId}`);
      if (identifier) {
        await this.logoutUseCase(identifier, sessionId);
      }
    },

    async logoutUseCase(identifier: string, sessionId: string): Promise<void> {
      await clearCaptchaSatisfied(c.env, 'session', sessionId);
      const repository = getRepository(identifier);
      const session = await repository.sessions.findById(sessionId);
      await repository.sessions.update(sessionId, { isActive: false });
      await c.env.NONCE_KV.delete(`${SESSION_LOOKUP_PREFIX}${sessionId}`);
      const activeSessions = await repository.sessions.listAll(50);
      await forgetKnownDeviceIfUnused(c.env.NONCE_KV, identifier, session?.deviceId, activeSessions);
      // Đóng WebSocket để trigger webSocketClose → unregisterUser trên BroadcastServiceDO
      try {
        const userDO = getIdFromName(c, identifier, bindingName) as DurableObjectStub<UserDO>;
        await userDO.fetch('https://user.internal/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'closeConnectionsForSession', sessionId }),
        });
      } catch (e) {
        console.warn('[logoutUseCase] closeConnectionsForSession failed:', e);
      }
    },

    async logoutAllUseCase(identifier: string): Promise<void> {
      const repository = getRepository(identifier);
      const beforeDeactivate = await repository.sessions.listAll(500);
      const hashSessionIds = await repository.sessions.deactivateAllUserSessions(identifier);
      for (const sid of hashSessionIds) {
        await c.env.NONCE_KV.delete(`${SESSION_LOOKUP_PREFIX}${sid}`);
      }
      const deviceIds = new Set<string>();
      for (const s of beforeDeactivate) {
        const d = normalizeDeviceId(s.deviceId);
        if (d) deviceIds.add(d);
      }
      for (const d of deviceIds) {
        await c.env.NONCE_KV.delete(`${KNOWN_DEVICE_KV_PREFIX}${identifier}:${d}`);
      }
      // Đóng tất cả WebSocket để trigger unregisterUser
      try {
        const userDO = getIdFromName(c, identifier, bindingName) as DurableObjectStub<UserDO>;
        await userDO.fetch('https://user.internal/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'closeAllConnections' }),
        });
      } catch (e) {
        console.warn('[logoutAllUseCase] closeAllConnections failed:', e);
      }
    },

    async listSessionsUseCase(identifier: string, currentSessionId?: string): Promise<{ sessions: Array<{ id: number; hashSessionId: string; type: string; ipAddress?: string; userAgent?: string; deviceId?: string; country?: string; expiresAt: string; isActive: boolean; isCurrent?: boolean }> }> {
      const repository = getRepository(identifier);
      const list = await repository.sessions.listAll(50);
      const sessions = list.map((s: any, index: number) => ({
        id: s.id ?? index,
        hashSessionId: s.hashSessionId,
        type: s.type ?? 'unknown',
        ipAddress: s.ipAddress,
        userAgent: s.userAgent,
        deviceId: s.deviceId,
        country: s.country,
        expiresAt: s.expiresAt,
        isActive: !!s.isActive,
        isCurrent: currentSessionId ? s.hashSessionId === currentSessionId : undefined,
      }));
      return { sessions };
    },

    async revokeSessionUseCase(identifier: string, sessionId: string): Promise<void> {
      const repository = getRepository(identifier);
      const session = await repository.sessions.findById(sessionId);
      await repository.sessions.update(sessionId, { isActive: false });
      await c.env.NONCE_KV.delete(`${SESSION_LOOKUP_PREFIX}${sessionId}`);
      const activeSessions = await repository.sessions.listAll(50);
      await forgetKnownDeviceIfUnused(c.env.NONCE_KV, identifier, session?.deviceId, activeSessions);
      try {
        const userDO = getIdFromName(c, identifier, bindingName) as DurableObjectStub<UserDO>;
        await userDO.fetch('https://user.internal/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'closeConnectionsForSession', sessionId }),
        });
      } catch (e) {
        console.warn('[revokeSessionUseCase] closeConnectionsForSession failed:', e);
      }
    },

    async verifySessionUseCase(
      sessionId: string,
      clientIp?: string,
      clientUserAgent?: string,
      clientCountry?: string,
    ): Promise<{ ok: boolean; user: any }> {
      const identifier = await c.env.NONCE_KV.get(`${SESSION_LOOKUP_PREFIX}${sessionId}`);
      if (!identifier) {
        throw new Error(ERROR_MESSAGES.AUTH.SESSION_NOT_FOUND);
      }
      const repository = getRepository(identifier);
      const user = await repository.users.get();
      if (!user) {
        throw new Error(ERROR_MESSAGES.AUTH.USER_NOT_FOUND);
      }
      const session = await repository.sessions.findById(sessionId);
      if (!session) {
        throw new Error(ERROR_MESSAGES.AUTH.SESSION_NOT_FOUND);
      }
      validationUtils.validateSession(session);

      // Revoke khi CẢ subnet IP VÀ browser/OS đều lệch (dấu hiệu thiết bị khác), không phải chỉ IP đổi
      const sessionIp = session.ipAddress;
      const sessionUa = session.userAgent ?? '';
      let ipMismatch = false;
      let uaMismatch = false;
      if (sessionIp != null && sessionIp !== '' && clientIp != null && clientIp !== '') {
        if (!ipFingerprintsMatch(sessionIp, clientIp)) ipMismatch = true;
      }
      if (sessionUa !== '' && clientUserAgent != null && clientUserAgent !== '') {
        if (!uaFingerprintsMatch(sessionUa, clientUserAgent)) uaMismatch = true;
      }
      if (ipMismatch && uaMismatch) {
        await this.logoutAllUseCase(identifier);
        throw new Error(ERROR_MESSAGES.AUTH.SESSION_NOT_FOUND);
      }

      const telemetryKey = `${REPLAY_TELEMETRY_PREFIX}${identifier}:${sessionId}`;
      const currentIpFp = normalizeIpFingerprint(clientIp || session.ipAddress || '');
      const currentUaFp = normalizeUaFingerprint(clientUserAgent || session.userAgent || '');
      const currentCountry = normalizeLoginCountry(clientCountry) ?? normalizeLoginCountry(session.country) ?? 'XX';
      const now = Date.now();
      const previousRaw = await c.env.NONCE_KV.get(telemetryKey);
      if (previousRaw) {
        const previous = JSON.parse(previousRaw) as {
          ts: number;
          ipFp: string;
          uaFp: string;
          country: string;
        };
        const fingerprintChanged = previous.ipFp !== currentIpFp || previous.uaFp !== currentUaFp;
        const countryChanged = previous.country !== 'XX' && currentCountry !== 'XX' && previous.country !== currentCountry;
        const rapidCountrySwitch = countryChanged && now - previous.ts < 2 * 60 * 60 * 1000;
        if (fingerprintChanged && rapidCountrySwitch) {
          log.warn('session.replay_geo_velocity_revoked', {
            identifier,
            sessionId,
            previousCountry: previous.country,
            currentCountry,
            previousIpFp: previous.ipFp,
            currentIpFp,
            previousUaFp: previous.uaFp,
            currentUaFp,
            deltaMs: now - previous.ts,
          });
          await this.logoutAllUseCase(identifier);
          throw new Error(ERROR_MESSAGES.AUTH.SESSION_NOT_FOUND);
        }
      }
      await c.env.NONCE_KV.put(
        telemetryKey,
        JSON.stringify({ ts: now, ipFp: currentIpFp, uaFp: currentUaFp, country: currentCountry }),
        { expirationTtl: 7 * 24 * 60 * 60 },
      );

      return { ok: true, user };
    }
  };
}