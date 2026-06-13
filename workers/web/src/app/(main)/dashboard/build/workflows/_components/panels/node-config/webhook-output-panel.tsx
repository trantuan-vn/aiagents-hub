"use client";

import { useMemo, useState } from "react";

import { Copy, Pencil } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  buildSchemaTreeRows,
  flattenWebhookItemForTable,
  type WebhookItemOutput,
} from "@aiagents-hub/workflow-nodes";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type IoViewMode = "schema" | "table" | "json";

type WebhookOutputPanelProps = {
  item: WebhookItemOutput;
  onEdit?: () => void;
  compact?: boolean;
  className?: string;
};

function typeBadgeClass(type: string): string {
  switch (type) {
    case "string":
      return "text-emerald-600 dark:text-emerald-400";
    case "number":
      return "text-blue-600 dark:text-blue-400";
    case "boolean":
      return "text-amber-600 dark:text-amber-400";
    case "object":
    case "array":
      return "text-violet-600 dark:text-violet-400";
    default:
      return "text-muted-foreground";
  }
}

export function WebhookOutputPanel({ item, onEdit, compact, className }: WebhookOutputPanelProps) {
  const t = useTranslations("WorkflowNodeRegistry");
  const [viewMode, setViewMode] = useState<IoViewMode>("schema");

  const schemaRows = useMemo(() => buildSchemaTreeRows(item as Record<string, unknown>), [item]);
  const tableRows = useMemo(() => flattenWebhookItemForTable(item), [item]);
  const jsonText = useMemo(() => JSON.stringify([item], null, 2), [item]);

  const copyJson = async () => {
    try {
      await navigator.clipboard.writeText(jsonText);
      toast.success(t("webhook_output_copied"));
    } catch {
      toast.error(t("webhook_copy_failed"));
    }
  };

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            {t("section_output")}
          </h3>
          <span className="text-muted-foreground text-[10px]">{t("webhook_output_item_count", { count: 1 })}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <div className="flex gap-0.5 rounded-md border p-0.5">
            {(["schema", "table", "json"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                className={cn(
                  "rounded px-2 py-0.5 text-[10px] font-medium capitalize",
                  viewMode === mode ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
                onClick={() => setViewMode(mode)}
              >
                {t(`view_${mode}`)}
              </button>
            ))}
          </div>
          <Button type="button" variant="ghost" size="icon" className="size-7" onClick={copyJson} aria-label={t("webhook_copy_output")}>
            <Copy className="size-3.5" />
          </Button>
          {onEdit ? (
            <Button type="button" variant="ghost" size="icon" className="size-7" onClick={onEdit} aria-label={t("webhook_edit_output")}>
              <Pencil className="size-3.5" />
            </Button>
          ) : null}
        </div>
      </div>

      <div className={cn("min-h-0 flex-1 overflow-y-auto", compact ? "max-h-48 p-2" : "p-3")}>
        {viewMode === "schema" ? (
          <div className="space-y-0.5 font-mono text-xs">
            {schemaRows.map((row) => (
              <div
                key={row.path}
                className="hover:bg-muted/50 flex items-center gap-2 rounded px-1 py-0.5"
                style={{ paddingLeft: `${row.depth * 12 + 4}px` }}
              >
                <span className="truncate">{row.name}</span>
                <span className={cn("ml-auto shrink-0 text-[10px]", typeBadgeClass(row.type))}>{row.type}</span>
                {row.value !== undefined ? (
                  <span className="text-muted-foreground max-w-[40%] truncate text-[10px]">{String(row.value)}</span>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        {viewMode === "table" ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-left">
                  <th className="text-muted-foreground pb-2 pr-3 font-medium">{t("webhook_output_field")}</th>
                  <th className="text-muted-foreground pb-2 font-medium">{t("webhook_output_value")}</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((row) => (
                  <tr key={row.path} className="border-b border-dashed last:border-0">
                    <td className="text-muted-foreground py-1.5 pr-3 align-top font-mono">{row.path}</td>
                    <td className="py-1.5 align-top font-mono break-all">{row.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {viewMode === "json" ? (
          <pre className="bg-muted/30 overflow-auto rounded-md border p-3 text-left font-mono text-xs leading-relaxed">
            {jsonText}
          </pre>
        ) : null}
      </div>
    </div>
  );
}
