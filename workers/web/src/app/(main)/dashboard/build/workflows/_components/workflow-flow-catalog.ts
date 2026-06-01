import {
  CircleSlash,
  GitCompare,
  GitMerge,
  Hourglass,
  ListFilter,
  RotateCw,
  Route,
  SquareArrowOutUpRight,
  Split,
  type LucideIcon,
} from "lucide-react";

export type WorkflowFlowKindId =
  | "filter"
  | "if"
  | "loop_over_items"
  | "merge"
  | "compare_datasets"
  | "execute_sub_workflow"
  | "stop_and_error"
  | "switch"
  | "wait";

export type WorkflowFlowCatalogItem = {
  id: WorkflowFlowKindId;
  nameKey: `flow_kind_${WorkflowFlowKindId}`;
  descKey: `flow_kind_${WorkflowFlowKindId}_desc`;
  icon: LucideIcon;
};

export const WORKFLOW_FLOW_POPULAR: WorkflowFlowCatalogItem[] = [
  {
    id: "filter",
    nameKey: "flow_kind_filter",
    descKey: "flow_kind_filter_desc",
    icon: ListFilter,
  },
  {
    id: "if",
    nameKey: "flow_kind_if",
    descKey: "flow_kind_if_desc",
    icon: Split,
  },
  {
    id: "loop_over_items",
    nameKey: "flow_kind_loop_over_items",
    descKey: "flow_kind_loop_over_items_desc",
    icon: RotateCw,
  },
  {
    id: "merge",
    nameKey: "flow_kind_merge",
    descKey: "flow_kind_merge_desc",
    icon: GitMerge,
  },
];

export const WORKFLOW_FLOW_OTHER: WorkflowFlowCatalogItem[] = [
  {
    id: "compare_datasets",
    nameKey: "flow_kind_compare_datasets",
    descKey: "flow_kind_compare_datasets_desc",
    icon: GitCompare,
  },
  {
    id: "execute_sub_workflow",
    nameKey: "flow_kind_execute_sub_workflow",
    descKey: "flow_kind_execute_sub_workflow_desc",
    icon: SquareArrowOutUpRight,
  },
  {
    id: "stop_and_error",
    nameKey: "flow_kind_stop_and_error",
    descKey: "flow_kind_stop_and_error_desc",
    icon: CircleSlash,
  },
  {
    id: "switch",
    nameKey: "flow_kind_switch",
    descKey: "flow_kind_switch_desc",
    icon: Route,
  },
  {
    id: "wait",
    nameKey: "flow_kind_wait",
    descKey: "flow_kind_wait_desc",
    icon: Hourglass,
  },
];

/** All flow kinds (popular first, then other). */
export const WORKFLOW_FLOW_CATALOG: WorkflowFlowCatalogItem[] = [
  ...WORKFLOW_FLOW_POPULAR,
  ...WORKFLOW_FLOW_OTHER,
];
