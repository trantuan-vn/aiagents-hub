import type { ResolvedWorkflow } from './workflow-context.js';

const DURABLE_OBJECT_ID_RE = /^[0-9a-f]{64}$/i;

export function isDurableObjectId(value: string): boolean {
  return DURABLE_OBJECT_ID_RE.test(value.trim());
}

/** Resolve a billing/execution Durable Object id from email or a raw DO id. */
export function runnerDoIdFromIdentifier(
  binding: DurableObjectNamespace,
  identifier: string,
): string {
  const id = identifier.trim();
  if (isDurableObjectId(id)) return id;
  return binding.idFromName(id).toString();
}

export function isSharedPublishedWorkflow(workflow: Record<string, unknown>): boolean {
  const shared = workflow.isShared ?? workflow.is_shared;
  const isShared = shared === true || shared === 1 || shared === '1';
  return isShared && String(workflow.status ?? 'draft') === 'published';
}

export type WorkflowRunActor = {
  /** Email/phone (idFromName) or DO id string used for billing. */
  identifier: string;
  /** When set, address this DO directly (typical for owner triggers / API client id). */
  runnerDoIdString?: string;
};

export function ownerRunActor(ownerId: string): WorkflowRunActor {
  return { identifier: ownerId, runnerDoIdString: ownerId };
}

export function consumerRunActor(identifier: string, runnerDoIdString?: string): WorkflowRunActor {
  return { identifier, runnerDoIdString };
}

export function applyRunnerOwnership(
  resolved: ResolvedWorkflow,
  runnerDoId: string,
): ResolvedWorkflow {
  return { ...resolved, isOwnedByUser: resolved.ownerId === runnerDoId };
}

export function bindResolvedToActor(
  resolved: ResolvedWorkflow,
  actor: WorkflowRunActor,
  binding: DurableObjectNamespace,
): ResolvedWorkflow {
  const runnerDoId = actor.runnerDoIdString ?? runnerDoIdFromIdentifier(binding, actor.identifier);
  return applyRunnerOwnership(resolved, runnerDoId);
}

/**
 * Shared published workflows bill the signed-in consumer and pay royalty to the owner.
 * Owner cron/test/unpublished public URLs stay owner-run (no royalty).
 */
export function actorForPublicTrigger(params: {
  binding: DurableObjectNamespace;
  mode: 'test' | 'production';
  resolved: ResolvedWorkflow;
  sessionIdentifier: string | null;
}): { actor: WorkflowRunActor; resolved: ResolvedWorkflow } | { needLogin: true } {
  const { binding, mode, resolved, sessionIdentifier } = params;
  if (mode === 'test' || !isSharedPublishedWorkflow(resolved.workflow)) {
    const actor = ownerRunActor(resolved.ownerId);
    return { actor, resolved: bindResolvedToActor(resolved, actor, binding) };
  }
  if (!sessionIdentifier) return { needLogin: true };
  const actor = consumerRunActor(sessionIdentifier);
  return { actor, resolved: bindResolvedToActor(resolved, actor, binding) };
}

export function progressDoIdForActor(
  actor: WorkflowRunActor,
  binding: DurableObjectNamespace,
  fallbackOwnerId: string,
): string {
  if (actor.runnerDoIdString) return actor.runnerDoIdString;
  try {
    return runnerDoIdFromIdentifier(binding, actor.identifier);
  } catch {
    return fallbackOwnerId;
  }
}
