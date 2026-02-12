import { Context } from 'hono';
import { getIdFromName } from '../../shared/utils';
import { UserDO } from '../ws/infrastructure/UserDO';
import { createDidRepository } from './infrastructure';
import { DidStatus } from './domain';
import { createApplicationService } from '../auth/application';
import { SIWEAuthSchema } from '../auth/domain';

const ERROR_MESSAGES = {
  USER_NOT_FOUND: 'User not found',
  DID_ALREADY_LINKED: 'DID is already linked to this account',
  INVALID_ADDRESS: 'Invalid address',
} as const;

const DEFAULT_CHAIN_ID = 1; // Ethereum mainnet

function buildDidFromAddress(address: string, chainId: number = DEFAULT_CHAIN_ID): string {
  const normalized = address.toLowerCase().replace(/^0x/, '');
  return `did:ethr:${chainId}:0x${normalized}`;
}

async function hashAddress(address: string): Promise<string> {
  const normalized = address.toLowerCase().replace(/^0x/, '');
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalized));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

const DID_NONCE_PREFIX = 'did:';
const DID_UNLINK_NONCE_PREFIX = 'did:unlink:';

export interface IAccountDidApplication {
  getDidStatusUseCase(identifier: string): Promise<DidStatus>;
  getDidNonceUseCase(sessionId: string): Promise<string>;
  getDidUnlinkNonceUseCase(sessionId: string): Promise<string>;
  linkDidUseCase(identifier: string, sessionId: string, message: string, signature: string): Promise<{ did: string }>;
  unlinkDidUseCase(identifier: string, sessionId: string, message: string, signature: string): Promise<void>;
}

export function createAccountDidApplication(
  c: Context,
  bindingName: string
): IAccountDidApplication {
  const getRepository = (identifier: string) => {
    const userDO = getIdFromName(c, identifier, bindingName) as DurableObjectStub<UserDO>;
    if (!userDO) throw new Error(ERROR_MESSAGES.USER_NOT_FOUND);
    return createDidRepository(userDO);
  };

  const authService = () => createApplicationService(c, bindingName);

  return {
    async getDidStatusUseCase(identifier: string): Promise<DidStatus> {
      const repo = getRepository(identifier);
      return repo.getStatus();
    },

    async getDidNonceUseCase(sessionId: string): Promise<string> {
      return authService().generateNonceUseCase(`${DID_NONCE_PREFIX}${sessionId}`);
    },

    async getDidUnlinkNonceUseCase(sessionId: string): Promise<string> {
      return authService().generateNonceUseCase(`${DID_UNLINK_NONCE_PREFIX}${sessionId}`);
    },

    async linkDidUseCase(identifier: string, sessionId: string, message: string, signature: string): Promise<{ did: string }> {
      const { message: parsedMsg, signature: parsedSig } = SIWEAuthSchema.parse({ message, signature });

      const nonceSessionId = `${DID_NONCE_PREFIX}${sessionId}`;
      const siweMessage = await authService().verifySignatureUseCase(nonceSessionId, parsedMsg, parsedSig);

      const address = siweMessage.address?.toLowerCase();
      if (!address) throw new Error(ERROR_MESSAGES.INVALID_ADDRESS);

      const chainId = siweMessage.chainId ?? DEFAULT_CHAIN_ID;
      const did = buildDidFromAddress(address, chainId);
      const addressHash = await hashAddress(address);

      const repo = getRepository(identifier);
      const existing = await repo.getStatus();
      if (existing.enabled) {
        throw new Error(ERROR_MESSAGES.DID_ALREADY_LINKED);
      }

      await repo.save({
        did,
        method: 'ethr',
        chainId,
        addressHash,
      });

      return { did };
    },

    async unlinkDidUseCase(identifier: string, sessionId: string, message: string, signature: string): Promise<void> {
      const { message: parsedMsg, signature: parsedSig } = SIWEAuthSchema.parse({ message, signature });

      const nonceSessionId = `${DID_UNLINK_NONCE_PREFIX}${sessionId}`;
      const siweMessage = await authService().verifySignatureUseCase(nonceSessionId, parsedMsg, parsedSig);

      const address = siweMessage.address?.toLowerCase();
      if (!address) throw new Error(ERROR_MESSAGES.INVALID_ADDRESS);

      const addressHash = await hashAddress(address);
      const repo = getRepository(identifier);
      const existing = await repo.getByAddressHash(addressHash);
      if (!existing) {
        throw new Error('DID not linked to this wallet');
      }

      await repo.delete();
    },
  };
}
