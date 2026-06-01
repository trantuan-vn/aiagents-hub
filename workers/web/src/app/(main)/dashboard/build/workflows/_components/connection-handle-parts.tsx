"use client";

import { useMemo, type ReactNode } from "react";

import { Handle, Position, type Edge } from "@xyflow/react";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

import { useWorkflowCanvasUi, type ConnectedNodeSide } from "./workflow-canvas-ui-context";
import { edgeUsesHandle, type WorkflowHandleId } from "./workflow-connection-utils";
import type { WorkflowAddNodePick } from "./workflow-add-node-panel";
import { useWorkflowAddNodeDrawer } from "./workflow-add-node-drawer-context";

export function useHandleConnectionState(
  nodeId: string | null,
  handleId: WorkflowHandleId,
  type: "target" | "source",
  edges: Edge[],
  allowMultipleConnections: boolean,
) {
  return useMemo(() => {
    if (!nodeId || allowMultipleConnections) return false;
    return edges.some((e) => edgeUsesHandle(e, nodeId, handleId, type === "source" ? "source" : "target"));
  }, [allowMultipleConnections, edges, handleId, nodeId, type]);
}

export function getHandleClusterClass(position: Position): string {
  if (position === Position.Left) {
    return "absolute left-0 top-1/2 z-20 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1";
  }
  if (position === Position.Right) {
    return "absolute right-0 top-1/2 z-20 flex translate-x-1/2 -translate-y-1/2 items-center gap-1";
  }
  return "relative z-20 flex flex-col items-center gap-0.5";
}

export function getConnectedSide(position: Position): ConnectedNodeSide {
  return position === Position.Left ? "left" : "right";
}

export function canShowConnectionPlus(
  showAddNode: boolean,
  readOnly: boolean,
  hasConnection: boolean,
  canCreate: boolean,
  allowMultipleConnections: boolean,
): boolean {
  if (!showAddNode || readOnly || !canCreate) return false;
  if (hasConnection && !allowMultipleConnections) return false;
  return true;
}

export function getConnectionDotClassName(
  showPlus: boolean,
  accentClass?: string,
  shape: "circle" | "diamond" = "circle",
): string {
  if (showPlus) {
    return "!flex !h-6 !w-6 !cursor-crosshair !items-center !justify-center !rounded-full !border !bg-secondary !p-0 !shadow-sm hover:!bg-accent";
  }
  if (shape === "diamond") {
    return cn("workflow-handle-diamond !border-2", accentClass ?? "!bg-muted-foreground");
  }
  return cn("!size-3", accentClass ?? "!bg-muted-foreground");
}

export function ConnectionHandleWithPlus({
  handleId,
  type,
  position,
  accentClass,
  shape,
  onPick,
  t,
  allowedNodeTypes,
}: {
  handleId: WorkflowHandleId;
  type: "target" | "source";
  position: Position;
  accentClass?: string;
  shape?: "circle" | "diamond";
  onPick: (pick: WorkflowAddNodePick) => void;
  t: ReturnType<typeof useTranslations<"WorkflowEditorPage">>;
  allowedNodeTypes?: string[];
}) {
  const ui = useWorkflowCanvasUi();
  const drawer = useWorkflowAddNodeDrawer();
  const openDrawer = ui?.openAddNodeDrawer ?? drawer?.open;

  return (
    <Handle
      id={handleId}
      type={type}
      position={position}
      className={cn(
        "border-background !static shrink-0 !translate-x-0 !translate-y-0 !transform-none !border-2",
        getConnectionDotClassName(true, accentClass, shape),
      )}
    >
      <button
        type="button"
        className="nodrag nopan text-foreground focus-visible:ring-ring flex h-full w-full cursor-pointer items-center justify-center rounded-full border-0 bg-transparent p-0 shadow-none outline-none focus-visible:ring-2"
        aria-label={t("connect_add_node")}
        aria-expanded={drawer?.isOpen ?? false}
        onClick={(e) => {
          e.stopPropagation();
          openDrawer?.({
            variant: "connect",
            allowedNodeTypes,
            onPick,
          });
        }}
      >
        <Plus className="h-3.5 w-3.5 shrink-0" />
      </button>
    </Handle>
  );
}

export function ConnectionHandleDot({
  handleId,
  type,
  position,
  accentClass,
  shape,
}: {
  handleId: WorkflowHandleId;
  type: "target" | "source";
  position: Position;
  accentClass?: string;
  shape?: "circle" | "diamond";
}) {
  return (
    <Handle
      id={handleId}
      type={type}
      position={position}
      className={cn(
        "border-background !static shrink-0 !translate-x-0 !translate-y-0 !transform-none !border-2",
        getConnectionDotClassName(false, accentClass, shape),
      )}
    />
  );
}

export function ConnectionHandleCluster({
  label,
  required,
  isSideHandle,
  clusterClass,
  children,
}: {
  label?: string;
  required?: boolean;
  isSideHandle: boolean;
  clusterClass: string;
  children: ReactNode;
}) {
  return (
    <div className={cn(isSideHandle ? "pointer-events-none" : "pointer-events-auto", clusterClass)}>
      {label ? (
        <span className="text-muted-foreground text-[10px] leading-none">
          {label}
          {required ? <span className="text-destructive ml-0.5">*</span> : null}
        </span>
      ) : null}
      <div className={cn("flex items-center gap-1", isSideHandle && "pointer-events-auto")}>{children}</div>
    </div>
  );
}
