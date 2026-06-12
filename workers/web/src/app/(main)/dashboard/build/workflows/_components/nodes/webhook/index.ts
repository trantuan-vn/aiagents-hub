import { Webhook } from "lucide-react";

import type { WorkflowNodeUIPlugin } from "../types";
import { WebhookTriggerCanvas } from "./canvas";
import { isWebhookNode, WebhookNodeConfigPanel } from "./config-panel";
import { coreWebhookDefaults, triggerWebhookDefaults } from "./defaults";
import { CORE_WEBHOOK_N8N_DESCRIPTION, TRIGGER_WEBHOOK_N8N_DESCRIPTION } from "./n8n-properties";

export { coreWebhookDefaults, triggerWebhookDefaults, webhookNodeDefaults } from "./defaults";
export { isWebhookNode, WebhookNodeConfigPanel } from "./config-panel";
export { CORE_WEBHOOK_N8N_DESCRIPTION, TRIGGER_WEBHOOK_N8N_DESCRIPTION } from "./n8n-properties";

export const webhookTriggerUIPlugin: WorkflowNodeUIPlugin = {
  id: "trigger:webhook",
  runtimeType: "trigger",
  kind: "webhook",
  Canvas: WebhookTriggerCanvas,
  ConfigPanel: WebhookNodeConfigPanel,
  defaults: () => triggerWebhookDefaults(`trigger-${Date.now()}`),
  catalog: {
    category: "trigger",
    labelKey: "trigger_kind_webhook",
    descriptionKey: "trigger_kind_webhook_desc",
    icon: "Webhook",
    keywords: ["webhook", "http", "trigger"],
  },
  n8nProperties: TRIGGER_WEBHOOK_N8N_DESCRIPTION.properties,
  match: (node) => isWebhookNode(node) && node.type === "trigger",
};

export const coreWebhookUIPlugin: WorkflowNodeUIPlugin = {
  id: "core:webhook",
  runtimeType: "core",
  kind: "webhook",
  Canvas: WebhookTriggerCanvas,
  ConfigPanel: WebhookNodeConfigPanel,
  defaults: () => coreWebhookDefaults(`core-${Date.now()}`),
  catalog: {
    category: "core",
    labelKey: "core_kind_webhook",
    descriptionKey: "core_kind_webhook_desc",
    icon: "Webhook",
    keywords: ["webhook", "http"],
  },
  n8nProperties: CORE_WEBHOOK_N8N_DESCRIPTION.properties,
  match: (node) => isWebhookNode(node) && node.type === "core",
};

/** Lucide icon for catalog rendering */
export const WebhookCatalogIcon = Webhook;
