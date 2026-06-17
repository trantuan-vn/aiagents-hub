import type { WorkflowCatalogEntrySeed } from "./types";

const TRIGGER_KINDS = [
  "manual",
  "app_event",
  "schedule",
  "webhook",
  "form",
  "sub_workflow",
  "chat",
  "evaluation",
  "other",
] as const;

const FLOW_KINDS = [
  "filter",
  "if",
  "loop_over_items",
  "merge",
  "compare_datasets",
  "execute_sub_workflow",
  "stop_and_error",
  "switch",
  "wait",
] as const;

const CORE_KINDS = [
  "code",
  "data_table",
  "http_request",
  "webhook",
  "execute_sub_workflow",
  "execution_data",
  "ftp",
  "hub",
  "hub_form",
  "no_op",
  "respond_to_webhook",
  "track_time_saved",
  "wait",
] as const;

const TRANSFORM_KINDS = [
  "ai_transform",
  "code",
  "date_time",
  "edit_fields",
  "filter",
  "limit",
  "remove_duplicates",
  "split_out",
  "rename_keys",
  "sort",
  "aggregate",
  "merge",
  "summarize",
  "compression",
  "convert_to_file",
  "crypto",
  "edit_image",
  "extract_from_file",
  "html",
  "markdown",
  "spreadsheet_file",
  "xml",
] as const;

const HUMAN_REVIEW_CHANNELS = [
  "chat",
  "discord",
  "gmail",
  "google_chat",
  "microsoft_outlook",
  "microsoft_teams",
  "send_email",
  "slack",
  "telegram",
  "whatsapp_business",
] as const;

/** Sub-kinds with dedicated backend handlers (auth-worker node plugins). */
const BACKEND_TRIGGER_KINDS = new Set(["manual", "webhook", "form"]);
const BACKEND_FLOW_KINDS = new Set(["if", "merge", "filter"]);
const BACKEND_CORE_KINDS = new Set(["http_request", "code"]);
const BACKEND_TRANSFORM_KINDS = new Set<string>([]);

/** Sub-kinds with dedicated frontend config / canvas plugins. */
const FRONTEND_TRIGGER_KINDS = new Set(["manual", "webhook", "form"]);
const FRONTEND_FLOW_KINDS = new Set(["if", "merge", "filter", "switch"]);
const FRONTEND_CORE_KINDS = new Set(["http_request", "code"]);
const FRONTEND_TRANSFORM_KINDS = new Set<string>([]);

function entry(
  partial: WorkflowCatalogEntrySeed,
): WorkflowCatalogEntrySeed {
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
  entry({
    id: "service_node",
    addCategory: "ai",
    runtimeType: "service_node",
    nameKey: "node_service",
    descKey: "node_service_desc",
    hasBackend: true,
    hasFrontend: true,
    sortOrder: 100,
  }),
  entry({
    id: "memory_node",
    addCategory: "ai",
    runtimeType: "memory_node",
    nameKey: "node_memory",
    descKey: "node_memory_desc",
    hasBackend: true,
    hasFrontend: true,
    sortOrder: 101,
  }),
  entry({
    id: "tool_node:save-rag",
    addCategory: "ai",
    runtimeType: "tool_node",
    kind: "save-rag",
    nameKey: "tool_kind_save_rag",
    descKey: "tool_kind_save_rag_desc",
    hasBackend: true,
    hasFrontend: true,
    sortOrder: 102,
  }),
  entry({
    id: "tool_node:get-rag",
    addCategory: "ai",
    runtimeType: "tool_node",
    kind: "get-rag",
    nameKey: "tool_kind_get_rag",
    descKey: "tool_kind_get_rag_desc",
    hasBackend: true,
    hasFrontend: true,
    sortOrder: 103,
  }),
  entry({
    id: "tool_node:get-db-info",
    addCategory: "ai",
    runtimeType: "tool_node",
    kind: "get-db-info",
    nameKey: "tool_kind_get_db_info",
    descKey: "tool_kind_get_db_info_desc",
    hasBackend: true,
    hasFrontend: true,
    sortOrder: 104,
  }),
];

export function defaultIsActive(seed: WorkflowCatalogEntrySeed): boolean {
  return seed.hasBackend && seed.hasFrontend;
}

export function resolveCatalogEntryId(runtimeType: string, kind?: string): string {
  if (runtimeType === "agent") return "agent";
  if (runtimeType === "action_in_app" && !kind) return "action_in_app";
  if (runtimeType === "tool_node" && kind) return `tool_node:${kind}`;
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
