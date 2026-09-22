import { defaultInputSection, defaultOutputSection, defaultParametersSection } from "../default-sections";
import { createBuiltin } from "../create-builtin";
import type { WorkflowNodeDefinition } from "../../types/node-definition";
import { TOOL_KIND_FIELD, TOOL_KINDS, TOOL_OVERRIDE_KINDS, type ToolKind } from "./kinds";
import {
  GET_RAG_QUERY_FIELD,
  GET_RAG_GROUP_BY_FIELD,
  GET_DB_INFO_USER_FIELD,
  GET_DB_INFO_PASSWORD_FIELD,
  GET_DB_INFO_CONNECT_STRING_FIELD,
} from "../workflow-presets";

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
    id: "tableNameField",
    type: "text" as const,
    labelKey: "field_table_name_field",
    descriptionKey: "field_table_name_field_desc",
    defaultValue: "{{ $json.tableName }}",
    placeholderKey: "field_table_name_field_placeholder",
    supportsExpression: true,
    order: 3.1,
  },
  {
    id: "sqlHistoryLimit",
    type: "number" as const,
    labelKey: "field_sql_history_limit",
    defaultValue: 10,
    order: 3.2,
  },
  { id: "chunkSize", type: "number" as const, labelKey: "field_chunk_size", defaultValue: 800, order: 7 },
  { id: "chunkOverlap", type: "number" as const, labelKey: "field_chunk_overlap", defaultValue: 120, order: 8 },
];

const GET_RAG_FIELDS = [
  {
    id: "queryField",
    type: "text" as const,
    labelKey: "field_query_field",
    descriptionKey: "field_query_field_desc",
    defaultValue: GET_RAG_QUERY_FIELD,
    order: 3,
    placeholderKey: "field_query_field_placeholder",
    supportsExpression: true,
  },
  {
    id: "groupByField",
    type: "text" as const,
    labelKey: "field_group_by_field",
    descriptionKey: "field_group_by_field_desc",
    defaultValue: GET_RAG_GROUP_BY_FIELD,
    order: 3.5,
    placeholderKey: "field_group_by_field_placeholder",
    supportsExpression: true,
  },
  { id: "topK", type: "number" as const, labelKey: "field_top_k", defaultValue: 12, order: 4 },
  { id: "scoreThreshold", type: "number" as const, labelKey: "field_score_threshold", defaultValue: 0, order: 5 },
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

const CHECK_SQL_FIELDS = [
  {
    id: "maxRows",
    type: "number" as const,
    labelKey: "field_max_rows",
    defaultValue: 5,
    order: 3.1,
  },
];

const GET_DB_INFO_FIELDS = [
  {
    id: "userField",
    type: "text" as const,
    labelKey: "field_user_field",
    descriptionKey: "field_user_field_desc",
    defaultValue: GET_DB_INFO_USER_FIELD,
    placeholderKey: "field_user_field_placeholder",
    supportsExpression: true,
    order: 3.1,
  },
  {
    id: "passwordField",
    type: "text" as const,
    labelKey: "field_password_field",
    descriptionKey: "field_password_field_desc",
    defaultValue: GET_DB_INFO_PASSWORD_FIELD,
    placeholderKey: "field_password_field_placeholder",
    supportsExpression: true,
    order: 3.2,
  },
  {
    id: "connectStringField",
    type: "text" as const,
    labelKey: "field_connect_string_field",
    descriptionKey: "field_connect_string_field_desc",
    defaultValue: GET_DB_INFO_CONNECT_STRING_FIELD,
    placeholderKey: "field_connect_string_field_placeholder",
    supportsExpression: true,
    order: 3.3,
  },
  {
    id: "schemaNameField",
    type: "text" as const,
    labelKey: "field_schema_name_field",
    placeholderKey: "field_schema_name_field_placeholder",
    supportsExpression: true,
    order: 3.4,
  },
  {
    id: "tableNameField",
    type: "text" as const,
    labelKey: "field_table_name_field",
    placeholderKey: "field_table_name_field_placeholder",
    supportsExpression: true,
    order: 3.5,
  },
  {
    id: "tableFilter",
    type: "text" as const,
    labelKey: "field_table_filter",
    defaultValue: "*",
    order: 3.6,
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
    case "check-sql":
      return "tool_check_sql";
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
    case "check-sql":
      return "tool_check_sql_desc";
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
    icon: kind === "save-rag" || kind === "get-rag" || kind === "get-db-info" || kind === "check-sql" ? "Oracle" : "Wrench",
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
  icon: "Oracle",
  defaultData: {
    toolKind: "save-rag",
    toolName: "save_rag",
    tableNameField: "{{ $json.tableName }}",
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
  icon: "Oracle",
  defaultData: {
    toolKind: "get-rag",
    toolName: "get_rag",
    queryField: GET_RAG_QUERY_FIELD,
    groupByField: GET_RAG_GROUP_BY_FIELD,
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
  icon: "Oracle",
  defaultData: {
    toolKind: "get-db-info",
    toolName: "get_db_info",
    userField: GET_DB_INFO_USER_FIELD,
    passwordField: GET_DB_INFO_PASSWORD_FIELD,
    connectStringField: GET_DB_INFO_CONNECT_STRING_FIELD,
  },
  sections: [
    defaultInputSection(),
    defaultParametersSection([...RAG_COMMON_FIELDS, ...GET_DB_INFO_FIELDS]),
    defaultOutputSection(false),
  ],
});

export const CHECK_SQL_TOOL_DEFINITION: WorkflowNodeDefinition = createBuiltin({
  id: "tool_node:check-sql",
  runtimeType: "tool_node",
  kind: "check-sql",
  nameKey: "tool_check_sql",
  descriptionKey: "tool_check_sql_desc",
  category: "resource",
  icon: "Oracle",
  defaultData: {
    toolKind: "check-sql",
    toolName: "check_sql",
    maxRows: 5,
  },
  sections: [
    defaultInputSection(),
    defaultParametersSection([...RAG_COMMON_FIELDS, ...CHECK_SQL_FIELDS]),
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
    toolDescription: "Introspect a database table, enrich column descriptions with an LLM, and upsert schema + SQL examples into Vectorize.",
    tableNameField: "{{ $json.tableName }}",
    sqlHistoryLimit: 10,
    chunkSize: 800,
    chunkOverlap: 120,
  },
  "get-rag": {
    toolKind: "get-rag",
    toolName: "get_rag",
    toolDescription:
      "Find related table schema (VI/EN column descriptions) and SQL examples for the user question so you can write SELECT. Do not call when schema snippets are already in context.",
    queryField: GET_RAG_QUERY_FIELD,
    groupByField: GET_RAG_GROUP_BY_FIELD,
    topK: 12,
    scoreThreshold: 0,
    querySource: "from_agent_input",
    includeMetadata: true,
  },
  "get-db-info": {
    toolKind: "get-db-info",
    toolName: "get_db_info",
    toolDescription: "List tables in the connected database. Loop + Save RAG introspects each table.",
    userField: GET_DB_INFO_USER_FIELD,
    passwordField: GET_DB_INFO_PASSWORD_FIELD,
    connectStringField: GET_DB_INFO_CONNECT_STRING_FIELD,
    schemaNameField: "",
    tableNameField: "",
    tableFilter: "*",
  },
  "check-sql": {
    toolKind: "check-sql",
    toolName: "check_sql",
    toolDescription:
      "Run a SELECT on Oracle and return parser/execution errors if wrong. Call after get_rag, before treating SQL as the final answer.",
    maxRows: 5,
  },
};
