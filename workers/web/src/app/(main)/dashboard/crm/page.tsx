"use client";

import { useCallback, useEffect, useState } from "react";

import { useTranslations } from "next-intl";

import { CrmDataTables } from "./_components/crm-data-tables";
import { CrmInsightCharts } from "./_components/crm-insight-charts";
import { CrmOverviewCards } from "./_components/crm-overview-cards";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.aiagents-hub.vn";

export interface AdminCrmStats {
  totalUsers: { current: number; previous: number; changePercent: number };
  referredUsers: { current: number; previous: number; changePercent: number };
  directUsers: { current: number; previous: number; changePercent: number };
  totalRevenue: { current: number; previous: number; changePercent: number };
  commissionPaid: { current: number; previous: number; changePercent: number };
  usersBySource: { source: string; count: number; fill: string }[];
  newUsersByDate: { date: string; total: number; referred: number; direct: number }[];
  revenueByMonth: { month: string; revenue: number; orders: number }[];
  topReferrers: { referrerId: string; referredCount: number; commissionAmount: number }[];
  recentReferredUsers: { id: string; identifier: string; referrerId: string; createdAt: string }[];
  visitorsByCountry: { country: string; count: number }[];
}

export default function CrmPage() {
  const t = useTranslations("CRM");
  const [data, setData] = useState<AdminCrmStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/dashboard/admin/crm-stats`, {
        method: "GET",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "Failed to load CRM stats");
      }

      const result: AdminCrmStats = await response.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load CRM stats");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchStats();
  }, [fetchStats]);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 md:gap-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight">{t("page_title")}</h1>
          <p className="text-muted-foreground">{t("page_description")}</p>
        </div>
        <div className="text-muted-foreground flex min-h-[300px] items-center justify-center rounded-lg border border-dashed">
          Loading...
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col gap-4 md:gap-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight">{t("page_title")}</h1>
          <p className="text-muted-foreground">{t("page_description")}</p>
        </div>
        <div className="text-destructive flex min-h-[300px] items-center justify-center rounded-lg border border-dashed">
          {error ?? "Failed to load CRM"}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">{t("page_title")}</h1>
        <p className="text-muted-foreground">{t("page_description")}</p>
      </div>
      <CrmOverviewCards stats={data} />
      <CrmInsightCharts stats={data} />
      <CrmDataTables stats={data} />
    </div>
  );
}
