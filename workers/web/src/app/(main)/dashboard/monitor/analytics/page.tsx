"use client";

import { useCallback, useEffect, useState } from "react";

import { RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { Line, LineChart, XAxis, YAxis, CartesianGrid } from "recharts";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.unitoken.trade";

type Duration = "week" | "month" | "quarter" | "year";

interface DailyUsage {
  date: string;
  requestCount: number;
  cost: number;
}

interface AnalyticsData {
  daily: DailyUsage[];
  totalRequests: number;
  totalCost: number;
  duration: string;
}

const DURATIONS: { value: Duration; labelKey: string }[] = [
  { value: "week", labelKey: "duration.week" },
  { value: "month", labelKey: "duration.month" },
  { value: "quarter", labelKey: "duration.quarter" },
  { value: "year", labelKey: "duration.year" },
];

const chartConfig = {
  requestCount: {
    label: "API Requests",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

const UNIT_PRICE = 1000;

function formatDate(dateStr: string, locale?: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString(locale ?? "en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatEstimatedCost(requestCount: number): string {
  const cost = requestCount * UNIT_PRICE;
  if (cost === 0) return "—";
  return new Intl.NumberFormat("vi-VN").format(cost);
}

function renderChartContent(
  isLoading: boolean,
  error: string | null,
  isEmpty: boolean,
  chartData: DailyUsage[],
  t: (key: string) => string,
  onRetry: () => void,
) {
  if (isLoading) return <Skeleton className="h-[280px] w-full" />;
  if (error)
    return (
      <div className="flex h-[280px] items-center justify-center">
        <p className="text-muted-foreground">{error}</p>
        <Button variant="outline" className="ml-4" onClick={onRetry}>
          {t("retry")}
        </Button>
      </div>
    );
  if (isEmpty)
    return (
      <div className="flex h-[280px] flex-col items-center justify-center text-center">
        <p className="text-muted-foreground">{t("empty_chart")}</p>
        <p className="text-muted-foreground mt-1 text-sm">{t("empty_hint")}</p>
      </div>
    );
  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-[280px] w-full">
      <LineChart data={chartData} margin={{ left: 0, right: 16, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={40}
          tickFormatter={(value) => formatDate(value)}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          allowDecimals={false}
          tickFormatter={(value) => (value >= 1000 ? `${Math.round(value / 1000)}k` : String(Math.round(value)))}
        />
        <ChartTooltip content={<ChartTooltipContent labelFormatter={(value) => formatDate(value)} />} />
        <Line
          type="monotone"
          dataKey="requestCount"
          stroke="var(--color-requestCount)"
          strokeWidth={2}
          dot={{ r: 3 }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ChartContainer>
  );
}

function renderTableContent(
  isLoading: boolean,
  error: string | null,
  isEmpty: boolean,
  chartData: DailyUsage[],
  data: AnalyticsData | null,
  t: (key: string) => string,
  onRetry: () => void,
) {
  if (isLoading)
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  if (error)
    return (
      <div className="py-12 text-center">
        <p className="text-muted-foreground">{error}</p>
        <Button variant="outline" className="mt-4" onClick={onRetry}>
          {t("retry")}
        </Button>
      </div>
    );
  if (isEmpty)
    return (
      <div className="py-12 text-center">
        <p className="text-muted-foreground">{t("empty_table")}</p>
        <p className="text-muted-foreground mt-1 text-sm">{t("empty_hint")}</p>
      </div>
    );
  return (
    <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[180px]">{t("table.date")}</TableHead>
            <TableHead className="text-right">{t("table.requests")}</TableHead>
            <TableHead className="text-right">{t("table.cost")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {chartData.map((row) => (
            <TableRow key={row.date}>
              <TableCell className="font-medium">{formatDate(row.date)}</TableCell>
              <TableCell className="text-right font-mono tabular-nums">{row.requestCount.toLocaleString()}</TableCell>
              <TableCell className="text-right font-mono tabular-nums">{formatEstimatedCost(row.requestCount)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell className="font-semibold">{t("table.total")}</TableCell>
            <TableCell className="text-right font-mono font-semibold tabular-nums">
              {data!.totalRequests.toLocaleString()}
            </TableCell>
            <TableCell className="text-right font-mono font-semibold tabular-nums">
              {formatEstimatedCost(data!.totalRequests)}
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}

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
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="mb-1 text-2xl font-bold">{t("title")}</h1>
          <p className="text-muted-foreground text-sm">{t("description")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={duration} onValueChange={handleDurationChange}>
            <SelectTrigger className="w-[140px]" aria-label={t("duration_label")}>
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
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isLoading || isRefreshing}>
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
            <span className="ml-2">{t("refresh")}</span>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("chart.title")}</CardTitle>
          <CardDescription>{t("chart.description")}</CardDescription>
        </CardHeader>
        <CardContent>{renderChartContent(isLoading, error, isEmpty, chartData, t, onRetry)}</CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("table.title")}</CardTitle>
          <CardDescription>{t("table.description")}</CardDescription>
        </CardHeader>
        <CardContent>{renderTableContent(isLoading, error, isEmpty, chartData, data, t, onRetry)}</CardContent>
      </Card>
    </div>
  );
}
