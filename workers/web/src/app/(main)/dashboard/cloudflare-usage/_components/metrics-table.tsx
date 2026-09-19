"use client";

import { useMemo, useState } from "react";

import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { formatCompact, formatMoney, formatWhen } from "./format";
import type { MetricStatus, OverviewDto, UsageMetricRow } from "./types";

const STATUS_KEYS: Record<
  MetricStatus,
  | "status_under"
  | "status_watch"
  | "status_projected_over"
  | "status_over"
  | "status_hard_stop_today"
  | "status_unavailable"
> = {
  under: "status_under",
  watch: "status_watch",
  projected_over: "status_projected_over",
  over: "status_over",
  hard_stop_today: "status_hard_stop_today",
  unavailable: "status_unavailable",
};

function statusVariant(status: MetricStatus): "default" | "secondary" | "destructive" | "outline" {
  if (status === "over" || status === "hard_stop_today") return "destructive";
  if (status === "projected_over" || status === "watch") return "outline";
  return "secondary";
}

export function MetricsTable({ data }: { data: OverviewDto }) {
  const t = useTranslations("CloudflareUsageAdmin");
  const [family, setFamily] = useState<string>("all");
  const rows = useMemo(() => {
    return family === "all" ? data.metrics : data.metrics.filter((m) => m.family === family);
  }, [data.metrics, family]);
  const families = useMemo(() => Array.from(new Set(data.metrics.map((m) => m.family))), [data.metrics]);

  return (
    <Card>
      <CardHeader className="gap-3">
        <div>
          <CardTitle>{t("metrics")}</CardTitle>
          <CardDescription>{t("metrics_desc")}</CardDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="text-sm underline-offset-4 hover:underline"
            onClick={() => setFamily("all")}
          >
            {t("family_all")}
          </button>
          {families.map((f) => (
            <button
              key={f}
              type="button"
              className="text-muted-foreground text-sm underline-offset-4 hover:underline"
              onClick={() => setFamily(f)}
            >
              {f}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("col_resource")}</TableHead>
              <TableHead>{t("col_included")}</TableHead>
              <TableHead>{t("col_usage")}</TableHead>
              <TableHead className="text-right">{t("col_pct")}</TableHead>
              <TableHead className="text-right">{t("col_eom")}</TableHead>
              <TableHead>{t("col_exhaust")}</TableHead>
              <TableHead className="text-right">{t("overage_now")}</TableHead>
              <TableHead className="text-right">{t("projected_eom")}</TableHead>
              <TableHead>{t("col_source")}</TableHead>
              <TableHead>{t("col_status")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-muted-foreground">
                  {t("no_data")}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => <MetricRow key={row.metricId} row={row} />)
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function MetricRow({ row }: { row: UsageMetricRow }) {
  const t = useTranslations("CloudflareUsageAdmin");
  const pct = row.pctOfIncluded ?? 0;
  return (
    <TableRow>
      <TableCell className="font-medium">
        <div>{row.label}</div>
        <div className="text-muted-foreground text-xs">{row.metricId}</div>
      </TableCell>
      <TableCell className="whitespace-nowrap">
        {formatCompact(row.included)} / {row.includedPeriod}
      </TableCell>
      <TableCell className="min-w-[140px]">
        <div className="mb-1 text-sm">
          {formatCompact(row.usageMtd)} {row.unit}
        </div>
        <Progress value={Math.min(100, pct)} />
      </TableCell>
      <TableCell className="text-right">{row.pctOfIncluded == null ? "—" : `${row.pctOfIncluded.toFixed(1)}%`}</TableCell>
      <TableCell className="text-right">{formatCompact(row.projectedEom)}</TableCell>
      <TableCell className="whitespace-nowrap text-sm">{row.exhaustAt ? formatWhen(row.exhaustAt) : t("no_exhaust_this_period")}</TableCell>
      <TableCell className="text-right">{formatMoney(row.overageUsdNow)}</TableCell>
      <TableCell className="text-right">{formatMoney(row.overageUsdProjected)}</TableCell>
      <TableCell>
        <Badge variant="outline">{row.costSource === "invoice" ? t("cost_invoice") : t("cost_estimate")}</Badge>
      </TableCell>
      <TableCell>
        <Badge variant={statusVariant(row.status)}>{t(STATUS_KEYS[row.status])}</Badge>
      </TableCell>
    </TableRow>
  );
}
