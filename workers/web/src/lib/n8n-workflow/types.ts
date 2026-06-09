/** Minimal n8n-compatible types (browser-safe; no n8n-workflow runtime import). */

export type N8nNodePropertyTypes =
  | "boolean"
  | "notice"
  | "callout"
  | "options"
  | "number"
  | "json"
  | "string"
  | "hidden";

export type N8nDisplayOptions = {
  show?: Record<string, Array<string | number | boolean>>;
  hide?: Record<string, Array<string | number | boolean>>;
};

export type N8nNodePropertyOption = {
  name: string;
  value: string | number | boolean;
};

export type N8nNodePropertyTypeOptions = {
  rows?: number;
  aiHubServiceSelect?: boolean;
};

export type N8nNodeProperty = {
  displayName: string;
  name: string;
  type: N8nNodePropertyTypes;
  default?: unknown;
  description?: string;
  placeholder?: string;
  required?: boolean;
  noDataExpression?: boolean;
  options?: N8nNodePropertyOption[];
  displayOptions?: N8nDisplayOptions;
  typeOptions?: N8nNodePropertyTypeOptions;
};

export type N8nNodeParameters = Record<string, unknown>;

export type N8nNodeTypeDescription = {
  displayName: string;
  name: string;
  description?: string;
  group?: string[];
  version?: number | number[];
  defaults?: { name?: string };
  inputs?: string[];
  outputs?: string[];
  properties: N8nNodeProperty[];
};
