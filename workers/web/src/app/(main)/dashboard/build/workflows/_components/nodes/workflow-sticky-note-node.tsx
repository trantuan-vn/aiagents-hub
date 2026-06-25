"use client";

import { memo, useCallback } from "react";

import { NodeToolbar, Position, useNodeId, type NodeProps } from "@xyflow/react";
import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { useWorkflowEditorActions } from "../editor/workflow-editor-actions-context";
import { useWorkflowCanvasUi } from "../canvas/workflow-canvas-ui-context";

function StickyNoteNodeInner({ data, selected }: NodeProps) {
  const t = useTranslations("WorkflowEditorPage");
  const actions = useWorkflowEditorActions();
  const readOnly = actions?.readOnly ?? false;
  const nodeId = useNodeId();
  const canvasUi = useWorkflowCanvasUi();
  const d = data as { text?: string };
  const text = d.text ?? "";

  const onTextChange = useCallback(
    (value: string) => {
      if (!nodeId) return;
      canvasUi?.patchNodeData?.(nodeId, { text: value });
    },
    [nodeId, canvasUi],
  );

  const onDelete = useCallback(() => {
    if (!nodeId) return;
    canvasUi?.deleteNode?.(nodeId);
  }, [nodeId, canvasUi]);

  return (
    <div
      className={cn(
        "w-[200px] rounded-md border border-amber-300/80 bg-amber-50 p-2.5 shadow-md dark:border-amber-700/50 dark:bg-amber-950/50",
        selected && "ring-primary ring-2",
      )}
    >
      {!readOnly ? (
        <NodeToolbar isVisible={selected} position={Position.Top} align="end" offset={4} className="nodrag nopan">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-destructive hover:text-destructive h-7 w-7 border bg-card shadow-md"
            aria-label={t("toolbar_delete")}
            onClick={onDelete}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </NodeToolbar>
      ) : null}
      <textarea
        className="nodrag nopan placeholder:text-muted-foreground/70 min-h-[88px] w-full resize-none border-0 bg-transparent text-xs leading-relaxed outline-none disabled:cursor-default"
        placeholder={t("sticky_note_placeholder")}
        value={text}
        readOnly={readOnly}
        disabled={readOnly}
        onChange={(e) => onTextChange(e.target.value)}
      />
    </div>
  );
}

export const StickyNoteNode = memo(StickyNoteNodeInner);
StickyNoteNode.displayName = "StickyNoteNode";
