"use client";

import { useCallback, useEffect, useState } from "react";

import Link from "next/link";

import { GitBranch, TrendingUp, Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.aiagents-hub.vn";

const fmtVnd = (n: number): string =>
  new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(n);

interface WorkflowIncomeSummaryProps {
  t: (key: string) => string;
}

interface EarningsStats {
  totalAmount?: number;
  byDay?: { date: string; total: number }[];
}

export function WorkflowIncomeSummary({ t }: WorkflowIncomeSummaryProps) {
  const [stats, setStats] = useState<EarningsStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/dashboard/build/workflows/earnings/stats?period=30`, {
        method: "GET",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        const data: EarningsStats = await res.json();
        setStats(data);
      } else {
        setStats(null);
      }
    } catch {
      setStats(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  if (isLoading) {
    return (
      <Card className="animate-pulse">
        <CardHeader>
          <div className="bg-muted h-5 w-32 rounded" />
          <div className="bg-muted mt-2 h-4 w-48 rounded" />
        </CardHeader>
        <CardContent>
          <div className="bg-muted h-16 rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  const totalEarnings = stats?.totalAmount ?? 0;

  return (
    <Card className="border-primary/20 overflow-hidden transition-shadow hover:shadow-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wallet className="text-primary h-5 w-5" />
          {t("workflow.title")}
        </CardTitle>
        <CardDescription>{t("workflow.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {totalEarnings > 0 && (
          <div className="bg-primary/5 rounded-lg p-3">
            <p className="text-muted-foreground text-xs">{t("workflow.earned")}</p>
            <p className="text-primary text-2xl font-bold">{fmtVnd(totalEarnings)}</p>
          </div>
        )}
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild className="flex-1 gap-1.5">
            <Link href="/dashboard/build/workflows">
              <GitBranch className="h-4 w-4" />
              {t("workflow.my_workflows")}
            </Link>
          </Button>
          <Button size="sm" asChild>
            <Link href="/dashboard/build/workflows/earnings" className="gap-1.5">
              <TrendingUp className="h-4 w-4" />
              {t("workflow.manage")}
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
