import {
  MEMORY_KINDS,
  MEMORY_OVERRIDE_KINDS,
  type MemoryKind,
} from "@aiagents-hub/workflow-nodes";

import type { WorkflowNodeUIPlugin } from "../types";
import { MemoryWorkflowNode } from "./canvas";
import { isVectorizeMemoryNode, VectorizeNodeConfigPanel } from "./config-panel";

export { MemoryWorkflowNode } from "./canvas";
export { isVectorizeMemoryNode, VectorizeNodeConfigPanel } from "./config-panel";

function memoryLabelKey(kind: MemoryKind): string {
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

function memoryDescKey(kind: MemoryKind): string {
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

/** Base memory_node — hidden; kind plugins are catalog entries. */
export const memoryUIPlugin: WorkflowNodeUIPlugin = {
  id: "memory_node",
  runtimeType: "memory_node",
  Canvas: MemoryWorkflowNode,
  defaults: () => ({ label: "Memory", memoryKind: "vectorize" }),
  catalog: {
    category: "memory",
    labelKey: "node_memory",
    descriptionKey: "node_memory_desc",
    icon: "Database",
    visible: false,
  },
};

export function createMemoryKindUIPlugin(kind: MemoryKind): WorkflowNodeUIPlugin {
  return {
    id: `memory_node:${kind}`,
    runtimeType: "memory_node",
    kind,
    Canvas: MemoryWorkflowNode,
    defaults: () => ({
      label: kind.replace(/_/g, " "),
      memoryKind: kind,
      catalogId: kind,
    }),
    catalog: {
      category: "memory",
      labelKey: memoryLabelKey(kind),
      descriptionKey: memoryDescKey(kind),
      icon: "Database",
      keywords: [kind, "memory"],
    },
  };
}

export const MEMORY_KIND_UI_PLUGINS: WorkflowNodeUIPlugin[] = MEMORY_KINDS.filter(
  (kind) => !MEMORY_OVERRIDE_KINDS.has(kind),
).map(createMemoryKindUIPlugin);

/** Override — vectorize with custom config panel. */
export const memoryVectorizeUIPlugin: WorkflowNodeUIPlugin = {
  ...createMemoryKindUIPlugin("vectorize"),
  ConfigPanel: VectorizeNodeConfigPanel,
  defaults: () => ({
    label: "Vectorize",
    memoryKind: "vectorize",
    catalogId: "vectorize",
    collection: "VECTORIZE",
    dimensions: 768,
    metric: "cosine",
  }),
  match: (node) => isVectorizeMemoryNode(node),
};
