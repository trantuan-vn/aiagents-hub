"use client";

import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";

import type { Node } from "@xyflow/react";
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

import { getWorkflowExecution, listWorkflowExecutions } from "../../_lib/api";
import { WorkflowExecutionIoPanel } from "../panels/workflow-panels/workflow-execution-io-panel";
import { parseDefinitionJson } from "../panels/workflow-panels/workflow-execution-utils";

import { workflowEditorLogsStore } from "./workflow-editor-logs-store";

interface WorkflowEditorLogsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workflowId: number;
  definitionJson?: string;
  className?: string;
}

function graphNodesFromDefinition(definitionJson?: string): Node[] {
  const graph = parseDefinitionJson(definitionJson);
  return (graph?.nodes ?? []).map((node) => ({
    id: node.id,
    type: node.type ?? "core",
    position: node.position ?? { x: 0, y: 0 },
    data: node.data ?? {},
  }));
}

export function WorkflowEditorLogsPanel({
  open,
  onOpenChange,
  workflowId,
  definitionJson,
  className,
}: WorkflowEditorLogsPanelProps) {
  const t = useTranslations("WorkflowEditorPage");
  const logs = useSyncExternalStore(
    workflowEditorLogsStore.subscribe,
    workflowEditorLogsStore.getState,
    workflowEditorLogsStore.getState,
  );
  const lastOpenGeneration = useRef(0);
  const belongsToWorkflow = logs.workflowId === workflowId;
  const steps = belongsToWorkflow ? logs.steps : [];
  const running = belongsToWorkflow && logs.running;
  const selectedNodeId = belongsToWorkflow ? logs.selectedNodeId : null;
  const nodes = useMemo(() => graphNodesFromDefinition(definitionJson), [definitionJson]);
  const hasData = steps.length > 0;

  useEffect(() => {
    if (!belongsToWorkflow) return;
    if (logs.openGeneration <= lastOpenGeneration.current) return;
    lastOpenGeneration.current = logs.openGeneration;
    onOpenChange(true);
  }, [belongsToWorkflow, logs.openGeneration, onOpenChange]);

  useEffect(() => {
    if (!workflowId) return;
    let cancelled = false;
    void (async () => {
      const current = workflowEditorLogsStore.getState();
      if (current.running) return;
      if (current.workflowId === workflowId && current.steps.length > 0) return;
      try {
        const { executions } = await listWorkflowExecutions(workflowId, 1);
        const latest = executions[0];
        if (!latest?.executionKey || cancelled) return;
        const { execution } = await getWorkflowExecution(latest.executionKey);
        if (cancelled || !execution.steps?.length) return;
        workflowEditorLogsStore.hydrate(workflowId, execution.steps);
      } catch {
        /* keep empty placeholder */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workflowId]);

  return (
    <div className={cn("border-border bg-background min-w-0 w-full shrink-0 overflow-hidden border-t", className)}>
      <div className="flex h-9 items-center justify-between px-3">
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-xs font-medium transition-colors"
          onClick={() => onOpenChange(!open)}
        >
          {open ? <ChevronDown className="size-3.5" /> : <ChevronUp className="size-3.5" />}
          {t("logs_title")}
          {running ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
        </button>
      </div>
      {open ? (
        <div className={cn("min-h-0 min-w-0 overflow-hidden border-t", hasData ? "h-80" : "h-28")}>
          {hasData ? (
            <WorkflowExecutionIoPanel
              hideHeader
              steps={steps}
              nodes={nodes}
              selectedNodeId={selectedNodeId}
              onSelectNode={workflowEditorLogsStore.selectNode}
            />
          ) : (
            <div className="text-muted-foreground flex h-full items-center justify-center px-4 text-center text-sm">
              {running ? t("logs_running") : t("logs_empty")}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
