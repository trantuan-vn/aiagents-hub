"use client";

import type { Node } from "@xyflow/react";
import { Check, CircleAlert, Clock, Minus, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { cn } from "@/lib/utils";

import type { ExecutionStepLog } from "../../../_lib/api";

import { WorkflowResizeHandle, workflowResizePanelClassName } from "../../layout/workflow-resize-handle";
import { WorkflowExecutionDataPane } from "./workflow-execution-data-view";
import { formatDuration, nodeKindLabel, nodeLabel } from "./workflow-execution-utils";
import { WorkflowIoPanelPopout } from "./workflow-io-panel-popout";
import { WorkflowIoPanelToolbar } from "./workflow-io-panel-toolbar";

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
  dataKey,
  selectedStep,
  selectedNodeId,
  showInput,
  showOutput,
}: {
  dataKey: string;
  selectedStep: ExecutionStepLog | null;
  selectedNodeId: string | null;
  showInput: boolean;
  showOutput: boolean;
}) {
  const t = useTranslations("WorkflowEditorPage");
  if (selectedStep) {
    if (showInput && showOutput) {
      return (
        <ResizablePanelGroup
          direction="horizontal"
          autoSaveId="workflow-executions-io-columns-v2"
          className="h-full min-h-0 min-w-0 flex-1"
        >
          <ResizablePanel id="input" order={1} defaultSize={50} minSize={22} className={workflowResizePanelClassName}>
            <WorkflowExecutionDataPane
              key={`${dataKey}:input`}
              title={t("executions_input")}
              value={selectedStep.input}
              emptyLabel={t("executions_no_data")}
            />
          </ResizablePanel>
          <WorkflowResizeHandle />
          <ResizablePanel id="output" order={2} defaultSize={50} minSize={22} className={workflowResizePanelClassName}>
            <WorkflowExecutionDataPane
              key={`${dataKey}:output`}
              title={t("executions_output")}
              value={selectedStep.output}
              emptyLabel={selectedStep.status === "error" ? t("executions_detail_error") : t("executions_no_data")}
            />
          </ResizablePanel>
        </ResizablePanelGroup>
      );
    }
    if (showInput) {
      return (
        <WorkflowExecutionDataPane
          key={`${dataKey}:input`}
          title={t("executions_input")}
          value={selectedStep.input}
          emptyLabel={t("executions_no_data")}
        />
      );
    }
    return (
      <WorkflowExecutionDataPane
        key={`${dataKey}:output`}
        title={t("executions_output")}
        value={selectedStep.output}
        emptyLabel={selectedStep.status === "error" ? t("executions_detail_error") : t("executions_no_data")}
      />
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
  title,
  showInput,
  showOutput,
  onShowInputChange,
  onShowOutputChange,
  syncWithCanvas,
  onSyncWithCanvasChange,
  poppedOut,
  onPoppedOutChange,
  collapsed,
  onToggle,
}: {
  title: string | null;
  showInput: boolean;
  showOutput: boolean;
  onShowInputChange: (show: boolean) => void;
  onShowOutputChange: (show: boolean) => void;
  syncWithCanvas: boolean;
  onSyncWithCanvasChange: (sync: boolean) => void;
  poppedOut: boolean;
  onPoppedOutChange: (poppedOut: boolean) => void;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const t = useTranslations("WorkflowEditorPage");
  return (
    <div
      data-workflow-io-drag-handle={poppedOut ? true : undefined}
      className={cn(
        "flex h-9 shrink-0 items-center gap-2 px-3",
        (!collapsed || poppedOut) && "border-b",
        poppedOut && "cursor-grab touch-none select-none active:cursor-grabbing",
      )}
    >
      <p className="shrink-0 text-xs font-medium">{t("executions_node_data")}</p>
      {title ? <span className="text-muted-foreground min-w-0 truncate text-[11px]">{title}</span> : null}
      <div className="ml-auto">
        <WorkflowIoPanelToolbar
          showInput={showInput}
          showOutput={showOutput}
          onShowInputChange={onShowInputChange}
          onShowOutputChange={onShowOutputChange}
          syncWithCanvas={syncWithCanvas}
          onSyncWithCanvasChange={onSyncWithCanvasChange}
          poppedOut={poppedOut}
          onPoppedOutChange={onPoppedOutChange}
          collapsed={collapsed}
          onCollapsedChange={onToggle}
        />
      </div>
    </div>
  );
}

export function WorkflowExecutionIoPanel({
  executionKey,
  steps,
  nodes,
  selectedNodeId,
  onSelectNode,
  collapsed = false,
  onCollapsedChange,
  hideHeader = false,
  showInput = true,
  showOutput = true,
  onShowInputChange,
  onShowOutputChange,
  syncWithCanvas = true,
  onSyncWithCanvasChange,
  poppedOut = false,
  onPoppedOutChange,
}: {
  executionKey?: string;
  steps: ExecutionStepLog[];
  nodes: Node[];
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  hideHeader?: boolean;
  showInput?: boolean;
  showOutput?: boolean;
  onShowInputChange?: (show: boolean) => void;
  onShowOutputChange?: (show: boolean) => void;
  syncWithCanvas?: boolean;
  onSyncWithCanvasChange?: (sync: boolean) => void;
  poppedOut?: boolean;
  onPoppedOutChange?: (poppedOut: boolean) => void;
}) {
  const t = useTranslations("WorkflowEditorPage");
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const selectedStep = steps.find((s) => s.nodeId === selectedNodeId) ?? null;
  const selectedNode = selectedNodeId ? nodeById.get(selectedNodeId) : undefined;
  const title =
    selectedNode || selectedStep ? nodeLabel(selectedNode, selectedStep?.nodeId ?? selectedNodeId ?? "") : null;
  const showBody = hideHeader || poppedOut || !collapsed;
  const showIo = showInput || showOutput;
  const dataKey = `${executionKey ?? "run"}:${selectedNodeId ?? "none"}:${selectedStep?.status ?? ""}:${selectedStep?.durationMs ?? ""}`;

  const body = !showBody ? null : !showIo ? (
    <div className="h-full min-h-0 flex-1 overflow-y-auto">
      <StepList steps={steps} nodeById={nodeById} selectedNodeId={selectedNodeId} onSelectNode={onSelectNode} />
    </div>
  ) : (
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
          <IoColumns
            key={dataKey}
            dataKey={dataKey}
            selectedStep={selectedStep}
            selectedNodeId={selectedNodeId}
            showInput={showInput}
            showOutput={showOutput}
          />
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );

  const panel = (
    <div
      className={cn(
        "bg-background flex min-h-0 min-w-0 w-full flex-col overflow-hidden",
        !hideHeader && collapsed && !poppedOut && "border-t",
        showBody && "h-full",
      )}
    >
      {hideHeader ? null : (
        <IoPanelHeader
          title={title}
          showInput={showInput}
          showOutput={showOutput}
          onShowInputChange={onShowInputChange ?? (() => undefined)}
          onShowOutputChange={onShowOutputChange ?? (() => undefined)}
          syncWithCanvas={syncWithCanvas}
          onSyncWithCanvasChange={onSyncWithCanvasChange ?? (() => undefined)}
          poppedOut={poppedOut}
          onPoppedOutChange={onPoppedOutChange ?? (() => undefined)}
          collapsed={collapsed && !poppedOut}
          onToggle={() => {
            if (poppedOut) {
              onPoppedOutChange?.(false);
              onCollapsedChange?.(true);
              return;
            }
            onCollapsedChange?.(!collapsed);
          }}
        />
      )}
      {body}
    </div>
  );

  if (poppedOut && !hideHeader) {
    return (
      <WorkflowIoPanelPopout
        open
        title={t("executions_node_data")}
        onClose={() => onPoppedOutChange?.(false)}
      >
        {panel}
      </WorkflowIoPanelPopout>
    );
  }

  return panel;
}
