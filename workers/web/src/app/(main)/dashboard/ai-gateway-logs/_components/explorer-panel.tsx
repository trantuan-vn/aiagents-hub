"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ExternalLink, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { dashboardApiErrorMessage, isStepUpRequired, parseDashboardApiError } from "@/lib/dashboard-api-error";

import { EMPTY_FILTERS, LogFiltersBar, type LogFilters } from "./filters";
import { formatCostUsd, formatGatewayTime } from "./format";
import type { GatewayLogDetail } from "./inspector";
import { LogsTable, type GatewayLogRow } from "./logs-table";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.aiagents-hub.vn";
const LIVE_MS = 10_000;
const LIVE_MAX_MS = 5 * 60_000;

export type ExplorerRange = "1h" | "24h" | "7d";

type ExplorerReport = {
  scope: "all";
  accountId: string;
  gatewayId: string;
  range: ExplorerRange;
  since: string;
  summary: {
    logCount: number;
    costUsd: number;
    tokensIn: number;
    tokensOut: number;
    cached: number;
    errors: number;
    truncated: boolean;
  };
  logs: GatewayLogRow[];
  page: number;
  perPage: number;
  totalCount: number;
};

type ApiError = { message: string; code?: string };

function queryFromFilters(filters: LogFilters, page: number, range: ExplorerRange): string {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("range", range);
  if (filters.status === "success") params.set("success", "true");
  if (filters.status === "error") params.set("success", "false");
  if (filters.cache === "cached") params.set("cached", "true");
  if (filters.cache === "miss") params.set("cached", "false");
  if (filters.model.trim()) params.set("model", filters.model.trim());
  if (filters.search.trim()) params.set("search", filters.search.trim());
  return params.toString();
}

export function ExplorerPanel({
  range,
  onRange,
  onOpenExecution,
}: {
  range: ExplorerRange;
  onRange: (range: ExplorerRange) => void;
  onOpenExecution: (executionKey: string) => void;
}) {
  const t = useTranslations("AiGatewayLogsAdmin");
  const [filters, setFilters] = useState<LogFilters>(EMPTY_FILTERS);
  const [pageState, setPageState] = useState({ range, page: 1 });
  if (pageState.range !== range) setPageState({ range, page: 1 });
  const page = pageState.range === range ? pageState.page : 1;
  const setPage = (next: number | ((current: number) => number)) => {
    setPageState((current) => {
      const pageNow = current.range === range ? current.page : 1;
      const value = typeof next === "function" ? next(pageNow) : next;
      return { range, page: value };
    });
  };
  const [report, setReport] = useState<ExplorerReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<GatewayLogDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const reportRef = useRef<ExplorerReport | null>(null);
  const liveStarted = useRef(0);
  reportRef.current = report;

  const loadReport = useCallback(
    async (silent: boolean) => {
      if (!silent) setLoading(true);
      try {
        const response = await fetch(
          `${API_BASE_URL}/dashboard/admin/ai-gateway/logs?${queryFromFilters(filters, page, range)}`,
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
          if (!silent || !reportRef.current) setReport(null);
          setError(next);
          return;
        }
        const body = (await response.json()) as ExplorerReport;
        if (body.scope !== "all") {
          setReport(null);
          setError({ message: t("load_error") });
          return;
        }
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
    [filters, page, range, t],
  );

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void loadReport(false);
    }, 300);
    return () => window.clearTimeout(handle);
  }, [filters, page, range, loadReport]);

  useEffect(() => {
    if (live) liveStarted.current = Date.now();
  }, [live]);

  useEffect(() => {
    if (!live) return;
    const timer = window.setInterval(() => {
      if (Date.now() - liveStarted.current >= LIVE_MAX_MS) {
        setLive(false);
        return;
      }
      void loadReport(true);
    }, LIVE_MS);
    return () => window.clearInterval(timer);
  }, [live, loadReport]);

  useEffect(() => {
    setSelectedId(null);
    setDetail(null);
  }, [range]);

  useEffect(() => {
    if (!selectedId) {
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
          `${API_BASE_URL}/dashboard/admin/ai-gateway/logs/${encodeURIComponent(selectedId)}`,
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
  }, [selectedId, t]);

  const summary = report?.summary;
  const unavailable = error?.code === "ai_gateway_unreadable";
  const from = report && report.totalCount > 0 ? (report.page - 1) * report.perPage + 1 : 0;
  const to = report ? Math.min(report.page * report.perPage, report.totalCount) : 0;
  const pageCount = report ? Math.max(1, Math.ceil(report.totalCount / report.perPage)) : 1;
  const cloudflareUrl = report?.accountId
    ? `https://dash.cloudflare.com/${report.accountId}/ai/ai-gateway/gateways/${report.gatewayId || "unitoken"}/logs`
    : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-muted/40 space-y-2 rounded-lg border p-4">
        {report ? (
          <p className="text-muted-foreground text-xs">
            <span className="font-mono">{report.gatewayId}</span>
            {" · "}
            {t("since_label", { time: formatGatewayTime(report.since) })}
          </p>
        ) : null}
        {summary ? (
          <div className="flex flex-wrap gap-3 text-sm">
            <span>{t("chip_logs", { count: summary.logCount })}</span>
            <span>{formatCostUsd(summary.costUsd)}</span>
            <span>{t("usage_in_out", { in: summary.tokensIn, out: summary.tokensOut })}</span>
            <span>{t("chip_cached", { count: summary.cached })}</span>
            <span>{t("chip_errors", { count: summary.errors })}</span>
            {summary.truncated ? <span className="text-muted-foreground">{t("summary_truncated")}</span> : null}
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          {(["1h", "24h", "7d"] as const).map((id) => (
            <Button
              key={id}
              type="button"
              size="sm"
              variant={range === id ? "default" : "outline"}
              onClick={() => onRange(id)}
            >
              {t(`range_${id}`)}
            </Button>
          ))}
          <Button type="button" variant="outline" size="sm" disabled={loading} onClick={() => void loadReport(false)}>
            <RefreshCw className={`size-3 ${loading ? "animate-spin" : ""}`} />
            {t("refresh")}
          </Button>
          <Label htmlFor="gw-explorer-live" className="flex items-center gap-2 text-sm">
            <Switch id="gw-explorer-live" checked={live} onCheckedChange={setLive} />
            {t("live")}
          </Label>
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

      {unavailable ? <p className="text-destructive text-sm">{t("unavailable")}</p> : null}
      {error && !unavailable ? <p className="text-destructive text-sm">{error.message}</p> : null}

      {!unavailable ? (
        <>
          <LogFiltersBar
            filters={filters}
            onChange={(next) => {
              setFilters(next);
              setPage(1);
            }}
          />
          {report && report.logs.length > 0 ? (
            <>
              <LogsTable
                rows={report.logs}
                selectedId={selectedId}
                onSelect={(id) => setSelectedId((current) => (current === id ? null : id))}
                detail={detail}
                detailLoading={detailLoading}
                detailError={detailError}
                onOpenExecution={onOpenExecution}
              />
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>{t("showing", { from, to, total: report.totalCount })}</span>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((n) => n - 1)}
                  >
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
          ) : report ? (
            <p className="text-muted-foreground text-sm">{t("no_logs_range")}</p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
