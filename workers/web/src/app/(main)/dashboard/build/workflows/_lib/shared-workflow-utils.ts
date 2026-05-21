import type { AgentWorkflow } from "./api";

export function workflowKey(wf: AgentWorkflow): string {
  return `${wf.user_id}:${wf.id}`;
}

export function sharedWorkflowViewHref(wf: AgentWorkflow): string {
  if (!wf.id || !wf.user_id) return "#";
  return `/dashboard/build/workflows/${wf.id}/view?owner=${encodeURIComponent(wf.user_id)}`;
}

export function sharedWorkflowChatHref(wf: AgentWorkflow): string {
  return `/dashboard/build/workflows/${wf.id}/chat?owner=${encodeURIComponent(wf.user_id ?? "")}`;
}
