import { executeUtils } from '../../../shared/utils.js';
import { encryptField, decryptField } from '../../../shared/field-encryption.js';
import type { UserDO } from '../../ws/infrastructure/UserDO.js';
import type { WorkflowCredentialType } from './domain.js';

/**
 * Credential vault. Secrets are AES-encrypted with ENCRYPTION_SECRET and stored
 * in the user's Durable Object only (never synced to D1). The decrypted secret
 * is read at execution time to authenticate outbound HTTP requests.
 */

export interface CredentialMeta {
  /** Header name for `type: 'header'`. */
  headerName?: string;
  /** Query param name for `type: 'query'`. */
  paramName?: string;
  /** Username for `type: 'basic'`. */
  username?: string;
}

export interface ResolvedCredential {
  type: WorkflowCredentialType;
  secret: string;
  meta: CredentialMeta;
}

export interface PublicCredential {
  id: number;
  credentialKey: string;
  name: string;
  type: WorkflowCredentialType;
  meta: CredentialMeta;
  created_at?: number;
  updated_at?: number;
}

function safeParseMeta(raw: unknown): CredentialMeta {
  if (raw && typeof raw === 'object') return raw as CredentialMeta;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as CredentialMeta;
    } catch {
      return {};
    }
  }
  return {};
}

/** Strip secrets and normalize a stored row for client responses. */
export function toPublicCredential(row: any): PublicCredential {
  return {
    id: row.id,
    credentialKey: row.credentialKey,
    name: row.name,
    type: row.type,
    meta: safeParseMeta(row.meta),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function createCredential(
  userDO: DurableObjectStub<UserDO>,
  env: Env,
  input: { name: string; type: WorkflowCredentialType; secret: string; meta?: CredentialMeta },
): Promise<PublicCredential> {
  const encryptionSecret = await env.ENCRYPTION_SECRET.get();
  if (!encryptionSecret) throw new Error('ENCRYPTION_SECRET is not configured');

  const secretEnc = input.secret ? await encryptField(input.secret, encryptionSecret) : '';
  const created = await executeUtils.executeDynamicAction(
    userDO,
    'insert',
    {
      credentialKey: crypto.randomUUID(),
      name: input.name,
      type: input.type,
      secretEnc,
      meta: JSON.stringify(input.meta ?? {}),
    },
    'workflow_credentials',
  );
  return toPublicCredential(created);
}

export async function listCredentials(
  userDO: DurableObjectStub<UserDO>,
): Promise<PublicCredential[]> {
  const rows = await executeUtils.executeDynamicAction(
    userDO,
    'select',
    { orderBy: { field: 'updated_at', direction: 'DESC' } },
    'workflow_credentials',
  );
  return Array.isArray(rows) ? rows.map(toPublicCredential) : [];
}

export async function deleteCredential(
  userDO: DurableObjectStub<UserDO>,
  id: number,
): Promise<void> {
  await executeUtils.executeDynamicAction(userDO, 'delete', { id }, 'workflow_credentials');
}

/** Load + decrypt a credential for use during execution. Returns null if missing. */
export async function resolveCredential(
  userDO: DurableObjectStub<UserDO>,
  env: Env,
  credentialKey: string,
): Promise<ResolvedCredential | null> {
  if (!credentialKey) return null;
  const rows = await executeUtils.executeDynamicAction(
    userDO,
    'select',
    { where: { field: 'credentialKey', operator: '=', value: credentialKey } },
    'workflow_credentials',
  );
  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row) return null;

  let secret = '';
  if (row.secretEnc) {
    const encryptionSecret = await env.ENCRYPTION_SECRET.get();
    if (!encryptionSecret) throw new Error('ENCRYPTION_SECRET is not configured');
    secret = await decryptField(row.secretEnc, encryptionSecret);
  }
  return { type: row.type, secret, meta: safeParseMeta(row.meta) };
}
