import * as React from "react";

import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

export interface DynamicFieldSchema {
  name: string;
  type: string;
  label?: string;
  required?: boolean;
  options?: Array<{ value: string; label?: string }>;
  placeholder?: string;
}

type RHFField = { value: unknown; onChange: (v: unknown) => void };

function textLikeValue(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export function MessageFormDynamicField({ f, field }: { f: DynamicFieldSchema; field: RHFField }) {
  if (f.type === "date") {
    return (
      <Input
        type="date"
        value={textLikeValue(field.value)}
        onChange={(e) => field.onChange(e.target.value || undefined)}
        placeholder={f.placeholder}
      />
    );
  }
  if (f.type === "datetime") {
    return (
      <Input
        type="datetime-local"
        value={textLikeValue(field.value)}
        onChange={(e) => field.onChange(e.target.value || undefined)}
        placeholder={f.placeholder}
      />
    );
  }
  if (f.type === "boolean") {
    return <Switch checked={Boolean(field.value)} onCheckedChange={(v) => field.onChange(v)} />;
  }
  if (f.type === "select" && f.options && f.options.length > 0) {
    const ph = f.placeholder ?? `Chọn ${f.label ?? f.name}`;
    return (
      <Select value={textLikeValue(field.value)} onValueChange={(v) => field.onChange(v)}>
        <SelectTrigger>
          <SelectValue placeholder={ph} />
        </SelectTrigger>
        <SelectContent>
          {f.options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label ?? opt.value}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  const isNum = f.type === "number";
  const displayValue =
    field.value !== null && field.value !== undefined && field.value !== "" ? String(field.value) : "";
  return (
    <Input
      type={isNum ? "number" : "text"}
      placeholder={f.placeholder ?? f.label ?? f.name}
      value={displayValue}
      onChange={(e) => field.onChange(isNum ? (e.target.value ? Number(e.target.value) : undefined) : e.target.value)}
    />
  );
}
