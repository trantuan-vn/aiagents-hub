"use client";

import { useCallback, useMemo, useState } from "react";

import type { Edge, Node } from "@xyflow/react";
import { ChevronDown, Play, Server } from "lucide-react";
import { useTranslations } from "next-intl";

import type { Service } from "@/app/(main)/dashboard/service/_components/schema";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

import { resolveInputNodeId } from "../../edges/workflow-connection-utils";
import type { NodeConfigPanelProps } from "../../nodes/types";
import { ServiceSearchCombobox } from "../../node-ui/service-search-combobox";
import { AgentUpstreamInputPanel } from "./agent-upstream-input-panel";
import { ExpressionDropField } from "./expression-drop-field";
import { NodeMockOutputSection } from "./node-mock-output-section";

const ORANGE = "bg-[#ff6f00] hover:bg-[#e66300]";

const SERVICE_EXTRA_OPTIONS = [
  { id: "frequencyPenalty", labelKey: "service_opt_frequency_penalty", type: "number" as const, defaultValue: 0 },
  { id: "maxTokens", labelKey: "service_opt_max_tokens", type: "number" as const, defaultValue: 1024 },
  {
    id: "responseFormat",
    labelKey: "service_opt_response_format",
    type: "select" as const,
    defaultValue: "text",
    options: [
      { value: "text", labelKey: "service_opt_response_text" },
      { value: "json_object", labelKey: "service_opt_response_json" },
    ],
  },
  { id: "presencePenalty", labelKey: "service_opt_presence_penalty", type: "number" as const, defaultValue: 0 },
  { id: "temperature", labelKey: "service_opt_temperature", type: "number" as const, defaultValue: 1 },
  { id: "timeout", labelKey: "service_opt_timeout", type: "number" as const, defaultValue: 30000 },
  { id: "maxRetries", labelKey: "service_opt_max_retries", type: "number" as const, defaultValue: 3 },
  { id: "topP", labelKey: "service_opt_top_p", type: "number" as const, defaultValue: 1 },
] as const;

type ServiceExtraOptionId = (typeof SERVICE_EXTRA_OPTIONS)[number]["id"];

export type ServiceNodeConfigPanelProps = NodeConfigPanelProps;

export function isServiceNode(node: Node): boolean {
  return node.type === "service_node";
}

export function ServiceNodeConfigPanel({
  node,
  nodes = [],
  edges = [],
  onClose,
  onPatchData,
  onExecuteStep,
}: ServiceNodeConfigPanelProps) {
  const t = useTranslations("WorkflowNodeRegistry");
  const te = useTranslations("WorkflowEditorPage");

  const nodeData = (node.data ?? {}) as Record<string, unknown>;
  const endpoint = String(nodeData.endpoint ?? nodeData.serviceEndpoint ?? "");
  const serviceNotes = String(nodeData.serviceNotes ?? "");
  const serviceOptions = (nodeData.serviceOptions ?? {}) as Record<string, unknown>;

  const [addOptionOpen, setAddOptionOpen] = useState(false);

  const inputNodeId = useMemo(
    () => resolveInputNodeId(node.id, node.type, edges),
    [node.id, node.type, edges],
  );

  const patch = useCallback(
    (fields: Record<string, unknown>) => onPatchData(node.id, fields),
    [node.id, onPatchData],
  );

  const onSelectService = useCallback(
    (service: Service) => {
      patch({
        endpoint: service.endpoint,
        serviceEndpoint: service.endpoint,
        catalogId: String(service.id ?? service.endpoint),
        label: service.name,
        model: service.model ?? undefined,
      });
    },
    [patch],
  );

  const patchOption = useCallback(
    (optionId: string, value: unknown) => {
      patch({ serviceOptions: { ...serviceOptions, [optionId]: value } });
    },
    [patch, serviceOptions],
  );

  const addOption = (optionId: ServiceExtraOptionId) => {
    const def = SERVICE_EXTRA_OPTIONS.find((o) => o.id === optionId);
    if (!def || optionId in serviceOptions) return;
    patch({ serviceOptions: { ...serviceOptions, [optionId]: def.defaultValue } });
    setAddOptionOpen(false);
  };

  const removeOption = (optionId: ServiceExtraOptionId) => {
    const next = { ...serviceOptions };
    delete next[optionId];
    patch({ serviceOptions: next });
  };

  const availableOptions = SERVICE_EXTRA_OPTIONS.filter((o) => !(o.id in serviceOptions));

  return (
    <div className="bg-background absolute inset-0 z-50 flex flex-col">
      <header className="flex items-center justify-between border-b px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <div className="flex size-7 items-center justify-center rounded-md bg-blue-500/10">
            <Server className="size-4 text-blue-600" />
          </div>
          <h2 className="text-sm font-semibold">{String(nodeData.label ?? te("node_service"))}</h2>
        </div>
        <Button type="button" variant="ghost" size="icon" className="size-8" onClick={onClose} aria-label={t("close")}>
          <span className="sr-only">{t("close")}</span>
          <span className="text-lg leading-none">&times;</span>
        </Button>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-3">
        {/* Left — INPUT (parent agent context when connected) */}
        <div className="flex min-h-0 flex-col border-r">
          <AgentUpstreamInputPanel nodeId={inputNodeId} nodes={nodes} edges={edges} className="border-r-0" />
        </div>

        {/* Middle — parameters */}
        <div className="flex min-h-0 flex-col border-r">
          <Tabs defaultValue="parameters" className="flex min-h-0 flex-1 flex-col">
            <div className="flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2">
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
              {onExecuteStep ? (
                <Button
                  type="button"
                  size="sm"
                  className={cn(ORANGE, "shrink-0 text-xs text-white")}
                  onClick={() => onExecuteStep(node.id)}
                >
                  <Play className="mr-1.5 size-3.5 fill-current" />
                  {te("menu_execute_step")}
                </Button>
              ) : null}
            </div>

            <TabsContent value="parameters" className="mt-0 min-h-0 flex-1 overflow-y-auto p-4">
              <ServiceSearchCombobox value={endpoint} onSelect={onSelectService} />

              <div className="mt-5 space-y-3">
                <Label className="text-xs">{t("field_options")}</Label>
                {SERVICE_EXTRA_OPTIONS.filter((o) => o.id in serviceOptions).map((opt) => (
                  <div key={opt.id} className="space-y-1.5 rounded-md border px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <Label className="text-xs">{t(opt.labelKey)}</Label>
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-foreground text-xs"
                        onClick={() => removeOption(opt.id)}
                        aria-label={t("close")}
                      >
                        &times;
                      </button>
                    </div>
                    {opt.type === "select" ? (
                      <Select
                        value={String(serviceOptions[opt.id] ?? opt.defaultValue)}
                        onValueChange={(v) => patchOption(opt.id, v)}
                      >
                        <SelectTrigger className="h-9 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {opt.options.map((item) => (
                            <SelectItem key={item.value} value={item.value}>
                              {t(item.labelKey)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <ExpressionDropField
                        value={String(serviceOptions[opt.id] ?? opt.defaultValue)}
                        numeric
                        inputClassName="h-9 text-xs"
                        onChange={(v) => patchOption(opt.id, v.includes("{{") ? v : Number(v))}
                      />
                    )}
                  </div>
                ))}
                {Object.keys(serviceOptions).length === 0 ? (
                  <p className="text-muted-foreground text-xs">{t("service_no_options")}</p>
                ) : null}
                <Popover open={addOptionOpen} onOpenChange={setAddOptionOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9 w-full justify-between text-xs font-normal"
                      disabled={availableOptions.length === 0}
                    >
                      {t("webhook_add_option")}
                      <ChevronDown className={cn("size-4 opacity-50", addOptionOpen && "rotate-180")} />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-1" align="start">
                    {availableOptions.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        className="hover:bg-muted w-full rounded-sm px-3 py-2 text-left text-sm"
                        onClick={() => addOption(opt.id)}
                      >
                        {t(opt.labelKey)}
                      </button>
                    ))}
                  </PopoverContent>
                </Popover>
              </div>
            </TabsContent>

            <TabsContent value="settings" className="mt-0 min-h-0 flex-1 overflow-y-auto p-4">
              <div className="space-y-1.5">
                <Label className="text-sm font-normal">{t("service_notes")}</Label>
                <ExpressionDropField
                  value={serviceNotes}
                  multiline
                  rows={4}
                  inputClassName="resize-none text-sm"
                  onChange={(v) => patch({ serviceNotes: v })}
                />
              </div>
            </TabsContent>
          </Tabs>

          <p className="text-muted-foreground shrink-0 border-t px-4 py-2 text-[11px] italic">{t("service_wish")}</p>
        </div>

        {/* Right — OUTPUT */}
        <NodeMockOutputSection
          output={nodeData._output}
          outputPinned={!!nodeData._outputPinned}
          defaultMockJson={'{\n  "text": "Hello from service"\n}'}
          onSaveOutput={(parsed) => patch({ _output: parsed, _outputPinned: true })}
          onUnpinOutput={() => patch({ _output: undefined, _outputPinned: false })}
          onExecute={onExecuteStep ? () => onExecuteStep(node.id) : undefined}
        />
      </div>
    </div>
  );
}
