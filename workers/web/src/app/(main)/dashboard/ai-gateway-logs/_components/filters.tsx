"use client";

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type LogFilters = {
  status: "all" | "success" | "error";
  cache: "all" | "cached" | "miss";
  model: string;
  search: string;
};

export const EMPTY_FILTERS: LogFilters = {
  status: "all",
  cache: "all",
  model: "",
  search: "",
};

export function filtersAreDefault(filters: LogFilters): boolean {
  return filters.status === "all" && filters.cache === "all" && !filters.model.trim() && !filters.search.trim();
}

export function LogFiltersBar({
  filters,
  onChange,
}: {
  filters: LogFilters;
  onChange: (next: LogFilters) => void;
}) {
  const t = useTranslations("AiGatewayLogsAdmin");
  const clear = filtersAreDefault(filters);

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="space-y-1">
          <Label htmlFor="gw-status">{t("col_status")}</Label>
          <select
            id="gw-status"
            className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
            value={filters.status}
            onChange={(event) => onChange({ ...filters, status: event.target.value as LogFilters["status"] })}
          >
            <option value="all">{t("filter_all")}</option>
            <option value="success">{t("status_success")}</option>
            <option value="error">{t("status_error")}</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="gw-cache">{t("filter_cache")}</Label>
          <select
            id="gw-cache"
            className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
            value={filters.cache}
            onChange={(event) => onChange({ ...filters, cache: event.target.value as LogFilters["cache"] })}
          >
            <option value="all">{t("filter_all")}</option>
            <option value="cached">{t("status_cached")}</option>
            <option value="miss">{t("filter_not_cached")}</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="gw-model">{t("col_model")}</Label>
          <Input
            id="gw-model"
            value={filters.model}
            placeholder="@cf/…"
            onChange={(event) => onChange({ ...filters, model: event.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="gw-search">{t("filter_search")}</Label>
          <Input
            id="gw-search"
            value={filters.search}
            onChange={(event) => onChange({ ...filters, search: event.target.value })}
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        {clear ? <span className="text-muted-foreground">{t("no_filters")}</span> : null}
        <Button type="button" variant="ghost" size="sm" disabled={clear} onClick={() => onChange(EMPTY_FILTERS)}>
          {t("clear_filters")}
        </Button>
      </div>
    </div>
  );
}
