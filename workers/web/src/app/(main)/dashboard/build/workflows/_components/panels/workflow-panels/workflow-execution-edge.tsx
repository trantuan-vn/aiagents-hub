"use client";

import { memo, useMemo } from "react";

import { BaseEdge, EdgeLabelRenderer, useStore, type EdgeProps } from "@xyflow/react";

import { cn } from "@/lib/utils";

import { resolveWorkflowEdgePath } from "../../edges/workflow-edge-paths";
import { readEdgeRouteAdjustments } from "../../edges/workflow-edge-route-data";
import { WORKFLOW_EDGE_MARKER_END, WORKFLOW_EDGE_STROKE_WIDTH } from "../../edges/workflow-edge-utils";

export type WorkflowExecutionEdgeData = {
  itemCount?: number;
  status?: string;
  branchLabel?: string;
};

function strokeForStatus(status?: string): string | undefined {
  if (status === "error") return "#dc2626";
  if (status === "success") return "#059669";
  if (status === "pending_human") return "#d97706";
  return undefined;
}

function branchCaption(handle?: string | null): string | null {
  if (!handle || handle === "out" || handle === "in") return null;
  if (handle === "true") return "True";
  if (handle === "false") return "False";
  return handle.replace(/_/g, " ");
}

function ItemBadge({ itemCount, status, branch }: { itemCount: number; status?: string; branch: string | null }) {
  return (
    <span
      className={cn(
        "bg-background/95 text-muted-foreground inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium shadow-sm",
        status === "success" && "border-emerald-500/40 text-emerald-700 dark:text-emerald-400",
        status === "error" && "border-red-500/40 text-red-700 dark:text-red-400",
      )}
    >
      {branch ? <span className="capitalize">{branch}</span> : null}
      {itemCount > 0 ? (
        <span>
          {itemCount} {itemCount === 1 ? "item" : "items"}
        </span>
      ) : null}
    </span>
  );
}

function WorkflowExecutionEdgeComponent(props: EdgeProps) {
  const nodes = useStore((s) => s.nodes);
  const adjustments = useMemo(() => readEdgeRouteAdjustments(props.data), [props.data]);
  const {
    path: edgePath,
    labelX,
    labelY,
  } = useMemo(() => resolveWorkflowEdgePath(props, nodes, adjustments), [props, nodes, adjustments]);

  const data = (props.data ?? {}) as WorkflowExecutionEdgeData;
  const itemCount = Number(data.itemCount ?? 0);
  const status = data.status;
  const branch = data.branchLabel ?? branchCaption(props.sourceHandleId);
  const stroke = strokeForStatus(status);
  const showBadge = itemCount > 0 || !!branch;

  return (
    <>
      <BaseEdge
        path={edgePath}
        markerEnd={WORKFLOW_EDGE_MARKER_END}
        style={{
          strokeWidth: WORKFLOW_EDGE_STROKE_WIDTH,
          ...props.style,
          ...(stroke ? { stroke } : {}),
        }}
      />
      {showBadge ? (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan pointer-events-none absolute"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)` }}
          >
            <ItemBadge itemCount={itemCount} status={status} branch={branch} />
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

export const WorkflowExecutionEdge = memo(WorkflowExecutionEdgeComponent);
WorkflowExecutionEdge.displayName = "WorkflowExecutionEdge";
