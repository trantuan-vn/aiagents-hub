import { defaultInputSection, defaultOutputSection, defaultParametersSection } from "../default-sections";
import { createBuiltin } from "../create-builtin";
import type { WorkflowNodeDefinition } from "../../types/node-definition";
import { TOOL_KIND_FIELD, TOOL_KINDS, TOOL_OVERRIDE_KINDS, type ToolKind } from "./kinds";

export {
  TOOL_KIND_FIELD,
  TOOL_KINDS,
  TOOL_OVERRIDE_KINDS,
  type ToolKind,
} from "./kinds";

const RAG_COMMON_FIELDS = [
  {
    id: "toolName",
    type: "text" as const,
    labelKey: "field_tool_name",
    order: 2,
  },
  {
    id: "toolDescription",
    type: "textarea" as const,
    labelKey: "field_tool_description",
    order: 3,
  },
];

const SAVE_RAG_FIELDS = [
  {
    id: "serviceEndpoint",
    type: "text" as const,
    labelKey: "field_service",
    descriptionKey: "field_service_embed_desc",
    order: 4,
  },
  {
    id: "userPrompt",
    type: "textarea" as const,
    labelKey: "field_user_prompt",
    descriptionKey: "field_user_prompt_desc",
    order: 5,
  },
  {
    id: "systemPrompt",
    type: "textarea" as const,
    labelKey: "field_system_prompt",
    descriptionKey: "field_system_prompt_desc",
    order: 6,
  },
  { id: "chunkSize", type: "number" as const, labelKey: "field_chunk_size", defaultValue: 800, order: 7 },
  { id: "chunkOverlap", type: "number" as const, labelKey: "field_chunk_overlap", defaultValue: 120, order: 8 },
  {
    id: "inputMode",
    type: "select" as const,
    labelKey: "field_input_mode",
    defaultValue: "agent_tool_call",
    order: 9,
    options: [
      { value: "agent_tool_call", labelKey: "opt_input_agent_tool" },
      { value: "pipeline_auto", labelKey: "opt_input_pipeline_auto" },
    ],
  },
];

const GET_RAG_FIELDS = [
  { id: "topK", type: "number" as const, labelKey: "field_top_k", defaultValue: 5, order: 4 },
  { id: "scoreThreshold", type: "number" as const, labelKey: "field_score_threshold", defaultValue: 0.65, order: 5 },
  {
    id: "querySource",
    type: "select" as const,
    labelKey: "field_query_source",
    defaultValue: "from_agent_input",
    order: 6,
    options: [
      { value: "from_tool_args", labelKey: "opt_query_from_tool_args" },
      { value: "from_agent_input", labelKey: "opt_query_from_agent_input" },
    ],
  },
  { id: "includeMetadata", type: "toggle" as const, labelKey: "field_include_metadata", defaultValue: true, order: 7 },
];

const GET_DB_INFO_FIELDS = [
  { id: "includeSampleRows", type: "toggle" as const, labelKey: "field_include_sample_rows", defaultValue: true, order: 4 },
  { id: "sampleRowLimit", type: "number" as const, labelKey: "field_sample_row_limit", defaultValue: 10, order: 5 },
  { id: "includeSqlHistory", type: "toggle" as const, labelKey: "field_include_sql_history", defaultValue: true, order: 6 },
  { id: "sqlHistoryLimit", type: "number" as const, labelKey: "field_sql_history_limit", defaultValue: 10, order: 7 },
  {
    id: "sqlHistorySource",
    type: "select" as const,
    labelKey: "field_sql_history_source",
    defaultValue: "audit_log",
    order: 8,
    options: [
      { value: "audit_log", labelKey: "opt_sql_audit_log" },
      { value: "pg_stat", labelKey: "opt_sql_pg_stat" },
      { value: "custom_table", labelKey: "opt_sql_custom_table" },
    ],
  },
];

const TOOL_KIND_SELECT = {
  id: TOOL_KIND_FIELD,
  type: "select" as const,
  labelKey: "field_tool_kind",
  defaultValue: "http_request",
  options: TOOL_KINDS.map((value) => ({
    value,
    labelKey: toolNameKey(value),
  })),
  order: 1,
};

function toolNameKey(kind: ToolKind): string {
  switch (kind) {
    case "save-rag":
      return "tool_save_rag";
    case "get-rag":
      return "tool_get_rag";
    case "get-db-info":
      return "tool_get_db_info";
    case "agent":
      return "tool_pick_agent";
    case "workflow":
      return "tool_pick_workflow";
    case "code":
      return "tool_pick_code";
    case "http_request":
      return "tool_pick_http";
    case "mcp":
      return "tool_category_mcp";
    default:
      return `tool_kind_${kind}`;
  }
}

function toolDescKey(kind: ToolKind): string {
  switch (kind) {
    case "save-rag":
      return "tool_save_rag_desc";
    case "get-rag":
      return "tool_get_rag_desc";
    case "get-db-info":
      return "tool_get_db_info_desc";
    case "agent":
      return "tool_pick_agent_desc";
    case "workflow":
      return "tool_pick_workflow_desc";
    case "code":
      return "tool_pick_code_desc";
    case "http_request":
      return "tool_pick_http_desc";
    case "mcp":
      return "tool_category_mcp_desc";
    default:
      return `tool_kind_${kind}_desc`;
  }
}

/** Base family — fallback when no toolKind is set. */
export const TOOL_NODE_DEFINITION: WorkflowNodeDefinition = createBuiltin({
  id: "tool_node",
  runtimeType: "tool_node",
  nameKey: "node_tool",
  descriptionKey: "node_tool_desc",
  category: "resource",
  icon: "Wrench",
  sections: [
    defaultInputSection(),
    defaultParametersSection([TOOL_KIND_SELECT, ...RAG_COMMON_FIELDS]),
    defaultOutputSection(false),
  ],
});

export function createToolKindDefinition(kind: ToolKind): WorkflowNodeDefinition {
  return createBuiltin({
    id: `tool_node:${kind}`,
    runtimeType: "tool_node",
    kind,
    nameKey: toolNameKey(kind),
    descriptionKey: toolDescKey(kind),
    category: "resource",
    icon: "Wrench",
    defaultData: {
      label: kind.replace(/-/g, " "),
      [TOOL_KIND_FIELD]: kind,
    },
    sections: [
      defaultInputSection(),
      defaultParametersSection([
        { ...TOOL_KIND_SELECT, defaultValue: kind },
        ...RAG_COMMON_FIELDS,
      ]),
      defaultOutputSection(false),
    ],
  });
}

export const SAVE_RAG_TOOL_DEFINITION: WorkflowNodeDefinition = createBuiltin({
  id: "tool_node:save-rag",
  runtimeType: "tool_node",
  kind: "save-rag",
  nameKey: "tool_save_rag",
  descriptionKey: "tool_save_rag_desc",
  category: "resource",
  icon: "Upload",
  defaultData: {
    toolKind: "save-rag",
    toolName: "save_rag",
  },
  sections: [
    defaultInputSection(),
    defaultParametersSection([...RAG_COMMON_FIELDS, ...SAVE_RAG_FIELDS]),
    defaultOutputSection(false),
  ],
});

export const GET_RAG_TOOL_DEFINITION: WorkflowNodeDefinition = createBuiltin({
  id: "tool_node:get-rag",
  runtimeType: "tool_node",
  kind: "get-rag",
  nameKey: "tool_get_rag",
  descriptionKey: "tool_get_rag_desc",
  category: "resource",
  icon: "Search",
  defaultData: {
    toolKind: "get-rag",
    toolName: "get_rag",
  },
  sections: [
    defaultInputSection(),
    defaultParametersSection([...RAG_COMMON_FIELDS, ...GET_RAG_FIELDS]),
    defaultOutputSection(false),
  ],
});

export const GET_DB_INFO_TOOL_DEFINITION: WorkflowNodeDefinition = createBuiltin({
  id: "tool_node:get-db-info",
  runtimeType: "tool_node",
  kind: "get-db-info",
  nameKey: "tool_get_db_info",
  descriptionKey: "tool_get_db_info_desc",
  category: "resource",
  icon: "TableProperties",
  defaultData: {
    toolKind: "get-db-info",
    toolName: "get_db_info",
  },
  sections: [
    defaultInputSection(),
    defaultParametersSection([...RAG_COMMON_FIELDS, ...GET_DB_INFO_FIELDS]),
    defaultOutputSection(false),
  ],
});

export const TOOL_KIND_DEFINITIONS: WorkflowNodeDefinition[] = TOOL_KINDS.filter(
  (kind) => !TOOL_OVERRIDE_KINDS.has(kind),
).map(createToolKindDefinition);

export const TOOL_KIND_DEFAULTS: Record<string, Record<string, unknown>> = {
  "save-rag": {
    toolKind: "save-rag",
    toolName: "save_rag",
    toolDescription: "Embed document chunks and upsert into the knowledge base.",
    serviceEndpoint: "",
    userPrompt: "When document text is available, call save_rag with the full extracted content.",
    systemPrompt: "Use save_rag to persist extracted document text into the knowledge base.",
    chunkSize: 800,
    chunkOverlap: 120,
    inputMode: "agent_tool_call",
  },
  "get-rag": {
    toolKind: "get-rag",
    toolName: "get_rag",
    toolDescription: "Search the knowledge base for passages relevant to the user question.",
    topK: 5,
    scoreThreshold: 0.65,
    querySource: "from_agent_input",
    includeMetadata: true,
  },
  "get-db-info": {
    toolKind: "get-db-info",
    toolName: "get_db_info",
    toolDescription: "List tables in the connected database. The loop + Save RAG node introspects each table.",
    includeSampleRows: true,
    sampleRowLimit: 10,
    includeSqlHistory: true,
    sqlHistoryLimit: 10,
    sqlHistorySource: "audit_log",
  },
};
