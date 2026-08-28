import { mainFlowNode } from "./common";
import { VECTOR_GMAIL_MESSAGE, VECTOR_GMAIL_SUBJECT } from "@aiagents-hub/workflow-nodes";

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
      placeholder: "{{ $json.email }}",
      description: "Drag an email from INPUT, or type an address.",
    },
    {
      displayName: "Subject",
      name: "subject",
      type: "string",
      default: VECTOR_GMAIL_SUBJECT,
      required: true,
      placeholder: "Indexed {{ $json.totalBatches }} tables",
      description: "Drag fields from INPUT (Loop done). Example: tableCount → {{ $json.tableCount }}",
    },
    {
      displayName: "Message",
      name: "message",
      type: "string",
      typeOptions: { rows: 4 },
      default: VECTOR_GMAIL_MESSAGE,
      required: true,
      placeholder: "Finished indexing {{ $json.totalBatches }} tables.",
      description: "Drag fields from INPUT (Loop done) into the message body.",
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
