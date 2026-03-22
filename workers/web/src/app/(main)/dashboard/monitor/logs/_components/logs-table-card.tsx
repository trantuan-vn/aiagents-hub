"use client";

import { Fragment, useState } from "react";

import { ChevronDown, ChevronLeft, ChevronRight, FileText, Globe, Monitor } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

interface ServiceUsageLog {
  id?: number;
  serviceId: number;
  endpoint: string;
  userAgent?: string;
  ipAddress?: string;
  created_at?: number;
  createdAt?: number;
  isError?: boolean | number;
}

interface Service {
  id: number;
  name?: string;
  endpoint?: string;
}

interface LogsTableCardProps {
  isLoading: boolean;
  error: string | null;
  logs: ServiceUsageLog[];
  offset: number;
  hasMore: boolean;
  pageSize: number;
  onRetry: () => void;
  onPrevPage: () => void;
  onNextPage: () => void;
  services: Service[];
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
    second: "2-digit",
  });
}

function formatRelativeTime(ts?: number): string {
  if (!ts) return "—";
  const d = new Date(typeof ts === "number" && ts < 1e12 ? ts * 1000 : ts);
  const now = Date.now();
  const diff = now - d.getTime();
  if (diff < 60000) return "Just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)} min ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} hrs ago`;
  return formatTimestamp(ts);
}

// eslint-disable-next-line complexity -- UI has many conditional branches for status/expand states
function LogTableRow({
  log,
  services,
  t,
  expandedId,
  onToggleExpand,
}: {
  log: ServiceUsageLog;
  services: Service[];
  t: LogsTableCardProps["t"];
  expandedId: string | number | null;
  onToggleExpand: (key: string | number | null) => void;
}) {
  const getServiceName = (sid: number) => {
    const s = services.find((x) => x.id === sid);
    return s?.name ?? s?.endpoint ?? `#${sid}`;
  };
  const displayValue = (v: string | undefined) => (v && v.length > 0 ? v : "—");
  const getIsError = (l: ServiceUsageLog) => l.isError === true || l.isError === 1;
  const getLogKey = (l: ServiceUsageLog) => l.id ?? `${l.serviceId}-${l.endpoint}-${l.created_at ?? ""}`;

  const isError = getIsError(log);
  const logKey = getLogKey(log);
  const hasDetails = (log.ipAddress?.length ?? 0) > 0 || (log.userAgent?.length ?? 0) > 0;
  const isExpanded = expandedId === logKey;

  return (
    <Fragment key={logKey}>
      <TableRow
        className={cn(
          "border-b transition-colors",
          isError
            ? "bg-rose-50/30 hover:bg-rose-50/50 dark:bg-rose-950/10 dark:hover:bg-rose-950/20"
            : "hover:bg-muted/30",
        )}
      >
        <TableCell className="align-top font-mono text-xs">
          <span title={formatTimestamp(log.created_at ?? log.createdAt)}>
            {formatRelativeTime(log.created_at ?? log.createdAt)}
          </span>
        </TableCell>
        <TableCell>
          <Badge
            variant="secondary"
            className={cn(
              "font-normal",
              isError
                ? "border-rose-200 bg-rose-100 text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300"
                : "",
            )}
          >
            {getServiceName(log.serviceId)}
          </Badge>
        </TableCell>
        <TableCell className="max-w-[280px] truncate font-mono text-xs" title={log.endpoint}>
          {displayValue(log.endpoint)}
        </TableCell>
        <TableCell>
          <Badge
            variant={isError ? "destructive" : "secondary"}
            className={cn(
              "text-xs font-normal",
              !isError &&
                "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-400",
            )}
          >
            {isError ? t("table.status_error") : t("table.status_success")}
          </Badge>
        </TableCell>
        <TableCell className="w-[40px] p-2">
          {hasDetails && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => onToggleExpand(isExpanded ? null : logKey)}
            >
              <ChevronDown className={cn("h-4 w-4 transition-transform", isExpanded && "rotate-180")} />
            </Button>
          )}
        </TableCell>
      </TableRow>
      {hasDetails && isExpanded && (
        <TableRow className="bg-muted/20 hover:bg-muted/20 border-b">
          <TableCell colSpan={5} className="p-0">
            <div className="flex flex-wrap gap-6 px-4 py-3">
              {log.ipAddress && (
                <div className="flex items-center gap-2">
                  <Globe className="text-muted-foreground h-4 w-4" />
                  <span className="text-muted-foreground text-xs">IP:</span>
                  <code className="bg-muted rounded px-1.5 py-0.5 font-mono text-xs">{log.ipAddress}</code>
                </div>
              )}
              {log.userAgent && (
                <div className="flex items-start gap-2">
                  <Monitor className="text-muted-foreground mt-0.5 h-4 w-4 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <span className="text-muted-foreground text-xs">User Agent:</span>
                    <p className="max-w-md truncate font-mono text-xs" title={log.userAgent}>
                      {log.userAgent}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </TableCell>
        </TableRow>
      )}
    </Fragment>
  );
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
  services,
  t,
}: LogsTableCardProps) {
  const [expandedId, setExpandedId] = useState<string | number | null>(null);
  const handleToggleExpand = (key: string | number | null) => setExpandedId(key);

  if (isLoading) {
    return (
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>{t("table.title")}</CardTitle>
          <CardDescription>{t("table.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {SKELETON_KEYS.map((key) => (
              <Skeleton key={key} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle>{t("table.title")}</CardTitle>
        <CardDescription>{t("table.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        {error ? (
          <div className="rounded-xl border border-dashed border-rose-200 bg-rose-50/50 py-12 text-center dark:border-rose-900/50 dark:bg-rose-950/20">
            <p className="text-rose-700 dark:text-rose-400">{error}</p>
            <Button variant="outline" className="mt-4" onClick={onRetry}>
              {t("retry")}
            </Button>
          </div>
        ) : logs.length === 0 ? (
          <div className="rounded-xl border border-dashed py-16 text-center">
            <div className="bg-muted mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full">
              <FileText className="text-muted-foreground h-8 w-8" />
            </div>
            <p className="font-medium">{t("empty")}</p>
            <p className="text-muted-foreground mt-1 text-sm">{t("empty_hint")}</p>
          </div>
        ) : (
          <>
            <div className="overflow-hidden rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 hover:bg-muted/30 border-b">
                    <TableHead className="w-[140px]">{t("table.time")}</TableHead>
                    <TableHead className="w-[120px]">{t("table.service")}</TableHead>
                    <TableHead>{t("table.endpoint")}</TableHead>
                    <TableHead className="w-[90px]">{t("table.status")}</TableHead>
                    <TableHead className="w-[40px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <LogTableRow
                      key={log.id ?? `${log.serviceId}-${log.endpoint}-${log.created_at ?? ""}`}
                      log={log}
                      services={services}
                      t={t}
                      expandedId={expandedId}
                      onToggleExpand={handleToggleExpand}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="mt-4 flex flex-col items-center justify-between gap-3 sm:flex-row">
              <p className="text-muted-foreground text-sm">
                {t("pagination.showing", {
                  from: offset + 1,
                  to: Math.min(offset + pageSize, offset + logs.length),
                })}
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={onPrevPage} disabled={offset === 0 || isLoading}>
                  <ChevronLeft className="h-4 w-4" />
                  {t("pagination.prev")}
                </Button>
                <Button variant="outline" size="sm" onClick={onNextPage} disabled={!hasMore || isLoading}>
                  {t("pagination.next")}
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
