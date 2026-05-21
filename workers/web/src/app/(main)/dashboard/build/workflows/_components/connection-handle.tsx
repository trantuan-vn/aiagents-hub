"use client";

import { memo, useCallback, useMemo, useState } from "react";

import { Handle, Position, useNodeId, useStore, type Edge } from "@xyflow/react";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

import { useWorkflowCanvasUi, type ConnectedNodeSide } from "./workflow-canvas-ui-context";
import { WORKFLOW_NODE_PALETTE } from "./workflow-node-palette";

function edgeUsesSourceOut(e: { source: string; sourceHandle?: string | null }): boolean {
  return e.sourceHandle === "out" || e.sourceHandle == null || e.sourceHandle === "";
}

function edgeUsesTargetIn(e: { target: string; targetHandle?: string | null }): boolean {
  return e.targetHandle === "in" || e.targetHandle == null || e.targetHandle === "";
}

function useHandleConnectionState(nodeId: string | null, type: "target" | "source", edges: Edge[]) {
  return useMemo(() => {
    if (!nodeId) return true;
    if (type === "source") {
      return edges.some((e) => e.source === nodeId && edgeUsesSourceOut(e));
    }
    return edges.some((e) => e.target === nodeId && edgeUsesTargetIn(e));
  }, [edges, nodeId, type]);
}

function ConnectionHandleRow({
  position,
  showPlus,
  plusPopover,
  handleEl,
}: {
  position: Position;
  showPlus: boolean;
  plusPopover: React.ReactNode;
  handleEl: React.ReactNode;
}) {
  if (position === Position.Left) {
    return (
      <>
        {showPlus ? plusPopover : null}
        {handleEl}
      </>
    );
  }
  return (
    <>
      {handleEl}
      {showPlus ? plusPopover : null}
    </>
  );
}

interface ConnectionHandleProps {
  handleId: "in" | "out";
  type: "target" | "source";
  position: Position;
  accentClass?: string;
}

function ConnectionHandleInner({ handleId, type, position, accentClass }: ConnectionHandleProps) {
  const nodeId = useNodeId();
  const ui = useWorkflowCanvasUi();
  const readOnly = ui?.readOnly ?? true;
  const createConnectedNode = ui?.createConnectedNode;
  const t = useTranslations("WorkflowEditorPage");
  const [open, setOpen] = useState(false);

  const edges = useStore((s) => s.edges);
  const hasConnection = useHandleConnectionState(nodeId ?? null, type, edges);

  const side: ConnectedNodeSide = position === Position.Left ? "left" : "right";

  const onPickType = useCallback(
    (nodeType: string, label: string) => {
      if (!nodeId || !createConnectedNode) return;
      createConnectedNode({ fromNodeId: nodeId, side, type: nodeType, label });
      setOpen(false);
    },
    [createConnectedNode, nodeId, side],
  );

  const showPlus = !readOnly && !hasConnection && !!createConnectedNode;

  const clusterClass =
    position === Position.Left
      ? "absolute left-0 top-1/2 z-20 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1"
      : "absolute right-0 top-1/2 z-20 flex translate-x-1/2 -translate-y-1/2 items-center gap-1";

  const plusPopover = (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="secondary"
          size="icon"
          className="h-6 w-6 shrink-0 rounded-full border p-0 text-base font-semibold shadow-sm"
          aria-label={t("connect_add_node")}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-64 p-0"
        side={side}
        align="center"
        sideOffset={8}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <p className="text-muted-foreground border-b px-3 py-2 text-xs font-medium">{t("connect_add_node")}</p>
        <div className="max-h-52 overflow-y-auto p-1">
          {WORKFLOW_NODE_PALETTE.map(({ type: nodeType, icon: Icon, key }) => (
            <button
              key={nodeType}
              type="button"
              className="hover:bg-accent focus:bg-accent flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm"
              onClick={() => onPickType(nodeType, t(key))}
            >
              <Icon className="h-4 w-4 shrink-0 opacity-80" />
              {t(key)}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );

  const handleEl = (
    <Handle
      id={handleId}
      type={type}
      position={position}
      className={cn(
        "border-background !static !size-3 shrink-0 !translate-x-0 !translate-y-0 !transform-none !border-2",
        accentClass ?? "!bg-muted-foreground",
      )}
    />
  );

  return (
    <div className={cn("pointer-events-none", clusterClass)}>
      <div className="pointer-events-auto flex items-center gap-1">
        <ConnectionHandleRow position={position} showPlus={showPlus} plusPopover={plusPopover} handleEl={handleEl} />
      </div>
    </div>
  );
}

export const ConnectionHandle = memo(ConnectionHandleInner);
ConnectionHandle.displayName = "ConnectionHandle";
