import {
  defaultInputSection,
  defaultOutputSection,
} from "../default-sections";
import { createBuiltin } from "../create-builtin";
import type { WorkflowNodeDefinition } from "../../types/node-definition";
import {
  AGENT_KIND_FIELD,
  AGENT_KINDS,
  AGENT_OVERRIDE_KINDS,
  type AgentKind,
} from "./kinds";

export {
  AGENT_KIND_FIELD,
  AGENT_KINDS,
  AGENT_OVERRIDE_KINDS,
  type AgentKind,
} from "./kinds";

const AGENT_SECTIONS: WorkflowNodeDefinition["sections"] = [
  {
    ...defaultInputSection(),
    fields: [
      {
        id: "workflowTrigger",
        type: "info",
        labelKey: "field_workflow_trigger",
        descriptionKey: "field_workflow_trigger_desc",
        order: 0,
      },
      {
        id: "variables",
        type: "json",
        labelKey: "field_variables_context",
        descriptionKey: "field_variables_context_desc",
        supportsExpression: true,
        order: 1,
      },
    ],
  },
  {
    id: "parameters",
    labelKey: "section_parameters",
    descriptionKey: "section_parameters_desc",
    fields: [
      { id: "label", type: "text", labelKey: "field_label", required: true, order: 0 },
      {
        id: AGENT_KIND_FIELD,
        type: "select",
        labelKey: "field_agent_kind",
        defaultValue: "tools_agent",
        options: AGENT_KINDS.map((value) => ({
          value,
          labelKey: `agent_kind_${value}`,
        })),
        order: 0.5,
      },
      {
        id: "promptSource",
        type: "select",
        labelKey: "field_prompt_source",
        defaultValue: "define_below",
        options: [
          { value: "define_below", labelKey: "opt_prompt_define_below" },
          { value: "from_input", labelKey: "opt_prompt_from_input" },
        ],
        order: 1,
      },
      {
        id: "prompt",
        type: "textarea",
        labelKey: "field_prompt",
        descriptionKey: "field_prompt_desc",
        supportsExpression: true,
        placeholderKey: "field_prompt_placeholder",
        order: 2,
      },
      {
        id: "requireOutputFormat",
        type: "toggle",
        labelKey: "field_require_output_format",
        defaultValue: false,
        order: 3,
      },
      {
        id: "enableFallbackModel",
        type: "toggle",
        labelKey: "field_enable_fallback_model",
        defaultValue: false,
        order: 4,
      },
      {
        id: "options",
        type: "options-group",
        labelKey: "field_options",
        descriptionKey: "field_options_desc",
        order: 5,
      },
      {
        id: "chatModel",
        type: "resource-link",
        labelKey: "field_service",
        descriptionKey: "field_service_desc",
        required: true,
        order: 6,
      },
      {
        id: "memory",
        type: "resource-link",
        labelKey: "field_memory",
        descriptionKey: "field_memory_desc",
        order: 7,
      },
      {
        id: "tools",
        type: "resource-link",
        labelKey: "field_tools",
        descriptionKey: "field_tools_desc",
        order: 8,
      },
    ],
  },
  defaultOutputSection(true),
];

/** Base family — fallback when no agentKind is set (legacy graphs). */
export const AGENT_NODE_DEFINITION: WorkflowNodeDefinition = createBuiltin({
  id: "agent",
  runtimeType: "agent",
  nameKey: "node_agent",
  descriptionKey: "node_agent_desc",
  category: "ai",
  icon: "Bot",
  defaultData: {
    promptSource: "define_below",
    [AGENT_KIND_FIELD]: "tools_agent",
  },
  sections: AGENT_SECTIONS,
});

export function createAgentKindDefinition(kind: AgentKind): WorkflowNodeDefinition {
  return createBuiltin({
    id: `agent:${kind}`,
    runtimeType: "agent",
    kind,
    nameKey: kind === "tools_agent" ? "node_agent" : `agent_kind_${kind}`,
    descriptionKey: kind === "tools_agent" ? "node_agent_desc" : `agent_kind_${kind}_desc`,
    category: "ai",
    icon: "Bot",
    defaultData: {
      label: "Agent",
      promptSource: "define_below",
      [AGENT_KIND_FIELD]: kind,
    },
    sections: AGENT_SECTIONS,
  });
}

export const AGENT_KIND_DEFINITIONS: WorkflowNodeDefinition[] = AGENT_KINDS.filter(
  (kind) => !AGENT_OVERRIDE_KINDS.has(kind),
).map(createAgentKindDefinition);
