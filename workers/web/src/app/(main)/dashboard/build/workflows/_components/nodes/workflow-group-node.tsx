"use client";

import { memo } from "react";

import { NodeResizer, type NodeProps } from "@xyflow/react";

import { cn } from "@/lib/utils";

export const WorkflowGroupNode = memo(function WorkflowGroupNode({ data, selected }: NodeProps) {
  const label = String((data as { label?: string }).label ?? "Group");

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
        <div className="text-muted-foreground pointer-events-none px-3 py-1.5 text-[11px] font-semibold tracking-wide uppercase">
          {label}
        </div>
      </div>
    </>
  );
});

WorkflowGroupNode.displayName = "WorkflowGroupNode";
