import { AUTH_CONSTANTS } from '../features/auth/constant';
import { timingSafeEqualString } from './timing-safe';

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** One KV key per (sessionId, nonce) — consume by delete after read. */
export async function nonceStorageKey(sessionId: string, nonce: string): Promise<string> {
  const digest = await sha256Hex(`${sessionId}|${nonce}`);
  return `Nonce:${digest}`;
}

/** @deprecated Legacy key `Nonce:{sessionId}` — used only for consume fallback. */
export function legacyNonceSessionKey(sessionId: string): string {
  return `Nonce:${sessionId}`;
}

export async function storeSessionNonce(
  kv: KVNamespace,
  sessionId: string,
  nonce: string,
  expirationTtlSec?: number,
): Promise<void> {
  const ttl = expirationTtlSec ?? AUTH_CONSTANTS.NONCE_EXPIRY;
  const key = await nonceStorageKey(sessionId, nonce);
  await kv.put(key, '1', { expirationTtl: ttl });
  // Legacy row for in-flight clients during rollout (removed on successful consume)
  await kv.put(legacyNonceSessionKey(sessionId), JSON.stringify({ nonce }), {
    expirationTtl: ttl,
  });
}

/**
 * Consume nonce once. Prefer per-nonce key delete; fall back to legacy session key + timing-safe compare.
 */
export async function consumeSessionNonce(
  kv: KVNamespace,
  sessionId: string,
  nonce: string,
): Promise<boolean> {
  const key = await nonceStorageKey(sessionId, nonce);
  const dedicated = await kv.get(key);
  if (dedicated) {
    await kv.delete(key);
    await kv.delete(legacyNonceSessionKey(sessionId));
    return true;
  }

  const legacyKey = legacyNonceSessionKey(sessionId);
  const legacyRaw = await kv.get(legacyKey);
  if (!legacyRaw) return false;

  let storedNonce: string | undefined;
  try {
    storedNonce = (JSON.parse(legacyRaw) as { nonce?: string }).nonce;
  } catch {
    return false;
  }

  if (!storedNonce || !timingSafeEqualString(storedNonce, nonce)) {
    return false;
  }

  await kv.delete(legacyKey);
  return true;
}
