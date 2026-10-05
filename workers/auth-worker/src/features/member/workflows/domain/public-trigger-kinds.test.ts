import { describe, expect, it } from 'vitest';

import type { WorkflowDefinition } from './domain';
import {
  isPublicTriggerAllowed,
  normalizePublicTriggerKinds,
  parsePublicTriggerKinds,
  resolveRunTriggerKinds,
} from './public-trigger-kinds';

const definition: WorkflowDefinition = {
  nodes: [
    { id: 'manual', type: 'trigger', position: { x: 0, y: 0 }, data: { triggerKind: 'manual' } },
    { id: 'chat', type: 'trigger', position: { x: 0, y: 0 }, data: { triggerKind: 'chat' } },
    { id: 'form', type: 'trigger', position: { x: 0, y: 0 }, data: { triggerKind: 'form' } },
    { id: 'wh', type: 'core', position: { x: 0, y: 0 }, data: { coreKind: 'webhook' } },
    { id: 'agent', type: 'agent', position: { x: 0, y: 0 }, data: {} },
  ],
  edges: [],
};

describe('public trigger kinds', () => {
  it('allows every kind when unset or invalid', () => {
    expect(parsePublicTriggerKinds(null)).toBeNull();
    expect(parsePublicTriggerKinds('')).toBeNull();
    expect(parsePublicTriggerKinds('{')).toBeNull();
    expect(isPublicTriggerAllowed(undefined, 'webhook')).toBe(true);
  });

  it('allows only listed kinds, and none for an empty list', () => {
    expect(isPublicTriggerAllowed('["chat"]', 'chat')).toBe(true);
    expect(isPublicTriggerAllowed('["chat"]', 'form')).toBe(false);
    expect(isPublicTriggerAllowed('[]', 'manual')).toBe(false);
  });

  it('normalizes to known kinds in canonical order', () => {
    expect(normalizePublicTriggerKinds('["webhook","bogus","chat","chat"]')).toBe('["chat","webhook"]');
    expect(normalizePublicTriggerKinds(null)).toBeNull();
  });

  it('resolves the kinds a run starts from', () => {
    expect(resolveRunTriggerKinds({ definition })).toEqual(['manual']);
    expect(resolveRunTriggerKinds({ definition, entryNodeIds: ['chat'] })).toEqual(['chat']);
    expect(resolveRunTriggerKinds({ definition, entryNodeIds: ['wh'] })).toEqual(['webhook']);
    expect(resolveRunTriggerKinds({ definition, entryNodeIds: ['agent'] })).toEqual(['manual']);
    expect(resolveRunTriggerKinds({ definition, entryNodeIds: ['form'], triggerKind: 'form' })).toEqual(['form']);
    expect(resolveRunTriggerKinds({ definition, isWebhook: true })).toEqual(['webhook']);
  });
});
