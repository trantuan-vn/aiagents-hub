import type { WorkflowNodeUIPlugin } from "../types";
import { ServiceWorkflowNode } from "./canvas";
import { isServiceNode, ServiceNodeConfigPanel } from "./config-panel";

export { ServiceWorkflowNode } from "./canvas";
export { isServiceNode, ServiceNodeConfigPanel } from "./config-panel";

export const serviceUIPlugin: WorkflowNodeUIPlugin = {
  id: "service_node",
  runtimeType: "service_node",
  Canvas: ServiceWorkflowNode,
  ConfigPanel: ServiceNodeConfigPanel,
  catalog: {
    category: "tool",
    labelKey: "node_service",
    descriptionKey: "node_service_desc",
    icon: "Server",
    visible: false,
  },
  match: (node) => isServiceNode(node),
};
