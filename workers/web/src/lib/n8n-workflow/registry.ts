import type { N8nNodeTypeDescription } from "./types";

import { ACTION_IN_APP_N8N_DESCRIPTION } from "./descriptions/action";
import { AGENT_N8N_DESCRIPTION } from "./descriptions/agent";
import { CODE_N8N_DESCRIPTION } from "./descriptions/code";
import { CORE_N8N_DESCRIPTION } from "./descriptions/core";
import { DATA_TRANSFORMATION_N8N_DESCRIPTION } from "./descriptions/transform";
import { FLOW_N8N_DESCRIPTION } from "./descriptions/flow";
import { HUMAN_REVIEW_N8N_DESCRIPTION } from "./descriptions/human-review";
import { HTTP_REQUEST_N8N_DESCRIPTION } from "./descriptions/http-request";
import { MEMORY_NODE_N8N_DESCRIPTION } from "./descriptions/memory-node";
import { SERVICE_NODE_N8N_DESCRIPTION } from "./descriptions/service-node";
import { TOOL_NODE_N8N_DESCRIPTION } from "./descriptions/tool-node";
import { TRIGGER_N8N_DESCRIPTION } from "./descriptions/trigger";
import { CORE_WEBHOOK_N8N_DESCRIPTION, TRIGGER_WEBHOOK_N8N_DESCRIPTION } from "./descriptions/webhook";

/** runtimeType → description */
const BY_RUNTIME: Record<string, N8nNodeTypeDescription> = {
  agent: AGENT_N8N_DESCRIPTION,
  trigger: TRIGGER_N8N_DESCRIPTION,
  flow: FLOW_N8N_DESCRIPTION,
  core: CORE_N8N_DESCRIPTION,
  http_request: HTTP_REQUEST_N8N_DESCRIPTION,
  code: CODE_N8N_DESCRIPTION,
  action_in_app: ACTION_IN_APP_N8N_DESCRIPTION,
  data_transformation: DATA_TRANSFORMATION_N8N_DESCRIPTION,
  human_review: HUMAN_REVIEW_N8N_DESCRIPTION,
  service_node: SERVICE_NODE_N8N_DESCRIPTION,
  memory_node: MEMORY_NODE_N8N_DESCRIPTION,
  tool_node: TOOL_NODE_N8N_DESCRIPTION,
};

/** `${runtimeType}:${kind}` for sub-kinds */
const BY_KIND: Record<string, N8nNodeTypeDescription> = {
  "trigger:webhook": TRIGGER_WEBHOOK_N8N_DESCRIPTION,
  "core:webhook": CORE_WEBHOOK_N8N_DESCRIPTION,
  "core:http_request": HTTP_REQUEST_N8N_DESCRIPTION,
  "core:code": CODE_N8N_DESCRIPTION,
};

export function getN8nNodeDescription(
  runtimeType: string,
  kind?: string,
): N8nNodeTypeDescription | undefined {
  if (kind) {
    const composite = `${runtimeType}:${kind}`;
    if (BY_KIND[composite]) return BY_KIND[composite];
  }
  return BY_RUNTIME[runtimeType];
}

export function hasN8nNodeDescription(runtimeType: string, kind?: string): boolean {
  return getN8nNodeDescription(runtimeType, kind) != null;
}

export function listN8nRuntimeTypes(): string[] {
  return Object.keys(BY_RUNTIME);
}
