"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn, formatCredits } from "@/lib/utils";

export interface ExecutionLog {
  id?: number;
  executionKey: string;
  workflowId: number;
  workflowName?: string;
  status: string;
  totalCreditsCharged?: number;
  totalCostVnd?: number;
  stepCount?: number;
  startedAt?: number;
  finishedAt?: number;
  error?: string;
}

interface LogsTableCardProps {
  isLoading: boolean;
  error: string | null;
  logs: ExecutionLog[];
  offset: number;
  hasMore: boolean;
  pageSize: number;
  onRetry: () => void;
  onPrevPage: () => void;
  onNextPage: () => void;
  t: (key: string, values?: Record<string, string | number>) => string;
}

const SKELETON_KEYS = ["sk-1", "sk-2", "sk-3", "sk-4", "sk-5"];

function formatTimestamp(ts?: number): string {
  if (!ts) return "—";
  const d = new Date(typeof ts === "number" && ts < 1e12 ? ts * 1000 : ts);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "failed") return "destructive";
  if (status === "completed") return "secondary";
  return "outline";
}

export function LogsTableCard({
  isLoading,
  error,
  logs,
  offset,
  hasMore,
  pageSize,
  onRetry,
  onPrevPage,
  onNextPage,
  t,
}: LogsTableCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div>
          <CardTitle>{t("table.title")}</CardTitle>
          <CardDescription>{t("table.description")}</CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={offset <= 0 || isLoading} onClick={onPrevPage}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-muted-foreground text-xs tabular-nums">
            {offset + 1}–{offset + logs.length}
          </span>
          <Button variant="outline" size="sm" disabled={!hasMore || isLoading} onClick={onNextPage}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {SKELETON_KEYS.map((k) => (
              <Skeleton key={k} className="h-10 w-full" />
            ))}
          </div>
        ) : error ? (
          <div className="py-8 text-center">
            <p className="text-muted-foreground">{error}</p>
            <Button variant="outline" className="mt-3" onClick={onRetry}>
              {t("retry")}
            </Button>
          </div>
        ) : logs.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-muted-foreground">{t("empty")}</p>
            <p className="text-muted-foreground mt-1 text-sm">{t("empty_hint")}</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("table.started")}</TableHead>
                  <TableHead>{t("table.workflow")}</TableHead>
                  <TableHead>{t("table.status")}</TableHead>
                  <TableHead className="text-right">{t("table.credits")}</TableHead>
                  <TableHead className="text-right">{t("table.steps")}</TableHead>
                  <TableHead>{t("table.execution_key")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => {
                  const credits = Number(log.totalCreditsCharged ?? log.totalCostVnd ?? 0) || 0;
                  const failed = log.status === "failed";
                  return (
                    <TableRow
                      key={log.executionKey}
                      className={cn(failed && "bg-rose-50/40 dark:bg-rose-950/10")}
                    >
                      <TableCell className="whitespace-nowrap text-xs">{formatTimestamp(log.startedAt)}</TableCell>
                      <TableCell>
                        <div className="font-medium">{log.workflowName || `#${log.workflowId}`}</div>
                        <div className="text-muted-foreground text-xs">ID {log.workflowId}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(log.status)} className="font-normal capitalize">
                          {log.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm tabular-nums">
                        {formatCredits(credits)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{log.stepCount ?? 0}</TableCell>
                      <TableCell className="max-w-[140px] truncate font-mono text-xs" title={log.executionKey}>
                        {log.executionKey}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <p className="text-muted-foreground px-3 py-2 text-xs">
              {t("table.page_size", { size: pageSize })}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
