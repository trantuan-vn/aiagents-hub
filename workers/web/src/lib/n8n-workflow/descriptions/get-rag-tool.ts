import { resourceNode } from "./common";
import { GET_RAG_QUERY_FIELD } from "@aiagents-hub/workflow-nodes";

/** Get RAG — question–SQL pairs first, then related schema. */
export const GET_RAG_TOOL_N8N_DESCRIPTION = resourceNode({
  displayName: "Get RAG",
  name: "tool_node_get_rag",
  icon: "fa:search",
  group: ["transform"],
  description: "Return similar question–SQL pairs first, then related table schema.",
  properties: [
    {
      displayName: "Query field",
      name: "queryField",
      type: "string",
      default: GET_RAG_QUERY_FIELD,
      placeholder: GET_RAG_QUERY_FIELD,
      description:
        "Expression for the search query. Drop a second INPUT field to join with ||. You can edit to ??, &&, or a ternary.",
    },
    {
      displayName: "Embed model",
      name: "embedModel",
      type: "string",
      default: "",
      description:
        "Embedding service. Use the same model as Save RAG and Save SQL Pair. A dimension mismatch fails the search instead of returning empty snippets.",
      typeOptions: { aiHubServiceSelect: true, aiHubServiceCapability: "embed" },
    },
    {
      displayName: "Group related docs by",
      name: "groupByField",
      type: "string",
      default: "tableName",
      placeholder: "tableName",
      description: "Metadata key used to group schema documents. Default is tableName.",
    },
    {
      displayName: "Top K",
      name: "topK",
      type: "number",
      default: 4,
      description: "Max schema tables (default 4).",
    },
    {
      displayName: "SQL pair top K",
      name: "sqlPairTopK",
      type: "number",
      default: 5,
      description: "Max question–SQL pairs (default 5).",
    },
    {
      displayName: "Score threshold",
      name: "scoreThreshold",
      type: "number",
      default: 0.25,
      description: "Cosine similarity. Tables and pairs below this are left out (default 0.25).",
    },
    {
      displayName: "Include metadata",
      name: "includeMetadata",
      type: "boolean",
      default: true,
    },
    {
      displayName: "Tool name",
      name: "toolName",
      type: "string",
      default: "get_rag",
    },
    {
      displayName: "Description",
      name: "toolDescription",
      type: "string",
      typeOptions: { rows: 3 },
      default:
        "Return similar question–SQL pairs first, then related table schema. Do not call when that two-part context is already in the prompt.",
    },
    {
      displayName: "Label",
      name: "label",
      type: "string",
      default: "Get RAG",
    },
  ],
});
