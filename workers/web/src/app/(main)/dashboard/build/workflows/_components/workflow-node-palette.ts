import { Bot, GitBranch, Layers, Play, UserCheck, Wrench, Zap } from "lucide-react";

export const WORKFLOW_NODE_PALETTE = [
  { type: "trigger", icon: Play, key: "node_trigger" as const },
  { type: "agent", icon: Bot, key: "node_agent" as const },
  { type: "human_review", icon: UserCheck, key: "node_human_review" as const },
  { type: "flow", icon: GitBranch, key: "node_flow" as const },
  { type: "core", icon: Layers, key: "node_core" as const },
  { type: "action_in_app", icon: Zap, key: "node_action" as const },
  { type: "data_transformation", icon: Wrench, key: "node_transform" as const },
] as const;

export type WorkflowNodePaletteKey = (typeof WORKFLOW_NODE_PALETTE)[number]["key"];
