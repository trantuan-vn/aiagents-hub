import {
  FLOW_KINDS,
  FLOW_OVERRIDE_KINDS,
  type FlowKind,
} from "@aiagents-hub/workflow-nodes";

import type { WorkflowNodeUIPlugin } from "../types";
import { FlowNode } from "./canvas";

export { FlowNode } from "./canvas";

/** Base family plugin — hidden from catalog; kind plugins are the add-node entries. */
export const flowUIPlugin: WorkflowNodeUIPlugin = {
  id: "flow",
  runtimeType: "flow",
  Canvas: FlowNode,
  defaults: () => ({ label: "Flow", flowKind: "if" }),
  catalog: {
    category: "flow",
    labelKey: "node_flow",
    descriptionKey: "node_flow_desc",
    icon: "GitBranch",
    visible: false,
  },
};

export function createFlowKindUIPlugin(kind: FlowKind): WorkflowNodeUIPlugin {
  const label = kind.replace(/_/g, " ");
  return {
    id: `flow:${kind}`,
    runtimeType: "flow",
    kind,
    Canvas: FlowNode,
    defaults: () => ({
      label,
      flowKind: kind,
      ...(kind === "loop_over_items" ? { batchSize: 1 } : {}),
    }),
    catalog: {
      category: "flow",
      labelKey: `flow_kind_${kind}`,
      descriptionKey: `flow_kind_${kind}_desc`,
      icon: kind === "loop_over_items" ? "RotateCw" : "GitBranch",
      keywords: [kind, "flow"],
    },
  };
}

export const FLOW_KIND_UI_PLUGINS: WorkflowNodeUIPlugin[] = FLOW_KINDS.filter(
  (kind) => !FLOW_OVERRIDE_KINDS.has(kind),
).map(createFlowKindUIPlugin);

/** Override slot for loop_over_items — shares canvas; richer defaults. */
export const flowLoopOverItemsUIPlugin: WorkflowNodeUIPlugin = createFlowKindUIPlugin("loop_over_items");
