import {
  AGENT_KINDS,
  AGENT_OVERRIDE_KINDS,
  REASONING_AGENT_DEFAULTS,
  REASONING_AGENT_PROMPT,
  REASONING_AGENT_SYSTEM_PROMPT,
  SQL_AGENT_PROMPT,
  SQL_AGENT_SYSTEM_PROMPT,
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
  defaults: () => ({
    label: "Agent",
    promptSource: "define_below",
    prompt: SQL_AGENT_PROMPT,
    systemPrompt: SQL_AGENT_SYSTEM_PROMPT,
    agentKind: "tools_agent",
  }),
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
      prompt: SQL_AGENT_PROMPT,
      systemPrompt: SQL_AGENT_SYSTEM_PROMPT,
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

export const agentReasoningUIPlugin: WorkflowNodeUIPlugin = {
  id: "agent:reasoning_agent",
  runtimeType: "agent",
  kind: "reasoning_agent",
  Canvas: AgentWorkflowNode,
  ConfigPanel: AgentNodeConfigPanel,
  defaults: () => ({
    label: "Reasoning Agent",
    promptSource: "define_below",
    prompt: REASONING_AGENT_PROMPT,
    systemPrompt: REASONING_AGENT_SYSTEM_PROMPT,
    agentKind: "reasoning_agent",
    ...REASONING_AGENT_DEFAULTS,
    agentVisibleOptions: [
      "systemPrompt",
      "maxTokens",
      "clarificationMode",
      "requireCitations",
      "maxReflectRetries",
      "noImprovementLimit",
      "maxActSteps",
      "enablePlanner",
      "safetyLevel",
    ],
  }),
  catalog: {
    category: "ai",
    labelKey: "agent_kind_reasoning_agent",
    descriptionKey: "agent_kind_reasoning_agent_desc",
    icon: "Bot",
    keywords: ["agent", "ai", "reasoning", "memory", "citation"],
  },
  match: (node) =>
    isAgentNode(node) && (node.data as { agentKind?: string })?.agentKind === "reasoning_agent",
};
