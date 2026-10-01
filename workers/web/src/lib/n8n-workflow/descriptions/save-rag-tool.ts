import { resourceNode } from "./common";

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
