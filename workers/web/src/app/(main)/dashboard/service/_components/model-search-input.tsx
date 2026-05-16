"use client";

import * as React from "react";

import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

import { searchModelHits, type ModelSearchHit } from "./model-pricing";

interface ModelSearchInputProps {
  value?: string;
  onChange: (hit: ModelSearchHit) => void | Promise<void>;
  disabled?: boolean;
}

function modelDisplayLabel(value: string | undefined, placeholder: string): string {
  const trimmed = value?.trim();
  if (!trimmed) return placeholder;
  return trimmed;
}

function ModelOptionLabel({ model }: { model: ModelSearchHit }) {
  const title = model.name ?? model.id;
  const sub = model.name && model.id !== model.name ? model.id : model.description;
  return (
    <div className="min-w-0 flex-1">
      <div className="truncate font-medium">{title}</div>
      {sub ? <div className="text-muted-foreground truncate text-xs">{sub}</div> : null}
    </div>
  );
}

export function ModelSearchInput({ value, onChange, disabled }: ModelSearchInputProps) {
  const t = useTranslations("ServicePage");
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<ModelSearchHit[]>([]);
  const [loading, setLoading] = React.useState(false);
  const pickGenRef = React.useRef(0);

  React.useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      const params = new URLSearchParams();
      if (query.trim()) params.set("search", query.trim());
      void searchModelHits(params.get("search") ?? "")
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, open]);

  const displayValue = modelDisplayLabel(value, t("form.model_placeholder"));

  const pickModel = React.useCallback(
    async (hit: ModelSearchHit) => {
      const gen = ++pickGenRef.current;
      setOpen(false);
      await onChange(hit);
      if (gen !== pickGenRef.current) return;
    },
    [onChange],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          <span className="truncate">{displayValue}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder={t("form.model_search_placeholder")} value={query} onValueChange={setQuery} />
          <CommandList>
            {loading ? (
              <div className="text-muted-foreground flex items-center gap-2 px-3 py-4 text-sm">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("form.model_searching")}
              </div>
            ) : null}
            {!loading && results.length === 0 ? (
              <CommandEmpty>
                {query.trim() ? (
                  <button
                    type="button"
                    className="hover:bg-accent w-full px-2 py-3 text-left text-sm"
                    onClick={() => {
                      void pickModel({ id: query.trim() });
                    }}
                  >
                    {t("form.model_use_custom", { model: query.trim() })}
                  </button>
                ) : (
                  t("form.model_search_empty")
                )}
              </CommandEmpty>
            ) : null}
            <CommandGroup>
              {results.map((model, index) => (
                <CommandItem
                  key={model.id}
                  value={`${index}-${model.id}`}
                  onSelect={() => {
                    void pickModel(model);
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === model.id ? "opacity-100" : "opacity-0")} />
                  <ModelOptionLabel model={model} />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
