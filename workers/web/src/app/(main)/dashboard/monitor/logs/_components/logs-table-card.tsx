"use client";

import { ChevronLeft, ChevronRight, FileText } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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
  const getServiceName = (sid: number) => {
    const s = services.find((x) => x.id === sid);
    return s?.name ?? s?.endpoint ?? `#${sid}`;
  };

  const displayValue = (v: string | undefined) => (v && v.length > 0 ? v : "—");
  const getIsError = (log: ServiceUsageLog) => log.isError === true || log.isError === 1;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("table.title")}</CardTitle>
          <CardDescription>{t("table.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {SKELETON_KEYS.map((key) => (
              <Skeleton key={key} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("table.title")}</CardTitle>
        <CardDescription>{t("table.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        {error ? (
          <div className="py-12 text-center">
            <p className="text-muted-foreground">{error}</p>
            <Button variant="outline" className="mt-4" onClick={onRetry}>
              {t("retry")}
            </Button>
          </div>
        ) : logs.length === 0 ? (
          <div className="py-12 text-center">
            <FileText className="text-muted-foreground mx-auto mb-4 h-12 w-12" />
            <p className="text-muted-foreground">{t("empty")}</p>
            <p className="text-muted-foreground mt-1 text-sm">{t("empty_hint")}</p>
          </div>
        ) : (
          <>
            <div className="overflow-hidden rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[160px]">{t("table.time")}</TableHead>
                    <TableHead>{t("table.service")}</TableHead>
                    <TableHead>{t("table.endpoint")}</TableHead>
                    <TableHead className="w-[100px]">{t("table.status")}</TableHead>
                    <TableHead className="hidden md:table-cell">{t("table.ip")}</TableHead>
                    <TableHead className="hidden max-w-[200px] truncate lg:table-cell">
                      {t("table.user_agent")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id ?? `${log.serviceId}-${log.endpoint}-${log.created_at ?? ""}`}>
                      <TableCell className="font-mono text-xs">
                        {formatTimestamp(log.created_at ?? log.createdAt)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="font-normal">
                          {getServiceName(log.serviceId)}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[280px] truncate font-mono text-xs" title={log.endpoint}>
                        {displayValue(log.endpoint)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={getIsError(log) ? "destructive" : "secondary"} className="text-xs font-normal">
                          {getIsError(log) ? t("table.status_error") : t("table.status_success")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground hidden font-mono text-xs md:table-cell">
                        {displayValue(log.ipAddress)}
                      </TableCell>
                      <TableCell
                        className="text-muted-foreground hidden max-w-[200px] truncate text-xs lg:table-cell"
                        title={log.userAgent ?? ""}
                      >
                        {displayValue(log.userAgent)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="mt-4 flex items-center justify-between">
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
