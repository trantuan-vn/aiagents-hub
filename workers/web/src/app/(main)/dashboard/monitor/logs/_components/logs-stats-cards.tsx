"use client";

import { Activity, FileText, Server } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface LogsStatsCardsProps {
  logsCount: number;
  servicesCount: number;
  t: (key: string) => string;
}

export function LogsStatsCards({ logsCount, servicesCount, t }: LogsStatsCardsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{t("stats.total_logs")}</CardTitle>
          <FileText className="text-muted-foreground h-4 w-4" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{logsCount}</div>
          <p className="text-muted-foreground text-xs">{t("stats.on_this_page")}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{t("stats.services")}</CardTitle>
          <Server className="text-muted-foreground h-4 w-4" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{servicesCount}</div>
          <p className="text-muted-foreground text-xs">{t("stats.active_services")}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{t("stats.status")}</CardTitle>
          <Activity className="text-muted-foreground h-4 w-4" />
        </CardHeader>
        <CardContent>
          <Badge variant="default" className="text-xs">
            {t("stats.live")}
          </Badge>
          <p className="text-muted-foreground mt-1 text-xs">{t("stats.realtime")}</p>
        </CardContent>
      </Card>
    </div>
  );
}
