import { describe, expect, it } from 'vitest';

import type { ResolvedWorkflow } from './workflow-context.js';
import { workflowAttribution } from './workflow-context.js';
import {
  actorForPublicTrigger,
  applyRunnerOwnership,
  consumerRunActor,
  isDurableObjectId,
  isSharedPublishedWorkflow,
  ownerRunActor,
} from './workflow-runner.js';

const ownerId = 'a'.repeat(64);
const consumerDoId = 'b'.repeat(64);

function resolved(overrides?: Partial<ResolvedWorkflow>): ResolvedWorkflow {
  return {
    workflow: { isShared: 1, status: 'published', name: 'Shared' },
    definition: { nodes: [], edges: [] },
    ownerId,
    workflowId: 7,
    isOwnedByUser: true,
    ...overrides,
  };
}

describe('isDurableObjectId', () => {
  it('accepts 64-char hex Durable Object ids', () => {
    expect(isDurableObjectId(ownerId)).toBe(true);
    expect(isDurableObjectId('not-a-do-id')).toBe(false);
  });
});

describe('isSharedPublishedWorkflow', () => {
  it('requires both shared flag and published status', () => {
    expect(isSharedPublishedWorkflow({ isShared: 1, status: 'published' })).toBe(true);
    expect(isSharedPublishedWorkflow({ isShared: true, status: 'published' })).toBe(true);
    expect(isSharedPublishedWorkflow({ isShared: 1, status: 'draft' })).toBe(false);
    expect(isSharedPublishedWorkflow({ isShared: 0, status: 'published' })).toBe(false);
  });
});

describe('applyRunnerOwnership', () => {
  it('marks owner runs as owned so royalty is skipped', () => {
    const owned = applyRunnerOwnership(resolved(), ownerId);
    expect(owned.isOwnedByUser).toBe(true);
    expect(workflowAttribution(owned)).toBeUndefined();
  });

  it('marks consumer runs so royalty is attached', () => {
    const consumer = applyRunnerOwnership(resolved(), consumerDoId);
    expect(consumer.isOwnedByUser).toBe(false);
    expect(workflowAttribution(consumer)).toEqual({
      workflowId: 7,
      workflowOwnerId: ownerId,
    });
  });
});

describe('actorForPublicTrigger', () => {
  const binding = {
    idFromName: (name: string) => ({ toString: () => `named:${name}` }),
  } as unknown as DurableObjectNamespace;

  it('keeps test and unpublished runs on the owner', () => {
    const testRun = actorForPublicTrigger({
      binding,
      mode: 'test',
      resolved: resolved(),
      sessionIdentifier: 'user-a@example.com',
    });
    expect(testRun).toMatchObject({ actor: ownerRunActor(ownerId) });
    if ('actor' in testRun) expect(testRun.resolved.isOwnedByUser).toBe(true);

    const unpublished = actorForPublicTrigger({
      binding,
      mode: 'production',
      resolved: resolved({ workflow: { isShared: 0, status: 'published' } }),
      sessionIdentifier: 'user-a@example.com',
    });
    expect(unpublished).toMatchObject({ actor: ownerRunActor(ownerId) });
  });

  it('requires a hub session for shared production runs', () => {
    expect(
      actorForPublicTrigger({
        binding,
        mode: 'production',
        resolved: resolved(),
        sessionIdentifier: null,
      }),
    ).toEqual({ needLogin: true });
  });

  it('bills the signed-in consumer on shared production runs', () => {
    const result = actorForPublicTrigger({
      binding,
      mode: 'production',
      resolved: resolved(),
      sessionIdentifier: 'user-a@example.com',
    });
    expect(result).toMatchObject({
      actor: consumerRunActor('user-a@example.com'),
    });
    if ('resolved' in result) {
      expect(result.resolved.isOwnedByUser).toBe(false);
      expect(workflowAttribution(result.resolved)?.workflowOwnerId).toBe(ownerId);
    }
  });
});
