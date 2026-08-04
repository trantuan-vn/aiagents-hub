import type { WorkflowNodeDefinition, WorkflowNodeRegistry } from "../types/node-definition";
import { ACTION_IN_APP_DEFINITION } from "./action-in-app/definition";
import { AGENT_NODE_DEFINITION } from "./agent/definition";
import {
  CORE_CODE_DEFINITION,
  CORE_HTTP_REQUEST_DEFINITION,
  CORE_NODE_DEFINITION,
} from "./core/definition";
import { DATA_TRANSFORMATION_DEFINITION } from "./data-transformation/definition";
import { FLOW_LOOP_OVER_ITEMS_DEFINITION, FLOW_NODE_DEFINITION } from "./flow/definition";
import { HUMAN_REVIEW_DEFINITION } from "./human-review/definition";
import { SERVICE_NODE_DEFINITION } from "./service/definition";
import { FORM_DATABASE_TRIGGER_DEFINITION } from "./trigger/form-database";
import { TRIGGER_NODE_DEFINITION } from "./trigger/definition";
import { TOOL_NODE_DEFINITION, SAVE_RAG_TOOL_DEFINITION } from "./tool/definition";
import { MEMORY_NODE_DEFINITION } from "./vectorize/definition";
import { CORE_WEBHOOK_DEFINITION, TRIGGER_WEBHOOK_DEFINITION } from "./webhook/definition";

const now = () => new Date().toISOString();

/** Built-in registry — composed from per-node definition modules. */
export const DEFAULT_WORKFLOW_NODE_REGISTRY: WorkflowNodeRegistry = {
  nodes: [
    AGENT_NODE_DEFINITION,
    TRIGGER_NODE_DEFINITION,
    FLOW_NODE_DEFINITION,
    CORE_NODE_DEFINITION,
    CORE_HTTP_REQUEST_DEFINITION,
    CORE_WEBHOOK_DEFINITION,
    TRIGGER_WEBHOOK_DEFINITION,
    CORE_CODE_DEFINITION,
    FLOW_LOOP_OVER_ITEMS_DEFINITION,
    ACTION_IN_APP_DEFINITION,
    DATA_TRANSFORMATION_DEFINITION,
    HUMAN_REVIEW_DEFINITION,
    SERVICE_NODE_DEFINITION,
    MEMORY_NODE_DEFINITION,
    TOOL_NODE_DEFINITION,
    SAVE_RAG_TOOL_DEFINITION,
    FORM_DATABASE_TRIGGER_DEFINITION,
  ],
  updatedAt: now(),
};

export function getDefaultNodeById(id: string): WorkflowNodeDefinition | undefined {
  return DEFAULT_WORKFLOW_NODE_REGISTRY.nodes.find((n) => n.id === id);
}
