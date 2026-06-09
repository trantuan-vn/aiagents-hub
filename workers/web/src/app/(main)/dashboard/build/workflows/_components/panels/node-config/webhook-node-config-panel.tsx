"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import type { Node } from "@xyflow/react";
import {
  ChevronDown,
  Copy,
  ExternalLink,
  MoreVertical,
  Pencil,
  Webhook,
  Zap,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { listWorkflowTriggers } from "../../../_lib/api";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.aiagents-hub.vn";
const ORANGE = "bg-[#ff6f00] hover:bg-[#e66300]";

const WEBHOOK_RESPOND_OPTIONS = [
  { value: "immediately", titleKey: "webhook_respond_immediately", descKey: "webhook_respond_immediately_desc" },
  { value: "when_last_node", titleKey: "webhook_respond_last_node", descKey: "webhook_respond_last_node_desc" },
  { value: "respond_node", titleKey: "webhook_respond_node", descKey: "webhook_respond_node_desc" },
  { value: "streaming", titleKey: "webhook_respond_streaming", descKey: "webhook_respond_streaming_desc" },
] as const;

const WEBHOOK_EXTRA_OPTIONS = [
  { id: "allowed_origins", labelKey: "webhook_opt_allowed_origins", type: "text" as const, defaultValue: "*" },
  { id: "binary_field", labelKey: "webhook_opt_binary_field", type: "text" as const, defaultValue: "data" },
  { id: "ignore_bots", labelKey: "webhook_opt_ignore_bots", type: "toggle" as const, defaultValue: false },
  { id: "ip_allowlist", labelKey: "webhook_opt_ip_allowlist", type: "textarea" as const, defaultValue: "" },
  { id: "no_response_body", labelKey: "webhook_opt_no_response_body", type: "toggle" as const, defaultValue: false },
  { id: "raw_body", labelKey: "webhook_opt_raw_body", type: "toggle" as const, defaultValue: false },
  { id: "response_code", labelKey: "webhook_opt_response_code", type: "number" as const, defaultValue: 200 },
  { id: "response_data", labelKey: "webhook_opt_response_data", type: "textarea" as const, defaultValue: "" },
] as const;

type WebhookExtraOptionId = (typeof WEBHOOK_EXTRA_OPTIONS)[number]["id"];

const WEBHOOK_ON_ERROR_OPTIONS = [
  { value: "stop_workflow", labelKey: "webhook_on_error_stop" },
  { value: "continue", labelKey: "webhook_on_error_continue" },
  { value: "continue_error_output", labelKey: "webhook_on_error_continue_error" },
] as const;

function SettingsToggleRow({
  label,
  checked,
  onCheckedChange,
  trailing,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  trailing?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="flex min-w-0 flex-1 items-center gap-1">
        <Label className="text-sm font-normal">{label}</Label>
        {trailing}
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

type WebhookNodeConfigPanelProps = {
  node: Node;
  workflowId?: number;
  onClose: () => void;
  onPatchData: (nodeId: string, patch: Record<string, unknown>) => void;
  onExecuteStep?: (nodeId: string) => void;
};

export function isWebhookNode(node: Node): boolean {
  const d = (node.data ?? {}) as Record<string, unknown>;
  return d.coreKind === "webhook" || d.triggerKind === "webhook" || node.type === "webhook";
}

function defaultPath(nodeId: string): string {
  return nodeId.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 36) || crypto.randomUUID();
}

export function WebhookNodeConfigPanel({
  node,
  workflowId,
  onClose,
  onPatchData,
  onExecuteStep,
}: WebhookNodeConfigPanelProps) {
  const t = useTranslations("WorkflowNodeRegistry");
  const te = useTranslations("WorkflowEditorPage");

  const nodeData = (node.data ?? {}) as Record<string, unknown>;
  const httpMethod = String(nodeData.httpMethod ?? "GET");
  const path = String(nodeData.webhookPath ?? defaultPath(node.id));
  const authentication = String(nodeData.webhookAuth ?? "none");
  const respond = String(nodeData.webhookRespond ?? "immediately");
  const triggerMode = String(nodeData.webhookTriggerMode ?? "workflow_active");
  const webhookOptions = (nodeData.webhookOptions ?? {}) as Record<string, unknown>;
  const allowMultipleMethods = !!nodeData.webhookAllowMultipleMethods;
  const alwaysOutputData = !!nodeData.webhookAlwaysOutputData;
  const executeOnce = !!nodeData.webhookExecuteOnce;
  const retryOnFail = !!nodeData.webhookRetryOnFail;
  const onError = String(nodeData.webhookOnError ?? "stop_workflow");
  const notes = String(nodeData.webhookNotes ?? "");
  const displayNoteInFlow = !!nodeData.webhookDisplayNoteInFlow;

  const [urlMode, setUrlMode] = useState<"test" | "production">("test");
  const [addOptionOpen, setAddOptionOpen] = useState(false);
  const [urlsOpen, setUrlsOpen] = useState(true);
  const [productionUrl, setProductionUrl] = useState<string | undefined>();
  const [listening, setListening] = useState(false);

  useEffect(() => {
    if (!workflowId || isNaN(workflowId)) return;
    void listWorkflowTriggers(workflowId)
      .then(({ triggers }) => {
        const webhook = triggers.find((tr) => tr.type === "webhook" && tr.webhookUrl);
        if (webhook?.webhookUrl) setProductionUrl(webhook.webhookUrl);
      })
      .catch(() => {
        /* optional — panel still works without triggers */
      });
  }, [workflowId]);

  const testUrl = useMemo(
    () => `${API_BASE_URL}/webhook-test/${path}`,
    [path],
  );

  const displayUrl = urlMode === "production" && productionUrl
    ? productionUrl
    : testUrl;

  const patch = useCallback(
    (fields: Record<string, unknown>) => onPatchData(node.id, fields),
    [node.id, onPatchData],
  );

  const patchOption = useCallback(
    (optionId: string, value: unknown) => {
      patch({ webhookOptions: { ...webhookOptions, [optionId]: value } });
    },
    [patch, webhookOptions],
  );

  const addOption = (optionId: WebhookExtraOptionId) => {
    const def = WEBHOOK_EXTRA_OPTIONS.find((o) => o.id === optionId);
    if (!def || optionId in webhookOptions) return;
    patch({ webhookOptions: { ...webhookOptions, [optionId]: def.defaultValue } });
    setAddOptionOpen(false);
  };

  const removeOption = (optionId: string) => {
    const next = { ...webhookOptions };
    delete next[optionId];
    patch({ webhookOptions: next });
  };

  const availableOptions = WEBHOOK_EXTRA_OPTIONS.filter((o) => !(o.id in webhookOptions));
  const respondLabel = WEBHOOK_RESPOND_OPTIONS.find((o) => o.value === respond)?.titleKey ?? "webhook_respond_immediately";

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(displayUrl);
      toast.success(te("triggers_copied"));
    } catch {
      toast.error(t("webhook_copy_failed"));
    }
  };

  const listenForTest = () => {
    setListening(true);
    toast.message(t("webhook_listening"));
    window.setTimeout(() => setListening(false), 30_000);
  };

  const output = nodeData._output as Record<string, unknown> | undefined;
  const hasOutput = output && Object.keys(output).length > 0;

  return (
    <div className="bg-background absolute inset-0 z-50 flex flex-col">
      <header className="flex items-center justify-between border-b px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <div className="flex size-7 items-center justify-center rounded-md bg-[#ff6f00]/10">
            <Webhook className="size-4 text-[#ff6f00]" />
          </div>
          <h2 className="text-sm font-semibold">{String(nodeData.label ?? te("core_kind_webhook"))}</h2>
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground h-8 gap-1.5 text-xs"
            asChild
          >
            <a
              href="https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/"
              target="_blank"
              rel="noopener noreferrer"
            >
              {t("webhook_docs")}
              <ExternalLink className="size-3" />
            </a>
          </Button>
          <Button type="button" variant="ghost" size="icon" className="size-8" onClick={onClose} aria-label={t("close")}>
            <span className="sr-only">{t("close")}</span>
            <span className="text-lg leading-none">&times;</span>
          </Button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-3">
        {/* Left — listen / preview */}
        <div className="flex min-h-0 flex-col border-r">
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
            <p className="text-sm font-medium">{t("webhook_pull_events")}</p>
            <Button
              type="button"
              className={cn(ORANGE, "text-white", listening && "opacity-80")}
              onClick={listenForTest}
            >
              <Zap className="mr-2 size-4" />
              {listening ? t("webhook_listening") : t("webhook_listen_test")}
            </Button>
          </div>
          <div className="border-t p-4">
            <p className="text-muted-foreground mb-3 text-[11px] leading-relaxed">
              {t("webhook_production_hint")}
            </p>
            <div className="space-y-1.5">
              <Label className="text-xs">{t("webhook_trigger_when")}</Label>
              <Select value={triggerMode} onValueChange={(v) => patch({ webhookTriggerMode: v })}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="workflow_active">{t("webhook_trigger_workflow_active")}</SelectItem>
                  <SelectItem value="always">{t("webhook_trigger_always")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Middle — parameters */}
        <div className="flex min-h-0 flex-col border-r">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <Tabs defaultValue="parameters" className="flex-1">
              <div className="flex items-center justify-between gap-2">
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
                <Button type="button" size="sm" className={cn(ORANGE, "shrink-0 text-xs text-white")} onClick={listenForTest}>
                  <Zap className="mr-1.5 size-3.5" />
                  {t("webhook_listen_test")}
                </Button>
              </div>

              <TabsContent value="parameters" className="mt-0 max-h-[calc(100vh-10rem)] overflow-y-auto p-4">
                <Collapsible open={urlsOpen} onOpenChange={setUrlsOpen} className="mb-5">
                  <CollapsibleTrigger className="flex w-full items-center gap-2 text-sm font-medium">
                    <ChevronDown className={cn("size-4 transition-transform", urlsOpen && "rotate-180")} />
                    {t("webhook_urls_title")}
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-3 space-y-3">
                    <div className="bg-muted/40 inline-flex rounded-md p-0.5">
                      <button
                        type="button"
                        className={cn(
                          "rounded px-3 py-1 text-xs font-medium transition-colors",
                          urlMode === "test" ? "bg-background shadow-sm" : "text-muted-foreground",
                        )}
                        onClick={() => setUrlMode("test")}
                      >
                        {t("webhook_url_test")}
                      </button>
                      <button
                        type="button"
                        className={cn(
                          "rounded px-3 py-1 text-xs font-medium transition-colors",
                          urlMode === "production" ? "bg-background shadow-sm" : "text-muted-foreground",
                        )}
                        onClick={() => setUrlMode("production")}
                      >
                        {t("webhook_url_production")}
                      </button>
                    </div>
                    <div className="flex items-stretch gap-0 overflow-hidden rounded-md border">
                      <span className="bg-muted text-muted-foreground flex items-center px-2.5 font-mono text-xs font-semibold">
                        {httpMethod}
                      </span>
                      <Input
                        readOnly
                        value={displayUrl}
                        className="h-9 flex-1 rounded-none border-0 font-mono text-xs shadow-none focus-visible:ring-0"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-9 shrink-0 rounded-none"
                        onClick={() => void copyUrl()}
                        aria-label={t("webhook_copy_url")}
                      >
                        <Copy className="size-3.5" />
                      </Button>
                    </div>
                  </CollapsibleContent>
                </Collapsible>

                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t("field_http_method")}</Label>
                    <Select value={httpMethod} onValueChange={(v) => patch({ httpMethod: v })}>
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="GET">{t("opt_http_get")}</SelectItem>
                        <SelectItem value="POST">{t("opt_http_post")}</SelectItem>
                        <SelectItem value="PUT">{t("opt_http_put")}</SelectItem>
                        <SelectItem value="DELETE">{t("opt_http_delete")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">{t("webhook_path")}</Label>
                    <Input
                      value={path}
                      className="h-9 font-mono text-xs"
                      onChange={(e) => patch({ webhookPath: e.target.value })}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">{t("webhook_authentication")}</Label>
                    <Select value={authentication} onValueChange={(v) => patch({ webhookAuth: v })}>
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{t("webhook_auth_none")}</SelectItem>
                        <SelectItem value="basic">{t("webhook_auth_basic")}</SelectItem>
                        <SelectItem value="header">{t("webhook_auth_header")}</SelectItem>
                        <SelectItem value="jwt">{t("webhook_auth_jwt")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">{t("webhook_respond")}</Label>
                    <Select value={respond} onValueChange={(v) => patch({ webhookRespond: v })}>
                      <SelectTrigger className="h-9">
                        <SelectValue>{t(respondLabel)}</SelectValue>
                      </SelectTrigger>
                      <SelectContent className="min-w-[var(--radix-select-trigger-width)]">
                        {WEBHOOK_RESPOND_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value} className="py-2.5">
                            <div className="flex flex-col gap-0.5">
                              <span
                                className={cn(
                                  "text-sm font-medium",
                                  respond === opt.value ? "text-[#ff6f00]" : "text-foreground",
                                )}
                              >
                                {t(opt.titleKey)}
                              </span>
                              <span className="text-muted-foreground text-xs leading-snug">{t(opt.descKey)}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="rounded-md border border-[#ff6f00]/30 bg-[#ff6f00]/5 px-3 py-2.5 text-xs leading-relaxed text-[#9a3412] dark:text-[#fdba74]">
                    {t("webhook_content_type_hint")}
                  </div>

                  <div className="space-y-3">
                    <Label className="text-xs">{t("field_options")}</Label>
                    {WEBHOOK_EXTRA_OPTIONS.filter((o) => o.id in webhookOptions).map((opt) => (
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
                            checked={!!webhookOptions[opt.id]}
                            onCheckedChange={(v) => patchOption(opt.id, v)}
                          />
                        ) : opt.type === "textarea" ? (
                          <Textarea
                            value={String(webhookOptions[opt.id] ?? "")}
                            rows={3}
                            className="text-xs"
                            onChange={(e) => patchOption(opt.id, e.target.value)}
                          />
                        ) : (
                          <Input
                            type={opt.type === "number" ? "number" : "text"}
                            value={String(webhookOptions[opt.id] ?? "")}
                            className="h-9 text-xs"
                            onChange={(e) =>
                              patchOption(
                                opt.id,
                                opt.type === "number" ? Number(e.target.value) : e.target.value,
                              )
                            }
                          />
                        )}
                      </div>
                    ))}
                    {Object.keys(webhookOptions).length === 0 ? (
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

              <TabsContent value="settings" className="mt-0 max-h-[calc(100vh-10rem)] overflow-y-auto p-4">
                <div className="divide-y">
                  <SettingsToggleRow
                    label={t("webhook_allow_multiple_methods")}
                    checked={allowMultipleMethods}
                    onCheckedChange={(v) => patch({ webhookAllowMultipleMethods: v })}
                  />
                  <SettingsToggleRow
                    label={t("webhook_always_output_data")}
                    checked={alwaysOutputData}
                    onCheckedChange={(v) => patch({ webhookAlwaysOutputData: v })}
                    trailing={
                      <Button type="button" variant="ghost" size="icon" className="size-6 shrink-0" aria-label={t("webhook_more_options")}>
                        <MoreVertical className="size-3.5" />
                      </Button>
                    }
                  />
                  <SettingsToggleRow
                    label={t("webhook_execute_once")}
                    checked={executeOnce}
                    onCheckedChange={(v) => patch({ webhookExecuteOnce: v })}
                  />
                  <SettingsToggleRow
                    label={t("webhook_retry_on_fail")}
                    checked={retryOnFail}
                    onCheckedChange={(v) => patch({ webhookRetryOnFail: v })}
                  />
                </div>

                <div className="mt-4 space-y-1.5">
                  <Label className="text-sm font-normal">{t("webhook_on_error")}</Label>
                  <Select value={onError} onValueChange={(v) => patch({ webhookOnError: v })}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {WEBHOOK_ON_ERROR_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {t(opt.labelKey)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="mt-4 space-y-1.5">
                  <Label className="text-sm font-normal">{t("webhook_notes")}</Label>
                  <Textarea
                    value={notes}
                    rows={4}
                    className="resize-none text-sm"
                    onChange={(e) => patch({ webhookNotes: e.target.value })}
                  />
                </div>

                <div className="mt-2">
                  <SettingsToggleRow
                    label={t("webhook_display_note_in_flow")}
                    checked={displayNoteInFlow}
                    onCheckedChange={(v) => patch({ webhookDisplayNoteInFlow: v })}
                  />
                </div>

                <div className="border-t pt-4">
                  <p className="text-muted-foreground text-xs">{t("webhook_node_version")}</p>
                </div>
              </TabsContent>
            </Tabs>
          </div>
          <p className="text-muted-foreground border-t px-4 py-2 text-[11px] italic">{t("webhook_wish")}</p>
        </div>

        {/* Right — output */}
        <div className="flex min-h-0 flex-col">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              {t("section_output")}
            </h3>
            <Button type="button" variant="ghost" size="icon" className="size-7" aria-label={t("webhook_edit_output")}>
              <Pencil className="size-3.5" />
            </Button>
          </div>

          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
            {hasOutput ? (
              <pre className="max-h-full w-full overflow-auto rounded-md border p-3 text-left font-mono text-xs">
                {JSON.stringify(output, null, 2)}
              </pre>
            ) : (
              <>
                <Zap className="text-muted-foreground/50 size-10" />
                <p className="text-muted-foreground text-sm">{t("webhook_no_trigger_output")}</p>
                {onExecuteStep ? (
                  <Button
                    type="button"
                    className={cn(ORANGE, "text-white")}
                    onClick={() => onExecuteStep(node.id)}
                  >
                    {t("webhook_test_trigger")}
                  </Button>
                ) : null}
                <button
                  type="button"
                  className="text-muted-foreground text-xs underline-offset-2 hover:underline"
                  onClick={() => patch({ _output: { body: {}, headers: {}, query: {} } })}
                >
                  {t("webhook_set_mock_data")}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
