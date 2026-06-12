"use client";

import { useMemo, useState } from "react";

import { Check, Search } from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

import type { PermissionItem } from "./permission-selector";

type ServicePermissionPickerProps = {
  services: PermissionItem[];
  value: string[];
  onChange: (permissions: string[]) => void;
};

export function ServicePermissionPicker({ services, value, onChange }: ServicePermissionPickerProps) {
  const t = useTranslations("TokenPage");
  const [query, setQuery] = useState("");

  const servicePaths = useMemo(() => new Set(services.map((s) => s.path)), [services]);
  const selectedCount = value.filter((p) => servicePaths.has(p)).length;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return services;
    return services.filter((s) => {
      const label = (s.label ?? s.path).toLowerCase();
      const desc = (s.description ?? "").toLowerCase();
      return label.includes(q) || desc.includes(q) || s.path.toLowerCase().includes(q);
    });
  }, [query, services]);

  const toggle = (path: string, checked: boolean) => {
    const withoutServices = value.filter((p) => !servicePaths.has(p));
    if (checked) {
      onChange([...new Set([...withoutServices, path])]);
      return;
    }
    onChange(withoutServices);
  };

  const selectAllFiltered = () => {
    const withoutServices = value.filter((p) => !servicePaths.has(p));
    onChange([...new Set([...withoutServices, ...filtered.map((s) => s.path)])]);
  };

  const clearAllServices = () => {
    onChange(value.filter((p) => !servicePaths.has(p)));
  };

  if (services.length === 0) {
    return <p className="text-muted-foreground text-xs">{t("no_services_for_permissions")}</p>;
  }

  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium">{t("perm_group_service")}</p>
          <Badge variant="secondary" className="text-[10px] font-normal">
            {selectedCount}/{services.length}
          </Badge>
        </div>
        <div className="flex gap-1">
          <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={selectAllFiltered}>
            {t("services_select_visible")}
          </Button>
          <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={clearAllServices}>
            {t("services_clear")}
          </Button>
        </div>
      </div>

      <div className="relative">
        <Search className="text-muted-foreground absolute top-2.5 left-2.5 size-3.5" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("services_search_placeholder")}
          className="h-9 pl-8 text-xs"
        />
      </div>

      <ScrollArea className="h-44 rounded-md border">
        <div className="p-1">
          {filtered.length === 0 ? (
            <p className="text-muted-foreground px-2 py-6 text-center text-xs">{t("services_no_results")}</p>
          ) : (
            filtered.map((perm) => {
              const id = `svc-${perm.path}`;
              const checked = value.includes(perm.path);
              const title = perm.label ?? perm.path;
              return (
                <label
                  key={perm.path}
                  htmlFor={id}
                  className={cn(
                    "hover:bg-muted/60 flex cursor-pointer items-start gap-2 rounded-md px-2 py-2 transition-colors",
                    checked && "bg-muted/40",
                  )}
                >
                  <Checkbox
                    id={id}
                    checked={checked}
                    onCheckedChange={(v) => toggle(perm.path, v === true)}
                    className="mt-0.5"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm leading-tight font-medium">{title}</p>
                    {perm.description ? (
                      <p className="text-muted-foreground truncate text-[11px]">{perm.description}</p>
                    ) : null}
                    <p className="text-muted-foreground truncate font-mono text-[10px]">{perm.path}</p>
                  </div>
                  {checked ? <Check className="text-primary mt-0.5 size-3.5 shrink-0" /> : null}
                </label>
              );
            })
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
