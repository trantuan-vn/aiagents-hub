import { UserDO } from '../ws/infrastructure/UserDO';
import {
  SessionListItem,
  AuthenticatorStatus,
  IAuthenticatorRepository,
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
        where: [
          { field: 'hashSessionId', operator: '=', value: sessionId },
          { field: 'isActive', operator: '=', value: 1 },
        ],
      }, 'sessions');
      const row = Array.isArray(session) ? session[0] : null;
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
