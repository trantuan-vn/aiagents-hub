"use client";

import { memo, useCallback, useMemo, useState, type ReactNode } from "react";

import { Handle, Position, useNodeId, useStore, type Edge } from "@xyflow/react";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

import { useWorkflowCanvasUi, type ConnectedNodeSide } from "./workflow-canvas-ui-context";
import { edgeUsesHandle, type WorkflowHandleId } from "./workflow-connection-utils";
import { WORKFLOW_NODE_PALETTE } from "./workflow-node-palette";

function useHandleConnectionState(
  nodeId: string | null,
  handleId: WorkflowHandleId,
  type: "target" | "source",
  edges: Edge[],
) {
  return useMemo(() => {
    if (!nodeId) return true;
    return edges.some((e) => edgeUsesHandle(e, nodeId, handleId, type === "source" ? "source" : "target"));
  }, [edges, handleId, nodeId, type]);
}

function getHandleClusterClass(position: Position): string {
  if (position === Position.Left) {
    return "absolute left-0 top-1/2 z-20 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1";
  }
  if (position === Position.Right) {
    return "absolute right-0 top-1/2 z-20 flex translate-x-1/2 -translate-y-1/2 items-center gap-1";
  }
  return "relative z-20 flex flex-col items-center gap-0.5";
}

function getConnectedSide(position: Position): ConnectedNodeSide {
  return position === Position.Left ? "left" : "right";
}

function canShowConnectionPlus(
  showAddNode: boolean,
  readOnly: boolean,
  hasConnection: boolean,
  canCreate: boolean,
  position: Position,
): boolean {
  if (!showAddNode || readOnly || hasConnection || !canCreate) return false;
  return position !== Position.Bottom;
}

function ConnectionHandlePlusMenuContent({
  side,
  onPickType,
  t,
}: {
  side: ConnectedNodeSide;
  onPickType: (nodeType: string, nodeLabel: string) => void;
  t: ReturnType<typeof useTranslations<"WorkflowEditorPage">>;
}) {
  return (
    <PopoverContent
      className="z-[200] w-64 p-0"
      side={side}
      align="center"
      sideOffset={8}
      onOpenAutoFocus={(e) => e.preventDefault()}
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
  );
}

interface ConnectionHandleProps {
  handleId: WorkflowHandleId;
  type: "target" | "source";
  position: Position;
  accentClass?: string;
  label?: string;
  showAddNode?: boolean;
}

function useConnectionHandleModel({ handleId, type, position, showAddNode = true }: ConnectionHandleProps) {
  const nodeId = useNodeId();
  const ui = useWorkflowCanvasUi();
  const readOnly = ui?.readOnly ?? true;
  const createConnectedNode = ui?.createConnectedNode;
  const t = useTranslations("WorkflowEditorPage");
  const [open, setOpen] = useState(false);
  const edges = useStore((s) => s.edges);
  const hasConnection = useHandleConnectionState(nodeId ?? null, handleId, type, edges);
  const side = getConnectedSide(position);

  const onPickType = useCallback(
    (nodeType: string, nodeLabel: string) => {
      if (!nodeId || !createConnectedNode) return;
      createConnectedNode({ fromNodeId: nodeId, side, type: nodeType, label: nodeLabel });
      setOpen(false);
    },
    [createConnectedNode, nodeId, side],
  );

  const showPlus = canShowConnectionPlus(showAddNode, readOnly, hasConnection, !!createConnectedNode, position);

  return {
    t,
    open,
    setOpen,
    side,
    onPickType,
    showPlus,
    clusterClass: getHandleClusterClass(position),
    isSideHandle: position === Position.Left || position === Position.Right,
  };
}

function getConnectionDotClassName(showPlus: boolean, accentClass?: string): string {
  if (showPlus) {
    return "!flex !h-6 !w-6 !cursor-crosshair !items-center !justify-center !rounded-full !border !bg-secondary !p-0 !shadow-sm hover:!bg-accent";
  }
  return cn("!size-3", accentClass ?? "!bg-muted-foreground");
}

/** Handle for drag-to-connect; inner PopoverTrigger button opens add-node menu on click. */
function ConnectionHandleWithPlus({
  handleId,
  type,
  position,
  accentClass,
  open,
  setOpen,
  side,
  onPickType,
  t,
}: Pick<ConnectionHandleProps, "handleId" | "type" | "position" | "accentClass"> & {
  open: boolean;
  setOpen: (open: boolean) => void;
  side: ConnectedNodeSide;
  onPickType: (nodeType: string, nodeLabel: string) => void;
  t: ReturnType<typeof useTranslations<"WorkflowEditorPage">>;
}) {
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Handle
        id={handleId}
        type={type}
        position={position}
        className={cn(
          "border-background !static shrink-0 !translate-x-0 !translate-y-0 !transform-none !border-2",
          getConnectionDotClassName(true, accentClass),
        )}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            className="nodrag nopan text-foreground flex h-full w-full cursor-pointer items-center justify-center rounded-full border-0 bg-transparent p-0 shadow-none outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={t("connect_add_node")}
            onClick={(e) => e.stopPropagation()}
          >
            <Plus className="h-3.5 w-3.5 shrink-0" />
          </button>
        </PopoverTrigger>
      </Handle>
      <ConnectionHandlePlusMenuContent side={side} onPickType={onPickType} t={t} />
    </Popover>
  );
}

function ConnectionHandleDot({
  handleId,
  type,
  position,
  accentClass,
}: Pick<ConnectionHandleProps, "handleId" | "type" | "position" | "accentClass">) {
  return (
    <Handle
      id={handleId}
      type={type}
      position={position}
      className={cn(
        "border-background !static shrink-0 !translate-x-0 !translate-y-0 !transform-none !border-2",
        getConnectionDotClassName(false, accentClass),
      )}
    />
  );
}

function ConnectionHandleCluster({
  label,
  isSideHandle,
  clusterClass,
  children,
}: {
  label?: string;
  isSideHandle: boolean;
  clusterClass: string;
  children: ReactNode;
}) {
  return (
    <div className={cn(isSideHandle ? "pointer-events-none" : "pointer-events-auto", clusterClass)}>
      {label ? <span className="text-muted-foreground text-[10px] leading-none">{label}</span> : null}
      <div className={cn("flex items-center gap-1", isSideHandle && "pointer-events-auto")}>{children}</div>
    </div>
  );
}

function ConnectionHandleView({
  handleId,
  type,
  position,
  accentClass,
  label,
  model,
}: ConnectionHandleProps & { model: ReturnType<typeof useConnectionHandleModel> }) {
  const { t, open, setOpen, side, onPickType, showPlus, clusterClass, isSideHandle } = model;

  return (
    <ConnectionHandleCluster label={label} isSideHandle={isSideHandle} clusterClass={clusterClass}>
      {showPlus ? (
        <ConnectionHandleWithPlus
          handleId={handleId}
          type={type}
          position={position}
          accentClass={accentClass}
          open={open}
          setOpen={setOpen}
          side={side}
          onPickType={onPickType}
          t={t}
        />
      ) : (
        <ConnectionHandleDot handleId={handleId} type={type} position={position} accentClass={accentClass} />
      )}
    </ConnectionHandleCluster>
  );
}

function ConnectionHandleInner(props: ConnectionHandleProps) {
  const model = useConnectionHandleModel(props);
  return <ConnectionHandleView {...props} model={model} />;
}

export const ConnectionHandle = memo(ConnectionHandleInner);
ConnectionHandle.displayName = "ConnectionHandle";
