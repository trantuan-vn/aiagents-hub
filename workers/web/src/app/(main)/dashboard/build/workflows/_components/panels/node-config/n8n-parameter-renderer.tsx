"use client";

import { displayParameter } from "@/lib/n8n-workflow/display-parameter";
import type { N8nNodeParameters, N8nNodeProperty, N8nNodeTypeDescription } from "@/lib/n8n-workflow/types";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

import { ServiceEndpointSelect } from "../../service-endpoint-select";

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
    return (
      <div className="bg-muted/50 rounded-md border border-dashed px-3 py-2 text-xs">
        <p className="text-muted-foreground">{property.displayName}</p>
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
        <Input
          type="number"
          value={value != null ? String(value) : String(property.default ?? "")}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      </div>
    );
  }

  if (property.type === "json") {
    return (
      <div className="space-y-1.5">
        <Label>{property.displayName}</Label>
        {property.description ? (
          <p className="text-muted-foreground text-xs">{property.description}</p>
        ) : null}
        <Textarea
          value={typeof value === "string" ? value : value != null ? JSON.stringify(value, null, 2) : ""}
          rows={4}
          className="font-mono text-xs"
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    );
  }

  const rows = property.typeOptions?.rows ?? (property.type === "string" ? 1 : 4);
  if (rows > 1) {
    return (
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label>{property.displayName}</Label>
          {!property.noDataExpression ? (
            <span className="text-muted-foreground font-mono text-[10px]">fx</span>
          ) : null}
        </div>
        {property.description ? (
          <p className="text-muted-foreground text-xs">{property.description}</p>
        ) : null}
        <Textarea
          value={typeof value === "string" ? value : value != null ? String(value) : ""}
          placeholder={property.placeholder}
          rows={rows}
          className="font-mono text-xs"
          onChange={(e) => onChange(e.target.value)}
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
      <Input
        value={value != null ? String(value) : ""}
        placeholder={property.placeholder}
        onChange={(e) => onChange(e.target.value)}
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
