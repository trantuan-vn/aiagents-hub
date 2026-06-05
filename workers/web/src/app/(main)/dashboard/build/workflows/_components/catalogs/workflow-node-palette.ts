import { Bot, Database, GitBranch, Layers, Play, Server, UserCheck, Wrench, Zap } from "lucide-react";

export const WORKFLOW_NODE_PALETTE = [
  { type: "trigger", icon: Play, key: "node_trigger" as const },
  { type: "agent", icon: Bot, key: "node_agent" as const },
  { type: "service_node", icon: Server, key: "node_service" as const },
  { type: "memory_node", icon: Database, key: "node_memory" as const },
  { type: "tool_node", icon: Wrench, key: "node_tool" as const },
  { type: "human_review", icon: UserCheck, key: "node_human_review" as const },
  { type: "flow", icon: GitBranch, key: "node_flow" as const },
  { type: "core", icon: Layers, key: "node_core" as const },
  { type: "action_in_app", icon: Zap, key: "node_action" as const },
  { type: "data_transformation", icon: Wrench, key: "node_transform" as const },
] as const;

/** Resource nodes attach below an agent; omit from side-handle “add node” menus. */
export const WORKFLOW_FLOW_NODE_PALETTE = WORKFLOW_NODE_PALETTE.filter(
  (item) => item.type !== "service_node" && item.type !== "memory_node" && item.type !== "tool_node",
);

export type WorkflowNodePaletteKey = (typeof WORKFLOW_NODE_PALETTE)[number]["key"];
