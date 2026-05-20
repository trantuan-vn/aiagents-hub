"use client";

import { useCallback, useEffect, useRef } from "react";

import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { workflowNodeTypes } from "./workflow-nodes";

export interface WorkflowDefinition {
  nodes: Node[];
  edges: Edge[];
  viewport?: { x: number; y: number; zoom: number };
}

interface WorkflowCanvasProps {
  initial?: WorkflowDefinition;
  onChange?: (def: WorkflowDefinition) => void;
  readOnly?: boolean;
}

/** Strip React Flow runtime fields so parent JSON stays stable across emit cycles. */
export function toPersistedDefinition(
  nodes: Node[],
  edges: Edge[],
  viewport?: WorkflowDefinition["viewport"],
): WorkflowDefinition {
  return {
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.type,
      position: n.position ?? { x: 0, y: 0 },
      data: n.data ?? {},
    })),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle,
      targetHandle: e.targetHandle,
    })),
    viewport,
  };
}

function persistedSignature(nodes: Node[], edges: Edge[]): string {
  return JSON.stringify(toPersistedDefinition(nodes, edges));
}

const READONLY_FLOW_PROPS = {
  onNodesChange: undefined,
  onEdgesChange: undefined,
  onConnect: undefined,
  onNodeDragStop: undefined,
  onNodesDelete: undefined,
  onEdgesDelete: undefined,
  nodesDraggable: false,
  nodesConnectable: false,
  elementsSelectable: false,
} as const;

function useWorkflowCanvasState(
  initial: WorkflowDefinition | undefined,
  onChange?: WorkflowCanvasProps["onChange"],
  readOnly?: boolean,
) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initial?.nodes ?? []);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial?.edges ?? []);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const lastEmittedRef = useRef("");
  const viewportRef = useRef(initial?.viewport);
  viewportRef.current = initial?.viewport;

  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const edgesRef = useRef(edges);
  edgesRef.current = edges;

  const pushToParent = useCallback(() => {
    if (readOnly) return;
    const n = nodesRef.current;
    const e = edgesRef.current;
    const sig = persistedSignature(n, e);
    if (sig === lastEmittedRef.current) return;
    lastEmittedRef.current = sig;
    onChangeRef.current?.(toPersistedDefinition(n, e, viewportRef.current));
  }, [readOnly]);

  // Merge nodes/edges added via palette (parent JSON) without resetting positions while dragging.
  useEffect(() => {
    const extNodes = initial?.nodes ?? [];
    const localNodeIdSet = new Set(nodes.map((n) => n.id));
    const missingNodes = extNodes.filter((n) => !localNodeIdSet.has(n.id));
    if (missingNodes.length > 0) {
      setNodes((nds) => {
        const merged = [...nds, ...missingNodes];
        lastEmittedRef.current = persistedSignature(merged, edgesRef.current);
        return merged;
      });
    }

    const extEdges = initial?.edges ?? [];
    const localEdgeIdSet = new Set(edges.map((e) => e.id));
    const missingEdges = extEdges.filter((e) => !localEdgeIdSet.has(e.id));
    if (missingEdges.length > 0) {
      setEdges((eds) => {
        const merged = [...eds, ...missingEdges];
        lastEmittedRef.current = persistedSignature(nodesRef.current, merged);
        return merged;
      });
    }
  }, [initial?.nodes, initial?.edges, nodes, edges, setNodes, setEdges]);

  const onNodeDragStop = useCallback(() => {
    pushToParent();
  }, [pushToParent]);

  const onNodesDelete = useCallback((deleted: Node[]) => {
    const deletedIds = new Set(deleted.map((n) => n.id));
    const nextNodes = nodesRef.current.filter((n) => !deletedIds.has(n.id));
    const nextEdges = edgesRef.current.filter((e) => !deletedIds.has(e.source) && !deletedIds.has(e.target));
    nodesRef.current = nextNodes;
    edgesRef.current = nextEdges;
    lastEmittedRef.current = persistedSignature(nextNodes, nextEdges);
    onChangeRef.current?.(toPersistedDefinition(nextNodes, nextEdges, viewportRef.current));
  }, []);

  const onEdgesDelete = useCallback((deleted: Edge[]) => {
    const deletedIds = new Set(deleted.map((e) => e.id));
    const nextEdges = edgesRef.current.filter((e) => !deletedIds.has(e.id));
    edgesRef.current = nextEdges;
    lastEmittedRef.current = persistedSignature(nodesRef.current, nextEdges);
    onChangeRef.current?.(toPersistedDefinition(nodesRef.current, nextEdges, viewportRef.current));
  }, []);

  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) => {
        const next = addEdge({ ...params, animated: true }, eds);
        edgesRef.current = next;
        lastEmittedRef.current = persistedSignature(nodesRef.current, next);
        onChangeRef.current?.(toPersistedDefinition(nodesRef.current, next, viewportRef.current));
        return next;
      });
    },
    [setEdges],
  );

  return {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    onNodeDragStop,
    onNodesDelete,
    onEdgesDelete,
  };
}

function CanvasInner({ initial, onChange, readOnly }: WorkflowCanvasProps) {
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect, onNodeDragStop, onNodesDelete, onEdgesDelete } =
    useWorkflowCanvasState(initial, onChange, readOnly);

  const interactionProps = readOnly
    ? READONLY_FLOW_PROPS
    : {
        onNodesChange,
        onEdgesChange,
        onConnect,
        onNodeDragStop,
        onNodesDelete,
        onEdgesDelete,
        nodesDraggable: true,
        nodesConnectable: true,
        elementsSelectable: true,
      };

  return (
    <div className="bg-muted/20 h-[min(70vh,640px)] w-full rounded-xl border">
      <ReactFlow
        className="h-full w-full"
        nodes={nodes}
        edges={edges}
        nodeTypes={workflowNodeTypes}
        fitView={nodes.length > 0}
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
        {...interactionProps}
      >
        <Background gap={16} size={1} />
        <Controls />
        <MiniMap zoomable pannable className="!bg-card" />
      </ReactFlow>
    </div>
  );
}

export function WorkflowCanvas(props: WorkflowCanvasProps) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}

export function addNodeToDefinition(
  def: WorkflowDefinition,
  type: string,
  label: string,
  extraData?: Record<string, unknown>,
): WorkflowDefinition {
  const id = `${type}-${Date.now()}`;
  const node: Node = {
    id,
    type,
    position: { x: 120 + def.nodes.length * 40, y: 80 + def.nodes.length * 30 },
    data: { label, ...extraData },
  };
  return { ...def, nodes: [...def.nodes, node] };
}
