"use client";

import { useCallback, useEffect, useState } from "react";

import { RefreshCw, Wand2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn, formatUsd } from "@/lib/utils";

import {
  autofixWorkflow,
  getWorkflowExecutionStats,
  listWorkflowExecutions,
  resumeWorkflowExecution,
  type WorkflowExecutionRecord,
  type WorkflowExecutionStats,
  type WorkflowExecutionStatus,
} from "../_lib/api";

interface WorkflowExecutionsPanelProps {
  workflowId: number;
  onApplyDefinition?: (definitionJson: string) => void;
}

const STATUS_VARIANTS: Record<WorkflowExecutionStatus, string> = {
  running: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  completed: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  failed: "bg-red-500/15 text-red-600 dark:text-red-400",
  pending_human: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  cancelled: "bg-muted text-muted-foreground",
};

function buildTimeline(steps: WorkflowExecutionRecord["steps"]) {
  let offset = 0;
  return steps.map((s) => {
    const durationMs = s.durationMs ?? 0;
    const entry = { ...s, offsetMs: offset, durationMs };
    offset += durationMs;
    return entry;
  });
}

function formatOutput(output: unknown): string {
  if (output == null) return "—";
  if (typeof output === "string") return output;
  if (
    typeof output === "object" &&
    "text" in output &&
    typeof (output as { text: unknown }).text === "string"
  ) {
    return (output as { text: string }).text;
  }
  return JSON.stringify(output, null, 2);
}

export function WorkflowExecutionsPanel({ workflowId, onApplyDefinition }: WorkflowExecutionsPanelProps) {
  const t = useTranslations("WorkflowEditorPage");
  const [executions, setExecutions] = useState<WorkflowExecutionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [resuming, setResuming] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [stats, setStats] = useState<WorkflowExecutionStats | null>(null);

  const statusLabel = (status: WorkflowExecutionStatus) =>
    t(`executions_status_${status}` as Parameters<typeof t>[0]);

  const load = useCallback(async () => {
    if (!workflowId || isNaN(workflowId)) return;
    setLoading(true);
    try {
      const [{ executions: rows }, statsRes] = await Promise.all([
        listWorkflowExecutions(workflowId),
        getWorkflowExecutionStats(workflowId).catch(() => ({ stats: null })),
      ]);
      setExecutions(rows);
      setStats(statsRes.stats);
      setSelectedKey((prev) => prev ?? rows[0]?.executionKey ?? null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load executions");
    } finally {
      setLoading(false);
    }
  }, [workflowId]);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = executions.find((e) => e.executionKey === selectedKey) ?? null;

  const onAutofix = async () => {
    if (!selected || !onApplyDefinition) return;
    setFixing(true);
    try {
      const fixed = await autofixWorkflow(workflowId, { error: selected.error });
      onApplyDefinition(JSON.stringify(fixed.definition));
      toast.success(fixed.notes || t("ai_autofix_done"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("ai_build_error"));
    } finally {
      setFixing(false);
    }
  };

  const onResume = async (decision: "approve" | "reject") => {
    if (!selected) return;
    setResuming(true);
    try {
      await resumeWorkflowExecution(selected.executionKey, {
        decision,
        note: reviewNote.trim() || undefined,
      });
      setReviewNote("");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to resume execution");
    } finally {
      setResuming(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between border-b px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">{t("executions_title")}</h2>
          <p className="text-muted-foreground text-xs">{t("executions_description")}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
          {t("executions_refresh")}
        </Button>
      </div>

      {stats && stats.total > 0 ? (
        <div className="grid shrink-0 grid-cols-2 gap-2 border-b px-4 py-3 sm:grid-cols-4">
          <div className="bg-muted/40 rounded-md border px-3 py-2">
            <p className="text-muted-foreground text-[10px]">{t("obs_total_runs")}</p>
            <p className="text-sm font-semibold tabular-nums">{stats.total}</p>
          </div>
          <div className="bg-muted/40 rounded-md border px-3 py-2">
            <p className="text-muted-foreground text-[10px]">{t("obs_success_rate")}</p>
            <p className="text-sm font-semibold tabular-nums">{stats.successRate}%</p>
          </div>
          <div className="bg-muted/40 rounded-md border px-3 py-2">
            <p className="text-muted-foreground text-[10px]">{t("obs_avg_duration")}</p>
            <p className="text-sm font-semibold tabular-nums">
              {stats.avgDurationMs > 0 ? t("obs_ms", { ms: stats.avgDurationMs }) : "—"}
            </p>
          </div>
          <div className="bg-muted/40 rounded-md border px-3 py-2">
            <p className="text-muted-foreground text-[10px]">{t("obs_avg_cost")}</p>
            <p className="text-sm font-semibold tabular-nums">{formatUsd(stats.avgCostVnd)}</p>
          </div>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Run list */}
        <div className="w-72 shrink-0 overflow-y-auto border-r">
          {loading && executions.length === 0 ? (
            <p className="text-muted-foreground p-4 text-xs">{t("executions_loading")}</p>
          ) : executions.length === 0 ? (
            <p className="text-muted-foreground p-4 text-xs">{t("executions_empty")}</p>
          ) : (
            <ul className="divide-y">
              {executions.map((exec) => (
                <li key={exec.executionKey}>
                  <button
                    type="button"
                    onClick={() => setSelectedKey(exec.executionKey)}
                    className={cn(
                      "flex w-full flex-col gap-1 px-4 py-3 text-left transition-colors",
                      selectedKey === exec.executionKey ? "bg-muted" : "hover:bg-muted/50",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <Badge className={cn("border-0 text-[10px]", STATUS_VARIANTS[exec.status])}>
                        {statusLabel(exec.status)}
                      </Badge>
                      <span className="text-muted-foreground text-[11px]">
                        {formatUsd(exec.totalCostVnd)}
                      </span>
                    </div>
                    <span className="text-muted-foreground text-[11px]">
                      {new Date(exec.startedAt).toLocaleString()}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Detail */}
        <div className="min-w-0 flex-1 overflow-y-auto p-4">
          {selected ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <Badge className={cn("border-0", STATUS_VARIANTS[selected.status])}>
                  {statusLabel(selected.status)}
                </Badge>
                <span className="text-muted-foreground">
                  {t("executions_col_started")}: {new Date(selected.startedAt).toLocaleString()}
                </span>
                <span className="text-muted-foreground">
                  {t("executions_col_cost")}: {formatUsd(selected.totalCostVnd)}
                </span>
                <span className="text-muted-foreground">
                  {t("executions_col_steps")}: {selected.stepCount}
                </span>
              </div>

              {selected.status === "pending_human" ? (
                <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
                  <p className="text-sm font-medium">{t("executions_review_title")}</p>
                  <Textarea
                    value={reviewNote}
                    onChange={(e) => setReviewNote(e.target.value)}
                    placeholder={t("executions_review_note_placeholder")}
                    rows={2}
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => void onResume("approve")} disabled={resuming}>
                      {resuming ? t("executions_resuming") : t("executions_approve")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void onResume("reject")}
                      disabled={resuming}
                    >
                      {t("executions_reject")}
                    </Button>
                  </div>
                </div>
              ) : null}

              {selected.error ? (
                <div>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <p className="text-xs font-medium">{t("executions_detail_error")}</p>
                    {onApplyDefinition && selected.status === "failed" ? (
                      <Button size="sm" variant="outline" onClick={() => void onAutofix()} disabled={fixing}>
                        <Wand2 className={cn("size-3.5", fixing && "animate-pulse")} />
                        {fixing ? t("ai_autofix_running") : t("ai_autofix")}
                      </Button>
                    ) : null}
                  </div>
                  <pre className="rounded-md border border-red-500/30 bg-red-500/5 p-3 text-xs break-words whitespace-pre-wrap text-red-600 dark:text-red-400">
                    {selected.error}
                  </pre>
                </div>
              ) : null}

              <div>
                <p className="mb-1 text-xs font-medium">{t("executions_detail_output")}</p>
                <pre className="bg-muted/40 rounded-md p-3 text-xs break-words whitespace-pre-wrap">
                  {formatOutput(selected.output)}
                </pre>
              </div>

              {selected.steps.length > 0 ? (
                <div>
                  <p className="mb-2 text-xs font-medium">{t("obs_timeline")}</p>
                  {(() => {
                    const timeline = buildTimeline(selected.steps);
                    const totalMs = timeline.reduce((s, x) => s + x.durationMs, 0) || 1;
                    const wallMs =
                      selected.finishedAt && selected.startedAt
                        ? selected.finishedAt - selected.startedAt
                        : totalMs;
                    return (
                      <div className="space-y-2">
                        <p className="text-muted-foreground text-[11px]">
                          {t("obs_wall_duration")}: {t("obs_ms", { ms: wallMs })}
                        </p>
                        <ul className="space-y-1.5">
                          {timeline.map((step) => (
                            <li key={`${step.nodeId}-${step.offsetMs}`} className="flex items-center gap-2 text-[11px]">
                              <span className="w-24 shrink-0 truncate font-mono">{step.nodeId}</span>
                              <span className="text-muted-foreground w-16 shrink-0">{step.nodeType}</span>
                              <div className="bg-muted h-2 min-w-0 flex-1 overflow-hidden rounded-full">
                                <div
                                  className={cn(
                                    "h-full rounded-full",
                                    step.status === "error"
                                      ? "bg-red-500"
                                      : step.status === "success"
                                        ? "bg-emerald-500"
                                        : "bg-amber-500",
                                  )}
                                  style={{ width: `${Math.max(4, (step.durationMs / totalMs) * 100)}%` }}
                                />
                              </div>
                              <span className="text-muted-foreground w-14 shrink-0 text-right tabular-nums">
                                {step.durationMs}ms
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })()}
                </div>
              ) : (
                <p className="text-muted-foreground text-xs">{t("obs_no_timeline")}</p>
              )}

              <details>
                <summary className="cursor-pointer text-xs font-medium">
                  {t("executions_detail_steps")}
                </summary>
                <pre className="bg-muted/40 mt-2 rounded-md p-3 text-xs break-words whitespace-pre-wrap">
                  {JSON.stringify(selected.steps, null, 2)}
                </pre>
              </details>
            </div>
          ) : (
            <p className="text-muted-foreground text-xs">{t("executions_empty")}</p>
          )}
        </div>
      </div>
    </div>
  );
}
