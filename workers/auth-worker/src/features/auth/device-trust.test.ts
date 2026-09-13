import { describe, expect, it } from 'vitest';

import type { Session } from './domain';
import {
  bindPasskeyDeviceId,
  decideNewSessionEmail,
  getPasskeyBoundDeviceId,
  isKnownDeviceId,
  markKnownDevice,
  resolvePasskeyLoginDeviceId,
} from './device-trust';

const MAC_DEVICE = '11111111-1111-4111-8111-111111111111';
const IPHONE_DEVICE = '22222222-2222-4222-8222-222222222222';
const IDENTIFIER = 'user@example.com';
const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const MAC_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';

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
  } as unknown as KVNamespace;
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
    expect(await isKnownDeviceId(kv, IDENTIFIER, MAC_DEVICE, [])).toBe(false);
    expect(await isKnownDeviceId(kv, IDENTIFIER, IPHONE_DEVICE, [])).toBe(false);
  });
});

describe('decideNewSessionEmail after passkey bind', () => {
  const macSession: Session[] = [
    {
      hashSessionId: 'mac-session',
      type: 'passkey',
      expiresAt: new Date().toISOString(),
      country: 'VN',
      deviceId: MAC_DEVICE,
      userAgent: MAC_UA,
      isActive: true,
    },
  ];

  it('emails the first passkey login from a new browser device', async () => {
    const kv = createMemoryKv();
    await bindPasskeyDeviceId(kv, IDENTIFIER, 'cred-1', MAC_DEVICE);
    await markKnownDevice(kv, IDENTIFIER, MAC_DEVICE);

    const decision = await decideNewSessionEmail(
      kv,
      IDENTIFIER,
      false,
      IPHONE_DEVICE,
      '1.2.3.4',
      IPHONE_UA,
      'VN',
      macSession,
    );

    expect(decision.send).toBe(true);
  });

  it('does not email after the device has already been marked known', async () => {
    const kv = createMemoryKv();
    await markKnownDevice(kv, IDENTIFIER, IPHONE_DEVICE);

    const decision = await decideNewSessionEmail(
      kv,
      IDENTIFIER,
      false,
      IPHONE_DEVICE,
      '1.2.3.4',
      IPHONE_UA,
      'VN',
      macSession,
    );

    expect(decision.send).toBe(false);
  });
});
