"use client";

import { useMemo, useState, type DragEvent, type ReactNode } from "react";

import type { Edge, Node } from "@xyflow/react";
import {
  Braces,
  ChevronDown,
  ChevronRight,
  Hash,
  Search,
  ToggleLeft,
  Type,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { buildSchemaTreeRows, flattenWebhookItemForTable } from "@aiagents-hub/workflow-nodes";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import {
  contextPathToExpression,
  jsonPathToExpression,
  setExpressionDragData,
} from "./workflow-expression-dnd";

type IoViewMode = "schema" | "table" | "json";

type ContextTreeNode = {
  id: string;
  name: string;
  type: string;
  expression: string;
  children?: ContextTreeNode[];
};

const WORKFLOW_CONTEXT_TREE: ContextTreeNode[] = [
  { id: "now", name: "$now", type: "string", expression: contextPathToExpression("$now") },
  { id: "today", name: "$today", type: "string", expression: contextPathToExpression("$today") },
  {
    id: "execution",
    name: "$execution",
    type: "object",
    expression: contextPathToExpression("$execution"),
    children: [
      { id: "execution.id", name: "id", type: "string", expression: contextPathToExpression("$execution.id") },
      { id: "execution.mode", name: "mode", type: "string", expression: contextPathToExpression("$execution.mode") },
      {
        id: "execution.resumeUrl",
        name: "resumeUrl",
        type: "string",
        expression: contextPathToExpression("$execution.resumeUrl"),
      },
    ],
  },
  {
    id: "workflow",
    name: "$workflow",
    type: "object",
    expression: contextPathToExpression("$workflow"),
    children: [
      { id: "workflow.id", name: "id", type: "string", expression: contextPathToExpression("$workflow.id") },
      { id: "workflow.name", name: "name", type: "string", expression: contextPathToExpression("$workflow.name") },
      {
        id: "workflow.active",
        name: "active",
        type: "boolean",
        expression: contextPathToExpression("$workflow.active"),
      },
    ],
  },
];

function isDataFlowEdge(edge: Edge): boolean {
  const targetHandle = edge.targetHandle ?? "in";
  if (targetHandle !== "in") return false;
  const sourceHandle = edge.sourceHandle ?? "out";
  return sourceHandle === "out" || sourceHandle.startsWith("out_") || sourceHandle === "true" || sourceHandle === "false";
}

function getUpstreamNode(nodeId: string, nodes: Node[], edges: Edge[]): Node | null {
  const parentEdge = edges.find((e) => e.target === nodeId && isDataFlowEdge(e));
  if (!parentEdge) return null;
  return nodes.find((n) => n.id === parentEdge.source) ?? null;
}

type FormElementLike = {
  id?: string;
  label?: string;
  fieldType?: string;
  fieldName?: string;
  multipleFiles?: boolean;
};

function isFormSubmissionNode(node: Node): boolean {
  const d = (node.data ?? {}) as Record<string, unknown>;
  return (d.triggerKind === "form" && d.formKind !== "database") || node.type === "form";
}

function sampleValueForFieldType(type: string | undefined, multiple?: boolean): unknown {
  switch (type) {
    case "number":
      return 0;
    case "file": {
      const file = { filename: "", mimeType: "", size: 0 };
      return multiple ? [file] : file;
    }
    default:
      return "";
  }
}

/** Static output schema for a form trigger derived from its configured elements. */
function buildFormPreviewOutput(parentData: Record<string, unknown>): Record<string, unknown> {
  const elements = Array.isArray(parentData.formElements)
    ? (parentData.formElements as FormElementLike[])
    : [];
  const fields: Record<string, unknown> = {};
  for (const el of elements) {
    const key = String(el.fieldName || el.id || "").trim();
    if (!key) continue;
    fields[key] = sampleValueForFieldType(el.fieldType, el.multipleFiles);
  }
  return {
    ...fields,
    fields,
    formTitle: String(parentData.formTitle ?? ""),
    submittedAt: 0,
    formUrl: "",
    executionMode: "test",
    triggerKind: "form",
  };
}

function getUpstreamOutputData(
  nodeId: string,
  nodes: Node[],
  edges: Edge[],
): Record<string, unknown> | null {
  const parent = getUpstreamNode(nodeId, nodes, edges);
  if (!parent) return null;

  const parentData = (parent.data ?? {}) as Record<string, unknown>;
  const output = parentData._output;
  const realOutput =
    output && typeof output === "object" && !Array.isArray(output)
      ? (output as Record<string, unknown>)
      : null;

  // Form triggers expose their configured fields as the downstream schema even
  // before execution; real run values (if any) are merged on top.
  if (isFormSubmissionNode(parent)) {
    const preview = buildFormPreviewOutput(parentData);
    if (!realOutput) return preview;
    const mergedFields = {
      ...(preview.fields as Record<string, unknown>),
      ...((realOutput.fields as Record<string, unknown> | undefined) ?? {}),
    };
    return { ...preview, ...realOutput, fields: mergedFields };
  }

  if (realOutput) return realOutput;

  if (parentData.body != null || parentData.headers != null) {
    return parentData;
  }

  return null;
}

function upstreamNodeTitle(node: Node, te: (key: string) => string): string {
  const data = (node.data ?? {}) as Record<string, unknown>;
  if (typeof data.label === "string" && data.label.trim()) return data.label;
  if (data.triggerKind === "webhook" || data.coreKind === "webhook") return te("core_kind_webhook");
  if (typeof data.triggerKind === "string") return String(data.triggerKind);
  if (typeof data.coreKind === "string") return String(data.coreKind);
  if (node.type === "trigger") return te("node_trigger");
  if (node.type === "agent") return te("node_agent");
  return node.type ?? "Node";
}

function TypeBadge({ type }: { type: string }) {
  const normalized = type === "array" ? "array" : type;
  if (normalized === "string") {
    return (
      <span className="inline-flex size-4 shrink-0 items-center justify-center rounded bg-emerald-500/15 text-[9px] font-bold text-emerald-600">
        <Type className="size-2.5" />
      </span>
    );
  }
  if (normalized === "number") {
    return (
      <span className="inline-flex size-4 shrink-0 items-center justify-center rounded bg-blue-500/15 text-[9px] font-bold text-blue-600">
        <Hash className="size-2.5" />
      </span>
    );
  }
  if (normalized === "boolean") {
    return (
      <span className="inline-flex size-4 shrink-0 items-center justify-center rounded bg-amber-500/15 text-amber-600">
        <ToggleLeft className="size-2.5" />
      </span>
    );
  }
  return (
    <span className="inline-flex size-4 shrink-0 items-center justify-center rounded bg-violet-500/15 text-violet-600">
      <Braces className="size-2.5" />
    </span>
  );
}

function DraggableTreeRow({
  name,
  type,
  expression,
  depth,
  hasChildren,
  open,
  onToggle,
  valuePreview,
  matchesSearch,
}: {
  name: string;
  type: string;
  expression: string;
  depth: number;
  hasChildren: boolean;
  open?: boolean;
  onToggle?: () => void;
  valuePreview?: string;
  matchesSearch?: boolean;
}) {
  const onDragStart = (e: DragEvent) => {
    setExpressionDragData(e.dataTransfer, expression);
  };

  if (!matchesSearch) return null;

  return (
    <div
      draggable
      onDragStart={onDragStart}
      className="hover:bg-muted/60 group flex cursor-grab items-center gap-1.5 rounded py-0.5 pr-1 active:cursor-grabbing"
      style={{ paddingLeft: `${depth * 14 + 4}px` }}
      title={expression}
    >
      {hasChildren ? (
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground shrink-0 rounded p-0.5"
          onClick={(e) => {
            e.stopPropagation();
            onToggle?.();
          }}
          aria-label={open ? "Collapse" : "Expand"}
        >
          {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        </button>
      ) : (
        <span className="inline-block w-4 shrink-0" />
      )}
      <TypeBadge type={type} />
      <span className="truncate font-mono text-[11px]">{name}</span>
      {valuePreview != null && valuePreview !== "" ? (
        <span className="text-muted-foreground ml-auto max-w-[45%] truncate font-mono text-[10px] opacity-0 transition-opacity group-hover:opacity-100">
          {valuePreview}
        </span>
      ) : null}
    </div>
  );
}

function UpstreamSchemaTree({
  data,
  rootLabel,
  search,
}: {
  data: Record<string, unknown>;
  rootLabel: string;
  search: string;
}) {
  const rows = useMemo(() => buildSchemaTreeRows(data), [data]);
  const q = search.trim().toLowerCase();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const filteredRows = useMemo(() => {
    if (!q) return rows;
    const matchingPaths = new Set(
      rows.filter((r) => r.path.toLowerCase().includes(q) || r.name.toLowerCase().includes(q)).map((r) => r.path),
    );
    return rows.filter((row) =>
      [...matchingPaths].some((path) => path === row.path || path.startsWith(`${row.path}.`) || row.path.startsWith(`${path}.`)),
    );
  }, [q, rows]);

  const rootOpen = collapsed.__root !== false;
  const toggle = (key: string) => setCollapsed((prev) => ({ ...prev, [key]: prev[key] === false }));

  const visibleRows = useMemo(() => {
    const base = q
      ? filteredRows
      : filteredRows.filter((row) => {
          if (!rootOpen) return false;
          const parts = row.path.split(".");
          for (let i = 1; i < parts.length; i++) {
            const parentPath = parts.slice(0, i).join(".");
            if (collapsed[parentPath] === false) return false;
          }
          return true;
        });
    return base;
  }, [collapsed, filteredRows, q, rootOpen]);

  const itemCount = rows.filter((r) => r.depth === 0).length || 1;

  return (
    <div className="space-y-0.5">
      <div
        className="hover:bg-muted/60 flex items-center gap-1.5 rounded py-1 pr-1"
        style={{ paddingLeft: "4px" }}
      >
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground shrink-0 rounded p-0.5"
          onClick={() => toggle("__root")}
        >
          {rootOpen ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        </button>
        <span className="text-[11px] font-semibold">{rootLabel}</span>
        <span className="text-muted-foreground text-[10px]">
          ({itemCount} {itemCount === 1 ? "item" : "items"})
        </span>
      </div>

      {visibleRows.map((row) => {
        const expression = jsonPathToExpression(row.path);
        const preview =
          row.value != null && typeof row.value !== "object" ? String(row.value) : undefined;
        return (
          <DraggableTreeRow
            key={row.path}
            name={row.name}
            type={row.type}
            expression={expression}
            depth={row.depth + 1}
            hasChildren={row.hasChildren}
            open={collapsed[row.path] !== false}
            onToggle={() => toggle(row.path)}
            valuePreview={preview}
            matchesSearch
          />
        );
      })}
    </div>
  );
}

function ContextSchemaTree({ nodes, search, depth = 0 }: { nodes: ContextTreeNode[]; search: string; depth?: number }) {
  const q = search.trim().toLowerCase();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const renderNode = (node: ContextTreeNode, nodeDepth: number): ReactNode => {
    const matches =
      !q ||
      node.name.toLowerCase().includes(q) ||
      node.expression.toLowerCase().includes(q) ||
      node.children?.some((c) => c.name.toLowerCase().includes(q));
    if (!matches) return null;

    const hasChildren = (node.children?.length ?? 0) > 0;
    const open = collapsed[node.id] !== false;

    return (
      <div key={node.id}>
        <DraggableTreeRow
          name={node.name}
          type={node.type}
          expression={node.expression}
          depth={nodeDepth}
          hasChildren={hasChildren}
          open={open}
          onToggle={() => setCollapsed((prev) => ({ ...prev, [node.id]: prev[node.id] === false }))}
          matchesSearch
        />
        {hasChildren && open
          ? node.children!.map((child) => renderNode(child, nodeDepth + 1))
          : null}
      </div>
    );
  };

  return <div className="space-y-0.5">{nodes.map((node) => renderNode(node, depth))}</div>;
}

type AgentUpstreamInputPanelProps = {
  nodeId: string;
  nodes: Node[];
  edges: Edge[];
  className?: string;
  onExecutePrevious?: () => void;
  executePreviousLabel?: string;
  emptyHint?: ReactNode;
};

export function AgentUpstreamInputPanel({
  nodeId,
  nodes,
  edges,
  className,
  onExecutePrevious,
  executePreviousLabel,
  emptyHint,
}: AgentUpstreamInputPanelProps) {
  const t = useTranslations("WorkflowNodeRegistry");
  const te = useTranslations("WorkflowEditorPage");
  const [viewMode, setViewMode] = useState<IoViewMode>("schema");
  const [search, setSearch] = useState("");

  const upstreamNode = useMemo(() => getUpstreamNode(nodeId, nodes, edges), [nodeId, nodes, edges]);
  const upstream = useMemo(
    () => getUpstreamOutputData(nodeId, nodes, edges),
    [nodeId, nodes, edges],
  );
  const upstreamTitle = upstreamNode ? upstreamNodeTitle(upstreamNode, te) : null;

  const tableRows = useMemo(
    () => (upstream ? flattenWebhookItemForTable(upstream as never) : []),
    [upstream],
  );
  const jsonText = useMemo(() => (upstream ? JSON.stringify(upstream, null, 2) : ""), [upstream]);

  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)}>
      <div className="space-y-2 border-b px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">{t("section_input")}</h3>
          <div className="flex gap-0.5 rounded-md border p-0.5">
            {(["schema", "table", "json"] as const).map((mode) => (
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

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {viewMode === "schema" ? (
          <div className="space-y-4">
            {upstream && upstreamTitle ? (
              <>
                <UpstreamSchemaTree data={upstream} rootLabel={upstreamTitle} search={search} />
                <p className="text-muted-foreground px-1 text-[10px] leading-relaxed">{t("agent_input_refresh_hint")}</p>
              </>
            ) : upstreamNode ? (
              <div className="space-y-2 px-1 py-4 text-center">
                <p className="text-muted-foreground text-xs">{t("no_upstream_output")}</p>
                {onExecutePrevious && executePreviousLabel ? (
                  <button
                    type="button"
                    className="text-[#ff6f00] text-xs font-medium hover:underline"
                    onClick={onExecutePrevious}
                  >
                    {executePreviousLabel}
                  </button>
                ) : null}
              </div>
            ) : (
              emptyHint ?? (
                <p className="text-muted-foreground px-1 py-6 text-center text-xs">{t("no_upstream_output")}</p>
              )
            )}

            <div className="border-t pt-3">
              <p className="text-muted-foreground mb-2 px-1 text-[10px] font-semibold tracking-wide uppercase">
                {t("field_variables_context")}
              </p>
              <ContextSchemaTree nodes={WORKFLOW_CONTEXT_TREE} search={search} />
            </div>
          </div>
        ) : viewMode === "table" ? (
          !upstream ? (
            <p className="text-muted-foreground text-center text-xs">{t("no_upstream_output")}</p>
          ) : (
            <table className="w-full text-left text-[11px]">
              <thead>
                <tr>
                  <th className="text-muted-foreground pb-2 pr-3 font-medium">{t("webhook_output_field")}</th>
                  <th className="text-muted-foreground pb-2 font-medium">{t("webhook_output_value")}</th>
                </tr>
              </thead>
              <tbody>
                {tableRows
                  .filter((row) => !search.trim() || row.path.toLowerCase().includes(search.trim().toLowerCase()))
                  .map((row) => (
                    <tr
                      key={row.path}
                      draggable
                      onDragStart={(e) => setExpressionDragData(e.dataTransfer, jsonPathToExpression(row.path))}
                      className="hover:bg-muted/60 cursor-grab border-t active:cursor-grabbing"
                    >
                      <td className="text-muted-foreground py-1 pr-3 font-mono">{row.path}</td>
                      <td className="max-w-[60%] truncate py-1 font-mono">{row.value}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )
        ) : !upstream ? (
          <p className="text-muted-foreground text-center text-xs">{t("no_upstream_output")}</p>
        ) : (
          <pre className="text-muted-foreground overflow-x-auto text-[11px] whitespace-pre-wrap">{jsonText}</pre>
        )}
      </div>
    </div>
  );
}

export { getUpstreamOutputData, getUpstreamNode, upstreamNodeTitle };
