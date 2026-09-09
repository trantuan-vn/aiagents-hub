"use client";

import { useEffect, useState } from "react";

import { Copy, Download, Wand2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Textarea } from "@/components/ui/textarea";
import { cn, formatUsd } from "@/lib/utils";

import {
  autofixWorkflow,
  resumeWorkflowExecution,
  type WorkflowExecutionGraph as ExecutionGraph,
  type WorkflowExecutionRecord,
} from "../../../_lib/api";

import { WorkflowResizeHandle, workflowResizePanelClassName } from "../../layout/workflow-resize-handle";
import { WorkflowExecutionGraph } from "./workflow-execution-graph";
import { WorkflowExecutionIoPanel } from "./workflow-execution-io-panel";
import { ExecutionStatusGlyph } from "./workflow-execution-list";
import { durationMsOf, executionExportPayload, formatDataSize, formatDuration } from "./workflow-execution-utils";

function exportExecution(selected: WorkflowExecutionRecord) {
  const blob = new Blob([executionExportPayload(selected)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `execution-${selected.executionKey.slice(0, 8)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function ExecutionMetaBar({
  selected,
  onApplyDefinition,
  onCopiedToEditor,
}: {
  selected: WorkflowExecutionRecord;
  onApplyDefinition?: (definitionJson: string) => void;
  onCopiedToEditor?: () => void;
}) {
  const t = useTranslations("WorkflowEditorPage");
  const onCopyToEditor = () => {
    if (!selected.definition || !onApplyDefinition) return;
    onApplyDefinition(JSON.stringify(selected.definition));
    toast.success(t("executions_copied_to_editor"));
    onCopiedToEditor?.();
  };
  const onCopyId = async () => {
    try {
      await navigator.clipboard.writeText(selected.executionKey);
      toast.success(t("executions_copied_id"));
    } catch {
      toast.error(selected.executionKey);
    }
  };

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-2">
      <div className="flex items-center gap-2 text-sm font-medium">
        <ExecutionStatusGlyph status={selected.status} />
        {t(`executions_status_${selected.status}`)}
      </div>
      <span className="text-muted-foreground text-xs tabular-nums">{formatDuration(durationMsOf(selected))}</span>
      <span className="text-muted-foreground text-xs tabular-nums">
        {formatDataSize({ steps: selected.steps, output: selected.output })}
      </span>
      <button
        type="button"
        onClick={() => void onCopyId()}
        className="text-muted-foreground hover:text-foreground flex items-center gap-1 font-mono text-[11px]"
        title={selected.executionKey}
      >
        {selected.executionKey.slice(0, 8)}
        <Copy className="size-3" aria-hidden />
      </button>
      <span className="text-muted-foreground hidden text-xs sm:inline">
        {t("executions_col_cost")}: {formatUsd(selected.totalCostVnd)}
      </span>
      <div className="ml-auto flex flex-wrap items-center gap-1.5">
        {onApplyDefinition && selected.definition ? (
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onCopyToEditor}>
            {t("executions_copy_to_editor")}
          </Button>
        ) : null}
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => exportExecution(selected)}>
          <Download className="size-3.5" />
          {t("executions_export")}
        </Button>
      </div>
    </div>
  );
}

function ExecutionAlerts({
  workflowId,
  selected,
  onApplyDefinition,
  onCopiedToEditor,
  onReload,
}: {
  workflowId: number;
  selected: WorkflowExecutionRecord;
  onApplyDefinition?: (definitionJson: string) => void;
  onCopiedToEditor?: () => void;
  onReload: () => Promise<void>;
}) {
  const t = useTranslations("WorkflowEditorPage");
  const [reviewNote, setReviewNote] = useState("");
  const [resuming, setResuming] = useState(false);
  const [fixing, setFixing] = useState(false);

  const onAutofix = async () => {
    if (!onApplyDefinition) return;
    setFixing(true);
    try {
      const fixed = await autofixWorkflow(workflowId, { error: selected.error });
      onApplyDefinition(JSON.stringify(fixed.definition));
      toast.success(fixed.notes || t("ai_autofix_done"));
      onCopiedToEditor?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("ai_build_error"));
    } finally {
      setFixing(false);
    }
  };

  const onResume = async (decision: "approve" | "reject") => {
    setResuming(true);
    try {
      await resumeWorkflowExecution(selected.executionKey, {
        decision,
        note: reviewNote.trim() || undefined,
      });
      setReviewNote("");
      await onReload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to resume execution");
    } finally {
      setResuming(false);
    }
  };

  return (
    <>
      {selected.status === "pending_human" ? (
        <div className="flex shrink-0 flex-wrap items-end gap-2 border-b bg-amber-500/5 px-4 py-2">
          <Textarea
            value={reviewNote}
            onChange={(e) => setReviewNote(e.target.value)}
            placeholder={t("executions_review_note_placeholder")}
            rows={1}
            className="min-h-8 min-w-[200px] flex-1 text-xs"
          />
          <Button size="sm" className="h-8" onClick={() => void onResume("approve")} disabled={resuming}>
            {resuming ? t("executions_resuming") : t("executions_approve")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8"
            onClick={() => void onResume("reject")}
            disabled={resuming}
          >
            {t("executions_reject")}
          </Button>
        </div>
      ) : null}
      {selected.error ? (
        <div className="flex shrink-0 items-start gap-2 border-b border-red-500/20 bg-red-500/5 px-4 py-2">
          <p className="min-w-0 flex-1 font-mono text-[11px] break-words text-red-600 dark:text-red-400">
            {selected.error}
          </p>
          {onApplyDefinition && selected.status === "failed" ? (
            <Button
              size="sm"
              variant="outline"
              className="h-7 shrink-0 text-xs"
              onClick={() => void onAutofix()}
              disabled={fixing}
            >
              <Wand2 className={cn("size-3.5", fixing && "animate-pulse")} />
              {fixing ? t("ai_autofix_running") : t("ai_autofix")}
            </Button>
          ) : null}
        </div>
      ) : null}
      {selected.truncated ? (
        <p className="text-muted-foreground shrink-0 border-b px-4 py-1.5 text-[11px]">{t("executions_truncated")}</p>
      ) : null}
    </>
  );
}

function ExecutionSplit({
  selected,
  graphDefinition,
  selectedNodeId,
  onSelectNode,
}: {
  selected: WorkflowExecutionRecord;
  graphDefinition: ExecutionGraph | undefined;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string | null) => void;
}) {
  const t = useTranslations("WorkflowEditorPage");
  const [ioCollapsed, setIoCollapsed] = useState(false);
  const [showInput, setShowInput] = useState(true);
  const [showOutput, setShowOutput] = useState(true);
  const [syncWithCanvas, setSyncWithCanvas] = useState(true);
  const [poppedOut, setPoppedOut] = useState(false);
  const [canvasNodeId, setCanvasNodeId] = useState<string | null>(null);
  const graphNodes = (graphDefinition?.nodes ?? []).map((n) => ({
    id: n.id,
    type: n.type ?? "core",
    position: n.position ?? { x: 0, y: 0 },
    data: n.data ?? {},
  }));
  const hasGraph = Boolean(graphDefinition && graphDefinition.nodes.length > 0);
  const layoutCollapsed = ioCollapsed || poppedOut;
  const graphSelectedId = syncWithCanvas ? selectedNodeId : canvasNodeId;

  useEffect(() => {
    setCanvasNodeId(null);
  }, [selected.executionKey]);

  const onGraphSelect = (nodeId: string | null) => {
    if (syncWithCanvas) onSelectNode(nodeId);
    else setCanvasNodeId(nodeId);
  };

  const onPanelSelect = (nodeId: string) => {
    onSelectNode(nodeId);
    if (syncWithCanvas) setCanvasNodeId(nodeId);
  };

  const ioPanel = (
    <WorkflowExecutionIoPanel
      steps={selected.steps}
      nodes={graphNodes}
      selectedNodeId={selectedNodeId}
      onSelectNode={onPanelSelect}
      collapsed={ioCollapsed && !poppedOut}
      onCollapsedChange={(next) => {
        setIoCollapsed(next);
        if (next) setPoppedOut(false);
      }}
      showInput={showInput}
      showOutput={showOutput}
      onShowInputChange={setShowInput}
      onShowOutputChange={setShowOutput}
      syncWithCanvas={syncWithCanvas}
      onSyncWithCanvasChange={setSyncWithCanvas}
      poppedOut={poppedOut}
      onPoppedOutChange={(next) => {
        setPoppedOut(next);
        if (next) setIoCollapsed(false);
      }}
    />
  );

  return (
    <>
      <ResizablePanelGroup direction="vertical" className="min-h-0 flex-1">
        <ResizablePanel
          id="graph"
          order={1}
          defaultSize={layoutCollapsed ? 100 : 62}
          minSize={28}
          className={workflowResizePanelClassName}
        >
          {hasGraph ? (
            <WorkflowExecutionGraph
              key={selected.executionKey}
              executionKey={selected.executionKey}
              definition={graphDefinition}
              steps={selected.steps}
              selectedNodeId={graphSelectedId}
              running={selected.status === "running"}
              onSelectNode={onGraphSelect}
            />
          ) : (
            <div className="flex h-full items-center justify-center p-6">
              <p className="text-muted-foreground max-w-sm text-center text-xs">{t("executions_no_graph")}</p>
            </div>
          )}
        </ResizablePanel>
        {layoutCollapsed ? null : <WorkflowResizeHandle />}
        {layoutCollapsed ? null : (
          <ResizablePanel id="io" order={2} defaultSize={38} minSize={18} className={workflowResizePanelClassName}>
            {ioPanel}
          </ResizablePanel>
        )}
      </ResizablePanelGroup>
      {ioCollapsed && !poppedOut ? ioPanel : null}
      {poppedOut ? ioPanel : null}
    </>
  );
}

export function WorkflowExecutionWorkspace({
  workflowId,
  selected,
  graphDefinition,
  selectedNodeId,
  onSelectNode,
  onApplyDefinition,
  onCopiedToEditor,
  onReload,
}: {
  workflowId: number;
  selected: WorkflowExecutionRecord;
  graphDefinition: ExecutionGraph | undefined;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string | null) => void;
  onApplyDefinition?: (definitionJson: string) => void;
  onCopiedToEditor?: () => void;
  onReload: () => Promise<void>;
}) {
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <ExecutionMetaBar selected={selected} onApplyDefinition={onApplyDefinition} onCopiedToEditor={onCopiedToEditor} />
      <ExecutionAlerts
        workflowId={workflowId}
        selected={selected}
        onApplyDefinition={onApplyDefinition}
        onCopiedToEditor={onCopiedToEditor}
        onReload={onReload}
      />
      <ExecutionSplit
        selected={selected}
        graphDefinition={graphDefinition}
        selectedNodeId={selectedNodeId}
        onSelectNode={onSelectNode}
      />
    </div>
  );
}
