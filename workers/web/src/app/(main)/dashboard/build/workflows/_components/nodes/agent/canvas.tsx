"use client";

import { memo } from "react";

import { Position, useStore, type NodeProps } from "@xyflow/react";
import { AlertTriangle, Bot } from "lucide-react";
import { useTranslations } from "next-intl";

import { ConnectionHandle } from "../../edges/connection-handle";
import { edgeUsesHandle } from "../../edges/workflow-connection-utils";
import { WorkflowNodeShell } from "../../node-ui/workflow-node-shell";

function useAgentMissingConfig(nodeId: string | undefined) {
  const edges = useStore((s) => s.edges);
  if (!nodeId) return { missingService: true };

  const hasService = edges.some((e) => edgeUsesHandle(e, nodeId, "service", "target"));
  return { missingService: !hasService };
}

function AgentNode({ id, data, selected }: NodeProps) {
  const t = useTranslations("WorkflowEditorPage");
  const d = data as { label?: string; deactivated?: boolean };
  const { missingService } = useAgentMissingConfig(id);
  const showWarning = missingService;

  return (
    <WorkflowNodeShell
      selected={selected}
      accent="border-violet-500/50"
      deactivated={d.deactivated}
      pill
      footer={
        <div className="border-border/60 -mx-1 mt-2 flex justify-around border-t pt-2">
          <ConnectionHandle
            handleId="service"
            type="target"
            position={Position.Bottom}
            accentClass="!bg-blue-500"
            label={t("handle_service")}
            shape="diamond"
            allowedNodeTypes={["service_node"]}
            required
          />
          <ConnectionHandle
            handleId="memory"
            type="target"
            position={Position.Bottom}
            accentClass="!bg-emerald-500"
            label={t("handle_memory")}
            shape="diamond"
            allowedNodeTypes={["memory_node"]}
          />
          <ConnectionHandle
            handleId="tools"
            type="target"
            position={Position.Bottom}
            accentClass="!bg-amber-500"
            label={t("handle_tools")}
            shape="diamond"
            allowedNodeTypes={["tool_node"]}
            allowMultipleConnections
          />
        </div>
      }
    >
      <ConnectionHandle handleId="in" type="target" position={Position.Left} accentClass="!bg-violet-500" />
      <div className="flex items-center justify-center gap-2 font-medium text-violet-700 dark:text-violet-300">
        <Bot className="h-4 w-4 shrink-0" />
        <span className="truncate">{d.label ?? "Agent"}</span>
        {showWarning ? (
          <AlertTriangle className="text-destructive h-4 w-4 shrink-0" aria-label={t("agent_config_warning")} />
        ) : null}
      </div>
      <ConnectionHandle handleId="out" type="source" position={Position.Right} accentClass="!bg-violet-500" />
    </WorkflowNodeShell>
  );
}

export const AgentWorkflowNode = memo(AgentNode);
AgentWorkflowNode.displayName = "AgentWorkflowNode";
