import type { WorkflowNodeUIPlugin } from "../types";
import { MemoryWorkflowNode } from "./canvas";
import { isVectorizeMemoryNode, VectorizeNodeConfigPanel } from "./config-panel";

export { MemoryWorkflowNode } from "./canvas";
export { isVectorizeMemoryNode, VectorizeNodeConfigPanel } from "./config-panel";

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
