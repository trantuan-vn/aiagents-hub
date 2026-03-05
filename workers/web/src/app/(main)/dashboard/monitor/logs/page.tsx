"use client";

import { useCallback, useEffect, useState } from "react";

import { RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

import { LogsFiltersCard } from "./_components/logs-filters-card";
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
}

interface Service {
  id: number;
  name?: string;
  endpoint?: string;
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

  const [searchEndpoint, setSearchEndpoint] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [serviceIdFilter, setServiceIdFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const buildQueryParams = useCallback(() => {
    const params = new URLSearchParams();
    params.set("limit", String(PAGE_SIZE));
    params.set("offset", String(offset));
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
  }, [offset, serviceIdFilter, searchDebounced, dateFrom, dateTo]);

  const fetchLogs = useCallback(async () => {
    try {
      const qs = buildQueryParams();
      const response = await fetch(`${API_BASE_URL}/dashboard/monitor/logs?${qs}`, {
        method: "GET",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText ? errorText : t("fetch_error"));
      }

      const result: { logs?: ServiceUsageLog[]; hasMore?: boolean } = await response.json();
      setLogs(result.logs ?? []);
      setHasMore(result.hasMore ?? false);
      setError(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : t("fetch_error");
      setError(errorMessage);
      setLogs([]);
      toast({
        title: t("error"),
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [buildQueryParams, t, toast]);

  const fetchServices = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/dashboard/admin/service/list`, {
        method: "GET",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });

      if (response.ok) {
        const data: Service[] = await response.json();
        setServices(Array.isArray(data) ? data : []);
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

  const handleApplyFilters = () => setOffset(0);

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
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="mb-1 text-2xl font-bold">{t("title")}</h1>
          <p className="text-muted-foreground text-sm">{t("description")}</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isLoading || isRefreshing}>
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
          <span className="ml-2">{t("refresh")}</span>
        </Button>
      </div>

      <LogsStatsCards logsCount={logs.length} servicesCount={services.length} t={t} />

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
