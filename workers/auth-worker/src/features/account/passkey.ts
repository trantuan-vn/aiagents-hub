/**
 * Passkey (WebAuthn) application service – modern, phishing-resistant auth.
 * Uses @simplewebauthn/server; challenge stored in KV for verification.
 */
import type { Context } from 'hono';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type VerifyRegistrationResponseOpts,
} from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import { getIdFromName } from '../../shared/utils';
import { createPasskeyRepository } from './infrastructure';
import type { PasskeyStatus, PasskeyCredentialListItem, IPasskeyRepository } from './domain';
import type { UserDO } from '../ws/infrastructure/UserDO';

type RegistrationResponseJSON = VerifyRegistrationResponseOpts['response'];

const CHALLENGE_KV_PREFIX = 'PasskeyChallenge:';
const CHALLENGE_AUTH_PREFIX = 'PasskeyAuthChallenge:';
const CREDENTIAL_LOOKUP_PREFIX = 'PasskeyCredential:';
const CHALLENGE_TTL = 300; // 5 minutes

function getRpId(origin: string): string {
  try {
    const u = new URL(origin);
    return u.hostname;
  } catch {
    return 'aiagents-hub.vn';
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
          // Omit authenticatorAttachment to allow both platform (fingerprint/Face ID)
          // and cross-platform (USB security key) – shows "Use another device" option
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

      // Store credentialId -> identifier for passkey login lookup (discoverable credentials)
      await c.env.NONCE_KV.put(`${CREDENTIAL_LOOKUP_PREFIX}${credentialIdB64}`, identifier);
    },

    async listCredentialsUseCase(identifier: string): Promise<PasskeyCredentialListItem[]> {
      return getRepo(identifier).listCredentials();
    },

    async removeCredentialUseCase(identifier: string, credentialId: string): Promise<void> {
      await getRepo(identifier).deleteCredential(credentialId);
      await c.env.NONCE_KV.delete(`${CREDENTIAL_LOOKUP_PREFIX}${credentialId}`);
    },
  };
}

/** Passkey auth (login) – public, no auth required */
export interface IPasskeyAuthApplication {
  getPasskeyAuthStatusUseCase(identifier: string): Promise<PasskeyStatus>;
  getAuthenticationOptionsUseCase(identifier: string | undefined, origin: string): Promise<{ options: Record<string, unknown>; challengeKey: string }>;
  verifyAuthenticationUseCase(
    response: unknown,
    identifier: string | undefined,
    challengeKey: string,
    origin: string
  ): Promise<{ identifier: string }>;
}

export function createPasskeyAuthApplication(
  c: Context,
  bindingName: string,
  config: PasskeyApplicationConfig
): IPasskeyAuthApplication {
  const getRepo = (identifier: string): IPasskeyRepository => {
    const userDO = getIdFromName(c, identifier, bindingName) as DurableObjectStub<UserDO> | null;
    if (!userDO) throw new Error('User not found');
    return createPasskeyRepository(userDO);
  };

  return {
    async getPasskeyAuthStatusUseCase(identifier: string): Promise<PasskeyStatus> {
      try {
        const status = await getRepo(identifier).getStatus();
        const enabled = status.enabled && status.credentialCount > 0;
        return { enabled, credentialCount: enabled ? 1 : 0 };
      } catch {
        return { enabled: false, credentialCount: 0 };
      }
    },

    async getAuthenticationOptionsUseCase(
      identifier: string | undefined,
      origin: string
    ): Promise<{ options: Record<string, unknown>; challengeKey: string }> {
      const rpId = getRpId(origin);
      let allowCredentials: { id: string }[] = [];

      if (identifier) {
        try {
          const credentials = await getRepo(identifier).listCredentials();
          allowCredentials = credentials.map((cred) => ({ id: cred.credentialId }));
        } catch {
          // User not found or no passkeys
        }
      }

      const options = await generateAuthenticationOptions({
        rpID: rpId,
        userVerification: 'preferred',
        allowCredentials: allowCredentials.length > 0 ? allowCredentials : undefined,
      });

      const challengeKey = `${CHALLENGE_AUTH_PREFIX}${identifier ?? 'discoverable'}`;
      await c.env.NONCE_KV.put(challengeKey, options.challenge, { expirationTtl: CHALLENGE_TTL });

      return {
        options: options as unknown as Record<string, unknown>,
        challengeKey,
      };
    },

    async verifyAuthenticationUseCase(
      response: unknown,
      identifier: string | undefined,
      challengeKey: string,
      origin: string
    ): Promise<{ identifier: string }> {
      const res = response as { id?: string; response?: { userHandle?: ArrayBuffer } };
      const credentialId = res?.id;
      if (!credentialId) throw new Error('Invalid passkey response');

      let resolvedIdentifier = identifier;
      if (!resolvedIdentifier && res?.response?.userHandle) {
        resolvedIdentifier = new TextDecoder().decode(res.response.userHandle);
      }
      if (!resolvedIdentifier) {
        const lookup = await c.env.NONCE_KV.get(`${CREDENTIAL_LOOKUP_PREFIX}${credentialId}`);
        resolvedIdentifier = lookup ?? undefined;
      }
      if (!resolvedIdentifier) throw new Error('Could not identify user from passkey');

      const storedChallenge = await c.env.NONCE_KV.get(challengeKey);
      if (!storedChallenge) throw new Error('Challenge expired or invalid');
      await c.env.NONCE_KV.delete(challengeKey);

      const repo = getRepo(resolvedIdentifier);
      const credential = await repo.getCredentialByCredentialId(credentialId);
      if (!credential) throw new Error('Passkey not found');

      const rpId = getRpId(origin);
      const publicKey = isoBase64URL.toBuffer(credential.publicKey);

      const verification = await verifyAuthenticationResponse({
        response: response as Parameters<typeof verifyAuthenticationResponse>[0]['response'],
        expectedChallenge: storedChallenge,
        expectedOrigin: origin,
        expectedRPID: rpId,
        authenticator: {
          credentialID: credentialId,
          credentialPublicKey: publicKey,
          counter: credential.counter,
        },
      });

      if (!verification.verified || !verification.authenticationInfo) {
        throw new Error('Passkey verification failed');
      }

      await repo.saveCredential({
        credentialId,
        publicKey: credential.publicKey,
        counter: verification.authenticationInfo.newCounter,
      });

      return { identifier: resolvedIdentifier };
    },
  };
}
