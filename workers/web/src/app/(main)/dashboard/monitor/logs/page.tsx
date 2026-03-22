"use client";

import { useCallback, useEffect, useState } from "react";

import { RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

import { LogsFiltersCard } from "./_components/logs-filters-card";
import { LogsOverviewChart } from "./_components/logs-overview-chart";
import { LogsStatsCards } from "./_components/logs-stats-cards";
import { LogsTableCard } from "./_components/logs-table-card";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.unitoken.trade";
const PAGE_SIZE = 25;

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

interface ErrorRateStats {
  total: number;
  errors: number;
  errorRatePercent: number;
}

interface Service {
  id: number;
  name?: string;
  endpoint?: string;
}

function parseServicesResponse(raw: unknown): Array<Service | Record<string, unknown>> {
  if (Array.isArray(raw)) return raw;
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  if (obj?.data != null && Array.isArray(obj.data)) return obj.data;
  if (obj?.services != null && Array.isArray(obj.services)) return obj.services;
  return [];
}

export default function MonitorLogsPage() {
  const t = useTranslations("MonitorLogsPage");
  const { toast } = useToast();
  const [logs, setLogs] = useState<ServiceUsageLog[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);

  const [errorRate, setErrorRate] = useState<ErrorRateStats | null>(null);
  const [searchEndpoint, setSearchEndpoint] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [serviceIdFilter, setServiceIdFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState(() => {
    const from = new Date();
    from.setDate(from.getDate() - 7);
    return from.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));

  const buildLogsQueryParams = useCallback(
    (overrideOffset?: number) => {
      const params = new URLSearchParams();
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(overrideOffset ?? offset));
      if (serviceIdFilter && serviceIdFilter !== "all") {
        params.set("serviceId", serviceIdFilter);
      }
      if (searchDebounced.trim()) {
        params.set("endpoint", searchDebounced.trim());
      }
      if (dateFrom) {
        params.set("dateFrom", String(new Date(dateFrom).getTime()));
      }
      if (dateTo) {
        const endOfDay = new Date(dateTo);
        endOfDay.setHours(23, 59, 59, 999);
        params.set("dateTo", String(endOfDay.getTime()));
      }
      return params.toString();
    },
    [offset, serviceIdFilter, searchDebounced, dateFrom, dateTo],
  );

  const fetchLogs = useCallback(
    async (overrideOffset?: number) => {
      try {
        const qs = buildLogsQueryParams(overrideOffset);
        const response = await fetch(`${API_BASE_URL}/dashboard/monitor/logs?${qs}`, {
          method: "GET",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(errorText ? errorText : t("fetch_error"));
        }

        const result: {
          logs?: ServiceUsageLog[];
          hasMore?: boolean;
          errorRate?: ErrorRateStats;
        } = await response.json();
        setLogs(result.logs ?? []);
        setHasMore(result.hasMore ?? false);
        setErrorRate(result.errorRate ?? null);
        setError(null);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : t("fetch_error");
        setError(errorMessage);
        setLogs([]);
        setErrorRate(null);
        toast({
          title: t("error"),
          description: errorMessage,
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [buildLogsQueryParams, t, toast],
  );

  const fetchServices = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/dashboard/admin/service/list`, {
        method: "GET",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });

      if (response.ok) {
        const raw: unknown = await response.json();
        const data = parseServicesResponse(raw);
        setServices(data.filter((s): s is Service => "id" in s && typeof (s as { id: unknown }).id === "number"));
      }
    } catch {
      setServices([]);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchDebounced(searchEndpoint);
      setOffset(0);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchEndpoint]);

  useEffect(() => {
    void fetchServices();
  }, [fetchServices]);

  useEffect(() => {
    setIsLoading(true);
    void fetchLogs();
  }, [fetchLogs]);

  const handleApplyFilters = () => {
    setOffset(0);
    setIsLoading(true);
    void fetchLogs(0);
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    void fetchLogs();
  };

  const handlePrevPage = () => {
    const newOffset = Math.max(0, offset - PAGE_SIZE);
    setOffset(newOffset);
  };

  const handleNextPage = () => {
    if (hasMore) setOffset(offset + PAGE_SIZE);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{t("title")}</h1>
          <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed">{t("description")}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isLoading || isRefreshing}
          className="shrink-0"
        >
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
          <span className="ml-2">{t("refresh")}</span>
        </Button>
      </div>

      <LogsStatsCards logsCount={logs.length} servicesCount={services.length} errorRate={errorRate} />

      <LogsFiltersCard
        searchEndpoint={searchEndpoint}
        onSearchChange={setSearchEndpoint}
        serviceIdFilter={serviceIdFilter}
        onServiceChange={setServiceIdFilter}
        dateFrom={dateFrom}
        onDateFromChange={setDateFrom}
        dateTo={dateTo}
        onDateToChange={setDateTo}
        onApply={handleApplyFilters}
        services={services}
        t={t}
      />

      <LogsOverviewChart logs={logs} t={t} />

      <LogsTableCard
        isLoading={isLoading}
        error={error}
        logs={logs}
        offset={offset}
        hasMore={hasMore}
        pageSize={PAGE_SIZE}
        onRetry={() => void fetchLogs()}
        onPrevPage={handlePrevPage}
        onNextPage={handleNextPage}
        services={services}
        t={t}
      />
    </div>
  );
}
