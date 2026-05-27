import { Context } from 'hono';
import { Session } from './domain';
import {
  isNovelLoginCountry,
  newSessionDeviceFingerprint,
  uaFingerprintsMatch,
} from './session-fingerprint';
import { createAccountAuthenticatorApplication, createAccountSmsApplication } from '../account/application';
import { createSmsRepository } from '../account/infrastructure';
import { getIdFromName } from '../../shared/utils';
import { UserDO } from '../ws/infrastructure/UserDO';
import { validationUtils, hashPhone, otpUtils } from './utils';
import { createOTPService } from './infrastructure';
import { storePendingSmsLogin } from './pending-sms-login';
import CryptoJS from 'crypto-js';

export const KNOWN_DEVICE_KV_PREFIX = 'KnownDevice:';
export const PENDING_LOGIN_DEVICE_PREFIX = 'PendingLoginDevice:';

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
  if (sessionMatch) return true;
  const key = `${KNOWN_DEVICE_KV_PREFIX}${identifier}:${deviceId}`;
  return (await kv.get(key)) !== null;
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
  const novelCountry = isNovelLoginCountry(country, activeSessions);
  const uaFp = newSessionDeviceFingerprint(ipAddress, userAgent);

  if (sessionExisted) {
    return { send: false };
  }

  if (deviceId) {
    const known = await isKnownDeviceId(kv, identifier, deviceId, activeSessions);
    if (known) {
      return { send: false };
    }
    const cooldownKey = `NewSessionEmailCooldown:${identifier}:dev:${deviceId}`;
    const onCooldown = !!(await kv.get(cooldownKey));
    if (!novelCountry) {
      return { send: !onCooldown, cooldownKey };
    }
    return { send: true, cooldownKey };
  }

  if (isLoginMissingDeviceIdWithRegisteredDevices(null, activeSessions)) {
    if (!novelCountry) {
      const cooldownKey = `NewSessionEmailCooldown:${identifier}:ua:${uaFp}`;
      const onCooldown = !!(await kv.get(cooldownKey));
      return { send: !onCooldown, cooldownKey };
    }
    const cooldownKey = `NewSessionEmailCooldown:${identifier}:ua:${uaFp}`;
    return { send: true, cooldownKey };
  }

  const hasSimilarUaActive = activeSessions.some(
    (s) => s.isActive && s.userAgent && uaFingerprintsMatch(s.userAgent, userAgent),
  );
  if (hasSimilarUaActive && !novelCountry) {
    return { send: false };
  }

  if (!novelCountry) {
    const cooldownKey = `NewSessionEmailCooldown:${identifier}:ua:${uaFp}`;
    const onCooldown = !!(await kv.get(cooldownKey));
    return { send: !onCooldown, cooldownKey };
  }

  const cooldownKey = `NewSessionEmailCooldown:${identifier}:ua:${uaFp}`;
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
    const normalizedId = validationUtils.normalizeIdentifier(identifier);
    await storePendingSmsLogin(c.env, sessionId, normalizedId, smsOtp, d);
    await createOTPService(c.env).sendSmsOTP(phone.startsWith('+') ? phone : `+${phone}`, smsOtp);
    return { requiresSms: true };
  }

  return null;
}
