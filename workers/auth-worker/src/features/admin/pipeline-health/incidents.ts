import { sha12 } from '../cloudflare-logs/fingerprint.js';
import type { ParsedLogEvent } from '../cloudflare-logs/domain.js';
import {
  classifyPipelineEvent,
  clipExcerpt,
  extractTableFromPayload,
  isPipelineTelemetryEvent,
  matchPipelineRunbook,
} from './domain.js';
import { ensurePipelineTables, pruneIncidents, upsertPipelineIncident } from './store.js';
import { queryTelemetryEvents } from '../cloudflare-logs/telemetry-client.js';
import { POLL_EVENT_LIMIT, type TimeRangeId } from './domain.js';

export async function pipelineFingerprint(input: {
  stage: string;
  code: string;
  table: string | null;
  message: string;
}): Promise<string> {
  const { normalizeDynamic } = await import('../cloudflare-logs/fingerprint.js');
  return sha12(`${input.stage}|${input.code}|${input.table ?? ''}|${normalizeDynamic(input.message)}`);
}

export async function upsertFromTelemetryEvents(db: D1Database, events: ParsedLogEvent[]): Promise<number> {
  await ensurePipelineTables(db);
  let written = 0;
  for (const event of events) {
    if (!isPipelineTelemetryEvent(event.event, event.message)) continue;
    const classified = classifyPipelineEvent(event.event, event.message);
    if (!classified) continue;
    const table = extractTableFromPayload(event.payload, event.message);
    const title = event.event || classified.code;
    const fingerprint = await pipelineFingerprint({
      stage: classified.stage,
      code: classified.code,
      table,
      message: event.errorMessage || event.message,
    });
    const runbook = matchPipelineRunbook(classified.code, classified.stage, table);
    await upsertPipelineIncident(db, {
      fingerprint,
      stage: classified.stage,
      code: classified.code,
      tableName: table,
      title,
      severity: classified.severity,
      excerpt: clipExcerpt(event.message || event.errorMessage || title),
      runbookId: runbook?.id ?? null,
      seenAt: event.tsMs || Date.now(),
    });
    written += 1;
  }
  await pruneIncidents(db);
  return written;
}

export async function pollPipelineIncidents(env: Env, range: TimeRangeId = '1h'): Promise<number> {
  if (!env.D1DB) return 0;
  const { events, error } = await queryTelemetryEvents(env, {
    range,
    errorsOnly: true,
    limit: POLL_EVENT_LIMIT,
    view: 'events',
  });
  if (error && events.length === 0) throw new Error(error);
  const pipelineEvents = events.filter((e) => isPipelineTelemetryEvent(e.event, e.message));
  return upsertFromTelemetryEvents(env.D1DB, pipelineEvents);
}
