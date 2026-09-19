/**
 * Per-session geo-velocity telemetry stored in KV.
 * KV allows 1 write/second per key; writing on every authenticated request
 * (dashboard parallel fetches) produces 429 and fails the whole session check.
 */

export type ReplayTelemetryRecord = {
  ts: number;
  ipFp: string;
  uaFp: string;
  country: string;
};

export const REPLAY_TELEMETRY_TTL_SEC = 7 * 24 * 60 * 60;
export const REPLAY_GEO_VELOCITY_WINDOW_MS = 2 * 60 * 60 * 1000;
/** Skip unchanged fingerprint writes so a session stays under the per-key write cap. */
export const REPLAY_TELEMETRY_WRITE_THROTTLE_MS = 60 * 1000;

export function parseReplayTelemetry(raw: string | null): ReplayTelemetryRecord | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ReplayTelemetryRecord>;
    if (
      typeof parsed.ts !== 'number' ||
      typeof parsed.ipFp !== 'string' ||
      typeof parsed.uaFp !== 'string' ||
      typeof parsed.country !== 'string'
    ) {
      return null;
    }
    return { ts: parsed.ts, ipFp: parsed.ipFp, uaFp: parsed.uaFp, country: parsed.country };
  } catch {
    return null;
  }
}

export function evaluateReplayTelemetry(
  previous: ReplayTelemetryRecord | null,
  current: ReplayTelemetryRecord,
  options?: { velocityWindowMs?: number; writeThrottleMs?: number },
): { revoke: boolean; shouldWrite: boolean } {
  const velocityWindowMs = options?.velocityWindowMs ?? REPLAY_GEO_VELOCITY_WINDOW_MS;
  const writeThrottleMs = options?.writeThrottleMs ?? REPLAY_TELEMETRY_WRITE_THROTTLE_MS;

  if (!previous) {
    return { revoke: false, shouldWrite: true };
  }

  const fingerprintChanged = previous.ipFp !== current.ipFp || previous.uaFp !== current.uaFp;
  const countryChanged =
    previous.country !== 'XX' && current.country !== 'XX' && previous.country !== current.country;
  const rapidCountrySwitch = countryChanged && current.ts - previous.ts < velocityWindowMs;
  if (fingerprintChanged && rapidCountrySwitch) {
    return { revoke: true, shouldWrite: false };
  }

  const unchanged =
    previous.ipFp === current.ipFp &&
    previous.uaFp === current.uaFp &&
    previous.country === current.country;
  if (unchanged && current.ts - previous.ts < writeThrottleMs) {
    return { revoke: false, shouldWrite: false };
  }

  return { revoke: false, shouldWrite: true };
}

export async function persistReplayTelemetry(
  kv: Pick<KVNamespace, 'put'>,
  key: string,
  current: ReplayTelemetryRecord,
): Promise<string | null> {
  try {
    await kv.put(key, JSON.stringify(current), { expirationTtl: REPLAY_TELEMETRY_TTL_SEC });
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}
