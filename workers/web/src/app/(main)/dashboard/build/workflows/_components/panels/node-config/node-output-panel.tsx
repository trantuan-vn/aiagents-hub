"use client";

import { useMemo, useState, type ReactNode } from "react";

import { buildSchemaTreeRows, flattenWebhookItemForTable } from "@aiagents-hub/workflow-nodes";
import { ArrowRightFromLine, Copy, Pencil, PinOff, Play, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type IoViewMode = "schema" | "table" | "json";

const ORANGE = "bg-[#ff6f00] hover:bg-[#e66300]";

export type NodeOutputPanelProps = {
  data?: Record<string, unknown> | null;
  className?: string;
  compact?: boolean;
  onEdit?: () => void;
  onUnpin?: () => void;
  onExecute?: () => void;
  onSetMockData?: () => void;
  executeLabel?: string;
  emptyLabel?: string;
  defaultViewMode?: IoViewMode;
  headerExtra?: ReactNode;
  formatJson?: (data: Record<string, unknown>) => string;
  showCopy?: boolean;
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

function IoViewSwitcher({
  viewMode,
  onChange,
}: {
  viewMode: IoViewMode;
  onChange: (mode: IoViewMode) => void;
}) {
  const t = useTranslations("WorkflowNodeRegistry");

  return (
    <div className="flex gap-0.5 rounded-md border p-0.5">
      {(["schema", "table", "json"] as const).map((mode) => (
        <button
          key={mode}
          type="button"
          className={cn(
            "rounded px-2 py-0.5 text-[10px] font-medium capitalize",
            viewMode === mode ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
          onClick={() => onChange(mode)}
        >
          {t(`view_${mode}`)}
        </button>
      ))}
    </div>
  );
}

export function NodeOutputPanel({
  data,
  className,
  compact,
  onEdit,
  onUnpin,
  onExecute,
  onSetMockData,
  executeLabel,
  emptyLabel,
  defaultViewMode = "table",
  headerExtra,
  formatJson,
  showCopy,
}: NodeOutputPanelProps) {
  const t = useTranslations("WorkflowNodeRegistry");
  const te = useTranslations("WorkflowEditorPage");
  const [viewMode, setViewMode] = useState<IoViewMode>(defaultViewMode);
  const [search, setSearch] = useState("");

  const hasData =
    data != null &&
    typeof data === "object" &&
    (Array.isArray(data) ? data.length > 0 : Object.keys(data).length > 0);

  const schemaRows = useMemo(() => (hasData ? buildSchemaTreeRows(data) : []), [data, hasData]);
  const tableRows = useMemo(() => (hasData ? flattenWebhookItemForTable(data as never) : []), [data, hasData]);
  const jsonText = useMemo(
    () => (hasData ? (formatJson ? formatJson(data) : JSON.stringify(data, null, 2)) : ""),
    [data, formatJson, hasData],
  );

  const searchQuery = search.trim().toLowerCase();

  const filteredSchemaRows = useMemo(() => {
    if (!searchQuery) return schemaRows;
    const matchingPaths = new Set(
      schemaRows
        .filter(
          (row) =>
            row.path.toLowerCase().includes(searchQuery) ||
            row.name.toLowerCase().includes(searchQuery) ||
            (row.value != null && String(row.value).toLowerCase().includes(searchQuery)),
        )
        .map((row) => row.path),
    );
    return schemaRows.filter((row) =>
      [...matchingPaths].some(
        (path) => path === row.path || path.startsWith(`${row.path}.`) || row.path.startsWith(`${path}.`),
      ),
    );
  }, [schemaRows, searchQuery]);

  const filteredTableRows = useMemo(() => {
    if (!searchQuery) return tableRows;
    return tableRows.filter(
      (row) =>
        row.path.toLowerCase().includes(searchQuery) || String(row.value).toLowerCase().includes(searchQuery),
    );
  }, [tableRows, searchQuery]);

  const copyJson = async () => {
    if (!jsonText) return;
    try {
      await navigator.clipboard.writeText(jsonText);
      toast.success(t("webhook_output_copied"));
    } catch {
      toast.error(t("webhook_copy_failed"));
    }
  };

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div className="space-y-2 border-b px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              {t("section_output")}
            </h3>
            {headerExtra}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <IoViewSwitcher viewMode={viewMode} onChange={setViewMode} />
            {showCopy && hasData ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7"
                onClick={copyJson}
                aria-label={t("webhook_copy_output")}
              >
                <Copy className="size-3.5" />
              </Button>
            ) : null}
            {onEdit ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7"
                onClick={onEdit}
                aria-label={t("webhook_edit_output")}
              >
                <Pencil className="size-3.5" />
              </Button>
            ) : null}
            {onUnpin && hasData ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7"
                onClick={onUnpin}
                aria-label={t("output_unpin")}
                title={t("output_unpin")}
              >
                <PinOff className="size-3.5" />
              </Button>
            ) : null}
          </div>
        </div>
        <div className="relative">
          <Search className="text-muted-foreground absolute top-2 left-2 size-3.5" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("agent_input_search_placeholder")}
            className="h-8 pl-8 text-xs"
          />
        </div>
      </div>

      <div className={cn("min-h-0 flex-1 overflow-y-auto", compact ? "max-h-48 p-2" : "p-3")}>
        {!hasData ? (
          <div className="flex h-full min-h-[12rem] flex-col items-center justify-center gap-3 p-6 text-center">
            <ArrowRightFromLine className="text-muted-foreground/40 size-10 stroke-[1.5]" />
            <p className="text-sm font-semibold">{emptyLabel ?? t("no_output_data")}</p>
            {onExecute ? (
              <Button type="button" className={cn(ORANGE, "text-white")} onClick={onExecute}>
                <Play className="mr-2 size-3.5 fill-current" />
                {executeLabel ?? te("menu_execute_step")}
              </Button>
            ) : null}
            {onSetMockData ? (
              <button
                type="button"
                className="text-[#ff6f00] text-xs underline-offset-2 hover:underline"
                onClick={onSetMockData}
              >
                {t("webhook_set_mock_data")}
              </button>
            ) : null}
          </div>
        ) : viewMode === "schema" ? (
          filteredSchemaRows.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-xs">{t("no_data")}</p>
          ) : (
            <div className="space-y-0.5 font-mono text-xs">
              {filteredSchemaRows.map((row) => (
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
          )
        ) : viewMode === "table" ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-left">
                  <th className="text-muted-foreground pb-2 pr-3 font-medium">{t("webhook_output_field")}</th>
                  <th className="text-muted-foreground pb-2 font-medium">{t("webhook_output_value")}</th>
                </tr>
              </thead>
              <tbody>
                {filteredTableRows.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="text-muted-foreground py-6 text-center">
                      {t("no_data")}
                    </td>
                  </tr>
                ) : (
                  filteredTableRows.map((row) => (
                    <tr key={row.path} className="border-b border-dashed last:border-0">
                      <td className="text-muted-foreground py-1.5 pr-3 align-top font-mono">{row.path}</td>
                      <td className="py-1.5 align-top font-mono break-all">{row.value}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <pre className="bg-muted/30 overflow-auto rounded-md border p-3 text-left font-mono text-xs leading-relaxed">
            {jsonText}
          </pre>
        )}
      </div>
    </div>
  );
}
