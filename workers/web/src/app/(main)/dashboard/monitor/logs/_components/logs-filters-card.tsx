"use client";

import { useCallback, useEffect, useState } from "react";

import { Filter, Search, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

import {
  DateRangeDropdown,
  getDateRangeForPreset,
  type DatePreset,
  type Service,
  ServiceDropdown,
} from "./logs-filters-dropdowns";

interface LogsFiltersCardProps {
  searchEndpoint: string;
  onSearchChange: (v: string) => void;
  serviceIdFilter: string;
  onServiceChange: (v: string) => void;
  dateFrom: string;
  onDateFromChange: (v: string) => void;
  dateTo: string;
  onDateToChange: (v: string) => void;
  onApply: () => void;
  services: Service[];
  t: (key: string) => string;
}

// eslint-disable-next-line complexity -- filter badge visibility depends on multiple conditions
function ActiveFilterBadges({
  searchEndpoint,
  serviceIdFilter,
  dateFrom,
  dateTo,
  services,
  getServiceLabel,
}: {
  searchEndpoint: string;
  serviceIdFilter: string;
  dateFrom: string;
  dateTo: string;
  services: Service[];
  getServiceLabel: (s: Service) => string;
}) {
  const hasSearch = searchEndpoint.trim() !== "";
  const hasService = serviceIdFilter !== "" && serviceIdFilter !== "all";
  const hasDate = dateFrom !== "" || dateTo !== "";
  if (!hasSearch && !hasService && !hasDate) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-muted-foreground text-xs">Active:</span>
      {hasSearch && (
        <Badge variant="secondary" className="font-normal">
          Endpoint: {searchEndpoint}
        </Badge>
      )}
      {hasService && (
        <Badge variant="secondary" className="font-normal">
          Service:{" "}
          {getServiceLabel(
            services.find((s) => String(s.id) === serviceIdFilter) ?? { id: parseInt(serviceIdFilter, 10) },
          )}
        </Badge>
      )}
      {hasDate && (
        <Badge variant="secondary" className="font-normal">
          {dateFrom || "..."} – {dateTo || "..."}
        </Badge>
      )}
    </div>
  );
}

export function LogsFiltersCard({
  searchEndpoint,
  onSearchChange,
  serviceIdFilter,
  onServiceChange,
  dateFrom,
  onDateFromChange,
  dateTo,
  onDateToChange,
  onApply,
  services,
  t,
}: LogsFiltersCardProps) {
  const getServiceLabel = (s: Service) => s.name ?? s.endpoint ?? `Service #${s.id}`;

  const [datePreset, setDatePreset] = useState<DatePreset>("7");

  useEffect(() => {
    if (datePreset !== "custom" && (!dateFrom || !dateTo)) {
      const { from, to } = getDateRangeForPreset(parseInt(datePreset, 10));
      onDateFromChange(from);
      onDateToChange(to);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- init 7-day range once on mount

  const hasActiveFilters =
    searchEndpoint.trim() !== "" ||
    (serviceIdFilter !== "" && serviceIdFilter !== "all") ||
    dateFrom !== "" ||
    dateTo !== "";

  const clearFilters = () => {
    onSearchChange("");
    onServiceChange("all");
    setDatePreset("7");
    const { from, to } = getDateRangeForPreset(7);
    onDateFromChange(from);
    onDateToChange(to);
  };

  const handlePresetChange = useCallback(
    (preset: DatePreset) => {
      setDatePreset(preset);
      if (preset !== "custom") {
        const { from, to } = getDateRangeForPreset(parseInt(preset, 10));
        onDateFromChange(from);
        onDateToChange(to);
      } else if (!dateFrom || !dateTo) {
        const { from, to } = getDateRangeForPreset(7);
        onDateFromChange(from);
        onDateToChange(to);
      }
    },
    [onDateFromChange, onDateToChange, dateFrom, dateTo],
  );

  return (
    <Card className="border-0 shadow-md">
      <CardHeader className="bg-muted/20 border-b pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-primary/10 rounded-lg p-1.5">
              <Filter className="text-primary h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-base">{t("filters.title")}</CardTitle>
              <CardDescription>{t("filters.description")}</CardDescription>
            </div>
          </div>
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="mr-1 h-4 w-4" />
              {t("filters.clear")}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        <div className="flex flex-col gap-4">
          <div className="relative z-10 flex flex-wrap items-end gap-3">
            <div className="relative min-w-[200px] flex-1 sm:max-w-[280px]">
              <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
              <Input
                placeholder={t("filters.search_placeholder")}
                value={searchEndpoint}
                onChange={(e) => onSearchChange(e.target.value)}
                className="pl-9"
              />
            </div>
            <ServiceDropdown
              serviceIdFilter={serviceIdFilter}
              onServiceChange={onServiceChange}
              services={services}
              getServiceLabel={getServiceLabel}
              t={t}
            />
            <DateRangeDropdown preset={datePreset} onPresetChange={handlePresetChange} t={t} />
            {datePreset === "custom" && (
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => onDateFromChange(e.target.value)}
                  className="w-[140px]"
                  aria-label="From date"
                />
                <span className="text-muted-foreground text-sm">–</span>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => onDateToChange(e.target.value)}
                  className="w-[140px]"
                  aria-label="To date"
                />
              </div>
            )}
            <Button onClick={onApply} size="sm" className="shrink-0">
              {t("filters.apply")}
            </Button>
          </div>
          {hasActiveFilters && (
            <ActiveFilterBadges
              searchEndpoint={searchEndpoint}
              serviceIdFilter={serviceIdFilter}
              dateFrom={dateFrom}
              dateTo={dateTo}
              services={services}
              getServiceLabel={getServiceLabel}
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
