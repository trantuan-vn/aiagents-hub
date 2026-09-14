"use client";

import { Position, type NodeProps } from "@xyflow/react";

import { cn } from "@/lib/utils";

import { ConnectionHandle } from "../../edges/connection-handle";
import { WorkflowNodeShell } from "../../node-ui/workflow-node-shell";

export function ResourceNode({
  data,
  selected,
  icon: Icon,
  accent,
  handleAccent,
  handleId,
  defaultLabel,
  variant = "pill",
}: NodeProps & {
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
  handleAccent: string;
  handleId: "service" | "memory" | "tools";
  defaultLabel: string;
  variant?: "pill" | "circle";
}) {
  const d = data as { label?: string; deactivated?: boolean; catalogId?: string };
  const label = d.label ?? defaultLabel;

  if (variant === "circle") {
    return (
      <WorkflowNodeShell selected={selected} deactivated={d.deactivated} compact>
        <div className="flex flex-col items-center">
          <div
            className={cn(
              "relative flex size-[84px] items-center justify-center rounded-full border-[7px] border-muted bg-card shadow-sm",
              selected && "ring-2 ring-primary ring-offset-2",
              accent,
            )}
          >
            <ConnectionHandle
              handleId={handleId}
              type="source"
              position={Position.Top}
              accentClass={handleAccent}
              shape="diamond"
              showAddNode={false}
              allowMultipleConnections
              clusterClass="absolute left-1/2 top-0 z-20 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
            />
            <Icon className="size-7 opacity-80" />
          </div>
          <span className="mt-2 max-w-[160px] truncate text-center text-sm font-medium">{label}</span>
        </div>
      </WorkflowNodeShell>
    );
  }

  return (
    <WorkflowNodeShell selected={selected} accent={accent} deactivated={d.deactivated} pill>
      <ConnectionHandle
        handleId={handleId}
        type="source"
        position={Position.Top}
        accentClass={handleAccent}
        shape="diamond"
        showAddNode={false}
        allowMultipleConnections
      />
      <div className="flex items-center justify-center gap-2 font-medium">
        <Icon className="h-4 w-4 shrink-0 opacity-80" />
        <span className="max-w-[160px] truncate">{label}</span>
      </div>
    </WorkflowNodeShell>
  );
}
