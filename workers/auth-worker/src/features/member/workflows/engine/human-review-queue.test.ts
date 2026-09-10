import { describe, expect, it } from 'vitest';

import type { WorkflowDefinition } from '../domain/domain.js';
import {
  hasRunnableSiblingWork,
  queueAfterHumanReviewPause,
  queueAfterHumanReviewResume,
} from './human-review-queue.js';

const node = (
  id: string,
  type: WorkflowDefinition['nodes'][number]['type'],
  data: Record<string, unknown> = {},
): WorkflowDefinition['nodes'][number] => ({
  id,
  type,
  position: { x: 0, y: 0 },
  data,
});

const edge = (id: string, source: string, target: string) => ({
  id,
  source,
  target,
  sourceHandle: 'out' as const,
  targetHandle: 'in' as const,
});

const dbrag: WorkflowDefinition = {
  nodes: [
    node('form', 'trigger', { triggerKind: 'form' }),
    node('dbinfo', 'tool_node', { toolKind: 'get-db-info' }),
    node('save', 'tool_node', { toolKind: 'save-rag' }),
    node('gmail', 'human_review', { channel: 'gmail' }),
    node('http', 'http_request', { url: 'https://example.com' }),
    node('merge', 'flow', { flowKind: 'merge', mergeMode: 'wait_all' }),
  ],
  edges: [
    edge('e1', 'form', 'dbinfo'),
    edge('e2', 'form', 'gmail'),
    edge('e3', 'form', 'save'),
    edge('e4', 'gmail', 'http'),
    edge('e5', 'gmail', 'merge'),
    edge('e6', 'save', 'merge'),
  ],
};

const nodeById = new Map(dbrag.nodes.map((n) => [n.id, n]));

describe('hasRunnableSiblingWork', () => {
  it('defers Gmail when Get DB Info / Save RAG are still queued', () => {
    expect(
      hasRunnableSiblingWork({
        queue: ['dbinfo', 'save'],
        definition: dbrag,
        nodeById,
        engine: { visited: ['form'], skipped: [], outputs: { form: { ok: true } } },
        exceptNodeId: 'gmail',
      }),
    ).toBe(true);
  });

  it('does not defer when the queue is empty (Gmail is last)', () => {
    expect(
      hasRunnableSiblingWork({
        queue: [],
        definition: dbrag,
        nodeById,
        engine: { visited: ['form', 'dbinfo', 'save'], skipped: [], outputs: {} },
        exceptNodeId: 'gmail',
      }),
    ).toBe(false);
  });

  it('ignores another human_review and a merge still waiting on this review', () => {
    expect(
      hasRunnableSiblingWork({
        queue: ['merge', 'other-hr'],
        definition: dbrag,
        nodeById: new Map([
          ...nodeById,
          ['other-hr', node('other-hr', 'human_review', { channel: 'chat' })],
        ]),
        engine: { visited: ['form', 'save'], skipped: [], outputs: { form: {}, save: {} } },
        exceptNodeId: 'gmail',
      }),
    ).toBe(false);
  });
});

describe('human-review pause/resume queues', () => {
  it('drops leftover Get DB Info on pause so Approve cannot pick it up', () => {
    expect(queueAfterHumanReviewPause(['dbinfo', 'save'], nodeById)).toEqual([]);
  });

  it('keeps a sibling human_review wait on pause', () => {
    const withChat = new Map([
      ...nodeById,
      ['chat', node('chat', 'human_review', { channel: 'chat' })],
    ]);
    expect(queueAfterHumanReviewPause(['dbinfo', 'chat'], withChat)).toEqual(['chat']);
  });

  it('resume starts at Gmail and ignores leftover Get DB Info', () => {
    expect(queueAfterHumanReviewResume(['dbinfo', 'save'], 'gmail', nodeById)).toEqual(['gmail']);
  });

  it('resume still runs nodes wired after Gmail via scheduleDownstream, not leftover siblings', () => {
    expect(queueAfterHumanReviewResume(['http', 'dbinfo'], 'gmail', nodeById)).toEqual(['gmail']);
  });
});
