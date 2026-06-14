/** Frontend defaults for vectorize memory nodes — mirrors backend vectorize-scope.ts */

/** Keep in sync with auth-worker wrangler.jsonc `vectorize[]` bindings. */
export const VECTORIZE_INDEX_OPTIONS = [
  { binding: "VECTORIZE", indexName: "ask-ai-semantic" },
] as const;

export type VectorizeIndexOption = (typeof VECTORIZE_INDEX_OPTIONS)[number];

export const VECTORIZE_COLLECTION = VECTORIZE_INDEX_OPTIONS[0].binding;

export function isKnownVectorizeCollection(collection: string | undefined): collection is VectorizeIndexOption["binding"] {
  return VECTORIZE_INDEX_OPTIONS.some((opt) => opt.binding === collection);
}

export function resolveVectorizeCollection(collection: string | undefined): VectorizeIndexOption["binding"] {
  if (collection && isKnownVectorizeCollection(collection)) return collection;
  return VECTORIZE_COLLECTION;
}

/** Partial scope stored in node.data; backend prefixes owner id at runtime. */
export function buildVectorizeNodeScope(workflowId: number | undefined, nodeId: string): string {
  return workflowId ? `wf${workflowId}/n${nodeId}` : `n${nodeId}`;
}

export function buildVectorizeNodeData(
  workflowId: number | undefined,
  nodeId: string,
  label = "Vectorize",
): Record<string, unknown> {
  return {
    label,
    memoryKind: "vectorize",
    collection: VECTORIZE_COLLECTION,
    namespace: buildVectorizeNodeScope(workflowId, nodeId),
    dimensions: 768,
    metric: "cosine",
  };
}
