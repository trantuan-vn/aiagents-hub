import { MessageCircle } from "lucide-react";

import type { WorkflowNodeUIPlugin } from "../types";
import { ChatTriggerCanvas } from "./canvas";
import { ChatTriggerConfigPanel, isChatTriggerNode } from "./config-panel";
import { chatTriggerDefaults } from "./defaults";

export { chatTriggerDefaults } from "./defaults";
export { isChatTriggerNode, ChatTriggerConfigPanel } from "./config-panel";

export const chatTriggerUIPlugin: WorkflowNodeUIPlugin = {
  id: "trigger:chat",
  runtimeType: "trigger",
  kind: "chat",
  Canvas: ChatTriggerCanvas,
  ConfigPanel: ChatTriggerConfigPanel,
  defaults: () => chatTriggerDefaults(`trigger-${Date.now()}`),
  catalog: {
    category: "trigger",
    labelKey: "trigger_kind_chat",
    descriptionKey: "trigger_kind_chat_desc",
    icon: "MessageCircle",
    keywords: ["chat", "message", "ai", "trigger"],
  },
  match: (node) => isChatTriggerNode(node) && node.type === "trigger",
};

export const ChatCatalogIcon = MessageCircle;
