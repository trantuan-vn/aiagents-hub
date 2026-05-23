import { WORKFLOW_NODE_PALETTE } from "./workflow-node-palette";

export const WORKFLOW_TOOL_CATALOG = [
  { id: "http-request", nameKey: "tool_http", descKey: "tool_http_desc" },
  { id: "code", nameKey: "tool_code", descKey: "tool_code_desc" },
  { id: "set", nameKey: "tool_set", descKey: "tool_set_desc" },
  { id: "merge", nameKey: "tool_merge", descKey: "tool_merge_desc" },
  { id: "slack", nameKey: "tool_slack", descKey: "tool_slack_desc" },
  { id: "google-sheets", nameKey: "tool_sheets", descKey: "tool_sheets_desc" },
  { id: "github", nameKey: "tool_github", descKey: "tool_github_desc" },
  { id: "openai-functions", nameKey: "tool_openai_fn", descKey: "tool_openai_fn_desc" },
] as const;

export const WORKFLOW_MEMORY_CATALOG = [
  { id: "r2", nameKey: "mem_r2", descKey: "mem_r2_desc" },
  { id: "d1", nameKey: "mem_d1", descKey: "mem_d1_desc" },
  { id: "vectorize", nameKey: "mem_vectorize", descKey: "mem_vectorize_desc" },
  { id: "postgres", nameKey: "mem_postgres", descKey: "mem_postgres_desc" },
  { id: "mysql", nameKey: "mem_mysql", descKey: "mem_mysql_desc" },
  { id: "mongodb", nameKey: "mem_mongodb", descKey: "mem_mongodb_desc" },
  { id: "redis", nameKey: "mem_redis", descKey: "mem_redis_desc" },
  { id: "pinecone", nameKey: "mem_pinecone", descKey: "mem_pinecone_desc" },
] as const;

export const WORKFLOW_NODE_CATALOG = WORKFLOW_NODE_PALETTE.map(({ type, key }) => ({ type, nameKey: key }));
