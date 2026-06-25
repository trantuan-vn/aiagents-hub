"use client";

import { memo, useCallback, useMemo, useRef, useState } from "react";

import { BaseEdge, EdgeLabelRenderer, useReactFlow, useStore, type EdgeProps } from "@xyflow/react";
import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { useWorkflowCanvasUi } from "../canvas/workflow-canvas-ui-context";
import {
  resolveWorkflowEdgePath,
  routeAdjustmentFromDrag,
  type WorkflowEdgeDragHandle,
} from "./workflow-edge-paths";
import { readEdgeRouteAdjustments, type WorkflowEdgeRouteAdjustments } from "./workflow-edge-route-data";
import { WORKFLOW_EDGE_MARKER_END, WORKFLOW_EDGE_STROKE_WIDTH } from "./workflow-edge-utils";

const HOVER_LEAVE_MS = 180;

function WorkflowEdgeDragHandleControl({
  handle,
  edgeId,
  sourceX,
  sourceY,
  targetX,
  targetY,
  visible,
  onDragPreview,
  onDragCommit,
  onHoverChange,
}: {
  handle: WorkflowEdgeDragHandle;
  edgeId: string;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  visible: boolean;
  onDragPreview: (patch: WorkflowEdgeRouteAdjustments) => void;
  onDragCommit: (patch: WorkflowEdgeRouteAdjustments) => void;
  onHoverChange: (hovered: boolean) => void;
}) {
  const { screenToFlowPosition } = useReactFlow();
  const draggingRef = useRef(false);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      e.preventDefault();
      draggingRef.current = true;
      onHoverChange(true);
      e.currentTarget.setPointerCapture(e.pointerId);

      const onMove = (ev: PointerEvent) => {
        if (!draggingRef.current) return;
        const flowPos = screenToFlowPosition({ x: ev.clientX, y: ev.clientY });
        onDragPreview(routeAdjustmentFromDrag(handle, flowPos.x, flowPos.y, sourceX, sourceY, targetX, targetY));
      };

      const onUp = (ev: PointerEvent) => {
        if (!draggingRef.current) return;
        draggingRef.current = false;
        const flowPos = screenToFlowPosition({ x: ev.clientX, y: ev.clientY });
        onDragCommit(routeAdjustmentFromDrag(handle, flowPos.x, flowPos.y, sourceX, sourceY, targetX, targetY));
        onHoverChange(false);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [handle, onDragCommit, onDragPreview, onHoverChange, screenToFlowPosition, sourceX, sourceY, targetX, targetY],
  );

  const cursorClass =
    handle.axis === "y" ? "cursor-ns-resize" : handle.axis === "x" ? "cursor-ew-resize" : "cursor-move";

  return (
    <div
      className={cn("nodrag nopan", visible ? "opacity-100" : "opacity-0")}
      style={{
        position: "absolute",
        transform: `translate(-50%, -50%) translate(${handle.x}px,${handle.y}px)`,
        pointerEvents: "all",
      }}
      onPointerEnter={() => onHoverChange(true)}
      onPointerLeave={() => onHoverChange(false)}
    >
      <button
        type="button"
        aria-label="Resize connection"
        data-edge-id={edgeId}
        className={cn(
          "border-primary bg-background hover:bg-primary/20 block h-3.5 w-3.5 rounded-full border-2 shadow-sm transition-opacity duration-150",
          cursorClass,
        )}
        onPointerDown={onPointerDown}
      />
    </div>
  );
}

function WorkflowDeletableEdgeComponent(props: EdgeProps) {
  const nodes = useStore((s) => s.nodes);
  const [dragPreview, setDragPreview] = useState<WorkflowEdgeRouteAdjustments | null>(null);
  const persistedAdjustments = useMemo(() => readEdgeRouteAdjustments(props.data), [props.data]);
  const liveAdjustments = dragPreview ? { ...persistedAdjustments, ...dragPreview } : persistedAdjustments;

  const { path: edgePath, labelX, labelY, dragHandles } = useMemo(
    () => resolveWorkflowEdgePath(props, nodes, liveAdjustments),
    [props, nodes, liveAdjustments],
  );

  const { id, style, selected, sourceX, sourceY, targetX, targetY } = props;
  const [hovered, setHovered] = useState(false);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ui = useWorkflowCanvasUi();
  const readOnly = ui?.readOnly ?? true;
  const deleteEdge = ui?.deleteEdge;
  const patchEdgeRoute = ui?.patchEdgeRoute;
  const t = useTranslations("WorkflowEditorPage");

  const clearLeaveTimer = useCallback(() => {
    if (leaveTimer.current != null) {
      clearTimeout(leaveTimer.current);
      leaveTimer.current = null;
    }
  }, []);

  const onPointerEnter = useCallback(() => {
    clearLeaveTimer();
    setHovered(true);
  }, [clearLeaveTimer]);

  const onPointerLeave = useCallback(() => {
    clearLeaveTimer();
    leaveTimer.current = setTimeout(() => setHovered(false), HOVER_LEAVE_MS);
  }, [clearLeaveTimer]);

  const onDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      clearLeaveTimer();
      setHovered(false);
      deleteEdge?.(id);
    },
    [clearLeaveTimer, deleteEdge, id],
  );

  const onDragPreview = useCallback((patch: WorkflowEdgeRouteAdjustments) => {
    setDragPreview(patch);
  }, []);

  const onDragCommit = useCallback(
    (patch: WorkflowEdgeRouteAdjustments) => {
      setDragPreview(null);
      patchEdgeRoute?.(id, patch);
    },
    [id, patchEdgeRoute],
  );

  const showControls = !readOnly && (hovered || selected || dragPreview != null);
  const showDelete = showControls;

  return (
    <>
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={28}
        className="react-flow__edge-interaction cursor-default"
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
      />
      <BaseEdge
        path={edgePath}
        markerEnd={WORKFLOW_EDGE_MARKER_END}
        style={{ strokeWidth: WORKFLOW_EDGE_STROKE_WIDTH, ...style }}
        interactionWidth={0}
      />
      {!readOnly && (
        <EdgeLabelRenderer>
          {dragHandles.map((handle) => (
            <WorkflowEdgeDragHandleControl
              key={handle.id}
              handle={handle}
              edgeId={id}
              sourceX={sourceX}
              sourceY={sourceY}
              targetX={targetX}
              targetY={targetY}
              visible={showControls}
              onDragPreview={onDragPreview}
              onDragCommit={onDragCommit}
              onHoverChange={setHovered}
            />
          ))}
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY - 26}px)`,
              pointerEvents: "all",
            }}
            className="nodrag nopan"
            onPointerEnter={onPointerEnter}
            onPointerLeave={onPointerLeave}
          >
            <Button
              type="button"
              variant="destructive"
              size="icon"
              className={cn(
                "h-8 w-8 rounded-full shadow-md transition-opacity duration-150",
                showDelete ? "opacity-100" : "pointer-events-none opacity-0",
              )}
              aria-label={t("connect_delete")}
              onClick={onDelete}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const WorkflowDeletableEdge = memo(WorkflowDeletableEdgeComponent);
WorkflowDeletableEdge.displayName = "WorkflowDeletableEdge";
