import { describe, expect, it } from 'vitest';

import {
  evaluateReplayTelemetry,
  parseReplayTelemetry,
  persistReplayTelemetry,
  REPLAY_GEO_VELOCITY_WINDOW_MS,
  REPLAY_TELEMETRY_WRITE_THROTTLE_MS,
  type ReplayTelemetryRecord,
} from './replay-telemetry';

const base: ReplayTelemetryRecord = {
  ts: 1_000_000,
  ipFp: '1.2.3',
  uaFp: 'chrome|macos',
  country: 'VN',
};

describe('parseReplayTelemetry', () => {
  it('returns null for missing or corrupt payloads', () => {
    expect(parseReplayTelemetry(null)).toBeNull();
    expect(parseReplayTelemetry('not-json')).toBeNull();
    expect(parseReplayTelemetry('{"ts":"bad"}')).toBeNull();
  });

  it('parses a valid record', () => {
    expect(parseReplayTelemetry(JSON.stringify(base))).toEqual(base);
  });
});

describe('evaluateReplayTelemetry', () => {
  it('writes on first sighting', () => {
    expect(evaluateReplayTelemetry(null, base)).toEqual({ revoke: false, shouldWrite: true });
  });

  it('skips writes when fingerprint is unchanged inside the throttle window', () => {
    const current = { ...base, ts: base.ts + REPLAY_TELEMETRY_WRITE_THROTTLE_MS - 1 };
    expect(evaluateReplayTelemetry(base, current)).toEqual({ revoke: false, shouldWrite: false });
  });

  it('refreshes last-seen after the throttle window', () => {
    const current = { ...base, ts: base.ts + REPLAY_TELEMETRY_WRITE_THROTTLE_MS };
    expect(evaluateReplayTelemetry(base, current)).toEqual({ revoke: false, shouldWrite: true });
  });

  it('writes when country or fingerprint changes without a velocity revoke', () => {
    const later = { ...base, ts: base.ts + REPLAY_GEO_VELOCITY_WINDOW_MS, country: 'US' };
    expect(evaluateReplayTelemetry(base, later)).toEqual({ revoke: false, shouldWrite: true });
  });

  it('revokes on fingerprint + rapid country switch', () => {
    const attacker = {
      ts: base.ts + 60_000,
      ipFp: '9.9.9',
      uaFp: 'firefox|windows',
      country: 'US',
    };
    expect(evaluateReplayTelemetry(base, attacker)).toEqual({ revoke: true, shouldWrite: false });
  });
});

describe('persistReplayTelemetry', () => {
  it('does not throw when KV returns 429', async () => {
    const kv = {
      put: async () => {
        throw new Error('KV PUT failed: 429 Too Many Requests');
      },
    } as Pick<KVNamespace, 'put'>;

    await expect(persistReplayTelemetry(kv, 'ReplayTelemetry:user:sess', base)).resolves.toBe(
      'KV PUT failed: 429 Too Many Requests',
    );
  });
});
