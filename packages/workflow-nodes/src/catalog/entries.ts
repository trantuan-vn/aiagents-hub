import type { WorkflowCatalogEntrySeed } from "./types";
import { AGENT_KINDS } from "../nodes/agent/kinds";
import { CORE_KINDS } from "../nodes/core/kinds";
import { TRANSFORM_KINDS } from "../nodes/data-transformation/kinds";
import { FLOW_KINDS } from "../nodes/flow/kinds";
import { HUMAN_REVIEW_CHANNELS } from "../nodes/human-review/channels";
import { MEMORY_KINDS, MEMORY_OVERRIDE_KINDS } from "../nodes/memory/kinds";
import { TOOL_KINDS, TOOL_OVERRIDE_KINDS } from "../nodes/tool/kinds";
import { TRIGGER_KINDS } from "../nodes/trigger/kinds";

/** Sub-kinds with dedicated backend handlers (auth-worker node plugins). */
const BACKEND_TRIGGER_KINDS = new Set(["manual", "webhook", "form"]);
const BACKEND_FLOW_KINDS = new Set(["if", "merge", "filter", "loop_over_items"]);
const BACKEND_CORE_KINDS = new Set(["http_request", "code"]);
const BACKEND_TRANSFORM_KINDS = new Set<string>([]);
const BACKEND_TOOL_KINDS = new Set(["save-rag", "get-rag", "get-db-info"]);
const BACKEND_MEMORY_KINDS = new Set(["vectorize"]);
const BACKEND_AGENT_KINDS = new Set(["tools_agent"]);

/** Sub-kinds with dedicated frontend config / canvas plugins. */
const FRONTEND_TRIGGER_KINDS = new Set(["manual", "webhook", "form"]);
const FRONTEND_FLOW_KINDS = new Set(["if", "merge", "filter", "switch", "loop_over_items"]);
const FRONTEND_CORE_KINDS = new Set(["http_request", "code"]);
const FRONTEND_TRANSFORM_KINDS = new Set<string>([]);
const FRONTEND_TOOL_KINDS = new Set(TOOL_KINDS);
const FRONTEND_MEMORY_KINDS = new Set(MEMORY_KINDS);
const FRONTEND_AGENT_KINDS = new Set(AGENT_KINDS);

function entry(partial: WorkflowCatalogEntrySeed): WorkflowCatalogEntrySeed {
  return partial;
}

function triggerEntries(): WorkflowCatalogEntrySeed[] {
  return TRIGGER_KINDS.map((kind, index) =>
    entry({
      id: `trigger:${kind}`,
      addCategory: "trigger",
      runtimeType: "trigger",
      kind,
      nameKey: `trigger_kind_${kind}`,
      descKey: `trigger_kind_${kind}_desc`,
      hasBackend: BACKEND_TRIGGER_KINDS.has(kind),
      hasFrontend: FRONTEND_TRIGGER_KINDS.has(kind),
      sortOrder: index,
    }),
  );
}

function flowEntries(): WorkflowCatalogEntrySeed[] {
  return FLOW_KINDS.map((kind, index) =>
    entry({
      id: `flow:${kind}`,
      addCategory: "flow",
      runtimeType: "flow",
      kind,
      nameKey: `flow_kind_${kind}`,
      descKey: `flow_kind_${kind}_desc`,
      hasBackend: BACKEND_FLOW_KINDS.has(kind),
      hasFrontend: FRONTEND_FLOW_KINDS.has(kind),
      sortOrder: index,
    }),
  );
}

function coreEntries(): WorkflowCatalogEntrySeed[] {
  return CORE_KINDS.map((kind, index) =>
    entry({
      id: `core:${kind}`,
      addCategory: "core",
      runtimeType: "core",
      kind,
      nameKey: `core_kind_${kind}`,
      descKey: `core_kind_${kind}_desc`,
      hasBackend: BACKEND_CORE_KINDS.has(kind),
      hasFrontend: FRONTEND_CORE_KINDS.has(kind),
      sortOrder: index,
    }),
  );
}

function transformEntries(): WorkflowCatalogEntrySeed[] {
  return TRANSFORM_KINDS.map((kind, index) =>
    entry({
      id: `transform:${kind}`,
      addCategory: "data_transformation",
      runtimeType: "data_transformation",
      kind,
      nameKey: `transform_kind_${kind}`,
      descKey: `transform_kind_${kind}_desc`,
      hasBackend: BACKEND_TRANSFORM_KINDS.has(kind),
      hasFrontend: FRONTEND_TRANSFORM_KINDS.has(kind),
      sortOrder: index,
    }),
  );
}

function humanReviewEntries(): WorkflowCatalogEntrySeed[] {
  return HUMAN_REVIEW_CHANNELS.map((channel, index) =>
    entry({
      id: `human_review:${channel}`,
      addCategory: "human_review",
      runtimeType: "human_review",
      kind: channel,
      nameKey: `human_review_channel_${channel}`,
      descKey: `human_review_channel_${channel}_desc`,
      hasBackend: true,
      hasFrontend: true,
      sortOrder: index,
    }),
  );
}

function agentEntries(): WorkflowCatalogEntrySeed[] {
  return AGENT_KINDS.map((kind, index) =>
    entry({
      id: `agent:${kind}`,
      addCategory: "ai",
      runtimeType: "agent",
      kind,
      nameKey: kind === "tools_agent" ? "node_agent" : `agent_kind_${kind}`,
      descKey: kind === "tools_agent" ? "node_agent_desc" : `agent_kind_${kind}_desc`,
      hasBackend: BACKEND_AGENT_KINDS.has(kind),
      hasFrontend: FRONTEND_AGENT_KINDS.has(kind),
      sortOrder: index,
    }),
  );
}

function toolEntries(): WorkflowCatalogEntrySeed[] {
  return TOOL_KINDS.map((kind, index) =>
    entry({
      id: `tool_node:${kind}`,
      addCategory: "ai",
      runtimeType: "tool_node",
      kind,
      nameKey:
        kind === "save-rag"
          ? "tool_kind_save_rag"
          : kind === "get-rag"
            ? "tool_kind_get_rag"
            : kind === "get-db-info"
              ? "tool_kind_get_db_info"
              : `tool_kind_${kind}`,
      descKey:
        kind === "save-rag"
          ? "tool_kind_save_rag_desc"
          : kind === "get-rag"
            ? "tool_kind_get_rag_desc"
            : kind === "get-db-info"
              ? "tool_kind_get_db_info_desc"
              : `tool_kind_${kind}_desc`,
      hasBackend: BACKEND_TOOL_KINDS.has(kind) || !TOOL_OVERRIDE_KINDS.has(kind),
      hasFrontend: FRONTEND_TOOL_KINDS.has(kind),
      sortOrder: 100 + index,
    }),
  );
}

function memoryEntries(): WorkflowCatalogEntrySeed[] {
  return MEMORY_KINDS.map((kind, index) =>
    entry({
      id: `memory_node:${kind}`,
      addCategory: "ai",
      runtimeType: "memory_node",
      kind,
      nameKey: `memory_kind_${kind}`,
      descKey: `memory_kind_${kind}_desc`,
      hasBackend: BACKEND_MEMORY_KINDS.has(kind) || !MEMORY_OVERRIDE_KINDS.has(kind),
      hasFrontend: FRONTEND_MEMORY_KINDS.has(kind),
      sortOrder: 200 + index,
    }),
  );
}

/** Built-in catalog seeds — source of truth for D1 `workflow_node_catalog`. */
export const WORKFLOW_NODE_CATALOG_SEEDS: WorkflowCatalogEntrySeed[] = [
  entry({
    id: "agent",
    addCategory: "ai",
    runtimeType: "agent",
    nameKey: "node_agent",
    descKey: "node_agent_desc",
    hasBackend: true,
    hasFrontend: true,
    sortOrder: 0,
  }),
  ...agentEntries(),
  entry({
    id: "action_in_app",
    addCategory: "action_in_app",
    runtimeType: "action_in_app",
    nameKey: "node_action",
    descKey: "node_action_desc",
    hasBackend: true,
    hasFrontend: true,
    sortOrder: 0,
  }),
  ...transformEntries(),
  ...flowEntries(),
  ...coreEntries(),
  ...humanReviewEntries(),
  ...triggerEntries(),
  // service_node kept for resource attach; not shown under AI add-node UI
  entry({
    id: "service_node",
    addCategory: "ai",
    runtimeType: "service_node",
    nameKey: "node_service",
    descKey: "node_service_desc",
    hasBackend: true,
    hasFrontend: true,
    sortOrder: 50,
  }),
  ...memoryEntries(),
  ...toolEntries(),
];

export function defaultIsActive(seed: WorkflowCatalogEntrySeed): boolean {
  return seed.hasBackend && seed.hasFrontend;
}

export function resolveCatalogEntryId(runtimeType: string, kind?: string): string {
  if (runtimeType === "agent" && !kind) return "agent";
  if (runtimeType === "agent" && kind) return `agent:${kind}`;
  if (runtimeType === "action_in_app" && !kind) return "action_in_app";
  if (runtimeType === "tool_node" && kind) return `tool_node:${kind}`;
  if (runtimeType === "memory_node" && kind) return `memory_node:${kind}`;
  if (kind) {
    if (runtimeType === "trigger") return `trigger:${kind}`;
    if (runtimeType === "flow") return `flow:${kind}`;
    if (runtimeType === "core") return `core:${kind}`;
    if (runtimeType === "data_transformation") return `transform:${kind}`;
    if (runtimeType === "human_review") return `human_review:${kind}`;
  }
  return runtimeType;
}

export function getCatalogSeedById(id: string): WorkflowCatalogEntrySeed | undefined {
  return WORKFLOW_NODE_CATALOG_SEEDS.find((seed) => seed.id === id);
}
