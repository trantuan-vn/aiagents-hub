"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { toast } from "sonner";

import { getWorkflowExecution, listWorkflowExecutions, type WorkflowExecutionRecord } from "../../../_lib/api";

import { parseDefinitionJson } from "./workflow-execution-utils";

const AUTO_REFRESH_MS = 4000;

export function useWorkflowExecutions(workflowId: number, fallbackDefinitionJson?: string) {
  const [executions, setExecutions] = useState<WorkflowExecutionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const load = useCallback(
    async (silent = false) => {
      if (!workflowId || isNaN(workflowId)) return;
      if (!silent) setLoading(true);
      try {
        const { executions: rows } = await listWorkflowExecutions(workflowId);
        setExecutions(rows);
        setSelectedKey((prev) => {
          if (prev && rows.some((r) => r.executionKey === prev)) return prev;
          return rows[0]?.executionKey ?? null;
        });
      } catch (e) {
        if (!silent) toast.error(e instanceof Error ? e.message : "Failed to load executions");
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [workflowId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = window.setInterval(() => void load(true), AUTO_REFRESH_MS);
    return () => window.clearInterval(id);
  }, [autoRefresh, load]);

  const selected = executions.find((e) => e.executionKey === selectedKey) ?? null;

  useEffect(() => {
    if (!selectedKey) return;
    let cancelled = false;
    void getWorkflowExecution(selectedKey)
      .then(({ execution }) => {
        if (cancelled) return;
        setExecutions((prev) => prev.map((row) => (row.executionKey === execution.executionKey ? execution : row)));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [selectedKey]);

  useEffect(() => {
    if (!selected) {
      setSelectedNodeId(null);
      return;
    }
    setSelectedNodeId((prev) => {
      if (prev && selected.steps.some((s) => s.nodeId === prev)) return prev;
      if (selected.steps[0]) return selected.steps[0].nodeId;
      return selected.pendingNodeId ?? null;
    });
  }, [selected]);

  const fallbackDefinition = useMemo(() => parseDefinitionJson(fallbackDefinitionJson), [fallbackDefinitionJson]);

  return {
    executions,
    loading,
    selected,
    selectedKey,
    setSelectedKey,
    selectedNodeId,
    setSelectedNodeId,
    autoRefresh,
    setAutoRefresh,
    load,
    graphDefinition: selected?.definition ?? fallbackDefinition,
  };
}
