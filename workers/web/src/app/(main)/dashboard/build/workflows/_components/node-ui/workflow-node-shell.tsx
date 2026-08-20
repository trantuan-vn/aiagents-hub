"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";

import { useNodeId } from "@xyflow/react";
import { Check, Loader2, Radio, Zap, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

import { useNodeExecutionUi } from "../hooks/workflow-execution-ui";
import { WorkflowNodeToolbar } from "./workflow-node-toolbar";

const HOVER_LEAVE_MS = 180;

interface WorkflowNodeShellProps {
  selected?: boolean;
  accent?: string;
  deactivated?: boolean;
  pill?: boolean;
  /** Minimal chrome — for compact nodes (e.g. n8n-style loop). */
  compact?: boolean;
  children: ReactNode;
  footer?: ReactNode;
}

function ExecutionBadge({
  compact,
}: {
  compact?: boolean;
}) {
  const t = useTranslations("WorkflowEditorPage");
  const nodeId = useNodeId() ?? "";
  const { status, isCurrent, isEntry, isListening, isRunning, workflowRunning } = useNodeExecutionUi(nodeId);

  if (isListening && !workflowRunning) {
    return (
      <span
        className={cn(
          "absolute z-30 flex items-center gap-1 rounded-full bg-rose-600 px-1.5 py-0.5 text-[10px] font-semibold text-white shadow-sm",
          compact ? "-top-1.5 -right-1.5" : "-top-2 -right-1",
        )}
        title={t("node_listening")}
      >
        <Radio className="size-3 animate-pulse" aria-hidden />
        {compact ? null : t("node_listening")}
      </span>
    );
  }

  if (isRunning || isCurrent) {
    return (
      <span
        className={cn(
          "absolute z-30 flex items-center gap-1 rounded-full bg-[#ff6d00] px-1.5 py-0.5 text-[10px] font-semibold text-white shadow-sm",
          compact ? "-top-1.5 -right-1.5" : "-top-2 -right-1",
        )}
        title={t("node_status_running")}
      >
        <Loader2 className="size-3 animate-spin" aria-hidden />
        {compact ? null : t("node_status_running")}
      </span>
    );
  }

  if (isEntry && workflowRunning) {
    return (
      <span
        className={cn(
          "absolute z-30 flex items-center gap-1 rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-semibold text-white shadow-sm",
          compact ? "-top-1.5 -right-1.5" : "-top-2 -right-1",
        )}
        title={t("node_triggered")}
      >
        <Zap className="size-3 fill-current" aria-hidden />
        {compact ? null : t("node_triggered")}
      </span>
    );
  }

  if (status === "error") {
    return (
      <span
        className={cn(
          "absolute z-30 flex size-5 items-center justify-center rounded-full bg-red-600 text-white shadow-sm",
          compact ? "-top-1.5 -right-1.5" : "-top-2 -right-1",
        )}
        title={t("node_status_error")}
      >
        <X className="size-3" aria-hidden />
      </span>
    );
  }

  if (status === "success") {
    return (
      <span
        className={cn(
          "absolute z-30 flex size-5 items-center justify-center rounded-full bg-emerald-600 text-white shadow-sm",
          compact ? "-top-1.5 -right-1.5" : "-top-2 -right-1",
        )}
        title={t("node_status_success")}
      >
        <Check className="size-3" aria-hidden />
      </span>
    );
  }

  return null;
}

export function WorkflowNodeShell({
  selected,
  accent,
  deactivated,
  pill,
  compact,
  children,
  footer,
}: WorkflowNodeShellProps) {
  const nodeId = useNodeId() ?? "";
  const { isRunning, isCurrent, isEntry, isListening, status, workflowRunning } = useNodeExecutionUi(nodeId);
  const [toolbarVisible, setToolbarVisible] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearLeaveTimer = useCallback(() => {
    if (leaveTimer.current != null) {
      clearTimeout(leaveTimer.current);
      leaveTimer.current = null;
    }
  }, []);

  const onToolbarZoneEnter = useCallback(() => {
    clearLeaveTimer();
    setToolbarVisible(true);
  }, [clearLeaveTimer]);

  const scheduleToolbarHide = useCallback(() => {
    clearLeaveTimer();
    leaveTimer.current = setTimeout(() => setToolbarVisible(false), HOVER_LEAVE_MS);
  }, [clearLeaveTimer]);

  const onToolbarZoneLeave = useCallback(() => {
    if (menuOpen) return;
    scheduleToolbarHide();
  }, [menuOpen, scheduleToolbarHide]);

  const onMenuOpenChange = useCallback(
    (open: boolean) => {
      setMenuOpen(open);
      if (open) {
        clearLeaveTimer();
        setToolbarVisible(true);
        return;
      }
      scheduleToolbarHide();
    },
    [clearLeaveTimer, scheduleToolbarHide],
  );

  const runningRing = isRunning || isCurrent;
  const triggerRing = (isEntry && workflowRunning) || isListening;

  return (
    <div
      className={cn(
        "group/node relative border bg-card text-sm shadow-md",
        compact
          ? cn(
              "min-w-0 rounded-none border-0 bg-transparent p-0 shadow-none",
              runningRing && "workflow-node-exec-running rounded-[12px]",
              !runningRing && triggerRing && "workflow-node-exec-trigger rounded-[12px]",
            )
          : cn("min-w-[200px] rounded-lg px-3 py-2.5", pill && "rounded-full px-5 py-2.5"),
        !compact && accent,
        !compact && selected && "ring-2 ring-primary",
        !compact && runningRing && "workflow-node-exec-running",
        !compact && !runningRing && triggerRing && "workflow-node-exec-trigger",
        !compact && !runningRing && status === "error" && "ring-2 ring-red-500/70",
        !compact && !runningRing && status === "success" && "ring-1 ring-emerald-500/50",
        deactivated && "opacity-60",
      )}
      aria-busy={runningRing}
      onPointerEnter={onToolbarZoneEnter}
      onPointerLeave={onToolbarZoneLeave}
    >
      <WorkflowNodeToolbar
        nodeId={nodeId}
        deactivated={deactivated}
        visible={toolbarVisible || menuOpen}
        onPointerEnter={onToolbarZoneEnter}
        onPointerLeave={onToolbarZoneLeave}
        onMenuOpenChange={onMenuOpenChange}
      />
      <ExecutionBadge compact={compact} />
      {children}
      {footer}
    </div>
  );
}
