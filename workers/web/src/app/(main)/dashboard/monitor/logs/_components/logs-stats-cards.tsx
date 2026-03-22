"use client";

import { AlertCircle, FileText, Server } from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface ErrorRateStats {
  total: number;
  errors: number;
  errorRatePercent: number;
}

interface LogsStatsCardsProps {
  logsCount: number;
  servicesCount: number;
  errorRate: ErrorRateStats | null;
}

function getQualityLevel(
  errorRatePercent: number,
  t: (k: string) => string,
): {
  label: string;
  color: string;
  bgClass: string;
} {
  if (errorRatePercent <= 1)
    return {
      label: t("stats.quality_excellent"),
      color: "text-emerald-600",
      bgClass: "from-emerald-500/10 to-emerald-600/5",
    };
  if (errorRatePercent <= 5)
    return { label: t("stats.quality_good"), color: "text-amber-600", bgClass: "from-amber-500/10 to-amber-600/5" };
  return { label: t("stats.quality_attention"), color: "text-rose-600", bgClass: "from-rose-500/10 to-rose-600/5" };
}

export function LogsStatsCards({ logsCount, servicesCount, errorRate }: LogsStatsCardsProps) {
  const t = useTranslations("MonitorLogsPage");
  const successRate = errorRate ? 100 - errorRate.errorRatePercent : 100;
  const quality = errorRate ? getQualityLevel(errorRate.errorRatePercent, t) : getQualityLevel(0, t);

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card className="overflow-hidden border-0 shadow-lg transition-all hover:shadow-xl">
        <div className="absolute inset-0 h-full w-full bg-gradient-to-br from-blue-500/5 via-transparent to-indigo-500/5" />
        <CardHeader className="relative flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{t("stats.total_logs")}</CardTitle>
          <div className="rounded-lg bg-blue-500/10 p-2">
            <FileText className="h-5 w-5 text-blue-500" />
          </div>
        </CardHeader>
        <CardContent className="relative">
          <div className="text-3xl font-bold tracking-tight">{logsCount.toLocaleString()}</div>
          <p className="text-muted-foreground mt-1 text-xs">{t("stats.on_this_page")}</p>
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-0 shadow-lg transition-all hover:shadow-xl">
        <div className="absolute inset-0 h-full w-full bg-gradient-to-br from-violet-500/5 via-transparent to-purple-500/5" />
        <CardHeader className="relative flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{t("stats.services")}</CardTitle>
          <div className="rounded-lg bg-violet-500/10 p-2">
            <Server className="h-5 w-5 text-violet-500" />
          </div>
        </CardHeader>
        <CardContent className="relative">
          <div className="text-3xl font-bold tracking-tight">{servicesCount.toLocaleString()}</div>
          <p className="text-muted-foreground mt-1 text-xs">{t("stats.active_services")}</p>
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-0 shadow-lg transition-all hover:shadow-xl">
        <div className="absolute inset-0 h-full w-full bg-gradient-to-br from-emerald-500/5 via-transparent to-teal-500/5" />
        <CardHeader className="relative flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{t("stats.status")}</CardTitle>
          <div className="flex items-center gap-1.5">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
            </span>
            <Badge variant="default" className="bg-emerald-600 text-xs font-medium hover:bg-emerald-600">
              {t("stats.live")}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="relative">
          <p className="text-muted-foreground text-xs">{t("stats.realtime")}</p>
          <p className="mt-1 text-sm font-medium text-emerald-600">{t("stats.all_systems_ok")}</p>
        </CardContent>
      </Card>

      <Card
        className={cn(
          "overflow-hidden border-0 shadow-lg transition-all hover:shadow-xl",
          `bg-gradient-to-br ${quality.bgClass}`,
        )}
      >
        <CardHeader className="relative flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{t("stats.error_rate")}</CardTitle>
          <div className="rounded-lg bg-rose-500/10 p-2">
            <AlertCircle className="h-5 w-5 text-rose-500" />
          </div>
        </CardHeader>
        <CardContent className="relative">
          <div className="flex items-baseline gap-2">
            <span className={cn("text-3xl font-bold tracking-tight", quality.color)}>
              {errorRate ? `${errorRate.errorRatePercent}%` : "0%"}
            </span>
            {errorRate && (
              <span className="text-muted-foreground text-sm">
                ({errorRate.errors}/{errorRate.total})
              </span>
            )}
          </div>
          {errorRate && (
            <div className="mt-2 space-y-1.5">
              <Progress value={successRate} className="h-2" />
              <div className="flex items-center justify-between">
                <span className={cn("text-xs font-medium", quality.color)}>{quality.label}</span>
                <span className="text-muted-foreground text-xs">
                  {successRate.toFixed(1)}% {t("stats.success_rate")}
                </span>
              </div>
            </div>
          )}
          {!errorRate && <p className="text-muted-foreground mt-1 text-xs">{t("stats.error_rate_na")}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
