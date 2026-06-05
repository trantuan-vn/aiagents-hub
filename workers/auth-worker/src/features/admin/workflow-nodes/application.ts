import {
  CreateWorkflowNodeSchema,
  UpdateWorkflowNodeSchema,
  type WorkflowNodeDefinition,
  type WorkflowNodeRegistry,
} from './domain';
import {
  loadRawOverrides,
  loadRegistry,
  mergeNodeRegistry,
  saveRegistry,
} from './infrastructure';

const now = () => new Date().toISOString();

export function createWorkflowNodeApplicationService(env: Env) {
  const kv = env.SYSTEM_CONFIG_KV;

  return {
    async getRegistry(): Promise<WorkflowNodeRegistry> {
      return loadRegistry(kv);
    },

    async createNode(input: unknown): Promise<WorkflowNodeDefinition> {
      const parsed = CreateWorkflowNodeSchema.parse(input);
      if (parsed.isBuiltin) {
        throw new Error('Cannot create built-in node types');
      }
      const overrides = await loadRawOverrides(kv);
      if (overrides.nodes.some((n) => n.id === parsed.id)) {
        throw new Error('Node id already exists');
      }
      const node: WorkflowNodeDefinition = {
        ...parsed,
        isBuiltin: false,
        isActive: parsed.isActive ?? true,
        createdAt: now(),
        updatedAt: now(),
      };
      const next: WorkflowNodeRegistry = {
        nodes: [...overrides.nodes, node],
        updatedAt: now(),
      };
      await saveRegistry(kv, next);
      return node;
    },

    async updateNode(id: string, input: unknown): Promise<WorkflowNodeDefinition> {
      const parsed = UpdateWorkflowNodeSchema.parse(input);
      const overrides = await loadRawOverrides(kv);
      const merged = mergeNodeRegistry(overrides);
      const existing = merged.nodes.find((n) => n.id === id);
      if (!existing) throw new Error('Node not found');

      const updated: WorkflowNodeDefinition = {
        ...existing,
        ...parsed,
        id,
        isBuiltin: existing.isBuiltin,
        updatedAt: now(),
      };

      const overrideIdx = overrides.nodes.findIndex((n) => n.id === id);
      const nextOverrides = [...overrides.nodes];
      if (existing.isBuiltin) {
        const overrideEntry: WorkflowNodeDefinition = {
          ...updated,
          isBuiltin: true,
        };
        if (overrideIdx >= 0) nextOverrides[overrideIdx] = overrideEntry;
        else nextOverrides.push(overrideEntry);
      } else if (overrideIdx >= 0) {
        nextOverrides[overrideIdx] = updated;
      }

      await saveRegistry(kv, { nodes: nextOverrides, updatedAt: now() });
      return updated;
    },

    async deleteNode(id: string): Promise<void> {
      const overrides = await loadRawOverrides(kv);
      const merged = mergeNodeRegistry(overrides);
      const existing = merged.nodes.find((n) => n.id === id);
      if (!existing) throw new Error('Node not found');
      if (existing.isBuiltin) throw new Error('Cannot delete built-in nodes; deactivate instead');

      const nextOverrides = overrides.nodes.filter((n) => n.id !== id);
      await saveRegistry(kv, { nodes: nextOverrides, updatedAt: now() });
    },
  };
}
