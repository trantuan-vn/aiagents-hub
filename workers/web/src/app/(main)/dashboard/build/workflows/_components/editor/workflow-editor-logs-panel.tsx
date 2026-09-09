"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";

import type { Node } from "@xyflow/react";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

import { getWorkflowExecution, listWorkflowExecutions } from "../../_lib/api";
import { WorkflowExecutionIoPanel } from "../panels/workflow-panels/workflow-execution-io-panel";
import { WorkflowIoPanelPopout } from "../panels/workflow-panels/workflow-io-panel-popout";
import { WorkflowIoPanelToolbar } from "../panels/workflow-panels/workflow-io-panel-toolbar";
import { parseDefinitionJson } from "../panels/workflow-panels/workflow-execution-utils";

import { workflowEditorLogsStore } from "./workflow-editor-logs-store";

let consumedOpenWorkflowId: number | null = null;
let consumedOpenGeneration = 0;

function consumeOpenGeneration(workflowId: number, openGeneration: number): boolean {
  if (consumedOpenWorkflowId !== workflowId) {
    consumedOpenWorkflowId = workflowId;
    consumedOpenGeneration = 0;
  }
  if (openGeneration <= consumedOpenGeneration) return false;
  consumedOpenGeneration = openGeneration;
  return true;
}

interface WorkflowEditorLogsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workflowId: number;
  definitionJson?: string;
  className?: string;
  fill?: boolean;
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
  fill = false,
}: WorkflowEditorLogsPanelProps) {
  const t = useTranslations("WorkflowEditorPage");
  const logs = useSyncExternalStore(
    workflowEditorLogsStore.subscribe,
    workflowEditorLogsStore.getState,
    workflowEditorLogsStore.getState,
  );
  const belongsToWorkflow = logs.workflowId === workflowId;
  const steps = belongsToWorkflow ? logs.steps : [];
  const running = belongsToWorkflow && logs.running;
  const selectedNodeId = belongsToWorkflow ? logs.selectedNodeId : null;
  const nodes = useMemo(() => graphNodesFromDefinition(definitionJson), [definitionJson]);
  const hasData = steps.length > 0;
  const poppedOut = logs.poppedOut;
  const showBody = open || poppedOut;

  useEffect(() => {
    if (!belongsToWorkflow) return;
    if (!consumeOpenGeneration(workflowId, logs.openGeneration)) return;
    if (!workflowEditorLogsStore.getState().poppedOut) onOpenChange(true);
  }, [belongsToWorkflow, logs.openGeneration, onOpenChange, workflowId]);

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

  const panel = (
    <div
      className={cn(
        "border-border bg-background min-w-0 w-full overflow-hidden",
        poppedOut || fill ? "flex h-full min-h-0 flex-col" : "shrink-0 border-t",
        className,
      )}
    >
      <div className={cn("flex h-9 shrink-0 items-center gap-2 px-3", showBody && "border-b")}>
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="text-xs font-medium">{t("logs_title")}</span>
          {running ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
        </div>
        <div className="ml-auto">
          <WorkflowIoPanelToolbar
            showInput={logs.showInput}
            showOutput={logs.showOutput}
            onShowInputChange={workflowEditorLogsStore.setShowInput}
            onShowOutputChange={workflowEditorLogsStore.setShowOutput}
            syncWithCanvas={logs.syncWithCanvas}
            onSyncWithCanvasChange={workflowEditorLogsStore.setSyncWithCanvas}
            poppedOut={poppedOut}
            onPoppedOutChange={(next) => {
              workflowEditorLogsStore.setPoppedOut(next);
              onOpenChange(next ? false : true);
            }}
            collapsed={!open && !poppedOut}
            onCollapsedChange={() => {
              if (poppedOut) {
                workflowEditorLogsStore.setPoppedOut(false);
                onOpenChange(false);
                return;
              }
              onOpenChange(!open);
            }}
          />
        </div>
      </div>
      {showBody ? (
        <div className={cn("min-h-0 min-w-0 overflow-hidden", poppedOut || fill ? "flex-1" : hasData ? "h-80" : "h-28")}>
          {hasData ? (
            <WorkflowExecutionIoPanel
              hideHeader
              steps={steps}
              nodes={nodes}
              selectedNodeId={selectedNodeId}
              onSelectNode={workflowEditorLogsStore.selectNode}
              showInput={logs.showInput}
              showOutput={logs.showOutput}
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

  if (poppedOut) {
    return (
      <WorkflowIoPanelPopout
        open
        title={t("logs_title")}
        onClose={() => {
          workflowEditorLogsStore.setPoppedOut(false);
          onOpenChange(true);
        }}
      >
        {panel}
      </WorkflowIoPanelPopout>
    );
  }

  return panel;
}
