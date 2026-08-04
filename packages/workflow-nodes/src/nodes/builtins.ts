import type { WorkflowNodeDefinition, WorkflowNodeRegistry } from "../types/node-definition";
import { ACTION_IN_APP_DEFINITION } from "./action-in-app/definition";
import { AGENT_KIND_DEFINITIONS, AGENT_NODE_DEFINITION } from "./agent/definition";
import {
  CORE_CODE_DEFINITION,
  CORE_HTTP_REQUEST_DEFINITION,
  CORE_KIND_DEFINITIONS,
  CORE_NODE_DEFINITION,
} from "./core/definition";
import {
  DATA_TRANSFORMATION_DEFINITION,
  TRANSFORM_KIND_DEFINITIONS,
} from "./data-transformation/definition";
import {
  FLOW_KIND_DEFINITIONS,
  FLOW_LOOP_OVER_ITEMS_DEFINITION,
  FLOW_NODE_DEFINITION,
} from "./flow/definition";
import {
  HUMAN_REVIEW_CHANNEL_DEFINITIONS,
  HUMAN_REVIEW_DEFINITION,
} from "./human-review/definition";
import {
  MEMORY_KIND_DEFINITIONS,
  MEMORY_NODE_DEFINITION,
  VECTORIZE_MEMORY_DEFINITION,
} from "./memory/definition";
import { SERVICE_NODE_DEFINITION } from "./service/definition";
import { FORM_DATABASE_TRIGGER_DEFINITION } from "./trigger/form-database";
import { TRIGGER_KIND_DEFINITIONS, TRIGGER_NODE_DEFINITION } from "./trigger/definition";
import {
  GET_DB_INFO_TOOL_DEFINITION,
  GET_RAG_TOOL_DEFINITION,
  SAVE_RAG_TOOL_DEFINITION,
  TOOL_KIND_DEFINITIONS,
  TOOL_NODE_DEFINITION,
} from "./tool/definition";
import { CORE_WEBHOOK_DEFINITION, TRIGGER_WEBHOOK_DEFINITION } from "./webhook/definition";

const now = () => new Date().toISOString();

/** Built-in registry — composed from per-node definition modules + kind factories. */
export const DEFAULT_WORKFLOW_NODE_REGISTRY: WorkflowNodeRegistry = {
  nodes: [
    AGENT_NODE_DEFINITION,
    ...AGENT_KIND_DEFINITIONS,
    TRIGGER_NODE_DEFINITION,
    ...TRIGGER_KIND_DEFINITIONS,
    FLOW_NODE_DEFINITION,
    ...FLOW_KIND_DEFINITIONS,
    FLOW_LOOP_OVER_ITEMS_DEFINITION,
    CORE_NODE_DEFINITION,
    ...CORE_KIND_DEFINITIONS,
    CORE_HTTP_REQUEST_DEFINITION,
    CORE_WEBHOOK_DEFINITION,
    TRIGGER_WEBHOOK_DEFINITION,
    CORE_CODE_DEFINITION,
    ACTION_IN_APP_DEFINITION,
    DATA_TRANSFORMATION_DEFINITION,
    ...TRANSFORM_KIND_DEFINITIONS,
    HUMAN_REVIEW_DEFINITION,
    ...HUMAN_REVIEW_CHANNEL_DEFINITIONS,
    SERVICE_NODE_DEFINITION,
    MEMORY_NODE_DEFINITION,
    ...MEMORY_KIND_DEFINITIONS,
    VECTORIZE_MEMORY_DEFINITION,
    TOOL_NODE_DEFINITION,
    ...TOOL_KIND_DEFINITIONS,
    SAVE_RAG_TOOL_DEFINITION,
    GET_RAG_TOOL_DEFINITION,
    GET_DB_INFO_TOOL_DEFINITION,
    FORM_DATABASE_TRIGGER_DEFINITION,
  ],
  updatedAt: now(),
};

export function getDefaultNodeById(id: string): WorkflowNodeDefinition | undefined {
  return DEFAULT_WORKFLOW_NODE_REGISTRY.nodes.find((n) => n.id === id);
}
