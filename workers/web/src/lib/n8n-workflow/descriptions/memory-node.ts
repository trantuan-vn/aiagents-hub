import { resourceNode } from "./common";

export const MEMORY_NODE_N8N_DESCRIPTION = resourceNode({
  displayName: "Vectorize",
  name: "memory_node",
  icon: "fa:database",
  group: ["transform"],
  description: "Vector store for RAG — connect to Get RAG, Save RAG, or an Agent Memory handle.",
  properties: [
    {
      displayName: "Index",
      name: "collection",
      type: "hidden",
      default: "VECTORIZE",
    },
    {
      displayName: "Dataset scope",
      name: "namespace",
      type: "hidden",
      default: "",
    },
    {
      displayName: "Dimensions",
      name: "dimensions",
      type: "hidden",
      default: 768,
    },
    {
      displayName: "Metric",
      name: "metric",
      type: "hidden",
      default: "cosine",
    },
    {
      displayName: "Label",
      name: "label",
      type: "string",
      default: "Vectorize",
    },
  ],
});
