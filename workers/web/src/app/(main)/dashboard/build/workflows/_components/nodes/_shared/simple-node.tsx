"use client";

import { Position } from "@xyflow/react";

import { ConnectionHandle } from "../../edges/connection-handle";
import { WorkflowNodeShell } from "../../node-ui/workflow-node-shell";

export function SimpleNode({
  label,
  icon: Icon,
  accent,
  selected,
  handleAccent,
  deactivated,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
  selected?: boolean;
  handleAccent: string;
  deactivated?: boolean;
}) {
  return (
    <WorkflowNodeShell selected={selected} accent={accent} deactivated={deactivated}>
      <ConnectionHandle handleId="in" type="target" position={Position.Left} accentClass={handleAccent} />
      <div className="flex items-center gap-2 font-medium">
        <Icon className="h-4 w-4 opacity-80" />
        {label}
      </div>
      <ConnectionHandle handleId="out" type="source" position={Position.Right} accentClass={handleAccent} />
    </WorkflowNodeShell>
  );
}
