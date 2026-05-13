"use client";

import { useMemo } from "react";

import { Activity, BarChart3, CheckCircle2, TrendingUp, Zap } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { formatDate, formatUsageCost, getQualityLevel, type AnalyticsData } from "./utils";

type StatRow = {
  totalRequests: number;
  totalSuccess: number;
  totalErrors: number;
  successRate: number;
  errorRate: number;
  peakDay: { date: string; count: number } | null;
  trend: number;
};

function computeStats(data: AnalyticsData): StatRow {
  const totalSuccess = data.daily.reduce((s, d) => s + d.successCount, 0);
  const totalErrors = data.daily.reduce((s, d) => s + d.errorCount, 0);
  const successRate = data.totalRequests > 0 ? (totalSuccess / data.totalRequests) * 100 : 100;
  const peakDay = data.daily.reduce(
    (max, d) => (d.requestCount > max.count ? { date: d.date, count: d.requestCount } : max),
    { date: "", count: 0 },
  );
  const half = Math.floor(data.daily.length / 2);
  const firstHalf = data.daily.slice(0, half).reduce((s, d) => s + d.requestCount, 0);
  const secondHalf = data.daily.slice(half).reduce((s, d) => s + d.requestCount, 0);
  const trend = firstHalf > 0 ? ((secondHalf - firstHalf) / firstHalf) * 100 : secondHalf > 0 ? 100 : 0;
  return {
    totalRequests: data.totalRequests,
    totalSuccess,
    totalErrors,
    successRate,
    errorRate: data.totalRequests > 0 ? (totalErrors / data.totalRequests) * 100 : 0,
    peakDay: peakDay.date ? { date: peakDay.date, count: peakDay.count } : null,
    trend,
  };
}

function buildCards(
  stats: StatRow,
  quality: { label: string; badgeClass: string } | null,
  t: (k: string) => string,
  totalCost: number,
) {
  return [
    {
      key: "total_requests",
      title: t("stats.total_requests"),
      value: stats.totalRequests.toLocaleString(),
      sub: t("stats.in_period"),
      icon: Activity,
      iconBg: "bg-blue-500/15",
      iconColor: "text-blue-600 dark:text-blue-400",
      gradient: "from-blue-500/5 to-indigo-500/5",
      showProgress: false,
    },
    {
      key: "success_rate",
      title: t("stats.success_rate"),
      value: `${stats.successRate.toFixed(1)}%`,
      sub: quality?.label ?? "",
      icon: CheckCircle2,
      iconBg: "bg-emerald-500/15",
      iconColor: "text-emerald-600 dark:text-emerald-400",
      gradient: "from-emerald-500/5 to-teal-500/5",
      showProgress: true,
    },
    {
      key: "errors",
      title: t("stats.errors"),
      value: stats.totalErrors.toLocaleString(),
      sub: stats.errorRate > 0 ? `${stats.errorRate.toFixed(1)}% ${t("stats.of_total")}` : t("stats.no_errors"),
      icon: Zap,
      iconBg: "bg-amber-500/15",
      iconColor: "text-amber-600 dark:text-amber-400",
      gradient: "from-amber-500/5 to-orange-500/5",
      showProgress: false,
    },
    {
      key: "peak",
      title: t("stats.peak_day"),
      value: stats.peakDay ? stats.peakDay.count.toLocaleString() : "—",
      sub: stats.peakDay ? formatDate(stats.peakDay.date) : t("stats.no_data"),
      icon: TrendingUp,
      iconBg: "bg-violet-500/15",
      iconColor: "text-violet-600 dark:text-violet-400",
      gradient: "from-violet-500/5 to-purple-500/5",
      showProgress: false,
    },
    {
      key: "cost",
      title: t("stats.estimated_cost"),
      value: formatUsageCost(totalCost),
      sub: t("stats.unit_per_request"),
      icon: BarChart3,
      iconBg: "bg-cyan-500/15",
      iconColor: "text-cyan-600 dark:text-cyan-400",
      gradient: "from-cyan-500/5 to-sky-500/5",
      showProgress: false,
    },
  ];
}

interface AnalyticsOverviewCardsProps {
  data: AnalyticsData | null;
  t: (k: string) => string;
  isLoading: boolean;
}

export function AnalyticsOverviewCards({ data, t, isLoading }: AnalyticsOverviewCardsProps) {
  const stats = useMemo(() => (data ? computeStats(data) : null), [data]);
  const quality = stats ? getQualityLevel(stats.successRate, t) : null;

  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-[120px] w-full rounded-xl" />
        ))}
      </div>
    );
  }
  if (!stats || !data || data.daily.length === 0) return null;

  const cards = buildCards(stats, quality, t, data.totalCost);

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <Card
            key={card.key}
            className={cn(
              "relative overflow-hidden border-0 shadow-lg transition-all duration-200 hover:shadow-xl",
              `bg-gradient-to-br ${card.gradient}`,
            )}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
              <div className={cn("rounded-xl p-2", card.iconBg)}>
                <Icon className={cn("size-5", card.iconColor)} />
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold tracking-tight tabular-nums">{card.value}</p>
              <p className="text-muted-foreground mt-1 text-xs">{card.sub}</p>
              {card.showProgress && quality && (
                <div className="mt-3 space-y-1.5">
                  <Progress value={stats.successRate} className="h-2" />
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
                      quality.badgeClass,
                    )}
                  >
                    {quality.label}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
