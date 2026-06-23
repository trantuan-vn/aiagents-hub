import type { Node } from "@xyflow/react";

import type { WorkflowNodeUIPlugin } from "./types";
import { agentUIPlugin } from "./agent";
import { memoryUIPlugin } from "./memory";
import { serviceUIPlugin } from "./service";
import { coreWebhookUIPlugin, webhookTriggerUIPlugin } from "./webhook";
import {
  ActionNode,
  AgentWorkflowNode,
  CoreNode,
  FlowNode,
  HumanReviewNode,
  MemoryWorkflowNode,
  ServiceWorkflowNode,
  ToolWorkflowNode,
  TransformNode,
  TriggerNode,
  workflowNodeTypes,
} from "./workflow-nodes";

export * from "./types";
export * from "./workflow-sticky-note-node";
export * from "./agent";
export * from "./memory";
export * from "./service";
export * from "./webhook";
// workflow-nodes exports are included below after plugin setup

function plugin(
  partial: Omit<WorkflowNodeUIPlugin, "Canvas"> & { Canvas?: WorkflowNodeUIPlugin["Canvas"] },
  Canvas: WorkflowNodeUIPlugin["Canvas"],
): WorkflowNodeUIPlugin {
  return { ...partial, Canvas };
}

/** Built-in UI plugins — catalog metadata + canvas components. */
export const BUILTIN_UI_PLUGINS: WorkflowNodeUIPlugin[] = [
  webhookTriggerUIPlugin,
  coreWebhookUIPlugin,
  agentUIPlugin,
  serviceUIPlugin,
  memoryUIPlugin,
  plugin(
    {
      id: "trigger",
      runtimeType: "trigger",
      catalog: { category: "trigger", labelKey: "node_trigger", descriptionKey: "node_trigger_desc", icon: "Play" },
    },
    TriggerNode,
  ),
  plugin(
    {
      id: "flow",
      runtimeType: "flow",
      catalog: { category: "flow", labelKey: "node_flow", descriptionKey: "node_flow_desc", icon: "GitBranch" },
    },
    FlowNode,
  ),
  plugin(
    {
      id: "core",
      runtimeType: "core",
      catalog: { category: "core", labelKey: "node_core", descriptionKey: "node_core_desc", icon: "Layers" },
    },
    CoreNode,
  ),
  plugin(
    {
      id: "human_review",
      runtimeType: "human_review",
      catalog: {
        category: "human",
        labelKey: "node_human_review",
        descriptionKey: "node_human_review_desc",
        icon: "UserCheck",
      },
    },
    HumanReviewNode,
  ),
  plugin(
    {
      id: "action_in_app",
      runtimeType: "action_in_app",
      catalog: { category: "action", labelKey: "node_action", descriptionKey: "node_action_desc", icon: "Zap" },
    },
    ActionNode,
  ),
  plugin(
    {
      id: "data_transformation",
      runtimeType: "data_transformation",
      catalog: {
        category: "transform",
        labelKey: "node_transform",
        descriptionKey: "node_transform_desc",
        icon: "Wrench",
      },
    },
    TransformNode,
  ),
  plugin(
    {
      id: "tool_node",
      runtimeType: "tool_node",
      catalog: { category: "tool", labelKey: "node_tool", descriptionKey: "node_tool_desc", icon: "Wrench", visible: false },
    },
    ToolWorkflowNode,
  ),
];

export type NodeCatalogCategory = WorkflowNodeUIPlugin["catalog"]["category"];

export type NodeCatalogEntry = {
  id: string;
  runtimeType: string;
  kind?: string;
  labelKey: string;
  descriptionKey?: string;
  icon?: string;
  keywords?: string[];
};

/** Catalog grouped by category — generated from UI plugins. */
export const NODE_CATALOG: Record<NodeCatalogCategory, NodeCatalogEntry[]> = BUILTIN_UI_PLUGINS.filter(
  (p) => p.catalog.visible !== false,
).reduce(
  (acc, plugin) => {
    const { category, labelKey, descriptionKey, icon, keywords } = plugin.catalog;
    const entry: NodeCatalogEntry = {
      id: plugin.id,
      runtimeType: plugin.runtimeType,
      kind: plugin.kind,
      labelKey,
      descriptionKey,
      icon,
      keywords,
    };
    acc[category] = [...(acc[category] ?? []), entry];
    return acc;
  },
  {} as Record<NodeCatalogCategory, NodeCatalogEntry[]>,
);

function kindFromNode(node: Node): string | undefined {
  const data = (node.data ?? {}) as Record<string, unknown>;
  if (typeof data.coreKind === "string") return data.coreKind;
  if (typeof data.flowKind === "string") return data.flowKind;
  if (typeof data.triggerKind === "string") return data.triggerKind;
  if (typeof data.toolKind === "string") return data.toolKind;
  return undefined;
}

/** Resolve the UI plugin for a canvas node (match → kind → runtimeType). */
export function resolveUIPlugin(node: Node | null | undefined): WorkflowNodeUIPlugin | undefined {
  if (!node?.type) return undefined;
  const matched = BUILTIN_UI_PLUGINS.find((p) => p.match?.(node));
  if (matched) return matched;
  const kind = kindFromNode(node);
  if (kind) {
    const byKind = BUILTIN_UI_PLUGINS.find((p) => p.runtimeType === node.type && p.kind === kind);
    if (byKind) return byKind;
    const byId = BUILTIN_UI_PLUGINS.find((p) => p.id === `${node.type}:${kind}`);
    if (byId) return byId;
  }
  return BUILTIN_UI_PLUGINS.find((p) => p.id === node.type || (p.runtimeType === node.type && !p.kind));
}

/** Resolve plugin by catalog/registry id. */
export function resolveUIPluginById(pluginId: string): WorkflowNodeUIPlugin | undefined {
  return BUILTIN_UI_PLUGINS.find((p) => p.id === pluginId);
}

/** Create node data for adding from catalog. */
export function createNodeDataFromPlugin(
  plugin: WorkflowNodeUIPlugin,
  label?: string,
): { type: string; data: Record<string, unknown> } {
  const defaults = plugin.defaults?.() ?? {};
  const data = label ? { ...defaults, label } : defaults;
  return { type: plugin.runtimeType, data };
}

export {
  ActionNode,
  AgentWorkflowNode,
  CoreNode,
  FlowNode,
  HumanReviewNode,
  MemoryWorkflowNode,
  ServiceWorkflowNode,
  ToolWorkflowNode,
  TransformNode,
  TriggerNode,
  workflowNodeTypes,
};
