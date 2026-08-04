import type { WorkflowNodeUIPlugin } from "../types";
import { FlowNode } from "./canvas";

export { FlowNode } from "./canvas";

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
  },
};
