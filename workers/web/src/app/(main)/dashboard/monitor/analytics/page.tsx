"use client";

import { useCallback, useEffect, useState } from "react";

import { Activity, BarChart3, PieChart as PieChartIcon, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

import { AnalyticsAreaChart, AnalyticsPieChart, AnalyticsStackedBarChart } from "./_components/analytics-charts";
import { AnalyticsOverviewCards } from "./_components/analytics-overview-cards";
import { AnalyticsTable } from "./_components/analytics-table";
import type { AnalyticsData } from "./_components/utils";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.unitoken.trade";

type Duration = "week" | "month" | "quarter" | "year";

const DURATIONS: { value: Duration; labelKey: string }[] = [
  { value: "week", labelKey: "duration.week" },
  { value: "month", labelKey: "duration.month" },
  { value: "quarter", labelKey: "duration.quarter" },
  { value: "year", labelKey: "duration.year" },
];

export default function MonitorAnalyticsPage() {
  const t = useTranslations("MonitorAnalyticsPage");
  const { toast } = useToast();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [duration, setDuration] = useState<Duration>("month");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/dashboard/monitor/analytics?duration=${duration}`, {
        method: "GET",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || t("fetch_error"));
      }

      const result: AnalyticsData = await response.json();
      setData(result);
      setError(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : t("fetch_error");
      setError(errorMessage);
      setData(null);
      toast({
        title: t("error"),
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [duration, t, toast]);

  useEffect(() => {
    setIsLoading(true);
    void fetchAnalytics();
  }, [fetchAnalytics]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    void fetchAnalytics();
  };

  const handleDurationChange = (value: string) => {
    setDuration(value as Duration);
  };

  const chartData = data?.daily ?? [];
  const isEmpty = chartData.length === 0;
  const onRetry = () => void fetchAnalytics();

  return (
    <div className="flex flex-col gap-6 md:gap-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="mb-1 text-3xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed">{t("description")}</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={duration} onValueChange={handleDurationChange}>
            <SelectTrigger className="w-[160px]" aria-label={t("duration_label")}>
              <SelectValue placeholder={t("duration.month")} />
            </SelectTrigger>
            <SelectContent>
              {DURATIONS.map((d) => (
                <SelectItem key={d.value} value={d.value}>
                  {t(d.labelKey)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isLoading || isRefreshing}
            className="gap-2"
          >
            <RefreshCw className={cn("size-4", isRefreshing && "animate-spin")} />
            {t("refresh")}
          </Button>
        </div>
      </div>

      <AnalyticsOverviewCards data={data} t={t} isLoading={isLoading} />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="overflow-hidden border-0 shadow-lg lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="size-5 text-blue-500" />
              {t("chart.volume_title")}
            </CardTitle>
            <CardDescription>{t("chart.volume_description")}</CardDescription>
          </CardHeader>
          <CardContent>
            <AnalyticsAreaChart
              isLoading={isLoading}
              error={error}
              isEmpty={isEmpty}
              chartData={chartData}
              data={data}
              t={t}
              onRetry={onRetry}
            />
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-0 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PieChartIcon className="size-5 text-violet-500" />
              {t("chart.ratio_title")}
            </CardTitle>
            <CardDescription>{t("chart.ratio_description")}</CardDescription>
          </CardHeader>
          <CardContent>
            <AnalyticsPieChart isLoading={isLoading} error={error} data={data} t={t} onRetry={onRetry} />
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden border-0 shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="size-5 text-emerald-500" />
            {t("chart.title")}
          </CardTitle>
          <CardDescription>{t("chart.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <AnalyticsStackedBarChart
            isLoading={isLoading}
            error={error}
            isEmpty={isEmpty}
            chartData={chartData}
            data={data}
            t={t}
            onRetry={onRetry}
          />
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-0 shadow-lg">
        <CardHeader>
          <CardTitle>{t("table.title")}</CardTitle>
          <CardDescription>{t("table.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <AnalyticsTable
            isLoading={isLoading}
            error={error}
            isEmpty={isEmpty}
            chartData={chartData}
            data={data}
            t={t}
            onRetry={onRetry}
          />
        </CardContent>
      </Card>
    </div>
  );
}
