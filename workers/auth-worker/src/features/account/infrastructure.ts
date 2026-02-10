import { UserDO } from '../ws/infrastructure/UserDO';
import {
  SessionListItem,
  AuthenticatorStatus,
  IAuthenticatorRepository,
  SmsStatus,
  ISmsRepository,
  PasskeyStatus,
  PasskeyCredentialListItem,
  IPasskeyRepository,
} from './domain';
import { executeUtils } from '../../shared/utils';

const ERROR_MESSAGES = {
  SESSION_NOT_FOUND: 'Session not found',
  USER_NOT_FOUND: 'User not found',
} as const;

export interface IAccountSessionRepository {
  listSessions(limit?: number): Promise<SessionListItem[]>;
  revokeSession(sessionId: string): Promise<void>;
}

async function getMfaRow(userDO: DurableObjectStub<UserDO>): Promise<any> {
  const rows = await executeUtils.executeDynamicAction(userDO, 'select', { limit: 1 }, 'user_mfa');
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

export function createAuthenticatorRepository(
  userDO: DurableObjectStub<UserDO>
): IAuthenticatorRepository {
  return {
    async getStatus(): Promise<AuthenticatorStatus> {
      const row = await getMfaRow(userDO);
      if (!row || !row.totpSecret) return { enabled: false };
      return {
        enabled: true,
        enabledAt: row.enabledAt ?? undefined,
      };
    },
    async getSecret(): Promise<string | null> {
      const row = await getMfaRow(userDO);
      return row?.totpSecret ?? null;
    },
    async getPendingSecret(): Promise<string | null> {
      const row = await getMfaRow(userDO);
      return row?.pendingSecret ?? null;
    },
    async setPendingSecret(secret: string): Promise<void> {
      const row = await getMfaRow(userDO);
      const pendingAt = new Date().toISOString();
      if (row) {
        await executeUtils.executeDynamicAction(userDO, 'update', {
          id: row.id,
          pendingSecret: secret,
          pendingAt,
        }, 'user_mfa');
      } else {
        await executeUtils.executeDynamicAction(userDO, 'insert', {
          pendingSecret: secret,
          pendingAt,
        }, 'user_mfa');
      }
    },
    async setSecret(secret: string): Promise<void> {
      const row = await getMfaRow(userDO);
      const enabledAt = new Date().toISOString();
      if (row) {
        await executeUtils.executeDynamicAction(userDO, 'update', {
          id: row.id,
          totpSecret: secret,
          enabledAt,
          pendingSecret: null,
          pendingAt: null,
        }, 'user_mfa');
      } else {
        await executeUtils.executeDynamicAction(userDO, 'insert', {
          totpSecret: secret,
          enabledAt,
        }, 'user_mfa');
      }
    },
    async clearSecret(): Promise<void> {
      const row = await getMfaRow(userDO);
      if (!row) return;
      await executeUtils.executeDynamicAction(userDO, 'update', {
        id: row.id,
        totpSecret: null,
        enabledAt: null,
        pendingSecret: null,
        pendingAt: null,
      }, 'user_mfa');
    },
    async confirmPendingAsEnabled(): Promise<void> {
      const row = await getMfaRow(userDO);
      if (!row?.pendingSecret) throw new Error(ERROR_MESSAGES.USER_NOT_FOUND);
      const enabledAt = new Date().toISOString();
      await executeUtils.executeDynamicAction(userDO, 'update', {
        id: row.id,
        totpSecret: row.pendingSecret,
        enabledAt,
        pendingSecret: null,
        pendingAt: null,
      }, 'user_mfa');
    },
  };
}

export function createSmsRepository(
  userDO: DurableObjectStub<UserDO>
): ISmsRepository {
  return {
    async getSmsStatus(): Promise<SmsStatus> {
      const row = await getMfaRow(userDO);
      if (!row || !row.phoneHash) return { enabled: false };
      return {
        enabled: true,
        enabledAt: row.smsEnabledAt ?? undefined,
      };
    },
    async getPhoneHash(): Promise<string | null> {
      const row = await getMfaRow(userDO);
      return row?.phoneHash ?? null;
    },
    async getPendingPhoneHash(): Promise<string | null> {
      const row = await getMfaRow(userDO);
      return row?.pendingPhoneHash ?? null;
    },
    async setPendingPhoneHash(phoneHash: string): Promise<void> {
      const row = await getMfaRow(userDO);
      const pendingPhoneAt = new Date().toISOString();
      if (row) {
        await executeUtils.executeDynamicAction(userDO, 'update', {
          id: row.id,
          pendingPhoneHash: phoneHash,
          pendingPhoneAt,
        }, 'user_mfa');
      } else {
        await executeUtils.executeDynamicAction(userDO, 'insert', {
          pendingPhoneHash: phoneHash,
          pendingPhoneAt,
        }, 'user_mfa');
      }
    },
    async confirmPendingSmsAsEnabled(): Promise<void> {
      const row = await getMfaRow(userDO);
      if (!row?.pendingPhoneHash) throw new Error(ERROR_MESSAGES.USER_NOT_FOUND);
      const smsEnabledAt = new Date().toISOString();
      await executeUtils.executeDynamicAction(userDO, 'update', {
        id: row.id,
        phoneHash: row.pendingPhoneHash,
        smsEnabledAt,
        pendingPhoneHash: null,
        pendingPhoneAt: null,
      }, 'user_mfa');
    },
    async clearSms(): Promise<void> {
      const row = await getMfaRow(userDO);
      if (!row) return;
      await executeUtils.executeDynamicAction(userDO, 'update', {
        id: row.id,
        phoneHash: null,
        smsEnabledAt: null,
        pendingPhoneHash: null,
        pendingPhoneAt: null,
      }, 'user_mfa');
    },
  };
}

function mapRowToSessionListItem(row: any): SessionListItem {
  return {
    id: row.id,
    hashSessionId: row.hashSessionId,
    type: row.type ?? 'otp',
    ipAddress: row.ipAddress,
    userAgent: row.userAgent,
    expiresAt: row.expiresAt,
    isActive: Boolean(row.isActive),
  };
}

export function createPasskeyRepository(
  userDO: DurableObjectStub<UserDO>
): IPasskeyRepository {
  const TABLE = 'passkey_credentials';
  return {
    async getStatus(): Promise<PasskeyStatus> {
      const rows = await executeUtils.executeDynamicAction(userDO, 'select', {
        orderBy: { field: 'id', direction: 'DESC' },
        limit: 100,
      }, TABLE);
      const list = Array.isArray(rows) ? rows : [];
      return {
        enabled: list.length > 0,
        credentialCount: list.length,
      };
    },
    async listCredentials(): Promise<PasskeyCredentialListItem[]> {
      const rows = await executeUtils.executeDynamicAction(userDO, 'select', {
        orderBy: { field: 'id', direction: 'DESC' },
        limit: 20,
      }, TABLE);
      const list = Array.isArray(rows) ? rows : [];
      return list.map((row: any) => ({
        id: row.id,
        credentialId: row.credentialId,
        deviceType: row.deviceType,
        createdAt: row.createdAt,
      }));
    },
    async getCredentialByCredentialId(credentialId: string): Promise<{ id: number; publicKey: string; counter: number } | null> {
      const rows = await executeUtils.executeDynamicAction(userDO, 'select', {
        where: { field: 'credentialId', operator: '=', value: credentialId },
        limit: 1,
      }, TABLE);
      const row = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
      if (!row) return null;
      return {
        id: row.id,
        publicKey: row.publicKey,
        counter: row.counter,
      };
    },
    async saveCredential(data: { credentialId: string; publicKey: string; counter: number; deviceType?: string; transports?: string }): Promise<void> {
      await executeUtils.executeDynamicAction(userDO, 'upsert', data, TABLE);
    },
    async deleteCredential(credentialId: string): Promise<void> {
      await executeUtils.executeDynamicAction(userDO, 'delete', {
        where: { field: 'credentialId', operator: '=', value: credentialId },
      }, TABLE);
    },
  };
}

export function createAccountRepository(
  userDO: DurableObjectStub<UserDO>
): IAccountSessionRepository {
  return {
    async listSessions(limit = 50): Promise<SessionListItem[]> {
      const sessions = await executeUtils.executeDynamicAction(userDO, 'select', {
        orderBy: { field: 'id', direction: 'DESC' },
        limit,
      }, 'sessions');
      const rows = Array.isArray(sessions) ? sessions : [];
      return rows.map((row: any) => mapRowToSessionListItem(row));
    },

    async revokeSession(sessionId: string): Promise<void> {
      const session = await executeUtils.executeDynamicAction(userDO, 'select', {
        where: { field: 'hashSessionId', operator: '=', value: sessionId },
        limit: 1,
      }, 'sessions');
      const row = Array.isArray(session) && session.length > 0 ? session[0] : null;
      if (!row) {
        throw new Error(ERROR_MESSAGES.SESSION_NOT_FOUND);
      }
      await executeUtils.executeDynamicAction(userDO, 'update', {
        id: row.id,
        isActive: false,
      }, 'sessions');
    },
  };
}
