import type { Edge, Node } from "@xyflow/react";

import type { ExecutionStepLog, WorkflowExecutionGraph, WorkflowExecutionRecord } from "../../../_lib/api";
import { normalizeWorkflowEdge } from "../../edges/workflow-edge-utils";
import { normalizeWorkflowNodes } from "../../layout/workflow-definition";

export type IoViewMode = "schema" | "json" | "table";

export type SchemaValueKind = "string" | "number" | "boolean" | "null" | "array" | "object";

export interface FlattenedField {
  path: string;
  key: string;
  value: unknown;
  kind: SchemaValueKind;
}

export function parseDefinitionJson(json: string | undefined): WorkflowExecutionGraph | undefined {
  if (!json) return undefined;
  try {
    const parsed = JSON.parse(json) as Partial<WorkflowExecutionGraph>;
    if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) return undefined;
    return {
      nodes: parsed.nodes,
      edges: parsed.edges,
      viewport: parsed.viewport,
    };
  } catch {
    return undefined;
  }
}

const KIND_KEYS = [
  "coreKind",
  "flowKind",
  "triggerKind",
  "toolKind",
  "transformKind",
  "memoryKind",
  "agentKind",
] as const;

function asRecord(data: unknown): Record<string, unknown> | undefined {
  if (!data || typeof data !== "object" || Array.isArray(data)) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) Reflect.set(out, k, v);
  return out;
}

export function toReactFlowGraph(raw: WorkflowExecutionGraph | undefined): { nodes: Node[]; edges: Edge[] } {
  if (!raw || raw.nodes.length === 0) return { nodes: [], edges: [] };
  const nodes = normalizeWorkflowNodes(
    raw.nodes.map((n) => ({
      id: n.id,
      type: n.type ?? "core",
      position: n.position ?? { x: 0, y: 0 },
      data: n.data ?? {},
      parentId: n.parentId,
      extent: n.extent,
      style: n.style,
      zIndex: n.zIndex,
    })),
  );
  const edges = raw.edges.map((e) =>
    normalizeWorkflowEdge({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle,
      targetHandle: e.targetHandle,
      type: e.type,
      data: asRecord(e.data),
    }),
  );
  return { nodes, edges };
}

export function nodeLabel(node: Node | undefined, fallback: string): string {
  const data = node?.data ?? {};
  if (typeof data.label === "string" && data.label.trim()) return data.label.trim();
  return fallback;
}

export function nodeKindLabel(node: Node | undefined, nodeType: string): string {
  const data = node?.data ?? {};
  for (const key of KIND_KEYS) {
    const kind = Reflect.get(data, key);
    if (typeof kind === "string" && kind.trim()) return kind.replace(/_/g, " ");
  }
  const channel = data.channel;
  if (node?.type === "human_review" && typeof channel === "string" && channel.trim()) {
    return channel.replace(/_/g, " ");
  }
  return nodeType.replace(/_/g, " ");
}

/** Legacy compact stub: `{ _truncated: true, byteLength }` with no real payload. */
export function ioTruncationStub(value: unknown): { byteLength: number } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const rec = value as { _truncated?: unknown; byteLength?: unknown };
  if (rec._truncated !== true || typeof rec.byteLength !== "number") return null;
  const keys = Object.keys(rec);
  if (keys.some((key) => key !== "_truncated" && key !== "byteLength" && key !== "preview")) return null;
  return { byteLength: rec.byteLength };
}

export function countItems(value: unknown): number {
  if (value == null) return 0;
  if (Array.isArray(value)) return value.length;
  if (typeof value === "object") {
    const rec = value as Record<string, unknown>;
    if (Array.isArray(rec.json)) return rec.json.length;
    if (Array.isArray(rec.items)) return rec.items.length;
    if (Array.isArray(rec.data)) return rec.data.length;
  }
  return 1;
}

export function durationMsOf(exec: Pick<WorkflowExecutionRecord, "startedAt" | "finishedAt">): number {
  if (exec.finishedAt && exec.startedAt) return Math.max(0, exec.finishedAt - exec.startedAt);
  if (exec.startedAt) return Math.max(0, Date.now() - exec.startedAt);
  return 0;
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 3 : 2).replace(/\.?0+$/, "")}s`;
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m < 60) return s ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const remM = m % 60;
  return remM ? `${h}h ${remM}m` : `${h}h`;
}

export function formatDataSize(value: unknown): string {
  try {
    const bytes = new TextEncoder().encode(JSON.stringify(value ?? null)).length;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 2 : 1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  } catch {
    return "—";
  }
}

export function schemaKind(value: unknown): SchemaValueKind {
  if (value == null) return "null";
  if (Array.isArray(value)) return "array";
  const t = typeof value;
  if (t === "string") return "string";
  if (t === "number") return "number";
  if (t === "boolean") return "boolean";
  return "object";
}

function fieldAt(prefix: string, value: unknown, kind: SchemaValueKind): FlattenedField[] {
  if (!prefix) return [];
  return [{ path: prefix, key: prefix.split(".").pop() ?? prefix, value, kind }];
}

export function flattenFields(value: unknown, prefix = ""): FlattenedField[] {
  if (value == null || typeof value !== "object") return fieldAt(prefix, value, schemaKind(value));
  if (Array.isArray(value)) {
    if (value.length === 0) return fieldAt(prefix, value, "array");
    return value.flatMap((item, i) => flattenFields(item, prefix ? `${prefix}[${i}]` : `[${i}]`));
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) return fieldAt(prefix, value, "object");
  return entries.flatMap(([k, v]) => {
    const path = prefix ? `${prefix}.${k}` : k;
    return v != null && typeof v === "object"
      ? flattenFields(v, path)
      : [{ path, key: k, value: v, kind: schemaKind(v) }];
  });
}

export function previewValue(value: unknown, max = 140): string {
  if (value == null) return "null";
  if (typeof value === "string") return value.length > max ? `${value.slice(0, max)}…` : value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    const json = JSON.stringify(value);
    return json.length > max ? `${json.slice(0, max)}…` : json;
  } catch {
    return String(value);
  }
}

export function stepsByNodeId(steps: ExecutionStepLog[]): Map<string, ExecutionStepLog> {
  const map = new Map<string, ExecutionStepLog>();
  for (const step of steps) map.set(step.nodeId, step);
  return map;
}

export function executionExportPayload(selected: WorkflowExecutionRecord): string {
  return JSON.stringify(
    {
      executionKey: selected.executionKey,
      status: selected.status,
      startedAt: selected.startedAt,
      finishedAt: selected.finishedAt,
      error: selected.error,
      output: selected.output,
      steps: selected.steps,
      definition: selected.definition,
    },
    null,
    2,
  );
}
