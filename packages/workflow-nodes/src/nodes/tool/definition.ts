import { defaultInputSection, defaultOutputSection, defaultParametersSection } from "../default-sections";
import type { WorkflowNodeDefinition } from "../../types/node-definition";

const now = () => new Date().toISOString();

function builtin(
  partial: Omit<WorkflowNodeDefinition, "isBuiltin" | "isActive" | "createdAt" | "updatedAt">,
): WorkflowNodeDefinition {
  const ts = now();
  return { ...partial, isBuiltin: true, isActive: true, createdAt: ts, updatedAt: ts };
}

const TOOL_KIND_FIELD = {
  id: "toolKind",
  type: "select" as const,
  labelKey: "field_tool_kind",
  defaultValue: "http-request",
  options: [
    { value: "http-request", labelKey: "tool_http" },
    { value: "code", labelKey: "tool_code" },
    { value: "save-rag", labelKey: "tool_save_rag" },
    { value: "get-rag", labelKey: "tool_get_rag" },
    { value: "get-db-info", labelKey: "tool_get_db_info" },
  ],
  order: 1,
};

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
  { id: "inputMode", type: "select" as const, labelKey: "field_input_mode", defaultValue: "agent_tool_call", order: 9,
    options: [
      { value: "agent_tool_call", labelKey: "opt_input_agent_tool" },
      { value: "pipeline_auto", labelKey: "opt_input_pipeline_auto" },
    ],
  },
];

export const SAVE_RAG_TOOL_DEFINITION = builtin({
  id: "tool_node:save-rag",
  runtimeType: "tool_node",
  kind: "save-rag",
  nameKey: "tool_save_rag",
  descriptionKey: "tool_save_rag_desc",
  category: "resource",
  icon: "Upload",
  sections: [
    defaultInputSection(),
    defaultParametersSection([
      ...RAG_COMMON_FIELDS,
      ...SAVE_RAG_FIELDS,
    ]),
    defaultOutputSection(false),
  ],
});

const GET_RAG_FIELDS = [
  { id: "topK", type: "number" as const, labelKey: "field_top_k", defaultValue: 5, order: 4 },
  { id: "scoreThreshold", type: "number" as const, labelKey: "field_score_threshold", defaultValue: 0.65, order: 5 },
  { id: "querySource", type: "select" as const, labelKey: "field_query_source", defaultValue: "from_tool_args", order: 6,
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
  { id: "sqlHistorySource", type: "select" as const, labelKey: "field_sql_history_source", defaultValue: "audit_log", order: 8,
    options: [
      { value: "audit_log", labelKey: "opt_sql_audit_log" },
      { value: "pg_stat", labelKey: "opt_sql_pg_stat" },
      { value: "custom_table", labelKey: "opt_sql_custom_table" },
    ],
  },
];

export const TOOL_NODE_DEFINITION = builtin({
  id: "tool_node",
  runtimeType: "tool_node",
  nameKey: "node_tool",
  descriptionKey: "node_tool_desc",
  category: "resource",
  icon: "Wrench",
  sections: [
    defaultInputSection(),
    defaultParametersSection([
      TOOL_KIND_FIELD,
      ...RAG_COMMON_FIELDS,
      ...SAVE_RAG_FIELDS,
      ...GET_RAG_FIELDS,
      ...GET_DB_INFO_FIELDS,
    ]),
    defaultOutputSection(false),
  ],
});

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
    querySource: "from_tool_args",
    includeMetadata: true,
  },
  "get-db-info": {
    toolKind: "get-db-info",
    toolName: "get_db_info",
    toolDescription: "Load table schema, sample rows, and recent SQL history for the current table.",
    includeSampleRows: true,
    sampleRowLimit: 10,
    includeSqlHistory: true,
    sqlHistoryLimit: 10,
    sqlHistorySource: "audit_log",
  },
};
