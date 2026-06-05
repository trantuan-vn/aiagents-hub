import type { CreateWorkflowNodeInput, UpdateWorkflowNodeInput, WorkflowNodeDefinition, WorkflowNodeRegistry } from "./types";
import { mergeNodeRegistry } from "./merge";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.aiagents-hub.vn";

export async function fetchWorkflowNodeRegistry(signal?: AbortSignal): Promise<WorkflowNodeRegistry> {
  const response = await fetch(`${API_BASE_URL}/dashboard/admin/workflow-nodes`, {
    method: "GET",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    signal,
  });
  if (!response.ok) {
    throw new Error("Failed to fetch workflow node registry");
  }
  const data = (await response.json()) as WorkflowNodeRegistry;
  return mergeNodeRegistry(data);
}

export async function createWorkflowNode(input: CreateWorkflowNodeInput): Promise<WorkflowNodeDefinition> {
  const response = await fetch(`${API_BASE_URL}/dashboard/admin/workflow-nodes`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Failed to create workflow node");
  }
  return response.json();
}

export async function updateWorkflowNode(
  id: string,
  input: UpdateWorkflowNodeInput,
): Promise<WorkflowNodeDefinition> {
  const response = await fetch(`${API_BASE_URL}/dashboard/admin/workflow-nodes/${encodeURIComponent(id)}`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Failed to update workflow node");
  }
  return response.json();
}

export async function deleteWorkflowNode(id: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/dashboard/admin/workflow-nodes/${encodeURIComponent(id)}`, {
    method: "DELETE",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Failed to delete workflow node");
  }
}
