"use client";

import { useMemo, useState, type DragEvent, type ReactNode } from "react";

import type { Edge, Node } from "@xyflow/react";
import {
  Braces,
  ChevronDown,
  ChevronRight,
  Hash,
  MousePointerClick,
  Search,
  ToggleLeft,
  Type,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { buildSchemaTreeRows, flattenWebhookItemForTable, primaryOutputPaths, primaryPathsPresentInData, isPrimaryOutputPath, isPrimaryOutputAncestor } from "@aiagents-hub/workflow-nodes";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { isDataFlowEdge } from "../../edges/workflow-connection-utils";
import { hasPinnedOutput } from "../../hooks/upstream-execute-input";
import {
  contextPathToExpression,
  copyExpressionToClipboard,
  insertExpressionIntoFocusedField,
  jsonPathToExpression,
  jsonPathsToOrExpression,
  setExpressionDragData,
} from "./workflow-expression-dnd";

type UpstreamSource = {
  node: Node;
  title: string;
  data: Record<string, unknown>;
  sourceHandle?: string | null;
  primaryPaths: string[];
  executed: boolean;
};

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

function getUpstreamDataFlowEdges(nodeId: string, edges: Edge[]): Edge[] {
  return edges.filter((e) => e.target === nodeId && isDataFlowEdge(e));
}

function isLoopOverItemsNode(node: Node): boolean {
  const d = (node.data ?? {}) as Record<string, unknown>;
  return node.type === "flow" && String(d.flowKind ?? "") === "loop_over_items";
}

/** Schema hints before Loop / done branch has been executed. */
function buildLoopPreviewOutput(
  _parent: Node,
  incomingEdge: Edge | undefined,
): Record<string, unknown> {
  const fromDone = incomingEdge?.sourceHandle === "done";
  if (fromDone) {
    return {
      loopCompleted: true,
      tableCount: 0,
      count: 0,
      totalBatches: 0,
      items: [],
      tables: [],
      schemaName: "",
      connection: { type: "oracle" },
    };
  }
  return {
    loopCompleted: false,
    tableName: "",
    schemaName: "",
    batchIndex: 0,
    batchSize: 1,
    items: [{ tableName: "", schemaName: "" }],
  };
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

function isChatTriggerNode(node: Node): boolean {
  const d = (node.data ?? {}) as Record<string, unknown>;
  return d.triggerKind === "chat";
}

function buildChatPreviewOutput(): Record<string, unknown> {
  return {
    triggerKind: "chat",
    sessionId: "",
    action: "sendMessage",
    chatInput: "",
    query: "",
    chatUrl: "",
    executionMode: "test",
  };
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

function isWebhookTriggerNode(node: Node): boolean {
  const d = (node.data ?? {}) as Record<string, unknown>;
  return d.triggerKind === "webhook" || d.coreKind === "webhook" || node.type === "webhook";
}

function buildWebhookPreviewOutput(): Record<string, unknown> {
  return {
    headers: {},
    params: {},
    query: {},
    body: { question: "" },
    webhookUrl: "",
    executionMode: "test",
    triggerKind: "webhook",
  };
}

function previewOutputForParent(parent: Node, incomingEdge: Edge | undefined): Record<string, unknown> | null {
  const parentData = (parent.data ?? {}) as Record<string, unknown>;
  const output = parentData._output;
  const realOutput =
    output && typeof output === "object" && !Array.isArray(output)
      ? (output as Record<string, unknown>)
      : null;

  if (isFormSubmissionNode(parent)) {
    const preview = buildFormPreviewOutput(parentData);
    if (!realOutput) return preview;
    const mergedFields = {
      ...(preview.fields as Record<string, unknown>),
      ...((realOutput.fields as Record<string, unknown> | undefined) ?? {}),
    };
    return { ...preview, ...realOutput, fields: mergedFields };
  }

  if (isChatTriggerNode(parent)) {
    const preview = buildChatPreviewOutput();
    return realOutput ? { ...preview, ...realOutput } : preview;
  }

  if (isWebhookTriggerNode(parent)) {
    const preview = buildWebhookPreviewOutput();
    return realOutput ? { ...preview, ...realOutput } : preview;
  }

  if (realOutput) return realOutput;

  if (isLoopOverItemsNode(parent)) {
    return buildLoopPreviewOutput(parent, incomingEdge);
  }

  if (parent.type === "tool_node" && String(parentData.toolKind ?? "") === "get-db-info") {
    return {
      items: [{ tableName: "", schemaName: "" }],
      tables: [],
      tableCount: 0,
      count: 0,
      schemaName: "",
      connection: { type: "oracle" },
      user: "",
      password: "",
      connectString: "",
    };
  }

  if (parent.type === "tool_node" && String(parentData.toolKind ?? "") === "get-rag") {
    return {
      body: { question: "" },
      chatInput: "",
      query: "",
      snippets: [],
      ragText: "",
      count: 0,
    };
  }

  if (parent.type === "agent") {
    return { text: "", sql: "", query: "", snippets: [], count: 0 };
  }

  if (parentData.body != null || parentData.headers != null) {
    return parentData;
  }

  return null;
}

function getUpstreamSources(
  nodeId: string,
  nodes: Node[],
  edges: Edge[],
  titleFor: (node: Node) => string,
): UpstreamSource[] {
  const incoming = getUpstreamDataFlowEdges(nodeId, edges);
  const sources: UpstreamSource[] = [];
  for (const edge of incoming) {
    const parent = nodes.find((n) => n.id === edge.source);
    if (!parent) continue;
    const data = previewOutputForParent(parent, edge);
    if (!data) continue;
    const primaryPaths = primaryOutputPaths(parent, { sourceHandle: edge.sourceHandle });
    sources.push({
      node: parent,
      title: titleFor(parent),
      data,
      sourceHandle: edge.sourceHandle,
      primaryPaths,
      executed: hasPinnedOutput(parent),
    });
  }
  return sources;
}

function mergeUpstreamData(sources: UpstreamSource[]): Record<string, unknown> | null {
  if (!sources.length) return null;
  const merged: Record<string, unknown> = {};
  for (const source of sources) {
    Object.assign(merged, source.data);
  }
  return merged;
}

function getUpstreamOutputData(
  nodeId: string,
  nodes: Node[],
  edges: Edge[],
): Record<string, unknown> | null {
  return mergeUpstreamData(getUpstreamSources(nodeId, nodes, edges, () => ""));
}

function getUpstreamNode(nodeId: string, nodes: Node[], edges: Edge[]): Node | null {
  const edge = getUpstreamDataFlowEdges(nodeId, edges)[0];
  if (!edge) return null;
  return nodes.find((n) => n.id === edge.source) ?? null;
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
  recommended,
  recommendedAncestor,
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
  recommended?: boolean;
  recommendedAncestor?: boolean;
}) {
  const t = useTranslations("WorkflowNodeRegistry");

  const onDragStart = (e: DragEvent) => {
    setExpressionDragData(e.dataTransfer, expression);
  };

  const onActivate = async () => {
    if (insertExpressionIntoFocusedField(expression)) {
      toast.success(t("agent_input_expression_inserted"));
      return;
    }
    const copied = await copyExpressionToClipboard(expression);
    toast.success(copied ? t("agent_input_expression_copied") : expression);
  };

  if (!matchesSearch) return null;

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("button")) return;
        void onActivate();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          void onActivate();
        }
      }}
      role="button"
      tabIndex={0}
      className={cn(
        "group flex cursor-grab items-center gap-1.5 rounded py-0.5 pr-1 active:cursor-grabbing",
        recommended
          ? "bg-orange-500/10 ring-1 ring-inset ring-[#ff6f00]/50 hover:bg-orange-500/15"
          : recommendedAncestor
            ? "bg-orange-500/5 hover:bg-orange-500/10"
            : "hover:bg-muted/60",
      )}
      style={{ paddingLeft: `${depth * 14 + 4}px` }}
      title={recommended ? t("io_drag_field_hint") : expression}
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
      <span className={cn("truncate font-mono text-[11px]", recommended && "font-semibold text-[#c2410c]")}>
        {name}
      </span>
      {recommended ? (
        <span className="ml-0.5 inline-flex shrink-0 items-center gap-0.5 rounded-full bg-[#ff6f00] px-1.5 py-px text-[9px] font-semibold tracking-wide text-white uppercase">
          <MousePointerClick className="size-2.5" />
          {t("io_drag_badge")}
        </span>
      ) : null}
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
  primaryPaths,
  executed,
}: {
  data: Record<string, unknown>;
  rootLabel: string;
  search: string;
  primaryPaths: string[];
  executed: boolean;
}) {
  const t = useTranslations("WorkflowNodeRegistry");
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
  const recommendedCount = primaryPathsPresentInData(data, primaryPaths).length;

  return (
    <div className={cn("space-y-0.5", !executed && "opacity-70")}>
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
        <span
          className={cn(
            "shrink-0 rounded-full px-1.5 py-px text-[9px] font-semibold tracking-wide uppercase",
            executed ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : "bg-muted text-muted-foreground",
          )}
        >
          {executed ? t("io_source_last_run") : t("io_source_schema")}
        </span>
        <span className="text-muted-foreground text-[10px]">
          ({t("io_schema_fields", { count: itemCount })})
        </span>
        {recommendedCount > 0 ? (
          <span className="ml-auto inline-flex items-center gap-0.5 rounded-full bg-[#ff6f00]/15 px-1.5 py-px text-[9px] font-semibold text-[#c2410c]">
            {t("io_drag_count", { count: recommendedCount })}
          </span>
        ) : null}
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
            recommended={isPrimaryOutputPath(row.path, primaryPaths)}
            recommendedAncestor={isPrimaryOutputAncestor(row.path, primaryPaths)}
          />
        );
      })}
    </div>
  );
}

function DragTheseChips({
  chips,
}: {
  chips: { path: string; sourceTitle: string }[];
}) {
  const t = useTranslations("WorkflowNodeRegistry");
  if (!chips.length) return null;

  const grouped = chips.reduce<Record<string, string[]>>((acc, chip) => {
    acc[chip.sourceTitle] = acc[chip.sourceTitle] ?? [];
    acc[chip.sourceTitle].push(chip.path);
    return acc;
  }, {});
  const combined = jsonPathsToOrExpression(chips.map((chip) => chip.path));
  const showBoth = chips.length > 1;

  const applyCombined = () => {
    if (insertExpressionIntoFocusedField(combined)) {
      toast.success(t("agent_input_expression_inserted"));
      return;
    }
    void copyExpressionToClipboard(combined).then((copied) => {
      toast.success(copied ? t("agent_input_expression_copied") : combined);
    });
  };

  return (
    <div className="border-border/70 mb-3 space-y-2 rounded-md border border-[#ff6f00]/30 bg-orange-500/5 px-2 py-2">
      <p className="flex items-center gap-1 text-[10px] font-semibold tracking-wide text-[#c2410c] uppercase">
        <MousePointerClick className="size-3" />
        {t("io_drag_these")}
      </p>
      {showBoth ? <p className="text-[10px] leading-snug text-[#c2410c]/80">{t("io_map_both_hint")}</p> : null}
      <div className="space-y-2">
        {Object.entries(grouped).map(([title, paths]) => (
          <div key={title} className="space-y-1">
            <p className="text-muted-foreground text-[10px] font-medium">{title}</p>
            <div className="flex flex-wrap gap-1">
              {paths.map((path) => {
                const expression = jsonPathToExpression(path);
                return (
                  <button
                    key={path}
                    type="button"
                    draggable
                    onDragStart={(e) => setExpressionDragData(e.dataTransfer, expression)}
                    onClick={() => {
                      if (insertExpressionIntoFocusedField(expression)) {
                        toast.success(t("agent_input_expression_inserted"));
                        return;
                      }
                      void copyExpressionToClipboard(expression).then((copied) => {
                        toast.success(copied ? t("agent_input_expression_copied") : expression);
                      });
                    }}
                    className="inline-flex cursor-grab items-center gap-1 rounded-full border border-[#ff6f00]/40 bg-background px-2 py-0.5 font-mono text-[10px] font-medium text-[#c2410c] hover:bg-orange-500/10 active:cursor-grabbing"
                    title={expression}
                  >
                    {path}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {showBoth ? (
        <button
          type="button"
          draggable
          onDragStart={(e) => setExpressionDragData(e.dataTransfer, combined)}
          onClick={applyCombined}
          className="w-full rounded-md border border-[#ff6f00]/50 bg-[#ff6f00] px-2 py-1 text-[11px] font-semibold text-white hover:bg-[#e66300]"
        >
          {t("io_map_both")}
        </button>
      ) : null}
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

  const upstreamSources = useMemo(
    () => getUpstreamSources(nodeId, nodes, edges, (n) => upstreamNodeTitle(n, te)),
    [nodeId, nodes, edges, te],
  );
  const hasParentEdge = useMemo(
    () => getUpstreamDataFlowEdges(nodeId, edges).length > 0,
    [nodeId, edges],
  );
  const upstream = useMemo(() => mergeUpstreamData(upstreamSources), [upstreamSources]);

  const tableRows = useMemo(
    () => (upstream ? flattenWebhookItemForTable(upstream as never) : []),
    [upstream],
  );
  const jsonText = useMemo(() => (upstream ? JSON.stringify(upstream, null, 2) : ""), [upstream]);
  const allPrimaryPaths = useMemo(() => {
    const seen = new Set<string>();
    const paths: string[] = [];
    for (const source of upstreamSources) {
      for (const path of source.primaryPaths) {
        if (seen.has(path)) continue;
        seen.add(path);
        paths.push(path);
      }
    }
    return paths;
  }, [upstreamSources]);
  const dragChips = useMemo(() => {
    const seen = new Set<string>();
    const chips: { path: string; sourceTitle: string }[] = [];
    for (const source of upstreamSources) {
      for (const path of primaryPathsPresentInData(source.data, source.primaryPaths)) {
        if (seen.has(path)) continue;
        seen.add(path);
        chips.push({ path, sourceTitle: source.title });
      }
    }
    return chips;
  }, [upstreamSources]);

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
            {upstreamSources.length ? (
              <>
                <DragTheseChips chips={dragChips} />
                {upstreamSources.map((source) => (
                  <UpstreamSchemaTree
                    key={`${source.node.id}:${source.sourceHandle ?? ""}`}
                    data={source.data}
                    rootLabel={source.title}
                    search={search}
                    primaryPaths={source.primaryPaths}
                    executed={source.executed}
                  />
                ))}
                {upstreamSources.filter((source) => source.executed).length >= 2 ? (
                  <p className="text-muted-foreground px-1 text-[10px] leading-relaxed">{t("io_stale_runs_hint")}</p>
                ) : null}
                <p className="text-muted-foreground px-1 text-[10px] leading-relaxed">{t("agent_input_map_hint")}</p>
                <p className="text-muted-foreground px-1 text-[10px] leading-relaxed">{t("agent_input_refresh_hint")}</p>
              </>
            ) : hasParentEdge ? (
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
            <>
              <DragTheseChips chips={dragChips} />
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
                    .map((row) => {
                      const recommended = isPrimaryOutputPath(row.path, allPrimaryPaths);
                      return (
                        <tr
                          key={row.path}
                          draggable
                          onDragStart={(e) => setExpressionDragData(e.dataTransfer, jsonPathToExpression(row.path))}
                          onClick={() => {
                            const expression = jsonPathToExpression(row.path);
                            if (insertExpressionIntoFocusedField(expression)) {
                              toast.success(t("agent_input_expression_inserted"));
                              return;
                            }
                            void copyExpressionToClipboard(expression).then((copied) => {
                              toast.success(copied ? t("agent_input_expression_copied") : expression);
                            });
                          }}
                          className={cn(
                            "cursor-grab border-t active:cursor-grabbing",
                            recommended
                              ? "bg-orange-500/10 ring-1 ring-inset ring-[#ff6f00]/40 hover:bg-orange-500/15"
                              : "hover:bg-muted/60",
                          )}
                          title={recommended ? t("io_drag_field_hint") : jsonPathToExpression(row.path)}
                        >
                          <td
                            className={cn(
                              "py-1 pr-3 font-mono",
                              recommended ? "font-semibold text-[#c2410c]" : "text-muted-foreground",
                            )}
                          >
                            <span className="inline-flex items-center gap-1">
                              {row.path}
                              {recommended ? (
                                <span className="inline-flex items-center rounded-full bg-[#ff6f00] px-1.5 py-px text-[9px] font-semibold tracking-wide text-white uppercase">
                                  {t("io_drag_badge")}
                                </span>
                              ) : null}
                            </span>
                          </td>
                          <td className="max-w-[60%] truncate py-1 font-mono">{row.value}</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </>
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
