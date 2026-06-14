"use client";

import { useCallback, useEffect } from "react";

import type { Node } from "@xyflow/react";
import { ArrowRightFromLine, Database } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import {
  buildVectorizeNodeScope,
  resolveVectorizeCollection,
  VECTORIZE_INDEX_OPTIONS,
} from "../../layout/vectorize-node-data";
import type { NodeConfigPanelProps } from "../../nodes/types";

const METRIC_OPTIONS = [
  { value: "cosine", labelKey: "metric_cosine" },
  { value: "euclidean", labelKey: "metric_euclidean" },
  { value: "dot-product", labelKey: "metric_dot_product" },
] as const;

function ReadOnlyField({
  label,
  description,
  value,
}: {
  label: string;
  description?: string;
  value: string;
}) {
  return (
    <div className="bg-muted/50 rounded-md border px-3 py-2 text-xs">
      <p className="font-medium">{label}</p>
      {description ? <p className="text-muted-foreground mt-1">{description}</p> : null}
      <p className="text-muted-foreground mt-2 font-mono text-[11px] break-all">{value || "—"}</p>
    </div>
  );
}

export type VectorizeNodeConfigPanelProps = NodeConfigPanelProps;

export function isVectorizeMemoryNode(node: Node): boolean {
  if (node.type !== "memory_node") return false;
  const data = (node.data ?? {}) as Record<string, unknown>;
  return String(data.memoryKind ?? "vectorize") === "vectorize";
}

export function VectorizeNodeConfigPanel({
  node,
  workflowId,
  onClose,
  onPatchData,
}: VectorizeNodeConfigPanelProps) {
  const t = useTranslations("WorkflowNodeRegistry");
  const te = useTranslations("WorkflowEditorPage");

  const nodeData = (node.data ?? {}) as Record<string, unknown>;
  const collection = resolveVectorizeCollection(
    typeof nodeData.collection === "string" ? nodeData.collection : undefined,
  );
  const namespace = String(nodeData.namespace ?? buildVectorizeNodeScope(workflowId, node.id));
  const dimensions = Number(nodeData.dimensions ?? 768);
  const metric = String(nodeData.metric ?? "cosine");
  const label = String(nodeData.label ?? te("node_vectorize"));

  const patch = useCallback(
    (fields: Record<string, unknown>) => onPatchData(node.id, fields),
    [node.id, onPatchData],
  );

  useEffect(() => {
    const expectedNamespace = buildVectorizeNodeScope(workflowId, node.id);
    const expectedCollection = resolveVectorizeCollection(
      typeof nodeData.collection === "string" ? nodeData.collection : undefined,
    );
    const updates: Record<string, unknown> = {};
    if (nodeData.namespace !== expectedNamespace) updates.namespace = expectedNamespace;
    if (nodeData.collection !== expectedCollection) updates.collection = expectedCollection;
    if (Object.keys(updates).length) patch(updates);
  }, [node.id, nodeData.collection, nodeData.namespace, patch, workflowId]);

  const selectedIndex = VECTORIZE_INDEX_OPTIONS.find((opt) => opt.binding === collection) ?? VECTORIZE_INDEX_OPTIONS[0];

  return (
    <div className="bg-background absolute inset-0 z-50 flex flex-col">
      <header className="flex items-center justify-between border-b px-4 py-2.5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex size-7 items-center justify-center rounded-md bg-emerald-500/10">
              <Database className="size-4 text-emerald-600" />
            </div>
            <h2 className="text-sm font-semibold">{label}</h2>
          </div>
          <p className="text-muted-foreground mt-1 pl-9 text-xs">{te("node_vectorize_desc")}</p>
        </div>
        <Button type="button" variant="ghost" size="icon" className="size-8" onClick={onClose} aria-label={t("close")}>
          <span className="sr-only">{t("close")}</span>
          <span className="text-lg leading-none">&times;</span>
        </Button>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-2">
        <div className="flex min-h-0 flex-col border-r">
          <Tabs defaultValue="parameters" className="flex min-h-0 flex-1 flex-col">
            <div className="border-b px-3 py-2">
              <TabsList className="h-8 bg-transparent p-0">
                <TabsTrigger
                  value="parameters"
                  className="data-[state=active]:border-[#ff6f00] data-[state=active]:text-[#ff6f00] rounded-none border-b-2 border-transparent px-3 text-xs shadow-none data-[state=active]:shadow-none"
                >
                  {t("section_parameters")}
                </TabsTrigger>
                <TabsTrigger
                  value="settings"
                  className="data-[state=active]:border-[#ff6f00] data-[state=active]:text-[#ff6f00] rounded-none border-b-2 border-transparent px-3 text-xs shadow-none data-[state=active]:shadow-none"
                >
                  {t("section_settings")}
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="parameters" className="mt-0 min-h-0 flex-1 overflow-y-auto p-4">
              <div className="space-y-4">
                {VECTORIZE_INDEX_OPTIONS.length === 1 ? (
                  <ReadOnlyField
                    label={t("field_vectorize_index")}
                    description={t("field_vectorize_index_desc")}
                    value={`${selectedIndex.indexName} (${selectedIndex.binding})`}
                  />
                ) : (
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t("field_vectorize_index")}</Label>
                    <p className="text-muted-foreground text-xs">{t("field_vectorize_index_desc")}</p>
                    <Select
                      value={collection}
                      onValueChange={(v) => patch({ collection: resolveVectorizeCollection(v) })}
                    >
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {VECTORIZE_INDEX_OPTIONS.map((opt) => (
                          <SelectItem key={opt.binding} value={opt.binding}>
                            {opt.indexName} ({opt.binding})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <ReadOnlyField
                  label={t("field_vectorize_scope")}
                  description={t("field_vectorize_scope_desc")}
                  value={namespace}
                />

                <div className="space-y-1.5">
                  <Label className="text-xs">{t("field_dimensions")}</Label>
                  <Input
                    type="number"
                    value={String(dimensions)}
                    className="h-9 text-xs"
                    onChange={(e) => patch({ dimensions: Number(e.target.value) })}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">{t("field_metric")}</Label>
                  <Select value={metric} onValueChange={(v) => patch({ metric: v })}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {METRIC_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {t(opt.labelKey)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">{t("field_label")}</Label>
                  <Input
                    value={label}
                    className="h-9 text-xs"
                    onChange={(e) => patch({ label: e.target.value })}
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="settings" className="mt-0 p-4">
              <p className="text-muted-foreground text-xs">{t("settings_placeholder")}</p>
            </TabsContent>
          </Tabs>
        </div>

        <div className="flex min-h-0 flex-col">
          <div className="border-b px-3 py-2">
            <h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              {t("section_output")}
            </h3>
          </div>
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
            <ArrowRightFromLine className="text-muted-foreground/40 size-10 stroke-[1.5]" />
            <p className="text-muted-foreground max-w-xs text-sm">{t("vectorize_no_output")}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
