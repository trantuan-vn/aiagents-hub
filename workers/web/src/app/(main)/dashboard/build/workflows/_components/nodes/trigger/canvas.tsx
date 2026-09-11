"use client";

import { memo } from "react";

import { Position, useNodeId, type NodeProps } from "@xyflow/react";
import { FlaskConical, Loader2, Play, Zap } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

import { useWorkflowCanvasUi } from "../../canvas/workflow-canvas-ui-context";
import {
  WORKFLOW_TRIGGER_CATALOG,
  type WorkflowTriggerKindId,
} from "../../catalogs/workflow-trigger-catalog";
import { ConnectionHandle } from "../../edges/connection-handle";
import { useNodeExecutionUi } from "../../hooks/workflow-execution-ui";
import { WorkflowNodeShell } from "../../node-ui/workflow-node-shell";
import { isGenericManualTriggerLabel } from "./label";

const TRIGGER_ICONS = new Map(WORKFLOW_TRIGGER_CATALOG.map((item) => [item.id, item.icon]));

function resolveTriggerKind(
  data: Record<string, unknown>,
  nodeType: string | undefined,
): WorkflowTriggerKindId {
  if (typeof data.triggerKind === "string" && TRIGGER_ICONS.has(data.triggerKind as WorkflowTriggerKindId)) {
    return data.triggerKind as WorkflowTriggerKindId;
  }
  if (data.coreKind === "webhook" || nodeType === "webhook") return "webhook";
  return "manual";
}

function ManualTriggerExecuteHoverButton() {
  const t = useTranslations("WorkflowEditorPage");
  const nodeId = useNodeId() ?? "";
  const ui = useWorkflowCanvasUi();
  const { workflowRunning, busyForStep } = useNodeExecutionUi(nodeId);

  return (
    <button
      type="button"
      disabled={workflowRunning}
      aria-label={t("execute_workflow")}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        ui?.runNode?.(nodeId);
      }}
      className="nodrag nopan disabled:opacity-80 flex items-center gap-2 rounded-lg bg-[#ff6d00] px-3.5 py-2 text-[13px] font-semibold whitespace-nowrap text-white shadow-[0_2px_8px_rgba(0,0,0,0.18)] transition-colors hover:bg-[#f57c00]"
    >
      {busyForStep || workflowRunning ? (
        <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
      ) : (
        <FlaskConical className="size-4 shrink-0 stroke-[1.75]" aria-hidden />
      )}
      {t("execute_workflow")}
    </button>
  );
}

function TriggerNodeInner({ data, selected, type }: NodeProps) {
  const t = useTranslations("WorkflowEditorPage");
  const ui = useWorkflowCanvasUi();
  const d = data as {
    label?: string;
    deactivated?: boolean;
    triggerKind?: string;
    coreKind?: string;
  };
  const kind = resolveTriggerKind(d, type);
  const Icon = TRIGGER_ICONS.get(kind) ?? Play;
  const storedLabel = d.label?.trim() || "";
  const label =
    kind === "manual" && isGenericManualTriggerLabel(storedLabel)
      ? t("trigger_manual_node_label")
      : storedLabel || "Trigger";
  const showExecuteHover = kind === "manual" && !ui?.readOnly && !d.deactivated;

  return (
    <WorkflowNodeShell
      compact
      selected={selected}
      deactivated={d.deactivated}
      hoverLeft={showExecuteHover ? <ManualTriggerExecuteHoverButton /> : undefined}
    >
      <div className="flex flex-col items-center">
        <div className={cn("relative", kind !== "manual" && "pl-5")}>
          {kind !== "manual" ? (
            <span className="absolute top-1/2 left-2 z-10 -translate-y-1/2" aria-hidden>
              <Zap className="size-3.5 fill-[#ff6f00] text-[#ff6f00]" strokeWidth={1.75} />
            </span>
          ) : null}
          <div
            className={cn(
              "relative h-[84px] w-[84px] rounded-[18px] border-2 border-border/80 bg-card shadow-sm",
              selected && "ring-2 ring-primary ring-offset-2 ring-offset-background",
            )}
          >
            <div className="flex h-full w-full items-center justify-center">
              <Icon className="h-[34px] w-[34px] text-foreground/80" strokeWidth={1.6} aria-hidden />
            </div>
            <div
              aria-hidden
              className="pointer-events-none absolute top-1/2 right-0 z-[1] size-3.5 translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-border/80 bg-card"
            />
            <ConnectionHandle
              handleId="out"
              type="source"
              position={Position.Right}
              accentClass="!bg-muted-foreground/80 !size-2.5"
            />
          </div>
        </div>
        <p
          className="text-foreground/85 mt-2 line-clamp-2 max-w-[172px] text-center text-[11px] leading-snug font-medium"
          title={label}
        >
          {label}
        </p>
      </div>
    </WorkflowNodeShell>
  );
}

export const TriggerNode = memo(TriggerNodeInner);
TriggerNode.displayName = "TriggerNode";
