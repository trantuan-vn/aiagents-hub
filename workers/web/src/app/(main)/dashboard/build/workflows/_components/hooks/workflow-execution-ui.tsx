"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

import { useWs } from "@/core/use-ws";
import { useDashboardUser } from "@/app/(main)/dashboard/_context/dashboard-user-context";

import type { ExecutionStepLog } from "../../_lib/api";

export type NodeRunStatus = "running" | "success" | "error" | "skipped" | "pending_human";

export type WorkflowExecutionProgressEvent = {
  type: "started" | "node_start" | "node_done" | "finished";
  workflowId: number;
  executionKey: string;
  entryNodeId?: string;
  nodeId?: string;
  status?: string;
};

export type WorkflowExecutionUiValue = {
  running: boolean;
  entryNodeId: string | null;
  currentNodeId: string | null;
  listeningNodeId: string | null;
  statusByNodeId: Record<string, NodeRunStatus>;
  startRun: (entryNodeId: string) => void;
  finishRun: (steps?: ExecutionStepLog[]) => void;
};

const WorkflowExecutionUiContext = createContext<WorkflowExecutionUiValue | null>(null);

export function useWorkflowExecutionUi(): WorkflowExecutionUiValue | null {
  return useContext(WorkflowExecutionUiContext);
}

export function useNodeExecutionUi(nodeId: string) {
  const ui = useWorkflowExecutionUi();
  const status = ui?.statusByNodeId[nodeId];
  const isCurrent = ui?.currentNodeId === nodeId;
  const isEntry = ui?.entryNodeId === nodeId;
  const isListening = ui?.listeningNodeId === nodeId;
  const isRunning = isCurrent || status === "running" || isListening;
  return {
    status,
    isCurrent,
    isEntry: !!isEntry,
    isListening: !!isListening,
    isRunning,
    workflowRunning: !!ui?.running,
    busyForStep: !!ui?.running && (ui.entryNodeId === nodeId || ui.currentNodeId === nodeId),
  };
}

function statusesFromSteps(steps: ExecutionStepLog[]): Record<string, NodeRunStatus> {
  const next: Record<string, NodeRunStatus> = {};
  for (const step of steps) {
    if (step.status === "success" || step.status === "error" || step.status === "skipped" || step.status === "pending_human") {
      next[step.nodeId] = step.status;
    }
  }
  return next;
}

function isProgressEvent(value: unknown): value is WorkflowExecutionProgressEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as WorkflowExecutionProgressEvent;
  return (
    (event.type === "started" || event.type === "node_start" || event.type === "node_done" || event.type === "finished") &&
    typeof event.workflowId === "number" &&
    typeof event.executionKey === "string"
  );
}

export function useWorkflowExecutionProgress({
  workflowId,
}: {
  workflowId?: number;
}): WorkflowExecutionUiValue & { bindListeningNodeId: (nodeId: string | null) => void } {
  const user = useDashboardUser();
  const [running, setRunning] = useState(false);
  const [entryNodeId, setEntryNodeId] = useState<string | null>(null);
  const [currentNodeId, setCurrentNodeId] = useState<string | null>(null);
  const [statusByNodeId, setStatusByNodeId] = useState<Record<string, NodeRunStatus>>({});
  const executionKeyRef = useRef<string | null>(null);
  const runningRef = useRef(false);
  const listeningRef = useRef<string | null>(null);
  runningRef.current = running;

  const bindListeningNodeId = useCallback((nodeId: string | null) => {
    listeningRef.current = nodeId;
  }, []);

  const startRun = useCallback((nodeId: string) => {
    runningRef.current = true;
    executionKeyRef.current = null;
    setRunning(true);
    setEntryNodeId(nodeId);
    setCurrentNodeId(nodeId);
    setStatusByNodeId({ [nodeId]: "running" });
  }, []);

  const finishRun = useCallback((steps?: ExecutionStepLog[]) => {
    runningRef.current = false;
    setRunning(false);
    setCurrentNodeId(null);
    if (steps?.length) {
      setStatusByNodeId((prev) => ({ ...prev, ...statusesFromSteps(steps) }));
    } else {
      setStatusByNodeId((prev) => {
        const next = { ...prev };
        for (const [id, status] of Object.entries(next)) {
          if (status === "running") delete next[id];
        }
        return next;
      });
    }
  }, []);

  const handlers = useMemo(
    () => ({
      workflow_execution: (data: unknown) => {
        if (!workflowId || !isProgressEvent(data) || data.workflowId !== workflowId) return;
        const localRun = runningRef.current;
        const listening = !!listeningRef.current;
        if (!localRun && !listening) return;
        if (executionKeyRef.current && data.executionKey !== executionKeyRef.current) return;

        if (data.type === "started") {
          executionKeyRef.current = data.executionKey;
          runningRef.current = true;
          setRunning(true);
          if (data.entryNodeId) {
            setEntryNodeId(data.entryNodeId);
            setCurrentNodeId(data.entryNodeId);
            setStatusByNodeId({ [data.entryNodeId]: "running" });
          } else {
            setStatusByNodeId({});
          }
          return;
        }

        if (data.type === "node_start" && data.nodeId) {
          if (!executionKeyRef.current) executionKeyRef.current = data.executionKey;
          runningRef.current = true;
          setRunning(true);
          if (data.entryNodeId) setEntryNodeId(data.entryNodeId);
          setCurrentNodeId(data.nodeId);
          setStatusByNodeId((prev) => ({ ...prev, [data.nodeId!]: "running" }));
          return;
        }

        if (data.type === "node_done" && data.nodeId) {
          const status: NodeRunStatus =
            data.status === "error" || data.status === "skipped" || data.status === "pending_human"
              ? data.status
              : "success";
          setStatusByNodeId((prev) => ({ ...prev, [data.nodeId!]: status }));
          setCurrentNodeId((current) => (current === data.nodeId ? null : current));
          return;
        }

        if (data.type === "finished") {
          runningRef.current = false;
          setRunning(false);
          setCurrentNodeId(null);
        }
      },
    }),
    [workflowId],
  );

  useWs(workflowId && user?.identifier ? user : null, handlers);

  return {
    running,
    entryNodeId,
    currentNodeId,
    listeningNodeId: null,
    statusByNodeId,
    startRun,
    finishRun,
    bindListeningNodeId,
  };
}

export function WorkflowExecutionUiProvider({
  value,
  children,
}: {
  value: WorkflowExecutionUiValue;
  children: ReactNode;
}) {
  return <WorkflowExecutionUiContext.Provider value={value}>{children}</WorkflowExecutionUiContext.Provider>;
}
