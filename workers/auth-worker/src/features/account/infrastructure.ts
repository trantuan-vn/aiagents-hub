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
  BackupCodeStatus,
  IBackupCodeRepository,
  EkycStatus,
  IEkycRepository,
  DidStatus,
  IDidRepository,
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

const BACKUP_CODES_TABLE = 'backup_codes';
const BACKUP_CODE_COUNT = 10;

async function hashBackupCode(normalized: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalized));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function createBackupCodeRepository(
  userDO: DurableObjectStub<UserDO>
): IBackupCodeRepository {
  return {
    async getStatus(): Promise<BackupCodeStatus> {
      const rows = await executeUtils.executeDynamicAction(userDO, 'select', {
        limit: 1000,
      }, BACKUP_CODES_TABLE);
      const list = Array.isArray(rows) ? rows : [];
      const remainingCount = list.filter((r: { usedAt?: string | null }) => !r.usedAt).length;
      return {
        enabled: remainingCount > 0,
        remainingCount,
      };
    },
    async countUnused(): Promise<number> {
      const status = await this.getStatus();
      return status.remainingCount;
    },
    async addCodes(hashes: string[]): Promise<void> {
      if (hashes.length === 0) return;
      const rows = hashes.map((codeHash) => ({ codeHash, usedAt: null }));
      await executeUtils.executeDynamicAction(userDO, 'batch-insert', rows, BACKUP_CODES_TABLE);
    },
    async consumeCode(normalizedCode: string): Promise<boolean> {
      const codeHash = await hashBackupCode(normalizedCode);
      const rows = await executeUtils.executeDynamicAction(userDO, 'select', {
        where: { field: 'codeHash', operator: '=', value: codeHash },
        limit: 1,
      }, BACKUP_CODES_TABLE);
      const row = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
      if (!row || row.usedAt) return false;
      const usedAt = new Date().toISOString();
      await executeUtils.executeDynamicAction(userDO, 'update', {
        id: row.id,
        usedAt,
      }, BACKUP_CODES_TABLE);
      return true;
    },
    async deleteAll(): Promise<void> {
      const rows = await executeUtils.executeDynamicAction(userDO, 'select', {
        limit: 1000,
      }, BACKUP_CODES_TABLE);
      const list = Array.isArray(rows) ? rows : [];
      for (const row of list) {
        await executeUtils.executeDynamicAction(userDO, 'delete', { id: row.id }, BACKUP_CODES_TABLE);
      }
    },
  };
}

const USER_EKYC_TABLE = 'user_ekyc';

async function getEkycRow(userDO: DurableObjectStub<UserDO>): Promise<any> {
  const rows = await executeUtils.executeDynamicAction(userDO, 'select', { limit: 1 }, USER_EKYC_TABLE);
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

export function createEkycRepository(
  userDO: DurableObjectStub<UserDO>
): IEkycRepository {
  return {
    async getStatus(): Promise<EkycStatus> {
      const row = await getEkycRow(userDO);
      if (!row) {
        return { status: 'not_started' };
      }
      return {
        status: row.status ?? 'not_started',
        documentVerifiedAt: row.documentVerifiedAt ?? undefined,
        faceVerifiedAt: row.faceVerifiedAt ?? undefined,
        updatedAt: row.updatedAt ?? undefined,
      };
    },
    async setDocumentSubmitted(): Promise<void> {
      const row = await getEkycRow(userDO);
      const updatedAt = new Date().toISOString();
      if (row) {
        await executeUtils.executeDynamicAction(userDO, 'update', {
          id: row.id,
          status: 'document_submitted',
          updatedAt,
        }, USER_EKYC_TABLE);
      } else {
        await executeUtils.executeDynamicAction(userDO, 'insert', {
          status: 'document_submitted',
          updatedAt,
        }, USER_EKYC_TABLE);
      }
    },
    async setDocumentVerified(): Promise<void> {
      const row = await getEkycRow(userDO);
      const documentVerifiedAt = new Date().toISOString();
      const updatedAt = documentVerifiedAt;
      if (row) {
        await executeUtils.executeDynamicAction(userDO, 'update', {
          id: row.id,
          status: 'document_verified',
          documentVerifiedAt,
          updatedAt,
        }, USER_EKYC_TABLE);
      } else {
        await executeUtils.executeDynamicAction(userDO, 'insert', {
          status: 'document_verified',
          documentVerifiedAt,
          updatedAt,
        }, USER_EKYC_TABLE);
      }
    },
    async setFaceSubmitted(): Promise<void> {
      const row = await getEkycRow(userDO);
      const updatedAt = new Date().toISOString();
      if (row) {
        await executeUtils.executeDynamicAction(userDO, 'update', {
          id: row.id,
          status: 'face_submitted',
          updatedAt,
        }, USER_EKYC_TABLE);
      } else {
        await executeUtils.executeDynamicAction(userDO, 'insert', {
          status: 'face_submitted',
          updatedAt,
        }, USER_EKYC_TABLE);
      }
    },
    async setFaceVerified(): Promise<void> {
      const row = await getEkycRow(userDO);
      const faceVerifiedAt = new Date().toISOString();
      const updatedAt = faceVerifiedAt;
      if (row) {
        await executeUtils.executeDynamicAction(userDO, 'update', {
          id: row.id,
          status: 'face_verified',
          faceVerifiedAt,
          updatedAt,
        }, USER_EKYC_TABLE);
      } else {
        await executeUtils.executeDynamicAction(userDO, 'insert', {
          status: 'face_verified',
          faceVerifiedAt,
          updatedAt,
        }, USER_EKYC_TABLE);
      }
    },
    async setVerified(): Promise<void> {
      const row = await getEkycRow(userDO);
      const updatedAt = new Date().toISOString();
      if (row) {
        await executeUtils.executeDynamicAction(userDO, 'update', {
          id: row.id,
          status: 'verified',
          updatedAt,
        }, USER_EKYC_TABLE);
      } else {
        await executeUtils.executeDynamicAction(userDO, 'insert', {
          status: 'verified',
          updatedAt,
        }, USER_EKYC_TABLE);
      }
    },
    async reset(): Promise<void> {
      const row = await getEkycRow(userDO);
      if (row) {
        await executeUtils.executeDynamicAction(userDO, 'update', {
          id: row.id,
          status: 'not_started',
          documentVerifiedAt: null,
          faceVerifiedAt: null,
          updatedAt: new Date().toISOString(),
        }, USER_EKYC_TABLE);
      }
    },
  };
}

const USER_DID_TABLE = 'user_did';

async function getDidRow(userDO: DurableObjectStub<UserDO>): Promise<any> {
  const rows = await executeUtils.executeDynamicAction(userDO, 'select', { limit: 1 }, USER_DID_TABLE);
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

export function createDidRepository(
  userDO: DurableObjectStub<UserDO>
): IDidRepository {
  return {
    async getStatus(): Promise<DidStatus> {
      const row = await getDidRow(userDO);
      if (!row || !row.did) return { enabled: false };
      return {
        enabled: true,
        did: row.did,
        method: row.method ?? 'ethr',
        linkedAt: row.linkedAt,
      };
    },
    async getByAddressHash(addressHash: string): Promise<{ did: string; method: string; linkedAt: string } | null> {
      const rows = await executeUtils.executeDynamicAction(userDO, 'select', {
        where: { field: 'addressHash', operator: '=', value: addressHash },
        limit: 1,
      }, USER_DID_TABLE);
      const row = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
      if (!row) return null;
      return { did: row.did, method: row.method ?? 'ethr', linkedAt: row.linkedAt };
    },
    async save(data: { did: string; method: string; chainId?: number; addressHash: string }): Promise<void> {
      const linkedAt = new Date().toISOString();
      const rows = await executeUtils.executeDynamicAction(userDO, 'select', { limit: 1 }, USER_DID_TABLE);
      const existing = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
      if (existing) {
        await executeUtils.executeDynamicAction(userDO, 'update', {
          id: existing.id,
          did: data.did,
          method: data.method,
          chainId: data.chainId ?? null,
          addressHash: data.addressHash,
          linkedAt,
        }, USER_DID_TABLE);
      } else {
        await executeUtils.executeDynamicAction(userDO, 'insert', {
          did: data.did,
          method: data.method,
          chainId: data.chainId ?? null,
          addressHash: data.addressHash,
          linkedAt,
        }, USER_DID_TABLE);
      }
    },
    async delete(): Promise<void> {
      const row = await getDidRow(userDO);
      if (row) {
        await executeUtils.executeDynamicAction(userDO, 'delete', { id: row.id }, USER_DID_TABLE);
      }
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
