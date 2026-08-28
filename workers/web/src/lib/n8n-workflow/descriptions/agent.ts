import { mainFlowNode } from "./common";
import { SQL_AGENT_PROMPT, SQL_AGENT_SYSTEM_PROMPT } from "@aiagents-hub/workflow-nodes";

/** AI Agent node — n8n-style parameter schema; Service uses repo services (serviceEndpoint). */
export const AGENT_N8N_DESCRIPTION = mainFlowNode({
  displayName: "AI Agent",
  name: "agent",
  group: ["transform"],
  description: "Generates an action plan and executes it. Can use external tools.",
  properties: [
    {
      displayName: "Source for Prompt",
      name: "promptSource",
      type: "options",
      options: [
        { name: "Define below", value: "define_below" },
        { name: "Connected Chat Trigger Node", value: "from_input" },
      ],
      default: "define_below",
    },
    {
      displayName: "Prompt (User Message)",
      name: "prompt",
      type: "string",
      typeOptions: { rows: 5 },
      default: SQL_AGENT_PROMPT,
      description: "Instructions sent to the AI model. Drag query / ragText from INPUT (Get RAG).",
      placeholder: "{{ $json.query }}",
      displayOptions: {
        show: { promptSource: ["define_below"] },
      },
    },
    {
      displayName: "System message",
      name: "systemPrompt",
      type: "string",
      typeOptions: { rows: 4 },
      default: SQL_AGENT_SYSTEM_PROMPT,
      description: "Optional system instructions prepended to the model context",
      displayOptions: {
        hide: { promptSource: ["define_below", "from_input"] },
      },
    },
    {
      displayName: "Require Specific Output Format",
      name: "requireOutputFormat",
      type: "boolean",
      default: false,
      noDataExpression: true,
    },
    {
      displayName:
        "Connect an output parser on the canvas to specify the output format you require",
      name: "outputParserNotice",
      type: "notice",
      default: "",
      displayOptions: {
        show: { requireOutputFormat: [true] },
      },
    },
    {
      displayName: "Enable Fallback Model",
      name: "enableFallbackModel",
      type: "boolean",
      default: false,
      noDataExpression: true,
      displayOptions: {
        hide: { promptSource: ["define_below", "from_input"] },
      },
    },
    {
      displayName:
        "Connect an additional language model on the canvas to use it as a fallback if the main model fails",
      name: "fallbackNotice",
      type: "notice",
      default: "",
      displayOptions: {
        show: { enableFallbackModel: [true] },
      },
    },
    {
      displayName: "Service",
      name: "serviceEndpoint",
      type: "string",
      default: "",
      description:
        "Approved AI service on this platform. Connect a service node on the canvas or pick from workflow settings.",
      typeOptions: {
        aiHubServiceSelect: true,
      },
      displayOptions: {
        hide: { promptSource: ["define_below", "from_input"] },
      },
    },
    {
      displayName: "Memory collection",
      name: "memoryCollection",
      type: "string",
      default: "vectorize-default",
      description: "Vectorize index name for RAG memory lookup",
      displayOptions: {
        hide: { promptSource: ["define_below", "from_input"] },
      },
    },
    {
      displayName: "Max tokens",
      name: "maxTokens",
      type: "number",
      default: 1024,
      description: "Maximum tokens for the model response",
      displayOptions: {
        hide: { promptSource: ["define_below", "from_input"] },
      },
    },
  ],
});
