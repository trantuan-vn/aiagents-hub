import { mainFlowNode } from "./common";

/** Gmail human-review channel — n8n-style Send and Wait for Response. */
export const HUMAN_REVIEW_GMAIL_N8N_DESCRIPTION = mainFlowNode({
  displayName: "Gmail",
  name: "human_review",
  icon: "fa:envelope",
  group: ["transform"],
  description: "Send a Gmail message and wait for an approval response.",
  properties: [
    {
      displayName: "Credential",
      name: "credentialKey",
      type: "string",
      default: "",
      description: "Empty = send from noreply@aiagents-hub.vn. Optional Gmail SMTP credential.",
    },
    {
      displayName: "Resource",
      name: "resource",
      type: "options",
      default: "message",
      options: [{ name: "Message", value: "message" }],
    },
    {
      displayName: "Operation",
      name: "operation",
      type: "options",
      default: "sendAndWait",
      options: [{ name: "Send and Wait for Response", value: "sendAndWait" }],
    },
    {
      displayName: "To",
      name: "to",
      type: "string",
      default: "",
      required: true,
      placeholder: "e.g. info@example.com",
    },
    {
      displayName: "Subject",
      name: "subject",
      type: "string",
      default: "",
      required: true,
      placeholder: "e.g. Approval required",
    },
    {
      displayName: "Message",
      name: "message",
      type: "string",
      typeOptions: { rows: 4 },
      default: "",
      required: true,
    },
    {
      displayName: "Response Type",
      name: "responseType",
      type: "options",
      default: "approval",
      options: [
        { name: "Approval", value: "approval" },
        { name: "Free Text", value: "freeText" },
        { name: "Custom Form", value: "customForm" },
      ],
    },
    {
      displayName: "Channel",
      name: "channel",
      type: "hidden",
      default: "gmail",
    },
    {
      displayName: "Review Mode",
      name: "reviewMode",
      type: "hidden",
      default: "send_and_wait",
    },
  ],
});
