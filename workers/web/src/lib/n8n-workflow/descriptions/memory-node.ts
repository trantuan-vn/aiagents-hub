import { resourceNode } from "./common";

export const MEMORY_NODE_N8N_DESCRIPTION = resourceNode({
  displayName: "Memory",
  name: "memory_node",
  icon: "fa:database",
  group: ["transform"],
  description: "Memory store — connect to an Agent node's Memory input.",
  properties: [
    {
      displayName: "Memory kind",
      name: "memoryKind",
      type: "options",
      default: "vectorize",
      options: [
        { name: "R2", value: "r2" },
        { name: "D1", value: "d1" },
        { name: "Vectorize", value: "vectorize" },
      ],
    },
    {
      displayName: "Collection",
      name: "collection",
      type: "string",
      default: "vectorize-default",
      displayOptions: { show: { memoryKind: ["vectorize"] } },
    },
    {
      displayName: "Namespace",
      name: "namespace",
      type: "string",
      default: "",
      displayOptions: { show: { memoryKind: ["vectorize"] } },
    },
    {
      displayName: "Dimensions",
      name: "dimensions",
      type: "number",
      default: 768,
      displayOptions: { show: { memoryKind: ["vectorize"] } },
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
      displayOptions: { show: { memoryKind: ["vectorize"] } },
    },
    {
      displayName: "Label",
      name: "label",
      type: "string",
      default: "Memory",
    },
  ],
});
