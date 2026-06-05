"use client";

import { useTranslations } from "next-intl";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { WorkflowNodeFieldDefinition } from "@/lib/workflow-node-registry";

type NodeConfigFieldRendererProps = {
  field: WorkflowNodeFieldDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
};

const EDITOR_KEYS = new Set([
  "tool_http", "tool_code", "mem_r2", "mem_d1", "mem_vectorize",
  "core_kind_http_request", "core_kind_code", "node_trigger", "node_flow", "node_core",
  "node_agent", "node_action", "node_transform", "node_human_review", "node_service", "node_memory", "node_tool",
]);

export function NodeConfigFieldRenderer({ field, value, onChange }: NodeConfigFieldRendererProps) {
  const t = useTranslations("WorkflowNodeRegistry");
  const te = useTranslations("WorkflowEditorPage");
  const ta = useTranslations("WorkflowAdminPage");
  const label = (key: string) => {
    if (EDITOR_KEYS.has(key)) return te(key as Parameters<typeof te>[0]);
    if (key.startsWith("tool_") || key.startsWith("mem_") || key.startsWith("core_kind_") || key.startsWith("node_")) {
      return te(key as Parameters<typeof te>[0]);
    }
    if (key.startsWith("opt_") || key.startsWith("field_") || key.startsWith("section_")) {
      return t(key as Parameters<typeof t>[0]);
    }
    return ta(key as Parameters<typeof ta>[0]);
  };

  if (field.type === "info") {
    return (
      <div className="bg-muted/50 rounded-md border px-3 py-2 text-xs">
        <p className="font-medium">{label(field.labelKey)}</p>
        {field.descriptionKey ? <p className="text-muted-foreground mt-1">{label(field.descriptionKey)}</p> : null}
      </div>
    );
  }

  if (field.type === "toggle") {
    return (
      <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
        <div>
          <Label className="text-sm">{label(field.labelKey)}</Label>
          {field.descriptionKey ? (
            <p className="text-muted-foreground text-xs">{label(field.descriptionKey)}</p>
          ) : null}
        </div>
        <Switch checked={!!value} onCheckedChange={onChange} />
      </div>
    );
  }

  if (field.type === "select") {
    return (
      <div className="space-y-1.5">
        <Label>{label(field.labelKey)}</Label>
        <Select value={String(value ?? field.defaultValue ?? "")} onValueChange={onChange}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(field.options ?? []).map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {label(opt.labelKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  if (field.type === "textarea" || field.type === "json" || field.type === "expression") {
    return (
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label>{label(field.labelKey)}</Label>
          {field.supportsExpression ? (
            <span className="text-muted-foreground font-mono text-[10px]">fx</span>
          ) : null}
        </div>
        {field.descriptionKey ? (
          <p className="text-muted-foreground text-xs">{label(field.descriptionKey)}</p>
        ) : null}
        <Textarea
          value={typeof value === "string" ? value : value != null ? JSON.stringify(value, null, 2) : ""}
          placeholder={field.placeholderKey ? label(field.placeholderKey) : undefined}
          rows={field.type === "textarea" ? 5 : 4}
          className="font-mono text-xs"
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    );
  }

  if (field.type === "resource-link") {
    return (
      <div className="space-y-1.5 rounded-md border border-dashed px-3 py-2">
        <Label>{label(field.labelKey)}</Label>
        {field.descriptionKey ? (
          <p className="text-muted-foreground text-xs">{label(field.descriptionKey)}</p>
        ) : null}
        <p className="text-muted-foreground text-xs italic">{t("resource_link_hint")}</p>
      </div>
    );
  }

  if (field.type === "options-group") {
    return (
      <div className="space-y-1.5 rounded-md border px-3 py-2">
        <Label>{label(field.labelKey)}</Label>
        {field.descriptionKey ? (
          <p className="text-muted-foreground text-xs">{label(field.descriptionKey)}</p>
        ) : null}
        <p className="text-muted-foreground text-xs">{t("options_group_hint")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <Label>{label(field.labelKey)}</Label>
      <Input
        type={field.type === "number" ? "number" : "text"}
        value={value != null ? String(value) : ""}
        onChange={(e) =>
          onChange(field.type === "number" ? Number(e.target.value) : e.target.value)
        }
      />
    </div>
  );
}
