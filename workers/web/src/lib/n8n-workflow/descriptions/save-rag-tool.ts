import { resourceNode } from "./common";

/** Save RAG tool — dedicated config without tool kind selector. */
export const SAVE_RAG_TOOL_N8N_DESCRIPTION = resourceNode({
  displayName: "Save RAG",
  name: "tool_node_save_rag",
  icon: "fa:database",
  group: ["transform"],
  description: "Embed document chunks and upsert into the agent's knowledge base.",
  properties: [
    {
      displayName: "Service",
      name: "serviceEndpoint",
      type: "string",
      default: "",
      description: "Approved embedding service used to vectorize document chunks.",
      typeOptions: {
        aiHubServiceSelect: true,
      },
    },
    {
      displayName: "User prompt",
      name: "userPrompt",
      type: "string",
      typeOptions: { rows: 4 },
      default: "When document text is available, call save_rag with the full extracted content.",
      description: "Instructions appended to the agent user message when this tool is connected.",
    },
    {
      displayName: "System prompt",
      name: "systemPrompt",
      type: "string",
      typeOptions: { rows: 4 },
      default: "Use save_rag to persist extracted document text into the knowledge base.",
      description: "System instructions for the agent when this tool is connected.",
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
      default: "Embed document chunks and upsert into the knowledge base.",
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
