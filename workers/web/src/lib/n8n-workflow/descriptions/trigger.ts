import { mainFlowNode } from "./common";

export const TRIGGER_N8N_DESCRIPTION = mainFlowNode({
  displayName: "Trigger",
  name: "trigger",
  icon: "fa:play",
  group: ["trigger"],
  description: "Starts the workflow when invoked manually, via webhook, or on a schedule.",
  properties: [
    {
      displayName: "Trigger type",
      name: "triggerKind",
      type: "options",
      default: "manual",
      options: [
        { name: "Manual", value: "manual" },
        { name: "Webhook", value: "webhook" },
        { name: "Schedule", value: "schedule" },
      ],
    },
    {
      displayName: "Label",
      name: "label",
      type: "string",
      default: "Trigger",
    },
  ],
});
