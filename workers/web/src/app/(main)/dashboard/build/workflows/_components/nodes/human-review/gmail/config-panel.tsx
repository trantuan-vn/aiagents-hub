"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { Edge, Node } from "@xyflow/react";
import { AlertTriangle, CheckCircle2, Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import {
  listWorkflowCredentials,
  type WorkflowCredential,
} from "../../../../_lib/api";
import { resolveInputNodeId } from "../../../edges/workflow-connection-utils";
import { AgentUpstreamInputPanel } from "../../../panels/node-config/agent-upstream-input-panel";
import { ExpressionDropField } from "../../../panels/node-config/expression-drop-field";
import { NodeMockOutputSection } from "../../../panels/node-config/node-mock-output-section";
import { WorkflowExecuteStepButton } from "../../../node-ui/workflow-execute-step-button";
import type { NodeConfigPanelProps } from "../../types";
import { GmailCredentialDialog } from "./credential-dialog";

type NamedOption = { id: string; label?: string; name?: string; value: string };

function isGmailSmtpCredential(cred: WorkflowCredential): boolean {
  return cred.meta?.authMethod === "smtp" || (cred.meta?.provider === "gmail" && cred.type === "basic");
}

function RequiredMark({ show }: { show: boolean }) {
  if (!show) return null;
  return <AlertTriangle className="size-4 shrink-0 text-red-500" aria-hidden />;
}

function OptionCollection({
  title,
  items,
  onAdd,
  onRemove,
  labelKey,
  addLabel,
}: {
  title: string;
  items: NamedOption[];
  onAdd: () => void;
  onRemove: (id: string) => void;
  labelKey: "label" | "name";
  addLabel: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium">{title}</Label>
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground rounded p-0.5"
          onClick={onAdd}
          aria-label={title}
        >
          <Plus className="size-4" />
        </button>
      </div>
      {items.length > 0 ? (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.id} className="flex items-center gap-2 rounded-md border px-2 py-1.5">
              <span className="min-w-0 flex-1 truncate text-xs">
                {labelKey === "label" ? item.label || item.value : item.name || item.value}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7 shrink-0"
                onClick={() => onRemove(item.id)}
              >
                <X className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>
      ) : null}
      <Button type="button" variant="outline" size="sm" className="h-8 w-full text-xs" onClick={onAdd}>
        {addLabel}
      </Button>
    </div>
  );
}

export function isGmailHumanReviewNode(node: Node): boolean {
  const d = (node.data ?? {}) as Record<string, unknown>;
  return node.type === "human_review" && d.channel === "gmail";
}

export type GmailHumanReviewConfigPanelProps = NodeConfigPanelProps & {
  nodes?: Node[];
  edges?: Edge[];
};

export function GmailHumanReviewConfigPanel({
  node,
  nodes = [],
  edges = [],
  onClose,
  onPatchData,
  onExecuteStep,
}: GmailHumanReviewConfigPanelProps) {
  const t = useTranslations("WorkflowNodeRegistry");
  const te = useTranslations("WorkflowEditorPage");

  const nodeData = (node.data ?? {}) as Record<string, unknown>;
  const credentialKey = String(nodeData.credentialKey ?? "");
  const resource = String(nodeData.resource ?? "message");
  const operation = String(nodeData.operation ?? "sendAndWait");
  const to = String(nodeData.to ?? "");
  const subject = String(nodeData.subject ?? "");
  const message = String(nodeData.message ?? "");
  const responseType = String(nodeData.responseType ?? "approval");
  const approvalOptions = (Array.isArray(nodeData.approvalOptions)
    ? nodeData.approvalOptions
    : []) as NamedOption[];
  const options = (Array.isArray(nodeData.options) ? nodeData.options : []) as NamedOption[];

  const [gmailCredentials, setGmailCredentials] = useState<WorkflowCredential[]>([]);
  const [credentialDialogOpen, setCredentialDialogOpen] = useState(false);

  const patch = useCallback(
    (fields: Record<string, unknown>) => onPatchData(node.id, fields),
    [node.id, onPatchData],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { credentials } = await listWorkflowCredentials();
        if (!cancelled) {
          setGmailCredentials(credentials.filter(isGmailSmtpCredential));
        }
      } catch {
        if (!cancelled) setGmailCredentials([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [credentialDialogOpen]);

  const selectedCredential = useMemo(
    () => gmailCredentials.find((c) => c.credentialKey === credentialKey),
    [gmailCredentials, credentialKey],
  );

  const inputNodeId = useMemo(
    () => resolveInputNodeId(node.id, node.type ?? "", edges),
    [node.id, node.type, edges],
  );

  const openSetup = () => setCredentialDialogOpen(true);
  const sendFromValue = selectedCredential ? credentialKey : "__platform__";

  return (
    <div className="bg-background absolute inset-0 z-50 flex flex-col">
      <header className="flex items-center justify-between border-b px-4 py-2">
        <div>
          <h2 className="text-sm font-semibold">
            {String(nodeData.label ?? te("human_review_channel_gmail"))}
          </h2>
          <p className="text-muted-foreground text-xs">{te("human_review_channel_gmail_desc")}</p>
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
                <WorkflowExecuteStepButton
                  nodeId={node.id}
                  size="sm"
                  className="shrink-0 text-xs"
                  onClick={() => onExecuteStep(node.id)}
                  label={te("menu_execute_step")}
                  executingLabel={te("menu_executing_step")}
                />
              ) : null}
            </div>

            <TabsContent value="parameters" className="mt-0 min-h-0 flex-1 overflow-y-auto p-4">
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Select
                    value={sendFromValue}
                    onValueChange={(v) => patch({ credentialKey: v === "__platform__" ? "" : v })}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__platform__">{t("gmail_send_from_platform")}</SelectItem>
                      {gmailCredentials.map((cred) => (
                        <SelectItem key={cred.credentialKey} value={cred.credentialKey}>
                          {cred.meta?.username
                            ? `${t("gmail_send_from_gmail")} (${cred.meta.username})`
                            : cred.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedCredential ? (
                    <div className="flex items-start gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                      <p className="text-emerald-950 dark:text-emerald-100 min-w-0 flex-1 truncate text-xs">
                        {selectedCredential.meta?.username || selectedCredential.name}
                      </p>
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-xs">{t("gmail_platform_hint")}</p>
                  )}
                  <button
                    type="button"
                    className="text-[#ff6f00] text-xs font-medium underline-offset-2 hover:underline"
                    onClick={openSetup}
                  >
                    {t("gmail_connect_smtp")}
                  </button>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">{t("gmail_field_resource")}</Label>
                  <Select value={resource} onValueChange={(v) => patch({ resource: v })}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="message">{t("gmail_resource_message")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">{t("gmail_field_operation")}</Label>
                  <Select value={operation} onValueChange={(v) => patch({ operation: v })}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sendAndWait">{t("gmail_operation_send_and_wait")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-xs">{t("gmail_field_to")}</Label>
                    <RequiredMark show={!to.trim()} />
                  </div>
                  <ExpressionDropField
                    value={to}
                    placeholder={t("gmail_to_placeholder")}
                    onChange={(v) => patch({ to: v })}
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-xs">{t("gmail_field_subject")}</Label>
                    <RequiredMark show={!subject.trim()} />
                  </div>
                  <ExpressionDropField
                    value={subject}
                    placeholder={t("gmail_subject_placeholder")}
                    onChange={(v) => patch({ subject: v })}
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-xs">{t("gmail_field_message")}</Label>
                    <RequiredMark show={!message.trim()} />
                  </div>
                  <ExpressionDropField
                    value={message}
                    multiline
                    rows={4}
                    placeholder={t("gmail_message_placeholder")}
                    onChange={(v) => patch({ message: v })}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">{t("gmail_field_response_type")}</Label>
                  <Select value={responseType} onValueChange={(v) => patch({ responseType: v })}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="approval">{t("gmail_response_approval")}</SelectItem>
                      <SelectItem value="freeText">{t("gmail_response_free_text")}</SelectItem>
                      <SelectItem value="customForm">{t("gmail_response_custom_form")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {responseType === "approval" ? (
                  <OptionCollection
                    title={t("gmail_approval_options")}
                    items={approvalOptions}
                    labelKey="label"
                    addLabel={t("gmail_add_option")}
                    onAdd={() =>
                      patch({
                        approvalOptions: [
                          ...approvalOptions,
                          {
                            id: crypto.randomUUID(),
                            label: `Option ${approvalOptions.length + 1}`,
                            value: `option_${approvalOptions.length + 1}`,
                          },
                        ],
                      })
                    }
                    onRemove={(id) =>
                      patch({ approvalOptions: approvalOptions.filter((o) => o.id !== id) })
                    }
                  />
                ) : null}

                <OptionCollection
                  title={t("gmail_options")}
                  items={options}
                  labelKey="name"
                  addLabel={t("gmail_add_option")}
                  onAdd={() =>
                    patch({
                      options: [
                        ...options,
                        {
                          id: crypto.randomUUID(),
                          name: `Option ${options.length + 1}`,
                          value: `option_${options.length + 1}`,
                        },
                      ],
                    })
                  }
                  onRemove={(id) => patch({ options: options.filter((o) => o.id !== id) })}
                />
              </div>
            </TabsContent>

            <TabsContent value="settings" className="mt-0 p-4">
              <p className="text-muted-foreground text-xs">{t("settings_placeholder")}</p>
            </TabsContent>
          </Tabs>
        </div>

        <NodeMockOutputSection
          output={nodeData._output}
          outputPinned={!!nodeData._outputPinned}
          onSaveOutput={(parsed) => onPatchData(node.id, { _output: parsed, _outputPinned: true })}
          onUnpinOutput={() => onPatchData(node.id, { _output: undefined, _outputPinned: false })}
          onExecute={onExecuteStep ? () => onExecuteStep(node.id) : undefined}
          executeNodeId={node.id}
        />
      </div>

      <GmailCredentialDialog
        open={credentialDialogOpen}
        onOpenChange={setCredentialDialogOpen}
        initialEmail={selectedCredential?.meta?.username ?? ""}
        onSaved={(key, name, email) => {
          setGmailCredentials((prev) => {
            const exists = prev.some((c) => c.credentialKey === key);
            if (exists) {
              return prev.map((c) =>
                c.credentialKey === key
                  ? {
                      ...c,
                      name,
                      type: "basic",
                      meta: {
                        ...c.meta,
                        provider: "gmail",
                        username: email,
                        authMethod: "smtp",
                      },
                    }
                  : c,
              );
            }
            return [
              ...prev,
              {
                id: 0,
                credentialKey: key,
                name,
                type: "basic",
                meta: { provider: "gmail", username: email, authMethod: "smtp" },
              },
            ];
          });
          patch({ credentialKey: key });
        }}
      />
    </div>
  );
}
