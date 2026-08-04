/** Tool_node sub-kinds — single source of truth for catalog + definitions. */
export const TOOL_KINDS = [
  "agent",
  "workflow",
  "code",
  "http_request",
  "save-rag",
  "get-rag",
  "get-db-info",
  "mcp",
] as const;

export type ToolKind = (typeof TOOL_KINDS)[number];

/** Kind field stored on `node.data` for tool_node. */
export const TOOL_KIND_FIELD = "toolKind" as const;

/** Kinds with dedicated override definitions / execute modules. */
export const TOOL_OVERRIDE_KINDS = new Set<ToolKind>(["save-rag", "get-rag", "get-db-info"]);
