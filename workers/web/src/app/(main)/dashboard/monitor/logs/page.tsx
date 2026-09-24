"use client";

import { useCallback, useEffect, useState } from "react";

import { RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

import { LogsOverviewChart } from "./_components/logs-overview-chart";
import { LogsStatsCards } from "./_components/logs-stats-cards";
import { LogsTableCard } from "./_components/logs-table-card";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.aiagents-hub.vn";
const PAGE_SIZE = 25;

export interface ExecutionLog {
  id?: number;
  executionKey: string;
  workflowId: number;
  workflowName?: string;
  status: string;
  totalCreditsCharged?: number;
  totalCostVnd?: number;
  stepCount?: number;
  startedAt?: number;
  finishedAt?: number;
  error?: string;
}

interface RunStats {
  total: number;
  failed: number;
  completed: number;
  failRatePercent: number;
  totalCredits: number;
}

const STATUSES = ["all", "running", "completed", "failed", "pending_human", "cancelled"] as const;

export default function MonitorLogsPage() {
  const t = useTranslations("MonitorLogsPage");
  const { toast } = useToast();
  const [logs, setLogs] = useState<ExecutionLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [runStats, setRunStats] = useState<RunStats | null>(null);
  const [workflowIdFilter, setWorkflowIdFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState(() => {
    const from = new Date();
    from.setDate(from.getDate() - 7);
    return from.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));

  const buildLogsQueryParams = useCallback(
    (overrideOffset?: number) => {
      const params = new URLSearchParams();
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(overrideOffset ?? offset));
      if (workflowIdFilter.trim() && /^\d+$/.test(workflowIdFilter.trim())) {
        params.set("workflowId", workflowIdFilter.trim());
      }
      if (statusFilter && statusFilter !== "all") {
        params.set("status", statusFilter);
      }
      if (dateFrom) params.set("dateFrom", String(new Date(dateFrom).getTime()));
      if (dateTo) {
        const endOfDay = new Date(dateTo);
        endOfDay.setHours(23, 59, 59, 999);
        params.set("dateTo", String(endOfDay.getTime()));
      }
      return params.toString();
    },
    [offset, workflowIdFilter, statusFilter, dateFrom, dateTo],
  );

  const fetchLogs = useCallback(
    async (overrideOffset?: number) => {
      try {
        const qs = buildLogsQueryParams(overrideOffset);
        const response = await fetch(`${API_BASE_URL}/dashboard/monitor/logs?${qs}`, {
          method: "GET",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
        });
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(errorText ? errorText : t("fetch_error"));
        }
        const result: {
          logs?: ExecutionLog[];
          hasMore?: boolean;
          runStats?: RunStats;
          errorRate?: { total: number; errors: number; errorRatePercent: number };
        } = await response.json();
        setLogs(result.logs ?? []);
        setHasMore(result.hasMore ?? false);
        setRunStats(
          result.runStats ??
            (result.errorRate
              ? {
                  total: result.errorRate.total,
                  failed: result.errorRate.errors,
                  completed: 0,
                  failRatePercent: result.errorRate.errorRatePercent,
                  totalCredits: 0,
                }
              : null),
        );
        setError(null);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : t("fetch_error");
        setError(errorMessage);
        setLogs([]);
        setRunStats(null);
        toast({ title: t("error"), description: errorMessage, variant: "destructive" });
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [buildLogsQueryParams, t, toast],
  );

  useEffect(() => {
    setIsLoading(true);
    void fetchLogs();
  }, [fetchLogs]);

  const handleApplyFilters = () => {
    setOffset(0);
    setIsLoading(true);
    void fetchLogs(0);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{t("title")}</h1>
          <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed">{t("description")}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setIsRefreshing(true);
            void fetchLogs();
          }}
          disabled={isLoading || isRefreshing}
          className="shrink-0"
        >
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
          <span className="ml-2">{t("refresh")}</span>
        </Button>
      </div>

      <LogsStatsCards
        logsCount={logs.length}
        servicesCount={0}
        errorRate={
          runStats
            ? { total: runStats.total, errors: runStats.failed, errorRatePercent: runStats.failRatePercent }
            : null
        }
        runStats={runStats}
      />

      <div className="bg-card grid gap-3 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1">
          <Label htmlFor="workflow-id">{t("filters.workflow_id")}</Label>
          <Input
            id="workflow-id"
            value={workflowIdFilter}
            onChange={(e) => setWorkflowIdFilter(e.target.value)}
            placeholder={t("filters.workflow_id_placeholder")}
          />
        </div>
        <div className="space-y-1">
          <Label>{t("filters.status")}</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {t(`filters.status_${s}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="date-from">{t("filters.date_from")}</Label>
          <Input id="date-from" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="date-to">{t("filters.date_to")}</Label>
          <Input id="date-to" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
        <div className="sm:col-span-2 lg:col-span-4">
          <Button size="sm" onClick={handleApplyFilters}>
            {t("filters.apply")}
          </Button>
        </div>
      </div>

      <LogsOverviewChart logs={logs} t={t} />

      <LogsTableCard
        isLoading={isLoading}
        error={error}
        logs={logs}
        offset={offset}
        hasMore={hasMore}
        pageSize={PAGE_SIZE}
        onRetry={() => void fetchLogs()}
        onPrevPage={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
        onNextPage={() => {
          if (hasMore) setOffset(offset + PAGE_SIZE);
        }}
        t={t}
      />
    </div>
  );
}
