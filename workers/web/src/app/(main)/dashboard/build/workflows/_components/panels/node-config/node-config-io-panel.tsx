"use client";

import { useState } from "react";

import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import type { WorkflowNodeSectionDefinition } from "@/lib/workflow-node-registry";

import { NodeConfigFieldRenderer } from "./node-config-field-renderer";

type IoViewMode = "schema" | "table" | "json";

type NodeConfigIoPanelProps = {
  title: string;
  section: WorkflowNodeSectionDefinition;
  data: Record<string, unknown>;
  onFieldChange?: (fieldId: string, value: unknown) => void;
  readOnly?: boolean;
  emptyLabel?: string;
};

export function NodeConfigIoPanel({
  title,
  section,
  data,
  onFieldChange,
  readOnly,
  emptyLabel,
}: NodeConfigIoPanelProps) {
  const t = useTranslations("WorkflowNodeRegistry");
  const modes = section.viewModes ?? ["json"];
  const [viewMode, setViewMode] = useState<IoViewMode>(modes[0] ?? "json");

  const sortedFields = [...section.fields].sort((a, b) => (a.order ?? 99) - (b.order ?? 99));

  return (
    <div className="flex h-full min-h-0 flex-col border-r last:border-r-0">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <h3 className="text-xs font-semibold tracking-wide uppercase">{title}</h3>
        {modes.length > 1 ? (
          <div className="flex gap-0.5 rounded-md border p-0.5">
            {modes.map((mode) => (
              <button
                key={mode}
                type="button"
                className={cn(
                  "rounded px-2 py-0.5 text-[10px] font-medium capitalize",
                  viewMode === mode ? "bg-muted" : "text-muted-foreground hover:text-foreground",
                )}
                onClick={() => setViewMode(mode)}
              >
                {t(`view_${mode}`)}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {sortedFields.length === 0 ? (
          <p className="text-muted-foreground text-center text-xs">{emptyLabel ?? t("no_data")}</p>
        ) : viewMode === "json" ? (
          <div className="space-y-3">
            {sortedFields.map((field) => (
              <NodeConfigFieldRenderer
                key={field.id}
                field={field}
                value={data[field.id]}
                onChange={readOnly || !onFieldChange ? () => {} : (v) => onFieldChange(field.id, v)}
              />
            ))}
          </div>
        ) : (
          <div className="space-y-2 text-xs">
            {sortedFields.map((field) => (
              <div key={field.id} className="flex justify-between gap-2 border-b py-1.5">
                <span className="text-muted-foreground">{t(field.labelKey)}</span>
                <span className="max-w-[60%] truncate font-mono">
                  {data[field.id] != null ? String(data[field.id]) : "—"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
