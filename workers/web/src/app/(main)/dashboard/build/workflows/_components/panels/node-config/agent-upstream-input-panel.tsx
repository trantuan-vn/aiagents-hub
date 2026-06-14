"use client";

import { useMemo, useState } from "react";

import type { Edge, Node } from "@xyflow/react";
import { useTranslations } from "next-intl";

import { buildSchemaTreeRows, flattenWebhookItemForTable } from "@aiagents-hub/workflow-nodes";
import { cn } from "@/lib/utils";

type IoViewMode = "schema" | "table" | "json";

function isDataFlowEdge(edge: Edge): boolean {
  const targetHandle = edge.targetHandle ?? "in";
  if (targetHandle !== "in") return false;
  const sourceHandle = edge.sourceHandle ?? "out";
  return sourceHandle === "out" || sourceHandle.startsWith("out_") || sourceHandle === "true" || sourceHandle === "false";
}

function getUpstreamOutputData(
  nodeId: string,
  nodes: Node[],
  edges: Edge[],
): Record<string, unknown> | null {
  const parentEdge = edges.find((e) => e.target === nodeId && isDataFlowEdge(e));
  if (!parentEdge) return null;

  const parent = nodes.find((n) => n.id === parentEdge.source);
  if (!parent) return null;

  const parentData = (parent.data ?? {}) as Record<string, unknown>;
  const output = parentData._output;
  if (output && typeof output === "object" && !Array.isArray(output)) {
    return output as Record<string, unknown>;
  }

  if (parentData.body != null || parentData.headers != null) {
    return parentData;
  }

  return null;
}

type AgentUpstreamInputPanelProps = {
  nodeId: string;
  nodes: Node[];
  edges: Edge[];
  className?: string;
};

export function AgentUpstreamInputPanel({
  nodeId,
  nodes,
  edges,
  className,
}: AgentUpstreamInputPanelProps) {
  const t = useTranslations("WorkflowNodeRegistry");
  const [viewMode, setViewMode] = useState<IoViewMode>("schema");

  const upstream = useMemo(
    () => getUpstreamOutputData(nodeId, nodes, edges),
    [nodeId, nodes, edges],
  );

  const schemaRows = useMemo(
    () => (upstream ? buildSchemaTreeRows(upstream) : []),
    [upstream],
  );
  const tableRows = useMemo(
    () => (upstream ? flattenWebhookItemForTable(upstream as never) : []),
    [upstream],
  );
  const jsonText = useMemo(() => (upstream ? JSON.stringify(upstream, null, 2) : ""), [upstream]);

  return (
    <div className={cn("flex h-full min-h-0 flex-col border-r", className)}>
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div>
          <h3 className="text-xs font-semibold tracking-wide uppercase">{t("section_input")}</h3>
          <p className="text-muted-foreground text-[10px]">{t("field_upstream_output_desc")}</p>
        </div>
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

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {!upstream ? (
          <p className="text-muted-foreground text-center text-xs">{t("no_upstream_output")}</p>
        ) : viewMode === "json" ? (
          <pre className="text-muted-foreground overflow-x-auto text-[11px] whitespace-pre-wrap">{jsonText}</pre>
        ) : viewMode === "table" ? (
          <table className="w-full text-left text-[11px]">
            <thead>
              <tr>
                <th className="text-muted-foreground pb-2 pr-3 font-medium">{t("webhook_output_field")}</th>
                <th className="text-muted-foreground pb-2 font-medium">{t("webhook_output_value")}</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((row) => (
                <tr key={row.path} className="border-t">
                  <td className="text-muted-foreground py-1 pr-3 font-mono">{row.path}</td>
                  <td className="max-w-[60%] truncate py-1 font-mono">{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <ul className="space-y-1 text-[11px]">
            {schemaRows.map((row) => (
              <li
                key={row.path}
                className="flex items-center gap-2"
                style={{ paddingLeft: `${row.depth * 12}px` }}
              >
                <span className="font-mono">{row.name}</span>
                <span className="text-muted-foreground">{row.type}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export { getUpstreamOutputData };
