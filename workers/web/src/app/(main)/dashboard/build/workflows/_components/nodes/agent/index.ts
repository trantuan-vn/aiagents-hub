import type { WorkflowNodeUIPlugin } from "../types";
import { AgentWorkflowNode } from "../workflow-nodes";
import { AgentNodeConfigPanel, isAgentNode } from "../../panels/node-config/agent-node-config-panel";

export { AgentNodeConfigPanel, isAgentNode } from "../../panels/node-config/agent-node-config-panel";

export const agentUIPlugin: WorkflowNodeUIPlugin = {
  id: "agent",
  runtimeType: "agent",
  Canvas: AgentWorkflowNode,
  ConfigPanel: AgentNodeConfigPanel,
  catalog: {
    category: "ai",
    labelKey: "node_agent",
    descriptionKey: "node_agent_desc",
    icon: "Bot",
  },
  match: (node) => isAgentNode(node),
};
