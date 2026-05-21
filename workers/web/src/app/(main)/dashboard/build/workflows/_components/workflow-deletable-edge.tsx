"use client";

import { memo, useCallback, useRef, useState } from "react";

import { BaseEdge, EdgeLabelRenderer, getBezierPath, useReactFlow, type EdgeProps } from "@xyflow/react";
import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { useWorkflowCanvasUi } from "./workflow-canvas-ui-context";
import { WORKFLOW_EDGE_MARKER_END_URL } from "./workflow-edge-utils";

const HOVER_LEAVE_MS = 180;

function WorkflowDeletableEdgeComponent(props: EdgeProps) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, style, selected } = props;
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  const [hovered, setHovered] = useState(false);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ui = useWorkflowCanvasUi();
  const readOnly = ui?.readOnly ?? true;
  const { setEdges } = useReactFlow();
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
      setEdges((eds) => eds.filter((edge) => edge.id !== id));
    },
    [clearLeaveTimer, id, setEdges],
  );

  const showDelete = !readOnly && (hovered || selected);

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
        markerEnd={markerEnd ?? WORKFLOW_EDGE_MARKER_END_URL}
        style={{ strokeWidth: 2, ...style }}
        interactionWidth={0}
      />
      {!readOnly && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
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
