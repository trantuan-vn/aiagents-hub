import type { WorkflowDefinition } from './domain.js';

/** Entry points a community user can start on a shared workflow. Schedule runs stay owner-only. */
export const PUBLIC_TRIGGER_KINDS = ['manual', 'chat', 'form', 'webhook'] as const;
export type PublicTriggerKind = (typeof PUBLIC_TRIGGER_KINDS)[number];

const isPublicTriggerKind = (value: unknown): value is PublicTriggerKind =>
  typeof value === 'string' && (PUBLIC_TRIGGER_KINDS as readonly string[]).includes(value);

/**
 * Stored as a JSON array string. Null, empty, or unparseable means every kind is allowed,
 * so workflows shared before this setting existed keep working.
 */
export function parsePublicTriggerKinds(raw: unknown): PublicTriggerKind[] | null {
  if (raw == null || raw === '') return null;
  let value: unknown = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(value)) return null;
  return PUBLIC_TRIGGER_KINDS.filter((kind) => value.includes(kind));
}

/** Canonical JSON string for storage, or null to allow every kind. */
export function normalizePublicTriggerKinds(raw: unknown): string | null {
  const kinds = parsePublicTriggerKinds(raw);
  return kinds ? JSON.stringify(kinds) : null;
}

export function isPublicTriggerAllowed(raw: unknown, kind: PublicTriggerKind): boolean {
  const kinds = parsePublicTriggerKinds(raw);
  return kinds === null || kinds.includes(kind);
}

export function publicTriggerKindOfNode(node: WorkflowDefinition['nodes'][number] | undefined): PublicTriggerKind {
  if (!node) return 'manual';
  const data = (node.data ?? {}) as { triggerKind?: unknown; coreKind?: unknown };
  if (data.coreKind === 'webhook' || (node.type as string) === 'webhook') return 'webhook';
  if (node.type !== 'trigger') return 'manual';
  return isPublicTriggerKind(data.triggerKind) ? data.triggerKind : 'manual';
}

/**
 * Trigger kinds a run starts from. An explicit kind from the caller wins; otherwise the
 * requested entry nodes decide. A run with no entry node is an in-app manual run.
 */
export function resolveRunTriggerKinds(params: {
  definition: WorkflowDefinition;
  entryNodeIds?: string[];
  triggerKind?: string;
  isWebhook?: boolean;
}): PublicTriggerKind[] {
  if (params.isWebhook || params.triggerKind === 'webhook') return ['webhook'];
  if (params.triggerKind === 'chat' || params.triggerKind === 'form') return [params.triggerKind];
  if (!params.entryNodeIds?.length) return ['manual'];
  const byId = new Map(params.definition.nodes.map((node) => [node.id, node]));
  return [...new Set(params.entryNodeIds.map((id) => publicTriggerKindOfNode(byId.get(id))))];
}
