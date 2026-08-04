import type { WorkflowNodeUIPlugin } from "../types";
import { AgentWorkflowNode } from "./canvas";
import { AgentNodeConfigPanel, isAgentNode } from "./config-panel";

export { AgentWorkflowNode } from "./canvas";
export { AgentNodeConfigPanel, isAgentNode } from "./config-panel";

export const agentUIPlugin: WorkflowNodeUIPlugin = {
  id: "agent",
  runtimeType: "agent",
  Canvas: AgentWorkflowNode,
  ConfigPanel: AgentNodeConfigPanel,
  defaults: () => ({ label: "Agent", promptSource: "define_below" }),
  catalog: {
    category: "ai",
    labelKey: "node_agent",
    descriptionKey: "node_agent_desc",
    icon: "Bot",
  },
  match: (node) => isAgentNode(node),
};
