"use client";

import { Check, ChevronLeft, ChevronRight, Clock, Loader2, Minus, RefreshCw, Search, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

import type { WorkflowExecutionRecord, WorkflowExecutionStatus } from "../../../_lib/api";

import { durationMsOf, formatDuration } from "./workflow-execution-utils";

export function ExecutionStatusGlyph({ status }: { status: WorkflowExecutionStatus }) {
  if (status === "completed") {
    return (
      <span className="flex size-5 items-center justify-center rounded-full bg-emerald-600 text-white">
        <Check className="size-3" aria-hidden />
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="flex size-5 items-center justify-center rounded-full bg-red-600 text-white">
        <X className="size-3" aria-hidden />
      </span>
    );
  }
  if (status === "running") {
    return (
      <span className="flex size-5 items-center justify-center rounded-full bg-blue-600 text-white">
        <Loader2 className="size-3 animate-spin" aria-hidden />
      </span>
    );
  }
  if (status === "pending_human") {
    return (
      <span className="flex size-5 items-center justify-center rounded-full bg-amber-500 text-white">
        <Clock className="size-3" aria-hidden />
      </span>
    );
  }
  return (
    <span className="bg-muted text-muted-foreground flex size-5 items-center justify-center rounded-full">
      <Minus className="size-3" aria-hidden />
    </span>
  );
}

function executionHeadline(
  exec: WorkflowExecutionRecord,
  t: ReturnType<typeof useTranslations<"WorkflowEditorPage">>,
): string {
  const dur = formatDuration(durationMsOf(exec));
  if (exec.status === "completed") return t("executions_headline_completed", { duration: dur });
  if (exec.status === "failed") return t("executions_headline_failed", { duration: dur });
  if (exec.status === "running") return t("executions_headline_running", { duration: dur });
  return t(`executions_status_${exec.status}`);
}

export function WorkflowExecutionListRail({ onExpand }: { onExpand: () => void }) {
  const t = useTranslations("WorkflowEditorPage");
  return (
    <aside className="bg-background flex h-full w-9 shrink-0 flex-col items-center border-r py-2">
      <button
        type="button"
        title={t("executions_expand_list")}
        aria-label={t("executions_expand_list")}
        aria-expanded={false}
        onClick={onExpand}
        className="text-muted-foreground hover:bg-muted hover:text-foreground flex size-7 items-center justify-center rounded-md"
      >
        <ChevronRight className="size-3.5" aria-hidden />
      </button>
      <span className="text-muted-foreground mt-2 text-[11px] font-medium tracking-wide [writing-mode:vertical-rl] rotate-180">
        {t("executions_title")}
      </span>
    </aside>
  );
}

export function WorkflowExecutionList({
  executions,
  loading,
  selectedKey,
  search,
  searchOpen,
  autoRefresh,
  onSearchChange,
  onSearchOpenChange,
  onAutoRefreshChange,
  onSelect,
  onRefresh,
  onCollapse,
}: {
  executions: WorkflowExecutionRecord[];
  loading: boolean;
  selectedKey: string | null;
  search: string;
  searchOpen: boolean;
  autoRefresh: boolean;
  onSearchChange: (value: string) => void;
  onSearchOpenChange: (open: boolean) => void;
  onAutoRefreshChange: (value: boolean) => void;
  onSelect: (key: string) => void;
  onRefresh: () => void;
  onCollapse?: () => void;
}) {
  const t = useTranslations("WorkflowEditorPage");
  const q = search.trim().toLowerCase();
  const filtered = q
    ? executions.filter((exec) => {
        const started = new Date(exec.startedAt).toLocaleString().toLowerCase();
        const label = t(`executions_status_${exec.status}`).toLowerCase();
        return (
          exec.executionKey.toLowerCase().includes(q) ||
          exec.status.toLowerCase().includes(q) ||
          label.includes(q) ||
          started.includes(q)
        );
      })
    : executions;

  let body = <p className="text-muted-foreground p-4 text-xs">{t("executions_empty")}</p>;
  if (loading && executions.length === 0) {
    body = <p className="text-muted-foreground p-4 text-xs">{t("executions_loading")}</p>;
  } else if (filtered.length === 0) {
    body = (
      <p className="text-muted-foreground p-4 text-xs">
        {executions.length === 0 ? t("executions_empty") : t("executions_empty_search")}
      </p>
    );
  } else {
    body = (
      <ul>
        {filtered.map((exec) => {
          const started = new Date(exec.startedAt);
          return (
            <li key={exec.executionKey}>
              <button
                type="button"
                onClick={() => onSelect(exec.executionKey)}
                className={cn(
                  "flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors",
                  selectedKey === exec.executionKey ? "bg-muted" : "hover:bg-muted/50",
                )}
              >
                <ExecutionStatusGlyph status={exec.status} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-medium">{executionHeadline(exec, t)}</span>
                  <span className="text-muted-foreground mt-0.5 block text-[11px]">
                    {started.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}
                  </span>
                  <span className="text-muted-foreground block text-[11px]">{started.toLocaleTimeString()}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <aside className="bg-background flex h-full min-h-0 w-full min-w-0 flex-col">
      <div className="flex shrink-0 flex-col gap-2 border-b px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">{t("executions_title")}</h2>
          <button
            type="button"
            className={cn(
              "text-muted-foreground hover:bg-muted hover:text-foreground flex size-7 shrink-0 items-center justify-center rounded-md",
              searchOpen && "bg-muted text-foreground",
            )}
            aria-label={t("executions_search_placeholder")}
            onClick={() => onSearchOpenChange(!searchOpen)}
          >
            <Search className="size-3.5" aria-hidden />
          </button>
          <Button variant="ghost" size="icon" className="size-7 shrink-0" onClick={onRefresh} disabled={loading}>
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
          </Button>
          {onCollapse ? (
            <button
              type="button"
              title={t("executions_collapse_list")}
              aria-label={t("executions_collapse_list")}
              aria-expanded
              onClick={onCollapse}
              className="text-muted-foreground hover:bg-muted hover:text-foreground flex size-7 shrink-0 items-center justify-center rounded-md"
            >
              <ChevronLeft className="size-3.5" aria-hidden />
            </button>
          ) : null}
        </div>
        {searchOpen ? (
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t("executions_search_placeholder")}
            className="h-8 text-xs"
            autoFocus
          />
        ) : null}
        <label className="text-muted-foreground flex items-center justify-between gap-2 text-[11px]">
          {t("executions_auto_refresh")}
          <Switch checked={autoRefresh} onCheckedChange={onAutoRefreshChange} />
        </label>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">{body}</div>
    </aside>
  );
}
