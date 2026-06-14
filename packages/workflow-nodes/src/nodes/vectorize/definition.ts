import { defaultParametersSection } from "../default-sections";
import type { WorkflowNodeDefinition } from "../../types/node-definition";

const now = () => new Date().toISOString();

function builtin(
  partial: Omit<WorkflowNodeDefinition, "isBuiltin" | "isActive" | "createdAt" | "updatedAt">,
): WorkflowNodeDefinition {
  const ts = now();
  return { ...partial, isBuiltin: true, isActive: true, createdAt: ts, updatedAt: ts };
}

export const VECTORIZE_MEMORY_FIELDS = [
  {
    id: "collection",
    type: "info" as const,
    labelKey: "field_vectorize_index",
    descriptionKey: "field_vectorize_index_desc",
    order: 1,
  },
  {
    id: "namespace",
    type: "info" as const,
    labelKey: "field_vectorize_scope",
    descriptionKey: "field_vectorize_scope_desc",
    order: 2,
  },
  {
    id: "dimensions",
    type: "number" as const,
    labelKey: "field_dimensions",
    defaultValue: 768,
    order: 3,
  },
  {
    id: "metric",
    type: "select" as const,
    labelKey: "field_metric",
    defaultValue: "cosine",
    options: [
      { value: "cosine", labelKey: "metric_cosine" },
      { value: "euclidean", labelKey: "metric_euclidean" },
      { value: "dot-product", labelKey: "metric_dot_product" },
    ],
    order: 4,
  },
];

export const MEMORY_NODE_DEFINITION = builtin({
  id: "memory_node",
  runtimeType: "memory_node",
  nameKey: "node_vectorize",
  descriptionKey: "node_vectorize_desc",
  category: "resource",
  icon: "Database",
  defaultData: {
    memoryKind: "vectorize",
    collection: "VECTORIZE",
    dimensions: 768,
    metric: "cosine",
  },
  sections: [defaultParametersSection(VECTORIZE_MEMORY_FIELDS)],
});
