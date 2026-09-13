"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { Node } from "@xyflow/react";
import { CHAT_TRIGGER_DEFAULT_INITIAL_MESSAGES } from "@aiagents-hub/workflow-nodes";
import { ChevronDown, MessageCircle, Plus, Zap } from "lucide-react";
import { useTranslations } from "next-intl";

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
import { useDashboardUser } from "@/app/(main)/dashboard/_context/dashboard-user-context";

import {
  createWorkflowTrigger,
  listWorkflowCredentials,
  listWorkflowTriggers,
  type WorkflowCredential,
} from "../../../_lib/api";
import type { NodeConfigPanelProps } from "../../nodes/types";
import { workflowEditorChatStore } from "../../editor/workflow-editor-chat-store";
import { FormBasicCredentialDialog } from "./form-credential-dialog";
import { NodeMockOutputSection } from "./node-mock-output-section";
import { buildChatPublicUrl, resolveChatPath } from "./chat-url";

const ORANGE = "bg-[#ff6f00] hover:bg-[#e66300]";

const CHAT_AUTH_OPTIONS = [
  { value: "none", labelKey: "chat_auth_none" },
  { value: "basic", labelKey: "chat_auth_basic" },
  { value: "hub_users", labelKey: "chat_auth_hub_users" },
] as const;

const CHAT_MODE_OPTIONS = [
  { value: "hostedChat", labelKey: "chat_mode_hosted" },
  { value: "webhook", labelKey: "chat_mode_embedded" },
] as const;

const CHAT_EXTRA_OPTIONS = [
  { id: "allowedOrigins", labelKey: "chat_opt_allowed_origins", type: "text" as const, defaultValue: "*" },
  { id: "inputPlaceholder", labelKey: "chat_opt_input_placeholder", type: "text" as const, defaultValue: "Type your question.." },
  {
    id: "loadPreviousSession",
    labelKey: "chat_opt_load_previous_session",
    type: "select" as const,
    defaultValue: "notSupported",
    options: [
      { value: "notSupported", labelKey: "chat_opt_session_off" },
      { value: "memory", labelKey: "chat_opt_session_memory" },
      { value: "manually", labelKey: "chat_opt_session_manually" },
    ],
  },
  { id: "title", labelKey: "chat_opt_title", type: "text" as const, defaultValue: "Hi there! 👋" },
  {
    id: "subtitle",
    labelKey: "chat_opt_subtitle",
    type: "text" as const,
    defaultValue: "Start a chat. We're here to help you 24/7.",
  },
  { id: "showWelcomeScreen", labelKey: "chat_opt_welcome_screen", type: "toggle" as const, defaultValue: false },
  { id: "getStarted", labelKey: "chat_opt_get_started", type: "text" as const, defaultValue: "New Conversation" },
  {
    id: "responseMode",
    labelKey: "chat_opt_response_mode",
    type: "select" as const,
    defaultValue: "lastNode",
    options: [
      { value: "lastNode", labelKey: "chat_opt_response_last_node" },
      { value: "responseNodes", labelKey: "chat_opt_response_nodes" },
      { value: "streaming", labelKey: "chat_opt_response_streaming" },
    ],
  },
  { id: "allowFileUploads", labelKey: "chat_opt_file_uploads", type: "toggle" as const, defaultValue: false },
  { id: "customCss", labelKey: "chat_opt_custom_css", type: "textarea" as const, defaultValue: "" },
] as const;

type ChatExtraOptionId = (typeof CHAT_EXTRA_OPTIONS)[number]["id"];

const CHAT_MOCK_JSON = `{
  "sessionId": "session-test",
  "action": "sendMessage",
  "chatInput": "Hello"
}`;

export type ChatTriggerConfigPanelProps = NodeConfigPanelProps;

export function isChatTriggerNode(node: Node): boolean {
  const d = (node.data ?? {}) as Record<string, unknown>;
  return d.triggerKind === "chat";
}

export function ChatTriggerConfigPanel({
  node,
  workflowId,
  ownerId,
  listeningNodeId,
  onClose,
  onPatchData,
  onExecuteStep,
  onStopListen,
}: ChatTriggerConfigPanelProps) {
  const t = useTranslations("WorkflowNodeRegistry");
  const te = useTranslations("WorkflowEditorPage");
  const dashboardUser = useDashboardUser();
  const resolvedOwnerId = ownerId ?? dashboardUser?.id;
  const isListening = listeningNodeId === node.id;

  const nodeData = (node.data ?? {}) as Record<string, unknown>;
  const path = resolveChatPath(nodeData, node.id);
  const chatPublic = nodeData.chatPublic !== false;
  const chatMode = String(nodeData.chatMode ?? "hostedChat");
  const rawAuth = String(nodeData.chatAuth ?? "none");
  const auth = rawAuth === "basicAuth" ? "basic" : rawAuth === "n8nUserAuth" || rawAuth === "header" ? "hub_users" : rawAuth;
  const chatCredentialKey = String(nodeData.chatCredentialKey ?? "");
  const initialMessages = String(nodeData.initialMessages ?? CHAT_TRIGGER_DEFAULT_INITIAL_MESSAGES);
  const chatOptions = (nodeData.chatOptions ?? {}) as Record<string, unknown>;
  const notes = String(nodeData.chatNotes ?? "");
  const alwaysOutputData = !!nodeData.chatAlwaysOutputData;
  const displayNoteInFlow = !!nodeData.chatDisplayNoteInFlow;

  const [urlsOpen, setUrlsOpen] = useState(true);
  const [triggerOwnerId, setTriggerOwnerId] = useState<string | undefined>();
  const [basicCredentials, setBasicCredentials] = useState<WorkflowCredential[]>([]);
  const [credentialDialogOpen, setCredentialDialogOpen] = useState(false);
  const [addOptionOpen, setAddOptionOpen] = useState(false);
  const [publicExprMode, setPublicExprMode] = useState(false);

  const patch = useCallback(
    (fields: Record<string, unknown>) => onPatchData(node.id, fields),
    [node.id, onPatchData],
  );

  const effectiveOwnerId = triggerOwnerId ?? resolvedOwnerId;
  const chatUrl = useMemo(() => {
    return buildChatPublicUrl({
      workflowId: workflowId && !Number.isNaN(workflowId) ? workflowId : 0,
      chatPath: path,
      mode: "production",
      ownerId: effectiveOwnerId,
      hosted: chatMode !== "webhook",
    }).replace("/0/", "/{workflowId}/");
  }, [workflowId, path, effectiveOwnerId, chatMode]);

  useEffect(() => {
    if (!workflowId || Number.isNaN(workflowId)) return;
    void (async () => {
      try {
        const { triggers } = await listWorkflowTriggers(workflowId);
        const existing = triggers.find(
          (tr) => tr.type === "chat" && (tr.nodeId === node.id || tr.webhookPath === path),
        );
        if (existing) {
          if (existing.ownerId) setTriggerOwnerId(existing.ownerId);
          return;
        }
        const { trigger } = await createWorkflowTrigger(workflowId, {
          type: "chat",
          nodeId: node.id,
          webhookPath: path,
        });
        if (trigger?.ownerId) setTriggerOwnerId(trigger.ownerId);
      } catch {
        /* optional */
      }
    })();
  }, [workflowId, node.id, path]);

  useEffect(() => {
    if (auth !== "basic") return;
    void (async () => {
      try {
        const { credentials } = await listWorkflowCredentials();
        setBasicCredentials(credentials.filter((c) => c.type === "basic"));
      } catch {
        setBasicCredentials([]);
      }
    })();
  }, [auth]);

  const availableOptions = CHAT_EXTRA_OPTIONS.filter((o) => !(o.id in chatOptions));

  const addOption = (optionId: ChatExtraOptionId) => {
    const def = CHAT_EXTRA_OPTIONS.find((o) => o.id === optionId);
    if (!def || optionId in chatOptions) return;
    patch({ chatOptions: { ...chatOptions, [optionId]: def.defaultValue } });
    setAddOptionOpen(false);
  };

  const removeOption = (optionId: string) => {
    const next = { ...chatOptions };
    delete next[optionId];
    patch({ chatOptions: next });
  };

  const patchOption = (optionId: string, value: unknown) => {
    patch({ chatOptions: { ...chatOptions, [optionId]: value } });
  };

  const openChat = () => {
    if (isListening) {
      workflowEditorChatStore.show();
      return;
    }
    onExecuteStep?.(node.id);
  };

  const title = String(nodeData.label ?? te("trigger_chat_node_label"));
  const hosted = chatPublic && chatMode === "hostedChat";

  return (
    <div className="bg-background absolute inset-0 z-50 flex flex-col">
      <header className="flex items-center justify-between border-b px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <div className="flex size-7 items-center justify-center rounded-md bg-[#ff6f00]/10">
            <MessageCircle className="size-4 text-[#ff6f00]" />
          </div>
          <h2 className="text-sm font-semibold">{title}</h2>
        </div>
        <Button type="button" variant="ghost" size="icon" className="size-8" onClick={onClose} aria-label={t("close")}>
          <span className="sr-only">{t("close")}</span>
          <span className="text-lg leading-none">&times;</span>
        </Button>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(340px,2fr)_3fr]">
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
              <Button
                type="button"
                size="sm"
                className={cn(ORANGE, "shrink-0 text-xs text-white")}
                onClick={openChat}
              >
                <MessageCircle className="mr-1.5 size-3.5" />
                {t("chat_open")}
              </Button>
            </div>

            <TabsContent value="parameters" className="mt-0 min-h-0 flex-1 overflow-y-auto p-4">
              {chatPublic ? (
                <Collapsible open={urlsOpen} onOpenChange={setUrlsOpen} className="mb-5">
                  <CollapsibleTrigger className="text-[#ff6f00] flex w-full items-center gap-2 text-sm font-medium">
                    <ChevronDown className={cn("size-4 transition-transform", urlsOpen && "rotate-180")} />
                    {t("chat_url_title")}
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-3 space-y-2">
                    <p className="text-muted-foreground text-xs">{t("chat_url_hide_hint")}</p>
                    <p className="break-all font-mono text-xs leading-relaxed">{chatUrl}</p>
                  </CollapsibleContent>
                </Collapsible>
              ) : null}

              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <Switch checked={chatPublic} onCheckedChange={(v) => patch({ chatPublic: v })} />
                    <Label className="text-sm font-normal">{t("chat_make_public")}</Label>
                  </div>
                  <div className="bg-muted/40 inline-flex shrink-0 rounded-md p-0.5">
                    <button
                      type="button"
                      className={cn(
                        "rounded px-2 py-0.5 text-[10px] font-medium",
                        !publicExprMode ? "bg-background shadow-sm" : "text-muted-foreground",
                      )}
                      onClick={() => setPublicExprMode(false)}
                    >
                      {t("chat_fixed")}
                    </button>
                    <button
                      type="button"
                      className={cn(
                        "rounded px-2 py-0.5 text-[10px] font-medium",
                        publicExprMode ? "bg-background shadow-sm" : "text-muted-foreground",
                      )}
                      onClick={() => setPublicExprMode(true)}
                    >
                      {t("chat_expression")}
                    </button>
                  </div>
                </div>

                {chatPublic ? (
                  <>
                    <div className="space-y-1.5">
                      <Label className="text-xs">{t("chat_mode")}</Label>
                      <Select value={chatMode} onValueChange={(v) => patch({ chatMode: v })}>
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CHAT_MODE_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {t(opt.labelKey)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-100">
                      {chatMode === "webhook" ? t("chat_embedded_notice") : t("chat_hosted_notice")}
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs">{t("chat_authentication")}</Label>
                      <Select
                        value={auth}
                        onValueChange={(v) => {
                          const next: Record<string, unknown> = { chatAuth: v };
                          if (v !== "basic") next.chatCredentialKey = "";
                          patch(next);
                        }}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CHAT_AUTH_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {t(opt.labelKey)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {auth === "basic" ? (
                      <div className="space-y-1.5">
                        <Label className="text-xs">{t("form_credential_for_basic")}</Label>
                        <div className="flex gap-2">
                          <Select
                            value={chatCredentialKey || "__none__"}
                            onValueChange={(v) => patch({ chatCredentialKey: v === "__none__" ? "" : v })}
                          >
                            <SelectTrigger className="h-9 flex-1">
                              <SelectValue placeholder={t("form_credential_none_yet")} />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">{t("form_credential_none_yet")}</SelectItem>
                              {basicCredentials.map((cred) => (
                                <SelectItem key={cred.credentialKey} value={cred.credentialKey}>
                                  {cred.name}
                                  {cred.meta.username ? ` (${cred.meta.username})` : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-9 shrink-0 text-xs"
                            onClick={() => setCredentialDialogOpen(true)}
                          >
                            {t("form_credential_setup")}
                          </Button>
                        </div>
                      </div>
                    ) : null}

                    {auth === "hub_users" ? (
                      <p className="text-muted-foreground text-[11px] leading-relaxed">{t("chat_auth_hub_users_hint")}</p>
                    ) : null}

                    {hosted ? (
                      <div className="space-y-1.5">
                        <Label className="text-xs">{t("chat_initial_messages")}</Label>
                        <Textarea
                          value={initialMessages}
                          rows={3}
                          className="text-xs"
                          onChange={(e) => patch({ initialMessages: e.target.value })}
                        />
                      </div>
                    ) : null}
                  </>
                ) : null}

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">{t("field_options")}</Label>
                    <Popover open={addOptionOpen} onOpenChange={setAddOptionOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          disabled={availableOptions.length === 0}
                          aria-label={t("chat_add_field")}
                        >
                          <Plus className="size-3.5" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-64 p-1" align="end">
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

                  {CHAT_EXTRA_OPTIONS.filter((o) => o.id in chatOptions).map((opt) => (
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
                        <Switch checked={!!chatOptions[opt.id]} onCheckedChange={(v) => patchOption(opt.id, v)} />
                      ) : opt.type === "textarea" ? (
                        <Textarea
                          value={String(chatOptions[opt.id] ?? "")}
                          rows={3}
                          className="text-xs"
                          onChange={(e) => patchOption(opt.id, e.target.value)}
                        />
                      ) : opt.type === "select" && "options" in opt ? (
                        <Select
                          value={String(chatOptions[opt.id] ?? opt.defaultValue)}
                          onValueChange={(v) => patchOption(opt.id, v)}
                        >
                          <SelectTrigger className="h-9">
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
                        <Input
                          value={String(chatOptions[opt.id] ?? "")}
                          className="h-9 text-xs"
                          onChange={(e) => patchOption(opt.id, e.target.value)}
                        />
                      )}
                    </div>
                  ))}

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 w-full justify-start text-xs font-normal"
                    disabled={availableOptions.length === 0}
                    onClick={() => setAddOptionOpen(true)}
                  >
                    <Plus className="mr-1.5 size-3.5" />
                    {t("chat_add_field")}
                  </Button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="settings" className="mt-0 min-h-0 flex-1 overflow-y-auto p-4">
              <div className="space-y-1.5">
                <Label className="text-sm font-normal">{t("form_field_label")}</Label>
                <Input
                  value={String(nodeData.label ?? "")}
                  className="h-9 text-sm"
                  onChange={(e) => patch({ label: e.target.value })}
                />
              </div>
              <div className="mt-4 space-y-1.5">
                <Label className="text-sm font-normal">{t("chat_path")}</Label>
                <Input
                  value={path}
                  className="h-9 font-mono text-xs"
                  onChange={(e) => patch({ chatPath: e.target.value })}
                />
              </div>
              <div className="mt-4 flex items-center justify-between gap-3 py-2">
                <Label className="text-sm font-normal">{t("webhook_always_output_data")}</Label>
                <Switch checked={alwaysOutputData} onCheckedChange={(v) => patch({ chatAlwaysOutputData: v })} />
              </div>
              <div className="mt-2 space-y-1.5">
                <Label className="text-sm font-normal">{t("webhook_notes")}</Label>
                <Textarea
                  value={notes}
                  rows={4}
                  className="resize-none text-sm"
                  onChange={(e) => patch({ chatNotes: e.target.value })}
                />
              </div>
              <div className="mt-2 flex items-center justify-between gap-3 py-2">
                <Label className="text-sm font-normal">{t("webhook_display_note_in_flow")}</Label>
                <Switch checked={displayNoteInFlow} onCheckedChange={(v) => patch({ chatDisplayNoteInFlow: v })} />
              </div>
            </TabsContent>
          </Tabs>
          <p className="text-muted-foreground shrink-0 border-t px-4 py-2 text-[11px] italic">{t("chat_wish")}</p>
        </div>

        <div className="flex min-h-0 flex-col">
          <NodeMockOutputSection
            output={nodeData._output}
            outputPinned={!!nodeData._outputPinned}
            onSaveOutput={(parsed) => patch({ _output: parsed, _outputPinned: true })}
            onUnpinOutput={() => patch({ _output: undefined, _outputPinned: false })}
            onExecute={onExecuteStep ? () => onExecuteStep(node.id) : undefined}
            executeNodeId={node.id}
            executeLabel={t("webhook_test_trigger")}
            emptyLabel={t("webhook_no_trigger_output")}
            emptyIcon={<Zap className="text-muted-foreground/40 size-10 stroke-[1.5]" />}
            defaultMockJson={CHAT_MOCK_JSON}
            node={node}
          />
        </div>
      </div>

      <FormBasicCredentialDialog
        open={credentialDialogOpen}
        onOpenChange={setCredentialDialogOpen}
        onSaved={(credentialKey, name) => {
          setBasicCredentials((prev) => {
            const exists = prev.some((c) => c.credentialKey === credentialKey);
            if (exists) return prev;
            return [
              {
                id: Date.now(),
                credentialKey,
                name,
                type: "basic",
                meta: {},
              },
              ...prev,
            ];
          });
          patch({ chatCredentialKey: credentialKey });
        }}
      />
    </div>
  );
}
