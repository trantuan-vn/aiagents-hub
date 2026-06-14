"use client";

import { useMemo, useState } from "react";

import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

import type { Service } from "@/app/(main)/dashboard/service/_components/schema";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

import { useApprovedServices } from "../hooks/use-approved-services";

type ServiceSearchComboboxProps = {
  value: string;
  onSelect: (service: Service) => void;
  id?: string;
  className?: string;
};

function serviceMatchesQuery(service: Service, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    service.name.toLowerCase().includes(q) ||
    service.endpoint.toLowerCase().includes(q) ||
    (service.model?.toLowerCase().includes(q) ?? false) ||
    String(service.id ?? "").toLowerCase().includes(q)
  );
}

function ServiceOptionLabel({ service }: { service: Service }) {
  return (
    <div className="min-w-0 flex-1 text-left">
      <div className="truncate font-medium">{service.name}</div>
      <div className="text-muted-foreground truncate text-xs">
        {service.model ? `${service.model} · ` : ""}
        {service.endpoint}
      </div>
    </div>
  );
}

export function ServiceSearchCombobox({ value, onSelect, id, className }: ServiceSearchComboboxProps) {
  const t = useTranslations("WorkflowEditorPage");
  const { services, loading } = useApprovedServices();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = useMemo(
    () => services.find((s) => s.endpoint === value) ?? null,
    [services, value],
  );

  const filtered = useMemo(
    () => services.filter((s) => serviceMatchesQuery(s, query)),
    [services, query],
  );

  const displayLabel = selected
    ? selected.name
    : value
      ? value
      : loading
        ? t("service_select_loading")
        : services.length === 0
          ? t("service_select_empty")
          : t("service_search_placeholder");

  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id} className="text-xs">
        {t("field_service")}
      </Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={loading || services.length === 0}
            className="h-9 w-full justify-between px-3 text-xs font-normal"
          >
            <span className="truncate">{displayLabel}</span>
            <ChevronsUpDown className="ml-2 size-3.5 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder={t("service_search_placeholder")}
              value={query}
              onValueChange={setQuery}
            />
            <CommandList>
              {loading ? (
                <div className="text-muted-foreground flex items-center gap-2 px-3 py-4 text-sm">
                  <Loader2 className="size-4 animate-spin" />
                  {t("service_select_loading")}
                </div>
              ) : null}
              {!loading && filtered.length === 0 ? (
                <CommandEmpty>{t("service_search_empty")}</CommandEmpty>
              ) : null}
              <CommandGroup>
                {filtered.map((service) => (
                  <CommandItem
                    key={String(service.id ?? service.endpoint)}
                    value={service.endpoint}
                    onSelect={() => {
                      onSelect(service);
                      setOpen(false);
                      setQuery("");
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 size-4",
                        value === service.endpoint ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <ServiceOptionLabel service={service} />
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <p className="text-muted-foreground text-[11px] leading-relaxed">{t("agent_model_hint")}</p>
    </div>
  );
}
