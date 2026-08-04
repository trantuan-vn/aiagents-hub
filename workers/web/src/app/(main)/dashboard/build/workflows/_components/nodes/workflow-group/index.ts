import type { WorkflowNodeUIPlugin } from "../types";
import { WorkflowGroupNode } from "./canvas";

export { WorkflowGroupNode } from "./canvas";

export const workflowGroupUIPlugin: WorkflowNodeUIPlugin = {
  id: "workflow_group",
  runtimeType: "workflow_group",
  Canvas: WorkflowGroupNode,
  defaults: () => ({ label: "Group" }),
  catalog: {
    category: "flow",
    labelKey: "node_workflow_group",
    descriptionKey: "node_workflow_group_desc",
    icon: "Group",
    visible: false,
  },
};
