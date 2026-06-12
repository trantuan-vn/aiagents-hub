"use client";

import { memo, useCallback, useMemo, useRef, useState, type MutableRefObject } from "react";

import { Background, ReactFlow, ReactFlowProvider, type Edge, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "./workflow-canvas-theme.css";

import { cn } from "@/lib/utils";
import { usePreferencesStore } from "@/stores/preferences/preferences-provider";

import { useWorkflowCanvasState } from "./use-workflow-canvas-state";
import { WorkflowCanvasExecutePanel } from "./workflow-canvas-execute-panel";
import { WorkflowCanvasEmptyState } from "./workflow-canvas-empty-state";
import { WorkflowCanvasMinimap } from "./workflow-canvas-minimap";
import { useWorkflowAddNodeDrawerActions } from "./workflow-add-node-drawer-context";
import { WorkflowCanvasSideToolbar } from "./workflow-canvas-side-toolbar";
import { WorkflowCanvasInitialFit } from "./workflow-canvas-initial-fit";
import { WorkflowCanvasTidyBridge } from "./workflow-canvas-ui-bridge";
import { useWorkflowCanvasUi, WorkflowCanvasUiContext } from "./workflow-canvas-ui-context";
import { toPersistedDefinition, type WorkflowDefinition } from "./workflow-definition";
import { WorkflowDeletableEdge } from "./workflow-deletable-edge";
import { WorkflowEdgeMarkers } from "./workflow-edge-markers";
import { WORKFLOW_EDGE_MARKER_END, WORKFLOW_EDGE_STYLE } from "./workflow-edge-utils";
import { WorkflowNodeConfigPanel } from "./panels/node-config/workflow-node-config-panel";
import { createNodeDataFromPlugin, resolveUIPluginById, workflowNodeTypes } from "./nodes";
import { webhookNodeDefaults } from "./nodes/webhook/defaults";
import { warnLegacyRuntimeType } from "../_lib/runtime-type";

export type { WorkflowDefinition };
export { toPersistedDefinition };

const workflowEdgeTypes = {
  workflowDeletable: WorkflowDeletableEdge,
};

interface WorkflowCanvasProps {
  initial?: WorkflowDefinition;
  onChange?: (def: WorkflowDefinition) => void;
  definitionSyncKey?: number;
  readOnly?: boolean;
  serviceEndpoint?: string;
  workflowId?: number;
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
  definitionSyncKey,
  readOnly,
  serviceEndpoint,
  workflowId,
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
    patchNodeDataById,
    toggleNodeActive,
    onNodeMenuAction,
    tidyLayout,
    isValidConnection,
  } = useWorkflowCanvasState(initial, onChange, readOnly, serviceEndpoint, definitionSyncKey);

  const interactionProps = useMemo(
    () =>
      readOnly
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
          },
    [
      readOnly,
      onNodesChange,
      onEdgesChange,
      onConnect,
      onNodeDragStop,
      onNodesDelete,
      onEdgesDelete,
      isValidConnection,
    ],
  );

  const tidyWithFitRef = useRef<(() => void) | undefined>(undefined);
  const onTidyWithFitReady = useCallback((fn: (() => void) | undefined) => {
    tidyWithFitRef.current = fn;
  }, []);

  return (
    <CanvasInnerWithDrawerUi
      className={className}
      themeMode={themeMode}
      nodes={nodes}
      edges={edges}
      interactionProps={interactionProps}
      readOnly={readOnly}
      workflowId={workflowId}
      tidyLayout={tidyLayout}
      onTidyWithFitReady={onTidyWithFitReady}
      onExecute={onExecute}
      createConnectedNode={createConnectedNode}
      deleteEdgeById={deleteEdgeById}
      deleteNodeById={deleteNodeById}
      patchNodeDataById={patchNodeDataById}
      toggleNodeActive={toggleNodeActive}
      onNodeMenuAction={onNodeMenuAction}
      tidyWithFitRef={tidyWithFitRef}
    />
  );
}

function CanvasInnerWithDrawerUi({
  className,
  themeMode,
  nodes,
  edges,
  interactionProps,
  readOnly,
  workflowId,
  tidyLayout,
  onTidyWithFitReady,
  onExecute,
  createConnectedNode,
  deleteEdgeById,
  deleteNodeById,
  patchNodeDataById,
  toggleNodeActive,
  onNodeMenuAction,
  tidyWithFitRef,
}: {
  className?: string;
  themeMode: "light" | "dark" | "system";
  nodes: WorkflowDefinition["nodes"];
  edges: Edge[];
  interactionProps: Record<string, unknown>;
  readOnly?: boolean;
  workflowId?: number;
  tidyLayout: () => void;
  onTidyWithFitReady: (fn: (() => void) | undefined) => void;
  onExecute?: () => void;
  createConnectedNode: ReturnType<typeof useWorkflowCanvasState>["createConnectedNode"];
  deleteEdgeById: ReturnType<typeof useWorkflowCanvasState>["deleteEdgeById"];
  deleteNodeById: ReturnType<typeof useWorkflowCanvasState>["deleteNodeById"];
  patchNodeDataById: ReturnType<typeof useWorkflowCanvasState>["patchNodeDataById"];
  toggleNodeActive: ReturnType<typeof useWorkflowCanvasState>["toggleNodeActive"];
  onNodeMenuAction: ReturnType<typeof useWorkflowCanvasState>["onNodeMenuAction"];
  tidyWithFitRef: MutableRefObject<(() => void) | undefined>;
}) {
  const { open, close } = useWorkflowAddNodeDrawerActions();
  const [configNodeId, setConfigNodeId] = useState<string | null>(null);

  const onMenuActionWrapped = useCallback(
    (nodeId: string, action: string) => {
      if (action === "open") {
        setConfigNodeId(nodeId);
        return;
      }
      onNodeMenuAction(nodeId, action);
    },
    [onNodeMenuAction],
  );

  const configNode = configNodeId ? nodes.find((n) => n.id === configNodeId) : undefined;

  const uiValue = useMemo(
    () => ({
      readOnly: !!readOnly,
      createConnectedNode: readOnly ? undefined : createConnectedNode,
      deleteEdge: readOnly ? undefined : deleteEdgeById,
      deleteNode: readOnly ? undefined : deleteNodeById,
      patchNodeData: readOnly ? undefined : patchNodeDataById,
      toggleNodeActive: readOnly ? undefined : toggleNodeActive,
      runNode: readOnly ? undefined : (nodeId: string) => onMenuActionWrapped(nodeId, "execute_step"),
      onNodeMenuAction: readOnly ? undefined : onMenuActionWrapped,
      tidyLayout: readOnly ? undefined : () => tidyWithFitRef.current?.(),
      openAddNodeDrawer: readOnly ? undefined : open,
      closeAddNodeDrawer: readOnly ? undefined : close,
      openNodeConfig: readOnly ? undefined : (nodeId: string) => setConfigNodeId(nodeId),
    }),
    [
      readOnly,
      createConnectedNode,
      deleteEdgeById,
      deleteNodeById,
      patchNodeDataById,
      toggleNodeActive,
      onMenuActionWrapped,
      open,
      close,
      tidyWithFitRef,
    ],
  );

  return (
    <WorkflowCanvasUiContext.Provider value={uiValue}>
      <CanvasSurface
        className={className}
        themeMode={themeMode}
        nodes={nodes}
        edges={edges}
        interactionProps={interactionProps}
        readOnly={readOnly}
        tidyLayout={tidyLayout}
        onTidyWithFitReady={onTidyWithFitReady}
        onExecute={onExecute}
        onNodeDoubleClick={readOnly ? undefined : (_, node) => setConfigNodeId(node.id)}
      />
      {configNode && !readOnly ? (
        <WorkflowNodeConfigPanel
          node={configNode}
          workflowId={workflowId}
          onClose={() => setConfigNodeId(null)}
          onPatchData={patchNodeDataById}
          onExecuteStep={(nodeId) => onMenuActionWrapped(nodeId, "execute_step")}
        />
      ) : null}
    </WorkflowCanvasUiContext.Provider>
  );
}

const CanvasSurface = memo(function CanvasSurface({
  className,
  themeMode,
  nodes,
  edges,
  interactionProps,
  readOnly,
  tidyLayout,
  onTidyWithFitReady,
  onExecute,
  onNodeDoubleClick,
}: {
  className?: string;
  themeMode: "light" | "dark" | "system";
  nodes: WorkflowDefinition["nodes"];
  edges: Edge[];
  interactionProps: Record<string, unknown>;
  readOnly?: boolean;
  tidyLayout: () => void;
  onTidyWithFitReady: (fn: (() => void) | undefined) => void;
  onExecute?: () => void;
  onNodeDoubleClick?: (event: React.MouseEvent, node: Node) => void;
}) {
  const closeAddNodeDrawer = useWorkflowCanvasUi()?.closeAddNodeDrawer;
  const onPaneClick = useCallback(() => {
    closeAddNodeDrawer?.();
  }, [closeAddNodeDrawer]);

  return (
    <div
      className={cn(
        "workflow-canvas-surface dark:bg-muted/15 relative isolate h-full w-full overflow-hidden bg-[#f9f9f9] [transform:translateZ(0)]",
        className,
      )}
    >
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
        connectionRadius={28}
        proOptions={{ hideAttribution: true }}
        panOnScroll
        onPaneClick={onPaneClick}
        onNodeDoubleClick={onNodeDoubleClick}
        {...interactionProps}
      >
        <WorkflowCanvasInitialFit enabled={nodes.length > 0} />
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
      {!readOnly && nodes.length === 0 ? <WorkflowCanvasEmptyState /> : null}
    </div>
  );
});

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
  const pluginId = extraData?.triggerKind
    ? `trigger:${extraData.triggerKind}`
    : extraData?.coreKind
      ? `core:${extraData.coreKind}`
      : type;
  const plugin = resolveUIPluginById(String(pluginId));
  const baseData = plugin
    ? createNodeDataFromPlugin(plugin, label).data
    : { label, ...webhookNodeDefaults(id, extraData), ...extraData };

  const node: Node = {
    id,
    type,
    position: { x: 120 + def.nodes.length * 40, y: 80 + def.nodes.length * 30 },
    data: { ...baseData, label, ...extraData },
  };
  warnLegacyRuntimeType(node);
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
