"use client";

import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";

import { ExternalLink, RefreshCw, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { dashboardApiErrorMessage, isStepUpRequired, parseDashboardApiError } from "@/lib/dashboard-api-error";

import { useRequireAdmin } from "../_hooks/use-require-admin";
import { EMPTY_FILTERS, LogFiltersBar, type LogFilters } from "./_components/filters";
import { formatCostUsd, formatGatewayTime } from "./_components/format";
import { LogsTable, type GatewayLogRow } from "./_components/logs-table";
import type { GatewayLogDetail } from "./_components/inspector";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.aiagents-hub.vn";
const LIVE_MS = 10_000;
const LIVE_MAX_MS = 5 * 60_000;

type ExecutionCard = {
  executionKey: string;
  workflowId: number | null;
  workflowName: string | null;
  status: string | null;
  startedAt: number | null;
  finishedAt: number | null;
  ownerHash: string | null;
};

type Report = {
  link: "stamped" | "unstamped" | "unavailable";
  accountId: string;
  gatewayId: string;
  execution: ExecutionCard | null;
  summary: {
    logCount: number;
    costUsd: number;
    tokensIn: number;
    tokensOut: number;
    cached: number;
    errors: number;
    truncated: boolean;
  } | null;
  logs: GatewayLogRow[];
  page: number;
  perPage: number;
  totalCount: number;
};

type RecentExecution = {
  executionKey: string;
  workflowId: number;
  workflowName?: string;
  status: string;
  startedAt?: number;
};

type ApiError = { message: string; code?: string };

function queryFromFilters(filters: LogFilters, page: number): string {
  const params = new URLSearchParams();
  params.set("page", String(page));
  if (filters.status === "success") params.set("success", "true");
  if (filters.status === "error") params.set("success", "false");
  if (filters.cache === "cached") params.set("cached", "true");
  if (filters.cache === "miss") params.set("cached", "false");
  if (filters.model.trim()) params.set("model", filters.model.trim());
  if (filters.search.trim()) params.set("search", filters.search.trim());
  return params.toString();
}

export default function AiGatewayLogsPage() {
  const t = useTranslations("AiGatewayLogsAdmin");
  const isAdmin = useRequireAdmin();
  const router = useRouter();
  const searchParams = useSearchParams();
  const executionKey = searchParams.get("executionKey")?.trim() ?? "";
  const [draftKey, setDraftKey] = useState(executionKey);
  const [filterState, setFilterState] = useState({ key: executionKey, filters: EMPTY_FILTERS });
  if (filterState.key !== executionKey) {
    setFilterState({ key: executionKey, filters: EMPTY_FILTERS });
  }
  const filters = filterState.key === executionKey ? filterState.filters : EMPTY_FILTERS;
  const setFilters = (next: LogFilters) => setFilterState({ key: executionKey, filters: next });
  const [pageState, setPageState] = useState({ key: executionKey, page: 1 });
  if (pageState.key !== executionKey) {
    setPageState({ key: executionKey, page: 1 });
  }
  const page = pageState.key === executionKey ? pageState.page : 1;
  const setPage = (next: number | ((current: number) => number)) => {
    setPageState((current) => {
      const pageNow = current.key === executionKey ? current.page : 1;
      const value = typeof next === "function" ? next(pageNow) : next;
      return { key: executionKey, page: value };
    });
  };
  const [report, setReport] = useState<Report | null>(null);
  const [recent, setRecent] = useState<RecentExecution[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<GatewayLogDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const reportRef = useRef<Report | null>(null);
  const liveStarted = useRef(0);
  reportRef.current = report;

  useEffect(() => {
    setDraftKey(executionKey);
    setSelectedId(null);
    setDetail(null);
  }, [executionKey]);

  const loadReport = useCallback(
    async (silent: boolean) => {
      if (!executionKey) return;
      if (!silent) setLoading(true);
      try {
        const response = await fetch(
          `${API_BASE_URL}/dashboard/admin/ai-gateway/executions/${encodeURIComponent(executionKey)}/logs?${queryFromFilters(filters, page)}`,
          { credentials: "include" },
        );
        if (!response.ok) {
          const errBody = await parseDashboardApiError(response);
          if (isStepUpRequired(errBody)) return;
          const next = { message: dashboardApiErrorMessage(errBody, t("load_error")), code: errBody?.code };
          if (response.status === 429 && reportRef.current) {
            setError(next);
            return;
          }
          if (!silent || !reportRef.current) {
            setReport(null);
          }
          setError(next);
          return;
        }
        const body = (await response.json()) as Report;
        setReport(body);
        setError(null);
        setSelectedId((current) => (current && body.logs.some((row) => row.id === current) ? current : null));
      } catch (err) {
        if (!silent) setReport(null);
        setError({ message: err instanceof Error ? err.message : t("load_error") });
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [executionKey, filters, page, t],
  );

  useEffect(() => {
    if (!isAdmin || !executionKey) return;
    const handle = window.setTimeout(() => {
      void loadReport(false);
    }, 300);
    return () => window.clearTimeout(handle);
  }, [isAdmin, executionKey, filters, page, loadReport]);

  useEffect(() => {
    if (!isAdmin || executionKey) return;
    let cancelled = false;
    void (async () => {
      const response = await fetch(`${API_BASE_URL}/dashboard/admin/billing/workflow-execution-usages`, {
        credentials: "include",
      });
      if (!response.ok || cancelled) return;
      const body = (await response.json()) as { recentExecutions?: RecentExecution[] };
      if (!cancelled) setRecent(body.recentExecutions ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [isAdmin, executionKey]);

  useEffect(() => {
    if (live) liveStarted.current = Date.now();
  }, [live]);

  useEffect(() => {
    if (!live || !executionKey) return;
    const timer = window.setInterval(() => {
      if (Date.now() - liveStarted.current >= LIVE_MAX_MS) {
        setLive(false);
        return;
      }
      void loadReport(true);
    }, LIVE_MS);
    return () => window.clearInterval(timer);
  }, [live, executionKey, loadReport]);

  useEffect(() => {
    if (!selectedId || !executionKey) {
      setDetail(null);
      setDetailError(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    setDetailError(null);
    setDetail(null);
    void (async () => {
      try {
        const response = await fetch(
          `${API_BASE_URL}/dashboard/admin/ai-gateway/executions/${encodeURIComponent(executionKey)}/logs/${encodeURIComponent(selectedId)}`,
          { credentials: "include" },
        );
        if (cancelled) return;
        if (!response.ok) {
          const errBody = await parseDashboardApiError(response);
          if (isStepUpRequired(errBody)) return;
          const code = errBody?.code ?? "";
          setDetailError(code === "log_gone" || code === "log_not_found" ? t("log_gone") : t("load_error"));
          return;
        }
        setDetail((await response.json()) as GatewayLogDetail);
      } catch {
        if (!cancelled) setDetailError(t("load_error"));
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId, executionKey, t]);

  if (!isAdmin) return null;

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const key = draftKey.trim();
    if (!key) {
      router.replace("/dashboard/ai-gateway-logs");
      return;
    }
    router.replace(`/dashboard/ai-gateway-logs?executionKey=${encodeURIComponent(key)}`);
  };

  const summary = report?.summary;
  const unavailable = error?.code === "ai_gateway_unreadable";
  const from = report && report.totalCount > 0 ? (report.page - 1) * report.perPage + 1 : 0;
  const to = report ? Math.min(report.page * report.perPage, report.totalCount) : 0;
  const pageCount = report ? Math.max(1, Math.ceil(report.totalCount / report.perPage)) : 1;
  const cloudflareUrl = report?.accountId
    ? `https://dash.cloudflare.com/${report.accountId}/ai/ai-gateway/gateways/${report.gatewayId || "unitoken"}/logs`
    : null;

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Sparkles className="size-5" />
            {t("page_title")}
          </h1>
          <p className="text-muted-foreground max-w-3xl">{t("page_description")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {executionKey ? (
            <Link
              href={`/dashboard/workflow-execution-usages?executionKey=${encodeURIComponent(executionKey)}`}
              className="text-primary text-sm underline-offset-4 hover:underline"
            >
              {t("open_usages")}
            </Link>
          ) : null}
          {cloudflareUrl ? (
            <a
              href={cloudflareUrl}
              target="_blank"
              rel="noreferrer"
              className="text-primary inline-flex items-center gap-1 text-sm underline-offset-4 hover:underline"
            >
              {t("open_cloudflare")}
              <ExternalLink className="size-3" />
            </a>
          ) : null}
        </div>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-1">
          <Label htmlFor="execution-key">{t("execution_label")}</Label>
          <Input
            id="execution-key"
            value={draftKey}
            onChange={(event) => setDraftKey(event.target.value)}
            placeholder={t("execution_placeholder")}
          />
        </div>
        <Button type="submit">{t("search")}</Button>
      </form>

      {!executionKey && recent.length > 0 ? (
        <div className="space-y-2">
          <h2 className="font-semibold">{t("recent_heading")}</h2>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("col_time")}</TableHead>
                  <TableHead>{t("col_workflow")}</TableHead>
                  <TableHead>{t("col_status")}</TableHead>
                  <TableHead>{t("execution_label")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recent.map((row) => (
                  <TableRow
                    key={row.executionKey}
                    className="cursor-pointer"
                    onClick={() =>
                      router.replace(`/dashboard/ai-gateway-logs?executionKey=${encodeURIComponent(row.executionKey)}`)
                    }
                  >
                    <TableCell className="text-xs whitespace-nowrap">{formatGatewayTime(row.startedAt)}</TableCell>
                    <TableCell className="text-sm">{row.workflowName || `#${row.workflowId}`}</TableCell>
                    <TableCell className="text-xs capitalize">{row.status}</TableCell>
                    <TableCell className="font-mono text-xs">{row.executionKey}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : null}

      {executionKey && report ? (
        <div className="bg-card space-y-3 rounded-lg border p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs">{report.gatewayId}</span>
            <span className="text-muted-foreground text-xs">{report.execution?.executionKey ?? executionKey}</span>
            {report.execution?.workflowName ? <span className="text-sm">{report.execution.workflowName}</span> : null}
            {report.execution?.status ? (
              <Badge variant="outline" className="capitalize">
                {report.execution.status}
              </Badge>
            ) : (
              <Badge variant="outline">{t("unknown_execution")}</Badge>
            )}
          </div>
          <p className="text-muted-foreground text-xs">
            {formatGatewayTime(report.execution?.startedAt)} – {formatGatewayTime(report.execution?.finishedAt)}
          </p>
          {summary ? (
            <div className="flex flex-wrap gap-3 text-sm">
              <span>
                {t("chip_logs", { count: summary.logCount })}
              </span>
              <span>{formatCostUsd(summary.costUsd)}</span>
              <span>{t("usage_in_out", { in: summary.tokensIn, out: summary.tokensOut })}</span>
              <span>{t("chip_cached", { count: summary.cached })}</span>
              <span>{t("chip_errors", { count: summary.errors })}</span>
              {summary.truncated ? <span className="text-muted-foreground">{t("summary_truncated")}</span> : null}
            </div>
          ) : null}
          <p className="text-muted-foreground text-xs">{t("credit_note")}</p>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant="outline" size="sm" disabled={loading} onClick={() => void loadReport(false)}>
              <RefreshCw className={`size-3 ${loading ? "animate-spin" : ""}`} />
              {t("refresh")}
            </Button>
            <Label htmlFor="gw-live" className="flex items-center gap-2 text-sm">
              <Switch id="gw-live" checked={live} onCheckedChange={setLive} />
              {t("live")}
            </Label>
            {report.execution?.status === "running" && !live ? (
              <button type="button" className="text-primary text-xs underline-offset-4 hover:underline" onClick={() => setLive(true)}>
                {t("running_hint")}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {unavailable ? <p className="text-destructive text-sm">{t("unavailable")}</p> : null}
      {error && !unavailable ? <p className="text-destructive text-sm">{error.message}</p> : null}

      {executionKey && report && !unavailable ? (
        <>
          <LogFiltersBar
            filters={filters}
            onChange={(next) => {
              setFilters(next);
              setPage(1);
            }}
          />
          {report.logs.length > 0 ? (
            <>
              <LogsTable
                rows={report.logs}
                selectedId={selectedId}
                onSelect={(id) => setSelectedId((current) => (current === id ? null : id))}
                detail={detail}
                detailLoading={detailLoading}
                detailError={detailError}
              />
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>{t("showing", { from, to, total: report.totalCount })}</span>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((n) => n - 1)}>
                    {t("prev")}
                  </Button>
                  <span>
                    {page} / {pageCount}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={page >= pageCount}
                    onClick={() => setPage((n) => n + 1)}
                  >
                    {t("next")}
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <p className="text-muted-foreground text-sm">{report.link === "unstamped" ? t("unstamped") : t("no_logs")}</p>
          )}
        </>
      ) : null}
    </div>
  );
}
