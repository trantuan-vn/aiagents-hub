"use client";

import { useCallback, useMemo, useRef } from "react";

import { Background, ReactFlow, ReactFlowProvider, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "./workflow-canvas-theme.css";

import { cn } from "@/lib/utils";
import { usePreferencesStore } from "@/stores/preferences/preferences-provider";

import { useWorkflowCanvasState } from "./use-workflow-canvas-state";
import { WorkflowCanvasExecutePanel } from "./workflow-canvas-execute-panel";
import { WorkflowCanvasMinimap } from "./workflow-canvas-minimap";
import { WorkflowCanvasSideToolbar } from "./workflow-canvas-side-toolbar";
import { WorkflowCanvasTidyBridge } from "./workflow-canvas-ui-bridge";
import { WorkflowCanvasUiContext } from "./workflow-canvas-ui-context";
import { toPersistedDefinition, type WorkflowDefinition } from "./workflow-definition";
import { WorkflowDeletableEdge } from "./workflow-deletable-edge";
import { WorkflowEdgeMarkers } from "./workflow-edge-markers";
import { WORKFLOW_EDGE_MARKER_END, WORKFLOW_EDGE_STYLE } from "./workflow-edge-utils";
import { workflowNodeTypes } from "./workflow-nodes";

export type { WorkflowDefinition };
export { toPersistedDefinition };

const workflowEdgeTypes = {
  workflowDeletable: WorkflowDeletableEdge,
};

interface WorkflowCanvasProps {
  initial?: WorkflowDefinition;
  onChange?: (def: WorkflowDefinition) => void;
  readOnly?: boolean;
  serviceEndpoint?: string;
  onExecute?: () => void;
  className?: string;
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

function CanvasInner({
  initial,
  onChange,
  readOnly,
  serviceEndpoint,
  onExecute,
  className,
}: WorkflowCanvasProps) {
  const themeMode = usePreferencesStore((s) => s.themeMode);
  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    onNodeDragStop,
    onNodesDelete,
    onEdgesDelete,
    createConnectedNode,
    deleteEdgeById,
    deleteNodeById,
    toggleNodeActive,
    onNodeMenuAction,
    tidyLayout,
    isValidConnection,
  } = useWorkflowCanvasState(initial, onChange, readOnly, serviceEndpoint);

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
        isValidConnection,
      };

  const tidyWithFitRef = useRef<(() => void) | undefined>(undefined);
  const onTidyWithFitReady = useCallback((fn: (() => void) | undefined) => {
    tidyWithFitRef.current = fn;
  }, []);

  const uiValue = useMemo(
    () => ({
      readOnly: !!readOnly,
      createConnectedNode: readOnly ? undefined : createConnectedNode,
      deleteEdge: readOnly ? undefined : deleteEdgeById,
      deleteNode: readOnly ? undefined : deleteNodeById,
      toggleNodeActive: readOnly ? undefined : toggleNodeActive,
      runNode: readOnly ? undefined : (nodeId: string) => onNodeMenuAction(nodeId, "execute_step"),
      onNodeMenuAction: readOnly ? undefined : onNodeMenuAction,
      tidyLayout: readOnly ? undefined : () => tidyWithFitRef.current?.(),
    }),
    [readOnly, createConnectedNode, deleteEdgeById, deleteNodeById, toggleNodeActive, onNodeMenuAction],
  );

  return (
    <WorkflowCanvasUiContext.Provider value={uiValue}>
      <div className={cn("workflow-canvas-surface dark:bg-muted/15 h-full w-full bg-[#f9f9f9]", className)}>
        <ReactFlow
          className="h-full w-full"
          colorMode={themeMode}
          nodes={nodes}
          edges={edges}
          nodeTypes={workflowNodeTypes}
          edgeTypes={workflowEdgeTypes}
          defaultEdgeOptions={{
            type: "workflowDeletable",
            animated: true,
            markerEnd: WORKFLOW_EDGE_MARKER_END,
            style: WORKFLOW_EDGE_STYLE,
          }}
          fitView={nodes.length > 0}
          fitViewOptions={{ padding: 0.2 }}
          proOptions={{ hideAttribution: true }}
          {...interactionProps}
        >
          <WorkflowEdgeMarkers />
          <Background gap={20} size={1} />
          <WorkflowCanvasTidyBridge
            readOnly={readOnly}
            tidyLayout={tidyLayout}
            onTidyWithFitReady={onTidyWithFitReady}
          />
          {onExecute ? <WorkflowCanvasExecutePanel onExecute={onExecute} /> : null}
          <WorkflowCanvasSideToolbar />
          <WorkflowCanvasMinimap />
        </ReactFlow>
      </div>
    </WorkflowCanvasUiContext.Provider>
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

export function addStickyNoteToDefinition(def: WorkflowDefinition): WorkflowDefinition {
  const id = `sticky_note-${Date.now()}`;
  const node: Node = {
    id,
    type: "sticky_note",
    position: { x: 160 + def.nodes.length * 24, y: 120 + def.nodes.length * 24 },
    data: { text: "" },
    draggable: true,
    selectable: true,
  };
  return { ...def, nodes: [...def.nodes, node] };
}
