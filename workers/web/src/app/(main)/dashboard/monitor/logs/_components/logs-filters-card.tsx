"use client";

import { Calendar, Filter, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Service {
  id: number;
  name?: string;
  endpoint?: string;
}

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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Filter className="h-4 w-4" />
          {t("filters.title")}
        </CardTitle>
        <CardDescription>{t("filters.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="relative min-w-[200px] flex-1">
            <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
            <Input
              placeholder={t("filters.search_placeholder")}
              value={searchEndpoint}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={serviceIdFilter} onValueChange={onServiceChange}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder={t("filters.service_placeholder")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("filters.all_services")}</SelectItem>
              {services.map((s) => (
                <SelectItem key={s.id} value={String(s.id)}>
                  {getServiceLabel(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <Calendar className="text-muted-foreground h-4 w-4" />
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => onDateFromChange(e.target.value)}
              className="w-[140px]"
            />
            <span className="text-muted-foreground text-sm">–</span>
            <Input type="date" value={dateTo} onChange={(e) => onDateToChange(e.target.value)} className="w-[140px]" />
          </div>
          <Button onClick={onApply} size="sm">
            {t("filters.apply")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
