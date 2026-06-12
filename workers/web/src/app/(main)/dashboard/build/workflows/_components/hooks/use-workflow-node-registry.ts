"use client";

import { DEFAULT_WORKFLOW_NODE_REGISTRY, type WorkflowNodeRegistry } from "@/lib/workflow-node-registry";

export function useWorkflowNodeRegistry() {
  return { registry: DEFAULT_WORKFLOW_NODE_REGISTRY, loading: false };
}

export function prefetchWorkflowNodeRegistry(): Promise<WorkflowNodeRegistry> {
  return Promise.resolve(DEFAULT_WORKFLOW_NODE_REGISTRY);
}
