"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { toast } from "sonner";

import { getWorkflowExecution, listWorkflowExecutions, type WorkflowExecutionRecord } from "../../../_lib/api";

import { mergeListedExecution, lastStepIndexForNode, parseDefinitionJson } from "./workflow-execution-utils";

const AUTO_REFRESH_MS = 4000;

export function useWorkflowExecutions(workflowId: number, fallbackDefinitionJson?: string) {
  const [executions, setExecutions] = useState<WorkflowExecutionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [selection, setSelection] = useState<{ nodeId: string | null; index: number }>({
    nodeId: null,
    index: -1,
  });
  const [autoRefresh, setAutoRefresh] = useState(false);
  const detailFetchGen = useRef(0);
  const prevSelectedKey = useRef<string | null>(null);

  const load = useCallback(
    async (silent = false) => {
      if (!workflowId || isNaN(workflowId)) return;
      if (!silent) setLoading(true);
      try {
        const { executions: rows } = await listWorkflowExecutions(workflowId);
        setExecutions((prev) => {
          const prevByKey = new Map(prev.map((row) => [row.executionKey, row]));
          return rows.map((row) => mergeListedExecution(row, prevByKey.get(row.executionKey)));
        });
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

  const hasActiveRun = useMemo(
    () => executions.some((row) => row.status === "running" || row.status === "pending_human"),
    [executions],
  );

  useEffect(() => {
    if (!autoRefresh && !hasActiveRun) return;
    const id = window.setInterval(() => void load(true), AUTO_REFRESH_MS);
    return () => window.clearInterval(id);
  }, [autoRefresh, hasActiveRun, load]);

  const selected = useMemo(
    () => executions.find((e) => e.executionKey === selectedKey) ?? null,
    [executions, selectedKey],
  );

  useEffect(() => {
    if (!selectedKey) return;
    const requestedKey = selectedKey;
    const gen = ++detailFetchGen.current;
    void getWorkflowExecution(requestedKey)
      .then(({ execution }) => {
        if (detailFetchGen.current !== gen) return;
        if (execution.executionKey !== requestedKey) return;
        setExecutions((prev) =>
          prev.map((row) => (row.executionKey === execution.executionKey ? execution : row)),
        );
      })
      .catch(() => undefined);
  }, [selectedKey]);

  const stepNodeIds = selected?.steps.map((step) => step.nodeId).join("\0") ?? "";

  useEffect(() => {
    if (!selectedKey || !selected) {
      prevSelectedKey.current = selectedKey;
      setSelection({ nodeId: null, index: -1 });
      return;
    }
    const keyChanged = prevSelectedKey.current !== selectedKey;
    prevSelectedKey.current = selectedKey;
    if (keyChanged) {
      const first = selected.steps[0];
      setSelection({ nodeId: first?.nodeId ?? selected.pendingNodeId ?? null, index: first ? 0 : -1 });
      return;
    }
    setSelection((prev) => {
      if (prev.index >= 0 && selected.steps[prev.index]) {
        return { nodeId: selected.steps[prev.index]!.nodeId, index: prev.index };
      }
      if (prev.nodeId) {
        const index = selected.steps.findIndex((s) => s.nodeId === prev.nodeId);
        if (index >= 0) return { nodeId: prev.nodeId, index };
      }
      const first = selected.steps[0];
      return { nodeId: first?.nodeId ?? selected.pendingNodeId ?? null, index: first ? 0 : -1 };
    });
  }, [selected, selectedKey, stepNodeIds]);

  const selectNode = useCallback(
    (nodeId: string | null) => {
      if (!nodeId || !selected) {
        setSelection({ nodeId, index: -1 });
        return;
      }
      setSelection({ nodeId, index: lastStepIndexForNode(selected.steps, nodeId) });
    },
    [selected],
  );

  const selectStep = useCallback(
    (index: number) => {
      const step = selected?.steps[index];
      if (!step) return;
      setSelection({ nodeId: step.nodeId, index });
    },
    [selected],
  );

  const fallbackDefinition = useMemo(() => parseDefinitionJson(fallbackDefinitionJson), [fallbackDefinitionJson]);

  return {
    executions,
    loading,
    selected,
    selectedKey,
    setSelectedKey,
    selectedNodeId: selection.nodeId,
    selectedStepIndex: selection.index,
    setSelectedNodeId: selectNode,
    selectStep,
    autoRefresh,
    setAutoRefresh,
    load,
    graphDefinition: selected?.definition ?? fallbackDefinition,
  };
}
