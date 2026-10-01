import { resourceNode } from "./common";

/** Save SQL Pair — one question and its SQL, embedded from the question only. */
export const SAVE_SQL_PAIR_TOOL_N8N_DESCRIPTION = resourceNode({
  displayName: "Save SQL Pair",
  name: "tool_node_save_sql_pair",
  icon: "fa:database",
  group: ["transform"],
    description:
      "Write one question and its SQL into Vectorize. A system prompt rewrites the question with domain terms before embedding.",
  properties: [
    {
      displayName: "Question",
      name: "questionField",
      type: "string",
      default: "{{ $json.question }}",
      placeholder: "{{ $json.question }}",
      description: "Drag the question from INPUT.",
    },
    {
      displayName: "SQL",
      name: "sqlField",
      type: "string",
      default: "{{ $json.sql }}",
      placeholder: "{{ $json.sql }}",
      description: "Drag the SQL that answers that question.",
    },
    {
      displayName: "System prompt",
      name: "describeSystemPrompt",
      type: "string",
      typeOptions: { rows: 6 },
      default: "",
      description:
        "Expert role and domain terms. The linked LLM rewrites each question with those terms before it is embedded. Leave blank to store the question as-is.",
    },
    {
      displayName: "Embed model",
      name: "embedModel",
      type: "string",
      default: "",
      description:
        "Embedding service. Use the same model as Save RAG and Get RAG. A dimension mismatch does not write the vector.",
      typeOptions: { aiHubServiceSelect: true, aiHubServiceCapability: "embed" },
    },
    {
      displayName: "Tool name",
      name: "toolName",
      type: "string",
      default: "save_sql_pair",
      noDataExpression: true,
    },
    {
      displayName: "Label",
      name: "label",
      type: "string",
      default: "Save SQL Pair",
      noDataExpression: true,
    },
  ],
});
