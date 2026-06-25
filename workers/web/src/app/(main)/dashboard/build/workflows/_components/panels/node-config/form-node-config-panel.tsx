"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { Node } from "@xyflow/react";
import { ChevronDown, ClipboardList, Copy, GripVertical, Plus, Trash2, Zap } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useDashboardUser } from "@/app/(main)/dashboard/_context/dashboard-user-context";

import { createWorkflowTrigger, listWorkflowTriggers } from "../../../_lib/api";
import { buildFormPublicUrl } from "./form-url";
import { NodeMockOutputSection } from "./node-mock-output-section";

const ORANGE = "bg-[#ff6f00] hover:bg-[#e66300]";

const FORM_AUTH_OPTIONS = [
  { value: "none", labelKey: "form_auth_none" },
  { value: "basic", labelKey: "form_auth_basic" },
  { value: "header", labelKey: "form_auth_header" },
] as const;

const FORM_ELEMENT_TYPES = [
  { value: "text", labelKey: "form_type_text" },
  { value: "textarea", labelKey: "form_type_textarea" },
  { value: "number", labelKey: "form_type_number" },
  { value: "email", labelKey: "form_type_email" },
  { value: "dropdown", labelKey: "form_type_dropdown" },
  { value: "date", labelKey: "form_type_date" },
  { value: "file", labelKey: "form_type_file" },
  { value: "password", labelKey: "form_type_password" },
  { value: "hidden", labelKey: "form_type_hidden" },
] as const;

const FORM_RESPOND_WHEN_OPTIONS = [
  { value: "form_submitted", labelKey: "form_respond_submitted" },
  { value: "workflow_finishes", labelKey: "form_respond_workflow_finishes" },
] as const;

const FORM_RESPONSE_MODE_OPTIONS = [
  { value: "text", labelKey: "form_respond_with_text" },
  { value: "redirect", labelKey: "form_respond_with_redirect" },
  { value: "last_node", labelKey: "form_respond_with_last_node" },
] as const;

const PLACEHOLDER_TYPES = new Set(["text", "textarea", "number", "email", "password"]);

export type FormElement = {
  id: string;
  label: string;
  fieldType: string;
  fieldName: string;
  placeholder?: string;
  requiredField?: boolean;
  multipleFiles?: boolean;
  acceptedFileTypes?: string;
  fieldOptions?: string;
};

export type FormNodeConfigPanelProps = {
  node: Node;
  workflowId?: number;
  ownerId?: string;
  onClose: () => void;
  onPatchData: (nodeId: string, patch: Record<string, unknown>) => void;
  onExecuteStep?: (nodeId: string) => void;
};

export function isFormNode(node: Node): boolean {
  const d = (node.data ?? {}) as Record<string, unknown>;
  return (d.triggerKind === "form" && d.formKind !== "database") || node.type === "form";
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function defaultPath(nodeId: string): string {
  return nodeId.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 36) || "form";
}

function createElement(): FormElement {
  return {
    id: crypto.randomUUID(),
    label: "",
    fieldType: "text",
    fieldName: "",
    requiredField: false,
  };
}

export function FormNodeConfigPanel({
  node,
  workflowId,
  ownerId,
  onClose,
  onPatchData,
  onExecuteStep,
}: FormNodeConfigPanelProps) {
  const t = useTranslations("WorkflowNodeRegistry");
  const te = useTranslations("WorkflowEditorPage");
  const dashboardUser = useDashboardUser();
  const resolvedOwnerId = ownerId ?? dashboardUser?.id;

  const nodeData = (node.data ?? {}) as Record<string, unknown>;
  const path = String(nodeData.formPath ?? defaultPath(node.id));
  const auth = String(nodeData.formAuth ?? "none");
  const formTitle = String(nodeData.formTitle ?? "");
  const formDescription = String(nodeData.formDescription ?? "");
  const respondWhen = String(nodeData.formRespondWhen ?? "form_submitted");
  const responseMode = String(nodeData.formResponseMode ?? "text");
  const responseText = String(nodeData.formResponseText ?? "");
  const elements = useMemo<FormElement[]>(
    () => (Array.isArray(nodeData.formElements) ? (nodeData.formElements as FormElement[]) : []),
    [nodeData.formElements],
  );

  const [urlMode, setUrlMode] = useState<"test" | "production">("test");
  const [urlsOpen, setUrlsOpen] = useState(true);
  const [triggerOwnerId, setTriggerOwnerId] = useState<string | undefined>();

  const patch = useCallback(
    (fields: Record<string, unknown>) => onPatchData(node.id, fields),
    [node.id, onPatchData],
  );

  const effectiveOwnerId = triggerOwnerId ?? resolvedOwnerId;

  const formUrl = useMemo(() => {
    if (!workflowId || isNaN(workflowId)) {
      return buildFormPublicUrl({
        workflowId: 0,
        formPath: path,
        mode: urlMode === "production" ? "production" : "test",
        ownerId: effectiveOwnerId,
      }).replace("/0/", "/{workflowId}/");
    }
    return buildFormPublicUrl({
      workflowId,
      formPath: path,
      mode: urlMode === "production" ? "production" : "test",
      ownerId: effectiveOwnerId,
    });
  }, [workflowId, urlMode, path, effectiveOwnerId]);

  useEffect(() => {
    if (!workflowId || isNaN(workflowId)) return;
    void (async () => {
      try {
        const { triggers } = await listWorkflowTriggers(workflowId);
        const existing = triggers.find(
          (tr) => tr.type === "form" && (tr.nodeId === node.id || tr.webhookPath === path),
        );
        if (existing) {
          if (existing.ownerId) setTriggerOwnerId(existing.ownerId);
          return;
        }
        const { trigger } = await createWorkflowTrigger(workflowId, {
          type: "form",
          nodeId: node.id,
          webhookPath: path,
        });
        if (trigger?.ownerId) setTriggerOwnerId(trigger.ownerId);
      } catch {
        /* optional */
      }
    })();
  }, [workflowId, node.id, path]);

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(formUrl);
      toast.success(t("webhook_output_copied"));
    } catch {
      toast.error(t("webhook_copy_failed"));
    }
  };

  const updateElement = (index: number, fields: Partial<FormElement>) => {
    const next = elements.map((el, i) => (i === index ? { ...el, ...fields } : el));
    patch({ formElements: next });
  };

  const addElement = () => {
    patch({ formElements: [...elements, createElement()] });
  };

  const removeElement = (index: number) => {
    patch({ formElements: elements.filter((_, i) => i !== index) });
  };

  return (
    <div className="bg-background absolute inset-0 z-50 flex flex-col">
      <header className="flex items-center justify-between border-b px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <div className="flex size-7 items-center justify-center rounded-md bg-[#ff6f00]/10">
            <ClipboardList className="size-4 text-[#ff6f00]" />
          </div>
          <h2 className="text-sm font-semibold">{String(nodeData.label ?? te("trigger_kind_form"))}</h2>
        </div>
        <Button type="button" variant="ghost" size="icon" className="size-8" onClick={onClose} aria-label={t("close")}>
          <span className="sr-only">{t("close")}</span>
          <span className="text-lg leading-none">&times;</span>
        </Button>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-3">
        {/* Left — test submission */}
        <div className="flex min-h-0 flex-col border-r">
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
            <p className="text-sm font-medium">{t("form_pull_test")}</p>
            {onExecuteStep ? (
              <Button type="button" className={cn(ORANGE, "text-white")} onClick={() => onExecuteStep(node.id)}>
                <Zap className="mr-2 size-4" />
                {t("form_execute_step")}
              </Button>
            ) : null}
          </div>
          <div className="border-t p-4">
            <p className="text-muted-foreground text-[11px] leading-relaxed">{t("form_production_hint")}</p>
          </div>
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
                  <Zap className="mr-1.5 size-3.5" />
                  {t("form_execute_step")}
                </Button>
              ) : null}
            </div>

            <TabsContent value="parameters" className="mt-0 min-h-0 flex-1 overflow-y-auto p-4">
              <Collapsible open={urlsOpen} onOpenChange={setUrlsOpen} className="mb-5">
                <CollapsibleTrigger className="text-[#ff6f00] flex w-full items-center gap-2 text-sm font-medium">
                  <ChevronDown className={cn("size-4 transition-transform", urlsOpen && "rotate-180")} />
                  {t("form_urls_title")}
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
                      {t("form_url_test")}
                    </button>
                    <button
                      type="button"
                      className={cn(
                        "rounded px-3 py-1 text-xs font-medium transition-colors",
                        urlMode === "production" ? "bg-background shadow-sm" : "text-muted-foreground",
                      )}
                      onClick={() => setUrlMode("production")}
                    >
                      {t("form_url_production")}
                    </button>
                  </div>
                  <div className="flex items-stretch gap-0 overflow-hidden rounded-md border">
                    <Input
                      readOnly
                      value={formUrl}
                      className="h-9 flex-1 rounded-none border-0 font-mono text-xs shadow-none focus-visible:ring-0"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-9 shrink-0 rounded-none"
                      onClick={() => void copyUrl()}
                      aria-label={t("form_copy_url")}
                    >
                      <Copy className="size-3.5" />
                    </Button>
                  </div>
                </CollapsibleContent>
              </Collapsible>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">{t("form_authentication")}</Label>
                  <Select value={auth} onValueChange={(v) => patch({ formAuth: v })}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FORM_AUTH_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {t(opt.labelKey)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">{t("form_title")}</Label>
                  <Input
                    value={formTitle}
                    placeholder={t("form_title_placeholder")}
                    className="h-9 text-xs"
                    onChange={(e) => patch({ formTitle: e.target.value })}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">{t("form_description")}</Label>
                  <Textarea
                    value={formDescription}
                    placeholder={t("form_description_placeholder")}
                    rows={2}
                    className="text-xs"
                    onChange={(e) => patch({ formDescription: e.target.value })}
                  />
                </div>

                {/* Form Elements */}
                <div className="space-y-3 border-t pt-4">
                  <Label className="text-xs font-semibold">{t("form_elements")}</Label>
                  {elements.map((el, index) => (
                    <FormElementCard
                      key={el.id}
                      element={el}
                      onChange={(fields) => updateElement(index, fields)}
                      onRemove={() => removeElement(index)}
                    />
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 w-full justify-center text-xs font-normal"
                    onClick={addElement}
                  >
                    <Plus className="mr-1.5 size-3.5" />
                    {t("form_add_element")}
                  </Button>
                </div>

                {/* Respond When */}
                <div className="space-y-1.5 border-t pt-4">
                  <Label className="text-xs">{t("form_respond_when")}</Label>
                  <Select value={respondWhen} onValueChange={(v) => patch({ formRespondWhen: v })}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FORM_RESPOND_WHEN_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {t(opt.labelKey)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="rounded-md border border-[#ff6f00]/30 bg-[#ff6f00]/5 px-3 py-2.5 text-xs leading-relaxed text-[#9a3412] dark:text-[#fdba74]">
                  {t("form_multistep_hint")}
                </div>

                {/* Options */}
                <div className="space-y-3 border-t pt-4">
                  <Label className="text-xs font-semibold">{t("form_options")}</Label>
                  <div className="space-y-3 rounded-md border px-3 py-3">
                    <p className="text-xs font-medium">{t("form_response")}</p>
                    <div className="space-y-1.5">
                      <Label className="text-xs">{t("form_respond_with")}</Label>
                      <Select value={responseMode} onValueChange={(v) => patch({ formResponseMode: v })}>
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {FORM_RESPONSE_MODE_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {t(opt.labelKey)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {responseMode === "text" ? (
                      <div className="space-y-1.5">
                        <Label className="text-xs">{t("form_text_to_show")}</Label>
                        <Textarea
                          value={responseText}
                          placeholder={t("form_text_to_show_default")}
                          rows={2}
                          className="text-xs"
                          onChange={(e) => patch({ formResponseText: e.target.value })}
                        />
                      </div>
                    ) : responseMode === "redirect" ? (
                      <div className="space-y-1.5">
                        <Label className="text-xs">{t("form_respond_with_redirect")}</Label>
                        <Input
                          value={responseText}
                          placeholder="https://example.com/thank-you"
                          className="h-9 text-xs"
                          onChange={(e) => patch({ formResponseText: e.target.value })}
                        />
                      </div>
                    ) : null}
                  </div>
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
                <Label className="text-sm font-normal">{t("form_path")}</Label>
                <Input
                  value={path}
                  className="h-9 font-mono text-xs"
                  onChange={(e) => patch({ formPath: e.target.value })}
                />
              </div>
            </TabsContent>
          </Tabs>
          <p className="text-muted-foreground shrink-0 border-t px-4 py-2 text-[11px] italic">{t("form_wish")}</p>
        </div>

        {/* Right — output */}
        <div className="flex min-h-0 flex-col">
          <NodeMockOutputSection
            output={nodeData._output}
            outputPinned={!!nodeData._outputPinned}
            onSaveOutput={(parsed) => patch({ _output: parsed, _outputPinned: true })}
            onUnpinOutput={() => patch({ _output: undefined, _outputPinned: false })}
            onExecute={onExecuteStep ? () => onExecuteStep(node.id) : undefined}
            executeLabel={t("webhook_test_trigger")}
            emptyLabel={t("webhook_no_trigger_output")}
          />
        </div>
      </div>
    </div>
  );
}

function FormElementCard({
  element,
  onChange,
  onRemove,
}: {
  element: FormElement;
  onChange: (fields: Partial<FormElement>) => void;
  onRemove: () => void;
}) {
  const t = useTranslations("WorkflowNodeRegistry");
  const isFile = element.fieldType === "file";
  const isDropdown = element.fieldType === "dropdown";
  const showPlaceholder = PLACEHOLDER_TYPES.has(element.fieldType);

  const onLabelChange = (label: string) => {
    const next: Partial<FormElement> = { label };
    if (!element.fieldName) next.fieldName = slugify(label);
    onChange(next);
  };

  return (
    <div className="relative space-y-3 rounded-md border px-3 py-3">
      <div className="flex items-start gap-2">
        <GripVertical className="text-muted-foreground/50 mt-6 size-4 shrink-0 cursor-grab" />
        <div className="min-w-0 flex-1 space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">{t("form_field_label")}</Label>
            <Input
              value={element.label}
              className="h-9 text-xs"
              onChange={(e) => onLabelChange(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">{t("form_field_type")}</Label>
            <Select value={element.fieldType} onValueChange={(v) => onChange({ fieldType: v })}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FORM_ELEMENT_TYPES.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {t(opt.labelKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">{t("form_field_name")}</Label>
            <Input
              value={element.fieldName}
              className="h-9 font-mono text-xs"
              onChange={(e) => onChange({ fieldName: e.target.value })}
            />
          </div>

          {showPlaceholder ? (
            <div className="space-y-1.5">
              <Label className="text-xs">{t("form_field_placeholder")}</Label>
              <Input
                value={element.placeholder ?? ""}
                className="h-9 text-xs"
                onChange={(e) => onChange({ placeholder: e.target.value })}
              />
            </div>
          ) : null}

          {isDropdown ? (
            <div className="space-y-1.5">
              <Label className="text-xs">{t("form_field_options")}</Label>
              <Textarea
                value={element.fieldOptions ?? ""}
                placeholder={t("form_field_options_hint")}
                rows={3}
                className="text-xs"
                onChange={(e) => onChange({ fieldOptions: e.target.value })}
              />
            </div>
          ) : null}

          {isFile ? (
            <>
              <div className="flex items-center justify-between gap-3">
                <Label className="text-xs font-normal">{t("form_field_multiple_files")}</Label>
                <Switch
                  checked={!!element.multipleFiles}
                  onCheckedChange={(v) => onChange({ multipleFiles: v })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t("form_field_accepted_types")}</Label>
                <Input
                  value={element.acceptedFileTypes ?? ""}
                  placeholder=".pdf,.png,.jpg,.jpeg"
                  className="h-9 text-xs"
                  onChange={(e) => onChange({ acceptedFileTypes: e.target.value })}
                />
                <p className="text-muted-foreground text-[11px]">{t("form_field_accepted_types_hint")}</p>
              </div>
            </>
          ) : null}

          <div className="flex items-center justify-between gap-3">
            <Label className="text-xs font-normal">{t("form_field_required")}</Label>
            <Switch
              checked={!!element.requiredField}
              onCheckedChange={(v) => onChange({ requiredField: v })}
            />
          </div>
        </div>
        <button
          type="button"
          className="text-muted-foreground hover:text-destructive mt-6 shrink-0"
          onClick={onRemove}
          aria-label={t("form_remove_element")}
        >
          <Trash2 className="size-4" />
        </button>
      </div>
    </div>
  );
}
