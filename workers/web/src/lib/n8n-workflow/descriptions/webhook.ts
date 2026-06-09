import { mainFlowNode } from "./common";

const WEBHOOK_PROPERTIES = [
  {
    displayName: "Label",
    name: "label",
    type: "string" as const,
    default: "Webhook",
    required: true,
  },
  {
    displayName: "HTTP Method",
    name: "httpMethod",
    type: "options" as const,
    default: "GET",
    options: [
      { name: "GET", value: "GET" },
      { name: "POST", value: "POST" },
      { name: "PUT", value: "PUT" },
      { name: "DELETE", value: "DELETE" },
    ],
  },
  {
    displayName: "Path",
    name: "webhookPath",
    type: "string" as const,
    default: "",
    placeholder: "my-hook",
  },
  {
    displayName: "Authentication",
    name: "webhookAuth",
    type: "options" as const,
    default: "none",
    options: [
      { name: "None", value: "none" },
      { name: "Basic Auth", value: "basic" },
      { name: "Header Auth", value: "header" },
      { name: "JWT", value: "jwt" },
    ],
  },
  {
    displayName: "Respond",
    name: "webhookRespond",
    type: "options" as const,
    default: "immediately",
    options: [
      { name: "Immediately", value: "immediately" },
      { name: "When last node finishes", value: "when_last_node" },
      { name: "Using Respond to Webhook node", value: "respond_node" },
      { name: "Streaming", value: "streaming" },
    ],
  },
];

export const TRIGGER_WEBHOOK_N8N_DESCRIPTION = mainFlowNode({
  displayName: "Webhook Trigger",
  name: "trigger",
  icon: "fa:bolt",
  group: ["trigger"],
  description: "Starts the workflow when an HTTP request is received.",
  properties: WEBHOOK_PROPERTIES,
});

export const CORE_WEBHOOK_N8N_DESCRIPTION = mainFlowNode({
  displayName: "Webhook",
  name: "core",
  icon: "fa:bolt",
  group: ["trigger"],
  description: "Webhook node embedded in core group.",
  properties: WEBHOOK_PROPERTIES,
});
