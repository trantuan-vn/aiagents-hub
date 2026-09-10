"use client";

import { memo } from "react";

import { Position, useStore, type NodeProps } from "@xyflow/react";
import { AlertTriangle, Wrench } from "lucide-react";
import { useTranslations } from "next-intl";

import { ConnectionHandle } from "../../edges/connection-handle";
import { edgeUsesHandle } from "../../edges/workflow-connection-utils";
import { WorkflowNodeShell } from "../../node-ui/workflow-node-shell";
import { OracleIcon } from "./oracle-icon";

const ORACLE_TOOL_KINDS = new Set(["save-rag", "get-rag", "get-db-info"]);
const RAG_TOOL_KINDS = new Set(["save-rag", "get-rag"]);

function useRagMissingConfig(nodeId: string | undefined) {
  const edges = useStore((s) => s.edges);
  if (!nodeId) return { missingService: true, missingMemory: true };

  const hasService = edges.some((e) => edgeUsesHandle(e, nodeId, "service", "target"));
  const hasMemory = edges.some((e) => edgeUsesHandle(e, nodeId, "memory", "target"));
  return { missingService: !hasService, missingMemory: !hasMemory };
}

function ToolNode({ id, data, selected }: NodeProps) {
  const t = useTranslations("WorkflowEditorPage");
  const d = data as { label?: string; deactivated?: boolean; toolKind?: string };
  const toolKind = String(d.toolKind ?? "");
  const showOracle = ORACLE_TOOL_KINDS.has(toolKind);
  const isRag = RAG_TOOL_KINDS.has(toolKind);
  const { missingService, missingMemory } = useRagMissingConfig(isRag ? id : undefined);
  const showWarning = isRag && (missingService || missingMemory);

  return (
    <WorkflowNodeShell
      selected={selected}
      accent="border-amber-500/40"
      deactivated={d.deactivated}
      pill
      footer={
        isRag ? (
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
              required
              directPickOnPlus={{
                type: "memory_node",
                label: t("mem_vectorize"),
                extra: { memoryKind: "vectorize", catalogId: "vectorize" },
              }}
            />
          </div>
        ) : undefined
      }
    >
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
        {showOracle ? (
          <OracleIcon className="h-4 w-4" />
        ) : (
          <Wrench className="h-4 w-4 shrink-0 opacity-80" />
        )}
        <span className="max-w-[160px] truncate">{d.label ?? "Tool"}</span>
        {showWarning ? (
          <AlertTriangle className="text-destructive h-4 w-4 shrink-0" aria-label={t("rag_config_warning")} />
        ) : null}
      </div>
      <ConnectionHandle handleId="out" type="source" position={Position.Right} accentClass="!bg-amber-500" />
    </WorkflowNodeShell>
  );
}

export const ToolWorkflowNode = memo(ToolNode);
ToolWorkflowNode.displayName = "ToolWorkflowNode";
