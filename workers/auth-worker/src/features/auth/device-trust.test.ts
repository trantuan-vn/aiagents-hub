import { describe, expect, it } from 'vitest';

import type { Session } from './domain';
import { getClientDeviceIdFromRequest } from '../../shared/utils';
import { formatDeviceLabel, formatLoginTimeGmt7 } from './session-fingerprint';
import {
  bindPasskeyDeviceId,
  decideNewSessionEmail,
  forgetAllRecognizedDevices,
  getPasskeyBoundDeviceId,
  isKnownDeviceId,
  isLoginStepUpSatisfied,
  isStepUpRemembered,
  markKnownDevice,
  readRecognizedDevice,
  resolvePasskeyLoginDeviceId,
} from './device-trust';

const MAC_DEVICE = '11111111-1111-4111-8111-111111111111';
const IPHONE_DEVICE = '22222222-2222-4222-8222-222222222222';
const NEW_DEVICE = '33333333-3333-4333-8333-333333333333';
const IDENTIFIER = 'user@example.com';
const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const MAC_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const EDGE_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0';

const DAY_MS = 24 * 60 * 60 * 1000;

function createMemoryKv(): KVNamespace {
  const store = new Map<string, string>();
  return {
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string) => {
      store.set(key, value);
    },
    delete: async (key: string) => {
      store.delete(key);
    },
    list: async (opts?: { prefix?: string }) => {
      const prefix = opts?.prefix ?? '';
      const keys = [...store.keys()].filter((key) => key.startsWith(prefix)).map((name) => ({ name }));
      return { keys, list_complete: true, cursor: '' };
    },
  } as unknown as KVNamespace;
}

function session(partial: Partial<Session> & Pick<Session, 'hashSessionId'>): Session {
  return {
    type: 'otp',
    expiresAt: new Date().toISOString(),
    isActive: true,
    country: 'VN',
    ...partial,
  };
}

describe('resolvePasskeyLoginDeviceId', () => {
  it('lets a synced passkey sign in from a second Apple device', async () => {
    const kv = createMemoryKv();
    await bindPasskeyDeviceId(kv, IDENTIFIER, 'cred-1', MAC_DEVICE);

    await expect(resolvePasskeyLoginDeviceId(kv, IDENTIFIER, 'cred-1', IPHONE_DEVICE)).resolves.toBe(
      IPHONE_DEVICE,
    );
  });

  it('still allows sign-in when the client has no device id yet', async () => {
    const kv = createMemoryKv();
    await bindPasskeyDeviceId(kv, IDENTIFIER, 'cred-1', MAC_DEVICE);

    await expect(resolvePasskeyLoginDeviceId(kv, IDENTIFIER, 'cred-1', null)).resolves.toBeNull();
  });

  it('records last-used device without marking it known', async () => {
    const kv = createMemoryKv();
    await bindPasskeyDeviceId(kv, IDENTIFIER, 'cred-1', MAC_DEVICE);
    await bindPasskeyDeviceId(kv, IDENTIFIER, 'cred-1', IPHONE_DEVICE);

    expect(await getPasskeyBoundDeviceId(kv, IDENTIFIER, 'cred-1')).toBe(IPHONE_DEVICE);
    expect(await isKnownDeviceId(kv, IDENTIFIER, MAC_DEVICE)).toBe(false);
    expect(await isKnownDeviceId(kv, IDENTIFIER, IPHONE_DEVICE)).toBe(false);
  });
});

describe('decideNewSessionEmail', () => {
  const macSession = [
    session({
      hashSessionId: 'mac-session',
      type: 'passkey',
      deviceId: MAC_DEVICE,
      userAgent: MAC_UA,
      country: 'VN',
    }),
  ];

  it('emails the first passkey login from a new browser device', async () => {
    const kv = createMemoryKv();
    await bindPasskeyDeviceId(kv, IDENTIFIER, 'cred-1', MAC_DEVICE);
    await markKnownDevice(kv, IDENTIFIER, MAC_DEVICE, { userAgent: MAC_UA, country: 'VN' });

    const decision = await decideNewSessionEmail(
      kv,
      IDENTIFIER,
      false,
      IPHONE_DEVICE,
      '210.245.54.31',
      IPHONE_UA,
      'VN',
      macSession,
    );

    expect(decision.send).toBe(true);
  });

  it('does not email when lastSeenAt is still inside 30 days', async () => {
    const kv = createMemoryKv();
    await markKnownDevice(kv, IDENTIFIER, IPHONE_DEVICE, { userAgent: IPHONE_UA, country: 'VN' });

    const decision = await decideNewSessionEmail(
      kv,
      IDENTIFIER,
      false,
      IPHONE_DEVICE,
      '210.245.54.31',
      IPHONE_UA,
      'VN',
      [],
    );

    expect(decision.send).toBe(false);
    expect(await isStepUpRemembered(kv, IDENTIFIER, IPHONE_DEVICE)).toBe(true);
  });

  it('emails Safari once, Edge once, then the same Safari again stays quiet', async () => {
    const kv = createMemoryKv();
    const now = Date.parse('2026-10-12T07:34:54.000Z');

    const firstSafari = await decideNewSessionEmail(
      kv,
      IDENTIFIER,
      false,
      MAC_DEVICE,
      '210.245.54.31',
      MAC_UA,
      'VN',
      [],
      Date.parse('2026-10-08T09:47:31.000Z'),
    );
    expect(firstSafari.send).toBe(true);
    await markKnownDevice(kv, IDENTIFIER, MAC_DEVICE, {
      userAgent: MAC_UA,
      country: 'VN',
      nowMs: Date.parse('2026-10-08T09:47:31.000Z'),
    });

    const edge = await decideNewSessionEmail(
      kv,
      IDENTIFIER,
      false,
      IPHONE_DEVICE,
      '210.245.54.31',
      EDGE_UA,
      'VN',
      [],
      Date.parse('2026-10-09T02:00:00.000Z'),
    );
    expect(edge.send).toBe(true);

    const safariAgain = await decideNewSessionEmail(
      kv,
      IDENTIFIER,
      false,
      MAC_DEVICE,
      '210.245.54.31',
      MAC_UA,
      'VN',
      [],
      now,
    );
    expect(safariAgain.send).toBe(false);
  });

  it('does not email a partial UA match when the device id is missing', async () => {
    const kv = createMemoryKv();
    await markKnownDevice(kv, IDENTIFIER, MAC_DEVICE, { userAgent: MAC_UA, country: 'VN' });

    const decision = await decideNewSessionEmail(
      kv,
      IDENTIFIER,
      false,
      null,
      '210.245.54.31',
      MAC_UA,
      'VN',
      [],
    );

    expect(decision.send).toBe(false);
  });

  it('emails a known device when the country is new', async () => {
    const kv = createMemoryKv();
    await markKnownDevice(kv, IDENTIFIER, MAC_DEVICE, { userAgent: MAC_UA, country: 'VN' });

    const decision = await decideNewSessionEmail(
      kv,
      IDENTIFIER,
      false,
      MAC_DEVICE,
      '8.8.8.8',
      MAC_UA,
      'US',
      [session({ hashSessionId: 'also-us', country: 'US', deviceId: MAC_DEVICE })],
    );

    expect(decision.send).toBe(true);
  });

  it('does not treat XX as a new country', async () => {
    const kv = createMemoryKv();
    await markKnownDevice(kv, IDENTIFIER, MAC_DEVICE, { userAgent: MAC_UA, country: 'VN' });

    const decision = await decideNewSessionEmail(
      kv,
      IDENTIFIER,
      false,
      MAC_DEVICE,
      '210.245.54.31',
      MAC_UA,
      'XX',
      [],
    );

    expect(decision.send).toBe(false);
  });

  it('emails again after the device has been idle for more than 30 days', async () => {
    const kv = createMemoryKv();
    const seen = Date.now() - 31 * DAY_MS;
    await markKnownDevice(kv, IDENTIFIER, MAC_DEVICE, { userAgent: MAC_UA, country: 'VN', nowMs: seen });

    const decision = await decideNewSessionEmail(
      kv,
      IDENTIFIER,
      false,
      MAC_DEVICE,
      '210.245.54.31',
      MAC_UA,
      'VN',
      [],
    );

    expect(decision.send).toBe(true);
  });

  it('stays quiet for a live session even when the device id is new', async () => {
    const kv = createMemoryKv();
    const decision = await decideNewSessionEmail(
      kv,
      IDENTIFIER,
      true,
      NEW_DEVICE,
      '210.245.54.31',
      MAC_UA,
      'US',
      [],
    );
    expect(decision.send).toBe(false);
  });

  it('uses the 12 hour burst key only to collapse parallel recognition', async () => {
    const kv = createMemoryKv();
    const first = await decideNewSessionEmail(
      kv,
      IDENTIFIER,
      false,
      MAC_DEVICE,
      '210.245.54.31',
      MAC_UA,
      'VN',
      [],
    );
    expect(first.send).toBe(true);
    expect(first.cooldownKey).toBe(`NewSessionEmailBurst:${IDENTIFIER}:${MAC_DEVICE}`);
    await kv.put(first.cooldownKey!, '1');

    const second = await decideNewSessionEmail(
      kv,
      IDENTIFIER,
      false,
      MAC_DEVICE,
      '210.245.54.31',
      MAC_UA,
      'VN',
      [],
    );
    expect(second.send).toBe(false);
  });

  it('keeps the record after a user logout and drops it after a security logout', async () => {
    const kv = createMemoryKv();
    await markKnownDevice(kv, IDENTIFIER, MAC_DEVICE, { userAgent: MAC_UA, country: 'VN' });

    const stillThere = await decideNewSessionEmail(
      kv,
      IDENTIFIER,
      false,
      MAC_DEVICE,
      '210.245.54.31',
      MAC_UA,
      'VN',
      [],
    );
    expect(stillThere.send).toBe(false);

    await forgetAllRecognizedDevices(kv, IDENTIFIER);
    expect(await readRecognizedDevice(kv, IDENTIFIER, MAC_DEVICE)).toBeNull();

    const afterSecurity = await decideNewSessionEmail(
      kv,
      IDENTIFIER,
      false,
      MAC_DEVICE,
      '210.245.54.31',
      MAC_UA,
      'VN',
      [],
    );
    expect(afterSecurity.send).toBe(true);
  });
});

describe('isLoginStepUpSatisfied', () => {
  it('skips step-up for the same device and country inside the remember window', async () => {
    const kv = createMemoryKv();
    await markKnownDevice(kv, IDENTIFIER, MAC_DEVICE, { userAgent: MAC_UA, country: 'VN' });
    await expect(isLoginStepUpSatisfied(kv, IDENTIFIER, MAC_DEVICE, 'VN')).resolves.toBe(true);
  });

  it('requires step-up for a new country, a missing cookie, and an expired remember window', async () => {
    const kv = createMemoryKv();
    const seen = Date.now() - 31 * DAY_MS;
    await markKnownDevice(kv, IDENTIFIER, MAC_DEVICE, { userAgent: MAC_UA, country: 'VN' });
    await expect(isLoginStepUpSatisfied(kv, IDENTIFIER, MAC_DEVICE, 'US')).resolves.toBe(false);
    await expect(isLoginStepUpSatisfied(kv, IDENTIFIER, null, 'VN')).resolves.toBe(false);

    const kvIdle = createMemoryKv();
    await markKnownDevice(kvIdle, IDENTIFIER, MAC_DEVICE, {
      userAgent: MAC_UA,
      country: 'VN',
      nowMs: seen,
    });
    await expect(isLoginStepUpSatisfied(kvIdle, IDENTIFIER, MAC_DEVICE, 'VN', Date.now())).resolves.toBe(false);
  });
});

describe('getClientDeviceIdFromRequest', () => {
  it('keeps the recognized API cookie when localStorage minted a new header', async () => {
    const kv = createMemoryKv();
    await markKnownDevice(kv, IDENTIFIER, MAC_DEVICE, { userAgent: MAC_UA, country: 'VN' });
    const request = new Request('https://api.aiagents-hub.vn/dashboard/auth/otp/verify', {
      headers: {
        'X-Client-Device-Id': NEW_DEVICE,
        Cookie: `client_device_id=${MAC_DEVICE}`,
      },
    });

    const selected = await getClientDeviceIdFromRequest(request, async (id) => {
      return (await readRecognizedDevice(kv, IDENTIFIER, id)) !== null;
    });

    expect(selected).toBe(MAC_DEVICE);
  });

  it('prefers a recognized header over the cookie', async () => {
    const request = new Request('https://api.aiagents-hub.vn/dashboard/auth/otp/verify', {
      headers: {
        'X-Client-Device-Id': MAC_DEVICE,
        Cookie: `client_device_id=${IPHONE_DEVICE}`,
      },
    });

    const selected = await getClientDeviceIdFromRequest(request, async (id) => id === MAC_DEVICE);
    expect(selected).toBe(MAC_DEVICE);
  });

  it('falls through to a valid header when nothing is recognized yet', async () => {
    const request = new Request('https://api.aiagents-hub.vn/dashboard/auth/otp/verify', {
      headers: {
        'X-Client-Device-Id': NEW_DEVICE,
        Cookie: `client_device_id=${MAC_DEVICE}`,
      },
    });

    const selected = await getClientDeviceIdFromRequest(request, async () => false);
    expect(selected).toBe(NEW_DEVICE);
  });
});

describe('new session email copy', () => {
  it('formats the incident clock in Asia/Ho_Chi_Minh', () => {
    expect(formatLoginTimeGmt7(new Date('2026-10-08T09:47:31.000Z'))).toBe('16:47 8/10/2026 GMT+7');
  });

  it('labels the browser family instead of the raw user agent', () => {
    expect(formatDeviceLabel(MAC_UA, 'vi')).toBe('Safari trên macOS');
    expect(formatDeviceLabel(EDGE_UA, 'en')).toBe('Edge on Windows');
  });
});
