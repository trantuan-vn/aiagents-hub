"use client";

import { useEffect, useState } from "react";

import {
  DEFAULT_WORKFLOW_NODE_REGISTRY,
  fetchWorkflowNodeRegistry,
  type WorkflowNodeRegistry,
} from "@/lib/workflow-node-registry";

let cachedRegistry: WorkflowNodeRegistry | null = null;
let inflight: Promise<WorkflowNodeRegistry> | null = null;

export function prefetchWorkflowNodeRegistry(): Promise<WorkflowNodeRegistry> {
  if (cachedRegistry) return Promise.resolve(cachedRegistry);
  if (inflight) return inflight;
  inflight = fetchWorkflowNodeRegistry()
    .then((registry) => {
      cachedRegistry = registry;
      return registry;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function useWorkflowNodeRegistry() {
  const [registry, setRegistry] = useState<WorkflowNodeRegistry>(cachedRegistry ?? DEFAULT_WORKFLOW_NODE_REGISTRY);
  const [loading, setLoading] = useState(!cachedRegistry);

  useEffect(() => {
    let cancelled = false;
    void prefetchWorkflowNodeRegistry().then((r) => {
      if (!cancelled) {
        setRegistry(r);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { registry, loading };
}

export function invalidateWorkflowNodeRegistryCache() {
  cachedRegistry = null;
}
