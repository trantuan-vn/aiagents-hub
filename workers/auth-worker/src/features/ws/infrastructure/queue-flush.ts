/**
 * Cloudflare Queues rejects a single `send()` body over 128 KB
 * (`Queue send failed: Payload Too Large`). UserDO historically packed an
 * entire flush batch (including large `agent_workflows.definition` JSON) into
 * one message, so workflow saves could never sync to D1.
 */

/** 128_000 byte platform cap minus metadata (~100B) and JSON estimate slack. */
export const QUEUE_MESSAGE_BYTE_BUDGET = 120_000;

export type QueueFlushItem = { body: string };

export type FlushRecordGroup<T> =
  | { records: T[]; oversized: false }
  | { records: [T]; oversized: true };

export function encodedQueueMessageBytes(items: QueueFlushItem[]): number {
  return new TextEncoder().encode(JSON.stringify(items)).length;
}

export function isQueuePayloadTooLarge(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /Payload Too Large|message length|exceeds (?:single message size )?limit|MessageSizeOutOfBounds|\b10204\b/i.test(
    message,
  );
}

export function isNonRetryableFlushError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes('no such column') ||
    message.includes('SQLITE_ERROR') ||
    isQueuePayloadTooLarge(error)
  );
}

/**
 * Greedy-pack records so each `queue.send(items)` stays under `maxBytes`.
 * A singleton that still exceeds the budget is flagged `oversized` for a
 * pull-from-DO fallback instead of sending the full row.
 */
export function groupRecordsForQueueFlush<T>(
  records: T[],
  buildItems: (group: T[]) => QueueFlushItem[],
  maxBytes: number = QUEUE_MESSAGE_BYTE_BUDGET,
): FlushRecordGroup<T>[] {
  const groups: FlushRecordGroup<T>[] = [];
  let current: T[] = [];

  const exceeds = (group: T[]): boolean =>
    encodedQueueMessageBytes(buildItems(group)) > maxBytes;

  const pushCurrent = (): void => {
    if (current.length === 0) return;
    groups.push({ records: current, oversized: false });
    current = [];
  };

  for (const record of records) {
    if (exceeds([record])) {
      pushCurrent();
      groups.push({ records: [record], oversized: true });
      continue;
    }

    if (current.length > 0 && exceeds([...current, record])) {
      pushCurrent();
    }
    current.push(record);
  }

  pushCurrent();
  return groups;
}
