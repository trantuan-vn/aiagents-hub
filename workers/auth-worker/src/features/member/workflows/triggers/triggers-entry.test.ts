import { describe, expect, it } from 'vitest';

import type { WorkflowDefinition } from '../domain/domain.js';
import { entryNodeIdsForTrigger, isOrphanCronTrigger } from './triggers.js';

const definition: WorkflowDefinition = {
  nodes: [
    { id: 'manual', type: 'trigger', position: { x: 0, y: 0 }, data: { triggerKind: 'manual' } },
    { id: 'webhook', type: 'trigger', position: { x: 0, y: 0 }, data: { triggerKind: 'webhook' } },
    { id: 'form', type: 'trigger', position: { x: 0, y: 0 }, data: { triggerKind: 'form' } },
    { id: 'schedule', type: 'trigger', position: { x: 0, y: 0 }, data: { triggerKind: 'schedule' } },
  ],
  edges: [],
};

const noSchedule: WorkflowDefinition = {
  nodes: definition.nodes.filter((node) => node.id !== 'schedule'),
  edges: [],
};

describe('entryNodeIdsForTrigger', () => {
  it('uses nodeId for cron so sibling manual/webhook/form graphs are not queued', () => {
    expect(
      entryNodeIdsForTrigger({ type: 'cron', nodeId: 'schedule' }, definition),
    ).toEqual(['schedule']);
  });

  it('uses nodeId for webhook and form', () => {
    expect(
      entryNodeIdsForTrigger({ type: 'webhook', nodeId: 'webhook' }, definition),
    ).toEqual(['webhook']);
    expect(
      entryNodeIdsForTrigger({ type: 'form', nodeId: 'form' }, definition),
    ).toEqual(['form']);
  });

  it('falls back to schedule nodes when a legacy cron row has no nodeId', () => {
    expect(entryNodeIdsForTrigger({ type: 'cron', nodeId: null }, definition)).toEqual(['schedule']);
  });

  it('does not invent entries for a cron row with no schedule node', () => {
    expect(entryNodeIdsForTrigger({ type: 'cron', nodeId: null }, noSchedule)).toBeUndefined();
  });
});

describe('isOrphanCronTrigger', () => {
  it('treats a cron row as orphan after its Schedule node is deleted', () => {
    expect(isOrphanCronTrigger({ type: 'cron', nodeId: 'schedule' }, noSchedule)).toBe(true);
    expect(isOrphanCronTrigger({ type: 'cron', nodeId: 'schedule' }, definition)).toBe(false);
  });

  it('treats a legacy cron row with no nodeId as orphan when no Schedule node remains', () => {
    expect(isOrphanCronTrigger({ type: 'cron', nodeId: null }, noSchedule)).toBe(true);
    expect(isOrphanCronTrigger({ type: 'cron', nodeId: null }, definition)).toBe(false);
  });
});
