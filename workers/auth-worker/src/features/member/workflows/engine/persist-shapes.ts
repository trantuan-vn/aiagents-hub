/**
 * Declarative persist shapes for workflow node I/O (Phase 1).
 * Leaf module — imported by plugins and persist-state (no execute/registry cycles).
 *
 * @see docs/workflow-execution-logging-spec.md §3.3
 */

export type PersistShape = {
  /** Keys kept in stateCore for resume / downstream gather. */
  resumeFields?: string[];
  /** Logs-only keys — clipped to a short preview in DO. */
  logFields?: string[];
  /** Never written to DO (secrets / multi-MB bodies). */
  neverPersist?: string[];
};

/** Global denylist applied to every value tree before shape pick. */
export const GLOBAL_NEVER_PERSIST: readonly string[] = [
  'raw',
  'documents',
  'docs',
  'chunks',
  'embeddings',
  'webhookItem',
  'requestMeta',
  'authorization',
  'apiKey',
  'api_key',
  'accessToken',
  'refreshToken',
  'secret',
  'token',
] as const;

export const AGENT_PERSIST_SHAPE: PersistShape = {
  neverPersist: ['raw'],
  resumeFields: ['text', 'sql', 'query', 'count', 'endpoint', 'status', 'error', 'ok'],
  logFields: [
    'snippets',
    'citations',
    'plan',
    'questions',
    'confidence',
    'reason',
    'category',
    'toolNames',
  ],
};

export const SAVE_RAG_PERSIST_SHAPE: PersistShape = {
  neverPersist: ['raw', 'docs', 'chunks', 'documents', 'embeddings'],
  resumeFields: [
    'ok',
    'saved',
    'skipped',
    'reason',
    'tableName',
    'tables',
    'documentIds',
    'collection',
    'error',
    'items',
  ],
  logFields: ['documentId'],
};

export const GET_RAG_PERSIST_SHAPE: PersistShape = {
  neverPersist: ['raw', 'embeddings'],
  resumeFields: ['ragText', 'count', 'query', 'question', 'text', 'sql', 'ok', 'error'],
  logFields: ['snippets'],
};

/** Keep connection + item lists for Loop / Save RAG resume. */
export const GET_DB_INFO_PERSIST_SHAPE: PersistShape = {
  neverPersist: ['raw'],
  resumeFields: [
    'ok',
    'error',
    'dbId',
    'schemaName',
    'tables',
    'items',
    'count',
    'tableCount',
    'connection',
    'user',
    'password',
    'connectString',
    'connectionType',
  ],
};

export const LOOP_OVER_ITEMS_PERSIST_SHAPE: PersistShape = {
  resumeFields: [
    'flowKind',
    'items',
    'tableName',
    'schemaName',
    'batchIndex',
    'batchSize',
    'totalBatches',
    'loopCompleted',
    'connection',
    'user',
    'password',
    'connectString',
    'connectionType',
    'dbId',
    'activeBranches',
  ],
};

/** plugin id → shape (and runtimeType / kind aliases). */
export const PERSIST_SHAPES: Record<string, PersistShape> = {
  agent: AGENT_PERSIST_SHAPE,
  'agent:reasoning_agent': AGENT_PERSIST_SHAPE,
  'tool_node:save-rag': SAVE_RAG_PERSIST_SHAPE,
  'tool_node:get-rag': GET_RAG_PERSIST_SHAPE,
  'tool_node:get-db-info': GET_DB_INFO_PERSIST_SHAPE,
  'flow:loop_over_items': LOOP_OVER_ITEMS_PERSIST_SHAPE,
};

export function persistShapeKey(runtimeType: string, kind?: string): string {
  if (kind) return `${runtimeType}:${kind}`;
  return runtimeType;
}

export function resolvePersistShape(runtimeType: string, kind?: string): PersistShape {
  const keyed = PERSIST_SHAPES[persistShapeKey(runtimeType, kind)];
  if (keyed) return keyed;
  if (runtimeType === 'agent') return AGENT_PERSIST_SHAPE;
  return {};
}

/** Infer kind from a node output or node.data for shape lookup. */
export function inferKindFromValue(value: unknown): string | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const o = value as Record<string, unknown>;
  for (const key of ['flowKind', 'toolKind', 'agentKind', 'triggerKind', 'coreKind'] as const) {
    if (typeof o[key] === 'string' && o[key]) return o[key] as string;
  }
  return undefined;
}

export function mergeNeverPersist(shape?: PersistShape): Set<string> {
  const set = new Set<string>(GLOBAL_NEVER_PERSIST);
  for (const key of shape?.neverPersist ?? []) set.add(key);
  return set;
}
