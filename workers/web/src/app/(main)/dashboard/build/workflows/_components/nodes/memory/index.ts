import type { WorkflowNodeUIPlugin } from "../types";
import { MemoryWorkflowNode } from "../workflow-nodes";
import {
  isVectorizeMemoryNode,
  VectorizeNodeConfigPanel,
} from "../../panels/node-config/vectorize-node-config-panel";

export { isVectorizeMemoryNode, VectorizeNodeConfigPanel } from "../../panels/node-config/vectorize-node-config-panel";

export const memoryUIPlugin: WorkflowNodeUIPlugin = {
  id: "memory_node",
  runtimeType: "memory_node",
  Canvas: MemoryWorkflowNode,
  ConfigPanel: VectorizeNodeConfigPanel,
  catalog: {
    category: "memory",
    labelKey: "node_vectorize",
    descriptionKey: "node_vectorize_desc",
    icon: "Database",
    visible: false,
  },
  match: (node) => isVectorizeMemoryNode(node),
};
