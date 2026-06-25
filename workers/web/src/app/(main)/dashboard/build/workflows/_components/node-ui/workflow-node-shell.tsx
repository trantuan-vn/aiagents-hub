"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";

import { useNodeId } from "@xyflow/react";

import { cn } from "@/lib/utils";

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

  return (
    <div
      className={cn(
        "group/node relative border bg-card text-sm shadow-md",
        compact
          ? "min-w-0 rounded-none border-0 bg-transparent p-0 shadow-none"
          : cn("min-w-[200px] rounded-lg px-3 py-2.5", pill && "rounded-full px-5 py-2.5"),
        !compact && accent,
        !compact && selected && "ring-2 ring-primary",
        deactivated && "opacity-60",
      )}
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
      {children}
      {footer}
    </div>
  );
}
