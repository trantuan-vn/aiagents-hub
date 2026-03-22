"use client";

import { useCallback, useEffect, useState } from "react";

import { useTranslations } from "next-intl";

import { FinanceDataTables } from "./_components/finance-data-tables";
import { FinanceInsightCharts } from "./_components/finance-insight-charts";
import { FinanceOverviewCards } from "./_components/finance-overview-cards";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.unitoken.trade";

export interface AdminFinanceStats {
  totalRevenue: { current: number; previous: number; changePercent: number };
  totalOrders: { current: number; previous: number; changePercent: number };
  completedOrders: { current: number; previous: number; changePercent: number };
  commissionPaid: { current: number; previous: number; changePercent: number };
  totalDiscounts: { current: number; previous: number; changePercent: number };
  netRevenue: { current: number; previous: number; changePercent: number };
  averageOrderValue: { current: number; previous: number; changePercent: number };
  ordersByStatus: { status: string; count: number; amount: number; fill: string }[];
  revenueByMonth: { month: string; revenue: number; orders: number; commission: number; discount: number }[];
  revenueByDay: { date: string; revenue: number; orders: number }[];
  recentOrders: {
    id: string;
    orderCode: string;
    finalAmount: number;
    status: string;
    createdAt: string;
    userId?: string;
  }[];
}

export default function FinancePage() {
  const t = useTranslations("FinanceAdmin");
  const [data, setData] = useState<AdminFinanceStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/dashboard/admin/finance-stats`, {
        method: "GET",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "Failed to load finance stats");
      }

      const result: AdminFinanceStats = await response.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load finance stats");
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
          {t("loading")}
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
          {error ?? t("load_error")}
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
      <FinanceOverviewCards stats={data} />
      <FinanceInsightCharts stats={data} />
      <FinanceDataTables stats={data} />
    </div>
  );
}
