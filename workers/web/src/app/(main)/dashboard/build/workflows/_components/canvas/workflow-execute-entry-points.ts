import type { Edge, Node } from "@xyflow/react";

import {
  WORKFLOW_TRIGGER_CATALOG,
  type WorkflowTriggerKindId,
} from "../catalogs/workflow-trigger-catalog";
import { isDataFlowEdge } from "../edges/workflow-connection-utils";

export type WorkflowExecuteEntryPoint = {
  nodeId: string;
  kind: WorkflowTriggerKindId | "manual";
  nodeLabel: string;
};

const NON_EXECUTABLE_TYPES = new Set(["service_node", "memory_node", "tool_node", "sticky_note", "workflow_group"]);

const TRIGGER_KINDS = new Set<WorkflowTriggerKindId>(
  WORKFLOW_TRIGGER_CATALOG.map((item) => item.id),
);

/** Core nodes that act as workflow triggers when placed at the graph root. */
const CORE_KIND_AS_TRIGGER: Partial<Record<string, WorkflowTriggerKindId>> = {
  webhook: "webhook",
};

function nodeData(node: Node): Record<string, unknown> {
  return (node.data ?? {}) as Record<string, unknown>;
}

function isWebhookLikeNode(node: Node): boolean {
  const data = nodeData(node);
  return data.coreKind === "webhook" || data.triggerKind === "webhook" || node.type === "webhook";
}

function resolveTriggerKind(node: Node): WorkflowTriggerKindId | "manual" | null {
  const data = nodeData(node);

  if (typeof data.triggerKind === "string" && TRIGGER_KINDS.has(data.triggerKind as WorkflowTriggerKindId)) {
    return data.triggerKind as WorkflowTriggerKindId;
  }

  if (typeof data.coreKind === "string") {
    const mapped = CORE_KIND_AS_TRIGGER[data.coreKind];
    if (mapped) return mapped;
  }

  if (isWebhookLikeNode(node)) return "webhook";

  return null;
}

function nodeLabel(node: Node): string {
  const label = nodeData(node).label;
  return typeof label === "string" && label.trim() ? label.trim() : "";
}

function isExecutableNode(node: Node): boolean {
  return !NON_EXECUTABLE_TYPES.has(node.type ?? "");
}

export function isWorkflowTriggerNode(node: Node): boolean {
  if (node.type === "trigger") return true;
  return resolveTriggerKind(node) != null;
}

/** Executable nodes with no incoming data-flow edges (workflow entry points). */
export function getWorkflowEntryNodeIds(nodes: Node[], edges: Edge[]): string[] {
  const hasIncoming = new Set(edges.filter(isDataFlowEdge).map((edge) => edge.target));
  return nodes.filter(isExecutableNode).filter((node) => !hasIncoming.has(node.id)).map((node) => node.id);
}

/** Trigger nodes that start a flow (no incoming data-flow edges). */
export function getWorkflowTriggerEntryPoints(nodes: Node[], edges: Edge[]): WorkflowExecuteEntryPoint[] {
  const entryNodeIds = getWorkflowEntryNodeIds(nodes, edges);
  const entryNodes = entryNodeIds
    .map((id) => nodes.find((node) => node.id === id))
    .filter((node): node is Node => node != null);

  const triggerEntries = entryNodes
    .filter(isWorkflowTriggerNode)
    .map((node) => ({
      nodeId: node.id,
      kind: resolveTriggerKind(node) ?? "manual",
      nodeLabel: nodeLabel(node),
    }));

  if (triggerEntries.length > 0) return triggerEntries;

  const firstEntry = entryNodes[0];
  if (!firstEntry) return [];

  return [
    {
      nodeId: firstEntry.id,
      kind: "manual",
      nodeLabel: nodeLabel(firstEntry),
    },
  ];
}

export function pickDefaultEntryPoint(points: WorkflowExecuteEntryPoint[]): WorkflowExecuteEntryPoint | null {
  const webhook = points.find((point) => point.kind === "webhook");
  if (webhook) return webhook;
  return points[0] ?? null;
}

export function entryPointNeedsNodeLabel(
  points: WorkflowExecuteEntryPoint[],
  kind: WorkflowTriggerKindId | "manual",
): boolean {
  return points.filter((point) => point.kind === kind).length > 1;
}
