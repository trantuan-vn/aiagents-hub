"use client";

import { useMemo, useState } from "react";

import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import type { N8nNodeProperty, N8nNodePropertyOption } from "@/lib/n8n-workflow/types";

import { ExpressionDropField } from "./expression-drop-field";
import { operandString } from "./n8n-filter-operators";

function isNestedProperty(option: N8nNodePropertyOption | N8nNodeProperty): option is N8nNodeProperty {
  return "type" in option;
}

export function N8nCollectionParameter({
  property,
  value,
  onChange,
}: {
  property: N8nNodeProperty;
  value: unknown;
  onChange: (value: Record<string, unknown>) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = useMemo(() => {
    if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
    return {};
  }, [value]);
  const nested = (property.options ?? []).filter(isNestedProperty);
  const available = nested.filter((option) => !(option.name in current));
  const selected = nested.filter((option) => option.name in current);
  const addLabel = property.placeholder ?? "Add option";

  const addOption = (option: N8nNodeProperty) => {
    onChange({ ...current, [option.name]: option.default });
    setOpen(false);
  };

  const patchOption = (name: string, next: unknown) => {
    onChange({ ...current, [name]: next });
  };

  const removeOption = (name: string) => {
    const rest = { ...current };
    delete rest[name];
    onChange(rest);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm">{property.displayName}</Label>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7"
              disabled={available.length === 0}
              aria-label={addLabel}
            >
              <Plus className="size-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-1" align="end">
            {available.map((option) => (
              <button
                key={option.name}
                type="button"
                className="hover:bg-muted w-full rounded-sm px-3 py-2 text-left text-sm"
                onClick={() => addOption(option)}
              >
                {option.displayName}
              </button>
            ))}
          </PopoverContent>
        </Popover>
      </div>

      {selected.map((option) => (
        <div key={option.name} className="space-y-1.5 rounded-md border px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <div>
              <Label className="text-xs">{option.displayName}</Label>
              {option.description ? <p className="text-muted-foreground text-[11px]">{option.description}</p> : null}
            </div>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground text-xs"
              onClick={() => removeOption(option.name)}
              aria-label="Remove option"
            >
              &times;
            </button>
          </div>
          {option.type === "boolean" ? (
            <Switch checked={!!current[option.name]} onCheckedChange={(v) => patchOption(option.name, v)} />
          ) : (
            <ExpressionDropField
              value={operandString(current[option.name])}
              showFx={!option.noDataExpression}
              onChange={(v) => patchOption(option.name, v)}
            />
          )}
        </div>
      ))}

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-9 w-full justify-start text-xs font-normal"
        disabled={available.length === 0}
        onClick={() => setOpen(true)}
      >
        <Plus className="mr-1.5 size-3.5" />
        {addLabel}
      </Button>
    </div>
  );
}
