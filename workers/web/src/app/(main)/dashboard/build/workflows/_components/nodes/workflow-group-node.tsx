"use client";

import { memo, useCallback } from "react";

import { NodeResizer, useNodeId, type NodeProps } from "@xyflow/react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

import { useWorkflowCanvasUi } from "../canvas/workflow-canvas-ui-context";
import { useWorkflowEditorActions } from "../editor/workflow-editor-actions-context";

export const WorkflowGroupNode = memo(function WorkflowGroupNode({ data, selected }: NodeProps) {
  const t = useTranslations("WorkflowEditorPage");
  const actions = useWorkflowEditorActions();
  const readOnly = actions?.readOnly ?? false;
  const nodeId = useNodeId();
  const canvasUi = useWorkflowCanvasUi();
  const defaultLabel = t("group_nodes");
  const storedLabel = String((data as { label?: string }).label ?? "");
  const displayLabel = storedLabel.trim() || defaultLabel;

  const onLabelChange = useCallback(
    (value: string) => {
      if (!nodeId) return;
      canvasUi?.patchNodeData?.(nodeId, { label: value });
    },
    [nodeId, canvasUi],
  );

  return (
    <>
      <NodeResizer
        minWidth={160}
        minHeight={100}
        isVisible={selected}
        lineClassName="!border-primary"
        handleClassName="!h-2 !w-2 !border-card !bg-primary"
      />
      <div
        className={cn(
          "workflow-group-node pointer-events-none h-full w-full rounded-xl border-2 border-dashed transition-colors",
          selected
            ? "border-primary/60 bg-primary/5"
            : "border-muted-foreground/30 bg-muted/15 hover:border-muted-foreground/45",
        )}
      >
        <div
          className="nodrag nopan pointer-events-auto px-3 py-1.5"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {readOnly ? (
            <div className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">{displayLabel}</div>
          ) : (
            <input
              type="text"
              className="text-muted-foreground placeholder:text-muted-foreground/50 w-full border-0 bg-transparent p-0 text-[11px] font-semibold tracking-wide uppercase outline-none focus:text-foreground"
              placeholder={t("group_title_placeholder")}
              value={storedLabel}
              maxLength={80}
              onChange={(e) => onLabelChange(e.target.value)}
            />
          )}
        </div>
      </div>
    </>
  );
});

WorkflowGroupNode.displayName = "WorkflowGroupNode";
