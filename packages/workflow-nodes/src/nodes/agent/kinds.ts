/** Agent (AI) sub-kinds — extend when adding agent variants. */
export const AGENT_KINDS = ["tools_agent"] as const;

export type AgentKind = (typeof AGENT_KINDS)[number];

/** Kind field stored on `node.data` for agent. */
export const AGENT_KIND_FIELD = "agentKind" as const;

/**
 * Kinds with dedicated override modules.
 * Default agent canvas/config stays on the base plugin (id `agent`);
 * factory emits `agent:tools_agent` as the catalog kind entry.
 */
export const AGENT_OVERRIDE_KINDS = new Set<AgentKind>([]);
