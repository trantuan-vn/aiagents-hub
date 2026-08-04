"use client";

import { memo } from "react";

import { Position, type NodeProps } from "@xyflow/react";
import { Wrench } from "lucide-react";

import { ConnectionHandle } from "../../edges/connection-handle";
import { WorkflowNodeShell } from "../../node-ui/workflow-node-shell";

function ToolNode({ data, selected }: NodeProps) {
  const d = data as { label?: string; deactivated?: boolean };

  return (
    <WorkflowNodeShell selected={selected} accent="border-amber-500/40" deactivated={d.deactivated} pill>
      <ConnectionHandle handleId="in" type="target" position={Position.Left} accentClass="!bg-amber-500" />
      <ConnectionHandle
        handleId="tools"
        type="source"
        position={Position.Top}
        accentClass="!bg-amber-500"
        shape="diamond"
        showAddNode={false}
        clusterClass="absolute left-1/2 top-0 z-20 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-0.5"
      />
      <div className="flex items-center justify-center gap-2 font-medium">
        <Wrench className="h-4 w-4 shrink-0 opacity-80" />
        <span className="max-w-[160px] truncate">{d.label ?? "Tool"}</span>
      </div>
      <ConnectionHandle handleId="out" type="source" position={Position.Right} accentClass="!bg-amber-500" />
    </WorkflowNodeShell>
  );
}

export const ToolWorkflowNode = memo(ToolNode);
ToolWorkflowNode.displayName = "ToolWorkflowNode";
