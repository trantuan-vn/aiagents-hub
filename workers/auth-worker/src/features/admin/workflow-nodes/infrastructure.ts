import {
  DEFAULT_WORKFLOW_NODE_REGISTRY,
} from './default-nodes';
import {
  KV_KEY,
  type WorkflowNodeDefinition,
  type WorkflowNodeRegistry,
} from './domain';

function mergeBuiltinNode(
  builtin: WorkflowNodeDefinition,
  override: WorkflowNodeDefinition,
): WorkflowNodeDefinition {
  const sectionMap = new Map(builtin.sections.map((s) => [s.id, { ...s, fields: [...s.fields] }]));

  for (const section of override.sections) {
    const existing = sectionMap.get(section.id);
    if (!existing) {
      sectionMap.set(section.id, section);
      continue;
    }
    const fieldIds = new Set(existing.fields.map((f) => f.id));
    const mergedFields = [...existing.fields];
    for (const field of section.fields) {
      if (fieldIds.has(field.id)) {
        const idx = mergedFields.findIndex((f) => f.id === field.id);
        mergedFields[idx] = { ...mergedFields[idx], ...field };
      } else {
        mergedFields.push(field);
      }
    }
    sectionMap.set(section.id, {
      ...existing,
      ...section,
      fields: mergedFields.sort((a, b) => (a.order ?? 99) - (b.order ?? 99)),
    });
  }

  return { ...builtin, ...override, isBuiltin: true, sections: Array.from(sectionMap.values()) };
}

export function mergeNodeRegistry(stored: WorkflowNodeRegistry | null | undefined): WorkflowNodeRegistry {
  const defaults = DEFAULT_WORKFLOW_NODE_REGISTRY.nodes;
  if (!stored?.nodes?.length) return DEFAULT_WORKFLOW_NODE_REGISTRY;

  const byId = new Map<string, WorkflowNodeDefinition>();
  for (const node of defaults) byId.set(node.id, node);

  for (const override of stored.nodes) {
    const existing = byId.get(override.id);
    if (existing?.isBuiltin && override.isBuiltin) {
      byId.set(override.id, mergeBuiltinNode(existing, override));
    } else {
      byId.set(override.id, override);
    }
  }

  return {
    nodes: Array.from(byId.values()).filter((n) => n.isActive !== false),
    updatedAt: stored.updatedAt ?? DEFAULT_WORKFLOW_NODE_REGISTRY.updatedAt,
  };
}

export async function loadRegistry(kv: KVNamespace | undefined): Promise<WorkflowNodeRegistry> {
  if (!kv) return DEFAULT_WORKFLOW_NODE_REGISTRY;
  const raw = await kv.get(KV_KEY);
  if (!raw) return DEFAULT_WORKFLOW_NODE_REGISTRY;
  try {
    const parsed = JSON.parse(raw) as WorkflowNodeRegistry;
    return mergeNodeRegistry(parsed);
  } catch {
    return DEFAULT_WORKFLOW_NODE_REGISTRY;
  }
}

export async function saveRegistry(kv: KVNamespace | undefined, registry: WorkflowNodeRegistry): Promise<void> {
  if (!kv) throw new Error('Workflow node registry KV not configured');
  await kv.put(KV_KEY, JSON.stringify(registry));
}

export async function loadRawOverrides(kv: KVNamespace | undefined): Promise<WorkflowNodeRegistry> {
  if (!kv) return { nodes: [], updatedAt: undefined };
  const raw = await kv.get(KV_KEY);
  if (!raw) return { nodes: [], updatedAt: undefined };
  try {
    return JSON.parse(raw) as WorkflowNodeRegistry;
  } catch {
    return { nodes: [], updatedAt: undefined };
  }
}
