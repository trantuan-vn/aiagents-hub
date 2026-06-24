import type { HandleDefinition } from "./handles";

/** Field types supported in node input / parameters / output sections. */
export type WorkflowNodeFieldType =
  | "text"
  | "textarea"
  | "select"
  | "toggle"
  | "number"
  | "json"
  | "expression"
  | "info"
  | "options-group"
  | "resource-link";

export type WorkflowNodeSectionId = "input" | "parameters" | "output";

export type WorkflowNodeFieldOption = {
  value: string;
  labelKey: string;
};

export type WorkflowNodeFieldDefinition = {
  id: string;
  type: WorkflowNodeFieldType;
  labelKey: string;
  descriptionKey?: string;
  required?: boolean;
  defaultValue?: unknown;
  placeholderKey?: string;
  options?: WorkflowNodeFieldOption[];
  /** For expression / textarea fields */
  supportsExpression?: boolean;
  /** Hide in builder unless admin extended the node */
  adminOnly?: boolean;
  order?: number;
};

export type WorkflowNodeSectionDefinition = {
  id: WorkflowNodeSectionId;
  labelKey: string;
  descriptionKey?: string;
  /** schema | table | json — IO panels support multiple view modes */
  viewModes?: ("schema" | "table" | "json")[];
  fields: WorkflowNodeFieldDefinition[];
  showExecuteStep?: boolean;
};

export type WorkflowNodeCategory =
  | "trigger"
  | "core"
  | "ai"
  | "action"
  | "human"
  | "resource"
  | "utility"
  | "flow";

export type WorkflowNodeDefinition = {
  /** Unique registry id, e.g. `agent` or `core:http_request` */
  id: string;
  /** Runtime React Flow / executor type */
  runtimeType: string;
  /** Optional sub-kind stored in node.data */
  kind?: string;
  nameKey: string;
  descriptionKey: string;
  category: WorkflowNodeCategory;
  icon?: string;
  isBuiltin: boolean;
  isActive: boolean;
  sections: WorkflowNodeSectionDefinition[];
  defaultData?: Record<string, unknown>;
  handles?: HandleDefinition[];
  createdAt?: string;
  updatedAt?: string;
};

export type WorkflowNodeRegistry = {
  nodes: WorkflowNodeDefinition[];
  updatedAt?: string;
};
