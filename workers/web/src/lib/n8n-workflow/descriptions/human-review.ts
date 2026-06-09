import { mainFlowNode } from "./common";

export const HUMAN_REVIEW_N8N_DESCRIPTION = mainFlowNode({
  displayName: "Human Review",
  name: "human_review",
  icon: "fa:user-check",
  group: ["transform"],
  description: "Pauses the workflow until a human approves or rejects.",
  properties: [
    {
      displayName: "Channel",
      name: "channel",
      type: "options",
      default: "email",
      options: [
        { name: "Email", value: "email" },
        { name: "Slack", value: "slack" },
      ],
    },
    {
      displayName: "Message",
      name: "message",
      type: "string",
      typeOptions: { rows: 3 },
      default: "Please review and approve this step.",
    },
    {
      displayName: "Label",
      name: "label",
      type: "string",
      default: "Human Review",
    },
  ],
});
