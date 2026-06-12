import {
  defaultInputSection,
  defaultOutputSection,
} from "../default-sections";
import type { WorkflowNodeDefinition } from "../../types/node-definition";
import type { HandleDefinition } from "../../types/handles";

const WEBHOOK_HANDLES: HandleDefinition[] = [
  { id: "out", type: "source", connectionType: "main", position: "right" },
];

const CORE_WEBHOOK_HANDLES: HandleDefinition[] = [
  { id: "in", type: "target", connectionType: "main", position: "left" },
  { id: "out", type: "source", connectionType: "main", position: "right" },
];

const WEBHOOK_PARAM_FIELDS = [
  { id: "label", type: "text" as const, labelKey: "field_label", required: true, order: 0 },
  {
    id: "httpMethod",
    type: "select" as const,
    labelKey: "field_http_method",
    defaultValue: "GET",
    options: [
      { value: "GET", labelKey: "opt_http_get" },
      { value: "POST", labelKey: "opt_http_post" },
      { value: "PUT", labelKey: "opt_http_put" },
      { value: "DELETE", labelKey: "opt_http_delete" },
    ],
    order: 1,
  },
  { id: "webhookPath", type: "text" as const, labelKey: "webhook_path", order: 2 },
  {
    id: "webhookAuth",
    type: "select" as const,
    labelKey: "webhook_authentication",
    defaultValue: "none",
    options: [
      { value: "none", labelKey: "webhook_auth_none" },
      { value: "basic", labelKey: "webhook_auth_basic" },
      { value: "header", labelKey: "webhook_auth_header" },
      { value: "jwt", labelKey: "webhook_auth_jwt" },
    ],
    order: 3,
  },
  {
    id: "webhookRespond",
    type: "select" as const,
    labelKey: "webhook_respond",
    defaultValue: "immediately",
    options: [
      { value: "immediately", labelKey: "webhook_respond_immediately" },
      { value: "when_last_node", labelKey: "webhook_respond_last_node" },
      { value: "respond_node", labelKey: "webhook_respond_node" },
      { value: "streaming", labelKey: "webhook_respond_streaming" },
    ],
    order: 4,
  },
];

function webhookSections() {
  return [
    {
      ...defaultInputSection(),
      viewModes: ["json" as const],
      fields: [],
    },
    {
      id: "parameters" as const,
      labelKey: "section_parameters",
      descriptionKey: "section_parameters_desc",
      fields: WEBHOOK_PARAM_FIELDS,
    },
    defaultOutputSection(false),
  ];
}

export const TRIGGER_WEBHOOK_DEFINITION: WorkflowNodeDefinition = {
  id: "trigger:webhook",
  runtimeType: "trigger",
  kind: "webhook",
  nameKey: "trigger_kind_webhook",
  descriptionKey: "trigger_kind_webhook_desc",
  category: "trigger",
  icon: "Webhook",
  isBuiltin: true,
  isActive: true,
  sections: webhookSections(),
  handles: WEBHOOK_HANDLES,
  defaultData: {
    triggerKind: "webhook",
    httpMethod: "GET",
    webhookAuth: "none",
    webhookRespond: "immediately",
    webhookTriggerMode: "workflow_active",
  },
};

export const CORE_WEBHOOK_DEFINITION: WorkflowNodeDefinition = {
  id: "core:webhook",
  runtimeType: "core",
  kind: "webhook",
  nameKey: "core_kind_webhook",
  descriptionKey: "core_kind_webhook_desc",
  category: "trigger",
  icon: "Webhook",
  isBuiltin: true,
  isActive: true,
  sections: webhookSections(),
  handles: CORE_WEBHOOK_HANDLES,
  defaultData: {
    coreKind: "webhook",
    httpMethod: "GET",
    webhookAuth: "none",
    webhookRespond: "immediately",
  },
};
