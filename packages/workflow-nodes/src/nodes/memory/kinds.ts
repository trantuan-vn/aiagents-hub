/** Memory_node sub-kinds — chat memories + vector stores. */
export const MEMORY_KINDS = [
  "simple",
  "mongodb",
  "postgres",
  "redis",
  "xata",
  "vectorize",
  "supabase",
  "pinecone",
  "pgvector",
  "qdrant",
] as const;

export type MemoryKind = (typeof MEMORY_KINDS)[number];

/** Kind field stored on `node.data` for memory_node. */
export const MEMORY_KIND_FIELD = "memoryKind" as const;

/** Kinds with dedicated override UI/config (vectorize panel). */
export const MEMORY_OVERRIDE_KINDS = new Set<MemoryKind>(["vectorize"]);
