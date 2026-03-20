/** Generate a unique referral code (8 chars, alphanumeric uppercase) */
export function generateReferralCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude I,O,0,1 for readability
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

const KV_PREFIX_REFERRAL = 'ReferralCode:';
const KV_PREFIX_PENDING_REF = 'PendingRef:';
const PENDING_REF_TTL = 600; // 10 min

export async function storeReferralCode(kv: KVNamespace, code: string, identifier: string): Promise<void> {
  await kv.put(`${KV_PREFIX_REFERRAL}${code}`, identifier, { expirationTtl: 86400 * 365 }); // 1 year
}

export async function resolveReferrerByCode(kv: KVNamespace, code: string): Promise<string | null> {
  return await kv.get(`${KV_PREFIX_REFERRAL}${code}`);
}

export async function storePendingRef(kv: KVNamespace, sessionId: string, ref: string): Promise<void> {
  await kv.put(`${KV_PREFIX_PENDING_REF}${sessionId}`, ref, { expirationTtl: PENDING_REF_TTL });
}

export async function getPendingRef(kv: KVNamespace, sessionId: string): Promise<string | null> {
  return await kv.get(`${KV_PREFIX_PENDING_REF}${sessionId}`);
}
