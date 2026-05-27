import { Context } from 'hono';
import { createLogger } from '../../shared/logger';
import { getIdFromName, getSessionIdHash } from '../../shared/utils';
import { isAdminIdentifier } from '../../shared/admin-config';
import { UserDO } from '../ws/infrastructure/UserDO';
import { SiweMessage } from 'siwe';

import { OAuthProvider, Session } from './domain';
import CryptoJS from 'crypto-js';
import { 
  validationUtils, 
  walletUtils, 
  oauthUtils,
  hashPhone,
  otpUtils,
} from './utils';
import { createOAuthService, createRepository, createOTPService, createWalletService } from './infrastructure';
import {
  checkOtpRequestAllowed,
  OtpRateLimitError,
  recordOtpRequest,
} from '../../shared/otp-rate-limit';
import { createPasskeyAuthApplication } from '../account/passkey';
import { createAccountAuthenticatorApplication, createAccountSmsApplication } from '../account/application';
import { createAuthenticatorRepository, createSmsRepository, createBackupCodeRepository } from '../account/infrastructure';
import { normalizeBackupCodeInput } from '../account/backup-codes';
import { verifyTotpCode } from '../account/totp';
import { AUTH_CONSTANTS, ERROR_MESSAGES } from './constant';
import { createVersionApplicationService } from '../admin/version/application';
import { getAuthExpiryFromConfig } from '../admin/system-config/get-auth-expiry';
import { createWebsocketApplicationService } from '../ws/application';
import { generateReferralCode, resolveReferrerByCode, storeReferralCode } from '../member/referral/utils';
import {
  decideNewSessionEmail,
  evaluateNovelDeviceStepUp,
  forgetKnownDeviceIfUnused,
  KNOWN_DEVICE_KV_PREFIX,
  markKnownDevice,
  normalizeDeviceId,
  parsePendingAuth,
  serializePendingAuth,
} from './device-trust';
import { ipFingerprintsMatch, normalizeLoginCountry, uaFingerprintsMatch } from './session-fingerprint';

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
  ): Promise<void>;
  verifyOtpUseCase(identifier: string, sessionId: string, otp: string, ipAddress: string, userAgent: string, country?: string, ref?: string, deviceId?: string): Promise<{ sessionId: string } | { requiresTotp: true } | { requiresSms: true }>;
  verifyTotpLoginUseCase(sessionId: string, code: string, ipAddress: string, userAgent: string, country?: string, deviceId?: string): Promise<{ sessionId: string }>;
  verifySmsLoginUseCase(sessionId: string, code: string, ipAddress: string, userAgent: string, country?: string, deviceId?: string): Promise<{ sessionId: string }>;
  verifyBackupCodeLoginUseCase(sessionId: string, code: string, ipAddress: string, userAgent: string, country?: string, deviceId?: string): Promise<{ sessionId: string }>;
  recoverWithBackupCodeUseCase(identifier: string, code: string, sessionId: string, ipAddress: string, userAgent: string, country?: string, deviceId?: string): Promise<{ sessionId: string }>;

  // III. WALLET
  generateNonceUseCase(sessionId: string): Promise<string>;
  verifySignatureUseCase(sessionId: string, message: string, signature: string): Promise<SiweMessage>;
  connectWalletUseCase(sessionId: string, address: string, ipAddress: string, userAgent: string, country?: string, ref?: string, deviceId?: string): Promise<{ sessionId: string } | { requiresTotp: true } | { requiresSms: true }>;

  // IIIb. PASSKEY (login)
  connectPasskeyUseCase(sessionId: string, identifier: string, ipAddress: string, userAgent: string, country?: string, deviceId?: string): Promise<{ sessionId: string } | { requiresTotp: true } | { requiresSms: true }>;
  
  // IV. Common
  logoutUseCase(identifier: string, sessionId: string): Promise<void>;
  /** Revoke session by sessionId only (dùng khi middleware catch lỗi, chưa có identifier). Lấy identifier từ KV nếu còn. */
  revokeSessionBySessionIdUseCase(sessionId: string): Promise<void>;
  logoutAllUseCase(identifier: string): Promise<void>;
  listSessionsUseCase(identifier: string, currentSessionId?: string): Promise<{ sessions: Array<{ id: number; hashSessionId: string; type: string; ipAddress?: string; userAgent?: string; deviceId?: string; country?: string; expiresAt: string; isActive: boolean; isCurrent?: boolean }> }>;
  revokeSessionUseCase(identifier: string, sessionId: string): Promise<void>;
  verifySessionUseCase(sessionId: string, clientIp?: string, clientUserAgent?: string): Promise<{ ok: boolean; user: any }>;
}

const log = createLogger('auth-worker', 'auth');

export function createApplicationService(c: Context, bindingName: string): IApplicationService {
  const getRepository = (identifier: string) => {
    const userDO = getIdFromName(c, identifier, bindingName) as DurableObjectStub<UserDO>;
    if (!userDO) throw new Error(ERROR_MESSAGES.AUTH.USER_NOT_FOUND);
    return createRepository(userDO);
  };

  const SESSION_LOOKUP_PREFIX = 'SessionLookup:';

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
      const dId = normalizeDeviceId(deviceId);

      const authenticatorApp = createAccountAuthenticatorApplication(c, bindingName);
      const smsApp = createAccountSmsApplication(c, bindingName);
      const totpStatus = await authenticatorApp.getAuthenticatorStatusUseCase(identifier);
      const smsStatus = await smsApp.getSmsStatusUseCase(identifier);

      // 1. Authenticator ưu tiên trước SMS nếu bật cả hai
      if (totpStatus.enabled) {
        await c.env.NONCE_KV.put(`PendingTotp:${sessionId}`, serializePendingAuth(normalizedId, dId), { expirationTtl: 300 });
        log.info('auth.oauth_step_up', { method: 'totp', identifier: normalizedId, isNewUser });
        return { requiresTotp: true };
      }

      // 2. Chỉ SMS bật -> chọn SMS
      if (smsStatus.enabled) {
        const userDO = getIdFromName(c, identifier, bindingName) as DurableObjectStub<UserDO>;
        const smsRepo = createSmsRepository(userDO);
        let phone: string | null = null;

        const encryptedPhone = await smsRepo.getSmsPhoneEncrypted();
        if (encryptedPhone) {
          const encryptSecret = await c.env.ENCRYPTION_SECRET.get();
          if (encryptSecret) {
            const bytes = CryptoJS.AES.decrypt(encryptedPhone, encryptSecret);
            phone = bytes.toString(CryptoJS.enc.Utf8) || null;
          }
        }

        if (!phone && validationUtils.isValidPhone(identifier)) {
          const identifierHash = await hashPhone(validationUtils.normalizeIdentifier(identifier));
          const storedHash = await smsRepo.getPhoneHash();
          if (storedHash === identifierHash) {
            phone = identifier.startsWith('+') ? identifier : `+${identifier}`;
          }
        }

        if (!phone) {
          throw new Error('Cannot send SMS 2FA: phone not available. Please re-enable SMS 2FA.');
        }

        const smsOtp = otpUtils.generateOTP(6);
        await c.env.NONCE_KV.put(
          `PendingSmsLogin:${sessionId}`,
          JSON.stringify({ identifier, otp: smsOtp, deviceId: dId ?? undefined }),
          { expirationTtl: 300 },
        );
        await createOTPService(c.env).sendSmsOTP(phone.startsWith('+') ? phone : `+${phone}`, smsOtp);
        log.info('auth.oauth_step_up', { method: 'sms', identifier: normalizedId, isNewUser });
        return { requiresSms: true };
      }

      const stepUp = await evaluateNovelDeviceStepUp(c, bindingName, repository, normalizedId, sessionId, dId);
      if (stepUp) return stepUp;

      // 3. Cả hai đều không bật -> đăng nhập bình thường
      const result = await createUserSession(repository, user, 'oauth', ipAddress, userAgent, country, dId);
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
    ): Promise<void> {
      const allowed = await checkOtpRequestAllowed(c.env, ipAddress, identifier);
      if (!allowed.allowed) {
        throw new OtpRateLimitError(allowed.retryAfter);
      }

      const otpService = createOTPService(c.env);
      const otp = await otpService.generateOTP(sessionId);
      const nIdentifier = validationUtils.normalizeIdentifier(identifier);

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
      const otpService = createOTPService(c.env);
      const isValid = await otpService.verifyOTP(otp, sessionId);
      if (!isValid) {
        throw new Error(ERROR_MESSAGES.AUTH.INVALID_OTP);
      }

      const repository = getRepository(identifier);
      const { user, isNewUser } = await getOrCreateUser(repository, identifier, {}, ref);
      const normalizedId = validationUtils.normalizeIdentifier(identifier);
      const dId = normalizeDeviceId(deviceId);

      const authenticatorApp = createAccountAuthenticatorApplication(c, bindingName);
      const smsApp = createAccountSmsApplication(c, bindingName);
      const totpStatus = await authenticatorApp.getAuthenticatorStatusUseCase(identifier);
      const smsStatus = await smsApp.getSmsStatusUseCase(identifier);

      // 1. Cả authenticator và SMS đều bật -> chọn authenticator
      if (totpStatus.enabled) {
        if (!c.env.NONCE_KV) {
          console.error('[Auth] OTP: NONCE_KV binding is missing');
          throw new Error('NONCE_KV not configured');
        }
        if (!sessionId || sessionId.length < 32) {
          console.error('[Auth] OTP: invalid sessionId for PendingTotp', { sessionId, len: sessionId?.length });
          throw new Error('Invalid session for 2FA');
        }
        try {
          await c.env.NONCE_KV.put(`PendingTotp:${sessionId}`, serializePendingAuth(normalizedId, dId), { expirationTtl: 300 });
        } catch (kvErr) {
          console.error('[Auth] OTP: NONCE_KV.put PendingTotp failed sessionId=', sessionId, 'normalizedId=', normalizedId, 'error=', kvErr);
          throw kvErr;
        }
        return { requiresTotp: true };
      }

      // 2. Chỉ SMS bật -> chọn SMS
      if (smsStatus.enabled) {
        const userDO = getIdFromName(c, identifier, bindingName) as DurableObjectStub<UserDO>;
        const smsRepo = createSmsRepository(userDO);
        let phone: string | null = null;

        const encryptedPhone = await smsRepo.getSmsPhoneEncrypted();
        if (encryptedPhone) {
          const encryptSecret = await c.env.ENCRYPTION_SECRET.get();
          if (encryptSecret) {
            const bytes = CryptoJS.AES.decrypt(encryptedPhone, encryptSecret);
            phone = bytes.toString(CryptoJS.enc.Utf8) || null;
          }
        }

        if (!phone && validationUtils.isValidPhone(identifier)) {
          const identifierHash = await hashPhone(validationUtils.normalizeIdentifier(identifier));
          const storedHash = await smsRepo.getPhoneHash();
          if (storedHash === identifierHash) {
            phone = identifier.startsWith('+') ? identifier : `+${identifier}`;
          }
        }

        if (!phone) {
          throw new Error('Cannot send SMS 2FA: phone not available. Please re-enable SMS 2FA.');
        }

        const smsOtp = otpUtils.generateOTP(6);
        await c.env.NONCE_KV.put(
          `PendingSmsLogin:${sessionId}`,
          JSON.stringify({ identifier, otp: smsOtp, deviceId: dId ?? undefined }),
          { expirationTtl: 300 },
        );
        await otpService.sendSmsOTP(phone.startsWith('+') ? phone : `+${phone}`, smsOtp);
        return { requiresSms: true };
      }

      const stepUp = await evaluateNovelDeviceStepUp(c, bindingName, repository, normalizedId, sessionId, dId);
      if (stepUp) return stepUp;

      // 3. Cả hai đều không bật -> đăng nhập bình thường
      const result = await createUserSession(repository, user, 'otp', ipAddress, userAgent, country, dId);
      if (isNewUser) {
        const wsApp = createWebsocketApplicationService(c, bindingName);
        await wsApp.storePendingFirstLoginNotificationUseCase(identifier);
      }
      return result;
    },

    async verifyTotpLoginUseCase(sessionId: string, code: string, ipAddress: string, userAgent: string, country?: string, deviceId?: string): Promise<{ sessionId: string }> {
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
        throw new Error(ERROR_MESSAGES.AUTH.INVALID_OTP);
      }

      await c.env.NONCE_KV.delete(`PendingTotp:${sessionId}`);

      const repository = getRepository(identifier);
      const user = await repository.users.get();
      if (!user) throw new Error(ERROR_MESSAGES.AUTH.USER_NOT_FOUND);
      return await createUserSession(repository, user, 'otp', ipAddress, userAgent, country, resolvedDeviceId);
    },

    async verifySmsLoginUseCase(sessionId: string, code: string, ipAddress: string, userAgent: string, country?: string, deviceId?: string): Promise<{ sessionId: string }> {
      const raw = await c.env.NONCE_KV.get(`PendingSmsLogin:${sessionId}`);
      if (!raw) {
        throw new Error(ERROR_MESSAGES.AUTH.SMS_SESSION_EXPIRED);
      }

      const parsed = JSON.parse(raw) as { identifier: string; otp: string; deviceId?: string };
      if (parsed.otp !== code) throw new Error(ERROR_MESSAGES.AUTH.INVALID_OTP);
      const resolvedDeviceId = normalizeDeviceId(deviceId) ?? normalizeDeviceId(parsed.deviceId) ?? null;

      await c.env.NONCE_KV.delete(`PendingSmsLogin:${sessionId}`);

      const repository = getRepository(parsed.identifier);
      const user = await repository.users.get();
      if (!user) throw new Error(ERROR_MESSAGES.AUTH.USER_NOT_FOUND);
      return await createUserSession(repository, user, 'otp', ipAddress, userAgent, country, resolvedDeviceId);
    },

    async verifyBackupCodeLoginUseCase(sessionId: string, code: string, ipAddress: string, userAgent: string, country?: string, deviceId?: string): Promise<{ sessionId: string }> {
      let pending = parsePendingAuth(await c.env.NONCE_KV.get(`PendingTotp:${sessionId}`));
      if (!pending) {
        const raw = await c.env.NONCE_KV.get(`PendingSmsLogin:${sessionId}`);
        if (!raw) {
          throw new Error(ERROR_MESSAGES.AUTH.TWO_FA_SESSION_EXPIRED);
        }
        const parsed = JSON.parse(raw) as { identifier: string; deviceId?: string };
        pending = { identifier: parsed.identifier, deviceId: normalizeDeviceId(parsed.deviceId) ?? undefined };
      }
      const { identifier } = pending;
      const resolvedDeviceId = normalizeDeviceId(deviceId) ?? pending.deviceId ?? null;

      const userDO = getIdFromName(c, identifier, bindingName) as DurableObjectStub<UserDO>;
      const backupRepo = createBackupCodeRepository(userDO);
      const normalized = normalizeBackupCodeInput(code);
      const consumed = await backupRepo.consumeCode(normalized);
      if (!consumed) throw new Error(ERROR_MESSAGES.AUTH.INVALID_OTP);

      await c.env.NONCE_KV.delete(`PendingTotp:${sessionId}`);
      await c.env.NONCE_KV.delete(`PendingSmsLogin:${sessionId}`);

      const repository = getRepository(identifier);
      const user = await repository.users.get();
      if (!user) throw new Error(ERROR_MESSAGES.AUTH.USER_NOT_FOUND);
      return await createUserSession(repository, user, 'otp', ipAddress, userAgent, country, resolvedDeviceId);
    },

    async recoverWithBackupCodeUseCase(identifier: string, code: string, sessionId: string, ipAddress: string, userAgent: string, country?: string, deviceId?: string): Promise<{ sessionId: string }> {
      const nIdentifier = validationUtils.normalizeIdentifier(identifier);
      const repository = getRepository(nIdentifier);
      const user = await repository.users.get();
      if (!user) throw new Error(ERROR_MESSAGES.AUTH.USER_NOT_FOUND);

      const userDO = getIdFromName(c, nIdentifier, bindingName) as DurableObjectStub<UserDO>;
      const backupRepo = createBackupCodeRepository(userDO);
      const normalized = normalizeBackupCodeInput(code);
      const consumed = await backupRepo.consumeCode(normalized);
      if (!consumed) throw new Error(ERROR_MESSAGES.AUTH.INVALID_OTP);

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
      const dId = normalizeDeviceId(deviceId);

      const authenticatorApp = createAccountAuthenticatorApplication(c, bindingName);
      const smsApp = createAccountSmsApplication(c, bindingName);
      const totpStatus = await authenticatorApp.getAuthenticatorStatusUseCase(address);
      const smsStatus = await smsApp.getSmsStatusUseCase(address);

      // 1. Authenticator ưu tiên trước SMS nếu bật cả hai
      if (totpStatus.enabled) {
        await c.env.NONCE_KV.put(`PendingTotp:${sessionId}`, serializePendingAuth(normalizedAddr, dId), { expirationTtl: 300 });
        return { requiresTotp: true };
      }

      // 2. Chỉ SMS bật -> chọn SMS
      if (smsStatus.enabled) {
        const userDO = getIdFromName(c, address, bindingName) as DurableObjectStub<UserDO>;
        const smsRepo = createSmsRepository(userDO);
        let phone: string | null = null;

        const encryptedPhone = await smsRepo.getSmsPhoneEncrypted();
        if (encryptedPhone) {
          const encryptSecret = await c.env.ENCRYPTION_SECRET.get();
          if (encryptSecret) {
            const bytes = CryptoJS.AES.decrypt(encryptedPhone, encryptSecret);
            phone = bytes.toString(CryptoJS.enc.Utf8) || null;
          }
        }

        if (!phone && validationUtils.isValidPhone(address)) {
          const identifierHash = await hashPhone(validationUtils.normalizeIdentifier(address));
          const storedHash = await smsRepo.getPhoneHash();
          if (storedHash === identifierHash) {
            phone = address.startsWith('+') ? address : `+${address}`;
          }
        }

        if (!phone) {
          throw new Error('Cannot send SMS 2FA: phone not available. Please re-enable SMS 2FA.');
        }

        const smsOtp = otpUtils.generateOTP(6);
        await c.env.NONCE_KV.put(
          `PendingSmsLogin:${sessionId}`,
          JSON.stringify({ identifier: address, otp: smsOtp, deviceId: dId ?? undefined }),
          { expirationTtl: 300 },
        );
        await createOTPService(c.env).sendSmsOTP(phone.startsWith('+') ? phone : `+${phone}`, smsOtp);
        return { requiresSms: true };
      }

      const stepUp = await evaluateNovelDeviceStepUp(c, bindingName, repository, normalizedAddr, sessionId, dId);
      if (stepUp) return stepUp;

      // 3. Cả hai đều không bật -> đăng nhập bình thường
      const result = await createUserSession(repository, user, 'siwe', ipAddress, userAgent, country, dId);
      if (isNewUser) {
        const wsApp = createWebsocketApplicationService(c, bindingName);
        await wsApp.storePendingFirstLoginNotificationUseCase(address);
      }
      return result;
    },

    async connectPasskeyUseCase(sessionId: string, identifier: string, ipAddress: string, userAgent: string, country?: string, deviceId?: string): Promise<{ sessionId: string } | { requiresTotp: true } | { requiresSms: true }> {
      const repository = getRepository(identifier);
      const user = await repository.users.get();
      if (!user) throw new Error(ERROR_MESSAGES.AUTH.USER_NOT_FOUND);
      const normalizedId = validationUtils.normalizeIdentifier(identifier);
      const dId = normalizeDeviceId(deviceId);

      const stepUp = await evaluateNovelDeviceStepUp(c, bindingName, repository, normalizedId, sessionId, dId);
      if (stepUp) return stepUp;

      return await createUserSession(repository, user, 'passkey', ipAddress, userAgent, country, dId);
    },

    // IV. Common
    async revokeSessionBySessionIdUseCase(sessionId: string): Promise<void> {
      const identifier = await c.env.NONCE_KV.get(`${SESSION_LOOKUP_PREFIX}${sessionId}`);
      if (identifier) {
        await this.logoutUseCase(identifier, sessionId);
      }
    },

    async logoutUseCase(identifier: string, sessionId: string): Promise<void> {
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

    async verifySessionUseCase(sessionId: string, clientIp?: string, clientUserAgent?: string): Promise<{ ok: boolean; user: any }> {
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

      return { ok: true, user };
    }
  };
}