"use client";

import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { WorkflowNodeFieldDefinition, WorkflowNodeFieldType, WorkflowNodeSectionId } from "@/lib/workflow-node-registry";

const FIELD_TYPES: WorkflowNodeFieldType[] = [
  "text",
  "textarea",
  "select",
  "toggle",
  "number",
  "json",
  "expression",
  "info",
  "options-group",
  "resource-link",
];

type NodeFieldEditorProps = {
  sectionId: WorkflowNodeSectionId;
  fields: WorkflowNodeFieldDefinition[];
  onChange: (fields: WorkflowNodeFieldDefinition[]) => void;
  readOnly?: boolean;
};

export function NodeFieldEditor({ sectionId, fields, onChange, readOnly }: NodeFieldEditorProps) {
  const t = useTranslations("WorkflowNodeRegistry");

  const addField = () => {
    const id = `field_${Date.now()}`;
    onChange([
      ...fields,
      {
        id,
        type: "text",
        labelKey: `custom_${id}`,
        order: fields.length,
      },
    ]);
  };

  const updateField = (index: number, patch: Partial<WorkflowNodeFieldDefinition>) => {
    const next = [...fields];
    next[index] = { ...next[index], ...patch };
    onChange(next);
  };

  const removeField = (index: number) => {
    onChange(fields.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>{t(`section_${sectionId}`)} — {t("fields_label")}</Label>
        {!readOnly ? (
          <Button type="button" variant="outline" size="sm" onClick={addField}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            {t("add_field")}
          </Button>
        ) : null}
      </div>

      {fields.length === 0 ? (
        <p className="text-muted-foreground text-xs">{t("no_fields")}</p>
      ) : (
        <div className="space-y-3">
          {fields.map((field, index) => (
            <div key={`${field.id}-${index}`} className="space-y-2 rounded-lg border p-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs">{t("field_id")}</Label>
                  <Input
                    value={field.id}
                    disabled={readOnly || field.id === "label"}
                    onChange={(e) => updateField(index, { id: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t("field_type")}</Label>
                  <Select
                    value={field.type}
                    disabled={readOnly}
                    onValueChange={(v) => updateField(index, { type: v as WorkflowNodeFieldType })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FIELD_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {t(`type_${type}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label className="text-xs">{t("field_label_key")}</Label>
                  <Input
                    value={field.labelKey}
                    disabled={readOnly}
                    onChange={(e) => updateField(index, { labelKey: e.target.value })}
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label className="text-xs">{t("field_description_key")}</Label>
                  <Input
                    value={field.descriptionKey ?? ""}
                    disabled={readOnly}
                    onChange={(e) => updateField(index, { descriptionKey: e.target.value || undefined })}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Switch
                    id={`req-${field.id}`}
                    checked={!!field.required}
                    disabled={readOnly}
                    onCheckedChange={(v) => updateField(index, { required: v })}
                  />
                  <Label htmlFor={`req-${field.id}`} className="text-xs">
                    {t("field_required")}
                  </Label>
                </div>
                {!readOnly && field.id !== "label" ? (
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeField(index)}>
                    <Trash2 className="text-destructive h-3.5 w-3.5" />
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
