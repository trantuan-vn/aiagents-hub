import type { HandlerKind, ParsedLogEvent } from './domain.js';

export function normalizeDynamic(text: string): string {
  return text
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '{id}')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '{email}')
    .replace(/\b\d{4,}\b/g, '{n}')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160)
    .toLowerCase();
}

export function fingerprintKey(event: ParsedLogEvent): string {
  const eventOrException =
    event.event ||
    [event.errorName, event.errorMessage ? normalizeDynamic(event.errorMessage) : '']
      .filter(Boolean)
      .join(':') ||
    (event.httpStatus != null
      ? `http_${event.httpStatus}_${event.handlerKind}_${bucketPath(event.pathOrQueue)}`
      : '') ||
    event.outcome ||
    'unknown';
  return [
    event.scriptName,
    event.handlerKind,
    eventOrException,
    bucketPath(event.pathOrQueue),
    event.stackTop ? normalizeDynamic(event.stackTop).slice(0, 80) : '',
  ].join('|');
}

export function bucketPath(pathOrQueue: string | null | undefined): string {
  if (!pathOrQueue) return '';
  const path = pathOrQueue.split('?')[0] ?? pathOrQueue;
  return path.replace(/\/[0-9a-f-]{8,}/gi, '/{id}').replace(/\/\d+/g, '/{n}');
}

export async function fingerprintSha12(event: ParsedLogEvent): Promise<string> {
  return sha12(fingerprintKey(event));
}

export async function sha12(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return hex.slice(0, 12);
}

export function inferHandlerKind(input: {
  outcomeMessage?: string;
  path?: string | null;
  cron?: boolean;
  queue?: string | null;
  type?: string | null;
}): HandlerKind {
  const type = (input.type ?? '').toLowerCase();
  if (input.cron || type.includes('cron') || type.includes('scheduled')) return 'cron';
  if (input.queue || type.includes('queue')) return 'queue';
  if (type.includes('alarm')) return 'alarm';
  if (type.includes('websocket') || type.includes('ws')) return 'ws';
  if (type.includes('rpc')) return 'rpc';
  if (input.path || type.includes('fetch')) return 'fetch';
  return 'unknown';
}
