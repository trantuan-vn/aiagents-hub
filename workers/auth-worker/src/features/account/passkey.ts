/**
 * Passkey (WebAuthn) application service – modern, phishing-resistant auth.
 * Uses @simplewebauthn/server; challenge stored in KV for verification.
 */
import type { Context } from 'hono';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  type VerifyRegistrationResponseOpts,
} from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import { getIdFromName } from '../../shared/utils';
import { createPasskeyRepository } from './infrastructure';
import type { PasskeyStatus, PasskeyCredentialListItem, IPasskeyRepository } from './domain';
import type { UserDO } from '../ws/infrastructure/UserDO';

type RegistrationResponseJSON = VerifyRegistrationResponseOpts['response'];

const CHALLENGE_KV_PREFIX = 'PasskeyChallenge:';
const CHALLENGE_TTL = 300; // 5 minutes

function getRpId(origin: string): string {
  try {
    const u = new URL(origin);
    return u.hostname;
  } catch {
    return 'unitoken.trade';
  }
}

function userIdentifierToUint8Array(identifier: string): Uint8Array {
  return new TextEncoder().encode(identifier);
}

export interface PasskeyApplicationConfig {
  rpName: string;
  getOrigin: () => string;
}

export interface IAccountPasskeyApplication {
  getPasskeyStatusUseCase(identifier: string): Promise<PasskeyStatus>;
  getRegistrationOptionsUseCase(identifier: string, userName: string, origin: string): Promise<{ options: Record<string, unknown>; challengeKey: string }>;
  verifyRegistrationUseCase(identifier: string, body: { response: RegistrationResponseJSON; challengeKey: string }, origin: string): Promise<void>;
  listCredentialsUseCase(identifier: string): Promise<PasskeyCredentialListItem[]>;
  removeCredentialUseCase(identifier: string, credentialId: string): Promise<void>;
}

export function createAccountPasskeyApplication(
  c: Context,
  bindingName: string,
  config: PasskeyApplicationConfig
): IAccountPasskeyApplication {
  const getRepo = (identifier: string): IPasskeyRepository => {
    const userDO = getIdFromName(c, identifier, bindingName) as DurableObjectStub<UserDO> | null;
    if (!userDO) throw new Error('User not found');
    return createPasskeyRepository(userDO);
  };

  return {
    async getPasskeyStatusUseCase(identifier: string): Promise<PasskeyStatus> {
      return getRepo(identifier).getStatus();
    },

    async getRegistrationOptionsUseCase(
      identifier: string,
      userName: string,
      origin: string
    ): Promise<{ options: Record<string, unknown>; challengeKey: string }> {
      const repo = getRepo(identifier);
      const rpId = getRpId(origin);
      const credentials = await repo.listCredentials();
      const excludeCredentials = credentials.map((cred) => ({
        id: cred.credentialId,
      }));

      const options = await generateRegistrationOptions({
        rpName: config.rpName,
        rpID: rpId,
        userName,
        userID: userIdentifierToUint8Array(identifier),
        excludeCredentials,
        attestationType: 'none',
        authenticatorSelection: {
          residentKey: 'preferred',
          userVerification: 'preferred',
          authenticatorAttachment: 'platform',
        },
      });

      const challengeKey = `${CHALLENGE_KV_PREFIX}${identifier}`;
      await c.env.NONCE_KV.put(challengeKey, options.challenge, { expirationTtl: CHALLENGE_TTL });

      return {
        options: options as unknown as Record<string, unknown>,
        challengeKey,
      };
    },

    async verifyRegistrationUseCase(
      identifier: string,
      body: { response: RegistrationResponseJSON; challengeKey: string },
      origin: string
    ): Promise<void> {
      const storedChallenge = await c.env.NONCE_KV.get(body.challengeKey);
      if (!storedChallenge) throw new Error('Challenge expired or invalid');
      await c.env.NONCE_KV.delete(body.challengeKey);

      const rpId = getRpId(origin);
      const verification = await verifyRegistrationResponse({
        response: body.response,
        expectedChallenge: storedChallenge,
        expectedOrigin: origin,
        expectedRPID: rpId,
      });

      if (!verification.verified || !verification.registrationInfo) {
        throw new Error('Passkey verification failed');
      }

      const { credentialID, credentialPublicKey, counter } = verification.registrationInfo;
      const credentialIdB64 = credentialID;
      const publicKeyB64 = isoBase64URL.fromBuffer(credentialPublicKey);

      const repo = getRepo(identifier);
      await repo.saveCredential({
        credentialId: credentialIdB64,
        publicKey: publicKeyB64,
        counter,
        deviceType: verification.registrationInfo.credentialDeviceType === 'singleDevice' ? 'singleDevice' : 'multiDevice',
      });
    },

    async listCredentialsUseCase(identifier: string): Promise<PasskeyCredentialListItem[]> {
      return getRepo(identifier).listCredentials();
    },

    async removeCredentialUseCase(identifier: string, credentialId: string): Promise<void> {
      await getRepo(identifier).deleteCredential(credentialId);
    },
  };
}
