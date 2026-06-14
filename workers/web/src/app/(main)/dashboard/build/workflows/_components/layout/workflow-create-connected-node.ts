import { addEdge, type Connection, type Edge, type Node } from "@xyflow/react";

import type { ConnectedNodeSide } from "../canvas/workflow-canvas-ui-context";
import { isResourceEdge, type WorkflowHandleId } from "../edges/workflow-connection-utils";
import { normalizeWorkflowEdge } from "../edges/workflow-edge-utils";
import { WORKFLOW_CONNECT_OFFSET_X } from "./workflow-placement-constants";
import { computeNewResourceNodePosition } from "./workflow-resource-layout";
import { buildVectorizeNodeData } from "./vectorize-node-data";
import { TOOL_KIND_DEFAULTS } from "@aiagents-hub/workflow-nodes";

const RESOURCE_NODE_TYPES = new Set(["service_node", "memory_node", "tool_node"]);

export type CreateConnectedNodeArgs = {
  fromNodeId: string;
  side: ConnectedNodeSide | "resource";
  type: string;
  label: string;
  resourceHandle?: WorkflowHandleId;
  /** Source handle when connecting from a branch output (true/false/case_N). */
  sourceHandle?: WorkflowHandleId;
  extraData?: Record<string, unknown>;
};

function buildExtraData(
  type: string,
  serviceEndpoint: string | undefined,
  extraData?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (extraData) return extraData;
  if (type === "agent" && serviceEndpoint) {
    return { serviceEndpoint, tools: [] };
  }
  if (type === "service_node" && serviceEndpoint) {
    return { endpoint: serviceEndpoint, serviceEndpoint, catalogId: serviceEndpoint };
  }
  return undefined;
}

function existingResourcesForAgent(nodes: Node[], edges: Edge[], agentId: string): Node[] {
  const resourceIds = new Set(
    edges.filter((edge) => isResourceEdge(edge) && edge.target === agentId).map((edge) => edge.source),
  );
  return nodes.filter((node) => resourceIds.has(node.id) && RESOURCE_NODE_TYPES.has(node.type ?? ""));
}

function buildResourcePlacement(
  fromNode: Node,
  handle: WorkflowHandleId,
  nodes: Node[],
  edges: Edge[],
  newId: string,
  newType: string,
): { position: { x: number; y: number }; connection: Connection } {
  const newNode: Node = { id: newId, type: newType, position: { x: 0, y: 0 }, data: {} };
  const siblings = existingResourcesForAgent(nodes, edges, fromNode.id);
  const position = computeNewResourceNodePosition(fromNode, siblings, newNode);

  return {
    position,
    connection: {
      source: "",
      sourceHandle: handle,
      target: fromNode.id,
      targetHandle: handle,
    },
  };
}

function buildFlowPlacement(
  fromNode: Node,
  side: ConnectedNodeSide,
  newId: string,
  sourceHandle: WorkflowHandleId = "out",
): { position: { x: number; y: number }; connection: Connection } {
  const position =
    side === "right"
      ? { x: fromNode.position.x + WORKFLOW_CONNECT_OFFSET_X, y: fromNode.position.y }
      : { x: fromNode.position.x - WORKFLOW_CONNECT_OFFSET_X, y: fromNode.position.y };
  const connection: Connection =
    side === "right"
      ? { source: fromNode.id, sourceHandle, target: newId, targetHandle: "in" }
      : { source: newId, sourceHandle: "out", target: fromNode.id, targetHandle: "in" };
  return { position, connection };
}

export function applyCreateConnectedNode(
  nodes: Node[],
  edges: Edge[],
  args: CreateConnectedNodeArgs,
  serviceEndpoint?: string,
  workflowId?: number,
): { nodes: Node[]; edges: Edge[] } | null {
  const fromNode = nodes.find((n) => n.id === args.fromNodeId);
  if (!fromNode) return null;

  const newId = `${args.type}-${Date.now()}`;
  let position: { x: number; y: number };
  let conn: Connection;

  if (args.side === "resource" && args.resourceHandle) {
    const resource = buildResourcePlacement(fromNode, args.resourceHandle, nodes, edges, newId, args.type);
    position = resource.position;
    conn = { ...resource.connection, source: newId };
  } else if (args.side === "left" || args.side === "right") {
    const flow = buildFlowPlacement(fromNode, args.side, newId, args.sourceHandle ?? "out");
    position = flow.position;
    conn = flow.connection;
  } else {
    return null;
  }

  const vectorizeDefaults =
    args.type === "memory_node"
      ? buildVectorizeNodeData(workflowId, newId, args.label)
      : undefined;
  const toolKind = typeof args.extraData?.toolKind === "string" ? args.extraData.toolKind : undefined;
  const toolDefaults =
    args.type === "tool_node" && toolKind ? TOOL_KIND_DEFAULTS[toolKind] : undefined;
  const data = buildExtraData(args.type, serviceEndpoint, {
    ...toolDefaults,
    ...vectorizeDefaults,
    ...args.extraData,
  });
  const newNode: Node = {
    id: newId,
    type: args.type,
    position,
    data: { label: args.label, ...data },
  };

  const nextEdges = addEdge(
    normalizeWorkflowEdge({
      ...conn,
      animated: true,
      style: args.side === "resource" ? { strokeDasharray: "6 4" } : undefined,
    }),
    edges,
  );

  return { nodes: [...nodes, newNode], edges: nextEdges };
}
