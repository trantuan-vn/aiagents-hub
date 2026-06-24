"use client";

import { displayParameter } from "@/lib/n8n-workflow/display-parameter";
import type { N8nNodeParameters, N8nNodeProperty, N8nNodeTypeDescription } from "@/lib/n8n-workflow/types";

import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

import { ServiceEndpointSelect } from "../../node-ui/service-endpoint-select";
import { ExpressionDropField } from "./expression-drop-field";

type N8nParameterRendererProps = {
  description: N8nNodeTypeDescription;
  parameters: N8nNodeParameters;
  onChange: (name: string, value: unknown) => void;
};

function isPropertyVisible(property: N8nNodeProperty, parameters: N8nNodeParameters): boolean {
  if (property.type === "hidden") return false;
  return displayParameter(parameters, property);
}

function N8nPropertyField({
  property,
  value,
  onChange,
}: {
  property: N8nNodeProperty;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  if (property.typeOptions?.aiHubServiceSelect) {
    return (
      <ServiceEndpointSelect
        value={typeof value === "string" ? value : ""}
        onChange={(endpoint) => onChange(endpoint)}
      />
    );
  }

  if (property.type === "notice" || property.type === "callout") {
    const isWarning = property.typeOptions?.variant === "warning";
    return (
      <div
        className={
          isWarning
            ? "rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-100"
            : "bg-muted/50 rounded-md border border-dashed px-3 py-2 text-xs"
        }
      >
        <p className={isWarning ? undefined : "text-muted-foreground"}>{property.displayName}</p>
        {property.description ? (
          <p className={isWarning ? "mt-1 opacity-80" : "text-muted-foreground mt-1"}>{property.description}</p>
        ) : null}
      </div>
    );
  }

  if (property.type === "boolean") {
    return (
      <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
        <div>
          <Label className="text-sm">{property.displayName}</Label>
          {property.description ? (
            <p className="text-muted-foreground text-xs">{property.description}</p>
          ) : null}
        </div>
        <Switch checked={!!value} onCheckedChange={onChange} />
      </div>
    );
  }

  if (property.type === "options") {
    const options = property.options ?? [];
    return (
      <div className="space-y-1.5">
        <Label>{property.displayName}</Label>
        {property.description ? (
          <p className="text-muted-foreground text-xs">{property.description}</p>
        ) : null}
        <Select value={String(value ?? property.default ?? "")} onValueChange={onChange}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((opt) => (
              <SelectItem key={String(opt.value)} value={String(opt.value)}>
                {opt.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  if (property.type === "number") {
    return (
      <div className="space-y-1.5">
        <Label>{property.displayName}</Label>
        {property.description ? (
          <p className="text-muted-foreground text-xs">{property.description}</p>
        ) : null}
        <ExpressionDropField
          value={value != null ? String(value) : String(property.default ?? "")}
          numeric
          showFx={!property.noDataExpression}
          onChange={(v) => onChange(v.includes("{{") ? v : Number(v))}
        />
      </div>
    );
  }

  if (property.type === "json") {
    const stringValue =
      typeof value === "string" ? value : value != null ? JSON.stringify(value, null, 2) : "";
    return (
      <div className="space-y-1.5">
        <Label>{property.displayName}</Label>
        {property.description ? (
          <p className="text-muted-foreground text-xs">{property.description}</p>
        ) : null}
        <ExpressionDropField
          value={stringValue}
          multiline
          rows={4}
          showFx={!property.noDataExpression}
          onChange={onChange}
        />
      </div>
    );
  }

  const rows = property.typeOptions?.rows ?? (property.type === "string" ? 1 : 4);
  const allowExpression = !property.noDataExpression;
  if (rows > 1) {
    return (
      <div className="space-y-1.5">
        <Label>{property.displayName}</Label>
        {property.description ? (
          <p className="text-muted-foreground text-xs">{property.description}</p>
        ) : null}
        <ExpressionDropField
          value={typeof value === "string" ? value : value != null ? String(value) : ""}
          placeholder={property.placeholder}
          multiline
          rows={rows}
          showFx={allowExpression}
          onChange={onChange}
        />
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <Label>{property.displayName}</Label>
      {property.description ? (
        <p className="text-muted-foreground text-xs">{property.description}</p>
      ) : null}
      <ExpressionDropField
        value={value != null ? String(value) : ""}
        placeholder={property.placeholder}
        showFx={allowExpression}
        onChange={onChange}
      />
    </div>
  );
}

/** Renders node parameters using n8n-compatible schema + displayParameter visibility rules. */
export function N8nParameterRenderer({ description, parameters, onChange }: N8nParameterRendererProps) {
  const visibleProperties = description.properties.filter((property) =>
    isPropertyVisible(property, parameters),
  );

  return (
    <div className="space-y-4">
      {visibleProperties.map((property) => (
        <N8nPropertyField
          key={property.name}
          property={property}
          value={parameters[property.name] ?? property.default}
          onChange={(value) => onChange(property.name, value)}
        />
      ))}
    </div>
  );
}
