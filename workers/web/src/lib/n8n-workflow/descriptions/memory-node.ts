import { resourceNode } from "./common";

export const MEMORY_NODE_N8N_DESCRIPTION = resourceNode({
  displayName: "Vectorize",
  name: "memory_node",
  icon: "fa:database",
  group: ["transform"],
  description: "Vector store for RAG — connect to an Agent node's Memory input.",
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
      type: "number",
      default: 768,
    },
    {
      displayName: "Metric",
      name: "metric",
      type: "options",
      default: "cosine",
      options: [
        { name: "Cosine", value: "cosine" },
        { name: "Euclidean", value: "euclidean" },
        { name: "Dot product", value: "dot-product" },
      ],
    },
    {
      displayName: "Label",
      name: "label",
      type: "string",
      default: "Vectorize",
    },
  ],
});
