"use client";

import { Position, type NodeProps } from "@xyflow/react";

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
}: NodeProps & {
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
  handleAccent: string;
  handleId: "service" | "memory" | "tools";
  defaultLabel: string;
}) {
  const d = data as { label?: string; deactivated?: boolean; catalogId?: string };

  return (
    <WorkflowNodeShell selected={selected} accent={accent} deactivated={d.deactivated} pill>
      <ConnectionHandle
        handleId={handleId}
        type="source"
        position={Position.Top}
        accentClass={handleAccent}
        shape="diamond"
        showAddNode={false}
      />
      <div className="flex items-center justify-center gap-2 font-medium">
        <Icon className="h-4 w-4 shrink-0 opacity-80" />
        <span className="max-w-[160px] truncate">{d.label ?? defaultLabel}</span>
      </div>
    </WorkflowNodeShell>
  );
}
