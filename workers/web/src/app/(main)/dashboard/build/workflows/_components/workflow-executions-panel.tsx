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
  listWorkflowExecutions,
  resumeWorkflowExecution,
  type WorkflowExecutionRecord,
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

  const statusLabel = (status: WorkflowExecutionStatus) =>
    t(`executions_status_${status}` as Parameters<typeof t>[0]);

  const load = useCallback(async () => {
    if (!workflowId || isNaN(workflowId)) return;
    setLoading(true);
    try {
      const { executions: rows } = await listWorkflowExecutions(workflowId);
      setExecutions(rows);
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
