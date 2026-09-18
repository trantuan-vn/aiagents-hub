import { describe, expect, it } from 'vitest';

import {
  encodedQueueMessageBytes,
  groupRecordsForQueueFlush,
  isNonRetryableFlushError,
  isQueuePayloadTooLarge,
  QUEUE_MESSAGE_BYTE_BUDGET,
} from './queue-flush.js';

describe('encodedQueueMessageBytes', () => {
  it('measures the JSON size of the array sent to Queue.send()', () => {
    expect(encodedQueueMessageBytes([{ body: 'abc' }])).toBe(
      JSON.stringify([{ body: 'abc' }]).length,
    );
  });
});

describe('groupRecordsForQueueFlush', () => {
  it('keeps small records in one message', () => {
    const records = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const groups = groupRecordsForQueueFlush(records, (group) =>
      group.map((row) => ({ body: JSON.stringify(row) })),
    );
    expect(groups).toEqual([{ records, oversized: false }]);
  });

  it('splits when packing the next record would exceed the budget', () => {
    const records = [
      { id: 1, blob: 'a'.repeat(80) },
      { id: 2, blob: 'b'.repeat(80) },
      { id: 3, blob: 'c'.repeat(80) },
    ];
    const groups = groupRecordsForQueueFlush(
      records,
      (group) => group.map((row) => ({ body: JSON.stringify(row) })),
      200,
    );
    expect(groups.every((group) => !group.oversized)).toBe(true);
    expect(groups.length).toBeGreaterThan(1);
    expect(groups.flatMap((group) => group.records)).toEqual(records);
    for (const group of groups) {
      expect(
        encodedQueueMessageBytes(group.records.map((row) => ({ body: JSON.stringify(row) }))),
      ).toBeLessThanOrEqual(200);
    }
  });

  it('flags a singleton that cannot fit even alone', () => {
    const huge = { id: 9, blob: 'x'.repeat(500) };
    const groups = groupRecordsForQueueFlush(
      [{ id: 1, blob: 'ok' }, huge, { id: 2, blob: 'ok' }],
      (group) => group.map((row) => ({ body: JSON.stringify(row) })),
      120,
    );
    expect(groups).toHaveLength(3);
    expect(groups[0]).toEqual({ records: [{ id: 1, blob: 'ok' }], oversized: false });
    expect(groups[1]).toEqual({ records: [huge], oversized: true });
    expect(groups[2]).toEqual({ records: [{ id: 2, blob: 'ok' }], oversized: false });
  });

  it('stays under the production byte budget for typical workflow rows', () => {
    const records = Array.from({ length: 20 }, (_, i) => ({
      queueId: i + 1,
      definition: JSON.stringify({ nodes: [{ prompt: 'p'.repeat(2000) }] }),
    }));
    const groups = groupRecordsForQueueFlush(records, (group) =>
      group.map((row) => ({
        body: JSON.stringify({
          table: 'agent_workflows',
          data: row,
          id: row.queueId,
          batchInfo: { userId: 'u', table: 'agent_workflows', batchSize: group.length },
        }),
      })),
    );
    expect(groups.flatMap((group) => group.records)).toHaveLength(20);
    for (const group of groups) {
      if (group.oversized) continue;
      const items = group.records.map((row) => ({
        body: JSON.stringify({
          table: 'agent_workflows',
          data: row,
          id: row.queueId,
          batchInfo: { userId: 'u', table: 'agent_workflows', batchSize: group.records.length },
        }),
      }));
      expect(encodedQueueMessageBytes(items)).toBeLessThanOrEqual(QUEUE_MESSAGE_BYTE_BUDGET);
    }
  });
});

describe('isQueuePayloadTooLarge', () => {
  it('matches production and local broker wordings', () => {
    expect(isQueuePayloadTooLarge(new Error('Queue send failed: Payload Too Large'))).toBe(true);
    expect(
      isQueuePayloadTooLarge(
        new Error('Queue send failed: message length of 200029 bytes exceeds limit of 128000'),
      ),
    ).toBe(true);
    expect(isNonRetryableFlushError(new Error('SQLITE_ERROR: no such table'))).toBe(true);
    expect(isNonRetryableFlushError(new Error('network timeout'))).toBe(false);
  });
});
