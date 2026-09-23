"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import { Database, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { dashboardApiErrorMessage, isStepUpRequired, parseDashboardApiError } from "@/lib/dashboard-api-error";

import { useRequireAdmin } from "../_hooks/use-require-admin";
import { IncidentsTable } from "./_components/incidents-table";
import { CronRunsPanel, HotUsersPanel, TablesPanel } from "./_components/panels";
import { RecommendationList } from "./_components/recommendation-list";
import { StageStrip } from "./_components/stage-strip";
import {
  API_BASE_URL,
  statusClass,
  type ApiError,
  type CronRunSummary,
  type HotUserRow,
  type IncidentStatus,
  type PipelineIncident,
  type PipelineOverviewDto,
  type PipelineRecommendation,
  type TableHealthRow,
  type TimeRangeId,
  type UserDoHealthDto,
} from "./_components/types";

export default function PipelineHealthPage() {
  const t = useTranslations("PipelineHealthAdmin");
  const isAdmin = useRequireAdmin();
  const [range, setRange] = useState<TimeRangeId>("1h");
  const [tab, setTab] = useState("incidents");
  const [overview, setOverview] = useState<PipelineOverviewDto | null>(null);
  const [incidents, setIncidents] = useState<PipelineIncident[]>([]);
  const [recs, setRecs] = useState<PipelineRecommendation[]>([]);
  const [tables, setTables] = useState<TableHealthRow[]>([]);
  const [cronRuns, setCronRuns] = useState<CronRunSummary[]>([]);
  const [hotUsers, setHotUsers] = useState<HotUserRow[]>([]);
  const [probeId, setProbeId] = useState("");
  const [probeResult, setProbeResult] = useState<UserDoHealthDto | null>(null);
  const [probeError, setProbeError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string>();

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setErrorCode(undefined);
    try {
      const qs = `range=${range}`;
      const [ovRes, iRes, rRes, tRes, cRes, hRes] = await Promise.all([
        fetch(`${API_BASE_URL}/dashboard/admin/pipeline-health/overview?${qs}`, { credentials: "include" }),
        fetch(`${API_BASE_URL}/dashboard/admin/pipeline-health/incidents?${qs}`, { credentials: "include" }),
        fetch(`${API_BASE_URL}/dashboard/admin/pipeline-health/recommendations?${qs}`, { credentials: "include" }),
        fetch(`${API_BASE_URL}/dashboard/admin/pipeline-health/tables`, { credentials: "include" }),
        fetch(`${API_BASE_URL}/dashboard/admin/pipeline-health/cron-runs?limit=20`, { credentials: "include" }),
        fetch(`${API_BASE_URL}/dashboard/admin/pipeline-health/hot-users`, { credentials: "include" }),
      ]);
      if (!ovRes.ok) {
        const errBody = await parseDashboardApiError(ovRes);
        if (isStepUpRequired(errBody)) return;
        const parsed = errBody as ApiError | null;
        setErrorCode(parsed?.code);
        throw new Error(dashboardApiErrorMessage(errBody, t("load_error")));
      }
      setOverview((await ovRes.json()) as PipelineOverviewDto);
      if (iRes.ok) {
        const body = (await iRes.json()) as { incidents?: PipelineIncident[] };
        setIncidents(body.incidents ?? []);
      }
      if (rRes.ok) {
        const body = (await rRes.json()) as { recommendations?: PipelineRecommendation[] };
        setRecs(body.recommendations ?? []);
      }
      if (tRes.ok) {
        const body = (await tRes.json()) as { tables?: TableHealthRow[] };
        setTables(body.tables ?? []);
      }
      if (cRes.ok) {
        const body = (await cRes.json()) as { runs?: CronRunSummary[] };
        setCronRuns(body.runs ?? []);
      }
      if (hRes.ok) {
        const body = (await hRes.json()) as { users?: HotUserRow[] };
        setHotUsers(body.users ?? []);
      }
    } catch (err) {
      setOverview(null);
      setError(err instanceof Error ? err.message : t("load_error"));
    } finally {
      setIsLoading(false);
    }
  }, [range, t]);

  useEffect(() => {
    if (!isAdmin) return;
    void load();
  }, [isAdmin, load]);

  const refresh = async () => {
    setRefreshing(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/dashboard/admin/pipeline-health/refresh?range=${range}`, {
        method: "POST",
        credentials: "include",
      });
      if (response.status === 429) {
        setError(t("rate_limited"));
        return;
      }
      if (!response.ok) {
        const errBody = await parseDashboardApiError(response);
        if (isStepUpRequired(errBody)) return;
        throw new Error(dashboardApiErrorMessage(errBody, t("refresh_error")));
      }
      setOverview((await response.json()) as PipelineOverviewDto);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("refresh_error"));
    } finally {
      setRefreshing(false);
    }
  };

  const patchIncident = async (fingerprint: string, body: { status?: IncidentStatus; note?: string }) => {
    const response = await fetch(`${API_BASE_URL}/dashboard/admin/pipeline-health/incidents/${fingerprint}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const errBody = await parseDashboardApiError(response);
      if (isStepUpRequired(errBody)) return;
      throw new Error(dashboardApiErrorMessage(errBody, t("patch_error")));
    }
    await load();
  };

  const runProbe = async (userId: string) => {
    setProbeId(userId);
    setProbeError(null);
    setProbeResult(null);
    setTab("probe");
    const response = await fetch(`${API_BASE_URL}/dashboard/admin/pipeline-health/users/${userId}`, {
      credentials: "include",
    });
    if (!response.ok) {
      const errBody = await parseDashboardApiError(response);
      if (isStepUpRequired(errBody)) return;
      setProbeError(dashboardApiErrorMessage(errBody, t("probe_error")));
      return;
    }
    setProbeResult((await response.json()) as UserDoHealthDto);
  };

  if (!isAdmin) return null;

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Database className="h-6 w-6" />
            {t("page_title")}
          </h1>
          <p className="text-muted-foreground max-w-3xl">{t("page_description")}</p>
          {overview ? (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge className={statusClass(overview.overall)} variant="outline">
                {overview.overall}
              </Badge>
              <span className="text-muted-foreground">
                {t("retention_days")}: {overview.retentionDays} · {t("sample_confidence")}: {overview.sampleSize} DO ·{" "}
                {overview.cachedAt}
              </span>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-3 text-sm">
            <Link href="/dashboard/cloudflare-usage" className="text-primary underline-offset-4 hover:underline">
              {t("link_usage")}
            </Link>
            <Link href="/dashboard/cloudflare-logs" className="text-primary underline-offset-4 hover:underline">
              {t("link_logs")}
            </Link>
            <Link href="/dashboard/system-config" className="text-primary underline-offset-4 hover:underline">
              {t("link_system_config")}
            </Link>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {(["1h", "6h", "24h", "7d"] as const).map((id) => (
            <Button key={id} size="sm" variant={range === id ? "default" : "outline"} onClick={() => setRange(id)}>
              {t(`range_${id}`)}
            </Button>
          ))}
          <Button variant="outline" onClick={() => void load()} disabled={isLoading}>
            <RefreshCw className="mr-2 h-4 w-4" />
            {t("reload")}
          </Button>
          <Button onClick={() => void refresh()} disabled={refreshing}>
            {refreshing ? t("refreshing") : t("refresh")}
          </Button>
        </div>
      </div>

      {error ? (
        <div className="border-destructive/40 bg-destructive/5 rounded-lg border p-3 text-sm">
          <p className="text-destructive">{error}</p>
          {errorCode === "token_missing" ? <p className="text-muted-foreground mt-2">{t("token_partial")}</p> : null}
        </div>
      ) : null}

      {overview?.telemetryError || overview?.queuesError ? (
        <p className="text-muted-foreground text-sm">
          {t("partial_data")}
          {overview.telemetryError ? ` · ${overview.telemetryError}` : ""}
          {overview.queuesError ? ` · ${overview.queuesError}` : ""}
        </p>
      ) : null}

      {isLoading && !overview ? (
        <div className="text-muted-foreground flex min-h-[240px] items-center justify-center rounded-lg border border-dashed">
          {t("loading")}
        </div>
      ) : overview ? (
        <>
          <StageStrip data={overview} />
          <div className="rounded-lg border p-3 text-sm">
            <p className="font-medium">{t("lag")}</p>
            <p className="text-muted-foreground text-xs">
              pending P50/P95: {overview.lag.doPendingP50 ?? "—"} / {overview.lag.doPendingP95 ?? "—"} · queue depth:{" "}
              {overview.lag.queueDepthApprox ?? "—"} · DLQ: {overview.lag.dlqPendingApprox ?? "—"} · D1→R2 hours:{" "}
              {overview.lag.e2eD1ToR2Hours ?? "—"} · confidence: {overview.lag.confidence}
            </p>
            <p className="text-muted-foreground mt-1 text-xs">
              {t("open_incidents")}: {overview.openCount} · {t("new_1h")}: {overview.new1h}
            </p>
          </div>
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="flex h-auto flex-wrap">
              <TabsTrigger value="incidents">{t("incidents")}</TabsTrigger>
              <TabsTrigger value="recs">{t("recommendations")}</TabsTrigger>
              <TabsTrigger value="tables">{t("tables")}</TabsTrigger>
              <TabsTrigger value="cron">{t("cron_runs")}</TabsTrigger>
              <TabsTrigger value="hot">{t("hot_users")}</TabsTrigger>
              <TabsTrigger value="probe">{t("do_probe")}</TabsTrigger>
            </TabsList>
            <TabsContent value="incidents" className="pt-3">
              <IncidentsTable incidents={incidents} onPatch={patchIncident} />
            </TabsContent>
            <TabsContent value="recs" className="pt-3">
              <RecommendationList items={recs} />
            </TabsContent>
            <TabsContent value="tables" className="pt-3">
              <TablesPanel tables={tables} />
            </TabsContent>
            <TabsContent value="cron" className="pt-3">
              <CronRunsPanel runs={cronRuns} />
            </TabsContent>
            <TabsContent value="hot" className="pt-3">
              <HotUsersPanel users={hotUsers} onProbe={(id) => void runProbe(id)} />
            </TabsContent>
            <TabsContent value="probe" className="space-y-3 pt-3">
              <div className="flex flex-wrap gap-2">
                <input
                  className="border-input bg-background min-w-[280px] flex-1 rounded-md border px-2 py-1 font-mono text-sm"
                  placeholder="64-char DO userId"
                  value={probeId}
                  onChange={(e) => setProbeId(e.target.value.trim())}
                />
                <Button onClick={() => void runProbe(probeId)} disabled={probeId.length !== 64}>
                  {t("do_probe")}
                </Button>
              </div>
              {probeError ? <p className="text-destructive text-sm">{probeError}</p> : null}
              {probeResult ? (
                <pre className="bg-muted/40 max-h-96 overflow-auto rounded-lg border p-3 text-xs">
                  {JSON.stringify(probeResult, null, 2)}
                </pre>
              ) : null}
            </TabsContent>
          </Tabs>
          <p className="text-muted-foreground text-xs">
            {t("not_finops")} · {t("not_worker_logs")}
          </p>
        </>
      ) : null}
    </div>
  );
}
