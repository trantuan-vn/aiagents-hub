"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import { RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { dashboardApiErrorMessage, isStepUpRequired, parseDashboardApiError } from "@/lib/dashboard-api-error";

import { useRequireAdmin } from "../_hooks/use-require-admin";
import { Explorer } from "./_components/explorer";
import { HealthCards } from "./_components/health-cards";
import { InboxTable } from "./_components/inbox-table";
import { InvocationPanel } from "./_components/invocation-panel";
import { RecommendationList } from "./_components/recommendation-list";
import {
  API_BASE_URL,
  type ErrorGroup,
  type GroupStatus,
  type LogsApiError,
  type LogsOverviewDto,
  type StabilityRecommendation,
  type TimeRangeId,
} from "./_components/types";

export default function CloudflareLogsPage() {
  const t = useTranslations("CloudflareLogsAdmin");
  const isAdmin = useRequireAdmin();
  const [range, setRange] = useState<TimeRangeId>("1h");
  const [tab, setTab] = useState("inbox");
  const [includeWarn, setIncludeWarn] = useState(false);
  const [overview, setOverview] = useState<LogsOverviewDto | null>(null);
  const [groups, setGroups] = useState<ErrorGroup[]>([]);
  const [recs, setRecs] = useState<StabilityRecommendation[]>([]);
  const [invocationId, setInvocationId] = useState<string | null>(null);
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
      const [ovRes, gRes, rRes] = await Promise.all([
        fetch(`${API_BASE_URL}/dashboard/admin/cloudflare-logs/overview?${qs}`, { credentials: "include" }),
        fetch(`${API_BASE_URL}/dashboard/admin/cloudflare-logs/groups?${qs}`, { credentials: "include" }),
        fetch(`${API_BASE_URL}/dashboard/admin/cloudflare-logs/recommendations?${qs}`, { credentials: "include" }),
      ]);
      if (!ovRes.ok) {
        const errBody = await parseDashboardApiError(ovRes);
        if (isStepUpRequired(errBody)) return;
        const parsed = errBody as LogsApiError | null;
        setErrorCode(parsed?.code);
        throw new Error(dashboardApiErrorMessage(errBody, t("load_error")));
      }
      setOverview((await ovRes.json()) as LogsOverviewDto);
      if (gRes.ok) {
        const gBody = (await gRes.json()) as { groups?: ErrorGroup[] };
        setGroups(gBody.groups ?? []);
      }
      if (rRes.ok) {
        const rBody = (await rRes.json()) as { recommendations?: StabilityRecommendation[] };
        setRecs(rBody.recommendations ?? []);
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
      const response = await fetch(`${API_BASE_URL}/dashboard/admin/cloudflare-logs/refresh?range=${range}`, {
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
      setOverview((await response.json()) as LogsOverviewDto);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("refresh_error"));
    } finally {
      setRefreshing(false);
    }
  };

  const patchGroup = async (fingerprint: string, body: { status?: GroupStatus; note?: string }) => {
    const response = await fetch(`${API_BASE_URL}/dashboard/admin/cloudflare-logs/groups/${fingerprint}`, {
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

  if (!isAdmin) return null;

  const samplingLabel = overview
    ? overview.sampling
        .map((s) => `${s.scriptName.replace("aiagents-hub-", "")}:${s.headSamplingRate ?? 1}`)
        .join(" · ")
    : "";

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight">{t("page_title")}</h1>
          <p className="text-muted-foreground max-w-3xl">{t("page_description")}</p>
          {overview ? (
            <p className="text-muted-foreground text-xs">
              {t("hub_index_only")} · {overview.cachedAt}
              {samplingLabel ? ` · ${t("sampling")}: ${samplingLabel}` : ""}
            </p>
          ) : null}
          <Link href="/dashboard/cloudflare-usage" className="text-primary text-sm underline-offset-4 hover:underline">
            {t("link_usage")}
          </Link>
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
          {errorCode === "observability_unreadable" || errorCode === "token_missing" ? (
            <p className="text-muted-foreground mt-2">{t("token_missing")}</p>
          ) : null}
        </div>
      ) : null}

      {overview?.telemetryError || overview?.graphqlError ? (
        <p className="text-muted-foreground text-sm">
          {t("partial_data")}
          {overview.telemetryError ? ` · ${overview.telemetryError}` : ""}
          {overview.graphqlError ? ` · ${overview.graphqlError}` : ""}
        </p>
      ) : null}

      {isLoading && !overview ? (
        <div className="text-muted-foreground flex min-h-[240px] items-center justify-center rounded-lg border border-dashed">
          {t("loading")}
        </div>
      ) : overview ? (
        <>
          <HealthCards data={overview} />
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="inbox">{t("inbox")}</TabsTrigger>
              <TabsTrigger value="recs">{t("recommendations")}</TabsTrigger>
              <TabsTrigger value="explorer">{t("explorer")}</TabsTrigger>
              <TabsTrigger value="invocation">{t("invocation")}</TabsTrigger>
            </TabsList>
            <TabsContent value="inbox" className="pt-3">
              <InboxTable
                groups={groups}
                obsErrorTotal={overview.workers.reduce((n, w) => n + (w.observabilityErrors ?? 0), 0)}
                onPatch={patchGroup}
                onOpenInvocation={(_fp, excerpt) => {
                  setTab("explorer");
                  void excerpt;
                }}
              />
            </TabsContent>
            <TabsContent value="recs" className="pt-3">
              <RecommendationList items={recs} />
            </TabsContent>
            <TabsContent value="explorer" className="pt-3">
              <label className="mb-2 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={includeWarn} onChange={(e) => setIncludeWarn(e.target.checked)} />
                {t("include_warn")}
              </label>
              <Explorer
                range={range}
                includeWarn={includeWarn}
                onInvocation={(id) => {
                  setInvocationId(id);
                  setTab("invocation");
                }}
              />
            </TabsContent>
            <TabsContent value="invocation" className="pt-3">
              <InvocationPanel invocationId={invocationId} />
            </TabsContent>
          </Tabs>
          <p className="text-muted-foreground text-xs">{t("disclaimer")}</p>
        </>
      ) : null}
    </div>
  );
}
