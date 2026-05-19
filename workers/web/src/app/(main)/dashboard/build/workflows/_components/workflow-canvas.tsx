"use client";

import { useCallback } from "react";

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

function CanvasInner({ initial, onChange, readOnly }: WorkflowCanvasProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initial?.nodes ?? []);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial?.edges ?? []);

  const emit = useCallback(
    (n: Node[], e: Edge[]) => {
      onChange?.({ nodes: n, edges: e, viewport: initial?.viewport });
    },
    [onChange, initial?.viewport],
  );

  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) => {
        const next = addEdge({ ...params, animated: true }, eds);
        emit(nodes, next);
        return next;
      });
    },
    [setEdges, nodes, emit],
  );

  const handleNodesChange = useCallback(
    (...args: Parameters<typeof onNodesChange>) => {
      onNodesChange(...args);
      setNodes((n) => {
        emit(n, edges);
        return n;
      });
    },
    [onNodesChange, setNodes, edges, emit],
  );

  return (
    <div className="bg-muted/20 h-[min(70vh,640px)] w-full rounded-xl border">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={readOnly ? undefined : handleNodesChange}
        onEdgesChange={readOnly ? undefined : onEdgesChange}
        onConnect={readOnly ? undefined : onConnect}
        nodeTypes={workflowNodeTypes}
        fitView
        proOptions={{ hideAttribution: true }}
        nodesDraggable={!readOnly}
        nodesConnectable={!readOnly}
        elementsSelectable={!readOnly}
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
