"use client";

import { Search, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import type { Service } from "./schema";
import { countServicesByStatus, type ServiceStatusFilter } from "./service-filter";

interface ServiceListToolbarProps {
  services: Service[];
  query: string;
  onQueryChange: (value: string) => void;
  statusFilter: ServiceStatusFilter;
  onStatusFilterChange: (value: ServiceStatusFilter) => void;
  filteredCount: number;
}

const STATUS_FILTERS: ServiceStatusFilter[] = ["all", "active", "pending", "inactive"];

export function ServiceListToolbar({
  services,
  query,
  onQueryChange,
  statusFilter,
  onStatusFilterChange,
  filteredCount,
}: ServiceListToolbarProps) {
  const t = useTranslations("ServicePage");
  const counts = countServicesByStatus(services);
  const hasQuery = query.trim().length > 0;

  return (
    <div className="bg-card space-y-3 rounded-xl border p-4 shadow-sm">
      <div className="relative">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
        <Input
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={t("search_placeholder")}
          className="h-11 rounded-lg border-0 bg-muted/50 pr-10 pl-10 text-base shadow-none focus-visible:ring-2 md:text-sm"
          aria-label={t("search_placeholder")}
        />
        {hasQuery ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute top-1/2 right-1 h-8 w-8 -translate-y-1/2"
            onClick={() => onQueryChange("")}
            aria-label={t("search_clear")}
          >
            <X className="h-4 w-4" />
          </Button>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((key) => (
            <Button
              key={key}
              type="button"
              size="sm"
              variant={statusFilter === key ? "default" : "outline"}
              className={cn("h-8 rounded-full px-3 text-xs font-medium", statusFilter === key && "shadow-sm")}
              onClick={() => onStatusFilterChange(key)}
            >
              {t(`search_filter_${key}`)}
              <span
                className={cn(
                  "ml-1.5 tabular-nums",
                  statusFilter === key ? "text-primary-foreground/80" : "text-muted-foreground",
                )}
              >
                {counts[key]}
              </span>
            </Button>
          ))}
        </div>
        <p className="text-muted-foreground text-xs sm:text-right">
          {t("search_results_count", { shown: String(filteredCount), total: String(services.length) })}
        </p>
      </div>
    </div>
  );
}
