import { DEFAULT_WORKFLOW_NODE_REGISTRY } from "./default-nodes";
import type { WorkflowNodeDefinition, WorkflowNodeRegistry } from "./types";

/** Merge admin overrides with built-in defaults. Custom nodes append; builtins can be extended. */
export function mergeNodeRegistry(overrides: WorkflowNodeRegistry | null | undefined): WorkflowNodeRegistry {
  const defaults = DEFAULT_WORKFLOW_NODE_REGISTRY.nodes;
  if (!overrides?.nodes?.length) {
    return DEFAULT_WORKFLOW_NODE_REGISTRY;
  }

  const byId = new Map<string, WorkflowNodeDefinition>();
  for (const node of defaults) {
    byId.set(node.id, node);
  }

  for (const override of overrides.nodes) {
    const existing = byId.get(override.id);
    if (existing?.isBuiltin && override.isBuiltin) {
      // Admin extended a builtin — merge sections/fields
      byId.set(override.id, mergeBuiltinNode(existing, override));
    } else if (!override.isBuiltin) {
      byId.set(override.id, override);
    } else {
      byId.set(override.id, override);
    }
  }

  return {
    nodes: Array.from(byId.values()).filter((n) => n.isActive !== false),
    updatedAt: overrides.updatedAt ?? DEFAULT_WORKFLOW_NODE_REGISTRY.updatedAt,
  };
}

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

  return {
    ...builtin,
    ...override,
    isBuiltin: true,
    sections: Array.from(sectionMap.values()),
  };
}
