"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Calendar, ChevronDown } from "lucide-react";
import { createPortal } from "react-dom";

import { Button } from "@/components/ui/button";

const DATE_PRESETS = ["7", "30", "90", "custom"] as const;
export type DatePreset = (typeof DATE_PRESETS)[number];

export function getDateRangeForPreset(days: number): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - days);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

export interface Service {
  id: number;
  name?: string;
  endpoint?: string;
}

function useDropdown() {
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<{ top: number; left: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const openDropdown = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      setStyle({ top: rect.bottom + 4, left: rect.left, width: rect.width });
      setOpen(true);
    }
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setStyle(null);
  }, []);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const inTrigger = triggerRef.current?.contains(target);
      const inDropdown = dropdownRef.current?.contains(target);
      if (!inTrigger && !inDropdown) close();
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open, close]);

  return { triggerRef, dropdownRef, style, open, openDropdown, close };
}

export function ServiceDropdown({
  serviceIdFilter,
  onServiceChange,
  services,
  getServiceLabel,
  t,
}: {
  serviceIdFilter: string;
  onServiceChange: (v: string) => void;
  services: Service[];
  getServiceLabel: (s: Service) => string;
  t: (key: string) => string;
}) {
  const { triggerRef, dropdownRef, style, open, openDropdown, close } = useDropdown();

  const handleSelect = useCallback(
    (value: string) => {
      onServiceChange(value);
      close();
    },
    [onServiceChange, close],
  );

  return (
    <div ref={triggerRef} className="relative inline-block">
      <Button
        type="button"
        variant="outline"
        className="h-9 w-[200px] justify-between font-normal"
        onClick={() => (open ? close() : openDropdown())}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="truncate">
          {serviceIdFilter === "all"
            ? t("filters.all_services")
            : getServiceLabel(
                services.find((s) => String(s.id) === serviceIdFilter) ?? {
                  id: parseInt(serviceIdFilter, 10) || 0,
                },
              )}
        </span>
        <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </Button>
      {open &&
        style &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={dropdownRef}
            className="bg-popover text-popover-foreground fixed z-[9999] max-h-[300px] overflow-y-auto rounded-md border p-1 shadow-lg"
            style={{ top: style.top, left: style.left, minWidth: style.width }}
            role="listbox"
          >
            <button
              type="button"
              role="option"
              aria-selected={serviceIdFilter === "all"}
              className="focus:bg-accent focus:text-accent-foreground hover:bg-accent hover:text-accent-foreground flex w-full cursor-pointer items-center rounded-sm px-2 py-1.5 text-left text-sm"
              onClick={() => handleSelect("all")}
            >
              {t("filters.all_services")}
            </button>
            {services.map((s) => (
              <button
                key={s.id}
                type="button"
                role="option"
                aria-selected={String(s.id) === serviceIdFilter}
                className="focus:bg-accent focus:text-accent-foreground hover:bg-accent hover:text-accent-foreground flex w-full cursor-pointer items-center rounded-sm px-2 py-1.5 text-left text-sm"
                onClick={() => handleSelect(String(s.id))}
              >
                {getServiceLabel(s)}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}

export function DateRangeDropdown({
  preset,
  onPresetChange,
  t,
}: {
  preset: DatePreset;
  onPresetChange: (v: DatePreset) => void;
  t: (key: string) => string;
}) {
  const { triggerRef, dropdownRef, style, open, openDropdown, close } = useDropdown();

  const handleSelect = useCallback(
    (value: DatePreset) => {
      onPresetChange(value);
      close();
    },
    [onPresetChange, close],
  );

  const presetLabel =
    preset === "custom" ? t("filters.date_custom") : t(`filters.date_${preset}_days` as "filters.date_7_days");

  return (
    <div ref={triggerRef} className="relative inline-block">
      <Button
        type="button"
        variant="outline"
        className="h-9 w-[140px] justify-between font-normal"
        onClick={() => (open ? close() : openDropdown())}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <Calendar className="text-muted-foreground mr-2 h-4 w-4 shrink-0" />
        <span className="truncate">{presetLabel}</span>
        <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </Button>
      {open &&
        style &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={dropdownRef}
            className="bg-popover text-popover-foreground fixed z-[9999] rounded-md border p-1 shadow-lg"
            style={{ top: style.top, left: style.left, minWidth: style.width }}
            role="listbox"
          >
            {DATE_PRESETS.map((opt) => (
              <button
                key={opt}
                type="button"
                role="option"
                aria-selected={preset === opt}
                className="focus:bg-accent focus:text-accent-foreground hover:bg-accent hover:text-accent-foreground flex w-full cursor-pointer items-center rounded-sm px-2 py-1.5 text-left text-sm"
                onClick={() => handleSelect(opt)}
              >
                {opt === "custom" ? t("filters.date_custom") : t(`filters.date_${opt}_days` as "filters.date_7_days")}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
