import { addEdge, type Connection, type Edge, type Node } from "@xyflow/react";

import type { ConnectedNodeSide } from "./workflow-canvas-ui-context";
import { type WorkflowHandleId } from "./workflow-connection-utils";
import { normalizeWorkflowEdge } from "./workflow-edge-utils";

const CONNECT_OFFSET_X = 280;
const RESOURCE_OFFSET_Y = 130;
const RESOURCE_HANDLE_OFFSET_X: Record<string, number> = {
  service: -110,
  memory: 0,
  tools: 110,
};

export type CreateConnectedNodeArgs = {
  fromNodeId: string;
  side: ConnectedNodeSide | "resource";
  type: string;
  label: string;
  resourceHandle?: WorkflowHandleId;
  extraData?: Record<string, unknown>;
};

function buildExtraData(
  type: string,
  serviceEndpoint: string | undefined,
  extraData?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (extraData) return extraData;
  if (type === "agent" && serviceEndpoint) {
    return { serviceEndpoint, memoryCollection: "vectorize-default", tools: [] };
  }
  if (type === "service_node" && serviceEndpoint) {
    return { serviceEndpoint, catalogId: serviceEndpoint };
  }
  return undefined;
}

function buildResourcePlacement(
  fromNode: Node,
  handle: WorkflowHandleId,
): { position: { x: number; y: number }; connection: Connection } {
  return {
    position: {
      x: fromNode.position.x + (RESOURCE_HANDLE_OFFSET_X[handle] ?? 0),
      y: fromNode.position.y + RESOURCE_OFFSET_Y,
    },
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
): { position: { x: number; y: number }; connection: Connection } {
  const position =
    side === "right"
      ? { x: fromNode.position.x + CONNECT_OFFSET_X, y: fromNode.position.y }
      : { x: fromNode.position.x - CONNECT_OFFSET_X, y: fromNode.position.y };
  const connection: Connection =
    side === "right"
      ? { source: fromNode.id, sourceHandle: "out", target: newId, targetHandle: "in" }
      : { source: newId, sourceHandle: "out", target: fromNode.id, targetHandle: "in" };
  return { position, connection };
}

export function applyCreateConnectedNode(
  nodes: Node[],
  edges: Edge[],
  args: CreateConnectedNodeArgs,
  serviceEndpoint?: string,
): { nodes: Node[]; edges: Edge[] } | null {
  const fromNode = nodes.find((n) => n.id === args.fromNodeId);
  if (!fromNode) return null;

  const newId = `${args.type}-${Date.now()}`;
  let position: { x: number; y: number };
  let conn: Connection;

  if (args.side === "resource" && args.resourceHandle) {
    const resource = buildResourcePlacement(fromNode, args.resourceHandle);
    position = resource.position;
    conn = { ...resource.connection, source: newId };
  } else if (args.side === "left" || args.side === "right") {
    const flow = buildFlowPlacement(fromNode, args.side, newId);
    position = flow.position;
    conn = flow.connection;
  } else {
    return null;
  }

  const data = buildExtraData(args.type, serviceEndpoint, args.extraData);
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
