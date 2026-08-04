import type { Node } from "@xyflow/react";

import type { WorkflowNodeUIPlugin } from "./types";
import { actionInAppUIPlugin } from "./action-in-app";
import { agentUIPlugin } from "./agent";
import { coreUIPlugin } from "./core";
import { dataTransformationUIPlugin } from "./data-transformation";
import { flowUIPlugin } from "./flow";
import { formTriggerUIPlugin } from "./form";
import { humanReviewUIPlugin } from "./human-review";
import { memoryUIPlugin } from "./memory";
import { serviceUIPlugin } from "./service";
import { stickyNoteUIPlugin } from "./sticky-note";
import { toolUIPlugin } from "./tool";
import { triggerUIPlugin } from "./trigger";
import { coreWebhookUIPlugin, webhookTriggerUIPlugin } from "./webhook";
import { workflowGroupUIPlugin } from "./workflow-group";

export * from "./types";
export * from "./agent";
export * from "./form";
export * from "./memory";
export * from "./service";
export * from "./webhook";
export * from "./trigger";
export * from "./flow";
export * from "./core";
export * from "./human-review";
export * from "./action-in-app";
export * from "./data-transformation";
export * from "./tool";
export * from "./sticky-note";
export * from "./workflow-group";

/** Built-in UI plugins — catalog metadata + canvas components. */
export const BUILTIN_UI_PLUGINS: WorkflowNodeUIPlugin[] = [
  webhookTriggerUIPlugin,
  coreWebhookUIPlugin,
  formTriggerUIPlugin,
  triggerUIPlugin,
  agentUIPlugin,
  serviceUIPlugin,
  memoryUIPlugin,
  flowUIPlugin,
  coreUIPlugin,
  humanReviewUIPlugin,
  actionInAppUIPlugin,
  dataTransformationUIPlugin,
  toolUIPlugin,
  stickyNoteUIPlugin,
  workflowGroupUIPlugin,
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

/** React Flow nodeTypes map — first plugin Canvas wins per runtimeType. */
export const workflowNodeTypes: Record<string, WorkflowNodeUIPlugin["Canvas"]> = {};
for (const plugin of BUILTIN_UI_PLUGINS) {
  if (!workflowNodeTypes[plugin.runtimeType]) {
    workflowNodeTypes[plugin.runtimeType] = plugin.Canvas;
  }
}

export {
  ActionNode,
  AgentWorkflowNode,
  CoreNode,
  FlowNode,
  HumanReviewNode,
  MemoryWorkflowNode,
  ServiceWorkflowNode,
  StickyNoteNode,
  ToolWorkflowNode,
  TransformNode,
  TriggerNode,
  WorkflowGroupNode,
} from "./workflow-nodes";
