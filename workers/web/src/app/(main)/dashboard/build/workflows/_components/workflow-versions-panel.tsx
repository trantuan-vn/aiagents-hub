"use client";

import { useCallback, useEffect, useState } from "react";

import { History, RefreshCw, RotateCcw, Save } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import {
  listWorkflowVersions,
  restoreWorkflowVersion,
  snapshotWorkflowVersion,
  type WorkflowVersionRecord,
} from "../_lib/api";

interface WorkflowVersionsPanelProps {
  workflowId: number;
  onApplyDefinition?: (definitionJson: string) => void;
}

function countNodes(definition: string): { nodes: number; edges: number } {
  try {
    const parsed = JSON.parse(definition) as { nodes?: unknown[]; edges?: unknown[] };
    return {
      nodes: Array.isArray(parsed.nodes) ? parsed.nodes.length : 0,
      edges: Array.isArray(parsed.edges) ? parsed.edges.length : 0,
    };
  } catch {
    return { nodes: 0, edges: 0 };
  }
}

export function WorkflowVersionsPanel({ workflowId, onApplyDefinition }: WorkflowVersionsPanelProps) {
  const t = useTranslations("WorkflowEditorPage");
  const [versions, setVersions] = useState<WorkflowVersionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!workflowId || isNaN(workflowId)) return;
    setLoading(true);
    try {
      const { versions: rows } = await listWorkflowVersions(workflowId);
      setVersions(rows);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load versions");
    } finally {
      setLoading(false);
    }
  }, [workflowId]);

  useEffect(() => {
    void load();
  }, [load]);

  const onSnapshot = async () => {
    setBusy(true);
    try {
      await snapshotWorkflowVersion(workflowId, {});
      toast.success(t("versions_snapshot_done"));
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("versions_snapshot_error"));
    } finally {
      setBusy(false);
    }
  };

  const onRestore = async (version: WorkflowVersionRecord) => {
    setBusy(true);
    try {
      const res = await restoreWorkflowVersion(workflowId, version.versionKey);
      onApplyDefinition?.(res.workflow.definition);
      toast.success(t("versions_restore_done", { version: version.version }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("versions_restore_error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between border-b px-4 py-3">
        <div>
          <h2 className="flex items-center gap-1.5 text-sm font-semibold">
            <History className="size-4" />
            {t("versions_title")}
          </h2>
          <p className="text-muted-foreground text-xs">{t("versions_description")}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void onSnapshot()} disabled={busy}>
            <Save className="size-3.5" />
            {t("versions_snapshot")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
            {t("versions_refresh")}
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {loading && versions.length === 0 ? (
          <p className="text-muted-foreground text-xs">{t("versions_loading")}</p>
        ) : versions.length === 0 ? (
          <p className="text-muted-foreground text-xs">{t("versions_empty")}</p>
        ) : (
          <ul className="mx-auto max-w-2xl divide-y rounded-lg border">
            {versions.map((version) => {
              const counts = countNodes(version.definition);
              return (
                <li key={version.versionKey} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{version.label ?? `v${version.version}`}</span>
                      <Badge variant="secondary" className="text-[10px]">
                        {version.reason === "publish"
                          ? t("versions_reason_publish")
                          : t("versions_reason_manual")}
                      </Badge>
                    </div>
                    <span className="text-muted-foreground text-[11px]">
                      {t("versions_summary", { nodes: counts.nodes, edges: counts.edges })}
                      {version.createdAt ? ` · ${new Date(version.createdAt).toLocaleString()}` : ""}
                    </span>
                    {version.note ? (
                      <span className="text-muted-foreground text-[11px] italic">{version.note}</span>
                    ) : null}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void onRestore(version)}
                    disabled={busy || !onApplyDefinition}
                  >
                    <RotateCcw className="size-3.5" />
                    {t("versions_restore")}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
