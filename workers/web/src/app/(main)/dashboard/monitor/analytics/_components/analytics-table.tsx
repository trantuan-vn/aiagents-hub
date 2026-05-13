"use client";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { formatDate, formatUsageCost, type AnalyticsData, type DailyUsage } from "./utils";

interface AnalyticsTableProps {
  isLoading: boolean;
  error: string | null;
  isEmpty: boolean;
  chartData: DailyUsage[];
  data: AnalyticsData | null;
  t: (k: string) => string;
  onRetry: () => void;
}

export function AnalyticsTable({ isLoading, error, isEmpty, chartData, data, t, onRetry }: AnalyticsTableProps) {
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

  const totalSuccess = chartData.reduce((s, d) => s + d.successCount, 0);
  const totalErrors = chartData.reduce((s, d) => s + d.errorCount, 0);

  return (
    <div className="overflow-hidden rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-[180px] font-semibold">{t("table.date")}</TableHead>
            <TableHead className="text-right font-semibold">{t("table.total_requests")}</TableHead>
            <TableHead className="text-right font-semibold">{t("table.success_requests")}</TableHead>
            <TableHead className="text-right font-semibold">{t("table.error_requests")}</TableHead>
            <TableHead className="text-right font-semibold">{t("table.cost")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {chartData.map((row) => (
            <TableRow key={row.date} className="hover:bg-muted/50 transition-colors">
              <TableCell className="font-medium">{formatDate(row.date)}</TableCell>
              <TableCell className="text-right font-mono tabular-nums">{row.requestCount.toLocaleString()}</TableCell>
              <TableCell className="text-right font-mono text-emerald-600 tabular-nums dark:text-emerald-400">
                {row.successCount.toLocaleString()}
              </TableCell>
              <TableCell className="text-right font-mono text-rose-600 tabular-nums dark:text-rose-400">
                {row.errorCount.toLocaleString()}
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums">
                {formatUsageCost(row.cost)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow className="border-t-2 font-semibold">
            <TableCell>{t("table.total")}</TableCell>
            <TableCell className="text-right font-mono tabular-nums">{data!.totalRequests.toLocaleString()}</TableCell>
            <TableCell className="text-right font-mono text-emerald-600 tabular-nums dark:text-emerald-400">
              {totalSuccess.toLocaleString()}
            </TableCell>
            <TableCell className="text-right font-mono text-rose-600 tabular-nums dark:text-rose-400">
              {totalErrors.toLocaleString()}
            </TableCell>
            <TableCell className="text-right font-mono tabular-nums">
              {formatUsageCost(data!.totalCost)}
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}
