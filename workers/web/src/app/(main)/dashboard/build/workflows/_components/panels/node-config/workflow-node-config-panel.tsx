"use client";

import { useCallback, useMemo } from "react";

import type { Edge, Node } from "@xyflow/react";
import { Check, Database, Server, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { hasN8nNodeDescription, getN8nNodeDescription } from "@/lib/n8n-workflow";
import { resolveNodeDefinition } from "@/lib/workflow-node-registry";
import type { N8nNodeParameters } from "@/lib/n8n-workflow/types";

import { resolveInputNodeId, edgeUsesHandle, isRagToolNode } from "../../edges/workflow-connection-utils";
import { useWorkflowNodeRegistry } from "../../hooks/use-workflow-node-registry";
import { N8nParameterRenderer } from "./n8n-parameter-renderer";
import { NodeConfigFieldRenderer } from "./node-config-field-renderer";
import { AgentUpstreamInputPanel } from "./agent-upstream-input-panel";
import { NodeMockOutputSection } from "./node-mock-output-section";
import { resolveUIPlugin } from "../../nodes";
import { WorkflowExecuteStepButton } from "../../node-ui/workflow-execute-step-button";
import { warnLegacyRuntimeType } from "../../../_lib/runtime-type";

type WorkflowNodeConfigPanelProps = {
  node: Node | null;
  nodes?: Node[];
  edges?: Edge[];
  workflowId?: number;
  ownerId?: string;
  listeningNodeId?: string | null;
  liveOutput?: unknown;
  onClose: () => void;
  onPatchData: (nodeId: string, patch: Record<string, unknown>) => void;
  onExecuteStep?: (nodeId: string) => void;
  onStopListen?: () => void;
};

function resourceLabel(node: Node | undefined, fallback: string): string {
  if (!node) return fallback;
  const data = (node.data ?? {}) as Record<string, unknown>;
  return String(data.label ?? data.endpoint ?? data.serviceEndpoint ?? fallback);
}

function RagResourceChips({
  nodeId,
  nodes,
  edges,
}: {
  nodeId: string;
  nodes: Node[];
  edges: Edge[];
}) {
  const t = useTranslations("WorkflowNodeRegistry");
  const te = useTranslations("WorkflowEditorPage");
  const serviceEdge = edges.find((e) => e.target === nodeId && e.targetHandle === "service");
  const memoryEdge = edges.find((e) => e.target === nodeId && e.targetHandle === "memory");
  const service = serviceEdge ? nodes.find((n) => n.id === serviceEdge.source) : undefined;
  const memory = memoryEdge ? nodes.find((n) => n.id === memoryEdge.source) : undefined;

  return (
    <div className="shrink-0 border-t px-3 py-2">
      <div className="grid grid-cols-2 gap-2">
        <div
          className={cn(
            "flex min-w-0 flex-col items-center gap-1 rounded-md border px-2 py-2 text-center",
            service ? "border-emerald-500/40 bg-emerald-500/5" : "border-dashed border-muted-foreground/30",
          )}
        >
          <div className="flex items-center gap-1.5">
            <Server className="size-3.5 text-[#ff6f00]" />
            <span className="text-[11px] font-medium">{t("field_service")}</span>
            {service ? <Check className="size-3 text-emerald-600" /> : null}
          </div>
          <span className="text-muted-foreground max-w-full truncate text-[10px]">
            {service ? resourceLabel(service, t("field_service")) : "—"}
          </span>
        </div>
        <div
          className={cn(
            "flex min-w-0 flex-col items-center gap-1 rounded-md border px-2 py-2 text-center",
            memory ? "border-emerald-500/40 bg-emerald-500/5" : "border-dashed border-muted-foreground/30",
          )}
        >
          <div className="flex items-center gap-1.5">
            <Database className="size-3.5 text-blue-600" />
            <span className="text-[11px] font-medium">{te("agent_memory")}</span>
            {memory ? <Check className="size-3 text-emerald-600" /> : null}
          </div>
          <span className="text-muted-foreground max-w-full truncate text-[10px]">
            {memory ? resourceLabel(memory, te("mem_vectorize")) : "—"}
          </span>
        </div>
      </div>
    </div>
  );
}

export function WorkflowNodeConfigPanel({
  node,
  nodes = [],
  edges = [],
  workflowId,
  ownerId,
  listeningNodeId,
  liveOutput,
  onClose,
  onPatchData,
  onExecuteStep,
  onStopListen,
}: WorkflowNodeConfigPanelProps) {
  const t = useTranslations("WorkflowNodeRegistry");
  const te = useTranslations("WorkflowEditorPage");
  const { registry } = useWorkflowNodeRegistry();

  const nodeData = (node?.data ?? {}) as Record<string, unknown>;
  const runtimeType = node?.type ?? "";
  const kind = typeof nodeData.coreKind === "string"
    ? nodeData.coreKind
    : typeof nodeData.flowKind === "string"
      ? nodeData.flowKind
      : typeof nodeData.triggerKind === "string"
        ? nodeData.triggerKind
        : typeof nodeData.toolKind === "string"
          ? nodeData.toolKind
          : typeof nodeData.channel === "string" && runtimeType === "human_review"
            ? nodeData.channel
            : undefined;

  const definition = useMemo(
    () => (runtimeType ? resolveNodeDefinition(runtimeType, kind, registry) : undefined),
    [runtimeType, kind, registry],
  );

  const n8nDescription = useMemo(
    () => (hasN8nNodeDescription(runtimeType, kind) ? getN8nNodeDescription(runtimeType, kind) : undefined),
    [runtimeType, kind],
  );

  const paramsSection = definition?.sections.find((s) => s.id === "parameters");
  const outputSection = definition?.sections.find((s) => s.id === "output");

  const handleFieldChange = useCallback(
    (fieldId: string, value: unknown) => {
      if (!node) return;
      onPatchData(node.id, { [fieldId]: value });
    },
    [node, onPatchData],
  );

  const inputNodeId = useMemo(
    () => (node ? resolveInputNodeId(node.id, runtimeType, edges) : ""),
    [node, runtimeType, edges],
  );

  const loopOutputWarning = useMemo(() => {
    if (kind !== "loop_over_items" || !node) return null;
    const hasLoopEdge = edges.some((e) => edgeUsesHandle(e, node.id, "loop", "source"));
    if (hasLoopEdge) return null;
    return te("loop_no_loop_output_connected");
  }, [kind, node, edges, te]);

  if (!node || (!definition && !n8nDescription)) return null;

  warnLegacyRuntimeType(node);

  const uiPlugin = resolveUIPlugin(node);
  if (uiPlugin?.ConfigPanel) {
    const ConfigPanel = uiPlugin.ConfigPanel;
    return (
      <ConfigPanel
        node={node}
        nodes={nodes}
        edges={edges}
        workflowId={workflowId}
        ownerId={ownerId}
        listeningNodeId={listeningNodeId}
        liveOutput={liveOutput}
        onClose={onClose}
        onPatchData={onPatchData}
        onExecuteStep={onExecuteStep}
        onStopListen={onStopListen}
      />
    );
  }

  const paramFields = [...(paramsSection?.fields ?? [])].sort((a, b) => (a.order ?? 99) - (b.order ?? 99));

  return (
    <div className="bg-background absolute inset-0 z-50 flex flex-col">
      <header className="flex items-center justify-between border-b px-4 py-2">
        <div>
          <h2 className="text-sm font-semibold">
            {String(nodeData.label ?? (definition ? te(definition.nameKey) : n8nDescription?.displayName ?? runtimeType))}
          </h2>
          <p className="text-muted-foreground text-xs">
            {definition ? te(definition.descriptionKey) : n8nDescription?.description}
          </p>
        </div>
        <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label={t("close")}>
          <X className="h-4 w-4" />
        </Button>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-3">
        <div className="border-b lg:min-h-0 lg:border-b-0 lg:border-r">
          <AgentUpstreamInputPanel nodeId={inputNodeId} nodes={nodes} edges={edges} className="min-h-[14rem] lg:min-h-0" />
        </div>

        <div className="flex min-h-0 flex-col border-r">
          <div className="border-b px-3 py-2">
            <Tabs defaultValue="parameters">
              <TabsList className="h-8">
                <TabsTrigger value="parameters" className="text-xs">
                  {t("section_parameters")}
                </TabsTrigger>
                <TabsTrigger value="settings" className="text-xs">
                  {t("section_settings")}
                </TabsTrigger>
              </TabsList>
              <TabsContent value="parameters" className="mt-0">
                <div className="max-h-[calc(100vh-12rem)] space-y-4 overflow-y-auto p-3">
                  {onExecuteStep ? (
                    <WorkflowExecuteStepButton
                      nodeId={node.id}
                      className="w-full"
                      onClick={() => onExecuteStep(node.id)}
                      label={te("menu_execute_step")}
                      executingLabel={te("menu_executing_step")}
                    />
                  ) : null}
                  {n8nDescription ? (
                    <N8nParameterRenderer
                      description={n8nDescription}
                      parameters={nodeData as N8nNodeParameters}
                      onChange={handleFieldChange}
                      clientId={ownerId}
                    />
                  ) : (
                    paramFields.map((field) => (
                      <NodeConfigFieldRenderer
                        key={field.id}
                        field={field}
                        value={nodeData[field.id] ?? field.defaultValue}
                        onChange={(v) => handleFieldChange(field.id, v)}
                      />
                    ))
                  )}
                </div>
              </TabsContent>
              <TabsContent value="settings" className="mt-0 p-3">
                <p className="text-muted-foreground text-xs">{t("settings_placeholder")}</p>
              </TabsContent>
            </Tabs>
          </div>
          {isRagToolNode(node) ? <RagResourceChips nodeId={node.id} nodes={nodes} edges={edges} /> : null}
        </div>

        {outputSection ? (
          <NodeMockOutputSection
            output={nodeData._output}
            outputPinned={!!nodeData._outputPinned}
            onSaveOutput={(parsed) => onPatchData(node.id, { _output: parsed, _outputPinned: true })}
            onUnpinOutput={() => onPatchData(node.id, { _output: undefined, _outputPinned: false })}
            onExecute={outputSection.showExecuteStep && onExecuteStep ? () => onExecuteStep(node.id) : undefined}
            executeNodeId={node.id}
            headerExtra={
              loopOutputWarning ? (
                <p className="text-muted-foreground text-[11px] leading-snug">{loopOutputWarning}</p>
              ) : undefined
            }
          />
        ) : null}
      </div>
    </div>
  );
}
