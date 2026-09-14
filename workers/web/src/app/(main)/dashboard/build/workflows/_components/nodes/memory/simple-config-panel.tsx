"use client";

import { useCallback } from "react";

import type { Node } from "@xyflow/react";
import { isSimpleMemoryKind } from "@aiagents-hub/workflow-nodes";
import { ArrowLeftFromLine, Database } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { AgentUpstreamInputPanel } from "../../panels/node-config/agent-upstream-input-panel";
import { ExpressionDropField } from "../../panels/node-config/expression-drop-field";
import { NodeOutputPanel } from "../../panels/node-config/node-output-panel";
import type { NodeConfigPanelProps } from "../types";

function clampWindow(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 5;
  return Math.min(99, Math.max(1, Math.floor(n)));
}

export type SimpleMemoryNodeConfigPanelProps = NodeConfigPanelProps;

export function isSimpleMemoryNode(node: Node): boolean {
  if (node.type !== "memory_node") return false;
  const data = (node.data ?? {}) as Record<string, unknown>;
  return isSimpleMemoryKind(data.memoryKind);
}

export function SimpleMemoryNodeConfigPanel({
  node,
  nodes = [],
  edges = [],
  onClose,
  onPatchData,
}: SimpleMemoryNodeConfigPanelProps) {
  const t = useTranslations("WorkflowNodeRegistry");
  const te = useTranslations("WorkflowEditorPage");

  const nodeData = (node.data ?? {}) as Record<string, unknown>;
  const label = String(nodeData.label ?? te("memory_simple"));
  const sessionIdSource = String(nodeData.sessionIdSource ?? "from_chat_trigger");
  const sessionKey = String(nodeData.sessionKey ?? "{{ $json.sessionId }}");
  const contextWindowLength = clampWindow(nodeData.contextWindowLength);

  const patch = useCallback(
    (fields: Record<string, unknown>) => onPatchData(node.id, fields),
    [node.id, onPatchData],
  );

  const sessionKeyLabel =
    sessionIdSource === "define_below" ? t("field_session_key_define") : t("field_session_key_from_node");

  return (
    <div className="bg-background absolute inset-0 z-50 flex flex-col">
      <header className="flex items-center justify-between border-b px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <div className="flex size-7 items-center justify-center rounded-md bg-emerald-500/10">
            <Database className="size-4 text-emerald-600" />
          </div>
          <h2 className="text-sm font-semibold">{label}</h2>
        </div>
        <Button type="button" variant="ghost" size="icon" className="size-8" onClick={onClose} aria-label={t("close")}>
          <span className="sr-only">{t("close")}</span>
          <span className="text-lg leading-none">&times;</span>
        </Button>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-3">
        <div className="flex min-h-0 flex-col border-r">
          <AgentUpstreamInputPanel
            nodeId={node.id}
            nodes={nodes}
            edges={edges}
            className="border-r-0"
            emptyHint={
              <div className="flex flex-col items-center gap-3 px-2 py-8 text-center">
                <ArrowLeftFromLine className="text-muted-foreground/40 size-10 stroke-[1.5]" />
                <p className="text-muted-foreground text-sm">{t("simple_memory_no_input")}</p>
              </div>
            }
          />
        </div>

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
                <div className="rounded-md border border-amber-300/70 bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
                  {t("simple_memory_local_warning")}
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">{t("field_session_id")}</Label>
                  <Select
                    value={sessionIdSource}
                    onValueChange={(v) => patch({ sessionIdSource: v })}
                  >
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="from_chat_trigger">{t("opt_session_from_chat_trigger")}</SelectItem>
                      <SelectItem value="define_below">{t("opt_session_define_below")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">{sessionKeyLabel}</Label>
                  <ExpressionDropField
                    value={sessionKey}
                    onChange={(v) => patch({ sessionKey: v })}
                    placeholder="{{ $json.sessionId }}"
                  />
                </div>

                <div className="rounded-md border border-amber-300/70 bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
                  {t("simple_memory_session_scope_warning")}
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">{t("field_context_window_length")}</Label>
                  <Input
                    type="number"
                    min={1}
                    max={99}
                    value={contextWindowLength}
                    className="h-9 text-xs"
                    onChange={(e) => patch({ contextWindowLength: clampWindow(e.target.value) })}
                  />
                  <p className="text-muted-foreground text-xs">{t("field_context_window_length_desc")}</p>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="settings" className="mt-0 p-4">
              <div className="space-y-1.5">
                <Label className="text-xs">{t("field_label")}</Label>
                <Input
                  value={label}
                  className="h-9 text-xs"
                  onChange={(e) => patch({ label: e.target.value })}
                />
              </div>
              <p className="text-muted-foreground mt-4 text-xs">{t("settings_placeholder")}</p>
            </TabsContent>
          </Tabs>
        </div>

        <NodeOutputPanel emptyLabel={t("simple_memory_no_output")} />
      </div>
    </div>
  );
}
