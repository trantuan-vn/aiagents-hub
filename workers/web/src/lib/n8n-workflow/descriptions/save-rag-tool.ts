import { resourceNode } from "./common";

/** Save RAG tool — table ingest only (schema + SQL examples via LLM + embed). */
export const SAVE_RAG_TOOL_N8N_DESCRIPTION = resourceNode({
  displayName: "Save RAG",
  name: "tool_node_save_rag",
  icon: "fa:database",
  group: ["transform"],
  description:
    "Introspect a database table, enrich column descriptions with an LLM, and upsert schema + SQL examples into Vectorize.",
  properties: [
    {
      displayName: "Table name field",
      name: "tableNameField",
      type: "string",
      default: "{{ $json.tableName }}",
      placeholder: "{{ $json.tableName }}",
      description: "Drag the current loop item table from INPUT. Example: tableName → {{ $json.tableName }}",
    },
    {
      displayName: "SQL history limit",
      name: "sqlHistoryLimit",
      type: "number",
      default: 10,
      description: "Max rows from ADMIN.DBTOOLS$EXECUTION_HISTORY to include for typical-query context.",
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
        "Introspect a database table, enrich column descriptions with an LLM, and upsert schema + SQL examples into Vectorize.",
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
