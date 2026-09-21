import { describe, expect, it } from 'vitest';

import { isPersistableError, matchRunbook, severityForEvent, type ParsedLogEvent } from './domain.js';
import { fingerprintKey, fingerprintSha12, normalizeDynamic } from './fingerprint.js';
import { redactRecord } from './redact.js';
import { buildStabilityRecommendations } from './recommendations.js';
import { parseTelemetryEvent } from './telemetry-client.js';

function event(partial: Partial<ParsedLogEvent>): ParsedLogEvent {
  return {
    id: '1',
    tsMs: Date.parse('2026-09-21T03:00:00Z'),
    scriptName: 'aiagents-hub-auth-worker',
    level: 'error',
    outcome: 'ok',
    httpStatus: 500,
    event: 'handler.request_error',
    errorName: 'Error',
    errorMessage: 'boom',
    stackTop: null,
    pathOrQueue: '/dashboard/auth',
    handlerKind: 'fetch',
    invocationId: 'inv-1',
    component: 'errors',
    message: 'handler.request_error boom',
    payload: {},
    ...partial,
  };
}

describe('fingerprint', () => {
  it('stays stable when UUID and email in the message change', async () => {
    const a = event({
      event: 'paypal.sub.create_failed',
      errorMessage: 'user 11111111-1111-4111-8111-111111111111 a@x.com failed',
    });
    const b = event({
      event: 'paypal.sub.create_failed',
      errorMessage: 'user 22222222-2222-4222-8222-222222222222 b@y.com failed',
    });
    expect(fingerprintKey(a)).toBe(fingerprintKey(b));
    expect(await fingerprintSha12(a)).toBe(await fingerprintSha12(b));
  });

  it('changes when event name changes', async () => {
    const a = event({ event: 'paypal.sub.create_failed' });
    const b = event({ event: 'paypal.sub.cancel_failed' });
    expect(await fingerprintSha12(a)).not.toBe(await fingerprintSha12(b));
  });

  it('normalizes ids in paths', () => {
    expect(normalizeDynamic('abc 12345 def')).toContain('{n}');
  });
});

describe('persist and severity', () => {
  it('keeps HTTP 500 with outcome ok in the inbox', () => {
    const e = event({ outcome: 'ok', httpStatus: 500, level: 'error' });
    expect(isPersistableError(e)).toBe(true);
    expect(severityForEvent(e)).toBe('high');
  });

  it('does not persist operational warn', () => {
    const e = event({ level: 'warn', httpStatus: 401, outcome: 'ok', event: 'handler.request_error', errorMessage: 'sessionId not found' });
    expect(isPersistableError(e)).toBe(false);
    expect(severityForEvent(e)).toBe('low');
  });

  it('persists CF Observability errors even when the invocation line is info', () => {
    const e = event({
      level: 'info',
      outcome: 'exception',
      httpStatus: null,
      event: null,
      errorName: 'Error',
      errorMessage: 'Network connection lost',
      message: 'POST https://userdo/dynamic/select',
    });
    expect(isPersistableError(e)).toBe(true);
  });

  it('marks exceededCpu as critical', () => {
    const e = event({ outcome: 'exceededCpu', httpStatus: null, event: null });
    expect(isPersistableError(e)).toBe(true);
    expect(severityForEvent(e)).toBe('critical');
  });

  it('matches paypal runbook', () => {
    expect(matchRunbook(event({ event: 'paypal.sub.create_failed' }))?.id).toBe('auth.paypal');
  });
});

describe('redact', () => {
  it('redacts nested authorization, sessionId, and token', () => {
    const out = redactRecord({
      authorization: 'Bearer secret',
      nested: { sessionId: 'abc', token: 't', ok: 1 },
      headers: { Authorization: 'nope', 'cf-ray': 'ray', 'content-type': 'application/json' },
    });
    expect(out.authorization).toBe('[REDACTED]');
    expect((out.nested as Record<string, unknown>).sessionId).toBe('[REDACTED]');
    expect((out.nested as Record<string, unknown>).token).toBe('[REDACTED]');
    expect((out.headers as Record<string, unknown>).Authorization).toBeUndefined();
    expect((out.headers as Record<string, unknown>)['cf-ray']).toBe('ray');
  });
});

describe('parseTelemetryEvent', () => {
  it('reads Hub JSON console lines and 5xx outcome ok', () => {
    const parsed = parseTelemetryEvent({
      $metadata: { id: 'req-9', timestamp: '2026-09-21T03:00:00.000Z' },
      $workers: {
        scriptName: 'aiagents-hub-auth-worker',
        outcome: 'ok',
        event: { request: { path: '/dashboard/x' }, response: { status: 500 } },
      },
      message: JSON.stringify({
        level: 'error',
        service: 'auth-worker',
        component: 'paypal-sub',
        event: 'paypal.sub.create_failed',
        errorMessage: 'upstream',
      }),
    });
    expect(parsed?.event).toBe('paypal.sub.create_failed');
    expect(parsed?.httpStatus).toBe(500);
    expect(parsed?.outcome).toBe('ok');
    expect(parsed?.component).toBe('paypal-sub');
    expect(isPersistableError(parsed!)).toBe(true);
  });

  it('maps Durable Object scriptName and $metadata.error on info invocation logs', () => {
    const parsed = parseTelemetryEvent({
      $metadata: {
        id: 'do-1',
        timestamp: '2026-09-18T03:00:00.000Z',
        error: 'Network connection lost',
        level: 'info',
        service: 'aiagents-hub-auth-worker',
      },
      $workers: {
        scriptName: 'UserDO',
        outcome: 'exception',
      },
      message: 'POST https://userdo/dynamic/select',
    });
    expect(parsed?.scriptName).toBe('aiagents-hub-auth-worker');
    expect(parsed?.component).toBe('UserDO');
    expect(parsed?.level).toBe('error');
    expect(parsed?.errorMessage).toBe('Network connection lost');
    expect(parsed?.handlerKind).toBe('rpc');
    expect(isPersistableError(parsed!)).toBe(true);
  });
});

describe('recommendations', () => {
  it('fires error-rate incident and paypal rule', () => {
    const recs = buildStabilityRecommendations(
      [
        {
          fingerprint: 'abc123abc123',
          title: 'paypal.sub.create_failed',
          scriptName: 'aiagents-hub-auth-worker',
          component: 'paypal-sub',
          event: 'paypal.sub.create_failed',
          severity: 'high',
          status: 'new',
          count1h: 2,
          count24h: 8,
          countRange: 8,
          firstSeen: '2026-09-21T01:00:00.000Z',
          lastSeen: '2026-09-21T03:00:00.000Z',
          source: 'hub_index',
          runbookId: 'auth.paypal',
          excerpt: 'paypal.sub.create_failed',
          sampled: false,
        },
      ],
      [
        {
          scriptName: 'aiagents-hub-auth-worker',
          requests: 100,
          graphqlErrors: 5,
          observabilityErrors: 5,
          observabilityEvents: 100,
          errorRatePct: 5,
          http5xx: null,
          outcomes: {},
          cpuMsP50: null,
          cpuMsP99: null,
          sparkline: [],
          status: 'incident',
          sampled: false,
        },
      ],
    );
    expect(recs.some((r) => r.id.startsWith('stab.error_rate'))).toBe(true);
    expect(recs.some((r) => r.id.startsWith('stab.paypal'))).toBe(true);
  });
});
