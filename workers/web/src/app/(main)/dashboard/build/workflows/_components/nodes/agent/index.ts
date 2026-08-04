import {
  AGENT_KINDS,
  AGENT_OVERRIDE_KINDS,
  type AgentKind,
} from "@aiagents-hub/workflow-nodes";

import type { WorkflowNodeUIPlugin } from "../types";
import { AgentWorkflowNode } from "./canvas";
import { AgentNodeConfigPanel, isAgentNode } from "./config-panel";

export { AgentWorkflowNode } from "./canvas";
export { AgentNodeConfigPanel, isAgentNode } from "./config-panel";

/** Base agent — fallback for legacy graphs without agentKind. */
export const agentUIPlugin: WorkflowNodeUIPlugin = {
  id: "agent",
  runtimeType: "agent",
  Canvas: AgentWorkflowNode,
  ConfigPanel: AgentNodeConfigPanel,
  defaults: () => ({ label: "Agent", promptSource: "define_below", agentKind: "tools_agent" }),
  catalog: {
    category: "ai",
    labelKey: "node_agent",
    descriptionKey: "node_agent_desc",
    icon: "Bot",
    visible: false,
  },
  match: (node) => isAgentNode(node) && !(node.data as { agentKind?: string })?.agentKind,
};

export function createAgentKindUIPlugin(kind: AgentKind): WorkflowNodeUIPlugin {
  return {
    id: `agent:${kind}`,
    runtimeType: "agent",
    kind,
    Canvas: AgentWorkflowNode,
    ConfigPanel: AgentNodeConfigPanel,
    defaults: () => ({
      label: "Agent",
      promptSource: "define_below",
      agentKind: kind,
    }),
    catalog: {
      category: "ai",
      labelKey: kind === "tools_agent" ? "node_agent" : `agent_kind_${kind}`,
      descriptionKey: kind === "tools_agent" ? "node_agent_desc" : `agent_kind_${kind}_desc`,
      icon: "Bot",
      keywords: ["agent", "ai", kind],
    },
    match: (node) =>
      isAgentNode(node) && (node.data as { agentKind?: string })?.agentKind === kind,
  };
}

export const AGENT_KIND_UI_PLUGINS: WorkflowNodeUIPlugin[] = AGENT_KINDS.filter(
  (kind) => !AGENT_OVERRIDE_KINDS.has(kind),
).map(createAgentKindUIPlugin);
