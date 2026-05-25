import { Context } from 'hono';
import { Session } from './domain';
import {
  isNovelLoginCountry,
  newSessionDeviceFingerprint,
  normalizeLoginCountry,
  uaFingerprintsMatch,
} from './session-fingerprint';
import { createAccountAuthenticatorApplication, createAccountSmsApplication } from '../account/application';
import { createSmsRepository } from '../account/infrastructure';
import { getIdFromName } from '../../shared/utils';
import { UserDO } from '../ws/infrastructure/UserDO';
import { validationUtils, hashPhone, otpUtils } from './utils';
import { createOTPService } from './infrastructure';
import CryptoJS from 'crypto-js';

export const KNOWN_DEVICE_KV_PREFIX = 'KnownDevice:';
export const PENDING_LOGIN_DEVICE_PREFIX = 'PendingLoginDevice:';

const NEW_SESSION_EMAIL_LOG = '[NewSessionEmail]';

function logNewSessionEmail(step: string, data: Record<string, unknown>): void {
  console.log(NEW_SESSION_EMAIL_LOG, JSON.stringify({ step, ...data }));
}
/** Lưu thiết bị đã tin — vẫn nhận ra sau logout hết phiên */
export const KNOWN_DEVICE_TTL_SEC = 365 * 24 * 60 * 60;
export const PENDING_LOGIN_DEVICE_TTL_SEC = 15 * 60;

const DEVICE_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

export async function isKnownDeviceId(
  kv: KVNamespace,
  identifier: string,
  deviceId: string,
  activeSessions: Session[],
): Promise<boolean> {
  const sessionMatch = activeSessions.find((s) => s.isActive && s.deviceId === deviceId);
  if (sessionMatch) {
    logNewSessionEmail('isKnownDeviceId', {
      known: true,
      source: 'active_session',
      deviceId,
      matchedSessionId: sessionMatch.hashSessionId,
      activeSessionCount: activeSessions.filter((s) => s.isActive).length,
    });
    return true;
  }
  const key = `${KNOWN_DEVICE_KV_PREFIX}${identifier}:${deviceId}`;
  const kvHit = (await kv.get(key)) !== null;
  logNewSessionEmail('isKnownDeviceId', {
    known: kvHit,
    source: kvHit ? 'kv' : 'none',
    key,
    deviceId,
    activeSessionCount: activeSessions.filter((s) => s.isActive).length,
    activeDeviceIds: activeSessions.filter((s) => s.isActive && s.deviceId).map((s) => s.deviceId),
  });
  return kvHit;
}

/** Login không gửi device_id trong khi account đã có phiên gắn device_id */
export function isLoginMissingDeviceIdWithRegisteredDevices(
  deviceId: string | null,
  activeSessions: Session[],
): boolean {
  if (deviceId) return false;
  return activeSessions.some((s) => s.isActive && !!s.deviceId);
}

export async function markKnownDevice(
  kv: KVNamespace,
  identifier: string,
  deviceId: string | null | undefined,
): Promise<void> {
  const d = normalizeDeviceId(deviceId);
  if (!d) return;
  await kv.put(`${KNOWN_DEVICE_KV_PREFIX}${identifier}:${d}`, '1', {
    expirationTtl: KNOWN_DEVICE_TTL_SEC,
  });
}

/** Sau revoke/logout: bỏ tin thiết bị nếu không còn phiên active nào dùng device_id đó. */
export async function forgetKnownDeviceIfUnused(
  kv: KVNamespace,
  identifier: string,
  deviceId: string | null | undefined,
  activeSessions: Session[],
): Promise<void> {
  const d = normalizeDeviceId(deviceId);
  if (!d) return;
  const stillUsed = activeSessions.some((s) => s.isActive && s.deviceId === d);
  if (!stillUsed) {
    await kv.delete(`${KNOWN_DEVICE_KV_PREFIX}${identifier}:${d}`);
  }
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
  ipAddress: string,
  userAgent: string,
  country: string | undefined,
  activeSessions: Session[],
): Promise<NewSessionEmailDecision> {
  const activeCount = activeSessions.filter((s) => s.isActive).length;
  const normalizedCountry = normalizeLoginCountry(country);
  const novelCountry = isNovelLoginCountry(country, activeSessions);
  const uaFp = newSessionDeviceFingerprint(ipAddress, userAgent);

  logNewSessionEmail('decide:input', {
    identifier,
    sessionExisted,
    deviceId,
    country: normalizedCountry ?? country ?? null,
    novelCountry,
    uaFp,
    activeSessionCount: activeCount,
    activeSessionsSummary: activeSessions
      .filter((s) => s.isActive)
      .map((s) => ({
        hashSessionId: s.hashSessionId,
        deviceId: s.deviceId ?? null,
        country: s.country ?? null,
        uaFp: s.userAgent ? newSessionDeviceFingerprint(s.ipAddress ?? '', s.userAgent) : null,
      })),
  });

  if (sessionExisted) {
    logNewSessionEmail('decide:result', { send: false, reason: 'session_existed_same_ip_ua_hash' });
    return { send: false };
  }

  if (deviceId) {
    const known = await isKnownDeviceId(kv, identifier, deviceId, activeSessions);
    if (known) {
      logNewSessionEmail('decide:result', { send: false, reason: 'known_device_id' });
      return { send: false };
    }
    const cooldownKey = `NewSessionEmailCooldown:${identifier}:dev:${deviceId}`;
    const onCooldown = !!(await kv.get(cooldownKey));
    if (!novelCountry) {
      const send = !onCooldown;
      logNewSessionEmail('decide:result', {
        send,
        reason: onCooldown ? 'cooldown_device' : 'new_device_same_country',
        cooldownKey,
        onCooldown,
      });
      return { send, cooldownKey };
    }
    logNewSessionEmail('decide:result', {
      send: true,
      reason: 'novel_country_new_device',
      cooldownKey,
    });
    return { send: true, cooldownKey };
  }

  if (isLoginMissingDeviceIdWithRegisteredDevices(null, activeSessions)) {
    if (!novelCountry) {
      const cooldownKey = `NewSessionEmailCooldown:${identifier}:ua:${uaFp}`;
      const onCooldown = !!(await kv.get(cooldownKey));
      const send = !onCooldown;
      logNewSessionEmail('decide:result', {
        send,
        reason: onCooldown ? 'cooldown_ua_missing_device_id' : 'missing_device_id_new_ua',
        cooldownKey,
        onCooldown,
      });
      return { send, cooldownKey };
    }
    const cooldownKey = `NewSessionEmailCooldown:${identifier}:ua:${uaFp}`;
    logNewSessionEmail('decide:result', {
      send: true,
      reason: 'novel_country_missing_device_id',
      cooldownKey,
    });
    return { send: true, cooldownKey };
  }

  const hasSimilarUaActive = activeSessions.some(
    (s) => s.isActive && s.userAgent && uaFingerprintsMatch(s.userAgent, userAgent),
  );
  if (hasSimilarUaActive && !novelCountry) {
    logNewSessionEmail('decide:result', {
      send: false,
      reason: 'similar_ua_active_session',
      hasSimilarUaActive,
      uaFp,
    });
    return { send: false };
  }

  if (!novelCountry) {
    const cooldownKey = `NewSessionEmailCooldown:${identifier}:ua:${uaFp}`;
    const onCooldown = !!(await kv.get(cooldownKey));
    const send = !onCooldown;
    logNewSessionEmail('decide:result', {
      send,
      reason: onCooldown ? 'cooldown_ua' : 'new_ua_same_country',
      cooldownKey,
      onCooldown,
      hasSimilarUaActive,
      uaFp,
    });
    return { send, cooldownKey };
  }

  const cooldownKey = `NewSessionEmailCooldown:${identifier}:ua:${uaFp}`;
  logNewSessionEmail('decide:result', {
    send: true,
    reason: 'novel_country_no_device_id',
    cooldownKey,
    hasSimilarUaActive,
    uaFp,
  });
  return { send: true, cooldownKey };
}

/**
 * Step-up 2FA khi đăng nhập từ device_id mới trong khi còn phiên active khác (passkey / sau khi chưa bật 2FA ở bước trước).
 */
export async function evaluateNovelDeviceStepUp(
  c: Context,
  bindingName: string,
  repository: { sessions: { listAll: (n: number) => Promise<Session[]> } },
  identifier: string,
  sessionId: string,
  deviceId: string | null | undefined,
): Promise<{ requiresTotp: true } | { requiresSms: true } | null> {
  const d = normalizeDeviceId(deviceId);
  if (!d || !c.env.NONCE_KV) return null;

  const activeSessions = await repository.sessions.listAll(50);
  const known = await isKnownDeviceId(c.env.NONCE_KV, identifier, d, activeSessions);
  if (known) return null;

  const otherActive = activeSessions.filter((s) => s.isActive);
  if (otherActive.length === 0) return null;

  const authenticatorApp = createAccountAuthenticatorApplication(c, bindingName);
  const smsApp = createAccountSmsApplication(c, bindingName);
  const totpStatus = await authenticatorApp.getAuthenticatorStatusUseCase(identifier);
  const smsStatus = await smsApp.getSmsStatusUseCase(identifier);

  const pendingPayload = serializePendingAuth(identifier, d);

  if (totpStatus.enabled) {
    await c.env.NONCE_KV.put(`PendingTotp:${sessionId}`, pendingPayload, { expirationTtl: 300 });
    return { requiresTotp: true };
  }

  if (smsStatus.enabled) {
    const userDO = getIdFromName(c, identifier, bindingName) as DurableObjectStub<UserDO>;
    const smsRepo = createSmsRepository(userDO);
    let phone: string | null = null;
    const encryptedPhone = await smsRepo.getSmsPhoneEncrypted();
    if (encryptedPhone) {
      const encryptSecret = await c.env.ENCRYPTION_SECRET.get();
      if (encryptSecret) {
        const bytes = CryptoJS.AES.decrypt(encryptedPhone, encryptSecret);
        phone = bytes.toString(CryptoJS.enc.Utf8) || null;
      }
    }
    if (!phone && validationUtils.isValidPhone(identifier)) {
      const identifierHash = await hashPhone(validationUtils.normalizeIdentifier(identifier));
      const storedHash = await smsRepo.getPhoneHash();
      if (storedHash === identifierHash) {
        phone = identifier.startsWith('+') ? identifier : `+${identifier}`;
      }
    }
    if (!phone) return null;

    const smsOtp = otpUtils.generateOTP(6);
    await c.env.NONCE_KV.put(
      `PendingSmsLogin:${sessionId}`,
      JSON.stringify({ identifier, otp: smsOtp, deviceId: d }),
      { expirationTtl: 300 },
    );
    await createOTPService(c.env).sendSmsOTP(phone.startsWith('+') ? phone : `+${phone}`, smsOtp);
    return { requiresSms: true };
  }

  return null;
}
