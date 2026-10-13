import { Context } from 'hono';
import { Session } from './domain';
import {
  isNovelLoginCountry,
  normalizeLoginCountry,
  normalizeUaFingerprint,
} from './session-fingerprint';
import { createAccountAuthenticatorApplication, createAccountSmsApplication } from '../account/application';
import { createSmsRepository } from '../account/infrastructure';
import { getClientDeviceIdFromRequest, getIdFromName } from '../../shared/utils';
import { UserDO } from '../ws/infrastructure/UserDO';
import { validationUtils, hashPhone, otpUtils, markPreAuthSessionTrusted } from './utils';
import { createOTPService } from './infrastructure';
import { storePendingSmsLogin } from './pending-sms-login';
import { decryptField } from '../../shared/field-encryption';
import { AUTH_CONSTANTS, CLIENT_DEVICE_ID_RE } from './constant';

/** Bản ghi cũ, chỉ còn để xóa khi logout bảo mật. */
export const KNOWN_DEVICE_KV_PREFIX = 'KnownDevice:';
export const RECOGNIZED_DEVICE_KV_PREFIX = 'RecognizedDevice:';
export const PENDING_LOGIN_DEVICE_PREFIX = 'PendingLoginDevice:';
export const PASSKEY_DEVICE_KV_PREFIX = 'PasskeyDevice:';

/** TTL KV, gia hạn mỗi lần đăng nhập thành công từ thiết bị đó. */
export const KNOWN_DEVICE_TTL_SEC = 365 * 24 * 60 * 60;
export const PENDING_LOGIN_DEVICE_TTL_SEC = 15 * 60;

const DEVICE_ID_RE = CLIENT_DEVICE_ID_RE;

export type RecognizedDeviceRecord = {
  uaFp: string;
  country: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  stepUpTrustedUntil: string;
};

export function normalizeDeviceId(raw?: string | null): string | null {
  const id = (raw ?? '').trim().toLowerCase();
  if (!id || id.length > 64) return null;
  if (!DEVICE_ID_RE.test(id)) return null;
  return id;
}

export function serializePendingAuth(identifier: string, deviceId?: string | null): string {
  const payload: { identifier: string; deviceId?: string } = { identifier };
  const d = normalizeDeviceId(deviceId);
  if (d) payload.deviceId = d;
  return JSON.stringify(payload);
}

export function parsePendingAuth(raw: string | null): { identifier: string; deviceId?: string } | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { identifier?: string; deviceId?: string };
    if (parsed?.identifier) {
      return {
        identifier: parsed.identifier,
        deviceId: normalizeDeviceId(parsed.deviceId) ?? undefined,
      };
    }
  } catch {
    /* legacy: plain identifier string */
  }
  const trimmed = raw.trim();
  return trimmed ? { identifier: trimmed } : null;
}

export async function storePendingLoginDevice(
  kv: KVNamespace,
  sessionId: string,
  deviceId: string | null | undefined,
): Promise<void> {
  const d = normalizeDeviceId(deviceId);
  if (!d) return;
  await kv.put(`${PENDING_LOGIN_DEVICE_PREFIX}${sessionId}`, d, {
    expirationTtl: PENDING_LOGIN_DEVICE_TTL_SEC,
  });
}

export async function consumePendingLoginDevice(
  kv: KVNamespace,
  sessionId: string,
): Promise<string | null> {
  const key = `${PENDING_LOGIN_DEVICE_PREFIX}${sessionId}`;
  const d = normalizeDeviceId(await kv.get(key));
  if (d) await kv.delete(key);
  return d;
}

function recognizedDeviceKey(identifier: string, deviceId: string): string {
  const id = validationUtils.normalizeIdentifier(identifier);
  return `${RECOGNIZED_DEVICE_KV_PREFIX}${id}:${deviceId}`;
}

function parseRecognizedDevice(raw: string | null): RecognizedDeviceRecord | null {
  if (!raw || raw === '1') return null;
  try {
    const parsed = JSON.parse(raw) as Partial<RecognizedDeviceRecord>;
    if (!parsed || typeof parsed.lastSeenAt !== 'string' || typeof parsed.stepUpTrustedUntil !== 'string') {
      return null;
    }
    return {
      uaFp: typeof parsed.uaFp === 'string' ? parsed.uaFp : '',
      country: typeof parsed.country === 'string' ? parsed.country : null,
      firstSeenAt: typeof parsed.firstSeenAt === 'string' ? parsed.firstSeenAt : parsed.lastSeenAt,
      lastSeenAt: parsed.lastSeenAt,
      stepUpTrustedUntil: parsed.stepUpTrustedUntil,
    };
  } catch {
    return null;
  }
}

function seenWithin(iso: string, nowMs: number, windowSec: number): boolean {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return false;
  return nowMs - t <= windowSec * 1000;
}

async function listKvKeys(kv: KVNamespace, prefix: string): Promise<string[]> {
  const keys: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await kv.list({ prefix, cursor });
    for (const key of page.keys) keys.push(key.name);
    cursor = page.list_complete || !page.cursor ? undefined : page.cursor;
  } while (cursor);
  return keys;
}

export async function readRecognizedDevice(
  kv: KVNamespace,
  identifier: string,
  deviceId: string,
): Promise<RecognizedDeviceRecord | null> {
  const d = normalizeDeviceId(deviceId);
  if (!d) return null;
  return parseRecognizedDevice(await kv.get(recognizedDeviceKey(identifier, d)));
}

export async function listRecognizedDevices(
  kv: KVNamespace,
  identifier: string,
): Promise<Array<{ deviceId: string; record: RecognizedDeviceRecord }>> {
  const id = validationUtils.normalizeIdentifier(identifier);
  const prefix = `${RECOGNIZED_DEVICE_KV_PREFIX}${id}:`;
  const keys = await listKvKeys(kv, prefix);
  const rows: Array<{ deviceId: string; record: RecognizedDeviceRecord }> = [];
  for (const key of keys) {
    const deviceId = normalizeDeviceId(key.slice(prefix.length));
    if (!deviceId) continue;
    const record = parseRecognizedDevice(await kv.get(key));
    if (record) rows.push({ deviceId, record });
  }
  return rows;
}

/** Bản ghi còn trong KV, kể cả khi `lastSeenAt` đã quá 30 ngày. */
export async function hasRecognizedDeviceRecord(
  kv: KVNamespace,
  identifier: string,
  deviceId: string,
): Promise<boolean> {
  return (await readRecognizedDevice(kv, identifier, deviceId)) !== null;
}

/** `lastSeenAt` còn trong 30 ngày. Không dùng phiên active làm trí nhớ thiết bị. */
export async function isKnownDeviceId(
  kv: KVNamespace,
  identifier: string,
  deviceId: string,
): Promise<boolean> {
  const record = await readRecognizedDevice(kv, identifier, deviceId);
  if (!record) return false;
  return seenWithin(record.lastSeenAt, Date.now(), AUTH_CONSTANTS.RECOGNIZED_DEVICE_IDLE_SEC);
}

/**
 * Bỏ qua step-up chỉ khi đúng device id còn `stepUpTrustedUntil` và quốc gia không lạ.
 * Không có cookie thì không bỏ qua.
 */
export async function isLoginStepUpSatisfied(
  kv: KVNamespace,
  identifier: string,
  deviceId: string | null | undefined,
  country: string | undefined,
  nowMs = Date.now(),
): Promise<boolean> {
  const d = normalizeDeviceId(deviceId);
  if (!d || !(await isStepUpRemembered(kv, identifier, d, nowMs))) return false;
  const records = await listRecognizedDevices(kv, identifier);
  const novel = isNovelLoginCountry(
    country,
    [],
    records.map((row) => row.record.country),
  );
  return !novel;
}

export async function isStepUpRemembered(
  kv: KVNamespace,
  identifier: string,
  deviceId: string,
  nowMs = Date.now(),
): Promise<boolean> {
  const record = await readRecognizedDevice(kv, identifier, deviceId);
  if (!record) return false;
  const until = Date.parse(record.stepUpTrustedUntil);
  return Number.isFinite(until) && until > nowMs;
}

export async function markKnownDevice(
  kv: KVNamespace,
  identifier: string,
  deviceId: string | null | undefined,
  meta?: { userAgent?: string; country?: string; nowMs?: number },
): Promise<void> {
  const d = normalizeDeviceId(deviceId);
  if (!d) return;
  const nowMs = meta?.nowMs ?? Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const existing = await readRecognizedDevice(kv, identifier, d);
  const uaFp = meta?.userAgent ? normalizeUaFingerprint(meta.userAgent) : (existing?.uaFp ?? '');
  const country = normalizeLoginCountry(meta?.country) ?? existing?.country ?? null;
  const record: RecognizedDeviceRecord = {
    uaFp,
    country,
    firstSeenAt: existing?.firstSeenAt ?? nowIso,
    lastSeenAt: nowIso,
    stepUpTrustedUntil: new Date(nowMs + AUTH_CONSTANTS.STEP_UP_REMEMBER_SEC * 1000).toISOString(),
  };
  await kv.put(recognizedDeviceKey(identifier, d), JSON.stringify(record), {
    expirationTtl: KNOWN_DEVICE_TTL_SEC,
  });
}

function countryCompatible(recordCountry: string | null, currentCountry?: string): boolean {
  const current = normalizeLoginCountry(currentCountry);
  if (!current) return true;
  const stored = normalizeLoginCountry(recordCountry ?? undefined);
  if (!stored) return true;
  return stored === current;
}

function matchingPartialRecords(
  records: Array<{ deviceId: string; record: RecognizedDeviceRecord }>,
  userAgent: string,
  country: string | undefined,
  nowMs: number,
): Array<{ deviceId: string; record: RecognizedDeviceRecord }> {
  const uaFp = normalizeUaFingerprint(userAgent);
  return records.filter((row) => {
    if (!row.record.uaFp || row.record.uaFp !== uaFp) return false;
    if (!seenWithin(row.record.lastSeenAt, nowMs, AUTH_CONSTANTS.RECOGNIZED_DEVICE_IDLE_SEC)) return false;
    return countryCompatible(row.record.country, country);
  });
}

/** Gia hạn bản ghi khớp UA khi request không có device id. */
async function renewPartialMatches(
  kv: KVNamespace,
  identifier: string,
  userAgent: string,
  country: string | undefined,
  nowMs: number,
): Promise<void> {
  const matches = matchingPartialRecords(
    await listRecognizedDevices(kv, identifier),
    userAgent,
    country,
    nowMs,
  );
  for (const row of matches) {
    await markKnownDevice(kv, identifier, row.deviceId, { userAgent, country, nowMs });
  }
}

/**
 * Ghi hoặc gia hạn RecognizedDevice sau đăng nhập thành công.
 * Không có device id thì gia hạn bản ghi partial-match, không tạo id mới.
 */
export async function rememberLoginDevice(
  kv: KVNamespace,
  identifier: string,
  deviceId: string | null | undefined,
  userAgent: string,
  country?: string,
  nowMs = Date.now(),
): Promise<void> {
  if (normalizeDeviceId(deviceId)) {
    await markKnownDevice(kv, identifier, deviceId, { userAgent, country, nowMs });
    return;
  }
  await renewPartialMatches(kv, identifier, userAgent, country, nowMs);
}

export async function forgetRecognizedDevice(
  kv: KVNamespace,
  identifier: string,
  deviceId: string | null | undefined,
): Promise<void> {
  const d = normalizeDeviceId(deviceId);
  if (!d) return;
  const id = validationUtils.normalizeIdentifier(identifier);
  await kv.delete(recognizedDeviceKey(identifier, d));
  await kv.delete(`${KNOWN_DEVICE_KV_PREFIX}${id}:${d}`);
}

/** Xóa mọi trí nhớ thiết bị của user (logout bảo mật, đổi mật khẩu). */
export async function forgetAllRecognizedDevices(kv: KVNamespace, identifier: string): Promise<void> {
  const id = validationUtils.normalizeIdentifier(identifier);
  for (const prefix of [RECOGNIZED_DEVICE_KV_PREFIX, KNOWN_DEVICE_KV_PREFIX]) {
    const keys = await listKvKeys(kv, `${prefix}${id}:`);
    for (const key of keys) await kv.delete(key);
  }
}

/**
 * Header đã ghi nhận thắng. Cookie API đã ghi nhận thắng header mới.
 * Không có id trên request thì dùng fallback (pending login).
 */
export async function resolveAccountDeviceId(
  kv: KVNamespace,
  identifier: string,
  request: Request,
  fallback?: string | null,
): Promise<string | null> {
  const selected = await getClientDeviceIdFromRequest(request, async (id) =>
    hasRecognizedDeviceRecord(kv, identifier, id),
  );
  return normalizeDeviceId(selected) ?? normalizeDeviceId(fallback);
}

function passkeyDeviceKvKey(identifier: string, credentialId: string): string {
  return `${PASSKEY_DEVICE_KV_PREFIX}${identifier}:${credentialId}`;
}

export async function getPasskeyBoundDeviceId(
  kv: KVNamespace,
  identifier: string,
  credentialId: string,
): Promise<string | null> {
  return normalizeDeviceId(await kv.get(passkeyDeviceKvKey(identifier, credentialId)));
}

/**
 * Passkey login tags the current browser device_id for session tracking.
 * Do not pin a credential to the first browser UUID: synced passkeys (iCloud Keychain,
 * Google Password Manager) are the same authenticator on every device that can assert them.
 */
export async function resolvePasskeyLoginDeviceId(
  _kv: KVNamespace,
  _identifier: string,
  _credentialId: string,
  rawDeviceId: string | null | undefined,
): Promise<string | null> {
  return normalizeDeviceId(rawDeviceId);
}

/** Last-used browser UUID for this credential. Does not mark the device known — that must wait until after new-session email. */
export async function bindPasskeyDeviceId(
  kv: KVNamespace,
  identifier: string,
  credentialId: string,
  deviceId: string | null | undefined,
): Promise<void> {
  const d = normalizeDeviceId(deviceId);
  if (!d) return;
  await kv.put(passkeyDeviceKvKey(identifier, credentialId), d, {
    expirationTtl: KNOWN_DEVICE_TTL_SEC,
  });
}

async function resolveSmsPhoneFor2FA(
  c: Context,
  bindingName: string,
  identifier: string,
): Promise<string | null> {
  const userDO = getIdFromName(c, identifier, bindingName) as DurableObjectStub<UserDO>;
  const smsRepo = createSmsRepository(userDO);
  let phone: string | null = null;
  const encryptedPhone = await smsRepo.getSmsPhoneEncrypted();
  if (encryptedPhone) {
    const encryptSecret = await c.env.ENCRYPTION_SECRET.get();
    if (encryptSecret) {
      try {
        phone = (await decryptField(encryptedPhone, encryptSecret)) || null;
      } catch {
        phone = null;
      }
    }
  }
  if (!phone && validationUtils.isValidPhone(identifier)) {
    const identifierHash = await hashPhone(validationUtils.normalizeIdentifier(identifier));
    const storedHash = await smsRepo.getPhoneHash();
    if (storedHash === identifierHash) {
      phone = identifier.startsWith('+') ? identifier : `+${identifier}`;
    }
  }
  return phone;
}

/**
 * TOTP/SMS đã bật trên account — bắt buộc trước khi tạo session (OAuth, OTP, wallet). Passkey login bỏ qua.
 */
export async function applyEnabledSecondFactorStepUp(
  c: Context,
  bindingName: string,
  identifier: string,
  sessionId: string,
  deviceIdForPending: string | null | undefined,
): Promise<{ requiresTotp: true } | { requiresSms: true } | null> {
  if (!c.env.NONCE_KV) return null;

  const normalizedId = validationUtils.normalizeIdentifier(identifier);
  const pendingPayload = serializePendingAuth(normalizedId, deviceIdForPending);
  const authenticatorApp = createAccountAuthenticatorApplication(c, bindingName);
  const smsApp = createAccountSmsApplication(c, bindingName);
  const totpStatus = await authenticatorApp.getAuthenticatorStatusUseCase(identifier);
  const smsStatus = await smsApp.getSmsStatusUseCase(identifier);

  if (totpStatus.enabled) {
    await c.env.NONCE_KV.put(`PendingTotp:${sessionId}`, pendingPayload, { expirationTtl: 300 });
    await markPreAuthSessionTrusted(c.env.NONCE_KV, sessionId);
    return { requiresTotp: true };
  }

  if (smsStatus.enabled) {
    const phone = await resolveSmsPhoneFor2FA(c, bindingName, identifier);
    if (!phone) {
      throw new Error('Cannot send SMS 2FA: phone not available. Please re-enable SMS 2FA.');
    }
    const smsOtp = otpUtils.generateOTP(6);
    await storePendingSmsLogin(c.env, sessionId, normalizedId, smsOtp, normalizeDeviceId(deviceIdForPending));
    await markPreAuthSessionTrusted(c.env.NONCE_KV, sessionId);
    await createOTPService(c.env).sendSmsOTP(phone.startsWith('+') ? phone : `+${phone}`, smsOtp, 300);
    return { requiresSms: true };
  }

  return null;
}

export type NewSessionEmailDecision = {
  send: boolean;
  cooldownKey?: string;
};

export async function decideNewSessionEmail(
  kv: KVNamespace,
  identifier: string,
  sessionExisted: boolean,
  deviceId: string | null,
  _ipAddress: string,
  userAgent: string,
  country: string | undefined,
  activeSessions: Session[],
  nowMs = Date.now(),
): Promise<NewSessionEmailDecision> {
  if (sessionExisted) return { send: false };

  const id = validationUtils.normalizeIdentifier(identifier);
  const normalizedDeviceId = normalizeDeviceId(deviceId);
  const uaFp = normalizeUaFingerprint(userAgent);
  const burstKey = `NewSessionEmailBurst:${id}:${normalizedDeviceId ?? uaFp}`;
  const records = await listRecognizedDevices(kv, identifier);
  const novelCountry = isNovelLoginCountry(
    country,
    activeSessions,
    records.map((row) => row.record.country),
  );

  if (normalizedDeviceId) {
    const row = records.find((item) => item.deviceId === normalizedDeviceId);
    const recent =
      !!row && seenWithin(row.record.lastSeenAt, nowMs, AUTH_CONSTANTS.RECOGNIZED_DEVICE_IDLE_SEC);
    if (recent && !novelCountry) return { send: false };
  } else if (
    matchingPartialRecords(records, userAgent, country, nowMs).length > 0 &&
    !novelCountry
  ) {
    return { send: false };
  }

  if (novelCountry) return { send: true, cooldownKey: burstKey };

  const onBurst = !!(await kv.get(burstKey));
  return { send: !onBurst, cooldownKey: burstKey };
}

/**
 * Step-up khi không có `stepUpTrustedUntil` còn hạn cho đúng device id.
 * Không có cookie (partial match) vẫn step-up. Passkey login không gọi hàm này.
 */
export async function evaluateNovelDeviceStepUp(
  c: Context,
  bindingName: string,
  _repository: { sessions: { listAll: (n: number) => Promise<Session[]> } },
  identifier: string,
  sessionId: string,
  deviceIdForPending: string | null | undefined,
): Promise<{ requiresTotp: true } | { requiresSms: true } | null> {
  if (!c.env.NONCE_KV) return null;

  const country = (c.req.raw as Request & { cf?: { country?: string } }).cf?.country;
  if (await isLoginStepUpSatisfied(c.env.NONCE_KV, identifier, deviceIdForPending, country)) {
    return null;
  }

  return applyEnabledSecondFactorStepUp(c, bindingName, identifier, sessionId, deviceIdForPending);
}
