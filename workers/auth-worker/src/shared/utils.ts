import { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import CryptoJS from 'crypto-js';
import { UserDO } from '../features/ws/infrastructure/UserDO';
import { createLogger } from './logger';
import { isAdminIdentifier } from './admin-config';
import {
  buildErrorLogFields,
  extractErrorMessage,
  isSafeClientMessage,
  resolveClientErrorMessage,
  resolveHttpStatus,
} from './http-errors';

export { getClientIpAndUserAgentForSession } from './trusted-proxy';

const log = createLogger('auth-worker', 'errors');

export const handleError = async (c: Context, e: unknown, defaultMessage: string) => {
  try {
    const message = extractErrorMessage(e);
    const safe = isSafeClientMessage(message);
    const status = resolveHttpStatus(message, safe);
    const clientMessage = resolveClientErrorMessage(defaultMessage, message, c.env);

    log.error('handler.request_error', {
      defaultMessage,
      ...buildErrorLogFields(e),
      clientStatus: status,
    });

    return {
      errorResponse: { error: clientMessage },
      status: status as ContentfulStatusCode,
    };
  } catch (error) {
    log.error('handler.internal_failure', error instanceof Error ? error : { error: String(error) });
    return { errorResponse: { error: defaultMessage }, status: 500 as ContentfulStatusCode };
  }
};

export const handleErrorWithoutIp = async (
  e: unknown,
  defaultMessage: string,
  env?: Pick<Env, 'DEBUG' | 'ENVIRONMENT'>,
) => {
  try {
    const message = extractErrorMessage(e);
    const safe = isSafeClientMessage(message);
    const status = resolveHttpStatus(message, safe);
    const clientMessage = resolveClientErrorMessage(defaultMessage, message, env);

    log.error('handler.error', {
      defaultMessage,
      ...buildErrorLogFields(e),
      clientStatus: status,
    });

    return {
      errorResponse: { error: clientMessage },
      status: status as ContentfulStatusCode,
    };
  } catch (error) {
    log.error('handler.internal_failure', error instanceof Error ? error : { error: String(error) });
    return { errorResponse: { error: defaultMessage }, status: 500 as ContentfulStatusCode };
  }
};

export const parseBody = async (c: Context, schema: any) => {
  const contentType = c.req.header('Content-Type') || '';
  if (contentType.includes('application/json')) {
    return schema.parse(await c.req.json());
  } else {
    const formData = await c.req.formData();
    const entries: { [key: string]: any } = {};
    formData.forEach((value, key) => {
      entries[key] = value;
    });
    return schema.parse(entries);
  }
};

export function getIdFromName(c: Context, identifier: string, bindingName: string): DurableObjectStub {
  const binding = c.env[bindingName];
  if (!binding) {
    throw new Error(`Durable Object binding '${bindingName}' not found. Make sure it's configured in wrangler.jsonc`);
  }
  const doID = binding.idFromName(identifier);
  return binding.get(doID); // as unknown as T;
}

export function getIdFromString(c: Context, id: string, bindingName: string): DurableObjectStub {
  const binding = c.env[bindingName];
  if (!binding) {
    throw new Error(`Durable Object binding '${bindingName}' not found. Make sure it's configured in wrangler.jsonc`);
  }
  const doID = binding.idFromString(id);
  return binding.get(doID); // as unknown as T;
}

/** @deprecated Use isAdminIdentifier(env, identifier) */
export function isAdmin(
  identifier: string,
  env: Pick<Env, 'ADMIN_IDENTIFIERS' | 'ENVIRONMENT'> & Partial<Pick<Env, 'PRIMARY_ADMIN_IDENTIFIER'>>,
) {
  return isAdminIdentifier(env, identifier);
}

export function getIPAndUserAgent(request: Request) {
  const ipAddress = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Real-IP') || request.headers.get('X-Forwarded-For');
  const userAgent = request.headers.get('User-Agent') || 'apiToken';
  return { ipAddress, userAgent };
}

function readCookieValue(cookieHeader: string | null, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return rest.join('=').trim();
  }
  return undefined;
}

/** Device UUID từ header (fetch) hoặc cookie (OAuth redirect). */
export function getClientDeviceIdFromRequest(request: Request): string | undefined {
  const fromHeader = request.headers.get('X-Client-Device-Id')?.trim();
  if (fromHeader) return fromHeader;
  return readCookieValue(request.headers.get('Cookie'), 'client_device_id');
}

/** Hash từ IP+UA+secret - dùng cho pre-login flow (OTP, OAuth state, wallet nonce) */
/** Deterministic sessionId for pre-login flows (OTP, OAuth state, wallet nonce). */
export const getSessionIdHash = (ipAddress: string, userAgent: string, secret: string) => {
  const data = `${ipAddress}|${userAgent}|${secret}`;
  return CryptoJS.SHA256(data).toString(CryptoJS.enc.Hex);
};

/** Cryptographically secure random sessionId (256-bit) for authenticated sessions. */
export function generateSecureSessionId(): string {
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
}

export const getClientIp = (c: any): string => {
  return c.req.raw.headers.get('CF-Connecting-IP') || c.req.raw.headers.get('X-Real-IP') || c.req.raw.headers.get('X-Forwarded-For');
};

export const executeUtils = {
  /**
   * Execute dynamic database operations
   */
  async executeDynamicAction(userDO: DurableObjectStub<UserDO>, operation: string, data: any, table?: string): Promise<any> {
    let endpoint = '';
    let requestData: any = {};

    // Xác định endpoint và dữ liệu dựa trên operation
    switch (operation) {
      case 'insert':
        endpoint = '/dynamic/insert';
        requestData = { table, data };
        break;
        
      case 'update':
        endpoint = '/dynamic/update';
        requestData = { table, id: data.id, data };
        break;
        
      case 'upsert':
        endpoint = '/dynamic/upsert';
        requestData = { table, data, conflictField: data.conflictField };
        break;
        
      case 'delete':
        endpoint = '/dynamic/delete';
        requestData = { table, id: data.id, where: data.where };
        break;
        
      case 'select':
        endpoint = '/dynamic/select';
        requestData = { 
          table, 
          where: data.where, 
          orderBy: data.orderBy, 
          limit: data.limit,
          offset: data.offset 
        };
        break;
        
      case 'batch-insert':
        endpoint = '/dynamic/batch-insert';
        requestData = { table, data };
        break;
        
      case 'multi-table':
        endpoint = '/dynamic/multi-table';
        requestData = { operations: data.operations };
        break;
        
      default:
        throw new Error(`Unsupported dynamic operation: ${operation}`);
    }

    const response = await userDO.fetch(`https://user.do${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestData)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to execute dynamic ${operation}: ${errorText}`);
    }
    
    const result = await response.json() as any;
    if (!result.success){
      throw new Error(result.error);
    }
    return result.data;

  },

  /**
   * Execute database transaction
   */
  async executeTransaction(userDO: DurableObjectStub<UserDO>, operations: Array<{sql: string, params: any[]}>): Promise<void>{
    const response = await userDO.fetch('http://user.internal/repository/transaction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operations })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to execute transaction: ${errorText}`);
    }
    
    const result = await response.json() as any;
    if (!result.success){
      throw new Error(result.error);
    }
  },

  async executeRepositorySelect(userDO: DurableObjectStub<UserDO>, sql: string, params: any[] = [], table?: string): Promise<any[]> {
    const response = await userDO.fetch('http://user.internal/repository/select', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql, params, table: table || '' })
    });

    if (!response.ok) {
      throw new Error(`Failed to execute query: ${response.statusText}`);
    }
    
    const result = await response.json() as any;
    if (!result.success){
      throw new Error(result.error);
    }
    return result.data;
  },

};
// Ví dụ sử dụng:
/*
// INSERT
await executeDynamicAction(userDO, 'insert', sessionData, 'sessions');

// UPDATE
await executeDynamicAction(userDO, 'update', { id: '123', isActive: true }, 'sessions');

// UPSERT
await executeDynamicAction(userDO, 'upsert', 
  { email: 'test@example.com', name: 'Test User' }, 
  'users'
);

// DELETE
await executeDynamicAction(userDO, 'delete', { id: '123' }, 'users');

// SELECT với điều kiện
await executeDynamicAction(userDO, 'select', {
  where: { field: 'status', operator: '==', value: 'active' },
  orderBy: { field: 'createdAt', direction: 'DESC' },
  limit: 10
}, 'users');

// BATCH INSERT
await executeDynamicAction(userDO, 'batch-insert', [
  { name: 'User1', email: 'user1@test.com' },
  { name: 'User2', email: 'user2@test.com' }
], 'users');

// MULTI-TABLE TRANSACTION
await executeDynamicAction(userDO, 'multi-table', {
  operations: [
    {
      table: 'users',
      operation: 'insert',
      data: { name: 'John', email: 'john@test.com' }
    },
    {
      table: 'orders', 
      operation: 'insert',
      data: { userId: '123', amount: 100 }
    }
  ]
});
*/