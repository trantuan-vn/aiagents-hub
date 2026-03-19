"use client";

import { useState, useEffect, useCallback } from "react";

import { ChartAreaInteractive } from "./_components/chart-area-interactive";
import { DataTable } from "./_components/data-table";
import { SectionCards } from "./_components/section-cards";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.unitoken.trade";

export interface AdminDefaultStats {
  totalRevenue: { current: number; previous: number; changePercent: number };
  newCustomers: { current: number; previous: number; changePercent: number };
  activeAccounts: { current: number; previous: number; changePercent: number };
  apiErrorRate: { current: number; previous: number; changePercent: number };
  visitorsByDate: { date: string; count: number }[];
  visitorsByCountry: { country: string; count: number }[];
}

export default function Page() {
  const [data, setData] = useState<AdminDefaultStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/dashboard/admin/default-stats`, {
        method: "GET",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "Failed to load dashboard stats");
      }

      const result: AdminDefaultStats = await response.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard stats");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchStats();
  }, [fetchStats]);

  if (isLoading) {
    return (
      <div className="@container/main flex flex-col gap-4 md:gap-6">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="@container/main flex flex-col gap-4 md:gap-6">
        <div className="text-destructive">{error ?? "Failed to load dashboard"}</div>
      </div>
    );
  }

  return (
    <div className="@container/main flex flex-col gap-4 md:gap-6">
      <SectionCards stats={data} />
      <ChartAreaInteractive visitorsByDate={data.visitorsByDate} />
      <DataTable visitorsByCountry={data.visitorsByCountry} />
    </div>
  );
}
