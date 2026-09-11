/** Shared Vectorize index — one index for all users/workflows (lowest cost). */
export const VECTORIZE_COLLECTION = 'VECTORIZE';

export type VectorizeScopeContext = {
  ownerId?: string;
  workflowId?: number;
};

/**
 * Isolates vector data per user / workflow / memory node via metadata filter.
 * Each vectorize node in a workflow gets its own scope (independent dataset).
 */
export function buildVectorizeScope(
  ownerId: string,
  workflowId: number,
  memoryNodeId: string,
): string {
  return `u${ownerId}/wf${workflowId}/n${memoryNodeId}`;
}

/** Resolve namespace from node config or derive a stable scope at runtime. */
export function resolveVectorizeScope(
  ownerId: string,
  workflowId: number,
  memoryNodeId: string,
  configured?: string,
): string {
  const trimmed = configured?.trim();
  if (trimmed?.startsWith('u')) return trimmed;
  if (trimmed) return `u${ownerId}/${trimmed}`;
  return buildVectorizeScope(ownerId, workflowId, memoryNodeId);
}

/** Normalize legacy collection names to the shared index binding. */
export function normalizeVectorizeCollection(collection?: string): string {
  const name = collection?.trim();
  if (!name || name === 'vectorize-default') return VECTORIZE_COLLECTION;
  return name;
}
