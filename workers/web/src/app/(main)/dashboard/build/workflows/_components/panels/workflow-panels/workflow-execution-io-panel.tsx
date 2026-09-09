"use client";

import type { Node } from "@xyflow/react";
import { Check, ChevronDown, CircleAlert, Clock, Minus, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { cn } from "@/lib/utils";

import type { ExecutionStepLog } from "../../../_lib/api";

import { WorkflowResizeHandle, workflowResizePanelClassName } from "../../layout/workflow-resize-handle";
import { WorkflowExecutionDataPane } from "./workflow-execution-data-view";
import { formatDuration, nodeKindLabel, nodeLabel } from "./workflow-execution-utils";

function StepStatusIcon({ status }: { status: ExecutionStepLog["status"] }) {
  if (status === "success") {
    return <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden />;
  }
  if (status === "error") {
    return <X className="size-3.5 text-red-600 dark:text-red-400" aria-hidden />;
  }
  if (status === "pending_human") {
    return <Clock className="size-3.5 text-amber-600 dark:text-amber-400" aria-hidden />;
  }
  return <Minus className="text-muted-foreground size-3.5" aria-hidden />;
}

function StepList({
  steps,
  nodeById,
  selectedNodeId,
  onSelectNode,
}: {
  steps: ExecutionStepLog[];
  nodeById: Map<string, Node>;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
}) {
  const t = useTranslations("WorkflowEditorPage");
  if (steps.length === 0) {
    return <p className="text-muted-foreground p-3 text-xs">{t("obs_no_timeline")}</p>;
  }
  return (
    <ul>
      {steps.map((step) => {
        const node = nodeById.get(step.nodeId);
        return (
          <li key={step.nodeId}>
            <button
              type="button"
              onClick={() => onSelectNode(step.nodeId)}
              className={cn(
                "flex w-full items-start gap-2 px-3 py-2 text-left transition-colors",
                selectedNodeId === step.nodeId ? "bg-muted" : "hover:bg-muted/50",
              )}
            >
              <span className="mt-0.5">
                <StepStatusIcon status={step.status} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] font-medium">{nodeLabel(node, step.nodeId)}</span>
                <span className="text-muted-foreground block truncate text-[10px] capitalize">
                  {nodeKindLabel(node, step.nodeType)}
                  {step.durationMs != null ? ` · ${formatDuration(step.durationMs)}` : ""}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function IoColumns({
  selectedStep,
  selectedNodeId,
}: {
  selectedStep: ExecutionStepLog | null;
  selectedNodeId: string | null;
}) {
  const t = useTranslations("WorkflowEditorPage");
  if (selectedStep) {
    return (
      <ResizablePanelGroup
        direction="horizontal"
        autoSaveId="workflow-executions-io-columns-v2"
        className="h-full min-h-0 min-w-0 flex-1"
      >
        <ResizablePanel id="input" order={1} defaultSize={50} minSize={22} className={workflowResizePanelClassName}>
          <WorkflowExecutionDataPane
            title={t("executions_input")}
            value={selectedStep.input}
            emptyLabel={t("executions_no_data")}
          />
        </ResizablePanel>
        <WorkflowResizeHandle />
        <ResizablePanel id="output" order={2} defaultSize={50} minSize={22} className={workflowResizePanelClassName}>
          <WorkflowExecutionDataPane
            title={t("executions_output")}
            value={selectedStep.output}
            emptyLabel={selectedStep.status === "error" ? t("executions_detail_error") : t("executions_no_data")}
          />
        </ResizablePanel>
      </ResizablePanelGroup>
    );
  }
  if (selectedNodeId) {
    return (
      <div className="text-muted-foreground flex flex-1 items-center justify-center gap-2 p-6 text-xs">
        <CircleAlert className="size-3.5" aria-hidden />
        {t("executions_node_not_run")}
      </div>
    );
  }
  return (
    <p className="text-muted-foreground flex flex-1 items-center justify-center p-6 text-xs">
      {t("executions_select_node")}
    </p>
  );
}

function IoPanelHeader({
  collapsed,
  title,
  onToggle,
}: {
  collapsed: boolean;
  title: string | null;
  onToggle: () => void;
}) {
  const t = useTranslations("WorkflowEditorPage");
  return (
    <div className="flex h-8 shrink-0 items-center gap-2 border-b px-3">
      <button
        type="button"
        className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-[11px] font-medium"
        onClick={onToggle}
      >
        <ChevronDown className={cn("size-3.5 transition-transform", collapsed && "-rotate-90")} aria-hidden />
        {collapsed ? t("executions_expand_details") : t("executions_collapse_details")}
      </button>
      {title ? <span className="text-muted-foreground truncate text-[11px]">{title}</span> : null}
    </div>
  );
}

export function WorkflowExecutionIoPanel({
  steps,
  nodes,
  selectedNodeId,
  onSelectNode,
  collapsed = false,
  onCollapsedChange,
  hideHeader = false,
}: {
  steps: ExecutionStepLog[];
  nodes: Node[];
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  hideHeader?: boolean;
}) {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const selectedStep = steps.find((s) => s.nodeId === selectedNodeId) ?? null;
  const selectedNode = selectedNodeId ? nodeById.get(selectedNodeId) : undefined;
  const title =
    selectedNode || selectedStep ? nodeLabel(selectedNode, selectedStep?.nodeId ?? selectedNodeId ?? "") : null;
  const showBody = hideHeader || !collapsed;

  return (
    <div
      className={cn(
        "bg-background flex min-h-0 min-w-0 w-full flex-col overflow-hidden",
        !hideHeader && collapsed && "border-t",
        showBody && "h-full",
      )}
    >
      {hideHeader ? null : (
        <IoPanelHeader collapsed={collapsed} title={title} onToggle={() => onCollapsedChange?.(!collapsed)} />
      )}
      {showBody ? (
        <ResizablePanelGroup
          direction="horizontal"
          autoSaveId="workflow-executions-io-steps-v2"
          className="h-full min-h-0 min-w-0 flex-1"
        >
          <ResizablePanel id="steps" order={1} defaultSize={22} minSize={12} maxSize={42} className={workflowResizePanelClassName}>
            <div className="h-full min-h-0 overflow-y-auto">
              <StepList steps={steps} nodeById={nodeById} selectedNodeId={selectedNodeId} onSelectNode={onSelectNode} />
            </div>
          </ResizablePanel>
          <WorkflowResizeHandle />
          <ResizablePanel id="data" order={2} defaultSize={78} minSize={40} className={workflowResizePanelClassName}>
            <div className="flex h-full min-h-0 min-w-0 overflow-hidden">
              <IoColumns selectedStep={selectedStep} selectedNodeId={selectedNodeId} />
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      ) : null}
    </div>
  );
}
