import {
  Bot,
  CheckCircle2,
  GitBranch,
  Globe,
  Layers,
  Pencil,
  Zap,
  type LucideIcon,
} from "lucide-react";

export type WorkflowAddNodeCategoryId =
  | "ai"
  | "action_in_app"
  | "data_transformation"
  | "flow"
  | "core"
  | "human_review";

export type WorkflowAddNodeCategory = {
  id: WorkflowAddNodeCategoryId;
  icon: LucideIcon;
  titleKey: `add_category_${WorkflowAddNodeCategoryId}`;
  descKey: `add_category_${WorkflowAddNodeCategoryId}_desc`;
  nodeType: string;
  nodeKey:
    | "node_agent"
    | "node_action"
    | "node_transform"
    | "node_flow"
    | "node_core"
    | "node_human_review";
};

export const WORKFLOW_ADD_NODE_CATEGORIES: WorkflowAddNodeCategory[] = [
  {
    id: "ai",
    icon: Bot,
    titleKey: "add_category_ai",
    descKey: "add_category_ai_desc",
    nodeType: "agent",
    nodeKey: "node_agent",
  },
  {
    id: "action_in_app",
    icon: Globe,
    titleKey: "add_category_action_in_app",
    descKey: "add_category_action_in_app_desc",
    nodeType: "action_in_app",
    nodeKey: "node_action",
  },
  {
    id: "data_transformation",
    icon: Pencil,
    titleKey: "add_category_data_transformation",
    descKey: "add_category_data_transformation_desc",
    nodeType: "data_transformation",
    nodeKey: "node_transform",
  },
  {
    id: "flow",
    icon: GitBranch,
    titleKey: "add_category_flow",
    descKey: "add_category_flow_desc",
    nodeType: "flow",
    nodeKey: "node_flow",
  },
  {
    id: "core",
    icon: Layers,
    titleKey: "add_category_core",
    descKey: "add_category_core_desc",
    nodeType: "core",
    nodeKey: "node_core",
  },
  {
    id: "human_review",
    icon: CheckCircle2,
    titleKey: "add_category_human_review",
    descKey: "add_category_human_review_desc",
    nodeType: "human_review",
    nodeKey: "node_human_review",
  },
];

export const WORKFLOW_ADD_TRIGGER = {
  nodeType: "trigger",
  nodeKey: "node_trigger" as const,
  icon: Zap,
  titleKey: "add_another_trigger" as const,
  descKey: "add_another_trigger_desc" as const,
};
