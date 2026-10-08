"use client";

import { useTranslations } from "next-intl";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { EnterpriseFormField } from "@/lib/enterprise-api";

const INPUT_TYPES = new Set(["number", "email", "date", "password", "url"]);

type Values = Record<string, unknown>;

/** Form built from the trigger's `fields` (§5A.8); values are keyed by `fieldName`. */
export function EnterpriseFormFields({
  fields,
  values,
  onChange,
}: {
  fields: EnterpriseFormField[];
  values: Values;
  onChange: (next: Values) => void;
}) {
  const t = useTranslations("EnterpriseWorkflowsTab");
  if (fields.length === 0) return <p className="text-muted-foreground text-sm">{t("form_no_fields")}</p>;

  return (
    <div className="min-w-0 max-w-full space-y-3">
      {fields.map((f) => (
        <FieldRow
          key={f.fieldName}
          field={f}
          value={values[f.fieldName]}
          onChange={(v) => onChange({ ...values, [f.fieldName]: v })}
        />
      ))}
    </div>
  );
}

function FieldRow({
  field,
  value,
  onChange,
}: {
  field: EnterpriseFormField;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const id = `ef-${field.fieldName}`;
  const type = field.fieldType.toLowerCase();
  const label = (
    <Label htmlFor={id} className="min-w-0 wrap-anywhere">
      {field.label || field.fieldName}
      {field.required ? <span className="text-destructive"> *</span> : null}
    </Label>
  );

  if (type === "checkbox") {
    return (
      <div className="flex min-w-0 items-center gap-2">
        <Checkbox id={id} className="shrink-0" checked={value === true} onCheckedChange={(v) => onChange(v === true)} />
        {label}
      </div>
    );
  }
  return (
    <div className="min-w-0 space-y-1.5">
      {label}
      <FieldInput id={id} field={field} type={type} value={value} onChange={onChange} />
    </div>
  );
}

function FieldInput({
  id,
  field,
  type,
  value,
  onChange,
}: {
  id: string;
  field: EnterpriseFormField;
  type: string;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const t = useTranslations("EnterpriseWorkflowsTab");
  const text = typeof value === "string" || typeof value === "number" ? String(value) : "";

  if (type === "dropdown" && field.options?.length) {
    return (
      <Select value={text} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-full min-w-0 max-w-full">
          <SelectValue placeholder={t("form_select")} />
        </SelectTrigger>
        <SelectContent className="max-w-[var(--radix-select-trigger-width)]">
          {field.options.map((o) => (
            <SelectItem key={o} value={o} className="wrap-anywhere whitespace-normal">
              {o}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  if (type === "textarea") {
    return (
      <Textarea
        id={id}
        required={field.required}
        value={text}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        className="field-sizing-fixed min-w-0 max-w-full wrap-anywhere"
      />
    );
  }
  const inputType = INPUT_TYPES.has(type) ? type : "text";
  const parse = (raw: string) => (inputType === "number" && raw !== "" ? Number(raw) : raw);
  return (
    <Input
      id={id}
      type={inputType}
      required={field.required}
      value={text}
      onChange={(e) => onChange(parse(e.target.value))}
      className="min-w-0 max-w-full"
    />
  );
}
