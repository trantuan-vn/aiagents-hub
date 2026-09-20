"use client";

import { useCallback, useEffect, useState } from "react";

import { RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { dashboardApiErrorMessage, isStepUpRequired, parseDashboardApiError } from "@/lib/dashboard-api-error";

import { useRequireAdmin } from "../_hooks/use-require-admin";
import { AlertsBanner } from "./_components/alerts-banner";
import { ExhaustTimeline } from "./_components/exhaust-timeline";
import { InventoryTable } from "./_components/inventory-table";
import { MetricsTable } from "./_components/metrics-table";
import { OverviewCards } from "./_components/overview-cards";
import { RecommendationList } from "./_components/recommendation-list";
import { SamplingPanel } from "./_components/sampling-panel";
import type { OverviewDto, UsageApiError } from "./_components/types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.aiagents-hub.vn";

export default function CloudflareUsagePage() {
  const t = useTranslations("CloudflareUsageAdmin");
  const isAdmin = useRequireAdmin();
  const [data, setData] = useState<OverviewDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [catalogBusy, setCatalogBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<UsageApiError["code"]>();

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setErrorCode(undefined);
    try {
      const response = await fetch(`${API_BASE_URL}/dashboard/admin/cloudflare/overview`, {
        method: "GET",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) {
        const errBody = await parseDashboardApiError(response);
        if (isStepUpRequired(errBody)) return;
        const parsed = errBody as UsageApiError | null;
        setErrorCode(parsed?.code);
        throw new Error(dashboardApiErrorMessage(errBody, t("load_error")));
      }
      setData((await response.json()) as OverviewDto);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : t("load_error"));
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (!isAdmin) return;
    void load();
  }, [isAdmin, load]);

  const refresh = async () => {
    setRefreshing(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/dashboard/admin/cloudflare/refresh`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
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
      setData((await response.json()) as OverviewDto);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("refresh_error"));
    } finally {
      setRefreshing(false);
    }
  };

  const refreshCatalog = async () => {
    setCatalogBusy(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/dashboard/admin/cloudflare/pricing-catalog/refresh`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      if (!response.ok) {
        const errBody = await parseDashboardApiError(response);
        if (isStepUpRequired(errBody)) return;
        throw new Error(dashboardApiErrorMessage(errBody, t("catalog_error")));
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("catalog_error"));
    } finally {
      setCatalogBusy(false);
    }
  };

  if (!isAdmin) return null;

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight">{t("page_title")}</h1>
          <p className="text-muted-foreground max-w-3xl">{t("page_description")}</p>
          {data ? (
            <p className="text-muted-foreground text-xs">
              {t("account")}: {data.accountIdMasked} · {t("catalog_as_of")}: {data.asOf} · {data.stale ? t("stale") : t("live")}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void load()} disabled={isLoading}>
            <RefreshCw className="mr-2 h-4 w-4" />
            {t("reload")}
          </Button>
          <Button onClick={() => void refresh()} disabled={refreshing}>
            {refreshing ? t("refreshing") : t("refresh")}
          </Button>
          <Button variant="secondary" onClick={() => void refreshCatalog()} disabled={catalogBusy}>
            {catalogBusy ? t("catalog_updating") : t("refresh_catalog")}
          </Button>
        </div>
      </div>

      {error ? (
        <div className="border-destructive/40 bg-destructive/5 rounded-lg border p-3 text-sm">
          <p className="text-destructive">{error}</p>
          {errorCode === "plans_unreadable" || errorCode === "token_missing" ? (
            <p className="text-muted-foreground mt-2">{t("token_missing")}</p>
          ) : null}
        </div>
      ) : null}

      {isLoading && !data ? (
        <div className="text-muted-foreground flex min-h-[240px] items-center justify-center rounded-lg border border-dashed">
          {t("loading")}
        </div>
      ) : data ? (
        <>
          <OverviewCards data={data} />
          <AlertsBanner data={data} />
          <ExhaustTimeline data={data} />
          <MetricsTable data={data} />
          <SamplingPanel />
          <RecommendationList data={data} />
          <InventoryTable data={data} />
          <p className="text-muted-foreground text-xs">{t("disclaimer")}</p>
        </>
      ) : null}
    </div>
  );
}
