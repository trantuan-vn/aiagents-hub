"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  WORKFLOW_NODE_CATALOG_SEEDS,
  defaultIsActive,
  type WorkflowCatalogEntry,
} from "@aiagents-hub/workflow-nodes";

import { listWorkflowNodeCatalog, type WorkflowNodeCatalogEntry } from "../../_lib/api";

function mapEntry(row: WorkflowNodeCatalogEntry): WorkflowCatalogEntry {
  return {
    id: row.id,
    addCategory: row.addCategory as WorkflowCatalogEntry["addCategory"],
    runtimeType: row.runtimeType,
    kind: row.kind,
    nameKey: row.nameKey,
    descKey: row.descKey,
    hasBackend: row.hasBackend,
    hasFrontend: row.hasFrontend,
    isActive: row.isActive,
    sortOrder: row.sortOrder,
    updatedAt: row.updatedAt ?? 0,
  };
}

function buildActiveSet(entries: WorkflowCatalogEntry[]): Set<string> {
  return new Set(entries.filter((entry) => entry.isActive).map((entry) => entry.id));
}

function buildFallbackActiveSet(): Set<string> {
  return new Set(
    WORKFLOW_NODE_CATALOG_SEEDS.filter((seed) => defaultIsActive(seed)).map((seed) => seed.id),
  );
}

export function useWorkflowNodeCatalog() {
  const [entries, setEntries] = useState<WorkflowCatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { entries: rows } = await listWorkflowNodeCatalog();
      setEntries(rows.map(mapEntry));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load node catalog");
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const activeIds = useMemo(() => {
    if (entries.length > 0) return buildActiveSet(entries);
    return buildFallbackActiveSet();
  }, [entries]);

  const isCatalogActive = useCallback(
    (catalogId: string) => {
      if (entries.length > 0) {
        const entry = entries.find((item) => item.id === catalogId);
        if (!entry) return true;
        return entry.isActive;
      }
      if (!WORKFLOW_NODE_CATALOG_SEEDS.some((seed) => seed.id === catalogId)) return true;
      return activeIds.has(catalogId);
    },
    [entries, activeIds],
  );

  return {
    entries,
    loading,
    error,
    reload,
    isCatalogActive,
    catalogReady: entries.length > 0 || !loading,
  };
}
