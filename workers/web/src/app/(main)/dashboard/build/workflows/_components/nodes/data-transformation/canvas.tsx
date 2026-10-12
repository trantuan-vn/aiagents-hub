"use client";

import { memo } from "react";

import { Position, type NodeProps } from "@xyflow/react";
import { ListFilter, Wrench } from "lucide-react";

import { cn } from "@/lib/utils";

import { ConnectionHandle } from "../../edges/connection-handle";
import { WorkflowNodeShell } from "../../node-ui/workflow-node-shell";
import { SimpleNode } from "../_shared/simple-node";

function CodeBracesIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 48" className={className} fill="none" aria-hidden>
      <path
        d="M26 6c-6.2 0-9.2 3.4-9.2 9.2v5.2c0 3.1-1.7 4.6-4.6 4.6H9.5v3.2h2.7c2.9 0 4.6 1.5 4.6 4.6v5.2C16.8 38.6 19.8 42 26 42"
        stroke="currentColor"
        strokeWidth="3.4"
        strokeLinecap="round"
      />
      <path
        d="M38 6c6.2 0 9.2 3.4 9.2 9.2v5.2c0 3.1 1.7 4.6 4.6 4.6h2.7v3.2H51.8c-2.9 0-4.6 1.5-4.6 4.6v5.2C47.2 38.6 44.2 42 38 42"
        stroke="currentColor"
        strokeWidth="3.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CodeJavaScriptNode({
  label,
  selected,
  deactivated,
}: {
  label: string;
  selected?: boolean;
  deactivated?: boolean;
}) {
  return (
    <WorkflowNodeShell compact selected={selected} deactivated={deactivated}>
      <div className="flex flex-col items-center">
        <div
          className={cn(
            "relative flex h-[104px] w-[104px] items-center justify-center rounded-[16px] border-2 border-[#d9dde3] bg-white shadow-sm",
            selected && "ring-2 ring-primary ring-offset-2 ring-offset-background",
          )}
        >
          <ConnectionHandle
            handleId="in"
            type="target"
            position={Position.Left}
            accentClass="!size-3.5 !border-2 !border-neutral-400 !bg-white"
            clusterClass="absolute left-0 top-1/2 z-20 flex -translate-x-1/2 -translate-y-1/2 items-center"
          />
          <CodeBracesIcon className="h-12 w-14 text-[#f5a524]" />
          <ConnectionHandle
            handleId="out"
            type="source"
            position={Position.Right}
            accentClass="!size-3.5 !border-2 !border-neutral-400 !bg-white"
            clusterClass="absolute right-0 top-1/2 z-20 flex translate-x-1/2 -translate-y-1/2 items-center"
          />
        </div>
        <p
          className="text-foreground/85 mt-2 max-w-[168px] truncate text-center text-[12px] leading-snug font-medium"
          title={label}
        >
          {label}
        </p>
      </div>
    </WorkflowNodeShell>
  );
}

export const TransformNode = memo((props: NodeProps) => {
  const data = props.data as { label?: string; deactivated?: boolean; transformKind?: string };
  if (data.transformKind === "code") {
    return (
      <CodeJavaScriptNode
        label={String(data.label ?? "Code in JavaScript")}
        selected={props.selected}
        deactivated={data.deactivated}
      />
    );
  }
  const isFilter = data.transformKind === "filter";
  return (
    <SimpleNode
      label={String(data.label ?? (isFilter ? "Filter" : "Data transformation"))}
      icon={isFilter ? ListFilter : Wrench}
      accent={isFilter ? "border-sky-500/40" : "border-slate-500/40"}
      selected={props.selected}
      handleAccent={isFilter ? "!bg-sky-500" : "!bg-slate-500"}
      deactivated={data.deactivated}
    />
  );
});
TransformNode.displayName = "TransformNode";
