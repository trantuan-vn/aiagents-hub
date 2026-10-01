"use client";

import { memo } from "react";

import { Position, useStore, type NodeProps } from "@xyflow/react";
import { AlertTriangle, Wrench } from "lucide-react";
import { useTranslations } from "next-intl";

import { ConnectionHandle } from "../../edges/connection-handle";
import { edgeUsesHandle } from "../../edges/workflow-connection-utils";
import { WorkflowNodeShell } from "../../node-ui/workflow-node-shell";
import { OracleIcon } from "./oracle-icon";

const ORACLE_TOOL_KINDS = new Set(["save-rag", "save-sql-pair", "get-rag", "get-db-info", "check-sql"]);
const SERVICE_TOOL_KINDS = new Set(["save-rag", "get-rag"]);
const MEMORY_TOOL_KINDS = new Set(["save-rag", "get-rag", "save-sql-pair"]);

function useToolResourceGaps(nodeId: string | undefined, toolKind: string, needsLlm: boolean) {
  const edges = useStore((s) => s.edges);
  const needsService = SERVICE_TOOL_KINDS.has(toolKind);
  const needsMemory = MEMORY_TOOL_KINDS.has(toolKind);
  if (!nodeId || (!needsService && !needsMemory && !needsLlm)) {
    return { missingService: false, missingMemory: false, missingLlm: false };
  }

  const hasService = edges.some((e) => edgeUsesHandle(e, nodeId, "service", "target"));
  const hasMemory = edges.some((e) => edgeUsesHandle(e, nodeId, "memory", "target"));
  const hasLlm = edges.some((e) => edgeUsesHandle(e, nodeId, "llm", "target"));
  return {
    missingService: needsService && !hasService,
    missingMemory: needsMemory && !hasMemory,
    missingLlm: needsLlm && !hasLlm,
  };
}

function ToolNode({ id, data, selected }: NodeProps) {
  const t = useTranslations("WorkflowEditorPage");
  const d = data as { label?: string; deactivated?: boolean; toolKind?: string; describeSystemPrompt?: string };
  const toolKind = String(d.toolKind ?? "");
  const showOracle = ORACLE_TOOL_KINDS.has(toolKind);
  const showService = SERVICE_TOOL_KINDS.has(toolKind);
  const showMemory = MEMORY_TOOL_KINDS.has(toolKind);
  const isSaveRag = toolKind === "save-rag";
  const isSqlPair = toolKind === "save-sql-pair";
  const needsLlm = isSaveRag || (isSqlPair && String(d.describeSystemPrompt ?? "").trim().length > 0);
  const showLlm = isSaveRag || isSqlPair;
  const { missingService, missingMemory, missingLlm } = useToolResourceGaps(id, toolKind, needsLlm);
  const showWarning = missingService || missingMemory || missingLlm;

  return (
    <WorkflowNodeShell
      selected={selected}
      accent="border-amber-500/40"
      deactivated={d.deactivated}
      pill
      footer={
        showMemory ? (
          <div className="border-border/60 -mx-1 mt-2 flex justify-around border-t pt-2">
            {showService ? (
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
            ) : null}
            {showLlm ? (
              <ConnectionHandle
                handleId="llm"
                type="target"
                position={Position.Bottom}
                accentClass="!bg-violet-500"
                label={t("handle_llm")}
                shape="diamond"
                allowedNodeTypes={["service_node"]}
                required={needsLlm}
              />
            ) : null}
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
      {isSqlPair ? null : (
        <ConnectionHandle
          handleId="tools"
          type="source"
          position={Position.Top}
          accentClass="!bg-amber-500"
          shape="diamond"
          showAddNode={false}
          clusterClass="absolute left-1/2 top-0 z-20 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-0.5"
        />
      )}
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
