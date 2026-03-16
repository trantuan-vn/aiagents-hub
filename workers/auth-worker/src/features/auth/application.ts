import { Context } from 'hono';
import { getIdFromName, isAdmin, getSessionIdHash } from '../../shared/utils';
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
import { createPasskeyAuthApplication } from '../account/passkey';
import { createAccountAuthenticatorApplication, createAccountSmsApplication } from '../account/application';
import { createAuthenticatorRepository, createSmsRepository, createBackupCodeRepository } from '../account/infrastructure';
import { normalizeBackupCodeInput } from '../account/backup-codes';
import { verifyTotpCode } from '../account/totp';
import { AUTH_CONSTANTS, ERROR_MESSAGES } from './constant';
import { createVersionApplicationService } from '../admin/version/application';
import { getAuthExpiryFromConfig } from '../admin/system-config/get-auth-expiry';
import { createWebsocketApplicationService } from '../ws/application';

interface IApplicationService {
  // I. OAUTH
  getAuthUrlUseCase(provider: OAuthProvider, sessionId: string): Promise<string>;
  exchangeOAuthCodeUseCase(provider: string, state: string, code: string): Promise<{ userInfo: any; sessionId: string }>;
  connectOAuthUseCase(sessionId: string, identifier: string, ipAddress: string, userAgent: string): Promise<{ sessionId: string } | { requiresTotp: true } | { requiresSms: true }>;
  
  // II. EMAIL/PHONE
  getRequestOtpUseCase(identifier: string, sessionId: string, language?: 'vi' | 'en'): Promise<void>;
  verifyOtpUseCase(identifier: string, sessionId: string, otp: string, ipAddress: string, userAgent: string): Promise<{ sessionId: string } | { requiresTotp: true } | { requiresSms: true }>;
  verifyTotpLoginUseCase(sessionId: string, code: string, ipAddress: string, userAgent: string): Promise<{ sessionId: string }>;
  verifySmsLoginUseCase(sessionId: string, code: string, ipAddress: string, userAgent: string): Promise<{ sessionId: string }>;
  verifyBackupCodeLoginUseCase(sessionId: string, code: string, ipAddress: string, userAgent: string): Promise<{ sessionId: string }>;
  recoverWithBackupCodeUseCase(identifier: string, code: string, sessionId: string, ipAddress: string, userAgent: string): Promise<{ sessionId: string }>;
  
  // III. WALLET
  generateNonceUseCase(sessionId: string): Promise<string>;
  verifySignatureUseCase(sessionId: string, message: string, signature: string): Promise<SiweMessage>;
  connectWalletUseCase(sessionId: string, address: string, ipAddress: string, userAgent: string): Promise<{ sessionId: string } | { requiresTotp: true } | { requiresSms: true }>;

  // IIIb. PASSKEY (login)
  connectPasskeyUseCase(sessionId: string, identifier: string, ipAddress: string, userAgent: string): Promise<{ sessionId: string }>;
  
  // IV. Common
  logoutUseCase(identifier: string, sessionId: string): Promise<void>;
  logoutAllUseCase(identifier: string): Promise<void>;
  listSessionsUseCase(identifier: string, currentSessionId?: string): Promise<{ sessions: Array<{ id: number; hashSessionId: string; type: string; ipAddress?: string; userAgent?: string; expiresAt: string; isActive: boolean; isCurrent?: boolean }> }>;
  revokeSessionUseCase(identifier: string, sessionId: string): Promise<void>;
  verifySessionUseCase(sessionId: string, clientIp?: string, clientUserAgent?: string): Promise<{ ok: boolean; user: any }>;
}

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
    userAgent: string
  ) => {
    const encryptSecret = await c.env.ENCRYPTION_SECRET.get();
    if (!encryptSecret) {
      throw new Error('ENCRYPTION_SECRET is not defined in environment variables');
    }
    const expiry = await getAuthExpiryFromConfig(c.env);
    const sessionId = getSessionIdHash(ipAddress, userAgent, `${encryptSecret}|${user.identifier}`);

    const sessionData: Session = {
      hashSessionId: sessionId,
      type,
      expiresAt: new Date(Date.now() + expiry.sessionExpiry * 1000).toISOString(),
      ipAddress,
      userAgent,
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

    return { sessionId };
  };

  const getOrCreateUser = async (repository: any, identifier: string, additionalData: any = {}): Promise<{ user: any; isNewUser: boolean }> => {
    const encryptSecret= await c.env.ENCRYPTION_SECRET.get();
    if (!encryptSecret) {
      throw new Error("ENCRYPTION_SECRET is not defined in environment variables");
    }

    const existingUser = await repository.users.get();
    console.log('[Auth] getOrCreateUser: identifier=', identifier, 'existingUser=', !!existingUser, 'isNewUser=', !existingUser);

    if (existingUser) return { user: existingUser, isNewUser: false };

    const baseUser = {
      identifier: validationUtils.normalizeIdentifier(identifier),
      role: isAdmin(identifier) ? 'admin' : 'member',
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

    async connectOAuthUseCase(sessionId: string, identifier: string, ipAddress: string, userAgent: string): Promise<{ sessionId: string } | { requiresTotp: true } | { requiresSms: true }> {
      const repository = getRepository(identifier);
      const { user, isNewUser } = await getOrCreateUser(repository, identifier);

      const authenticatorApp = createAccountAuthenticatorApplication(c, bindingName);
      const smsApp = createAccountSmsApplication(c, bindingName);
      const totpStatus = await authenticatorApp.getAuthenticatorStatusUseCase(identifier);
      const smsStatus = await smsApp.getSmsStatusUseCase(identifier);

      // 1. Authenticator ưu tiên trước SMS nếu bật cả hai
      if (totpStatus.enabled) {
        const normalizedId = validationUtils.normalizeIdentifier(identifier);
        console.log('[Auth] OAuth: requiresTotp branch (no session yet) isNewUser=', isNewUser, 'identifier=', normalizedId);
        await c.env.NONCE_KV.put(`PendingTotp:${sessionId}`, normalizedId, { expirationTtl: 300 });
        console.log(`[connectOAuthUseCase] PendingTotp:${sessionId} is set value(${normalizedId}) with expirationTtl(300)`);
        return { requiresTotp: true };
      }

      // 2. Chỉ SMS bật -> chọn SMS
      if (smsStatus.enabled) {
        console.log('[Auth] OAuth: requiresSms branch (no session yet) isNewUser=', isNewUser, 'identifier=', identifier);
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
        await c.env.NONCE_KV.put(`PendingSmsLogin:${sessionId}`, JSON.stringify({ identifier, otp: smsOtp }), { expirationTtl: 300 });
        await createOTPService(c.env).sendSmsOTP(phone.startsWith('+') ? phone : `+${phone}`, smsOtp);
        return { requiresSms: true };
      }

      // 3. Cả hai đều không bật -> đăng nhập bình thường
      const result = await createUserSession(repository, user, 'oauth', ipAddress, userAgent);
      console.log('[Auth] OAuth login: isNewUser=', isNewUser, 'identifier=', identifier, 'flow=normal');
      // Notification gửi khi WS connect (đúng flow: login → token → client connect WS → gửi notification)
      if (isNewUser) {
        console.log('[Auth] Storing pending 2FA notification for new user (OAuth):', identifier);
        const wsApp = createWebsocketApplicationService(c, bindingName);
        await wsApp.storePendingFirstLoginNotificationUseCase(identifier);
      }
      return result;
    },

    // II. EMAIL/PHONE
    async getRequestOtpUseCase(identifier: string, sessionId: string, language?: 'vi' | 'en'): Promise<void> {
      const otpService = createOTPService(c.env);
      const otp = await otpService.generateOTP(sessionId);
      const nIdentifier = validationUtils.normalizeIdentifier(identifier);

      if (validationUtils.isValidEmail(nIdentifier)) {
        await otpService.sendEmailOTP(nIdentifier, otp, language);
      } else if (validationUtils.isValidPhone(nIdentifier)) {
        await otpService.sendSmsOTP(nIdentifier, otp);
      }
    },

    async verifyOtpUseCase(identifier: string, sessionId: string, otp: string, ipAddress: string, userAgent: string): Promise<{ sessionId: string } | { requiresTotp: true } | { requiresSms: true }> {
      const otpService = createOTPService(c.env);
      const isValid = await otpService.verifyOTP(otp, sessionId);
      if (!isValid) {
        throw new Error(ERROR_MESSAGES.AUTH.INVALID_OTP);
      }

      const repository = getRepository(identifier);
      const { user, isNewUser } = await getOrCreateUser(repository, identifier);

      const authenticatorApp = createAccountAuthenticatorApplication(c, bindingName);
      const smsApp = createAccountSmsApplication(c, bindingName);
      const totpStatus = await authenticatorApp.getAuthenticatorStatusUseCase(identifier);
      const smsStatus = await smsApp.getSmsStatusUseCase(identifier);

      // 1. Cả authenticator và SMS đều bật -> chọn authenticator
      if (totpStatus.enabled) {
        const normalizedId = validationUtils.normalizeIdentifier(identifier);
        console.log('[Auth] OTP: requiresTotp branch (no session yet) isNewUser=', isNewUser, 'identifier=', normalizedId, 'sessionId=', sessionId, 'NONCE_KV=', !!c.env.NONCE_KV);
        if (!c.env.NONCE_KV) {
          console.error('[Auth] OTP: NONCE_KV binding is missing');
          throw new Error('NONCE_KV not configured');
        }
        if (!sessionId || sessionId.length < 32) {
          console.error('[Auth] OTP: invalid sessionId for PendingTotp', { sessionId, len: sessionId?.length });
          throw new Error('Invalid session for 2FA');
        }
        try {
          await c.env.NONCE_KV.put(`PendingTotp:${sessionId}`, normalizedId, { expirationTtl: 300 });
          console.log(`PendingTotp:${sessionId} is set value(${normalizedId}) with expirationTtl(300)`);
        } catch (kvErr) {
          console.error('[Auth] OTP: NONCE_KV.put PendingTotp failed sessionId=', sessionId, 'normalizedId=', normalizedId, 'error=', kvErr);
          throw kvErr;
        }
        return { requiresTotp: true };
      }

      // 2. Chỉ SMS bật -> chọn SMS
      if (smsStatus.enabled) {
        console.log('[Auth] OTP: requiresSms branch (no session yet) isNewUser=', isNewUser, 'identifier=', identifier);
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
        await c.env.NONCE_KV.put(`PendingSmsLogin:${sessionId}`, JSON.stringify({ identifier, otp: smsOtp }), { expirationTtl: 300 });
        await otpService.sendSmsOTP(phone.startsWith('+') ? phone : `+${phone}`, smsOtp);
        return { requiresSms: true };
      }

      // 3. Cả hai đều không bật -> đăng nhập bình thường
      const result = await createUserSession(repository, user, 'otp', ipAddress, userAgent);
      console.log('[Auth] OTP login: isNewUser=', isNewUser, 'identifier=', identifier, 'flow=normal');
      if (isNewUser) {
        console.log('[Auth] Storing pending 2FA notification for new user (OTP):', identifier);
        const wsApp = createWebsocketApplicationService(c, bindingName);
        await wsApp.storePendingFirstLoginNotificationUseCase(identifier);
      }
      return result;
    },

    async verifyTotpLoginUseCase(sessionId: string, code: string, ipAddress: string, userAgent: string): Promise<{ sessionId: string }> {
      
      const identifier = await c.env.NONCE_KV.get(`PendingTotp:${sessionId}`);
      console.log(`[verifyTotpLoginUseCase] PendingTotp:${sessionId} is value(${identifier}) with expirationTtl(300)`);
      if (!identifier) {
        console.log('[Auth] verifyTotpLoginUseCase: PendingTotp missing for sessionId (có thể session hết hạn hoặc cookie không khớp)');
        throw new Error(ERROR_MESSAGES.AUTH.TOTP_SESSION_EXPIRED);
      }

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
        const serverStep = Math.floor(Date.now() / 1000 / 30);
        console.log('[Auth] verifyTotpLoginUseCase: TOTP code mismatch identifier=', identifier, 'serverStep=', serverStep);
        throw new Error(ERROR_MESSAGES.AUTH.INVALID_OTP);
      }

      await c.env.NONCE_KV.delete(`PendingTotp:${sessionId}`);

      const repository = getRepository(identifier);
      const user = await repository.users.get();
      if (!user) throw new Error(ERROR_MESSAGES.AUTH.USER_NOT_FOUND);
      console.log('[Auth] verifyTotpLoginUseCase: completing login (no isNewUser/notification here) identifier=', identifier);
      return await createUserSession(repository, user, 'otp', ipAddress, userAgent);
    },

    async verifySmsLoginUseCase(sessionId: string, code: string, ipAddress: string, userAgent: string): Promise<{ sessionId: string }> {
      const raw = await c.env.NONCE_KV.get(`PendingSmsLogin:${sessionId}`);
      if (!raw) {
        console.log('[Auth] verifySmsLoginUseCase: PendingSmsLogin missing for sessionId');
        throw new Error(ERROR_MESSAGES.AUTH.SMS_SESSION_EXPIRED);
      }

      const { identifier, otp } = JSON.parse(raw) as { identifier: string; otp: string };
      if (otp !== code) throw new Error(ERROR_MESSAGES.AUTH.INVALID_OTP);

      await c.env.NONCE_KV.delete(`PendingSmsLogin:${sessionId}`);

      const repository = getRepository(identifier);
      const user = await repository.users.get();
      if (!user) throw new Error(ERROR_MESSAGES.AUTH.USER_NOT_FOUND);
      console.log('[Auth] verifySmsLoginUseCase: completing login (no isNewUser/notification here) identifier=', identifier);
      return await createUserSession(repository, user, 'otp', ipAddress, userAgent);
    },

    async verifyBackupCodeLoginUseCase(sessionId: string, code: string, ipAddress: string, userAgent: string): Promise<{ sessionId: string }> {
      let identifier = await c.env.NONCE_KV.get(`PendingTotp:${sessionId}`);
      if (!identifier) {
        const raw = await c.env.NONCE_KV.get(`PendingSmsLogin:${sessionId}`);
        if (!raw) {
          console.log('[Auth] verifyBackupCodeLoginUseCase: PendingTotp and PendingSmsLogin both missing');
          throw new Error(ERROR_MESSAGES.AUTH.TWO_FA_SESSION_EXPIRED);
        }
        const parsed = JSON.parse(raw) as { identifier: string };
        identifier = parsed.identifier;
      }

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
      return await createUserSession(repository, user, 'otp', ipAddress, userAgent);
    },

    async recoverWithBackupCodeUseCase(identifier: string, code: string, sessionId: string, ipAddress: string, userAgent: string): Promise<{ sessionId: string }> {
      const nIdentifier = validationUtils.normalizeIdentifier(identifier);
      const repository = getRepository(nIdentifier);
      const user = await repository.users.get();
      if (!user) throw new Error(ERROR_MESSAGES.AUTH.USER_NOT_FOUND);

      const userDO = getIdFromName(c, nIdentifier, bindingName) as DurableObjectStub<UserDO>;
      const backupRepo = createBackupCodeRepository(userDO);
      const normalized = normalizeBackupCodeInput(code);
      const consumed = await backupRepo.consumeCode(normalized);
      if (!consumed) throw new Error(ERROR_MESSAGES.AUTH.INVALID_OTP);

      return await createUserSession(repository, user, 'otp', ipAddress, userAgent);
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

    async connectWalletUseCase(sessionId: string, address: string, ipAddress: string, userAgent: string): Promise<{ sessionId: string } | { requiresTotp: true } | { requiresSms: true }> {
      const repository = getRepository(address);
      const { user, isNewUser } = await getOrCreateUser(repository, address, { address });

      const authenticatorApp = createAccountAuthenticatorApplication(c, bindingName);
      const smsApp = createAccountSmsApplication(c, bindingName);
      const totpStatus = await authenticatorApp.getAuthenticatorStatusUseCase(address);
      const smsStatus = await smsApp.getSmsStatusUseCase(address);

      // 1. Authenticator ưu tiên trước SMS nếu bật cả hai
      if (totpStatus.enabled) {
        const normalizedAddr = validationUtils.normalizeIdentifier(address);
        console.log('[Auth] SIWE: requiresTotp branch (no session yet) isNewUser=', isNewUser, 'address=', normalizedAddr);
        await c.env.NONCE_KV.put(`PendingTotp:${sessionId}`, normalizedAddr, { expirationTtl: 300 });
        return { requiresTotp: true };
      }

      // 2. Chỉ SMS bật -> chọn SMS
      if (smsStatus.enabled) {
        console.log('[Auth] SIWE: requiresSms branch (no session yet) isNewUser=', isNewUser, 'address=', address);
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
        await c.env.NONCE_KV.put(`PendingSmsLogin:${sessionId}`, JSON.stringify({ identifier: address, otp: smsOtp }), { expirationTtl: 300 });
        await createOTPService(c.env).sendSmsOTP(phone.startsWith('+') ? phone : `+${phone}`, smsOtp);
        return { requiresSms: true };
      }

      // 3. Cả hai đều không bật -> đăng nhập bình thường
      const result = await createUserSession(repository, user, 'siwe', ipAddress, userAgent);
      console.log('[Auth] SIWE login: isNewUser=', isNewUser, 'address=', address, 'flow=normal');
      if (isNewUser) {
        console.log('[Auth] Storing pending 2FA notification for new user (SIWE):', address);
        const wsApp = createWebsocketApplicationService(c, bindingName);
        await wsApp.storePendingFirstLoginNotificationUseCase(address);
      }
      return result;
    },

    async connectPasskeyUseCase(sessionId: string, identifier: string, ipAddress: string, userAgent: string): Promise<{ sessionId: string }> {
      const repository = getRepository(identifier);
      const user = await repository.users.get();
      if (!user) throw new Error(ERROR_MESSAGES.AUTH.USER_NOT_FOUND);
      return await createUserSession(repository, user, 'passkey', ipAddress, userAgent);
    },

    // IV. Common
    async logoutUseCase(identifier: string, sessionId: string): Promise<void> {
      console.log('[logoutUseCase] DEBUG: identifier=%s sessionId=%s', identifier, sessionId);
      const repository = getRepository(identifier);
      await repository.sessions.update(sessionId, { isActive: false });
      await c.env.NONCE_KV.delete(`${SESSION_LOOKUP_PREFIX}${sessionId}`);
      // Đóng WebSocket để trigger webSocketClose → unregisterUser trên BroadcastServiceDO
      try {
        const userDO = getIdFromName(c, identifier, bindingName) as DurableObjectStub<UserDO>;
        console.log('[logoutUseCase] DEBUG: calling UserDO closeConnectionsForSession sessionId=%s', sessionId);
        const resp = await userDO.fetch('https://user.internal/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'closeConnectionsForSession', sessionId }),
        });
        console.log('[logoutUseCase] DEBUG: closeConnectionsForSession response status=%s ok=%s', resp.status, resp.ok);
      } catch (e) {
        console.warn('[logoutUseCase] closeConnectionsForSession failed:', e);
      }
    },

    async logoutAllUseCase(identifier: string): Promise<void> {
      const repository = getRepository(identifier);
      await repository.sessions.deactivateAllUserSessions(identifier);
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

    async listSessionsUseCase(identifier: string, currentSessionId?: string): Promise<{ sessions: Array<{ id: number; hashSessionId: string; type: string; ipAddress?: string; userAgent?: string; expiresAt: string; isActive: boolean; isCurrent?: boolean }> }> {
      const repository = getRepository(identifier);
      const list = await repository.sessions.listAll(50);
      const sessions = list.map((s: any, index: number) => ({
        id: s.id ?? index,
        hashSessionId: s.hashSessionId,
        type: s.type ?? 'unknown',
        ipAddress: s.ipAddress,
        userAgent: s.userAgent,
        expiresAt: s.expiresAt,
        isActive: !!s.isActive,
        isCurrent: currentSessionId ? s.hashSessionId === currentSessionId : undefined,
      }));
      return { sessions };
    },

    async revokeSessionUseCase(identifier: string, sessionId: string): Promise<void> {
      const repository = getRepository(identifier);
      await repository.sessions.update(sessionId, { isActive: false });
      await c.env.NONCE_KV.delete(`${SESSION_LOOKUP_PREFIX}${sessionId}`);
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

      // So sánh IP/UA với session trong DO - nếu khác thì bắt đăng nhập lại
      const sessionIp = session.ipAddress;
      const sessionUa = session.userAgent;
      if (sessionIp != null && sessionIp !== '' && clientIp != null && clientIp !== '') {
        const norm = (s: string) => s.split(',')[0]?.trim() ?? '';
        if (norm(sessionIp) !== norm(clientIp)) {
          throw new Error(ERROR_MESSAGES.AUTH.SESSION_NOT_FOUND);
        }
      }
      if (sessionUa != null && sessionUa !== '' && clientUserAgent != null && clientUserAgent !== '') {
        if (sessionUa !== clientUserAgent) {
          throw new Error(ERROR_MESSAGES.AUTH.SESSION_NOT_FOUND);
        }
      }

      return { ok: true, user };
    }
  };
}