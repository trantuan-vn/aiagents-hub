"use client";

import { useState, useEffect, useCallback } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { ChartAreaInteractive } from "./_components/chart-area-interactive";
import { DataTable } from "./_components/data-table";
import { SectionCards } from "./_components/section-cards";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.aiagents-hub.vn";
const DASHBOARD_LOAD_ERROR = "Khong the tai du lieu bang dieu khien.";

function formatDashboardError(raw: string, status: number): string {
  const fallbackRateLimit = "Ban thao tac qua nhanh. Vui long thu lai sau it phut.";
  try {
    const parsed = JSON.parse(raw) as {
      error?: string;
      message?: string;
      retryAfter?: number;
    };
    const retryAfter =
      typeof parsed.retryAfter === "number" && Number.isFinite(parsed.retryAfter) && parsed.retryAfter > 0
        ? Math.ceil(parsed.retryAfter)
        : undefined;
    if (retryAfter !== undefined) {
      return `Ban thao tac qua nhanh. Vui long thu lai sau ${retryAfter} giay.`;
    }
    if (typeof parsed.error === "string" && parsed.error.trim()) {
      return parsed.error.trim();
    }
    if (typeof parsed.message === "string" && parsed.message.trim()) {
      return parsed.message.trim();
    }
  } catch {
    // Keep fallback path for non-JSON responses.
  }

  if (status === 429) return fallbackRateLimit;
  const normalized = raw.trim();
  if (!normalized) return DASHBOARD_LOAD_ERROR;
  if (normalized.startsWith("{") || normalized.startsWith("[")) return DASHBOARD_LOAD_ERROR;
  return normalized;
}

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
        throw new Error(formatDashboardError(errorText, response.status));
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
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-8 text-center">
          <p className="text-muted-foreground">Khong the tai bang dieu khien ngay bay gio.</p>
          <Button onClick={() => void fetchStats()} disabled={isLoading}>
            Thu lai
          </Button>
        </div>

        <Dialog open={Boolean(error)} onOpenChange={(open) => !open && setError(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Khong tai duoc du lieu</DialogTitle>
              <DialogDescription>{error ?? DASHBOARD_LOAD_ERROR}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setError(null)}>
                Dong
              </Button>
              <Button
                onClick={() => {
                  setError(null);
                  void fetchStats();
                }}
              >
                Thu lai
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
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
