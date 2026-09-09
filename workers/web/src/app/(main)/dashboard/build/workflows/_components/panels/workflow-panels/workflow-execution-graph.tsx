"use client";

import { useCallback, useEffect, useMemo } from "react";

import { Background, BackgroundVariant, ReactFlow, ReactFlowProvider, useReactFlow, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { usePreferencesStore } from "@/stores/preferences/preferences-provider";

import type { ExecutionStepLog, WorkflowExecutionGraph } from "../../../_lib/api";
import { WorkflowCanvasControls } from "../../canvas/workflow-canvas-controls";
import { WorkflowCanvasUiContext } from "../../canvas/workflow-canvas-ui-context";
import { WorkflowEdgeMarkers } from "../../edges/workflow-edge-markers";
import { WorkflowExecutionUiProvider, type NodeRunStatus } from "../../hooks/workflow-execution-ui";
import { workflowNodeTypes } from "../../nodes";

import { WorkflowExecutionEdge, type WorkflowExecutionEdgeData } from "./workflow-execution-edge";
import { countItems, stepsByNodeId, toReactFlowGraph } from "./workflow-execution-utils";

const READONLY_UI = { readOnly: true } as const;

const executionEdgeTypes = {
  workflowExecution: WorkflowExecutionEdge,
};

function FitOnChange({ executionKey, nodeCount }: { executionKey: string; nodeCount: number }) {
  const { fitView } = useReactFlow();
  useEffect(() => {
    if (nodeCount === 0) return;
    const frame = requestAnimationFrame(() => {
      void fitView({ padding: 0.22, duration: 180 });
    });
    return () => cancelAnimationFrame(frame);
  }, [executionKey, nodeCount, fitView]);
  return null;
}

function GraphInner({
  executionKey,
  definition,
  steps,
  selectedNodeId,
  running,
  onSelectNode,
}: {
  executionKey: string;
  definition: WorkflowExecutionGraph | undefined;
  steps: ExecutionStepLog[];
  selectedNodeId: string | null;
  running: boolean;
  onSelectNode: (nodeId: string | null) => void;
}) {
  const themeMode = usePreferencesStore((s) => s.themeMode);
  const stepMap = useMemo(() => stepsByNodeId(steps), [steps]);
  const { nodes: baseNodes, edges: baseEdges } = useMemo(() => toReactFlowGraph(definition), [definition]);

  const statusByNodeId = useMemo(() => {
    const next: Record<string, NodeRunStatus> = {};
    for (const step of steps) next[step.nodeId] = step.status;
    return next;
  }, [steps]);

  const nodes = useMemo(
    () =>
      baseNodes.map((n) => ({
        ...n,
        selected: n.id === selectedNodeId,
      })),
    [baseNodes, selectedNodeId],
  );

  const edges = useMemo(
    () =>
      baseEdges.map((e) => {
        const step = stepMap.get(e.source);
        const data: WorkflowExecutionEdgeData = {
          ...((e.data as WorkflowExecutionEdgeData | undefined) ?? {}),
          itemCount: countItems(step?.output),
          status: step?.status,
        };
        return {
          ...e,
          type: "workflowExecution",
          data,
          animated: running && !Object.hasOwn(statusByNodeId, e.source),
        };
      }),
    [baseEdges, running, statusByNodeId, stepMap],
  );

  const executionUi = useMemo(
    () => ({
      running,
      entryNodeId: null,
      currentNodeId: running ? (steps.find((s) => s.status === "pending_human")?.nodeId ?? null) : null,
      listeningNodeId: null,
      statusByNodeId,
      startRun: () => undefined,
      finishRun: () => undefined,
    }),
    [running, statusByNodeId, steps],
  );

  const onNodeClick = useCallback(
    (_: unknown, node: Node) => {
      onSelectNode(node.id);
    },
    [onSelectNode],
  );

  return (
    <WorkflowExecutionUiProvider value={executionUi}>
      <WorkflowCanvasUiContext.Provider value={READONLY_UI}>
        <div className="workflow-canvas-surface dark:bg-muted/15 relative h-full w-full overflow-hidden bg-[#f9f9f9]">
          <ReactFlow
            className="h-full w-full"
            colorMode={themeMode}
            nodes={nodes}
            edges={edges}
            nodeTypes={workflowNodeTypes}
            edgeTypes={executionEdgeTypes}
            proOptions={{ hideAttribution: true }}
            panOnScroll
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable
            selectNodesOnDrag={false}
            onNodeClick={onNodeClick}
            fitView
            fitViewOptions={{ padding: 0.22 }}
          >
            <FitOnChange executionKey={executionKey} nodeCount={nodes.length} />
            <WorkflowEdgeMarkers />
            <Background variant={BackgroundVariant.Cross} gap={22} size={1} />
            <WorkflowCanvasControls readOnly />
          </ReactFlow>
        </div>
      </WorkflowCanvasUiContext.Provider>
    </WorkflowExecutionUiProvider>
  );
}

export function WorkflowExecutionGraph(props: {
  executionKey: string;
  definition: WorkflowExecutionGraph | undefined;
  steps: ExecutionStepLog[];
  selectedNodeId: string | null;
  running: boolean;
  onSelectNode: (nodeId: string | null) => void;
}) {
  return (
    <div className="h-full min-h-0 w-full flex-1">
      <ReactFlowProvider>
        <GraphInner {...props} />
      </ReactFlowProvider>
    </div>
  );
}
