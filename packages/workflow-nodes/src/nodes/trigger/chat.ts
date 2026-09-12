import {
  defaultInputSection,
  defaultOutputSection,
} from "../default-sections";
import type { HandleDefinition } from "../../types/handles";
import type { WorkflowNodeDefinition } from "../../types/node-definition";
import { TRIGGER_KIND_FIELD } from "./kinds";

const CHAT_HANDLES: HandleDefinition[] = [
  { id: "out", type: "source", connectionType: "main", position: "right" },
];

export const CHAT_TRIGGER_DEFAULT_INITIAL_MESSAGES =
  "Hi there! 👋\nMy name is Nathan. How can I assist you today?";

export const CHAT_TRIGGER_NODE_LABEL = "When chat message received";

export type ChatTriggerMode = "hostedChat" | "webhook";
export type ChatTriggerAuth = "none" | "basic" | "hub_users";

export type ChatTriggerNodeData = {
  label?: string;
  triggerKind?: "chat";
  chatPath?: string;
  chatPublic?: boolean;
  chatMode?: ChatTriggerMode;
  chatAuth?: ChatTriggerAuth;
  chatCredentialKey?: string;
  initialMessages?: string;
  chatOptions?: Record<string, unknown>;
};

export function chatTriggerDefaultData(nodeId?: string): Record<string, unknown> {
  const path = nodeId
    ? nodeId.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 36) || nodeId
    : "chat";
  return {
    [TRIGGER_KIND_FIELD]: "chat",
    label: CHAT_TRIGGER_NODE_LABEL,
    chatPath: path,
    chatPublic: true,
    chatMode: "hostedChat",
    chatAuth: "none",
    chatCredentialKey: "",
    initialMessages: CHAT_TRIGGER_DEFAULT_INITIAL_MESSAGES,
    chatOptions: {},
  };
}

export function buildChatTriggerOutput(params: {
  sessionId: string;
  chatInput: string;
  chatUrl?: string;
  executionMode?: "test" | "production";
  action?: string;
}): Record<string, unknown> {
  return {
    triggerKind: "chat",
    sessionId: params.sessionId,
    action: params.action ?? "sendMessage",
    chatInput: params.chatInput,
    query: params.chatInput,
    chatUrl: params.chatUrl ?? "",
    executionMode: params.executionMode ?? "test",
  };
}

export const TRIGGER_CHAT_DEFINITION: WorkflowNodeDefinition = {
  id: "trigger:chat",
  runtimeType: "trigger",
  kind: "chat",
  nameKey: "trigger_kind_chat",
  descriptionKey: "trigger_kind_chat_desc",
  category: "trigger",
  icon: "MessageCircle",
  isBuiltin: true,
  isActive: true,
  sections: [
    {
      ...defaultInputSection(),
      viewModes: ["json" as const],
      fields: [],
    },
    {
      id: "parameters",
      labelKey: "section_parameters",
      descriptionKey: "section_parameters_desc",
      fields: [
        { id: "label", type: "text", labelKey: "field_label", required: true, order: 0 },
        {
          id: "chatPublic",
          type: "toggle",
          labelKey: "chat_make_public",
          defaultValue: true,
          order: 1,
        },
        {
          id: "chatMode",
          type: "select",
          labelKey: "chat_mode",
          defaultValue: "hostedChat",
          options: [
            { value: "hostedChat", labelKey: "chat_mode_hosted" },
            { value: "webhook", labelKey: "chat_mode_embedded" },
          ],
          order: 2,
        },
        {
          id: "chatAuth",
          type: "select",
          labelKey: "chat_authentication",
          defaultValue: "none",
          options: [
            { value: "none", labelKey: "chat_auth_none" },
            { value: "basic", labelKey: "chat_auth_basic" },
            { value: "hub_users", labelKey: "chat_auth_hub_users" },
          ],
          order: 3,
        },
        {
          id: "initialMessages",
          type: "textarea",
          labelKey: "chat_initial_messages",
          defaultValue: CHAT_TRIGGER_DEFAULT_INITIAL_MESSAGES,
          order: 4,
        },
      ],
    },
    defaultOutputSection(false),
  ],
  handles: CHAT_HANDLES,
  defaultData: chatTriggerDefaultData(),
};
