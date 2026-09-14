import { defaultParametersSection } from "../default-sections";
import { createBuiltin } from "../create-builtin";
import type { WorkflowNodeDefinition } from "../../types/node-definition";
import {
  SIMPLE_MEMORY_CONTEXT_WINDOW,
  SIMPLE_MEMORY_SESSION_KEY,
} from "../workflow-presets";
import {
  MEMORY_KIND_FIELD,
  MEMORY_KINDS,
  MEMORY_OVERRIDE_KINDS,
  type MemoryKind,
} from "./kinds";

export {
  MEMORY_KIND_FIELD,
  MEMORY_KINDS,
  MEMORY_OVERRIDE_KINDS,
  isSimpleMemoryKind,
  type MemoryKind,
} from "./kinds";

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
    type: "info" as const,
    labelKey: "field_dimensions",
    descriptionKey: "field_vectorize_dimensions_desc",
    defaultValue: 768,
    order: 3,
  },
  {
    id: "metric",
    type: "info" as const,
    labelKey: "field_metric",
    descriptionKey: "field_vectorize_metric_desc",
    defaultValue: "cosine",
    order: 4,
  },
];

export function memoryKindNameKey(kind: MemoryKind): string {
  switch (kind) {
    case "simple":
      return "memory_simple";
    case "mongodb":
      return "memory_mongodb_chat";
    case "postgres":
      return "memory_postgres_chat";
    case "redis":
      return "memory_redis_chat";
    case "xata":
      return "memory_xata";
    case "vectorize":
      return "mem_vectorize";
    case "supabase":
      return "tool_vector_supabase";
    case "pinecone":
      return "tool_vector_pinecone";
    case "pgvector":
      return "tool_vector_pgvector";
    case "qdrant":
      return "tool_vector_qdrant";
    default:
      return `memory_kind_${kind}`;
  }
}

export function memoryKindDescKey(kind: MemoryKind): string {
  switch (kind) {
    case "simple":
      return "memory_simple_desc";
    case "mongodb":
      return "memory_mongodb_chat_desc";
    case "postgres":
      return "memory_postgres_chat_desc";
    case "redis":
      return "memory_redis_chat_desc";
    case "xata":
      return "memory_xata_desc";
    case "vectorize":
      return "mem_vectorize_desc";
    case "supabase":
      return "tool_vector_supabase_desc";
    case "pinecone":
      return "tool_vector_pinecone_desc";
    case "pgvector":
      return "tool_vector_pgvector_desc";
    case "qdrant":
      return "tool_vector_qdrant_desc";
    default:
      return `memory_kind_${kind}_desc`;
  }
}

/** Base family — fallback when no memoryKind is set. */
export const MEMORY_NODE_DEFINITION: WorkflowNodeDefinition = createBuiltin({
  id: "memory_node",
  runtimeType: "memory_node",
  nameKey: "node_memory",
  descriptionKey: "node_memory_desc",
  category: "resource",
  icon: "Database",
  defaultData: {
    [MEMORY_KIND_FIELD]: "vectorize",
  },
  sections: [
    defaultParametersSection([
      {
        id: MEMORY_KIND_FIELD,
        type: "select",
        labelKey: "field_memory_kind",
        defaultValue: "vectorize",
        options: MEMORY_KINDS.map((value) => ({
          value,
          labelKey: memoryKindNameKey(value),
        })),
        order: 0,
      },
    ]),
  ],
});

export function createMemoryKindDefinition(kind: MemoryKind): WorkflowNodeDefinition {
  return createBuiltin({
    id: `memory_node:${kind}`,
    runtimeType: "memory_node",
    kind,
    nameKey: memoryKindNameKey(kind),
    descriptionKey: memoryKindDescKey(kind),
    category: "resource",
    icon: "Database",
    defaultData: {
      label: kind.replace(/_/g, " "),
      [MEMORY_KIND_FIELD]: kind,
      catalogId: kind,
    },
    sections: [
      defaultParametersSection([
        {
          id: MEMORY_KIND_FIELD,
          type: "select",
          labelKey: "field_memory_kind",
          defaultValue: kind,
          options: MEMORY_KINDS.map((value) => ({
            value,
            labelKey: memoryKindNameKey(value),
          })),
          order: 0,
        },
      ]),
    ],
  });
}

export const SIMPLE_MEMORY_FIELDS = [
  {
    id: "sessionIdSource",
    type: "select" as const,
    labelKey: "field_session_id",
    defaultValue: "from_chat_trigger",
    options: [
      { value: "from_chat_trigger", labelKey: "opt_session_from_chat_trigger" },
      { value: "define_below", labelKey: "opt_session_define_below" },
    ],
    order: 1,
  },
  {
    id: "sessionKey",
    type: "expression" as const,
    labelKey: "field_session_key",
    defaultValue: SIMPLE_MEMORY_SESSION_KEY,
    supportsExpression: true,
    order: 2,
  },
  {
    id: "contextWindowLength",
    type: "number" as const,
    labelKey: "field_context_window_length",
    descriptionKey: "field_context_window_length_desc",
    defaultValue: SIMPLE_MEMORY_CONTEXT_WINDOW,
    order: 3,
  },
];

export function simpleMemoryDefaultData(label = "Simple Memory"): Record<string, unknown> {
  return {
    label,
    memoryKind: "simple",
    catalogId: "simple",
    sessionIdSource: "from_chat_trigger",
    sessionKey: SIMPLE_MEMORY_SESSION_KEY,
    contextWindowLength: SIMPLE_MEMORY_CONTEXT_WINDOW,
  };
}

/** Override — windowed chat memory stored in the user's Durable Object. */
export const SIMPLE_MEMORY_DEFINITION: WorkflowNodeDefinition = createBuiltin({
  id: "memory_node:simple",
  runtimeType: "memory_node",
  kind: "simple",
  nameKey: "memory_simple",
  descriptionKey: "memory_simple_desc",
  category: "resource",
  icon: "Database",
  defaultData: simpleMemoryDefaultData(),
  sections: [defaultParametersSection(SIMPLE_MEMORY_FIELDS)],
  handles: [{ id: "memory", type: "source", connectionType: "resource", position: "top" }],
});

/** Override — Vectorize memory with index/metric fields. */
export const VECTORIZE_MEMORY_DEFINITION: WorkflowNodeDefinition = createBuiltin({
  id: "memory_node:vectorize",
  runtimeType: "memory_node",
  kind: "vectorize",
  nameKey: "mem_vectorize",
  descriptionKey: "mem_vectorize_desc",
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

export const MEMORY_KIND_DEFINITIONS: WorkflowNodeDefinition[] = MEMORY_KINDS.filter(
  (kind) => !MEMORY_OVERRIDE_KINDS.has(kind),
).map(createMemoryKindDefinition);
