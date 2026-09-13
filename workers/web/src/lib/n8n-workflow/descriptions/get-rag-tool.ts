import { resourceNode } from "./common";
import { GET_RAG_QUERY_FIELD } from "@aiagents-hub/workflow-nodes";

/** Get RAG — map the previous node's question into the search query. */
export const GET_RAG_TOOL_N8N_DESCRIPTION = resourceNode({
  displayName: "Get RAG",
  name: "tool_node_get_rag",
  icon: "fa:search",
  group: ["transform"],
  description: "Search the knowledge base using a field from the previous node.",
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
      displayName: "Top K",
      name: "topK",
      type: "number",
      default: 12,
    },
    {
      displayName: "Score threshold",
      name: "scoreThreshold",
      type: "number",
      default: 0,
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
      default: "Search the knowledge base for passages relevant to the user question.",
    },
    {
      displayName: "Label",
      name: "label",
      type: "string",
      default: "Get RAG",
    },
  ],
});
