"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";

import type { Edge, Node } from "@xyflow/react";
import {
  ArrowLeftFromLine,
  ArrowRightFromLine,
  Bot,
  Check,
  ChevronDown,
  Database,
  Hammer,
  Play,
  Server,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { buildSchemaTreeRows, flattenWebhookItemForTable } from "@aiagents-hub/workflow-nodes";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

import type { NodeConfigPanelProps } from "../../nodes/types";
import { AgentUpstreamInputPanel } from "./agent-upstream-input-panel";
import { ExpressionDropField } from "./expression-drop-field";
import { JsonCodeEditor } from "./json-code-editor";

const ORANGE = "bg-[#ff6f00] hover:bg-[#e66300]";

const AGENT_EXTRA_OPTIONS = [
  { id: "systemPrompt", labelKey: "agent_opt_system_message", type: "textarea" as const, defaultValue: "" },
  { id: "maxTokens", labelKey: "field_max_tokens", type: "number" as const, defaultValue: 1024 },
  { id: "enableFallbackModel", labelKey: "field_enable_fallback_model", type: "toggle" as const, defaultValue: false },
] as const;

type AgentExtraOptionId = (typeof AGENT_EXTRA_OPTIONS)[number]["id"];

type IoViewMode = "schema" | "table" | "json";

function isDataFlowEdge(edge: Edge): boolean {
  const targetHandle = edge.targetHandle ?? "in";
  if (targetHandle !== "in") return false;
  const sourceHandle = edge.sourceHandle ?? "out";
  return sourceHandle === "out" || sourceHandle.startsWith("out_") || sourceHandle === "true" || sourceHandle === "false";
}

function getUpstreamNodeId(nodeId: string, edges: Edge[]): string | null {
  const parentEdge = edges.find((e) => e.target === nodeId && isDataFlowEdge(e));
  return parentEdge?.source ?? null;
}

function getConnectedResources(agentId: string, nodes: Node[], edges: Edge[]) {
  const serviceEdge = edges.find((e) => e.target === agentId && e.targetHandle === "service");
  const memoryEdge = edges.find((e) => e.target === agentId && e.targetHandle === "memory");
  const toolEdges = edges.filter((e) => e.target === agentId && e.targetHandle === "tools");

  return {
    service: serviceEdge ? nodes.find((n) => n.id === serviceEdge.source) : undefined,
    memory: memoryEdge ? nodes.find((n) => n.id === memoryEdge.source) : undefined,
    tools: toolEdges
      .map((e) => nodes.find((n) => n.id === e.source))
      .filter((n): n is Node => n != null),
  };
}

function resourceLabel(node: Node | undefined, fallback: string): string {
  if (!node) return fallback;
  const data = (node.data ?? {}) as Record<string, unknown>;
  return String(data.label ?? data.endpoint ?? data.serviceEndpoint ?? fallback);
}

function SettingsToggleRow({
  label,
  checked,
  onCheckedChange,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <Label className="text-sm font-normal">{label}</Label>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function SubNodeChip({
  icon,
  label,
  connected,
  detail,
}: {
  icon: ReactNode;
  label: string;
  connected: boolean;
  detail?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-1 flex-col items-center gap-1 rounded-md border px-2 py-2 text-center",
        connected ? "border-emerald-500/40 bg-emerald-500/5" : "border-dashed border-muted-foreground/30",
      )}
    >
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="text-[11px] font-medium">{label}</span>
        {connected ? <Check className="size-3 text-emerald-600" /> : null}
      </div>
      {detail ? (
        <span className="text-muted-foreground max-w-full truncate text-[10px]">{detail}</span>
      ) : (
        <span className="text-muted-foreground text-[10px]">{connected ? "" : "—"}</span>
      )}
    </div>
  );
}

function AgentOutputView({ output }: { output: Record<string, unknown> }) {
  const t = useTranslations("WorkflowNodeRegistry");
  const [viewMode, setViewMode] = useState<IoViewMode>("schema");

  const schemaRows = useMemo(() => buildSchemaTreeRows(output), [output]);
  const tableRows = useMemo(() => flattenWebhookItemForTable(output as never), [output]);
  const jsonText = useMemo(() => JSON.stringify(output, null, 2), [output]);

  return (
    <>
      <div className="flex items-center justify-between border-b px-3 py-2">
        <h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">{t("section_output")}</h3>
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
        {viewMode === "json" ? (
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
    </>
  );
}

export type AgentNodeConfigPanelProps = NodeConfigPanelProps;

export function isAgentNode(node: Node): boolean {
  return node.type === "agent";
}

export function AgentNodeConfigPanel({
  node,
  nodes = [],
  edges = [],
  onClose,
  onPatchData,
  onExecuteStep,
}: AgentNodeConfigPanelProps) {
  const t = useTranslations("WorkflowNodeRegistry");
  const te = useTranslations("WorkflowEditorPage");

  const nodeData = (node.data ?? {}) as Record<string, unknown>;
  const promptSource = String(nodeData.promptSource ?? "define_below");
  const prompt = String(nodeData.prompt ?? "");
  const requireOutputFormat = !!nodeData.requireOutputFormat;
  const agentNotes = String(nodeData.agentNotes ?? "");
  const visibleOptions = (nodeData.agentVisibleOptions ?? []) as AgentExtraOptionId[];

  const [addOptionOpen, setAddOptionOpen] = useState(false);
  const [editingOutput, setEditingOutput] = useState(false);
  const [outputDraft, setOutputDraft] = useState("");

  const patch = useCallback(
    (fields: Record<string, unknown>) => onPatchData(node.id, fields),
    [node.id, onPatchData],
  );

  const upstreamNodeId = useMemo(() => getUpstreamNodeId(node.id, edges), [node.id, edges]);
  const resources = useMemo(
    () => getConnectedResources(node.id, nodes, edges),
    [node.id, nodes, edges],
  );

  const serviceEndpoint = String(
    nodeData.serviceEndpoint ??
      (resources.service?.data as Record<string, unknown> | undefined)?.endpoint ??
      (resources.service?.data as Record<string, unknown> | undefined)?.serviceEndpoint ??
      "",
  );

  const output = nodeData._output;
  const hasOutput = output != null && typeof output === "object";

  const addOption = (optionId: AgentExtraOptionId) => {
    if (visibleOptions.includes(optionId)) return;
    const def = AGENT_EXTRA_OPTIONS.find((o) => o.id === optionId);
    if (!def) return;
    patch({
      agentVisibleOptions: [...visibleOptions, optionId],
      [optionId]: nodeData[optionId] ?? def.defaultValue,
    });
    setAddOptionOpen(false);
  };

  const removeOption = (optionId: AgentExtraOptionId) => {
    patch({
      agentVisibleOptions: visibleOptions.filter((id) => id !== optionId),
    });
  };

  const availableOptions = AGENT_EXTRA_OPTIONS.filter((o) => !visibleOptions.includes(o.id));

  const executePrevious = () => {
    if (upstreamNodeId && onExecuteStep) {
      onExecuteStep(upstreamNodeId);
      return;
    }
    toast.message(t("agent_no_upstream"));
  };

  const openEditOutput = () => {
    setOutputDraft(
      hasOutput ? JSON.stringify(output, null, 2) : '{\n  "text": "Hello from agent"\n}',
    );
    setEditingOutput(true);
  };

  const saveOutput = () => {
    try {
      const parsed = JSON.parse(outputDraft) as unknown;
      patch({ _output: parsed, _outputPinned: true });
      setEditingOutput(false);
      toast.success(t("agent_mock_saved"));
    } catch {
      toast.error(t("webhook_edit_output_invalid_json"));
    }
  };

  return (
    <div className="bg-background absolute inset-0 z-50 flex flex-col">
      <header className="flex items-center justify-between border-b px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <div className="flex size-7 items-center justify-center rounded-md bg-[#ff6f00]/10">
            <Bot className="size-4 text-[#ff6f00]" />
          </div>
          <h2 className="text-sm font-semibold">{String(nodeData.label ?? te("node_agent"))}</h2>
        </div>
        <div className="flex items-center gap-1">
          <Button type="button" variant="ghost" size="icon" className="size-8" onClick={onClose} aria-label={t("close")}>
            <span className="sr-only">{t("close")}</span>
            <span className="text-lg leading-none">&times;</span>
          </Button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-3">
        {/* Left — INPUT */}
        <div className="flex min-h-0 flex-col border-r">
          <AgentUpstreamInputPanel
            nodeId={node.id}
            nodes={nodes}
            edges={edges}
            className="border-r-0"
            onExecutePrevious={onExecuteStep ? executePrevious : undefined}
            executePreviousLabel={t("agent_execute_previous")}
            emptyHint={
              <div className="flex flex-col items-center gap-4 px-2 py-6 text-center">
                <ArrowLeftFromLine className="text-muted-foreground/40 size-10 stroke-[1.5]" />
                <p className="text-muted-foreground text-sm">{t("no_input_data")}</p>
                {onExecuteStep ? (
                  <Button type="button" className={cn(ORANGE, "text-white")} onClick={executePrevious}>
                    {t("agent_execute_previous")}
                  </Button>
                ) : null}
              </div>
            }
          />
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
              <div className="mb-4 rounded-md border border-violet-300/40 bg-violet-500/10 px-3 py-2.5 text-xs leading-relaxed text-violet-900 dark:text-violet-200">
                {t("agent_tip")}
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">{t("field_prompt_source")}</Label>
                  <Select
                    value={promptSource}
                    onValueChange={(v) => patch({ promptSource: v })}
                  >
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="define_below">{t("agent_prompt_define_below")}</SelectItem>
                      <SelectItem value="from_input">{t("agent_prompt_from_trigger")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">{t("field_prompt")}</Label>
                  <ExpressionDropField
                    value={promptSource === "from_input" && !prompt ? "{{ $json.chatInput }}" : prompt}
                    onChange={(v) => patch({ prompt: v })}
                    multiline={promptSource === "define_below"}
                    rows={promptSource === "define_below" ? 4 : 1}
                    placeholder={
                      promptSource === "define_below"
                        ? t("field_prompt_placeholder")
                        : "{{ $json.chatInput }}"
                    }
                    inputClassName={promptSource === "from_input" ? "pr-10" : undefined}
                    trailing={
                      promptSource === "from_input" ? (
                        <span className="text-muted-foreground pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded border px-1 text-[9px] font-semibold">
                          JS
                        </span>
                      ) : undefined
                    }
                  />
                </div>

                <SettingsToggleRow
                  label={t("field_require_output_format")}
                  checked={requireOutputFormat}
                  onCheckedChange={(v) => patch({ requireOutputFormat: v })}
                />

                {requireOutputFormat ? (
                  <p className="text-muted-foreground rounded-md border px-3 py-2 text-xs">
                    {t("agent_output_parser_hint")}
                  </p>
                ) : null}

                <div className="space-y-3">
                  <Label className="text-xs">{t("field_options")}</Label>
                  {AGENT_EXTRA_OPTIONS.filter((o) => visibleOptions.includes(o.id)).map((opt) => (
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
                      {opt.type === "toggle" ? (
                        <Switch
                          checked={!!nodeData[opt.id]}
                          onCheckedChange={(v) => patch({ [opt.id]: v })}
                        />
                      ) : opt.type === "textarea" ? (
                        <ExpressionDropField
                          value={String(nodeData[opt.id] ?? "")}
                          onChange={(v) => patch({ [opt.id]: v })}
                          multiline
                          rows={3}
                        />
                      ) : (
                        <ExpressionDropField
                          value={String(nodeData[opt.id] ?? opt.defaultValue)}
                          numeric
                          inputClassName="h-9 text-xs"
                          onChange={(v) =>
                            patch({ [opt.id]: v.includes("{{") ? v : Number(v) })
                          }
                        />
                      )}
                    </div>
                  ))}
                  {visibleOptions.length === 0 ? (
                    <p className="text-muted-foreground text-xs">{t("webhook_no_options")}</p>
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
              </div>
            </TabsContent>

            <TabsContent value="settings" className="mt-0 min-h-0 flex-1 overflow-y-auto p-4">
              <div className="space-y-1.5">
                <Label className="text-sm font-normal">{t("agent_notes")}</Label>
                <ExpressionDropField
                  value={agentNotes}
                  multiline
                  rows={4}
                  inputClassName="resize-none text-sm"
                  onChange={(v) => patch({ agentNotes: v })}
                />
              </div>
            </TabsContent>
          </Tabs>

          <div className="shrink-0 border-t px-3 py-2">
            <div className="grid grid-cols-3 gap-2">
              <SubNodeChip
                icon={<Server className="size-3.5 text-[#ff6f00]" />}
                label={t("field_service")}
                connected={!!resources.service || !!serviceEndpoint}
                detail={
                  resources.service
                    ? resourceLabel(resources.service, t("field_service"))
                    : serviceEndpoint || undefined
                }
              />
              <SubNodeChip
                icon={<Database className="size-3.5 text-blue-600" />}
                label={te("agent_memory")}
                connected={!!resources.memory}
                detail={resources.memory ? resourceLabel(resources.memory, te("agent_memory")) : undefined}
              />
              <SubNodeChip
                icon={<Hammer className="size-3.5 text-amber-600" />}
                label={te("agent_tools")}
                connected={resources.tools.length > 0}
                detail={
                  resources.tools.length > 0
                    ? resources.tools.map((n) => resourceLabel(n, te("agent_tools"))).join(", ")
                    : undefined
                }
              />
            </div>
          </div>

          <p className="text-muted-foreground shrink-0 border-t px-4 py-2 text-[11px] italic">{t("agent_wish")}</p>
        </div>

        {/* Right — OUTPUT */}
        <div className="flex min-h-0 flex-col">
          {editingOutput ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="flex items-center justify-between border-b px-3 py-2">
                <h3 className="text-xs font-medium">{t("field_mock_output")}</h3>
                <div className="flex gap-2">
                  <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setEditingOutput(false)}>
                    {t("close")}
                  </Button>
                  <Button type="button" size="sm" className={cn(ORANGE, "h-8 text-xs text-white")} onClick={saveOutput}>
                    {t("agent_save_mock")}
                  </Button>
                </div>
              </div>
              <div className="min-h-0 flex-1 p-2">
                <JsonCodeEditor value={outputDraft} onChange={setOutputDraft} className="h-full min-h-[200px]" />
              </div>
            </div>
          ) : hasOutput ? (
            <AgentOutputView output={output as Record<string, unknown>} />
          ) : (
            <>
              <div className="border-b px-3 py-2">
                <h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                  {t("section_output")}
                </h3>
              </div>
              <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
                <ArrowRightFromLine className="text-muted-foreground/40 size-10 stroke-[1.5]" />
                <p className="text-muted-foreground text-sm">{t("no_output_data")}</p>
                {onExecuteStep ? (
                  <Button
                    type="button"
                    className={cn(ORANGE, "text-white")}
                    onClick={() => onExecuteStep(node.id)}
                  >
                    <Play className="mr-2 size-3.5 fill-current" />
                    {te("menu_execute_step")}
                  </Button>
                ) : null}
                <button
                  type="button"
                  className="text-muted-foreground text-xs underline-offset-2 hover:underline"
                  onClick={openEditOutput}
                >
                  {t("webhook_set_mock_data")}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
