"use client";

import { useMemo, useState } from "react";

import { Braces, ChevronDown, Hash, List, Table2, Type } from "lucide-react";
import { useTranslations } from "next-intl";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import {
  flattenFields,
  previewValue,
  schemaKind,
  type IoViewMode,
  type SchemaValueKind,
} from "./workflow-execution-utils";

function KindIcon({ kind }: { kind: SchemaValueKind }) {
  const className = "size-3 shrink-0";
  if (kind === "string") return <Type className={cn(className, "text-sky-600 dark:text-sky-400")} aria-hidden />;
  if (kind === "number") return <Hash className={cn(className, "text-amber-600 dark:text-amber-400")} aria-hidden />;
  if (kind === "boolean") return <span className="text-[10px] font-bold text-violet-600 dark:text-violet-400">B</span>;
  if (kind === "array") return <List className={cn(className, "text-emerald-600 dark:text-emerald-400")} aria-hidden />;
  if (kind === "object")
    return <Braces className={cn(className, "text-orange-600 dark:text-orange-400")} aria-hidden />;
  return <span className="text-muted-foreground text-[10px]">∅</span>;
}

function schemaChildren(value: unknown, expandable: boolean): Array<[string, unknown]> {
  if (!expandable) return [];
  if (Array.isArray(value)) return value.map((item, i) => [`[${i}]`, item]);
  return Object.entries(value as Record<string, unknown>);
}

function matchesQuery(name: string, value: unknown, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return name.toLowerCase().includes(q) || previewValue(value).toLowerCase().includes(q);
}

function subtreeVisible(query: string, selfMatch: boolean, children: Array<[string, unknown]>): boolean {
  if (!query || selfMatch) return true;
  const q = query.toLowerCase();
  return children.some(([k, v]) => `${k} ${previewValue(v)}`.toLowerCase().includes(q));
}

function SchemaNodeBody({
  expandable,
  open,
  kind,
  name,
  value,
  childrenCount,
}: {
  expandable: boolean;
  open: boolean;
  kind: SchemaValueKind;
  name: string;
  value: unknown;
  childrenCount: number;
}) {
  return (
    <>
      {expandable ? (
        <ChevronDown
          className={cn("text-muted-foreground mt-0.5 size-3 shrink-0 transition-transform", !open && "-rotate-90")}
          aria-hidden
        />
      ) : (
        <span className="mt-0.5 w-3 shrink-0" />
      )}
      <KindIcon kind={kind} />
      <span className="text-foreground min-w-0 shrink-0 font-medium">{name}</span>
      {expandable ? (
        <span className="text-muted-foreground min-w-0 truncate">
          {kind === "array" ? `${childrenCount}` : `${childrenCount} keys`}
        </span>
      ) : (
        <span className="text-muted-foreground min-w-0 flex-1 break-all font-mono">{previewValue(value, 200)}</span>
      )}
    </>
  );
}

function SchemaTree({ name, value, depth, query }: { name: string; value: unknown; depth: number; query: string }) {
  const kind = schemaKind(value);
  const expandable = kind === "object" || kind === "array";
  const [open, setOpen] = useState(depth < 2 || !!query);
  const q = query.trim().toLowerCase();
  const children = schemaChildren(value, expandable);
  if (!subtreeVisible(q, matchesQuery(name, value, q), children)) return null;

  return (
    <div className="min-w-0 overflow-hidden">
      <button
        type="button"
        className={cn(
          "hover:bg-muted/60 flex w-full min-w-0 items-start gap-1.5 rounded-sm px-1 py-0.5 text-left text-[11px]",
          !expandable && "cursor-default",
        )}
        onClick={() => expandable && setOpen((v) => !v)}
        disabled={!expandable}
      >
        <SchemaNodeBody
          expandable={expandable}
          open={open}
          kind={kind}
          name={name}
          value={value}
          childrenCount={children.length}
        />
      </button>
      {expandable && open ? (
        <div className="border-border/70 ml-3 border-l pl-1">
          {children.length === 0 ? (
            <p className="text-muted-foreground px-1 py-0.5 text-[11px]">—</p>
          ) : (
            children.map(([k, v]) => <SchemaTree key={k} name={k} value={v} depth={depth + 1} query={query} />)
          )}
        </div>
      ) : null}
    </div>
  );
}

function SchemaRoots({ value, query }: { value: unknown; query: string }) {
  if (Array.isArray(value)) {
    return <SchemaTree name={`[${value.length}]`} value={value} depth={0} query={query} />;
  }
  if (value != null && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).map(([k, v]) => (
      <SchemaTree key={k} name={k} value={v} depth={0} query={query} />
    ));
  }
  return <SchemaTree name="value" value={value} depth={0} query={query} />;
}

function DataPaneBody({
  empty,
  emptyLabel,
  mode,
  value,
  query,
  json,
}: {
  empty: boolean;
  emptyLabel: string;
  mode: IoViewMode;
  value: unknown;
  query: string;
  json: string;
}) {
  const t = useTranslations("WorkflowEditorPage");
  if (empty) return <p className="text-muted-foreground p-3 text-xs">{emptyLabel}</p>;
  if (mode === "json") {
    const hit = !query.trim() || json.toLowerCase().includes(query.trim().toLowerCase());
    return (
      <pre className="p-3 font-mono text-[11px] break-words whitespace-pre-wrap">
        {hit ? json : t("executions_no_data")}
      </pre>
    );
  }
  if (mode === "table") return <TableView value={value} query={query} />;
  return (
    <div className="min-w-0 p-1.5">
      <SchemaRoots value={value} query={query} />
    </div>
  );
}

function TableView({ value, query }: { value: unknown; query: string }) {
  const t = useTranslations("WorkflowEditorPage");
  const rows = Array.isArray(value) ? value : value == null ? [] : [value];
  const objects = rows.filter((r) => r != null && typeof r === "object" && !Array.isArray(r)) as Array<
    Record<string, unknown>
  >;
  const q = query.trim().toLowerCase();

  if (objects.length === 0) {
    const fields = flattenFields(value).filter(
      (f) => !q || f.path.toLowerCase().includes(q) || previewValue(f.value).toLowerCase().includes(q),
    );
    if (fields.length === 0) {
      return <p className="text-muted-foreground p-3 text-xs">{t("executions_no_data")}</p>;
    }
    return (
      <table className="w-full text-left text-[11px]">
        <tbody>
          {fields.map((f) => (
            <tr key={f.path} className="border-b last:border-0">
              <th className="text-muted-foreground w-[36%] px-2 py-1.5 align-top font-medium break-all">{f.path}</th>
              <td className="px-2 py-1.5 font-mono break-all">{previewValue(f.value, 400)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  const columns = Array.from(new Set(objects.flatMap((row) => Object.keys(row))));
  const filtered = q ? objects.filter((row) => JSON.stringify(row).toLowerCase().includes(q)) : objects;

  if (filtered.length === 0) {
    return <p className="text-muted-foreground p-3 text-xs">{t("executions_no_data")}</p>;
  }

  return (
    <div className="overflow-auto">
      <table className="w-full min-w-max text-left text-[11px]">
        <thead className="bg-muted/50 sticky top-0">
          <tr>
            {columns.map((col) => (
              <th key={col} className="text-muted-foreground px-2 py-1.5 font-medium whitespace-nowrap">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filtered.map((row) => (
            <tr key={previewValue(row, 80)} className="border-b last:border-0">
              {columns.map((col) => (
                <td key={col} className="px-2 py-1.5 align-top font-mono break-all">
                  {previewValue(Reflect.get(row, col), 240)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function WorkflowExecutionDataPane({
  title,
  value,
  emptyLabel,
}: {
  title: string;
  value: unknown;
  emptyLabel: string;
}) {
  const t = useTranslations("WorkflowEditorPage");
  const [mode, setMode] = useState<IoViewMode>("schema");
  const [query, setQuery] = useState("");
  const json = useMemo(() => {
    if (value == null) return "";
    if (typeof value === "string") return value;
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }, [value]);

  const empty = value == null || value === "" || (typeof value === "object" && Object.keys(value).length === 0);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-r last:border-r-0">
      <div className="flex shrink-0 items-center gap-2 border-b px-3 py-1.5">
        <p className="text-[11px] font-semibold tracking-wide uppercase">{title}</p>
        <div className="ml-auto flex items-center gap-0.5">
          {(
            [
              ["schema", List, t("executions_view_schema")],
              ["json", Braces, t("executions_view_json")],
              ["table", Table2, t("executions_view_table")],
            ] as const
          ).map(([id, Icon, label]) => (
            <button
              key={id}
              type="button"
              title={label}
              onClick={() => setMode(id)}
              className={cn(
                "text-muted-foreground hover:bg-muted hover:text-foreground flex size-6 items-center justify-center rounded",
                mode === id && "bg-muted text-foreground",
              )}
            >
              <Icon className="size-3.5" aria-hidden />
            </button>
          ))}
        </div>
      </div>
      <div className="shrink-0 border-b px-2 py-1.5">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("executions_search_data")}
          className="h-7 text-xs"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <DataPaneBody empty={empty} emptyLabel={emptyLabel} mode={mode} value={value} query={query} json={json} />
      </div>
    </div>
  );
}
