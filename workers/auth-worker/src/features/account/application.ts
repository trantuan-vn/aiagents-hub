import CryptoJS from 'crypto-js';
import { Context } from 'hono';
import { getIdFromName } from '../../shared/utils';
import { UserDO } from '../ws/infrastructure/UserDO';
import { createAuthenticatorRepository, createSmsRepository } from './infrastructure';
import {
  AuthenticatorStatus,
  AuthenticatorSetupResult,
  VerifyAuthenticatorInput,
  DisableAuthenticatorInput,
  SmsStatus,
  RequestSmsInput,
  VerifySmsInput,
  DisableSmsInput,
} from './domain';
import { generateTotpSecret, verifyTotpCode, buildTotpUri } from './totp';
import { createOTPService } from '../auth/infrastructure';
import { validationUtils } from '../auth/utils';
import { otpUtils } from '../auth/utils';

const SMS_VERIFY_TTL = 600; // 10 minutes

const ERROR_MESSAGES = {
  USER_NOT_FOUND: 'User not found',
  AUTHENTICATOR_ALREADY_ENABLED: 'Authenticator is already enabled',
  AUTHENTICATOR_NOT_ENABLED: 'Authenticator is not enabled',
  INVALID_CODE: 'Invalid verification code',
  SMS_ALREADY_ENABLED: 'SMS is already enabled',
  SMS_NOT_ENABLED: 'SMS is not enabled',
  INVALID_PHONE: 'Invalid phone number',
} as const;

async function hashPhone(phone: string): Promise<string> {
  const normalized = phone.replace(/\D/g, '').trim();
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalized));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export interface IAccountAuthenticatorApplication {
  getAuthenticatorStatusUseCase(identifier: string): Promise<AuthenticatorStatus>;
  setupAuthenticatorUseCase(identifier: string, issuer: string, accountName?: string): Promise<AuthenticatorSetupResult>;
  verifyAuthenticatorUseCase(identifier: string, input: VerifyAuthenticatorInput): Promise<void>;
  disableAuthenticatorUseCase(identifier: string, input: DisableAuthenticatorInput): Promise<void>;
}

export function createAccountAuthenticatorApplication(
  c: Context,
  bindingName: string
): IAccountAuthenticatorApplication {
  const getRepository = (identifier: string) => {
    const userDO = getIdFromName(c, identifier, bindingName) as DurableObjectStub<UserDO>;
    if (!userDO) throw new Error(ERROR_MESSAGES.USER_NOT_FOUND);
    return createAuthenticatorRepository(userDO);
  };

  return {
    async getAuthenticatorStatusUseCase(identifier: string): Promise<AuthenticatorStatus> {
      const repo = getRepository(identifier);
      return repo.getStatus();
    },

    async setupAuthenticatorUseCase(
      identifier: string,
      issuer: string,
      accountName?: string
    ): Promise<AuthenticatorSetupResult> {
      const repo = getRepository(identifier);
      const status = await repo.getStatus();
      if (status.enabled) {
        throw new Error(ERROR_MESSAGES.AUTHENTICATOR_ALREADY_ENABLED);
      }
      const secret = generateTotpSecret();
      const label = accountName ?? identifier;
      const qrCodeUrl = buildTotpUri(secret, label, issuer);
      await repo.setPendingSecret(secret);
      return { secret, qrCodeUrl };
    },

    async verifyAuthenticatorUseCase(
      identifier: string,
      input: VerifyAuthenticatorInput
    ): Promise<void> {
      const repo = getRepository(identifier);
      const pendingSecret = await repo.getPendingSecret();
      if (!pendingSecret) {
        const secret = await repo.getSecret();
        if (secret) throw new Error(ERROR_MESSAGES.AUTHENTICATOR_ALREADY_ENABLED);
        throw new Error(ERROR_MESSAGES.AUTHENTICATOR_NOT_ENABLED);
      }
      const valid = await verifyTotpCode(pendingSecret, input.code);
      if (!valid) throw new Error(ERROR_MESSAGES.INVALID_CODE);
      await repo.confirmPendingAsEnabled();
    },

    async disableAuthenticatorUseCase(
      identifier: string,
      input: DisableAuthenticatorInput
    ): Promise<void> {
      const repo = getRepository(identifier);
      const secret = await repo.getSecret();
      if (!secret) throw new Error(ERROR_MESSAGES.AUTHENTICATOR_NOT_ENABLED);
      const valid = await verifyTotpCode(secret, input.code);
      if (!valid) throw new Error(ERROR_MESSAGES.INVALID_CODE);
      await repo.clearSecret();
    },
  };
}

export interface IAccountSmsApplication {
  getSmsStatusUseCase(identifier: string): Promise<SmsStatus>;
  requestSmsUseCase(identifier: string, input: RequestSmsInput): Promise<void>;
  verifySmsUseCase(identifier: string, input: VerifySmsInput): Promise<void>;
  disableSmsUseCase(identifier: string, input: DisableSmsInput): Promise<void>;
}

export function createAccountSmsApplication(
  c: Context,
  bindingName: string
): IAccountSmsApplication {
  const getSmsRepo = (identifier: string) => {
    const userDO = getIdFromName(c, identifier, bindingName) as DurableObjectStub<UserDO>;
    if (!userDO) throw new Error(ERROR_MESSAGES.USER_NOT_FOUND);
    return createSmsRepository(userDO);
  };

  const getAuthRepo = (identifier: string) => {
    const userDO = getIdFromName(c, identifier, bindingName) as DurableObjectStub<UserDO>;
    if (!userDO) throw new Error(ERROR_MESSAGES.USER_NOT_FOUND);
    return createAuthenticatorRepository(userDO);
  };

  return {
    async getSmsStatusUseCase(identifier: string): Promise<SmsStatus> {
      return getSmsRepo(identifier).getSmsStatus();
    },

    async requestSmsUseCase(identifier: string, input: RequestSmsInput): Promise<void> {
      const phone = validationUtils.normalizeIdentifier(input.phone);
      if (!validationUtils.isValidPhone(phone)) {
        throw new Error(ERROR_MESSAGES.INVALID_PHONE);
      }
      const smsRepo = getSmsRepo(identifier);
      const status = await smsRepo.getSmsStatus();
      if (status.enabled) throw new Error(ERROR_MESSAGES.SMS_ALREADY_ENABLED);

      const phoneHash = await hashPhone(phone);
      await smsRepo.setPendingPhoneHash(phoneHash);

      const otp = otpUtils.generateOTP(6);
      const kvKey = `Sms2FA:${identifier}`;
      await c.env.NONCE_KV.put(kvKey, JSON.stringify({ otp, phone }), { expirationTtl: SMS_VERIFY_TTL });

      const otpService = createOTPService(c.env);
      await otpService.sendSmsOTP(phone.startsWith('+') ? phone : `+${phone}`, otp);
    },

    async verifySmsUseCase(identifier: string, input: VerifySmsInput): Promise<void> {
      const smsRepo = getSmsRepo(identifier);
      const pending = await smsRepo.getPendingPhoneHash();
      if (!pending) {
        const current = await smsRepo.getPhoneHash();
        if (current) throw new Error(ERROR_MESSAGES.SMS_ALREADY_ENABLED);
        throw new Error(ERROR_MESSAGES.SMS_NOT_ENABLED);
      }

      const kvKey = `Sms2FA:${identifier}`;
      const raw = await c.env.NONCE_KV.get(kvKey);
      if (!raw) throw new Error(ERROR_MESSAGES.INVALID_CODE);
      const { otp, phone } = JSON.parse(raw) as { otp: string; phone?: string };
      if (otp !== input.code) throw new Error(ERROR_MESSAGES.INVALID_CODE);
      await c.env.NONCE_KV.delete(kvKey);

      let encryptedPhone: string | undefined;
      if (phone) {
        const encryptSecret = await c.env.ENCRYPTION_SECRET.get();
        if (encryptSecret) {
          encryptedPhone = CryptoJS.AES.encrypt(phone, encryptSecret).toString();
        }
      }
      await smsRepo.confirmPendingSmsAsEnabled(encryptedPhone);
    },

    async disableSmsUseCase(identifier: string, input: DisableSmsInput): Promise<void> {
      const smsRepo = getSmsRepo(identifier);
      const authRepo = getAuthRepo(identifier);
      const status = await smsRepo.getSmsStatus();
      if (!status.enabled) throw new Error(ERROR_MESSAGES.SMS_NOT_ENABLED);
      const totpSecret = await authRepo.getSecret();
      if (!totpSecret) throw new Error(ERROR_MESSAGES.AUTHENTICATOR_NOT_ENABLED);
      const valid = await verifyTotpCode(totpSecret, input.code);
      if (!valid) throw new Error(ERROR_MESSAGES.INVALID_CODE);
      await smsRepo.clearSms();
    },
  };
}
