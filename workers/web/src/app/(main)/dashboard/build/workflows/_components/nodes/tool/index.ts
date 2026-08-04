import type { WorkflowNodeUIPlugin } from "../types";
import { ToolWorkflowNode } from "./canvas";

export { ToolWorkflowNode } from "./canvas";

export const toolUIPlugin: WorkflowNodeUIPlugin = {
  id: "tool_node",
  runtimeType: "tool_node",
  Canvas: ToolWorkflowNode,
  defaults: () => ({ label: "Tool" }),
  catalog: {
    category: "tool",
    labelKey: "node_tool",
    descriptionKey: "node_tool_desc",
    icon: "Wrench",
    visible: false,
  },
};
