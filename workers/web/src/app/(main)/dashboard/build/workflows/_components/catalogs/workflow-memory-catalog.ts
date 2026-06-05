import { Database, type LucideIcon } from "lucide-react";
import type { SimpleIcon } from "simple-icons";
import { siMongodb, siPostgresql, siRedis } from "simple-icons";

export type WorkflowAgentMemoryId = "simple" | "mongodb" | "postgres" | "redis" | "xata";

export type WorkflowAgentMemoryItem = {
  id: WorkflowAgentMemoryId;
  nameKey:
    | "memory_simple"
    | "memory_mongodb_chat"
    | "memory_postgres_chat"
    | "memory_redis_chat"
    | "memory_xata";
  descKey:
    | "memory_simple_desc"
    | "memory_mongodb_chat_desc"
    | "memory_postgres_chat_desc"
    | "memory_redis_chat_desc"
    | "memory_xata_desc";
  lucideIcon?: LucideIcon;
  brandIcon?: SimpleIcon;
  /** Brand icon not available in simple-icons */
  customIcon?: "xata";
};

/** Easy options — no external credentials (n8n-style "For beginners"). */
export const WORKFLOW_AGENT_MEMORY_BEGINNERS: WorkflowAgentMemoryItem[] = [
  {
    id: "simple",
    nameKey: "memory_simple",
    descKey: "memory_simple_desc",
    lucideIcon: Database,
  },
];

/** External chat memory stores (n8n-style "Other memories"). */
export const WORKFLOW_AGENT_MEMORY_OTHER: WorkflowAgentMemoryItem[] = [
  {
    id: "mongodb",
    nameKey: "memory_mongodb_chat",
    descKey: "memory_mongodb_chat_desc",
    brandIcon: siMongodb,
  },
  {
    id: "postgres",
    nameKey: "memory_postgres_chat",
    descKey: "memory_postgres_chat_desc",
    brandIcon: siPostgresql,
  },
  {
    id: "redis",
    nameKey: "memory_redis_chat",
    descKey: "memory_redis_chat_desc",
    brandIcon: siRedis,
  },
  {
    id: "xata",
    nameKey: "memory_xata",
    descKey: "memory_xata_desc",
    customIcon: "xata",
  },
];

export const WORKFLOW_AGENT_MEMORY_ALL = [
  ...WORKFLOW_AGENT_MEMORY_BEGINNERS,
  ...WORKFLOW_AGENT_MEMORY_OTHER,
] as const;
