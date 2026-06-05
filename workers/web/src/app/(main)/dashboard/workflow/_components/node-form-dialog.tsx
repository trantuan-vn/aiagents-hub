"use client";

import { useEffect, useState } from "react";

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  CreateWorkflowNodeInput,
  WorkflowNodeCategory,
  WorkflowNodeDefinition,
  WorkflowNodeSectionDefinition,
} from "@/lib/workflow-node-registry";
import { defaultInputSection, defaultOutputSection, defaultParametersSection } from "@/lib/workflow-node-registry";

import { NodeFieldEditor } from "./node-field-editor";

const CATEGORIES: WorkflowNodeCategory[] = ["trigger", "core", "ai", "action", "human", "resource", "utility"];

const RUNTIME_TYPES = [
  "agent",
  "trigger",
  "flow",
  "core",
  "http_request",
  "code",
  "action_in_app",
  "data_transformation",
  "human_review",
  "service_node",
  "memory_node",
  "tool_node",
];

type NodeFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  node?: WorkflowNodeDefinition | null;
  onSubmit: (data: CreateWorkflowNodeInput | Partial<WorkflowNodeDefinition>) => Promise<void>;
};

function emptyCustomNode(): CreateWorkflowNodeInput {
  return {
    id: `custom_${Date.now()}`,
    runtimeType: "core",
    nameKey: "custom_node_name",
    descriptionKey: "custom_node_desc",
    category: "utility",
    isBuiltin: false,
    isActive: true,
    sections: [defaultInputSection(), defaultParametersSection(), defaultOutputSection()],
  };
}

export function NodeFormDialog({ open, onOpenChange, node, onSubmit }: NodeFormDialogProps) {
  const t = useTranslations("WorkflowNodeRegistry");
  const isEdit = !!node;
  const readOnlyBuiltin = node?.isBuiltin ?? false;

  const [form, setForm] = useState<CreateWorkflowNodeInput>(emptyCustomNode());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (node) {
      setForm({
        id: node.id,
        runtimeType: node.runtimeType,
        kind: node.kind,
        nameKey: node.nameKey,
        descriptionKey: node.descriptionKey,
        category: node.category,
        icon: node.icon,
        isBuiltin: node.isBuiltin,
        isActive: node.isActive,
        sections: node.sections,
      });
    } else {
      setForm(emptyCustomNode());
    }
  }, [open, node]);

  const updateSection = (sectionId: WorkflowNodeSectionDefinition["id"], fields: WorkflowNodeSectionDefinition["fields"]) => {
    setForm((prev) => ({
      ...prev,
      sections: prev.sections.map((s) => (s.id === sectionId ? { ...s, fields } : s)),
    }));
  };

  const handleSubmit = async () => {
    setSaving(true);
    try {
      await onSubmit(form);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? t("edit_node") : t("create_node")}</DialogTitle>
          <DialogDescription>
            {readOnlyBuiltin ? t("edit_builtin_hint") : t("form_description")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>{t("node_id")}</Label>
              <Input
                value={form.id}
                disabled={isEdit}
                onChange={(e) => setForm((p) => ({ ...p, id: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>{t("runtime_type")}</Label>
              <Select
                value={form.runtimeType}
                disabled={readOnlyBuiltin}
                onValueChange={(v) => setForm((p) => ({ ...p, runtimeType: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RUNTIME_TYPES.map((rt) => (
                    <SelectItem key={rt} value={rt}>
                      {rt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{t("name_key")}</Label>
              <Input
                value={form.nameKey}
                onChange={(e) => setForm((p) => ({ ...p, nameKey: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>{t("category")}</Label>
              <Select
                value={form.category}
                disabled={readOnlyBuiltin}
                onValueChange={(v) => setForm((p) => ({ ...p, category: v as WorkflowNodeCategory }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {t(`category_${cat}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>{t("description_key")}</Label>
              <Input
                value={form.descriptionKey}
                onChange={(e) => setForm((p) => ({ ...p, descriptionKey: e.target.value }))}
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="node-active"
                checked={form.isActive}
                onCheckedChange={(v) => setForm((p) => ({ ...p, isActive: v }))}
              />
              <Label htmlFor="node-active">{t("is_active")}</Label>
            </div>
          </div>

          <Tabs defaultValue="parameters">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="input">{t("section_input")}</TabsTrigger>
              <TabsTrigger value="parameters">{t("section_parameters")}</TabsTrigger>
              <TabsTrigger value="output">{t("section_output")}</TabsTrigger>
            </TabsList>
            {(["input", "parameters", "output"] as const).map((sectionId) => {
              const section = form.sections.find((s) => s.id === sectionId);
              return (
                <TabsContent key={sectionId} value={sectionId} className="mt-3">
                  <NodeFieldEditor
                    sectionId={sectionId}
                    fields={section?.fields ?? []}
                    readOnly={false}
                    onChange={(fields) => updateSection(sectionId, fields)}
                  />
                </TabsContent>
              );
            })}
          </Tabs>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={saving}>
            {saving ? t("saving") : isEdit ? t("save") : t("create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
