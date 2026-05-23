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
  children: ReactNode;
  footer?: ReactNode;
}

export function WorkflowNodeShell({ selected, accent, deactivated, children, footer }: WorkflowNodeShellProps) {
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
        "group/node relative min-w-[200px] rounded-lg border bg-card px-3 py-2.5 text-sm shadow-md",
        accent,
        selected && "ring-2 ring-primary",
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
