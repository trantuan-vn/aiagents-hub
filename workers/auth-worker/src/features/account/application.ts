import { Context } from 'hono';
import { getIdFromName } from '../../shared/utils';
import { UserDO } from '../ws/infrastructure/UserDO';
import { createAuthenticatorRepository } from './infrastructure';
import {
  AuthenticatorStatus,
  AuthenticatorSetupResult,
  VerifyAuthenticatorInput,
  DisableAuthenticatorInput,
} from './domain';
import { generateTotpSecret, verifyTotpCode, buildTotpUri } from './totp';

const ERROR_MESSAGES = {
  USER_NOT_FOUND: 'User not found',
  AUTHENTICATOR_ALREADY_ENABLED: 'Authenticator is already enabled',
  AUTHENTICATOR_NOT_ENABLED: 'Authenticator is not enabled',
  INVALID_CODE: 'Invalid verification code',
} as const;

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
