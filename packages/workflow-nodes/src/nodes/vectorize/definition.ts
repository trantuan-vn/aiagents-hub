import { defaultInputSection, defaultOutputSection, defaultParametersSection } from "../default-sections";
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
    id: "memoryKind",
    type: "select" as const,
    labelKey: "field_memory_kind",
    defaultValue: "vectorize",
    options: [
      { value: "r2", labelKey: "mem_r2" },
      { value: "d1", labelKey: "mem_d1" },
      { value: "vectorize", labelKey: "mem_vectorize" },
    ],
    order: 1,
  },
  {
    id: "collection",
    type: "text" as const,
    labelKey: "field_collection",
    defaultValue: "vectorize-default",
    order: 2,
  },
  {
    id: "namespace",
    type: "text" as const,
    labelKey: "field_namespace",
    defaultValue: "",
    order: 3,
  },
  {
    id: "dimensions",
    type: "number" as const,
    labelKey: "field_dimensions",
    defaultValue: 768,
    order: 4,
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
    order: 5,
  },
];

export const MEMORY_NODE_DEFINITION = builtin({
  id: "memory_node",
  runtimeType: "memory_node",
  nameKey: "node_memory",
  descriptionKey: "node_memory_desc",
  category: "resource",
  icon: "Database",
  sections: [
    defaultInputSection(),
    defaultParametersSection(VECTORIZE_MEMORY_FIELDS),
    defaultOutputSection(false),
  ],
});
