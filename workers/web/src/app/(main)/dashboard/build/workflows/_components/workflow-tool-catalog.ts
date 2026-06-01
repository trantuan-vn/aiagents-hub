import {
  Bot,
  CheckCircle2,
  Code2,
  Database,
  Globe,
  Link2,
  LogIn,
  type LucideIcon,
} from "lucide-react";
import type { SimpleIcon } from "simple-icons";
import { siMongodb, siSupabase } from "simple-icons";

export type WorkflowAgentToolKind =
  | "agent"
  | "workflow"
  | "code"
  | "http_request"
  | "action_in_app"
  | "mcp"
  | "vector_store"
  | "human_review";

export type WorkflowAgentRecommendedTool = {
  id: Exclude<WorkflowAgentToolKind, "action_in_app" | "mcp" | "vector_store" | "human_review">;
  nameKey:
    | "tool_pick_agent"
    | "tool_pick_workflow"
    | "tool_pick_code"
    | "tool_pick_http";
  descKey:
    | "tool_pick_agent_desc"
    | "tool_pick_workflow_desc"
    | "tool_pick_code_desc"
    | "tool_pick_http_desc";
  icon: LucideIcon;
};

export const WORKFLOW_AGENT_TOOL_RECOMMENDED: WorkflowAgentRecommendedTool[] = [
  {
    id: "agent",
    nameKey: "tool_pick_agent",
    descKey: "tool_pick_agent_desc",
    icon: Bot,
  },
  {
    id: "workflow",
    nameKey: "tool_pick_workflow",
    descKey: "tool_pick_workflow_desc",
    icon: LogIn,
  },
  {
    id: "code",
    nameKey: "tool_pick_code",
    descKey: "tool_pick_code_desc",
    icon: Code2,
  },
  {
    id: "http_request",
    nameKey: "tool_pick_http",
    descKey: "tool_pick_http_desc",
    icon: Globe,
  },
];

export type WorkflowAgentToolCategoryId = "action_in_app" | "mcp" | "vector_stores" | "human_review";

export type WorkflowAgentToolCategory = {
  id: WorkflowAgentToolCategoryId;
  nameKey:
    | "add_category_action_in_app"
    | "tool_category_mcp"
    | "tool_category_vector_stores"
    | "add_category_human_review";
  descKey:
    | "add_category_action_in_app_desc"
    | "tool_category_mcp_desc"
    | "tool_category_vector_stores_desc"
    | "add_category_human_review_desc";
  icon: LucideIcon;
  badgeNew?: boolean;
};

export const WORKFLOW_AGENT_TOOL_CATEGORIES: WorkflowAgentToolCategory[] = [
  {
    id: "action_in_app",
    nameKey: "add_category_action_in_app",
    descKey: "add_category_action_in_app_desc",
    icon: Globe,
  },
  {
    id: "mcp",
    nameKey: "tool_category_mcp",
    descKey: "tool_category_mcp_desc",
    icon: Link2,
    badgeNew: true,
  },
  {
    id: "vector_stores",
    nameKey: "tool_category_vector_stores",
    descKey: "tool_category_vector_stores_desc",
    icon: Database,
  },
  {
    id: "human_review",
    nameKey: "add_category_human_review",
    descKey: "add_category_human_review_desc",
    icon: CheckCircle2,
  },
];

export type WorkflowAgentVectorStoreId = "supabase" | "pinecone" | "mongodb" | "pgvector" | "qdrant";

export type WorkflowAgentVectorStoreItem = {
  id: WorkflowAgentVectorStoreId;
  nameKey:
    | "tool_vector_supabase"
    | "tool_vector_pinecone"
    | "tool_vector_mongodb"
    | "tool_vector_pgvector"
    | "tool_vector_qdrant";
  descKey:
    | "tool_vector_supabase_desc"
    | "tool_vector_pinecone_desc"
    | "tool_vector_mongodb_desc"
    | "tool_vector_pgvector_desc"
    | "tool_vector_qdrant_desc";
  brandIcon?: SimpleIcon;
  lucideIcon?: LucideIcon;
};

export const WORKFLOW_AGENT_VECTOR_STORES: WorkflowAgentVectorStoreItem[] = [
  {
    id: "supabase",
    nameKey: "tool_vector_supabase",
    descKey: "tool_vector_supabase_desc",
    brandIcon: siSupabase,
  },
  {
    id: "pinecone",
    nameKey: "tool_vector_pinecone",
    descKey: "tool_vector_pinecone_desc",
    lucideIcon: Database,
  },
  {
    id: "mongodb",
    nameKey: "tool_vector_mongodb",
    descKey: "tool_vector_mongodb_desc",
    brandIcon: siMongodb,
  },
  {
    id: "pgvector",
    nameKey: "tool_vector_pgvector",
    descKey: "tool_vector_pgvector_desc",
    lucideIcon: Database,
  },
  {
    id: "qdrant",
    nameKey: "tool_vector_qdrant",
    descKey: "tool_vector_qdrant_desc",
    lucideIcon: Database,
  },
];

export type WorkflowAgentMcpServerId = "stdio" | "sse" | "http";

export type WorkflowAgentMcpServerItem = {
  id: WorkflowAgentMcpServerId;
  nameKey: "tool_mcp_stdio" | "tool_mcp_sse" | "tool_mcp_http";
  descKey: "tool_mcp_stdio_desc" | "tool_mcp_sse_desc" | "tool_mcp_http_desc";
  icon: LucideIcon;
};

export const WORKFLOW_AGENT_MCP_SERVERS: WorkflowAgentMcpServerItem[] = [
  {
    id: "stdio",
    nameKey: "tool_mcp_stdio",
    descKey: "tool_mcp_stdio_desc",
    icon: Link2,
  },
  {
    id: "sse",
    nameKey: "tool_mcp_sse",
    descKey: "tool_mcp_sse_desc",
    icon: Link2,
  },
  {
    id: "http",
    nameKey: "tool_mcp_http",
    descKey: "tool_mcp_http_desc",
    icon: Link2,
  },
];
