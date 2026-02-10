/**
 * Backup codes – single-use recovery codes for account access.
 * Codes are shown once at generation; only hashes are stored.
 */
import type { Context } from 'hono';
import { getIdFromName } from '../../shared/utils';
import { createBackupCodeRepository } from './infrastructure';
import type { BackupCodeStatus, IBackupCodeRepository } from './domain';
import type { UserDO } from '../ws/infrastructure/UserDO';

const BACKUP_CODE_COUNT = 10;
const SEGMENT_LENGTH = 8; // 8 hex chars per segment -> XXXXXXXX-XXXXXXXX

function generateSecureHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function formatCode(hex: string): string {
  const a = hex.slice(0, SEGMENT_LENGTH);
  const b = hex.slice(SEGMENT_LENGTH, SEGMENT_LENGTH * 2);
  return `${a}-${b}`.toUpperCase();
}

/** Normalize for hashing: strip spaces/dashes, uppercase (same as login verification). */
export function normalizeBackupCodeInput(code: string): string {
  return code.replace(/\s/g, '').replace(/-/g, '').toUpperCase();
}

async function hashBackupCode(normalized: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalized));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export interface IAccountBackupCodeApplication {
  getStatusUseCase(identifier: string): Promise<BackupCodeStatus>;
  generateUseCase(identifier: string, replaceExisting: boolean): Promise<{ codes: string[] }>;
}

export function createAccountBackupCodeApplication(
  c: Context,
  bindingName: string
): IAccountBackupCodeApplication {
  const getRepo = (identifier: string): IBackupCodeRepository => {
    const userDO = getIdFromName(c, identifier, bindingName) as DurableObjectStub<UserDO> | null;
    if (!userDO) throw new Error('User not found');
    return createBackupCodeRepository(userDO);
  };

  return {
    async getStatusUseCase(identifier: string): Promise<BackupCodeStatus> {
      return getRepo(identifier).getStatus();
    },

    async generateUseCase(
      identifier: string,
      replaceExisting: boolean
    ): Promise<{ codes: string[] }> {
      const repo = getRepo(identifier);
      if (replaceExisting) {
        await repo.deleteAll();
      } else {
        const status = await repo.getStatus();
        if (status.remainingCount > 0) {
          throw new Error('Backup codes already exist. Regenerate to replace them.');
        }
      }
      const codes: string[] = [];
      const hashes: string[] = [];
      const seenNormalized = new Set<string>();
      while (codes.length < BACKUP_CODE_COUNT) {
        const hex = generateSecureHex(SEGMENT_LENGTH * 2);
        const code = formatCode(hex);
        const normalized = normalizeBackupCodeInput(code);
        if (seenNormalized.has(normalized)) continue;
        seenNormalized.add(normalized);
        codes.push(code);
        hashes.push(await hashBackupCode(normalized));
      }
      await repo.addCodes(hashes);
      return { codes };
    },
  };
}
