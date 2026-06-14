import type { WorkflowNodeUIPlugin } from "../types";
import { ServiceWorkflowNode } from "../workflow-nodes";
import { isServiceNode, ServiceNodeConfigPanel } from "../../panels/node-config/service-node-config-panel";

export { isServiceNode, ServiceNodeConfigPanel } from "../../panels/node-config/service-node-config-panel";

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
