import type { ExecutionStepLog } from "../../_lib/api";

export type ChatRunStepStatus = "running" | "success" | "error" | "skipped" | "pending_human";

export type ChatActivityItem = {
  work: string;
  tool?: string;
  text: string;
};

export type ChatRunStep = {
  nodeId: string;
  nodeType: string;
  label: string;
  status: ChatRunStepStatus;
  phase?: "reasoning";
  activityLog?: ChatActivityItem[];
};

export type ChatProgressEvent = {
  type?: string;
  nodeId?: string;
  nodeType?: string;
  label?: string;
  status?: string;
  phase?: string;
  activityLog?: ChatActivityItem[];
};

function stepLabel(event: ChatProgressEvent, previous?: string): string {
  const label = event.label?.trim();
  if (label) return label;
  if (previous?.trim()) return previous.trim();
  const type = event.nodeType?.trim();
  if (type) return type.replace(/_/g, " ");
  return event.nodeId ?? "";
}

function doneStatus(status: string | undefined): ChatRunStepStatus {
  if (status === "error" || status === "failed") return "error";
  if (status === "skipped" || status === "cancelled") return "skipped";
  if (status === "pending_human") return "pending_human";
  return "success";
}

function activityOf(event: ChatProgressEvent): ChatActivityItem[] | undefined {
  if (!Array.isArray(event.activityLog) || !event.activityLog.length) return undefined;
  return event.activityLog
    .filter((item) => item && typeof item.work === "string")
    .map((item) => ({
      work: item.work,
      ...(item.tool ? { tool: item.tool } : {}),
      text: typeof item.text === "string" ? item.text : "",
    }));
}

function runningIndex(steps: ChatRunStep[], nodeId: string): number {
  for (let i = steps.length - 1; i >= 0; i--) {
    if (steps[i]?.nodeId === nodeId && steps[i]?.status === "running") return i;
  }
  return -1;
}

/** Fold one live progress event into the chat log. Ignores started/finished. */
export function applyChatRunEvent(steps: ChatRunStep[], event: ChatProgressEvent): ChatRunStep[] {
  if (!event.nodeId) return steps;
  if (event.type === "node_start") {
    const last = steps[steps.length - 1];
    if (last?.status === "running" && last.nodeId === event.nodeId) {
      return steps.map((step, index) =>
        index === steps.length - 1
          ? {
              ...step,
              nodeType: event.nodeType || step.nodeType,
              label: stepLabel(event, step.label),
            }
          : step,
      );
    }
    return [
      ...steps,
      {
        nodeId: event.nodeId,
        nodeType: event.nodeType ?? "",
        label: stepLabel(event),
        status: "running",
      },
    ];
  }
  if (event.type === "node_phase" && (event.phase === "reasoning" || event.activityLog?.length)) {
    const index = runningIndex(steps, event.nodeId);
    const activityLog = activityOf(event) ?? steps[index]?.activityLog;
    const patch: ChatRunStep = {
      nodeId: event.nodeId,
      nodeType: event.nodeType || steps[index]?.nodeType || "",
      label: stepLabel(event, steps[index]?.label),
      status: "running",
      phase: "reasoning",
      ...(activityLog?.length ? { activityLog } : {}),
    };
    if (index >= 0) return steps.map((step, i) => (i === index ? { ...step, ...patch } : step));
    return [...steps, patch];
  }
  if (event.type === "node_done") {
    const index = runningIndex(steps, event.nodeId);
    const patch: ChatRunStep = {
      nodeId: event.nodeId,
      nodeType: event.nodeType || steps[index]?.nodeType || "",
      label: stepLabel(event, steps[index]?.label),
      status: doneStatus(event.status),
    };
    if (index >= 0) return steps.map((step, i) => (i === index ? { ...step, ...patch } : step));
    return [...steps, patch];
  }
  return steps;
}

export function executionStepsToChatRun(steps: ExecutionStepLog[]): ChatRunStep[] {
  return steps.map((step) => ({
    nodeId: step.nodeId,
    nodeType: step.nodeType,
    label: step.label?.trim() || step.nodeType.replace(/_/g, " ") || step.nodeId,
    status: step.status,
    ...(step.phase === "reasoning" ? { phase: "reasoning" as const } : {}),
    ...(step.activityLog?.length ? { activityLog: step.activityLog } : {}),
  }));
}

/** Prefer whichever live source already shows the reasoning phase, then the longer timeline. */
export function pickChatRunLog(streamed: ChatRunStep[], live?: ChatRunStep[]): ChatRunStep[] {
  if (!live?.length) return streamed;
  if (!streamed.length) return live;
  const activityScore = (rows: ChatRunStep[]) =>
    rows.reduce((sum, step) => sum + (step.activityLog?.reduce((n, item) => n + item.text.length, 0) ?? 0), 0);
  if (activityScore(streamed) !== activityScore(live)) {
    return activityScore(streamed) > activityScore(live) ? streamed : live;
  }
  const liveReasoning = live.some((step) => step.status === "running" && step.phase === "reasoning");
  const streamedReasoning = streamed.some((step) => step.status === "running" && step.phase === "reasoning");
  if (streamedReasoning && !liveReasoning) return streamed;
  if (liveReasoning && !streamedReasoning) return live;
  return live.length >= streamed.length ? live : streamed;
}
