"use client";

import { memo, useCallback } from "react";

import { useNodeId, useReactFlow, type NodeProps } from "@xyflow/react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

import { useWorkflowEditorActions } from "./workflow-editor-actions-context";

function StickyNoteNodeInner({ data, selected }: NodeProps) {
  const t = useTranslations("WorkflowEditorPage");
  const actions = useWorkflowEditorActions();
  const readOnly = actions?.readOnly ?? false;
  const nodeId = useNodeId();
  const { updateNodeData } = useReactFlow();
  const d = data as { text?: string };
  const text = d.text ?? "";

  const onTextChange = useCallback(
    (value: string) => {
      if (!nodeId) return;
      updateNodeData(nodeId, { text: value });
    },
    [nodeId, updateNodeData],
  );

  return (
    <div
      className={cn(
        "w-[200px] rounded-md border border-amber-300/80 bg-amber-50 p-2.5 shadow-md dark:border-amber-700/50 dark:bg-amber-950/50",
        selected && "ring-primary ring-2",
      )}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <textarea
        className="placeholder:text-muted-foreground/70 min-h-[88px] w-full resize-none border-0 bg-transparent text-xs leading-relaxed outline-none disabled:cursor-default"
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
