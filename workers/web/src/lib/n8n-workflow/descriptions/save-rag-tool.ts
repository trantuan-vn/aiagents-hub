import { resourceNode } from "./common";
import {
  GET_DB_INFO_USER_FIELD,
  GET_DB_INFO_PASSWORD_FIELD,
  GET_DB_INFO_CONNECT_STRING_FIELD,
  GET_DB_INFO_SCHEMA_FIELD,
} from "@aiagents-hub/workflow-nodes";

/** Save RAG tool — one shortened schema document per table. */
export const SAVE_RAG_TOOL_N8N_DESCRIPTION = resourceNode({
  displayName: "Save RAG",
  name: "tool_node_save_rag",
  icon: "fa:database",
  group: ["transform"],
  description:
    "Write one shortened schema document per table into Vectorize. Does not store SQL examples.",
  properties: [
    {
      displayName: "User field",
      name: "userField",
      type: "string",
      default: GET_DB_INFO_USER_FIELD,
      placeholder: GET_DB_INFO_USER_FIELD,
      description: "Drop INPUT fields here. Example: {{ $json.u || $json.fields.u || $json.user }}",
    },
    {
      displayName: "Password field",
      name: "passwordField",
      type: "string",
      default: GET_DB_INFO_PASSWORD_FIELD,
      placeholder: GET_DB_INFO_PASSWORD_FIELD,
      description: "Drop INPUT fields here. Example: {{ $json.p || $json.password }}",
    },
    {
      displayName: "Connect string field",
      name: "connectStringField",
      type: "string",
      default: GET_DB_INFO_CONNECT_STRING_FIELD,
      placeholder: GET_DB_INFO_CONNECT_STRING_FIELD,
      description: "Drop INPUT fields here. Example: {{ $json.c || $json.connectString }}",
    },
    {
      displayName: "Schema name field",
      name: "schemaNameField",
      type: "string",
      default: GET_DB_INFO_SCHEMA_FIELD,
      placeholder: GET_DB_INFO_SCHEMA_FIELD,
      description: "Oracle schema/owner used when reading columns. Example: {{ $json.s || $json.schemaName }}",
    },
    {
      displayName: "Table name field",
      name: "tableNameField",
      type: "string",
      default: "{{ $json.tableName }}",
      placeholder: "{{ $json.tableName }}",
      description: "Drag the current loop item table from INPUT. Example: tableName → {{ $json.tableName }}",
    },
    {
      displayName: "System prompt",
      name: "describeSystemPrompt",
      type: "string",
      typeOptions: { rows: 6 },
      default: "",
      description:
        "Expert role and domain terms. Passed into every LLM call that writes the table summary and column descriptions.",
    },
    {
      displayName: "Tool name",
      name: "toolName",
      type: "string",
      default: "save_rag",
    },
    {
      displayName: "Description",
      name: "toolDescription",
      type: "string",
      typeOptions: { rows: 3 },
      default:
        "Write one shortened schema document per table into Vectorize. Summaries and column descriptions are one Vietnamese sentence and one English sentence. Does not store SQL examples.",
    },
    {
      displayName: "Chunk size",
      name: "chunkSize",
      type: "number",
      default: 800,
    },
    {
      displayName: "Chunk overlap",
      name: "chunkOverlap",
      type: "number",
      default: 120,
    },
    {
      displayName: "Label",
      name: "label",
      type: "string",
      default: "Save RAG",
    },
  ],
});
