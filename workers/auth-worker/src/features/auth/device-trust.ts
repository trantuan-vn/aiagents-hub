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
import { decryptField } from '../../shared/field-encryption';

export const KNOWN_DEVICE_KV_PREFIX = 'KnownDevice:';
export const PENDING_LOGIN_DEVICE_PREFIX = 'PendingLoginDevice:';
export const PASSKEY_DEVICE_KV_PREFIX = 'PasskeyDevice:';

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

/** Passkey login: enforce server-bound device_id; bind on first use. */
export async function resolvePasskeyLoginDeviceId(
  kv: KVNamespace,
  identifier: string,
  credentialId: string,
  rawDeviceId: string | null | undefined,
): Promise<string | null> {
  const d = normalizeDeviceId(rawDeviceId);
  const bound = await getPasskeyBoundDeviceId(kv, identifier, credentialId);
  if (bound) {
    if (!d || d !== bound) {
      throw new Error('Device mismatch for passkey');
    }
    return d;
  }
  return d;
}

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
  await markKnownDevice(kv, identifier, d);
}

/**
 * Chỉ tin device_id client nếu đã ghi nhận server-side (KV hoặc phiên active).
 * UUID tự khai báo không làm giảm step-up.
 */
export async function resolveTrustedLoginDeviceId(
  kv: KVNamespace | undefined,
  identifier: string,
  rawDeviceId: string | null | undefined,
  activeSessions: Session[],
): Promise<string | null> {
  const d = normalizeDeviceId(rawDeviceId);
  if (!d || !kv) return null;
  const known = await isKnownDeviceId(kv, identifier, d, activeSessions);
  return known ? d : null;
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
 * TOTP/SMS đã bật trên account — bắt buộc trước khi tạo session (OAuth, OTP, wallet, passkey).
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
    return { requiresTotp: true };
  }

  if (smsStatus.enabled) {
    const phone = await resolveSmsPhoneFor2FA(c, bindingName, identifier);
    if (!phone) {
      throw new Error('Cannot send SMS 2FA: phone not available. Please re-enable SMS 2FA.');
    }
    const smsOtp = otpUtils.generateOTP(6);
    await storePendingSmsLogin(c.env, sessionId, normalizedId, smsOtp, normalizeDeviceId(deviceIdForPending));
    await createOTPService(c.env).sendSmsOTP(phone.startsWith('+') ? phone : `+${phone}`, smsOtp);
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
 * Step-up 2FA khi thiết bị chưa tin (kể cả không còn phiên active khác).
 * Chỉ chạy khi account chưa bật TOTP/SMS ở bước applyEnabledSecondFactorStepUp.
 */
export async function evaluateNovelDeviceStepUp(
  c: Context,
  bindingName: string,
  repository: { sessions: { listAll: (n: number) => Promise<Session[]> } },
  identifier: string,
  sessionId: string,
  deviceIdForPending: string | null | undefined,
): Promise<{ requiresTotp: true } | { requiresSms: true } | null> {
  if (!c.env.NONCE_KV) return null;

  const activeSessions = await repository.sessions.listAll(50);
  const trusted = await resolveTrustedLoginDeviceId(
    c.env.NONCE_KV,
    identifier,
    deviceIdForPending,
    activeSessions,
  );
  const d = normalizeDeviceId(deviceIdForPending);
  const missingDeviceWithRegistered = isLoginMissingDeviceIdWithRegisteredDevices(trusted, activeSessions);

  if (trusted) return null;
  if (!d && !missingDeviceWithRegistered) return null;

  const authenticatorApp = createAccountAuthenticatorApplication(c, bindingName);
  const smsApp = createAccountSmsApplication(c, bindingName);
  const totpStatus = await authenticatorApp.getAuthenticatorStatusUseCase(identifier);
  const smsStatus = await smsApp.getSmsStatusUseCase(identifier);

  if (!totpStatus.enabled && !smsStatus.enabled) return null;

  const pendingPayload = serializePendingAuth(identifier, d);

  if (totpStatus.enabled) {
    await c.env.NONCE_KV.put(`PendingTotp:${sessionId}`, pendingPayload, { expirationTtl: 300 });
    return { requiresTotp: true };
  }

  const phone = await resolveSmsPhoneFor2FA(c, bindingName, identifier);
  if (!phone) return null;

  const smsOtp = otpUtils.generateOTP(6);
  const normalizedId = validationUtils.normalizeIdentifier(identifier);
  await storePendingSmsLogin(c.env, sessionId, normalizedId, smsOtp, d);
  await createOTPService(c.env).sendSmsOTP(phone.startsWith('+') ? phone : `+${phone}`, smsOtp);
  return { requiresSms: true };
}
